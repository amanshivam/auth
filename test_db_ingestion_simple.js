const mysql = require('mysql2/promise');

// Configuration - easily configurable
const CONFIG = {
    // Database configuration
    database: {
        user: 'casbin',
        password: 'casbin1234',
        database: 'casbin_db',
        host: 'localhost',
        connectionLimit: 5,           // Very small connection pool
        acquireTimeout: 60000,
        timeout: 60000
    },
    
    // Test data configuration - start small for testing
    tenants: {
        count: 100000,            // Start with 1000 tenants for testing
        startId: 1,
        prefix: 'tenantid'
    },
    
    users: {
        perTenant: 50,          // Reduced for testing
        prefix: 'user'
    },
    
    resources: {
        perTenant: 50,          // Reduced for testing
        prefix: 'resourceid'
    },
    
    groups: {
        perTenant:20,           // Reduced for testing
        prefix: 'group'
    },
    
    permissions: {
        perGroup: { min: 3, max: 8 },  // Reduced for testing
        actions: ['create', 'read', 'update', 'delete', 'share']
    },
    
    assignments: {
        perUser: { min: 1, max: 2 }     // Reduced for testing
    },
    
    // Processing configuration
    batchSize: 5,               // Very small batches
    showProgress: true
};

// Performance tracking
let startTime = Date.now();
let totalRecords = 0;
let insertedRecords = 0;
let failedRecords = 0;

// Statistics
const stats = {
    tenants: 0,
    groups: 0,
    userAssignments: 0,
    permissions: 0,
    batches: 0,
    errors: []
};

// Helper function to log progress
const logProgress = (message) => {
    if (!CONFIG.showProgress) return;
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const successRate = totalRecords > 0 ? ((insertedRecords / totalRecords) * 100).toFixed(2) : '0.00';
    const rate = elapsed > 0 ? (insertedRecords / elapsed).toFixed(2) : '0.00';
    
    console.log(`[${elapsed}s] ${message} | Success: ${successRate}% | Rate: ${rate} records/sec`);
};

// Helper function to create connection pool
const createConnectionPool = () => {
    return mysql.createPool(CONFIG.database);
};

// Helper function to execute single insert with retry
const executeSingleInsert = async (pool, table, columns, values) => {
    const placeholders = `(${columns.map(() => '?').join(', ')})`;
    const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;
    
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const [result] = await pool.execute(query, values);
            return result.affectedRows;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                // Ignore duplicate key errors
                return 0;
            }
            
            if (error.code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR' || 
                error.message.includes('Malformed communication packet') ||
                error.message.includes('Connection lost') ||
                error.message.includes('ECONNRESET')) {
                
                if (attempt < maxRetries) {
                    console.log(`⚠️  Connection error (attempt ${attempt}/${maxRetries}), retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    continue;
                }
            }
            
            throw error;
        }
    }
    return 0;
};

// Process a single tenant
const processTenant = async (pool, tenantId) => {
    try {
        // Create groups for this tenant
        for (let groupId = 1; groupId <= CONFIG.groups.perTenant; groupId++) {
            try {
                await executeSingleInsert(pool, 'casbin_rule', ['ptype', 'v0', 'v2'], [
                    'g',
                    `${CONFIG.groups.prefix}${groupId}`,
                    `${CONFIG.tenants.prefix}${tenantId}`
                ]);
                stats.groups++;
                insertedRecords++;
            } catch (error) {
                if (!error.message.includes('already exists')) {
                    stats.errors.push(`Failed to create group ${groupId} for tenant ${tenantId}: ${error.message}`);
                    failedRecords++;
                }
            }
            totalRecords++;
        }
        
        // Assign users to groups
        for (let userId = 1; userId <= CONFIG.users.perTenant; userId++) {
            const numGroups = Math.floor(Math.random() * 
                (CONFIG.assignments.perUser.max - CONFIG.assignments.perUser.min + 1)) + 
                CONFIG.assignments.perUser.min;
            
            const selectedGroups = new Set();
            while (selectedGroups.size < numGroups) {
                const groupId = Math.floor(Math.random() * CONFIG.groups.perTenant) + 1;
                selectedGroups.add(groupId);
            }
            
            for (const groupId of selectedGroups) {
                try {
                    await executeSingleInsert(pool, 'casbin_rule', ['ptype', 'v0', 'v1', 'v2'], [
                        'g',
                        `${CONFIG.users.prefix}${userId}`,
                        `${CONFIG.groups.prefix}${groupId}`,
                        `${CONFIG.tenants.prefix}${tenantId}`
                    ]);
                    stats.userAssignments++;
                    insertedRecords++;
                } catch (error) {
                    if (!error.message.includes('already exists')) {
                        stats.errors.push(`Failed to assign user${userId} to group${groupId} in tenant ${tenantId}: ${error.message}`);
                        failedRecords++;
                    }
                }
                totalRecords++;
            }
        }
        
        // Add permissions for groups
        for (let groupId = 1; groupId <= CONFIG.groups.perTenant; groupId++) {
            const numPermissions = Math.floor(Math.random() * 
                (CONFIG.permissions.perGroup.max - CONFIG.permissions.perGroup.min + 1)) + 
                CONFIG.permissions.perGroup.min;
            
            const groupPermissions = new Set();
            while (groupPermissions.size < numPermissions) {
                const resourceId = Math.floor(Math.random() * CONFIG.resources.perTenant) + 1;
                const action = CONFIG.permissions.actions[Math.floor(Math.random() * CONFIG.permissions.actions.length)];
                groupPermissions.add(`${resourceId}:${action}`);
            }
            
            for (const permission of groupPermissions) {
                const [resourceId, action] = permission.split(':');
                try {
                    await executeSingleInsert(pool, 'casbin_rule', ['ptype', 'v0', 'v1', 'v2', 'v3'], [
                        'p',
                        `${CONFIG.groups.prefix}${groupId}`,
                        `${CONFIG.resources.prefix}${resourceId}`,
                        action,
                        `${CONFIG.tenants.prefix}${tenantId}`
                    ]);
                    stats.permissions++;
                    insertedRecords++;
                } catch (error) {
                    if (!error.message.includes('already exists')) {
                        stats.errors.push(`Failed to add permission for group${groupId} on resource${resourceId}:${action} in tenant ${tenantId}: ${error.message}`);
                        failedRecords++;
                    }
                }
                totalRecords++;
            }
        }
        
        stats.tenants++;
        logProgress(`✅ Completed tenant ${tenantId} (${stats.tenants}/${CONFIG.tenants.count})`);
        
    } catch (error) {
        stats.errors.push(`Failed to process tenant ${tenantId}: ${error.message}`);
        failedRecords++;
        totalRecords++;
        console.error(`❌ Tenant ${tenantId} failed:`, error.message);
    }
};

// Process a batch of tenants
const processBatch = async (pool, startTenantId, count) => {
    stats.batches++;
    logProgress(`Processing batch ${stats.batches}: tenants ${startTenantId}-${startTenantId + count - 1}`);
    
    for (let i = 0; i < count; i++) {
        const tenantId = startTenantId + i;
        await processTenant(pool, tenantId);
        
        // Small delay between tenants
        if (i < count - 1) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    
    logProgress(`✅ Completed batch ${stats.batches}`);
};

// Main ingestion function
const runDbIngestion = async () => {
    console.log('🚀 Starting Simple Database Ingestion (Individual Inserts)');
    console.log('='.repeat(80));
    console.log(`📊 Configuration:`);
    console.log(`   Tenants: ${CONFIG.tenants.count.toLocaleString()}`);
    console.log(`   Users per tenant: ${CONFIG.users.perTenant}`);
    console.log(`   Resources per tenant: ${CONFIG.resources.perTenant}`);
    console.log(`   Groups per tenant: ${CONFIG.groups.perTenant}`);
    console.log(`   Batch size: ${CONFIG.batchSize}`);
    console.log('='.repeat(80));
    
    startTime = Date.now();
    let pool;
    
    try {
        // Create connection pool
        pool = createConnectionPool();
        console.log('✅ Database connection established');
        
        // Process tenants in batches
        for (let i = 0; i < CONFIG.tenants.count; i += CONFIG.batchSize) {
            const batchSize = Math.min(CONFIG.batchSize, CONFIG.tenants.count - i);
            const startTenantId = CONFIG.tenants.startId + i;
            
            await processBatch(pool, startTenantId, batchSize);
            
            // Progress update every 10 batches
            if (stats.batches % 10 === 0) {
                const progress = ((stats.tenants / CONFIG.tenants.count) * 100).toFixed(2);
                console.log(`📈 Overall Progress: ${stats.tenants}/${CONFIG.tenants.count} (${progress}%)`);
            }
        }
        
        // Final summary
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const successRate = ((insertedRecords / totalRecords) * 100).toFixed(2);
        const rate = (insertedRecords / totalTime).toFixed(2);
        
        console.log('\n' + '='.repeat(80));
        console.log('🎉 DATABASE INGESTION COMPLETED!');
        console.log('='.repeat(80));
        console.log(`⏱️  Total Time: ${totalTime} seconds`);
        console.log(`📊 Total Records: ${totalRecords.toLocaleString()}`);
        console.log(`✅ Inserted Records: ${insertedRecords.toLocaleString()}`);
        console.log(`❌ Failed Records: ${failedRecords.toLocaleString()}`);
        console.log(`📈 Success Rate: ${successRate}%`);
        console.log(`⚡ Insert Rate: ${rate} records/sec`);
        console.log(`🏢 Tenants Processed: ${stats.tenants.toLocaleString()}`);
        console.log(`👥 Groups Created: ${stats.groups.toLocaleString()}`);
        console.log(`👤 User Assignments: ${stats.userAssignments.toLocaleString()}`);
        console.log(`🔐 Permissions Added: ${stats.permissions.toLocaleString()}`);
        console.log(`📦 Batches Completed: ${stats.batches}`);
        
        if (stats.errors.length > 0) {
            console.log(`\n⚠️  Errors (${stats.errors.length}):`);
            stats.errors.slice(0, 10).forEach(error => console.log(`   - ${error}`));
            if (stats.errors.length > 10) {
                console.log(`   ... and ${stats.errors.length - 10} more errors`);
            }
        }
        
        console.log('\n🚀 Ready for performance testing!');
        
    } catch (error) {
        console.error('❌ Database ingestion failed:', error.message);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.end();
        }
    }
};

// Run if called directly
if (require.main === module) {
    runDbIngestion().catch(error => {
        console.error('Fatal error during database ingestion:', error);
        process.exit(1);
    });
} 