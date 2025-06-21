const axios = require('axios');

// Test configuration
const SERVER1_URL = 'http://localhost:3000';
const SERVER2_URL = 'http://localhost:3002';

async function testWebhookSystem() {
    console.log('🧪 Testing Webhook-Based Cache Consistency System\n');
    
    try {
        // Step 1: Check server health
        console.log('📋 Step 1: Checking server health...');
        const health1 = await axios.get(`${SERVER1_URL}/health`);
        const health2 = await axios.get(`${SERVER2_URL}/health`);
        
        console.log(`✅ Server 1: ${health1.data.serverId} (${health1.data.port})`);
        console.log(`✅ Server 2: ${health2.data.serverId} (${health2.data.port})\n`);
        
        // Step 2: Check server configuration
        console.log('📋 Step 2: Checking server configuration...');
        const servers1 = await axios.get(`${SERVER1_URL}/servers`);
        const servers2 = await axios.get(`${SERVER2_URL}/servers`);
        
        console.log(`Server 1 other servers: ${servers1.data.otherServers.join(', ') || 'none'}`);
        console.log(`Server 2 other servers: ${servers2.data.otherServers.join(', ') || 'none'}\n`);
        
        // Step 3: Create a group on Server 1
        console.log('📋 Step 3: Creating group on Server 1...');
        const createGroupResponse = await axios.post(`${SERVER1_URL}/create-group`, {
            groupName: 'test-group',
            tenant: 'test-tenant'
        });
        console.log(`✅ Group created: ${createGroupResponse.data.message}\n`);
        
        // Step 4: Add permission on Server 1
        console.log('📋 Step 4: Adding permission on Server 1...');
        const addPermissionResponse = await axios.post(`${SERVER1_URL}/add-permission`, {
            role: 'test-group',
            obj: 'test-resource',
            act: 'read',
            tenant: 'test-tenant'
        });
        console.log(`✅ Permission added: ${addPermissionResponse.data.success}\n`);
        
        // Step 5: Assign user on Server 1
        console.log('📋 Step 5: Assigning user on Server 1...');
        const assignUserResponse = await axios.post(`${SERVER1_URL}/assign-user`, {
            userId: 'test-user',
            groupName: 'test-group',
            tenant: 'test-tenant'
        });
        console.log(`✅ User assigned: ${assignUserResponse.data.success}\n`);
        
        // Step 6: Check access on Server 2 (should work immediately due to webhooks)
        console.log('📋 Step 6: Checking access on Server 2 (should work immediately)...');
        const checkAccessResponse = await axios.post(`${SERVER2_URL}/check-access`, {
            userId: 'test-user',
            obj: 'test-resource',
            act: 'read',
            tenant: 'test-tenant'
        });
        console.log(`✅ Access check result: ${checkAccessResponse.data.allowed}\n`);
        
        // Step 7: Check cache stats
        console.log('📋 Step 7: Checking cache stats...');
        const cache1 = await axios.get(`${SERVER1_URL}/cache-stats`);
        const cache2 = await axios.get(`${SERVER2_URL}/cache-stats`);
        
        console.log(`Server 1 cache: ${cache1.data.size} tenants cached`);
        console.log(`Server 2 cache: ${cache2.data.size} tenants cached\n`);
        
        console.log('🎉 Webhook system test completed successfully!');
        console.log('💡 The access check on Server 2 should return true immediately after the assignment on Server 1.');
        
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
        console.log('\n💡 Make sure both servers are running:');
        console.log(`   Server 1: node index.js 3000`);
        console.log(`   Server 2: node index.js 3001`);
        console.log('\n💡 Configure OTHER_SERVERS environment variable:');
        console.log(`   Server 1: OTHER_SERVERS=http://localhost:3001 node index.js 3000`);
        console.log(`   Server 2: OTHER_SERVERS=http://localhost:3000 node index.js 3001`);
    }
}

// Run the test
testWebhookSystem(); 