const express = require('express');
const bodyParser = require('body-parser');
const { getTenantEnforcer, getCacheStats, refreshTenantAndNotify, getSharedAdapter, monitorMemory } = require('./casbin');
const path = require('path');
const logger = require('./logger');

const app = express();
app.use(bodyParser.json());
const port = process.argv[2] || 3000;

// Latency logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;
  
  res.send = function(data) {
    const duration = Date.now() - start;
    logger.info(`LATENCY: ${req.method} ${req.path} - ${duration}ms - ${res.statusCode} - ${req.ip}`);
    originalSend.call(this, data);
  };
  
  next();
});

// Request queuing and rate limiting
class RequestQueue {
  constructor(maxConcurrent = 50, maxQueueSize = 1000) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
    this.running = 0;
    this.queue = [];
    this.stats = {
      totalRequests: 0,
      queuedRequests: 0,
      rejectedRequests: 0,
      averageWaitTime: 0,
      totalWaitTime: 0
    };
  }

  async add(task) {
    this.stats.totalRequests++;
    
    // If queue is full, reject the request
    if (this.queue.length >= this.maxQueueSize) {
      this.stats.rejectedRequests++;
      throw new Error('Request queue is full. Please try again later.');
    }

    return new Promise((resolve, reject) => {
      const queueEntry = {
        task,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.queue.push(queueEntry);
      this.stats.queuedRequests++;
      
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { task, resolve, reject, timestamp } = this.queue.shift();
    
    // Calculate wait time
    const waitTime = Date.now() - timestamp;
    this.stats.totalWaitTime += waitTime;
    this.stats.averageWaitTime = this.stats.totalWaitTime / this.stats.totalRequests;

    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      // Process next item in queue
      setImmediate(() => this.processQueue());
    }
  }

  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      running: this.running,
      maxConcurrent: this.maxConcurrent,
      maxQueueSize: this.maxQueueSize
    };
  }
}

// Create request queue instance
const requestQueue = new RequestQueue(1, 1);

// Rate limiting middleware
const rateLimit = (windowMs = 60000, maxRequests = 100) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    if (requests.has(clientId)) {
      requests.set(clientId, requests.get(clientId).filter(timestamp => timestamp > windowStart));
    } else {
      requests.set(clientId, []);
    }
    
    const clientRequests = requests.get(clientId);
    
    if (clientRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    clientRequests.push(now);
    next();
  };
};

// Apply rate limiting to all routes
//app.use(rateLimit(60000, 100)); // Reduced from 200 to 100 requests per minute per IP

// Helper function to check for duplicates using the shared adapter
let dbCheckEnabled = true; // Flag to enable/disable DB checks

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    port: port,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    cacheStats: getCacheStats(),
    queueStats: requestQueue.getStats()
  });
});

// Queue stats endpoint
app.get('/queue-stats', (req, res) => {
  res.json(requestQueue.getStats());
});

const checkDatabaseDuplicate = async (ptype, values, tenant) => {
    // Skip database checks during high load to prevent connection issues
    if (!dbCheckEnabled) {
        return false; // Assume no duplicate to allow the operation to proceed
    }
    
    try {
        // Use the shared adapter from casbin.js to utilize connection pooling
        const adapter = await getSharedAdapter();
        const sequelize = adapter.sequelize;
        let query, replacements;
        
        if (ptype === 'p') {
            // Check for policy duplicates
            query = 'SELECT COUNT(*) as count FROM casbin_rule WHERE ptype = ? AND v0 = ? AND v1 = ? AND v2 = ? AND v3 = ?';
            replacements = [ptype, values[0], values[1], values[2], tenant];
        } else if (ptype === 'g') {
            // Check for grouping policy duplicates
            query = 'SELECT COUNT(*) as count FROM casbin_rule WHERE ptype = ? AND v0 = ? AND v1 = ? AND v2 = ?';
            replacements = [ptype, values[0], values[1], tenant];
        }
        
        const [result] = await sequelize.query(query, {
            replacements,
            type: sequelize.QueryTypes.SELECT,
            timeout: 10000, // Increased timeout
            logging: false
        });
        
        return result.count > 0;
    } catch (error) {
        logger.error('Error checking database duplicate:', error);
        return false;
    }
};

// Function to disable database checks (for load testing)
const disableDbChecks = () => {
    dbCheckEnabled = false;
    logger.info('Database duplicate checks disabled for load testing');
};

// Function to enable database checks (for normal operation)
const enableDbChecks = () => {
    dbCheckEnabled = true;
    logger.info('Database duplicate checks enabled');
};

// API to Create User Group
app.post('/create-group', async (req, res) => {
    const { groupName, tenant } = req.body;
    
    try {
        // Check database directly for existing group (more reliable across replicas)
        const existingGroup = await checkDatabaseDuplicate('g', [groupName, groupName], tenant);
        
        if (existingGroup) {
            throw new Error(`Group '${groupName}' already exists in tenant '${tenant}'`);
        }
        
        const enforcer = await getTenantEnforcer(tenant);
        
        // In Casbin, roles/groups are just strings; no explicit creation is needed.
        // Optionally, you could track group metadata in a separate table if needed.
        
        // Refresh tenant and notify other servers via Redis
        await refreshTenantAndNotify(tenant, 'create-group');
        
        res.json({ success: true, message: `Group '${groupName}' is ready to use in tenant '${tenant}'.` });
    } catch (error) {
        logger.error('Error creating group:', error);
        
        // Handle database constraint violations
        if (error.message && error.message.includes('unique_grouping')) {
            res.status(400).json({ 
                success: false, 
                message: `Group '${groupName}' already exists in tenant '${tenant}' (database constraint)` 
            });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// API to Add Permissions to Group
app.post('/add-permission', async (req, res) => {
    const { role, obj, act, tenant } = req.body;
    
    try {
        // Check database directly for existing policy (more reliable across replicas)
        const existingPolicy = await checkDatabaseDuplicate('p', [role, obj, act], tenant);
        
        if (existingPolicy) {
            throw new Error(`Permission for role '${role}' on '${obj}:${act}' already exists in tenant '${tenant}'`);
        }
        
        const enforcer = await getTenantEnforcer(tenant);
        const added = await enforcer.addPolicy(role, obj, act, tenant);
        
        // Refresh tenant and notify other servers via Redis
        await refreshTenantAndNotify(tenant, 'add-permission');
        
        res.json({ success: added });
    } catch (error) {
        logger.error('Error adding permission:', error);
        
        // Handle database constraint violations
        if (error.message && error.message.includes('unique_policy')) {
            res.status(400).json({ 
                success: false, 
                message: `Permission for role '${role}' on '${obj}:${act}' already exists in tenant '${tenant}' (database constraint)` 
            });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// API to Assign User to Group
app.post('/assign-user', async (req, res) => {
    const { userId, groupName, tenant } = req.body;
    
    try {
        // Check database directly for existing user-group assignment (more reliable across replicas)
        const existingAssignment = await checkDatabaseDuplicate('g', [userId, groupName], tenant);
        
        if (existingAssignment) {
            throw new Error(`User '${userId}' is already assigned to group '${groupName}' in tenant '${tenant}'`);
        }
        
        const enforcer = await getTenantEnforcer(tenant);
        
        // Directly assign user to group (role) in Casbin
        const assigned = await enforcer.addGroupingPolicy(userId, groupName, tenant);
        
        // Refresh tenant and notify other servers via Redis
        await refreshTenantAndNotify(tenant, 'assign-user');
        
        res.json({ success: assigned });
    } catch (error) {
        logger.error('Error assigning user:', error);
        
        // Handle database constraint violations
        if (error.message && error.message.includes('unique_grouping')) {
            res.status(400).json({ 
                success: false, 
                message: `User '${userId}' is already assigned to group '${groupName}' in tenant '${tenant}' (database constraint)` 
            });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// API to Check Access
app.post('/check-access', async (req, res) => {
    const { userId, obj, act, tenant } = req.body;
    
    try {
        const enforcer = await getTenantEnforcer(tenant);
        logger.info(`loaded enforcer for ${tenant} ${enforcer}`);
        const allowed = await enforcer.enforce(userId, obj, act, tenant);
        res.json({ allowed });
    } catch (error) {
        logger.error('Error checking access:', error);
        res.status(500).json({ error: error.message });
    }
});

// API to Get User Policies
app.post('/getUserPolicies', async (req, res) => {
    const { userId, tenant } = req.body;
    
    try {
        const enforcer = await getTenantEnforcer(tenant);
        const userPolicies = await enforcer.getRolesForUser(userId, tenant);
        res.json({ policies: userPolicies });
    } catch (error) {
        logger.error('Error getting user policies:', error);
        res.status(500).json({ error: error.message });
    }
});

// API to Get Cache Statistics
app.get('/cache-stats', (req, res) => {
    res.json({
        ...getCacheStats(),
        queueStats: requestQueue.getStats()
    });
});

// API to Get Memory Statistics
app.get('/memory-stats', (req, res) => {
    const memoryInfo = monitorMemory();
    res.json({
        ...memoryInfo,
        queueStats: requestQueue.getStats()
    });
});

// API to control database checks (for load testing)
app.post('/disable-db-checks', (req, res) => {
    disableDbChecks();
    res.json({ success: true, message: 'Database duplicate checks disabled' });
});

app.post('/enable-db-checks', (req, res) => {
    enableDbChecks();
    res.json({ success: true, message: 'Database duplicate checks enabled' });
});

// API to Manually Refresh Tenant Policies
app.post('/refresh-tenant', async (req, res) => {
    const { tenant } = req.body;
    
    try {
        await refreshTenantAndNotify(tenant, 'refresh-tenant');
        res.json({ success: true, message: `Refreshed policies for tenant: ${tenant}` });
    } catch (error) {
        logger.error('Error refreshing tenant:', error);
        res.status(500).json({ error: error.message });
    }
});

// API to Get All Policies for a Tenant
app.get('/tenant-policies/:tenant', async (req, res) => {
    const { tenant } = req.params;
    
    try {
        const enforcer = await getTenantEnforcer(tenant);
        const policies = await enforcer.getPolicy();
        const groupingPolicies = await enforcer.getGroupingPolicy();
        
        res.json({
            tenant,
            policies,
            groupingPolicies
        });
    } catch (error) {
        logger.error('Error getting tenant policies:', error);
        res.status(500).json({ error: error.message });
    }
});

// API to Get Redis Status
app.get('/redis-status', (req, res) => {
    const { getRedisManager } = require('./redis');
    const redisManager = getRedisManager();
    const status = redisManager.getStatus();
    res.json({
        redis: status,
        timestamp: new Date().toISOString()
    });
});

app.get('/', async (req, res) => {
    try {
        res.sendFile(path.join(__dirname) + "/auth.html");
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Start Server
app.listen(port, () => {
    logger.info(`Server running on http://localhost:${port}`);
    logger.info('Tenant-based RBAC system with LRU cache and request queuing initialized');
    logger.info(`Request queue configured: max ${requestQueue.maxConcurrent} concurrent, max ${requestQueue.maxQueueSize} queued`);
});

// Export for use in other modules
module.exports = {
    app,
    requestQueue
};