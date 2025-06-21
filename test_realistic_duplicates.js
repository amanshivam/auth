const axios = require('axios');

const BASE_URL_1 = 'http://localhost:3000';
const BASE_URL_2 = 'http://localhost:3002';

async function testRealisticDuplicates() {
    try {
        console.log('🧪 Testing Realistic Duplicate Scenarios');
        console.log('=' .repeat(60));
        
        // Test 1: Rapid sequential requests with different data
        console.log('\n🧪 TEST 1: Rapid sequential requests (different data)');
        const rapidRequests = [];
        
        for (let i = 0; i < 50; i++) {
            const data = {
                groupName: `rapid-group-${i}`,
                tenant: 'tenant1'
            };
            
            rapidRequests.push(
                axios.post(`${BASE_URL_1}/create-group`, data)
                    .then(response => ({ success: true, data: response.data }))
                    .catch(err => ({ success: false, error: err.response?.data || err.message }))
            );
        }
        
        const rapidResults = await Promise.all(rapidRequests);
        const rapidSuccess = rapidResults.filter(r => r.success).length;
        const rapidDuplicates = rapidResults.filter(r => 
            !r.success && r.error?.message?.includes('already exists')
        ).length;
        
        console.log(`✅ Successful: ${rapidSuccess}/50`);
        console.log(`🚫 Duplicates prevented: ${rapidDuplicates}`);
        
        // Test 2: Concurrent requests to different servers
        console.log('\n🧪 TEST 2: Concurrent requests to different servers');
        const concurrentRequests = [];
        
        for (let i = 0; i < 30; i++) {
            const data = {
                groupName: `concurrent-group-${i}`,
                tenant: 'tenant2'
            };
            
            // Alternate between servers
            const serverUrl = i % 2 === 0 ? BASE_URL_1 : BASE_URL_2;
            
            concurrentRequests.push(
                axios.post(`${serverUrl}/create-group`, data)
                    .then(response => ({ success: true, data: response.data }))
                    .catch(err => ({ success: false, error: err.response?.data || err.message }))
            );
        }
        
        const concurrentResults = await Promise.all(concurrentRequests);
        const concurrentSuccess = concurrentResults.filter(r => r.success).length;
        const concurrentDuplicates = concurrentResults.filter(r => 
            !r.success && r.error?.message?.includes('already exists')
        ).length;
        
        console.log(`✅ Successful: ${concurrentSuccess}/30`);
        console.log(`🚫 Duplicates prevented: ${concurrentDuplicates}`);
        
        // Test 3: Mixed operations with potential conflicts
        console.log('\n🧪 TEST 3: Mixed operations with potential conflicts');
        const mixedRequests = [];
        
        // Create groups and immediately add permissions
        for (let i = 0; i < 20; i++) {
            const groupName = `mixed-group-${i}`;
            const tenant = 'tenant3';
            
            // Create group
            mixedRequests.push(
                axios.post(`${BASE_URL_1}/create-group`, { groupName, tenant })
                    .then(response => ({ type: 'group', success: true, data: response.data }))
                    .catch(err => ({ type: 'group', success: false, error: err.response?.data || err.message }))
            );
            
            // Add permission to same group
            mixedRequests.push(
                axios.post(`${BASE_URL_2}/add-permission`, {
                    role: groupName,
                    obj: `resource-${i}`,
                    act: 'read',
                    tenant
                })
                .then(response => ({ type: 'permission', success: true, data: response.data }))
                .catch(err => ({ type: 'permission', success: false, error: err.response?.data || err.message }))
            );
        }
        
        const mixedResults = await Promise.all(mixedRequests);
        const mixedSuccess = mixedResults.filter(r => r.success).length;
        const mixedDuplicates = mixedResults.filter(r => 
            !r.success && r.error?.message?.includes('already exists')
        ).length;
        
        console.log(`✅ Successful: ${mixedSuccess}/40`);
        console.log(`🚫 Duplicates prevented: ${mixedDuplicates}`);
        
        // Test 4: Check database integrity after all tests
        console.log('\n🔍 Checking database integrity...');
        const integrityChecks = [];
        
        for (const tenant of ['tenant1', 'tenant2', 'tenant3']) {
            integrityChecks.push(
                axios.get(`${BASE_URL_1}/tenant-policies/${tenant}`)
                    .then(response => {
                        const { policies, groupingPolicies } = response.data;
                        
                        // Check for duplicates by converting to strings
                        const policyStrings = policies.map(p => p.join('|'));
                        const groupingStrings = groupingPolicies.map(g => g.join('|'));
                        
                        const uniquePolicies = new Set(policyStrings);
                        const uniqueGroupings = new Set(groupingStrings);
                        
                        const policyDuplicates = policyStrings.length - uniquePolicies.size;
                        const groupingDuplicates = groupingStrings.length - uniqueGroupings.size;
                        
                        return {
                            tenant,
                            policies: policies.length,
                            uniquePolicies: uniquePolicies.size,
                            policyDuplicates,
                            groupingPolicies: groupingPolicies.length,
                            uniqueGroupings: uniqueGroupings.size,
                            groupingDuplicates
                        };
                    })
                    .catch(error => ({
                        tenant,
                        error: error.message
                    }))
            );
        }
        
        const integrityResults = await Promise.all(integrityChecks);
        
        console.log('\n📊 Database Integrity Report:');
        console.log('=' .repeat(60));
        
        let totalDuplicates = 0;
        let totalPolicies = 0;
        let totalGroupings = 0;
        
        integrityResults.forEach(result => {
            if (result.error) {
                console.log(`❌ ${result.tenant}: Error - ${result.error}`);
            } else {
                const duplicates = result.policyDuplicates + result.groupingDuplicates;
                totalDuplicates += duplicates;
                totalPolicies += result.policies;
                totalGroupings += result.groupingPolicies;
                
                console.log(`✅ ${result.tenant}: ${result.policies} policies, ${result.groupingPolicies} groupings, ${duplicates} duplicates`);
            }
        });
        
        // Summary
        console.log('\n📈 FINAL SUMMARY');
        console.log('=' .repeat(60));
        console.log(`• Rapid requests: ${rapidSuccess}/50 successful, ${rapidDuplicates} duplicates prevented`);
        console.log(`• Concurrent requests: ${concurrentSuccess}/30 successful, ${concurrentDuplicates} duplicates prevented`);
        console.log(`• Mixed operations: ${mixedSuccess}/40 successful, ${mixedDuplicates} duplicates prevented`);
        console.log(`• Database integrity: ${totalPolicies} policies, ${totalGroupings} groupings, ${totalDuplicates} duplicates`);
        
        const totalDuplicatesPrevented = rapidDuplicates + concurrentDuplicates + mixedDuplicates;
        
        if (totalDuplicatesPrevented > 0) {
            console.log('\n🎉 SUCCESS: Duplicate prevention is working!');
            console.log(`✅ ${totalDuplicatesPrevented} duplicates were properly prevented`);
        } else if (totalDuplicates === 0) {
            console.log('\n🎉 SUCCESS: No duplicates in database!');
            console.log('✅ System is working correctly');
        } else {
            console.log('\n⚠️  WARNING: Some duplicates found in database');
            console.log('   The duplicate prevention system may need improvement');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testRealisticDuplicates(); 