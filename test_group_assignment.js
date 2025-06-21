const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testGroupAssignment() {
    try {
        console.log('Testing group creation and user assignment...\n');
        
        // Step 1: Create a group
        console.log('1. Creating group "superadmin"...');
        const createGroupResponse = await axios.post(`${BASE_URL}/create-group`, {
            groupName: 'superadmin',
            role: 'superadmin',
            tenant: 'tenant1'
        });
        console.log('Group creation response:', createGroupResponse.data);
        
        // Step 2: Assign user to group
        console.log('\n2. Assigning user "aman" to group "superadmin"...');
        const assignUserResponse = await axios.post(`${BASE_URL}/assign-user`, {
            userId: 'aman',
            groupName: 'superadmin',
            tenant: 'tenant1'
        });
        console.log('User assignment response:', assignUserResponse.data);
        
        // Step 3: Add permissions to the group
        console.log('\n3. Adding permissions to group "superadmin"...');
        const addPermissionResponse = await axios.post(`${BASE_URL}/add-permission`, {
            role: 'superadmin',
            obj: 'resource1',
            act: 'read',
            tenant: 'tenant1'
        });
        console.log('Permission addition response:', addPermissionResponse.data);
        
        // Step 4: Check access
        console.log('\n4. Checking access for user "aman"...');
        const checkAccessResponse = await axios.post(`${BASE_URL}/check-access`, {
            userId: 'aman',
            obj: 'resource1',
            act: 'read',
            tenant: 'tenant1'
        });
        console.log('Access check response:', checkAccessResponse.data);
        
        // Step 5: Get user policies
        console.log('\n5. Getting policies for user "aman"...');
        const getUserPoliciesResponse = await axios.post(`${BASE_URL}/getUserPolicies`, {
            userId: 'aman',
            tenant: 'tenant1'
        });
        console.log('User policies response:', getUserPoliciesResponse.data);
        
        console.log('\n✅ Test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

testGroupAssignment(); 