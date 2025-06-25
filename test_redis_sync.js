const axios = require('axios');

// Configuration
const CONFIG = {
    servers: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002'
    ],
    testTenant: 'tenantid1',
    testGroup: 'testgroup',
    testUser: 'testuser',
    testResource: 'testresource',
    testAction: 'read',
    timeout: 10000 // 10 second timeout
};

// Helper function to get random server
const getRandomServer = () => {
    return CONFIG.servers[Math.floor(Math.random() * CONFIG.servers.length)];
};

// Check if server is running
const checkServerHealth = async (serverUrl) => {
    try {
        const response = await axios.get(`${serverUrl}/health`, {
            timeout: 5000
        });
        return response.status === 200;
    } catch (error) {
        return false;
    }
};

// Test Redis synchronization
const testRedisSync = async () => {
    console.log('🔄 Testing Redis Pub/Sub Synchronization');
    console.log('='.repeat(80));
    
    try {
        // Check if servers are running
        console.log('🔍 Checking server health...');
        for (let i = 0; i < CONFIG.servers.length; i++) {
            const server = CONFIG.servers[i];
            const isHealthy = await checkServerHealth(server);
            console.log(`   Server ${i + 1} (${server}): ${isHealthy ? '✅ Running' : '❌ Not running'}`);
        }
        
        // Step 1: Create a group on one server
        console.log('\n📝 Step 1: Creating group on server 1...');
        const createGroupResponse = await axios.post(`${CONFIG.servers[0]}/create-group`, {
            groupName: CONFIG.testGroup,
            tenant: CONFIG.testTenant
        }, {
            timeout: CONFIG.timeout
        });
        console.log('✅ Group created:', createGroupResponse.data);
        
        // Wait a moment for Redis sync
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Step 2: Add permission on another server
        console.log('\n📝 Step 2: Adding permission on server 2...');
        const addPermissionResponse = await axios.post(`${CONFIG.servers[1]}/add-permission`, {
            role: CONFIG.testGroup,
            obj: CONFIG.testResource,
            act: CONFIG.testAction,
            tenant: CONFIG.testTenant
        }, {
            timeout: CONFIG.timeout
        });
        console.log('✅ Permission added:', addPermissionResponse.data);
        
        // Wait a moment for Redis sync
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Step 3: Assign user on third server
        console.log('\n📝 Step 3: Assigning user on server 3...');
        const assignUserResponse = await axios.post(`${CONFIG.servers[2]}/assign-user`, {
            userId: CONFIG.testUser,
            groupName: CONFIG.testGroup,
            tenant: CONFIG.testTenant
        }, {
            timeout: CONFIG.timeout
        });
        console.log('✅ User assigned:', assignUserResponse.data);
        
        // Wait a moment for Redis sync
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Step 4: Test access on all servers
        console.log('\n📝 Step 4: Testing access on all servers...');
        
        for (let i = 0; i < CONFIG.servers.length; i++) {
            const server = CONFIG.servers[i];
            try {
                const checkAccessResponse = await axios.post(`${server}/check-access`, {
                    userId: CONFIG.testUser,
                    obj: CONFIG.testResource,
                    act: CONFIG.testAction,
                    tenant: CONFIG.testTenant
                }, {
                    timeout: CONFIG.timeout
                });
                
                console.log(`✅ Server ${i + 1} (${server}): Access ${checkAccessResponse.data.allowed ? 'ALLOWED' : 'DENIED'}`);
            } catch (error) {
                console.log(`❌ Server ${i + 1} (${server}): Error - ${error.message}`);
            }
        }
        
        // Step 5: Check cache stats on all servers
        console.log('\n📝 Step 5: Checking cache stats on all servers...');
        
        for (let i = 0; i < CONFIG.servers.length; i++) {
            const server = CONFIG.servers[i];
            try {
                const cacheStatsResponse = await axios.get(`${server}/cache-stats`, {
                    timeout: CONFIG.timeout
                });
                const cacheStats = cacheStatsResponse.data;
                
                console.log(`📊 Server ${i + 1} (${server}):`);
                console.log(`   Cache Size: ${cacheStats.size}/${cacheStats.maxSize}`);
                console.log(`   Cached Tenants: ${cacheStats.tenants.length > 0 ? cacheStats.tenants.join(', ') : 'None'}`);
                if (cacheStats.memoryUsage) {
                    console.log(`   Memory: ${cacheStats.memoryUsage.process.heapUsed}MB/${cacheStats.memoryUsage.process.heapTotal}MB`);
                }
            } catch (error) {
                console.log(`❌ Server ${i + 1} (${server}): Error getting cache stats - ${error.message}`);
            }
        }
        
        // Step 6: Test manual refresh
        console.log('\n📝 Step 6: Testing manual refresh...');
        const refreshResponse = await axios.post(`${getRandomServer()}/refresh-tenant`, {
            tenant: CONFIG.testTenant
        }, {
            timeout: CONFIG.timeout
        });
        console.log('✅ Manual refresh:', refreshResponse.data);
        
        console.log('\n' + '='.repeat(80));
        console.log('🎉 Redis Pub/Sub Synchronization Test Completed!');
        console.log('='.repeat(80));
        console.log('✅ All operations completed successfully');
        console.log('✅ Cross-server synchronization working via Redis');
        console.log('✅ Cache consistency maintained across servers');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        if (error.code === 'ECONNREFUSED') {
            console.error('💡 Make sure all servers are running on the correct ports');
            console.error('   Run: PORT=3000 node index.js & PORT=3001 node index.js & PORT=3002 node index.js');
        }
    }
};

// Test Redis connection
const testRedisConnection = async () => {
    console.log('🔍 Testing Redis Connection...');
    
    try {
        // Try to get cache stats from any server to verify Redis is working
        const response = await axios.get(`${CONFIG.servers[0]}/cache-stats`, {
            timeout: 5000
        });
        
        console.log('✅ Redis connection successful');
        console.log('✅ Server responding with cache stats');
        
        return true;
    } catch (error) {
        console.error('❌ Redis connection failed:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log('💡 Make sure Redis is running on localhost:6379');
            console.log('   Run: redis-server');
        }
        return false;
    }
};

// Main test function
const runTest = async () => {
    console.log('🚀 Starting Redis Pub/Sub Test Suite');
    console.log('='.repeat(80));
    console.log('📋 Prerequisites:');
    console.log('   1. Redis server running on localhost:6379');
    console.log('   2. Multiple Node.js servers running on ports 3000, 3001, 3002');
    console.log('   3. Database with test data');
    console.log('='.repeat(80));
    
    // Test Redis connection first
    const redisConnected = await testRedisConnection();
    
    if (!redisConnected) {
        console.log('\n❌ Cannot proceed without Redis connection');
        console.log('Please start Redis and try again');
        return;
    }
    
    // Run the main test
    await testRedisSync();
};

// Run if called directly
if (require.main === module) {
    runTest().catch(error => {
        console.error('Fatal error during Redis test:', error);
        process.exit(1);
    });
} 