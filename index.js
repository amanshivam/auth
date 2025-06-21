const express = require('express');
const bodyParser = require('body-parser');
const { getTenantEnforcer, getCacheStats, refreshTenantPolicies, getSharedAdapter } = require('./casbin');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());
const port = process.argv[2] || 3000;

// Webhook configuration
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-secret-key-here';
const SERVER_ID = process.env.SERVER_ID || `server-${port}`;

// List of other servers to notify (configure this based on your deployment)
const OTHER_SERVERS = process.env.OTHER_SERVERS ? 
  process.env.OTHER_SERVERS.split(',').map(s => s.trim()) : 
  []; // e.g., ['http://localhost:3001', 'http://localhost:3002']

// Helper function to check for duplicates using the shared adapter
let dbCheckEnabled = true; // Flag to enable/disable DB checks

// Webhook notification function
const notifyOtherServers = async (tenant, operation) => {
  const payload = {
    tenant,
    operation,
    serverId: SERVER_ID,
    timestamp: new Date().toISOString(),
    secret: WEBHOOK_SECRET
  };

  const promises = OTHER_SERVERS.map(async (serverUrl) => {
    try {
      await axios.post(`${serverUrl}/webhook/refresh`, payload, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });
      console.log(`✅ Notified ${serverUrl} to refresh tenant: ${tenant}`);
    } catch (error) {
      console.error(`❌ Failed to notify ${serverUrl}:`, error.message);
    }
  });

  await Promise.allSettled(promises);
};

// Webhook endpoint to receive refresh notifications
app.post('/webhook/refresh', async (req, res) => {
  try {
    const { tenant, operation, serverId, secret } = req.body;
    
    // Verify webhook secret
    if (secret !== WEBHOOK_SECRET) {
      console.warn(`⚠️ Invalid webhook secret from ${serverId}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Don't refresh if this server sent the notification
    if (serverId === SERVER_ID) {
      return res.json({ success: true, message: 'Ignored own notification' });
    }
    
    console.log(`🔄 Received refresh notification from ${serverId} for tenant: ${tenant}, operation: ${operation}`);
    
    // Refresh the tenant's cache
    await refreshTenantPolicies(tenant);
    
    res.json({ 
      success: true, 
      message: `Refreshed tenant: ${tenant}`,
      serverId: SERVER_ID 
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint for server discovery
app.get('/health', (req, res) => {
  res.json({
    serverId: SERVER_ID,
    port: port,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    cacheStats: getCacheStats()
  });
});

// Server discovery endpoint
app.get('/servers', (req, res) => {
  res.json({
    currentServer: {
      id: SERVER_ID,
      port: port,
      url: `http://localhost:${port}`
    },
    otherServers: OTHER_SERVERS,
    webhookSecret: WEBHOOK_SECRET ? '***configured***' : 'not-configured'
  });
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
            timeout: 5000,
            logging: false
        });
        
        return result.count > 0;
    } catch (error) {
        console.error('Error checking database duplicate:', error);
        return false;
    }
};

// Function to disable database checks (for load testing)
const disableDbChecks = () => {
    dbCheckEnabled = false;
    console.log('Database duplicate checks disabled for load testing');
};

// Function to enable database checks (for normal operation)
const enableDbChecks = () => {
    dbCheckEnabled = true;
    console.log('Database duplicate checks enabled');
};

// API to Create User Group
app.post('/create-group', async (req, res) => {
    const { groupName, tenant } = req.body;
    
    try {
        // Check database directly for existing group (more reliable across replicas)
        const existingGroup = await checkDatabaseDuplicate('g', [groupName, groupName], tenant);
        
        if (existingGroup) {
            res.status(400).json({ 
                success: false, 
                message: `Group '${groupName}' already exists in tenant '${tenant}'` 
            });
            return;
        }
        
        const enforcer = await getTenantEnforcer(tenant);
        
        // In Casbin, roles/groups are just strings; no explicit creation is needed.
        // Optionally, you could track group metadata in a separate table if needed.
        
        // Immediately refresh the tenant's enforcer cache to prevent duplicates
        await refreshTenantPolicies(tenant);
        
        // Notify other servers to refresh
        await notifyOtherServers(tenant, 'create-group');
        
        res.json({ success: true, message: `Group '${groupName}' is ready to use in tenant '${tenant}'.` });
    } catch (error) {
        console.error('Error creating group:', error);
        
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
            res.status(400).json({ 
                success: false, 
                message: `Permission for role '${role}' on '${obj}:${act}' already exists in tenant '${tenant}'` 
            });
            return;
        }
        
        const enforcer = await getTenantEnforcer(tenant);
        const added = await enforcer.addPolicy(role, obj, act, tenant);
        
        // Immediately refresh the tenant's enforcer cache to prevent duplicates
        await refreshTenantPolicies(tenant);
        
        // Notify other servers to refresh
        await notifyOtherServers(tenant, 'add-permission');
        
        res.json({ success: added });
    } catch (error) {
        console.error('Error adding permission:', error);
        
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
            res.status(400).json({ 
                success: false, 
                message: `User '${userId}' is already assigned to group '${groupName}' in tenant '${tenant}'` 
            });
            return;
        }
        
        const enforcer = await getTenantEnforcer(tenant);
        
        // Directly assign user to group (role) in Casbin
        const assigned = await enforcer.addGroupingPolicy(userId, groupName, tenant);
        
        // Immediately refresh the tenant's enforcer cache to prevent duplicates
        await refreshTenantPolicies(tenant);
        
        // Notify other servers to refresh
        await notifyOtherServers(tenant, 'assign-user');
        
        res.json({ success: assigned });
    } catch (error) {
        console.error('Error assigning user:', error);
        
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
        console.log(`loaded enforcer for ${tenant} ${enforcer}`);
        const allowed = await enforcer.enforce(userId, obj, act, tenant);
        res.json({ allowed });
    } catch (error) {
        console.error('Error checking access:', error);
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
        console.error('Error getting user policies:', error);
        res.status(500).json({ error: error.message });
    }
});

// API to Get Cache Statistics
app.get('/cache-stats', (req, res) => {
    res.json(getCacheStats());
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
        await refreshTenantPolicies(tenant);
        res.json({ success: true, message: `Refreshed policies for tenant: ${tenant}` });
    } catch (error) {
        console.error('Error refreshing tenant:', error);
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
        console.error('Error getting tenant policies:', error);
        res.status(500).json({ error: error.message });
    }
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
    console.log(`Server running on http://localhost:${port}`);
    console.log('Tenant-based RBAC system with LRU cache initialized');
});