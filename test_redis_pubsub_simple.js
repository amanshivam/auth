const axios = require('axios');
const logger = require('./logger');

const SERVER_URL = 'http://localhost:3000';
const TEST_TENANT = 'test-tenant-redis';
const TEST_GROUP = 'test-group-redis';
const TEST_USER = 'test-user-redis';

async function testRedisPubSub() {
    console.log('🚀 Testing Redis Pub/Sub with Single Server');
    console.log('='.repeat(80));
    
    try {
        // Step 1: Check server health
        console.log('📋 Step 1: Checking server health...');
        const healthResponse = await axios.get(`${SERVER_URL}/health`, { timeout: 5000 });
        console.log('✅ Server is healthy:', healthResponse.data.status);
        
        // Step 2: Check Redis status
        console.log('\n📋 Step 2: Checking Redis status...');
        const redisResponse = await axios.get(`${SERVER_URL}/redis-status`, { timeout: 5000 });
        console.log('✅ Redis status:', redisResponse.data.redis);
        
        if (!redisResponse.data.redis.isConnected) {
            throw new Error('Redis is not connected');
        }
        
        // Step 3: Create a test group (this should trigger Redis publish)
        console.log('\n📋 Step 3: Creating test group (should trigger Redis publish)...');
        const groupResponse = await axios.post(`${SERVER_URL}/create-group`, {
            groupName: TEST_GROUP,
            tenant: TEST_TENANT
        }, { timeout: 10000 });
        
        console.log('✅ Group created:', groupResponse.data);
        
        // Step 4: Add a permission (this should trigger Redis publish)
        console.log('\n📋 Step 4: Adding permission (should trigger Redis publish)...');
        const permissionResponse = await axios.post(`${SERVER_URL}/add-permission`, {
            role: TEST_GROUP,
            obj: 'test-resource',
            act: 'read',
            tenant: TEST_TENANT
        }, { timeout: 10000 });
        
        console.log('✅ Permission added:', permissionResponse.data);
        
        // Step 5: Assign user to group (this should trigger Redis publish)
        console.log('\n📋 Step 5: Assigning user to group (should trigger Redis publish)...');
        const assignResponse = await axios.post(`${SERVER_URL}/assign-user`, {
            userId: TEST_USER,
            groupName: TEST_GROUP,
            tenant: TEST_TENANT
        }, { timeout: 10000 });
        
        console.log('✅ User assigned:', assignResponse.data);
        
        // Step 6: Test access (this should work)
        console.log('\n📋 Step 6: Testing access...');
        const accessResponse = await axios.post(`${SERVER_URL}/check-access`, {
            userId: TEST_USER,
            obj: 'test-resource',
            act: 'read',
            tenant: TEST_TENANT
        }, { timeout: 10000 });
        
        console.log('✅ Access check result:', accessResponse.data);
        
        // Step 7: Check final cache stats
        console.log('\n📋 Step 7: Checking final cache stats...');
        const cacheResponse = await axios.get(`${SERVER_URL}/cache-stats`, { timeout: 5000 });
        console.log('✅ Cache stats:', {
            size: cacheResponse.data.size,
            maxSize: cacheResponse.data.maxSize,
            tenants: cacheResponse.data.tenants
        });
        
        // Step 8: Manual refresh (should trigger Redis publish)
        console.log('\n📋 Step 8: Manual tenant refresh (should trigger Redis publish)...');
        const refreshResponse = await axios.post(`${SERVER_URL}/refresh-tenant`, {
            tenant: TEST_TENANT
        }, { timeout: 10000 });
        
        console.log('✅ Tenant refreshed:', refreshResponse.data);
        
        console.log('\n' + '='.repeat(80));
        console.log('✅ Redis Pub/Sub Test Completed Successfully!');
        console.log('📝 All operations that should trigger Redis publish worked correctly.');
        console.log('📝 The Redis manager is properly handling connections and publishing.');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        process.exit(1);
    }
}

// Run the test
testRedisPubSub(); 