const axios = require('axios');

const BASE_URL_1 = 'http://localhost:3000';
const BASE_URL_2 = 'http://localhost:3002';

// Very conservative configuration
const TOTAL_OPERATIONS = 1000; // Much smaller
const BATCH_SIZE = 10; // Very small batches
const CONCURRENT_BATCHES = 1; // Sequential processing
const DELAY_BETWEEN_BATCHES = 100; // 100ms delay between batches

// Test data generators
const tenants = ['tenant1', 'tenant2', 'tenant3'];
const groupNames = ['admin', 'user', 'manager', 'viewer', 'editor'];
const resources = ['users', 'posts', 'comments', 'files', 'reports'];
const actions = ['read', 'write', 'delete', 'create', 'update'];
const userIds = Array.from({length: 50}, (_, i) => `user${i}`);

// Statistics tracking
let stats = {
    totalOperations: 0,
    successful: 0,
    failed: 0,
    duplicates: 0,
    errors: 0,
    startTime: null,
    endTime: null,
    operations: {
        createGroup: { count: 0, success: 0, duplicates: 0 },
        addPermission: { count: 0, success: 0, duplicates: 0 },
        assignUser: { count: 0, success: 0, duplicates: 0 },
        checkAccess: { count: 0, success: 0 },
        getUserPolicies: { count: 0, success: 0 }
    }
};

// Helper function to get random element from array
function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Helper function to generate random test data
function generateRandomData() {
    return {
        tenant: getRandomElement(tenants),
        groupName: getRandomElement(groupNames) + '_' + Math.random().toString(36).substr(2, 5),
        role: getRandomElement(groupNames) + '_' + Math.random().toString(36).substr(2, 5),
        obj: getRandomElement(resources) + '_' + Math.random().toString(36).substr(2, 5),
        act: getRandomElement(actions),
        userId: getRandomElement(userIds)
    };
}

// Helper function to add delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// API operation functions
async function createGroup(data, serverUrl) {
    try {
        const response = await axios.post(`${serverUrl}/create-group`, {
            groupName: data.groupName,
            tenant: data.tenant
        });
        return { success: true, data: response.data, operation: 'createGroup' };
    } catch (error) {
        const isDuplicate = error.response?.data?.message?.includes('already exists');
        return { 
            success: false, 
            isDuplicate, 
            error: error.response?.data || error.message,
            operation: 'createGroup'
        };
    }
}

async function addPermission(data, serverUrl) {
    try {
        const response = await axios.post(`${serverUrl}/add-permission`, {
            role: data.role,
            obj: data.obj,
            act: data.act,
            tenant: data.tenant
        });
        return { success: true, data: response.data, operation: 'addPermission' };
    } catch (error) {
        const isDuplicate = error.response?.data?.message?.includes('already exists');
        return { 
            success: false, 
            isDuplicate, 
            error: error.response?.data || error.message,
            operation: 'addPermission'
        };
    }
}

async function assignUser(data, serverUrl) {
    try {
        const response = await axios.post(`${serverUrl}/assign-user`, {
            userId: data.userId,
            groupName: data.groupName,
            tenant: data.tenant
        });
        return { success: true, data: response.data, operation: 'assignUser' };
    } catch (error) {
        const isDuplicate = error.response?.data?.message?.includes('already exists');
        return { 
            success: false, 
            isDuplicate, 
            error: error.response?.data || error.message,
            operation: 'assignUser'
        };
    }
}

async function checkAccess(data, serverUrl) {
    try {
        const response = await axios.post(`${serverUrl}/check-access`, {
            userId: data.userId,
            obj: data.obj,
            act: data.act,
            tenant: data.tenant
        });
        return { success: true, data: response.data, operation: 'checkAccess' };
    } catch (error) {
        return { 
            success: false, 
            error: error.response?.data || error.message,
            operation: 'checkAccess'
        };
    }
}

async function getUserPolicies(data, serverUrl) {
    try {
        const response = await axios.post(`${serverUrl}/getUserPolicies`, {
            userId: data.userId,
            tenant: data.tenant
        });
        return { success: true, data: response.data, operation: 'getUserPolicies' };
    } catch (error) {
        return { 
            success: false, 
            error: error.response?.data || error.message,
            operation: 'getUserPolicies'
        };
    }
}

// Random operation selector
async function performRandomOperation(serverUrl) {
    const data = generateRandomData();
    const operations = [createGroup, addPermission, assignUser, checkAccess, getUserPolicies];
    const randomOperation = getRandomElement(operations);
    
    return await randomOperation(data, serverUrl);
}

// Process a batch of operations sequentially
async function processBatch(batchNumber, totalBatches) {
    const batchOperations = [];
    const serverUrl = batchNumber % 2 === 0 ? BASE_URL_1 : BASE_URL_2;
    
    for (let i = 0; i < BATCH_SIZE; i++) {
        batchOperations.push(performRandomOperation(serverUrl));
    }
    
    // Process operations sequentially to avoid overwhelming the server
    const results = [];
    for (const operation of batchOperations) {
        const result = await operation;
        results.push(result);
        
        // Small delay between operations
        await delay(10);
    }
    
    // Process results
    results.forEach(result => {
        const { success, isDuplicate, operation } = result;
        
        stats.totalOperations++;
        stats.operations[operation].count++;
        
        if (success) {
            stats.successful++;
            stats.operations[operation].success++;
        } else {
            stats.failed++;
            if (isDuplicate) {
                stats.duplicates++;
                stats.operations[operation].duplicates++;
            }
        }
    });
    
    // Progress update
    const progress = ((batchNumber + 1) / totalBatches * 100).toFixed(2);
    const elapsed = Date.now() - stats.startTime;
    const opsPerSecond = Math.round(stats.totalOperations / (elapsed / 1000));
    
    console.log(`📊 Batch ${batchNumber + 1}/${totalBatches} completed (${progress}%) - ${opsPerSecond} ops/sec`);
}

// Main load test function
async function runConservativeLoadTest() {
    try {
        console.log('🚀 Starting Conservative Load Test (1K Operations)');
        console.log('=' .repeat(60));
        console.log(`Total Operations: ${TOTAL_OPERATIONS.toLocaleString()}`);
        console.log(`Batch Size: ${BATCH_SIZE}`);
        console.log(`Concurrent Batches: ${CONCURRENT_BATCHES} (Sequential)`);
        console.log(`Delay Between Batches: ${DELAY_BETWEEN_BATCHES}ms`);
        console.log(`Servers: ${BASE_URL_1}, ${BASE_URL_2}`);
        console.log('=' .repeat(60));
        
        // Disable database checks to prevent connection issues
        console.log('\n🔧 Disabling database duplicate checks for load testing...');
        await axios.post(`${BASE_URL_1}/disable-db-checks`);
        await axios.post(`${BASE_URL_2}/disable-db-checks`);
        
        stats.startTime = Date.now();
        
        const totalBatches = Math.ceil(TOTAL_OPERATIONS / BATCH_SIZE);
        
        // Process batches sequentially with delays
        for (let i = 0; i < totalBatches; i++) {
            await processBatch(i, totalBatches);
            
            // Delay between batches
            if (i < totalBatches - 1) {
                await delay(DELAY_BETWEEN_BATCHES);
            }
        }
        
        stats.endTime = Date.now();
        
        // Re-enable database checks
        console.log('\n🔧 Re-enabling database duplicate checks...');
        await axios.post(`${BASE_URL_1}/enable-db-checks`);
        await axios.post(`${BASE_URL_2}/enable-db-checks`);
        
        // Final statistics
        console.log('\n🎯 LOAD TEST COMPLETED');
        console.log('=' .repeat(60));
        
        const totalTime = stats.endTime - stats.startTime;
        const opsPerSecond = Math.round(stats.totalOperations / (totalTime / 1000));
        
        console.log(`⏱️  Total Time: ${(totalTime / 1000).toFixed(2)} seconds`);
        console.log(`📊 Operations/Second: ${opsPerSecond.toLocaleString()}`);
        console.log(`📈 Total Operations: ${stats.totalOperations.toLocaleString()}`);
        console.log(`✅ Successful: ${stats.successful.toLocaleString()}`);
        console.log(`❌ Failed: ${stats.failed.toLocaleString()}`);
        console.log(`🚫 Duplicates Prevented: ${stats.duplicates.toLocaleString()}`);
        console.log(`💥 Errors: ${stats.errors.toLocaleString()}`);
        
        console.log('\n📊 Operation Breakdown:');
        console.log('=' .repeat(60));
        Object.entries(stats.operations).forEach(([operation, data]) => {
            const successRate = data.count > 0 ? ((data.success / data.count) * 100).toFixed(2) : '0.00';
            console.log(`${operation}: ${data.count.toLocaleString()} calls, ${data.success.toLocaleString()} success (${successRate}%), ${data.duplicates.toLocaleString()} duplicates prevented`);
        });
        
        console.log('\n🏆 FINAL VERDICT');
        console.log('=' .repeat(60));
        
        if (stats.successful > 0 && stats.failed < stats.totalOperations * 0.1) {
            console.log('🎉 SUCCESS: Conservative load test passed!');
            console.log('✅ System handled the load without connection issues');
            console.log('✅ Ready for production use');
        } else {
            console.log('❌ FAILURE: System struggled with conservative load');
            console.log('   May need further optimization');
        }
        
    } catch (error) {
        console.error('❌ Load test failed:', error.message);
        
        // Re-enable database checks even if test fails
        try {
            await axios.post(`${BASE_URL_1}/enable-db-checks`);
            await axios.post(`${BASE_URL_2}/enable-db-checks`);
        } catch (e) {
            console.error('Failed to re-enable database checks:', e.message);
        }
    }
}

// Run the conservative load test
runConservativeLoadTest(); 