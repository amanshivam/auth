const { newEnforcer } = require('casbin');
const { getSharedConnectionPool } = require('./shared-connection-pool');
const path = require('path');
const logger = require('./logger');
const { getRedisManager } = require('./redis');

// Get Redis manager instance
const redisManager = getRedisManager();

// Handle tenant refresh from Redis message
const handleTenantRefresh = async (data) => {
  const { tenant, operation, serverId, timestamp } = data;
  
  // Skip if this is our own message
  if (serverId === process.env.SERVER_ID || serverId === `server-${process.env.PORT || 3000}`) {
    logger.debug(`Ignoring own refresh message for tenant: ${tenant}`);
    return;
  }
  
  logger.info(`🔄 Received Redis refresh for tenant: ${tenant}, operation: ${operation} from ${serverId}`);
  
  try {
    await refreshTenantPolicies(tenant);
    logger.info(`✅ Refreshed tenant from Redis: ${tenant}`);
  } catch (error) {
    logger.error(`❌ Failed to refresh tenant from Redis ${tenant}:`, error.message);
  }
};

// Initialize Redis and subscribe to tenant refresh channel
const initializeRedisSync = async () => {
  try {
    const success = await redisManager.initialize();
    if (success) {
      await redisManager.subscribe('tenant-refresh', handleTenantRefresh);
      logger.info('✅ Redis sync initialized successfully');
    } else {
      logger.warn('⚠️ Redis sync not available - continuing without cross-server sync');
    }
  } catch (error) {
    logger.error('❌ Failed to initialize Redis sync:', error.message);
  }
};

// Publish tenant refresh to Redis
const publishTenantRefresh = async (tenant, operation) => {
  if (!redisManager.isReady()) {
    logger.warn('Redis not available, skipping cross-server sync');
    return;
  }
  
  try {
    const message = {
      tenant,
      operation,
      serverId: process.env.SERVER_ID || `server-${process.env.PORT || 3000}`,
      timestamp: new Date().toISOString()
    };
    
    await redisManager.publish('tenant-refresh', message);
    logger.info(`📡 Published refresh to Redis for tenant: ${tenant}`);
  } catch (error) {
    logger.error('Error publishing to Redis:', error.message);
  }
};

// Initialize Redis sync on module load
initializeRedisSync();

// LRU Cache for tenant enforcers (keep as is)
class TenantEnforcerCache {
  constructor(maxSize = 50) { // Reduced from 100 to 50 for memory safety
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = [];
    this.memoryUsage = new Map(); // Track memory usage per tenant
    this.lastCleanup = Date.now();
    this.cleanupInterval = 30000; // Cleanup every 30 seconds instead of 60
  }

  // Get memory usage of current process
  getCurrentMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024) // MB
    };
  }

  // Estimate memory usage of an enforcer (rough calculation)
  estimateEnforcerMemory(enforcer) {
    try {
      // Count policies and grouping policies
      const policies = enforcer.getPolicy();
      const groupingPolicies = enforcer.getGroupingPolicy();
      
      // Rough estimate: each policy ~100 bytes, each grouping policy ~80 bytes
      const policyMemory = policies.length * 100;
      const groupingMemory = groupingPolicies.length * 80;
      const baseMemory = 1024; // Base enforcer object memory
      
      return policyMemory + groupingMemory + baseMemory;
    } catch (error) {
      return 2048; // Default estimate if we can't calculate
    }
  }

  // Cleanup old enforcers based on memory pressure
  cleanup() {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupInterval) {
      return;
    }

    const memoryUsage = this.getCurrentMemoryUsage();
    const totalCacheMemory = Array.from(this.memoryUsage.values()).reduce((sum, mem) => sum + mem, 0);
    
    logger.info(`🧹 Cache cleanup - Memory: ${memoryUsage.heapUsed}MB/${memoryUsage.heapTotal}MB, Cache: ${totalCacheMemory} bytes`);

    // If heap usage is high (>70% of total), evict more aggressively
    const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    const shouldAggressiveEvict = heapUsagePercent > 70;

    if (shouldAggressiveEvict) {
      logger.warn(`⚠️ High memory usage (${heapUsagePercent.toFixed(1)}%), aggressive eviction`);
      // Evict 70% of cache instead of 50%
      const evictCount = Math.floor(this.cache.size * 0.7);
      for (let i = 0; i < evictCount; i++) {
        const lruTenant = this.accessOrder.shift();
        if (lruTenant) {
          this.evictTenant(lruTenant);
        }
      }
    } else if (this.cache.size > this.maxSize) {
      // Normal eviction when cache is full
      const evictCount = this.cache.size - this.maxSize;
      for (let i = 0; i < evictCount; i++) {
        const lruTenant = this.accessOrder.shift();
        if (lruTenant) {
          this.evictTenant(lruTenant);
        }
      }
    }

    this.lastCleanup = now;
  }

  // Properly evict a tenant from cache
  evictTenant(tenant) {
    const enforcer = this.cache.get(tenant);
    if (enforcer) {
      try {
        // Clear enforcer's internal data structures
        enforcer.clearPolicy();
        enforcer.clearGroupingPolicy();
        
        // Force garbage collection hint
        if (global.gc) {
          global.gc();
        }
        
        logger.info(`🗑️ Evicted tenant from cache: ${tenant} (memory: ${this.memoryUsage.get(tenant) || 0} bytes)`);
      } catch (error) {
        logger.error(`Error evicting tenant ${tenant}:`, error.message);
      }
    }
    
    this.cache.delete(tenant);
    this.memoryUsage.delete(tenant);
    this.accessOrder = this.accessOrder.filter(t => t !== tenant);
  }

  get(tenant) {
    this.cleanup(); // Check for cleanup on each access
    
    if (this.cache.has(tenant)) {
      this.accessOrder = this.accessOrder.filter(t => t !== tenant);
      this.accessOrder.push(tenant);
      logger.debug(`Loaded enforcer for tenant from cache: ${tenant}`);
      return this.cache.get(tenant);
    }
    return null;
  }

  set(tenant, enforcer) {
    this.cleanup(); // Check for cleanup before adding
    
    if (this.cache.has(tenant)) {
      // Update existing
      this.cache.set(tenant, enforcer);
      this.accessOrder = this.accessOrder.filter(t => t !== tenant);
      this.accessOrder.push(tenant);
    } else {
      // Check if we need to evict before adding
      if (this.cache.size >= this.maxSize) {
        const lruTenant = this.accessOrder.shift();
        if (lruTenant) {
          this.evictTenant(lruTenant);
        }
      }
      
      // Add new enforcer
      this.cache.set(tenant, enforcer);
      this.accessOrder.push(tenant);
      
      // Track memory usage
      const estimatedMemory = this.estimateEnforcerMemory(enforcer);
      this.memoryUsage.set(tenant, estimatedMemory);
      
      const memoryUsage = this.getCurrentMemoryUsage();
      logger.info(`📦 Added tenant to cache: ${tenant} (memory: ${estimatedMemory} bytes, heap: ${memoryUsage.heapUsed}MB)`);
    }
  }

  delete(tenant) {
    this.evictTenant(tenant);
  }

  size() {
    return this.cache.size;
  }

  keys() {
    return Array.from(this.cache.keys());
  }

  // Get detailed cache statistics
  getStats() {
    const memoryUsage = this.getCurrentMemoryUsage();
    const totalCacheMemory = Array.from(this.memoryUsage.values()).reduce((sum, mem) => sum + mem, 0);
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      tenants: this.keys(),
      memoryUsage: {
        process: memoryUsage,
        cache: {
          total: totalCacheMemory,
          average: this.cache.size > 0 ? Math.round(totalCacheMemory / this.cache.size) : 0
        }
      },
      lastCleanup: this.lastCleanup
    };
  }
}

const tenantCache = new TenantEnforcerCache(50);

// Create enforcer for a specific tenant using shared connection pool
const createTenantEnforcer = async (tenant) => {
  try {
    logger.info(`🔧 Creating tenant-aware enforcer for tenant: ${tenant}`);
    
    // Get shared connection pool and tenant adapter
    const sharedPool = getSharedConnectionPool();
    const adapter = await sharedPool.getTenantAdapter(tenant);
    
    logger.info(`✅ Tenant-aware adapter created for tenant: ${tenant}`);
    const enforcer = await newEnforcer(path.join(__dirname) + '/model.conf', adapter);
    logger.info(`✅ Enforcer created for tenant: ${tenant}`);
    return enforcer;
  } catch (error) {
    logger.error(`❌ Failed to create enforcer for tenant ${tenant}:`, error.message);
    throw error;
  }
};

// Get or create enforcer for a tenant
const getTenantEnforcer = async (tenant) => {
  let enforcer = tenantCache.get(tenant);
  if (!enforcer) {
    logger.info(`Creating new tenant-aware enforcer for tenant: ${tenant}`);
    enforcer = await createTenantEnforcer(tenant);
    tenantCache.set(tenant, enforcer);
  }
  return enforcer;
};

// Check access for a user in a specific tenant
const checkAccess = async (userId, obj, act, tenant) => {
  try {
    const enforcer = await getTenantEnforcer(tenant);
    const result = await enforcer.enforce(userId, obj, act, tenant);
    return result;
  } catch (error) {
    logger.error(`Error checking access for user ${userId} on ${obj}:${act} in tenant ${tenant}:`, error);
    return false;
  }
};

// Get user roles in a specific tenant
const getUserRoles = async (userId, tenant) => {
  try {
    const enforcer = await getTenantEnforcer(tenant);
    const roles = await enforcer.getRolesForUser(userId);
    return roles;
  } catch (error) {
    logger.error(`Error getting roles for user ${userId} in tenant ${tenant}:`, error);
    return [];
  }
};

// Get all policies for a tenant
const getTenantPolicies = async (tenant) => {
  try {
    const enforcer = await getTenantEnforcer(tenant);
    const policies = await enforcer.getPolicy();
    const groupingPolicies = await enforcer.getGroupingPolicy();
    return { policies, groupingPolicies };
  } catch (error) {
    logger.error(`Error getting policies for tenant ${tenant}:`, error);
    return { policies: [], groupingPolicies: [] };
  }
};

// Refresh policies for a specific tenant
const refreshTenantPolicies = async (tenant) => {
  try {
    logger.info(`🔄 Refreshing policies for tenant: ${tenant}`);
    const newEnforcer = await createTenantEnforcer(tenant);
    tenantCache.set(tenant, newEnforcer);
    logger.info(`✅ Refreshed policies for tenant: ${tenant}`);
  } catch (error) {
    logger.error(`Failed to refresh policies for tenant ${tenant}:`, error.message);
  }
};

// Refresh tenant and notify other servers via Redis
const refreshTenantAndNotify = async (tenant, operation) => {
  try {
    // Refresh the tenant
    await refreshTenantPolicies(tenant);
    
    // Publish to Redis for cross-server sync
    await publishTenantRefresh(tenant, operation);
    
    logger.info(`✅ Refreshed and notified for tenant: ${tenant}, operation: ${operation}`);
  } catch (error) {
    logger.error(`Failed to refresh and notify for tenant ${tenant}:`, error.message);
    throw error;
  }
};

// Get cache statistics
const getCacheStats = () => {
  return tenantCache.getStats();
};

// Get database statistics using shared pool
const getDatabaseStats = async () => {
  try {
    // Use shared connection pool for stats
    const sharedPool = getSharedConnectionPool();
    await sharedPool.initialize();
    const sequelize = sharedPool.sequelize;
    
    const totalCount = await sequelize.query(
      'SELECT COUNT(*) as count FROM casbin_rule',
      { type: sequelize.QueryTypes.SELECT, timeout: 10000 }
    );
    
    const ptypeCount = await sequelize.query(
      'SELECT ptype, COUNT(*) as count FROM casbin_rule GROUP BY ptype',
      { type: sequelize.QueryTypes.SELECT, timeout: 10000 }
    );
    
    const tenantCount = await sequelize.query(
      `SELECT 
        CASE 
          WHEN ptype = 'p' THEN v3 
          WHEN ptype = 'g' THEN v2 
        END as tenant,
        COUNT(*) as count 
       FROM casbin_rule 
       GROUP BY 
        CASE 
          WHEN ptype = 'p' THEN v3 
          WHEN ptype = 'g' THEN v2 
        END`,
      { type: sequelize.QueryTypes.SELECT, timeout: 10000 }
    );
    
    const poolStats = sharedPool.getPoolStats();
    
    return {
      total: totalCount[0].count,
      byPtype: ptypeCount,
      byTenant: tenantCount,
      poolStats: poolStats
    };
  } catch (error) {
    logger.error('Failed to get database stats:', error);
    throw error;
  }
};

// Remove tenant from cache
const removeTenant = (tenant) => {
  tenantCache.delete(tenant);
  logger.info(`Removed tenant from cache: ${tenant}`);
};

// Memory monitoring function
const monitorMemory = () => {
  const memoryUsage = tenantCache.getCurrentMemoryUsage();
  const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
  
  logger.info(`📊 Memory Status - Heap: ${memoryUsage.heapUsed}MB/${memoryUsage.heapTotal}MB (${heapUsagePercent.toFixed(1)}%), Cache: ${tenantCache.size()}/${tenantCache.maxSize} tenants`);
  
  // Force garbage collection if memory usage is high (lowered from 80% to 60%)
  if (heapUsagePercent > 60 && global.gc) {
    logger.info(`🧹 Forcing garbage collection due to high memory usage`);
    global.gc();
  }
  
  return {
    memory: memoryUsage,
    heapUsagePercent,
    cacheSize: tenantCache.size(),
    cacheMaxSize: tenantCache.maxSize
  };
};

// Setup memory monitoring
const setupMemoryMonitoring = () => {
  setInterval(() => {
    monitorMemory();
  }, 60000); // Monitor every 60 seconds instead of 30
};

// Initialize memory monitoring
setupMemoryMonitoring();

module.exports = {
  getTenantEnforcer,
  checkAccess,
  getUserRoles,
  getTenantPolicies,
  refreshTenantPolicies,
  refreshTenantAndNotify,
  getCacheStats,
  getDatabaseStats,
  removeTenant,
  monitorMemory,     // Export memory monitoring function
  publishTenantRefresh, // Export Redis publish function
  initializeRedisSync    // Export Redis initialization function
};