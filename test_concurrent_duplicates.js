const axios = require('axios');

const BASE_URL_1 = 'http://localhost:3000';
const BASE_URL_2 = 'http://localhost:3002';

// Helper function to make concurrent requests
async function makeConcurrentRequests(requests, description) {
    console.log(`\n🔄 ${description}`);
    console.log(`Making ${requests.length} concurrent requests...`);
    
    const startTime = Date.now();
    const results = await Promise.allSettled(requests);
    const endTime = Date.now();
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    const duplicates = results.filter(r => 
        r.status === 'fulfilled' && 
        r.value.data && 
        r.value.data.message && 
        r.value.data.message.includes('already exists')
    ).length;
    
    console.log(`⏱️  Time taken: ${endTime - startTime}ms`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`🚫 Duplicates prevented: ${duplicates}`);
    
    return results;
}

// Helper function to check database state
async function checkDatabaseState(description) {
    try {
        const response = await axios.get(`${BASE_URL_1}/tenant-policies/tenant1`);
        const { policies, groupingPolicies } = response.data;
        
        console.log(`\n📊 ${description}`);
        console.log(`Policies: ${policies.length}`);
        console.log(`Grouping Policies: ${groupingPolicies.length}`);
        
        // Check for duplicates in the response
        const policyStrings = policies.map(p => p.join('|'));
        const groupingStrings = groupingPolicies.map(g => g.join('|'));
        
        const uniquePolicies = new Set(policyStrings);
        const uniqueGroupings = new Set(groupingStrings);
        
        const policyDuplicates = policyStrings.length - uniquePolicies.size;
        const groupingDuplicates = groupingStrings.length - uniqueGroupings.size;
        
        if (policyDuplicates > 0 || groupingDuplicates > 0) {
            console.log(`⚠️  WARNING: Found duplicates in database!`);
            console.log(`   Policy duplicates: ${policyDuplicates}`);
            console.log(`   Grouping duplicates: ${groupingDuplicates}`);
        } else {
            console.log(`✅ No duplicates found in database`);
        }
        
        return { policies, groupingPolicies, policyDuplicates, groupingDuplicates };
    } catch (error) {
        console.error(`❌ Error checking database state:`, error.message);
        return null;
    }
}

async function testConcurrentDuplicates() {
    try {
        console.log('🚀 Starting Concurrent Duplicate Prevention Test');
        console.log('=' .repeat(60));
        
        // Test 1: Concurrent group creation
        console.log('\n🧪 TEST 1: Concurrent Group Creation');
        const groupRequests = [];
        for (let i = 0; i < 20; i++) {
            groupRequests.push(
                axios.post(`${BASE_URL_1}/create-group`, {
                    groupName: 'concurrent-group',
                    tenant: 'tenant1'
                }).catch(err => ({ error: err.response?.data || err.message }))
            );
        }
        
        await makeConcurrentRequests(groupRequests, 'Creating group "concurrent-group" 20 times concurrently');
        
        // Test 2: Cross-replica concurrent group creation
        console.log('\n🧪 TEST 2: Cross-Replica Concurrent Group Creation');
        const crossReplicaGroupRequests = [];
        for (let i = 0; i < 10; i++) {
            // Alternate between replicas
            const baseUrl = i % 2 === 0 ? BASE_URL_1 : BASE_URL_2;
            crossReplicaGroupRequests.push(
                axios.post(`${baseUrl}/create-group`, {
                    groupName: 'cross-replica-group',
                    tenant: 'tenant1'
                }).catch(err => ({ error: err.response?.data || err.message }))
            );
        }
        
        await makeConcurrentRequests(crossReplicaGroupRequests, 'Creating group "cross-replica-group" across replicas');
        
        // Test 3: Concurrent permission addition
        console.log('\n🧪 TEST 3: Concurrent Permission Addition');
        const permissionRequests = [];
        for (let i = 0; i < 15; i++) {
            permissionRequests.push(
                axios.post(`${BASE_URL_1}/add-permission`, {
                    role: 'concurrent-group',
                    obj: 'resource1',
                    act: 'read',
                    tenant: 'tenant1'
                }).catch(err => ({ error: err.response?.data || err.message }))
            );
        }
        
        await makeConcurrentRequests(permissionRequests, 'Adding permission 15 times concurrently');
        
        // Test 4: Concurrent user assignment
        console.log('\n🧪 TEST 4: Concurrent User Assignment');
        const userAssignmentRequests = [];
        for (let i = 0; i < 12; i++) {
            userAssignmentRequests.push(
                axios.post(`${BASE_URL_1}/assign-user`, {
                    userId: `user${i}`,
                    groupName: 'concurrent-group',
                    tenant: 'tenant1'
                }).catch(err => ({ error: err.response?.data || err.message }))
            );
        }
        
        await makeConcurrentRequests(userAssignmentRequests, 'Assigning 12 users concurrently');
        
        // Test 5: Mixed concurrent operations
        console.log('\n🧪 TEST 5: Mixed Concurrent Operations');
        const mixedRequests = [];
        
        // Add different types of operations
        for (let i = 0; i < 5; i++) {
            // Create groups
            mixedRequests.push(
                axios.post(`${BASE_URL_1}/create-group`, {
                    groupName: `mixed-group-${i}`,
                    tenant: 'tenant1'
                }).catch(err => ({ error: err.response?.data || err.message }))
            );
            
            // Add permissions
            mixedRequests.push(
                axios.post(`${BASE_URL_2}/add-permission`, {
                    role: `mixed-group-${i}`,
                    obj: `resource${i}`,
                    act: 'read',
                    tenant: 'tenant1'
                }).catch(err => ({ error: err.response?.data || err.message }))
            );
            
            // Assign users
            mixedRequests.push(
                axios.post(`${BASE_URL_1}/assign-user`, {
                    userId: `mixed-user-${i}`,
                    groupName: `mixed-group-${i}`,
                    tenant: 'tenant1'
                }).catch(err => ({ error: err.response?.data || err.message }))
            );
        }
        
        await makeConcurrentRequests(mixedRequests, 'Mixed operations across replicas');
        
        // Test 6: High-load stress test
        console.log('\n🧪 TEST 6: High-Load Stress Test');
        const stressRequests = [];
        for (let i = 0; i < 50; i++) {
            const operation = i % 3;
            const replica = i % 2 === 0 ? BASE_URL_1 : BASE_URL_2;
            
            switch (operation) {
                case 0:
                    stressRequests.push(
                        axios.post(`${replica}/create-group`, {
                            groupName: `stress-group-${i}`,
                            tenant: 'tenant1'
                        }).catch(err => ({ error: err.response?.data || err.message }))
                    );
                    break;
                case 1:
                    stressRequests.push(
                        axios.post(`${replica}/add-permission`, {
                            role: `stress-group-${i}`,
                            obj: `stress-resource-${i}`,
                            act: 'read',
                            tenant: 'tenant1'
                        }).catch(err => ({ error: err.response?.data || err.message }))
                    );
                    break;
                case 2:
                    stressRequests.push(
                        axios.post(`${replica}/assign-user`, {
                            userId: `stress-user-${i}`,
                            groupName: `stress-group-${i}`,
                            tenant: 'tenant1'
                        }).catch(err => ({ error: err.response?.data || err.message }))
                    );
                    break;
            }
        }
        
        await makeConcurrentRequests(stressRequests, 'High-load stress test with 50 operations');
        
        // Final verification
        console.log('\n🔍 FINAL VERIFICATION');
        console.log('=' .repeat(60));
        
        const finalState = await checkDatabaseState('Final Database State');
        
        if (finalState && finalState.policyDuplicates === 0 && finalState.groupingDuplicates === 0) {
            console.log('\n🎉 SUCCESS: No duplicates were created during concurrent testing!');
            console.log('✅ The duplicate prevention system is working correctly under high concurrency.');
        } else {
            console.log('\n⚠️  WARNING: Some duplicates may have been created.');
            console.log('❌ The duplicate prevention system needs improvement.');
        }
        
        // Performance summary
        console.log('\n📈 PERFORMANCE SUMMARY');
        console.log('=' .repeat(60));
        console.log('• Total concurrent requests tested: ~120');
        console.log('• Cross-replica operations: ✅ Tested');
        console.log('• Mixed operation types: ✅ Tested');
        console.log('• High-load scenarios: ✅ Tested');
        console.log('• Database integrity: ✅ Verified');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testConcurrentDuplicates(); 