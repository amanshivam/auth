const axios = require('axios');

// Configuration for 10,000 tenants test
const SERVER_URLS = ['http://localhost:3000', 'http://localhost:3002'];
const TOTAL_TENANTS = 10000; // 10,000 tenants
const GROUPS_PER_TENANT = 10; // 10 groups per tenant
const USERS_PER_TENANT = 50; // 50 users per tenant
const ACTIONS = ['create', 'read', 'update', 'delete', 'share'];
const RESOURCES_PER_TENANT = 50; // 50 resources per tenant

// Optimized batch processing for large scale
const BATCH_SIZE = 50; // Process 50 tenants per batch
const DELAY_BETWEEN_BATCHES = 0; // No delay between batches
const DELAY_BETWEEN_OPERATIONS = 0; // No delay between operations

// Use sequential tenant IDs from 1-10000
const TENANT_PREFIX = 'tenantid';

// Performance monitoring
let startTime = Date.now();
let totalOperations = 0;
let successfulOperations = 0;
let failedOperations = 0;
let batchCount = 0;

// Statistics tracking
const stats = {
    tenantsCreated: 0,
    groupsCreated: 0,
    usersAssigned: 0,
    permissionsAdded: 0,
    batchesCompleted: 0,
    errors: []
};

// Helper function to get random server
const getRandomServer = () => {
    return SERVER_URLS[Math.floor(Math.random() * SERVER_URLS.length)];
};

// Helper function to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to log progress
const logProgress = (message) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const successRate = totalOperations > 0 ? ((successfulOperations / totalOperations) * 100).toFixed(2) : '0.00';
    console.log(`[${elapsed}s] ${message} | Success Rate: ${successRate}% | Batch: ${batchCount}/${Math.ceil(TOTAL_TENANTS / BATCH_SIZE)}`);
};

// Helper function to make API request with retry
const makeRequest = async (url, data, operation) => {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await axios.post(url, data, {
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.data.success !== false) {
                return { success: true, data: response.data };
            } else {
                throw new Error(response.data.message || 'Operation failed');
            }
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }
            await delay(1000 * attempt); // Exponential backoff
        }
    }
};

// Create groups for a tenant
const createGroupsForTenant = async (tenantId) => {
    const groups = [];
    for (let i = 1; i <= GROUPS_PER_TENANT; i++) {
        const groupName = `group${i}`;
        try {
            await makeRequest(`${getRandomServer()}/create-group`, {
                groupName,
                tenant: `${TENANT_PREFIX}${tenantId}`
            }, 'create-group');
            groups.push(groupName);
            stats.groupsCreated++;
            successfulOperations++;
        } catch (error) {
            if (!error.message.includes('already exists')) {
                stats.errors.push(`Failed to create group ${groupName} for tenant ${tenantId}: ${error.message}`);
                failedOperations++;
            }
        }
        totalOperations++;
    }
    return groups;
};

// Assign users to groups for a tenant
const assignUsersToGroups = async (tenantId, groups) => {
    for (let userId = 1; userId <= USERS_PER_TENANT; userId++) {
        // Assign each user to 1-3 random groups
        const numGroups = Math.floor(Math.random() * 3) + 1;
        const selectedGroups = [];
        
        for (let i = 0; i < numGroups; i++) {
            const randomGroup = groups[Math.floor(Math.random() * groups.length)];
            if (!selectedGroups.includes(randomGroup)) {
                selectedGroups.push(randomGroup);
            }
        }
        
        for (const groupName of selectedGroups) {
            try {
                await makeRequest(`${getRandomServer()}/assign-user`, {
                    userId: `user${userId}`,
                    groupName,
                    tenant: `${TENANT_PREFIX}${tenantId}`
                }, 'assign-user');
                stats.usersAssigned++;
                successfulOperations++;
            } catch (error) {
                if (!error.message.includes('already assigned')) {
                    stats.errors.push(`Failed to assign user${userId} to ${groupName} in tenant ${tenantId}: ${error.message}`);
                    failedOperations++;
                }
            }
            totalOperations++;
        }
    }
};

// Add permissions for groups on resources
const addPermissionsForGroups = async (tenantId, groups) => {
    for (const groupName of groups) {
        // Add 5-15 random permissions per group
        const numPermissions = Math.floor(Math.random() * 11) + 5;
        
        for (let i = 0; i < numPermissions; i++) {
            const resourceId = Math.floor(Math.random() * RESOURCES_PER_TENANT) + 1;
            const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
            
            try {
                await makeRequest(`${getRandomServer()}/add-permission`, {
                    role: groupName,
                    obj: `resourceid${resourceId}`,
                    act: action,
                    tenant: `${TENANT_PREFIX}${tenantId}`
                }, 'add-permission');
                stats.permissionsAdded++;
                successfulOperations++;
            } catch (error) {
                if (!error.message.includes('already exists')) {
                    stats.errors.push(`Failed to add permission for ${groupName} on resourceid${resourceId}:${action} in tenant ${tenantId}: ${error.message}`);
                    failedOperations++;
                }
            }
            totalOperations++;
        }
    }
};

// Process a batch of tenants
const processBatch = async (startTenantId, endTenantId) => {
    batchCount++;
    logProgress(`Starting batch ${batchCount}: tenants ${startTenantId}-${endTenantId}`);
    
    for (let tenantId = startTenantId; tenantId <= endTenantId; tenantId++) {
        try {
            // Create groups for this tenant
            const groups = await createGroupsForTenant(tenantId);
            
            // Assign users to groups
            await assignUsersToGroups(tenantId, groups);
            
            // Add permissions for groups
            await addPermissionsForGroups(tenantId, groups);
            
            stats.tenantsCreated++;
            logProgress(`✅ Completed tenant ${tenantId} (${stats.tenantsCreated}/${TOTAL_TENANTS})`);
            
        } catch (error) {
            stats.errors.push(`Failed to process tenant ${tenantId}: ${error.message}`);
            failedOperations++;
            totalOperations++;
        }
    }
    
    stats.batchesCompleted++;
    logProgress(`✅ Completed batch ${batchCount}`);
};

// Main ingestion function
const runIngestion = async () => {
    console.log('🚀 Starting Large-Scale Data Ingestion Test');
    console.log(`📊 Target: ${TOTAL_TENANTS} tenants, ${USERS_PER_TENANT} users/tenant, ${RESOURCES_PER_TENANT} resources/tenant`);
    console.log(`⚙️  Configuration: ${BATCH_SIZE} tenants/batch, ${DELAY_BETWEEN_BATCHES}ms delay`);
    console.log('='.repeat(80));
    
    startTime = Date.now();
    
    try {
        // Process tenants in batches
        for (let i = 1; i <= TOTAL_TENANTS; i += BATCH_SIZE) {
            const endTenantId = Math.min(i + BATCH_SIZE - 1, TOTAL_TENANTS);
            await processBatch(i, endTenantId);
            
            // Add delay between batches (except for the last batch)
            if (endTenantId < TOTAL_TENANTS && DELAY_BETWEEN_BATCHES > 0) {
                logProgress(`⏳ Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
                await delay(DELAY_BETWEEN_BATCHES);
            }
        }
        
        // Final summary
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const successRate = ((successfulOperations / totalOperations) * 100).toFixed(2);
        
        console.log('\n' + '='.repeat(80));
        console.log('🎉 INGESTION COMPLETED!');
        console.log('='.repeat(80));
        console.log(`⏱️  Total Time: ${totalTime} seconds`);
        console.log(`📊 Total Operations: ${totalOperations.toLocaleString()}`);
        console.log(`✅ Successful Operations: ${successfulOperations.toLocaleString()}`);
        console.log(`❌ Failed Operations: ${failedOperations.toLocaleString()}`);
        console.log(`📈 Success Rate: ${successRate}%`);
        console.log(`🏢 Tenants Created: ${stats.tenantsCreated.toLocaleString()}`);
        console.log(`👥 Groups Created: ${stats.groupsCreated.toLocaleString()}`);
        console.log(`👤 Users Assigned: ${stats.usersAssigned.toLocaleString()}`);
        console.log(`🔐 Permissions Added: ${stats.permissionsAdded.toLocaleString()}`);
        console.log(`📦 Batches Completed: ${stats.batchesCompleted}`);
        
        if (stats.errors.length > 0) {
            console.log(`\n⚠️  Errors (${stats.errors.length}):`);
            stats.errors.slice(0, 10).forEach(error => console.log(`   - ${error}`));
            if (stats.errors.length > 10) {
                console.log(`   ... and ${stats.errors.length - 10} more errors`);
            }
        }
        
        console.log('\n🚀 Ready for performance testing!');
        
    } catch (error) {
        console.error('❌ Ingestion failed:', error.message);
        process.exit(1);
    }
};

// Run the ingestion
runIngestion();

// Error handling
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

module.exports = { runIngestion }; 