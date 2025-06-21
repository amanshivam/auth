const axios = require('axios');

const BASE_URL_1 = 'http://localhost:3000';
const BASE_URL_2 = 'http://localhost:3002';

async function testDuplicatePrevention() {
    try {
        console.log('Testing duplicate prevention across replicas...\n');
        
        // Test 1: Quick successive calls to same replica
        console.log('1. Testing quick successive calls to replica 1...');
        
        const promises1 = [];
        for (let i = 0; i < 5; i++) {
            promises1.push(
                axios.post(`${BASE_URL_1}/create-group`, {
                    groupName: 'testgroup1',
                    tenant: 'tenant1'
                }).catch(err => ({ error: err.response?.data || err.message }))
            );
        }
        
        const results1 = await Promise.all(promises1);
        console.log('Results from replica 1:', results1.map(r => r.data || r.error));
        
        // Test 2: Cross-replica calls
        console.log('\n2. Testing cross-replica calls...');
        
        const promises2 = [];
        // Call replica 1
        promises2.push(
            axios.post(`${BASE_URL_1}/add-permission`, {
                role: 'testgroup1',
                obj: 'resource1',
                act: 'read',
                tenant: 'tenant1'
            }).catch(err => ({ error: err.response?.data || err.message }))
        );
        
        // Immediately call replica 2 with same data
        promises2.push(
            axios.post(`${BASE_URL_2}/add-permission`, {
                role: 'testgroup1',
                obj: 'resource1',
                act: 'read',
                tenant: 'tenant1'
            }).catch(err => ({ error: err.response?.data || err.message }))
        );
        
        const results2 = await Promise.all(promises2);
        console.log('Cross-replica results:', results2.map(r => r.data || r.error));
        
        // Test 3: User assignment duplicates
        console.log('\n3. Testing user assignment duplicates...');
        
        const promises3 = [];
        for (let i = 0; i < 3; i++) {
            promises3.push(
                axios.post(`${BASE_URL_1}/assign-user`, {
                    userId: 'testuser1',
                    groupName: 'testgroup1',
                    tenant: 'tenant1'
                }).catch(err => ({ error: err.response?.data || err.message }))
            );
        }
        
        const results3 = await Promise.all(promises3);
        console.log('User assignment results:', results3.map(r => r.data || r.error));
        
        // Test 4: Check final state
        console.log('\n4. Checking final state...');
        const finalState = await axios.get(`${BASE_URL_1}/tenant-policies/tenant1`);
        console.log('Final policies:', finalState.data);
        
        console.log('\n✅ Duplicate prevention test completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testDuplicatePrevention(); 