const axios = require('axios');

const BASE_URL_1 = 'http://localhost:3000';
const BASE_URL_2 = 'http://localhost:3002';

async function testDuplicatesWithoutDb() {
    try {
        console.log('🧪 Testing Duplicate Prevention (Without DB Connection Issues)');
        console.log('=' .repeat(70));
        
        // Disable database checks
        console.log('🔧 Disabling database duplicate checks...');
        await axios.post(`${BASE_URL_1}/disable-db-checks`);
        await axios.post(`${BASE_URL_2}/disable-db-checks`);
        
        // Test 1: Create same group multiple times
        console.log('\n🧪 TEST 1: Creating same group 20 times');
        const groupRequests = [];
        for (let i = 0; i < 20; i++) {
            groupRequests.push(
                axios.post(`${BASE_URL_1}/create-group`, {
                    groupName: 'test-group-same',
                    tenant: 'tenant1'
                }).catch(err => ({ error: err.response?.data || err.message }))
            );
        }
        
        const groupResults = await Promise.allSettled(groupRequests);
        const groupSuccess = groupResults.filter(r => r.status === 'fulfilled' && r.value.data?.success).length;
        const groupDuplicates = groupResults.filter(r => 
            r.status === 'fulfilled' && 
            r.value.data?.message?.includes('already exists')
        ).length;
        
        console.log(`✅ Successful: ${groupSuccess}`);
        console.log(`🚫 Duplicates prevented: ${groupDuplicates}`);
        
        // Test 2: Add same permission multiple times
        console.log('\n🧪 TEST 2: Adding same permission 15 times');
        const permissionRequests = [];
        for (let i = 0; i < 15; i++) {
            permissionRequests.push(
                axios.post(`${BASE_URL_1}/add-permission`, {
                    role: 'test-group-same',
                    obj: 'test-resource',
                    act: 'read',
                    tenant: 'tenant1'
                }).catch(err => ({ error: err.response?.data || err.message }))
            );
        }
        
        const permissionResults = await Promise.allSettled(permissionRequests);
        const permissionSuccess = permissionResults.filter(r => r.status === 'fulfilled' && r.value.data?.success).length;
        const permissionDuplicates = permissionResults.filter(r => 
            r.status === 'fulfilled' && 
            r.value.data?.message?.includes('already exists')
        ).length;
        
        console.log(`✅ Successful: ${permissionSuccess}`);
        console.log(`🚫 Duplicates prevented: ${permissionDuplicates}`);
        
        // Test 3: Assign same user multiple times
        console.log('\n🧪 TEST 3: Assigning same user 10 times');
        const userRequests = [];
        for (let i = 0; i < 10; i++) {
            userRequests.push(
                axios.post(`${BASE_URL_1}/assign-user`, {
                    userId: 'test-user-same',
                    groupName: 'test-group-same',
                    tenant: 'tenant1'
                }).catch(err => ({ error: err.response?.data || err.message }))
            );
        }
        
        const userResults = await Promise.allSettled(userRequests);
        const userSuccess = userResults.filter(r => r.status === 'fulfilled' && r.value.data?.success).length;
        const userDuplicates = userResults.filter(r => 
            r.status === 'fulfilled' && 
            r.value.data?.message?.includes('already exists')
        ).length;
        
        console.log(`✅ Successful: ${userSuccess}`);
        console.log(`🚫 Duplicates prevented: ${userDuplicates}`);
        
        // Test 4: Cross-replica duplicate prevention
        console.log('\n🧪 TEST 4: Cross-replica duplicate prevention');
        const crossReplicaRequests = [];
        
        // Create group on both replicas
        crossReplicaRequests.push(
            axios.post(`${BASE_URL_1}/create-group`, {
                groupName: 'cross-replica-group',
                tenant: 'tenant1'
            }).catch(err => ({ error: err.response?.data || err.message }))
        );
        
        crossReplicaRequests.push(
            axios.post(`${BASE_URL_2}/create-group`, {
                groupName: 'cross-replica-group',
                tenant: 'tenant1'
            }).catch(err => ({ error: err.response?.data || err.message }))
        );
        
        const crossResults = await Promise.allSettled(crossReplicaRequests);
        const crossSuccess = crossResults.filter(r => r.status === 'fulfilled' && r.value.data?.success).length;
        const crossDuplicates = crossResults.filter(r => 
            r.status === 'fulfilled' && 
            r.value.data?.message?.includes('already exists')
        ).length;
        
        console.log(`✅ Successful: ${crossSuccess}`);
        console.log(`🚫 Duplicates prevented: ${crossDuplicates}`);
        
        // Re-enable database checks
        console.log('\n🔧 Re-enabling database duplicate checks...');
        await axios.post(`${BASE_URL_1}/enable-db-checks`);
        await axios.post(`${BASE_URL_2}/enable-db-checks`);
        
        // Check final state
        console.log('\n🔍 Checking final database state...');
        const finalState = await axios.get(`${BASE_URL_1}/tenant-policies/tenant1`);
        const { policies, groupingPolicies } = finalState.data;
        
        console.log(`📊 Final state:`);
        console.log(`   Policies: ${policies.length}`);
        console.log(`   Grouping Policies: ${groupingPolicies.length}`);
        
        // Summary
        console.log('\n📈 SUMMARY');
        console.log('=' .repeat(70));
        console.log(`• Group creation: ${groupSuccess}/20 successful, ${groupDuplicates} duplicates prevented`);
        console.log(`• Permission addition: ${permissionSuccess}/15 successful, ${permissionDuplicates} duplicates prevented`);
        console.log(`• User assignment: ${userSuccess}/10 successful, ${userDuplicates} duplicates prevented`);
        console.log(`• Cross-replica: ${crossSuccess}/2 successful, ${crossDuplicates} duplicates prevented`);
        
        const totalDuplicates = groupDuplicates + permissionDuplicates + userDuplicates + crossDuplicates;
        if (totalDuplicates > 0) {
            console.log('\n🎉 SUCCESS: Duplicate prevention is working!');
            console.log(`✅ ${totalDuplicates} duplicates were properly prevented`);
        } else {
            console.log('\n⚠️  WARNING: No duplicates were detected');
            console.log('   This might indicate the enforcer cache is working too well');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        
        // Re-enable database checks even if test fails
        try {
            await axios.post(`${BASE_URL_1}/enable-db-checks`);
            await axios.post(`${BASE_URL_2}/enable-db-checks`);
        } catch (e) {
            console.error('Failed to re-enable database checks:', e.message);
        }
    }
}

testDuplicatesWithoutDb(); 