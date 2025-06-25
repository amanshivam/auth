const mysql = require('mysql2/promise');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration - easily configurable
const CONFIG = {
    // Database configuration
    database: {
        user: 'casbin',
        password: 'casbin1234',
        database: 'casbin_db',
        dialect: 'mysql',
        host: 'localhost',
        connectionLimit: 10,           // Reduced from 20 to prevent overload
        acquireTimeout: 60000,
        timeout: 60000,
        maxIdle: 60000,               // Keep connections alive longer
        idleTimeout: 60000,           // Idle timeout
        queueLimit: 0,                // No limit on queue
        enableKeepAlive: true,        // Enable keep-alive
        keepAliveInitialDelay: 0      // Start keep-alive immediately
    },
    
    // Test data configuration
    tenants: {
        count: 100000,           // Number of tenants to create
        startId: 1,             // Starting tenant ID
        prefix: 'tenantid'      // Tenant ID prefix
    },
    
    users: {
        perTenant: 50,          // Users per tenant
        prefix: 'user'          // User ID prefix
    },
    
    resources: {
        perTenant: 50,          // Resources per tenant
        prefix: 'resourceid'    // Resource ID prefix
    },
    
    groups: {
        perTenant: 20,          // Groups per tenant
        prefix: 'group'         // Group ID prefix
    },
    
    permissions: {
        perGroup: { min: 5, max: 15 },  // Random permissions per group
        actions: ['create', 'read', 'update', 'delete', 'share']
    },
    
    assignments: {
        perUser: { min: 1, max: 3 }     // Random groups per user
    },
    
    // Processing configuration
    batchSize: 10,              // Much smaller batches to avoid overload
    insertBatchSize: 100,       // Smaller insert batches
    showProgress: true          // Show progress updates
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
    users: 0,
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

// Helper function to execute batch insert with retry
const executeBatchInsert = async (pool, table, columns, values) => {
    if (values.length === 0) return 0;
    
    // Split into smaller chunks to avoid packet size issues
    const chunkSize = 100; // Much smaller chunks
    let totalInserted = 0;
    
    for (let i = 0; i < values.length; i += chunkSize) {
        const chunk = values.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
        const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;
        
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const flattenedValues = chunk.flat();
                const [result] = await pool.execute(query, flattenedValues);
                totalInserted += result.affectedRows;
                break; // Success, exit retry loop
            } catch (error) {
                if (error.code === 'ER_DUP_ENTRY') {
                    // Ignore duplicate key errors
                    break;
                }
                
                if (error.code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR' || 
                    error.message.includes('Malformed communication packet') ||
                    error.message.includes('Connection lost') ||
                    error.message.includes('ECONNRESET')) {
                    
                    if (attempt < maxRetries) {
                        console.log(`⚠️  Connection error (attempt ${attempt}/${maxRetries}), retrying...`);
                        await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Longer backoff
                        continue;
                    }
                }
                
                throw error;
            }
        }
    }
    
    return totalInserted;
};

// Generate tenant data
const generateTenantData = (startId, count) => {
    const tenants = [];
    for (let i = 0; i < count; i++) {
        const tenantId = startId + i;
        tenants.push([`${CONFIG.tenants.prefix}${tenantId}`]);
    }
    return tenants;
};

// Generate group data
const generateGroupData = (startTenantId, count) => {
    const groups = [];
    for (let tenantOffset = 0; tenantOffset < count; tenantOffset++) {
        const tenantId = startTenantId + tenantOffset;
        for (let groupId = 1; groupId <= CONFIG.groups.perTenant; groupId++) {
            groups.push([
                `${CONFIG.groups.prefix}${groupId}`,
                `${CONFIG.groups.prefix}${groupId}`,
                `${CONFIG.tenants.prefix}${tenantId}`
            ]);
        }
    }
    return groups;
};

// Generate user assignment data
const generateUserAssignmentData = (startTenantId, count) => {
    const assignments = [];
    for (let tenantOffset = 0; tenantOffset < count; tenantOffset++) {
        const tenantId = startTenantId + tenantOffset;
        for (let userId = 1; userId <= CONFIG.users.perTenant; userId++) {
            // Assign user to 1-3 random groups
            const numGroups = Math.floor(Math.random() * 
                (CONFIG.assignments.perUser.max - CONFIG.assignments.perUser.min + 1)) + 
                CONFIG.assignments.perUser.min;
            
            const selectedGroups = new Set();
            while (selectedGroups.size < numGroups) {
                const groupId = Math.floor(Math.random() * CONFIG.groups.perTenant) + 1;
                selectedGroups.add(groupId);
            }
            
            for (const groupId of selectedGroups) {
                assignments.push([
                    `${CONFIG.users.prefix}${userId}`,
                    `${CONFIG.groups.prefix}${groupId}`,
                    `${CONFIG.tenants.prefix}${tenantId}`
                ]);
            }
        }
    }
    return assignments;
};

// Generate permission data
const generatePermissionData = (startTenantId, count) => {
    const permissions = [];
    for (let tenantOffset = 0; tenantOffset < count; tenantOffset++) {
        const tenantId = startTenantId + tenantOffset;
        for (let groupId = 1; groupId <= CONFIG.groups.perTenant; groupId++) {
            // Add random permissions per group
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
                permissions.push([
                    `${CONFIG.groups.prefix}${groupId}`,
                    `${CONFIG.resources.prefix}${resourceId}`,
                    action,
                    `${CONFIG.tenants.prefix}${tenantId}`
                ]);
            }
        }
    }
    return permissions;
};

// Process a batch of tenants
const processBatch = async (pool, startTenantId, count) => {
    stats.batches++;
    logProgress(`Processing batch ${stats.batches}: tenants ${startTenantId}-${startTenantId + count - 1}`);
    
    try {
        // Generate data for this batch
        const groups = generateGroupData(startTenantId, count);
        const userAssignments = generateUserAssignmentData(startTenantId, count);
        const permissions = generatePermissionData(startTenantId, count);
        
        // Insert groups
        if (groups.length > 0) {
            const inserted = await executeBatchInsert(pool, 'casbin_rule', ['ptype', 'v0', 'v2'], groups);
            stats.groups += inserted;
            insertedRecords += inserted;
            totalRecords += groups.length;
        }
        
        // Insert user assignments
        if (userAssignments.length > 0) {
            const inserted = await executeBatchInsert(pool, 'casbin_rule', ['ptype', 'v0', 'v1', 'v2'], userAssignments);
            stats.userAssignments += inserted;
            insertedRecords += inserted;
            totalRecords += userAssignments.length;
        }
        
        // Insert permissions
        if (permissions.length > 0) {
            const inserted = await executeBatchInsert(pool, 'casbin_rule', ['ptype', 'v0', 'v1', 'v2', 'v3'], permissions);
            stats.permissions += inserted;
            insertedRecords += inserted;
            totalRecords += permissions.length;
        }
        
        stats.tenants += count;
        logProgress(`✅ Completed batch ${stats.batches}: ${count} tenants`);
        
    } catch (error) {
        stats.errors.push(`Batch ${stats.batches} failed: ${error.message}`);
        failedRecords += count;
        totalRecords += count;
        console.error(`❌ Batch ${stats.batches} failed:`, error.message);
    }
};

// Main ingestion function
const runDbIngestion = async () => {
    console.log('🚀 Starting Direct Database Ingestion');
    console.log('='.repeat(80));
    console.log(`📊 Configuration:`);
    console.log(`   Tenants: ${CONFIG.tenants.count.toLocaleString()}`);
    console.log(`   Users per tenant: ${CONFIG.users.perTenant}`);
    console.log(`   Resources per tenant: ${CONFIG.resources.perTenant}`);
    console.log(`   Groups per tenant: ${CONFIG.groups.perTenant}`);
    console.log(`   Batch size: ${CONFIG.batchSize}`);
    console.log(`   Insert batch size: ${CONFIG.insertBatchSize}`);
    console.log('='.repeat(80));
    
    startTime = Date.now();
    let pool;
    
    try {
        // Create connection pool
        pool = createConnectionPool();
        console.log('✅ Database connection established');
        
        // Process tenants in batches
        const totalBatches = Math.ceil(CONFIG.tenants.count / CONFIG.batchSize);
        
        for (let i = 0; i < CONFIG.tenants.count; i += CONFIG.batchSize) {
            const batchSize = Math.min(CONFIG.batchSize, CONFIG.tenants.count - i);
            const startTenantId = CONFIG.tenants.startId + i;
            
            await processBatch(pool, startTenantId, batchSize);
            
            // Add small delay between batches to prevent overload
            if (i + CONFIG.batchSize < CONFIG.tenants.count) {
                await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
            }
            
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

// Export for use in other modules
module.exports = { runDbIngestion, CONFIG };

// Run if called directly
if (require.main === module) {
    runDbIngestion().catch(error => {
        console.error('Fatal error during database ingestion:', error);
        process.exit(1);
    });
} 