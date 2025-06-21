const axios = require('axios');

const BASE_URL_1 = 'http://localhost:3000';
const BASE_URL_2 = 'http://localhost:3002';

async function testConcurrentDuplicates() {
    try {
        console.log('🚀 Testing Concurrent Duplicate Prevention');
        console.log('=' .repeat(50));
        
        // Test 1: Rapid group creation (most likely to create duplicates)
        console.log('\n🧪 TEST 1: Rapid Group Creation');
        const groupRequests = [];
        for (let i = 0; i < 10; i++) {
            groupRequests.push(
                axios.post(`${BASE_URL_1}/create-group`, {
                    groupName: 'rapid-group',
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
        
        // Test 2: Cross-replica permission addition
        console.log('\n🧪 TEST 2: Cross-Replica Permission Addition');
        const permissionRequests = [];
        for (let i = 0; i < 8; i++) {
            const baseUrl = i % 2 === 0 ? BASE_URL_1 : BASE_URL_2;
            permissionRequests.push(
                axios.post(`${baseUrl}/add-permission`, {
                    role: 'rapid-group',
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
        
        // Test 3: Concurrent user assignments
        console.log('\n🧪 TEST 3: Concurrent User Assignments');
        const userRequests = [];
        for (let i = 0; i < 6; i++) {
            userRequests.push(
                axios.post(`${BASE_URL_1}/assign-user`, {
                    userId: 'test-user',
                    groupName: 'rapid-group',
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
        
        // Check final database state
        console.log('\n🔍 Checking Database State');
        const finalState = await axios.get(`${BASE_URL_1}/tenant-policies/tenant1`);
        const { policies, groupingPolicies } = finalState.data;
        
        // Check for actual duplicates in database
        const policyStrings = policies.map(p => p.join('|'));
        const groupingStrings = groupingPolicies.map(g => g.join('|'));
        
        const uniquePolicies = new Set(policyStrings);
        const uniqueGroupings = new Set(groupingStrings);
        
        const policyDuplicates = policyStrings.length - uniquePolicies.size;
        const groupingDuplicates = groupingStrings.length - uniqueGroupings.size;
        
        console.log(`📊 Final state:`);
        console.log(`   Policies: ${policies.length} (unique: ${uniquePolicies.size})`);
        console.log(`   Grouping Policies: ${groupingPolicies.length} (unique: ${uniqueGroupings.size})`);
        
        if (policyDuplicates === 0 && groupingDuplicates === 0) {
            console.log('\n🎉 SUCCESS: No duplicates in database!');
            console.log('✅ Duplicate prevention is working correctly.');
        } else {
            console.log('\n⚠️  WARNING: Found duplicates in database!');
            console.log(`   Policy duplicates: ${policyDuplicates}`);
            console.log(`   Grouping duplicates: ${groupingDuplicates}`);
        }
        
        // Summary
        console.log('\n📈 SUMMARY');
        console.log('=' .repeat(50));
        console.log(`• Group creation: ${groupSuccess}/10 successful, ${groupDuplicates} duplicates prevented`);
        console.log(`• Permission addition: ${permissionSuccess}/8 successful, ${permissionDuplicates} duplicates prevented`);
        console.log(`• User assignment: ${userSuccess}/6 successful, ${userDuplicates} duplicates prevented`);
        console.log(`• Database integrity: ${policyDuplicates + groupingDuplicates === 0 ? '✅ Clean' : '❌ Has duplicates'}`);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testConcurrentDuplicates(); 