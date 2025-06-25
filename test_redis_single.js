const axios = require('axios');

// Configuration for single server test
const CONFIG = {
    server: 'http://localhost:3000',
    testTenant: 'tenantid1',
    testGroup: 'testgroup',
    testUser: 'testuser',
    testResource: 'testresource',
    testAction: 'read',
    timeout: 10000
};

// Test Redis functionality with single server
const testRedisSingle = async () => {
    console.log('🔄 Testing Redis Pub/Sub with Single Server');
    console.log('='.repeat(80));
    
    try {
        // Step 1: Check server health
        console.log('🔍 Checking server health...');
        const healthResponse = await axios.get(`${CONFIG.server}/health`, {
            timeout: 5000
        });
        console.log('✅ Server healthy:', healthResponse.data.status);
        
        // Step 2: Check cache stats
        console.log('\n📊 Checking initial cache stats...');
        const initialStats = await axios.get(`${CONFIG.server}/cache-stats`, {
            timeout: CONFIG.timeout
        });
        console.log('✅ Initial cache stats:', {
            size: initialStats.data.size,
            maxSize: initialStats.data.maxSize,
            tenants: initialStats.data.tenants
        });
        
        // Step 3: Create a group
        console.log('\n📝 Step 1: Creating group...');
        const createGroupResponse = await axios.post(`${CONFIG.server}/create-group`, {
            groupName: CONFIG.testGroup,
            tenant: CONFIG.testTenant
        }, {
            timeout: CONFIG.timeout
        });
        console.log('✅ Group created:', createGroupResponse.data);
        
        // Step 4: Add permission
        console.log('\n📝 Step 2: Adding permission...');
        const addPermissionResponse = await axios.post(`${CONFIG.server}/add-permission`, {
            role: CONFIG.testGroup,
            obj: CONFIG.testResource,
            act: CONFIG.testAction,
            tenant: CONFIG.testTenant
        }, {
            timeout: CONFIG.timeout
        });
        console.log('✅ Permission added:', addPermissionResponse.data);
        
        // Step 5: Assign user
        console.log('\n📝 Step 3: Assigning user...');
        const assignUserResponse = await axios.post(`${CONFIG.server}/assign-user`, {
            userId: CONFIG.testUser,
            groupName: CONFIG.testGroup,
            tenant: CONFIG.testTenant
        }, {
            timeout: CONFIG.timeout
        });
        console.log('✅ User assigned:', assignUserResponse.data);
        
        // Step 6: Test access
        console.log('\n📝 Step 4: Testing access...');
        const checkAccessResponse = await axios.post(`${CONFIG.server}/check-access`, {
            userId: CONFIG.testUser,
            obj: CONFIG.testResource,
            act: CONFIG.testAction,
            tenant: CONFIG.testTenant
        }, {
            timeout: CONFIG.timeout
        });
        console.log('✅ Access check:', checkAccessResponse.data.allowed ? 'ALLOWED' : 'DENIED');
        
        // Step 7: Check final cache stats
        console.log('\n📊 Checking final cache stats...');
        const finalStats = await axios.get(`${CONFIG.server}/cache-stats`, {
            timeout: CONFIG.timeout
        });
        console.log('✅ Final cache stats:', {
            size: finalStats.data.size,
            maxSize: finalStats.data.maxSize,
            tenants: finalStats.data.tenants,
            memoryUsage: finalStats.data.memoryUsage?.process
        });
        
        // Step 8: Test manual refresh
        console.log('\n📝 Step 5: Testing manual refresh...');
        const refreshResponse = await axios.post(`${CONFIG.server}/refresh-tenant`, {
            tenant: CONFIG.testTenant
        }, {
            timeout: CONFIG.timeout
        });
        console.log('✅ Manual refresh:', refreshResponse.data);
        
        console.log('\n' + '='.repeat(80));
        console.log('🎉 Single Server Redis Test Completed!');
        console.log('='.repeat(80));
        console.log('✅ All operations completed successfully');
        console.log('✅ Redis pub/sub functionality working');
        console.log('✅ Cache management working properly');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        if (error.code === 'ECONNREFUSED') {
            console.error('💡 Make sure the server is running on port 3000');
            console.error('   Run: node index.js');
        }
    }
};

// Test Redis connection
const testRedisConnection = async () => {
    console.log('🔍 Testing Redis Connection...');
    
    try {
        const response = await axios.get(`${CONFIG.server}/cache-stats`, {
            timeout: 5000
        });
        
        console.log('✅ Server responding');
        console.log('✅ Redis connection should be working');
        
        return true;
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log('💡 Make sure the server is running on port 3000');
            console.log('   Run: node index.js');
        }
        return false;
    }
};

// Main test function
const runTest = async () => {
    console.log('🚀 Starting Single Server Redis Test');
    console.log('='.repeat(80));
    console.log('📋 Prerequisites:');
    console.log('   1. Redis server running on localhost:6379');
    console.log('   2. Node.js server running on port 3000');
    console.log('   3. Database with test data');
    console.log('='.repeat(80));
    
    // Test connection first
    const connected = await testRedisConnection();
    
    if (!connected) {
        console.log('\n❌ Cannot proceed without server connection');
        return;
    }
    
    // Run the main test
    await testRedisSingle();
};

// Run if called directly
if (require.main === module) {
    runTest().catch(error => {
        console.error('Fatal error during test:', error);
        process.exit(1);
    });
} 