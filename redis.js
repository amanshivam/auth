const redis = require('redis');
const logger = require('./logger');

// True singleton - only one instance per process
let singletonInstance = null;
let isInitializing = false;
let initializationPromise = null;

// Global Redis clients - only one publisher and one subscriber per process
let globalPublisher = null;
let globalSubscriber = null;
let globalIsConnected = false;

class RedisManager {
  constructor() {
    if (singletonInstance) {
      throw new Error('RedisManager is a singleton. Use getRedisManager() to get the instance.');
    }
    
    this.subscriptionHandlers = new Map();
  }

  async initialize() {
    // Prevent multiple simultaneous initializations
    if (isInitializing) {
      logger.info('🔄 Redis initialization already in progress, waiting...');
      return initializationPromise;
    }

    if (globalIsConnected) {
      logger.info('✅ Redis already initialized');
      return true;
    }

    isInitializing = true;
    initializationPromise = this._initialize();
    
    try {
      const result = await initializationPromise;
      return result;
    } finally {
      isInitializing = false;
    }
  }

  async _initialize() {
    try {
      logger.info('🔌 Initializing Redis connections...');
      
      // Only create publisher if it doesn't exist
      if (!globalPublisher) {
        logger.info('📡 Creating Redis publisher...');
        globalPublisher = redis.createClient({
          url: 'redis://localhost:6379',
          socket: {
            reconnectStrategy: false, // Disable auto-reconnect to prevent memory leaks
            connectTimeout: 5000,
            lazyConnect: true
          },
          // Minimal configuration to reduce memory usage
          database: 0,
          maxRetriesPerRequest: 1
        });

        // Set up publisher error handlers
        globalPublisher.on('error', (err) => {
          logger.error('❌ Redis publisher error:', err.message);
          globalIsConnected = false;
        });

        globalPublisher.on('connect', () => {
          logger.info('✅ Redis publisher connected');
        });

        globalPublisher.on('ready', () => {
          logger.info('✅ Redis publisher ready');
          globalIsConnected = true;
        });
      }

      // Only create subscriber if it doesn't exist
      if (!globalSubscriber) {
        logger.info('📡 Creating Redis subscriber...');
        globalSubscriber = redis.createClient({
          url: 'redis://localhost:6379',
          socket: {
            reconnectStrategy: false, // Disable auto-reconnect to prevent memory leaks
            connectTimeout: 5000,
            lazyConnect: true
          },
          // Minimal configuration to reduce memory usage
          database: 0,
          maxRetriesPerRequest: 1
        });

        // Set up subscriber error handlers
        globalSubscriber.on('error', (err) => {
          logger.error('❌ Redis subscriber error:', err.message);
          globalIsConnected = false;
        });

        globalSubscriber.on('connect', () => {
          logger.info('✅ Redis subscriber connected');
        });

        globalSubscriber.on('ready', () => {
          logger.info('✅ Redis subscriber ready');
          globalIsConnected = true;
        });
      }

      // Connect both clients if not already connected
      if (!globalPublisher.isOpen) {
        await globalPublisher.connect();
      }
      
      if (!globalSubscriber.isOpen) {
        await globalSubscriber.connect();
      }

      logger.info('✅ Redis manager initialized successfully');
      return true;
    } catch (error) {
      logger.error('❌ Failed to initialize Redis:', error.message);
      globalIsConnected = false;
      
      // Clean up failed connections
      await this._cleanup();
      return false;
    }
  }

  async subscribe(channel, handler) {
    if (!globalSubscriber || !globalIsConnected) {
      logger.warn('❌ Redis subscriber not available for subscription');
      return false;
    }

    try {
      // Store handler for cleanup
      this.subscriptionHandlers.set(channel, handler);
      
      await globalSubscriber.subscribe(channel, (message) => {
        try {
          const data = JSON.parse(message);
          handler(data);
        } catch (error) {
          logger.error(`❌ Error handling Redis message on ${channel}:`, error.message);
        }
      });
      
      logger.info(`📡 Subscribed to Redis channel: ${channel}`);
      return true;
    } catch (error) {
      logger.error(`❌ Failed to subscribe to ${channel}:`, error.message);
      return false;
    }
  }

  async publish(channel, message) {
    if (!globalPublisher || !globalIsConnected) {
      logger.warn('❌ Redis publisher not available for publishing');
      return false;
    }

    try {
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      await globalPublisher.publish(channel, messageStr);
      logger.debug(`📡 Published to Redis channel: ${channel}`);
      return true;
    } catch (error) {
      logger.error(`❌ Failed to publish to ${channel}:`, error.message);
      return false;
    }
  }

  async unsubscribe(channel) {
    if (!globalSubscriber || !globalIsConnected) {
      return false;
    }

    try {
      await globalSubscriber.unsubscribe(channel);
      this.subscriptionHandlers.delete(channel);
      logger.info(`📡 Unsubscribed from Redis channel: ${channel}`);
      return true;
    } catch (error) {
      logger.error(`❌ Failed to unsubscribe from ${channel}:`, error.message);
      return false;
    }
  }

  async _cleanup() {
    try {
      if (globalSubscriber && globalSubscriber.isOpen) {
        await globalSubscriber.disconnect();
        globalSubscriber = null;
      }
      
      if (globalPublisher && globalPublisher.isOpen) {
        await globalPublisher.disconnect();
        globalPublisher = null;
      }
      
      globalIsConnected = false;
      this.subscriptionHandlers.clear();
    } catch (error) {
      logger.error('❌ Error during Redis cleanup:', error.message);
    }
  }

  async disconnect() {
    logger.info('🔌 Disconnecting Redis clients...');
    await this._cleanup();
    logger.info('✅ Redis manager disconnected');
  }

  isReady() {
    return globalIsConnected && globalPublisher && globalSubscriber;
  }

  getStatus() {
    return {
      isConnected: globalIsConnected,
      hasPublisher: !!globalPublisher,
      hasSubscriber: !!globalSubscriber,
      publisherOpen: globalPublisher ? globalPublisher.isOpen : false,
      subscriberOpen: globalSubscriber ? globalSubscriber.isOpen : false,
      subscriptionCount: this.subscriptionHandlers.size,
      isInitializing: isInitializing
    };
  }
}

// Global singleton getter
const getRedisManager = () => {
  if (!singletonInstance) {
    singletonInstance = new RedisManager();
    logger.info('🆕 Created new Redis manager singleton instance');
  }
  return singletonInstance;
};

// Graceful shutdown handling
const cleanup = async () => {
  if (singletonInstance) {
    await singletonInstance.disconnect();
    singletonInstance = null;
    logger.info('🧹 Redis singleton instance cleaned up');
  }
};

process.on('SIGINT', async () => {
  logger.info('🛑 Received SIGINT, shutting down Redis...');
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('🛑 Received SIGTERM, shutting down Redis...');
  await cleanup();
  process.exit(0);
});

// Prevent multiple instances
Object.freeze(RedisManager);

module.exports = {
  getRedisManager,
  RedisManager
}; 