const { Sequelize } = require('sequelize');

class SharedConnectionPool {
  constructor() {
    this.sequelize = null;
    this.initialized = false;
    this.tenantAdapters = new Map();
  }

  // Initialize the shared connection pool
  async initialize() {
    if (this.initialized) {
      return this.sequelize;
    }

    this.sequelize = new Sequelize({
      username: 'casbin',
      password: 'casbin1234',
      database: 'casbin_db',
      dialect: 'mysql',
      host: 'localhost',
      port: 3306,
      // Optimized pool settings for multi-tenant usage
      pool: {
        max: 20,           // Total connections across all tenants
        min: 5,            // Keep some connections ready
        acquire: 30000,    // 30s acquire timeout
        idle: 10000,       // 10s idle timeout
        evict: 60000,      // Check for dead connections every 60s
        handleDisconnects: true
      },
      logging: false,
      benchmark: false,
      timeout: 10000,
      query: { timeout: 10000 }
    });

    // Test the connection
    await this.sequelize.authenticate();
    console.log('✅ Shared connection pool initialized successfully');
    
    this.initialized = true;
    return this.sequelize;
  }

  // Get or create a tenant-aware adapter using the shared connection
  async getTenantAdapter(tenant) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check if we already have an adapter for this tenant
    if (this.tenantAdapters.has(tenant)) {
      return this.tenantAdapters.get(tenant);
    }

    // Create new tenant-aware adapter using shared connection
    const { TenantAwareAdapter } = require('./tenant-aware-adapter');
    const adapter = new TenantAwareAdapter(this.sequelize);
    adapter.setTenant(tenant);
    
    // Store the adapter for reuse
    this.tenantAdapters.set(tenant, adapter);
    
    console.log(`✅ Created tenant adapter for: ${tenant} (total adapters: ${this.tenantAdapters.size})`);
    return adapter;
  }

  // Get pool statistics
  getPoolStats() {
    if (!this.sequelize) {
      return { error: 'Pool not initialized' };
    }

    const pool = this.sequelize.connectionManager.pool;
    return {
      total: pool.size,
      available: pool.available,
      pending: pool.pending,
      tenantAdapters: this.tenantAdapters.size,
      initialized: this.initialized
    };
  }

  // Clean up resources
  async close() {
    if (this.sequelize) {
      await this.sequelize.close();
      this.tenantAdapters.clear();
      this.initialized = false;
      console.log('✅ Shared connection pool closed');
    }
  }
}

// Singleton instance
let sharedPool = null;

const getSharedConnectionPool = () => {
  if (!sharedPool) {
    sharedPool = new SharedConnectionPool();
  }
  return sharedPool;
};

module.exports = {
  SharedConnectionPool,
  getSharedConnectionPool
}; 