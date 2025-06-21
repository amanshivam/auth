const axios = require('axios');

const BASE_URL_1 = 'http://localhost:3000';
const BASE_URL_2 = 'http://localhost:3002';

async function testConnectionPooling() {
    try {
        console.log('🔌 Testing Connection Pooling');
        console.log('=' .repeat(50));
        
        // Test 1: Concurrent requests with database checks enabled
        console.log('\n🧪 TEST 1: Concurrent requests with DB checks enabled');
        const concurrentRequests = [];
        
        for (let i = 0; i < 50; i++) {
            const data = {
                groupName: `pool-test-group-${i}`,
                tenant: 'tenant1'
            };
            
            concurrentRequests.push(
                axios.post(`${BASE_URL_1}/create-group`, data)
                    .then(response => ({ success: true, data: response.data }))
                    .catch(err => ({ success: false, error: err.response?.data || err.message }))
            );
        }
        
        const results = await Promise.all(concurrentRequests);
        const success = results.filter(r => r.success).length;
        const duplicates = results.filter(r => 
            !r.success && r.error?.message?.includes('already exists')
        ).length;
        const errors = results.filter(r => 
            !r.success && !r.error?.message?.includes('already exists')
        ).length;
        
        console.log(`✅ Successful: ${success}/50`);
        console.log(`🚫 Duplicates prevented: ${duplicates}`);
        console.log(`❌ Errors: ${errors}`);
        
        if (errors === 0) {
            console.log('🎉 SUCCESS: No connection errors!');
        } else {
            console.log('⚠️  WARNING: Some connection errors occurred');
        }
        
        // Test 2: Rapid sequential requests
        console.log('\n🧪 TEST 2: Rapid sequential requests');
        const sequentialResults = [];
        
        for (let i = 0; i < 30; i++) {
            const data = {
                groupName: `seq-test-group-${i}`,
                tenant: 'tenant2'
            };
            
            try {
                const response = await axios.post(`${BASE_URL_2}/create-group`, data);
                sequentialResults.push({ success: true, data: response.data });
            } catch (error) {
                const isDuplicate = error.response?.data?.message?.includes('already exists');
                sequentialResults.push({ 
                    success: false, 
                    isDuplicate,
                    error: error.response?.data || error.message 
                });
            }
        }
        
        const seqSuccess = sequentialResults.filter(r => r.success).length;
        const seqDuplicates = sequentialResults.filter(r => !r.success && r.isDuplicate).length;
        const seqErrors = sequentialResults.filter(r => !r.success && !r.isDuplicate).length;
        
        console.log(`✅ Successful: ${seqSuccess}/30`);
        console.log(`🚫 Duplicates prevented: ${seqDuplicates}`);
        console.log(`❌ Errors: ${seqErrors}`);
        
        // Test 3: Mixed operations across both servers
        console.log('\n🧪 TEST 3: Mixed operations across both servers');
        const mixedResults = [];
        
        for (let i = 0; i < 20; i++) {
            const serverUrl = i % 2 === 0 ? BASE_URL_1 : BASE_URL_2;
            const tenant = i % 3 === 0 ? 'tenant1' : i % 3 === 1 ? 'tenant2' : 'tenant3';
            
            const operations = [
                // Create group
                axios.post(`${serverUrl}/create-group`, {
                    groupName: `mixed-group-${i}`,
                    tenant
                }),
                // Add permission
                axios.post(`${serverUrl}/add-permission`, {
                    role: `mixed-group-${i}`,
                    obj: `resource-${i}`,
                    act: 'read',
                    tenant
                }),
                // Assign user
                axios.post(`${serverUrl}/assign-user`, {
                    userId: `user-${i}`,
                    groupName: `mixed-group-${i}`,
                    tenant
                })
            ];
            
            const opResults = await Promise.allSettled(operations);
            mixedResults.push(...opResults);
        }
        
        const mixedSuccess = mixedResults.filter(r => r.status === 'fulfilled' && r.value.data?.success).length;
        const mixedDuplicates = mixedResults.filter(r => 
            r.status === 'fulfilled' && 
            r.value.data?.message?.includes('already exists')
        ).length;
        const mixedErrors = mixedResults.filter(r => r.status === 'rejected').length;
        
        console.log(`✅ Successful: ${mixedSuccess}/60`);
        console.log(`🚫 Duplicates prevented: ${mixedDuplicates}`);
        console.log(`❌ Errors: ${mixedErrors}`);
        
        // Summary
        console.log('\n📈 SUMMARY');
        console.log('=' .repeat(50));
        console.log(`• Concurrent requests: ${success}/50 successful, ${errors} errors`);
        console.log(`• Sequential requests: ${seqSuccess}/30 successful, ${seqErrors} errors`);
        console.log(`• Mixed operations: ${mixedSuccess}/60 successful, ${mixedErrors} errors`);
        
        const totalErrors = errors + seqErrors + mixedErrors;
        
        if (totalErrors === 0) {
            console.log('\n🎉 SUCCESS: Connection pooling is working perfectly!');
            console.log('✅ No connection errors occurred');
            console.log('✅ System can handle concurrent load');
        } else {
            console.log('\n⚠️  WARNING: Some connection errors occurred');
            console.log(`   Total errors: ${totalErrors}`);
            console.log('   May need to adjust connection pool settings');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testConnectionPooling(); 