const { newEnforcer } = require('casbin');
const { SequelizeAdapter } = require('casbin-sequelize-adapter');
const path = require('path');

// LRU Cache for tenant enforcers
class TenantEnforcerCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = [];
  }

  get(tenant) {
    if (this.cache.has(tenant)) {
      this.accessOrder = this.accessOrder.filter(t => t !== tenant);
      this.accessOrder.push(tenant);
      console.log(`Loaded enforcer for tenant from cache: ${tenant}`);
      return this.cache.get(tenant);
    }
    return null;
  }

  set(tenant, enforcer) {
    if (this.cache.has(tenant)) {
      this.cache.set(tenant, enforcer);
      this.accessOrder = this.accessOrder.filter(t => t !== tenant);
      this.accessOrder.push(tenant);
    } else {
      if (this.cache.size >= this.maxSize) {
        const lruTenant = this.accessOrder.shift();
        if (lruTenant) {
          this.cache.delete(lruTenant);
        }
      }
      this.cache.set(tenant, enforcer);
      this.accessOrder.push(tenant);
    }
  }

  delete(tenant) {
    this.cache.delete(tenant);
    this.accessOrder = this.accessOrder.filter(t => t !== tenant);
  }

  size() {
    return this.cache.size;
  }

  keys() {
    return Array.from(this.cache.keys());
  }
}

// Global cache instance
const tenantCache = new TenantEnforcerCache(100);

// Database adapter (shared across all enforcers)
let globalAdapter = null;

const getAdapter = async () => {
  if (!globalAdapter) {
    globalAdapter = await SequelizeAdapter.newAdapter({
      username: 'casbin',
      password: 'casbin1234',
      database: 'casbin_db',
      dialect: 'mysql',
      host: 'localhost',
      port: 3306,
      // Optimize connection pool for high concurrency
      pool: {
        max: 10,           // Increased from 5 to 10 for better load handling
        min: 2,            // Increased from 1 to 2 for better availability
        acquire: 30000,    // Maximum time to acquire connection (30s)
        idle: 10000,       // Increased from 5000 to 10000 - connections idle for 10s will be released
        evict: 60000,      // Increased from 30000 to 60000 - check for dead connections every 60s
        handleDisconnects: true // Handle disconnects automatically
      },
      // Performance optimizations
      logging: false,      // Disable SQL logging in production
      benchmark: false,    // Disable query benchmarking
      // Connection timeout
      timeout: 60000,      // 60 seconds
      // Query timeout
      query: {
        timeout: 10000     // 10 seconds
      }
    });
  }
  return globalAdapter;
};

// Load tenant policies from database (read-only)
const loadTenantPolicies = async (tenant) => {
  const adapter = await getAdapter();
  const sequelize = adapter.sequelize;
  
  // Load policies (ptype='p') where v3 = tenant
  const policies = await sequelize.query(
    'SELECT v0, v1, v2, v3, v4 FROM casbin_rule WHERE ptype = ? AND v3 = ?',
    {
      replacements: ['p', tenant],
      type: sequelize.QueryTypes.SELECT,
      timeout: 5000,
      logging: false
    }
  );
  
  // Load grouping policies (ptype='g') where v2 = tenant
  const groupingPolicies = await sequelize.query(
    'SELECT v0, v1, v2 FROM casbin_rule WHERE ptype = ? AND v2 = ?',
    {
      replacements: ['g', tenant],
      type: sequelize.QueryTypes.SELECT,
      timeout: 5000,
      logging: false
    }
  );
  
  return { policies, groupingPolicies };
};

// Create enforcer for a specific tenant
const createTenantEnforcer = async (tenant) => {
  try {
    const adapter = await getAdapter();
    
    // Create new enforcer instance
    const enforcer = await newEnforcer(path.join(__dirname) + '/model.conf', adapter);
    
    // Load tenant-specific policies
    const { policies, groupingPolicies } = await loadTenantPolicies(tenant);
    
    // Disable auto-save to prevent database writes during loading
    enforcer.enableAutoSave(false);
    
    // Clear existing policies (in-memory only)
    await enforcer.clearPolicy();
    
    // Add policies using proper Casbin methods (no database writes due to auto-save being disabled)
    for (const policy of policies) {
      const policyArray = [policy.v0, policy.v1, policy.v2, policy.v3, policy.v4].filter(v => v !== null);
      await enforcer.addPolicy(...policyArray);
    }
    
    // Add grouping policies using proper Casbin methods (no database writes due to auto-save being disabled)
    for (const groupingPolicy of groupingPolicies) {
      const policyArray = [groupingPolicy.v0, groupingPolicy.v1, groupingPolicy.v2];
      await enforcer.addGroupingPolicy(...policyArray);
    }
    
    // Re-enable auto-save for future operations
    enforcer.enableAutoSave(true);
    enforcer.enableAutoBuildRoleLinks(true);
    
    console.log(`Created enforcer for tenant: ${tenant} with ${policies.length} policies and ${groupingPolicies.length} grouping policies`);
    return enforcer;
  } catch (error) {
    console.error(`Failed to create enforcer for tenant ${tenant}:`, error);
    throw error;
  }
};

// Get or create enforcer for a tenant
const getTenantEnforcer = async (tenant) => {
  let enforcer = tenantCache.get(tenant);
  if (!enforcer) {
    console.log(`Creating new enforcer for tenant: ${tenant}`);
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
    console.error(`Error checking access for user ${userId} on ${obj}:${act} in tenant ${tenant}:`, error);
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
    console.error(`Error getting roles for user ${userId} in tenant ${tenant}:`, error);
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
    console.error(`Error getting policies for tenant ${tenant}:`, error);
    return { policies: [], groupingPolicies: [] };
  }
};

// Refresh policies for a specific tenant
const refreshTenantPolicies = async (tenant) => {
  try {
    const newEnforcer = await createTenantEnforcer(tenant);
    tenantCache.set(tenant, newEnforcer);
    console.log(`Refreshed policies for tenant: ${tenant}`);
  } catch (error) {
    console.error(`Failed to refresh policies for tenant ${tenant}:`, error);
  }
};

// Auto-refresh all cached tenants
const setupAutoRefresh = () => {
  setInterval(async () => {
    const tenants = tenantCache.keys();
    console.log(`Auto-refreshing policies for ${tenants.length} tenants...`);
    
    for (const tenant of tenants) {
      try {
        await refreshTenantPolicies(tenant);
        console.log(`✅ Refreshed policies for tenant: ${tenant}`);
      } catch (error) {
        console.error(`❌ Failed to refresh policies for tenant ${tenant}:`, error);
      }
    }
    }, 60000); // 5 seconds - faster refresh for better multi-server consistency
};

// Initialize auto-refresh
setupAutoRefresh();

// Get cache statistics
const getCacheStats = () => {
  return {
    size: tenantCache.size(),
    maxSize: tenantCache.maxSize,
    tenants: tenantCache.keys()
  };
};

// Get database statistics
const getDatabaseStats = async () => {
  try {
    const adapter = await getAdapter();
    const sequelize = adapter.sequelize;
    
    const totalCount = await sequelize.query(
      'SELECT COUNT(*) as count FROM casbin_rule',
      { type: sequelize.QueryTypes.SELECT }
    );
    
    const ptypeCount = await sequelize.query(
      'SELECT ptype, COUNT(*) as count FROM casbin_rule GROUP BY ptype',
      { type: sequelize.QueryTypes.SELECT }
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
      { type: sequelize.QueryTypes.SELECT }
    );
    
    return {
      total: totalCount[0].count,
      byPtype: ptypeCount,
      byTenant: tenantCount
    };
  } catch (error) {
    console.error('Failed to get database stats:', error);
    throw error;
  }
};

// Remove tenant from cache
const removeTenant = (tenant) => {
  tenantCache.delete(tenant);
  console.log(`Removed tenant from cache: ${tenant}`);
};

// Export the shared adapter getter for use in other modules
const getSharedAdapter = getAdapter;

module.exports = {
  getTenantEnforcer,
  checkAccess,
  getUserRoles,
  getTenantPolicies,
  refreshTenantPolicies,
  setupAutoRefresh,
  getCacheStats,
  getDatabaseStats,
  removeTenant,
  getSharedAdapter  // Export the shared adapter
};