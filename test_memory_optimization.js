const axios = require('axios');

// Configuration
const CONFIG = {
    servers: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002'
    ],
    testDuration: 60000, // 1 minute
    requestInterval: 100, // 100ms between requests
    concurrentRequests: 10,
    monitoringInterval: 5000 // 5 seconds
};

// Statistics
let totalRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;
let totalLatency = 0;
let startTime = Date.now();
let memoryStats = [];

// Helper function to get random server
const getRandomServer = () => {
    return CONFIG.servers[Math.floor(Math.random() * CONFIG.servers.length)];
};

// Helper function to get random tenant
const getRandomTenant = () => {
    const tenantId = Math.floor(Math.random() * 1000) + 1;
    return `tenantid${tenantId}`;
};

// Helper function to get random user
const getRandomUser = () => {
    const userId = Math.floor(Math.random() * 50) + 1;
    return `user${userId}`;
};

// Helper function to get random resource
const getRandomResource = () => {
    const resourceId = Math.floor(Math.random() * 50) + 1;
    return `resourceid${resourceId}`;
};

// Helper function to get random action
const getRandomAction = () => {
    const actions = ['create', 'read', 'update', 'delete', 'share'];
    return actions[Math.floor(Math.random() * actions.length)];
};

// Make a check-access request
const makeCheckAccessRequest = async () => {
    const requestStart = Date.now();
    
    try {
        const response = await axios.post(`${getRandomServer()}/check-access`, {
            userId: getRandomUser(),
            obj: getRandomResource(),
            act: getRandomAction(),
            tenant: getRandomTenant()
        }, {
            timeout: 30000
        });
        
        const latency = Date.now() - requestStart;
        totalLatency += latency;
        successfulRequests++;
        
        return { success: true, latency, status: response.status };
    } catch (error) {
        const latency = Date.now() - requestStart;
        failedRequests++;
        
        return { 
            success: false, 
            latency, 
            error: error.message,
            status: error.response?.status || 'timeout'
        };
    } finally {
        totalRequests++;
    }
};

// Get memory statistics
const getMemoryStats = async () => {
    try {
        const response = await axios.get(`${getRandomServer()}/memory-stats`, {
            timeout: 5000
        });
        
        return {
            timestamp: Date.now(),
            ...response.data
        };
    } catch (error) {
        return {
            timestamp: Date.now(),
            error: error.message
        };
    }
};

// Monitor system during test
const startMonitoring = () => {
    const monitorInterval = setInterval(async () => {
        try {
            const memoryInfo = await getMemoryStats();
            memoryStats.push(memoryInfo);
            
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            const successRate = totalRequests > 0 ? ((successfulRequests / totalRequests) * 100).toFixed(2) : '0.00';
            const avgLatency = totalRequests > 0 ? (totalLatency / totalRequests).toFixed(2) : '0.00';
            
            if (memoryInfo.memory) {
                const heapPercent = memoryInfo.heapUsagePercent?.toFixed(1) || 'N/A';
                console.log(`[${elapsed}s] 📊 Progress: ${totalRequests} requests | Success: ${successRate}% | Avg Latency: ${avgLatency}ms | Memory: ${heapPercent}%`);
            } else {
                console.log(`[${elapsed}s] 📊 Progress: ${totalRequests} requests | Success: ${successRate}% | Avg Latency: ${avgLatency}ms | Memory: N/A`);
            }
            
        } catch (error) {
            console.error('Monitoring error:', error.message);
        }
    }, CONFIG.monitoringInterval);
    
    return monitorInterval;
};

// Run concurrent requests
const runConcurrentRequests = async () => {
    const promises = [];
    
    for (let i = 0; i < CONFIG.concurrentRequests; i++) {
        promises.push(makeCheckAccessRequest());
    }
    
    await Promise.allSettled(promises);
};

// Main test function
const runMemoryTest = async () => {
    console.log('🧠 Starting Memory Optimization Test');
    console.log('='.repeat(80));
    console.log(`📊 Configuration:`);
    console.log(`   Test Duration: ${CONFIG.testDuration / 1000} seconds`);
    console.log(`   Request Interval: ${CONFIG.requestInterval}ms`);
    console.log(`   Concurrent Requests: ${CONFIG.concurrentRequests}`);
    console.log(`   Monitoring Interval: ${CONFIG.monitoringInterval}ms`);
    console.log(`   Servers: ${CONFIG.servers.length}`);
    console.log('='.repeat(80));
    
    startTime = Date.now();
    
    // Start monitoring
    const monitorInterval = startMonitoring();
    
    // Run requests for the specified duration
    const testInterval = setInterval(async () => {
        await runConcurrentRequests();
    }, CONFIG.requestInterval);
    
    // Stop after test duration
    setTimeout(() => {
        clearInterval(testInterval);
        clearInterval(monitorInterval);
        
        // Final summary
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const successRate = ((successfulRequests / totalRequests) * 100).toFixed(2);
        const avgLatency = (totalLatency / totalRequests).toFixed(2);
        const requestsPerSecond = (totalRequests / totalTime).toFixed(2);
        
        console.log('\n' + '='.repeat(80));
        console.log('🎉 MEMORY OPTIMIZATION TEST COMPLETED!');
        console.log('='.repeat(80));
        console.log(`⏱️  Total Time: ${totalTime} seconds`);
        console.log(`📊 Total Requests: ${totalRequests.toLocaleString()}`);
        console.log(`✅ Successful Requests: ${successfulRequests.toLocaleString()}`);
        console.log(`❌ Failed Requests: ${failedRequests.toLocaleString()}`);
        console.log(`📈 Success Rate: ${successRate}%`);
        console.log(`⚡ Average Latency: ${avgLatency}ms`);
        console.log(`🚀 Requests/Second: ${requestsPerSecond}`);
        
        // Memory analysis
        if (memoryStats.length > 0) {
            const memoryValues = memoryStats.filter(m => m.memory).map(m => m.heapUsagePercent);
            const maxMemory = Math.max(...memoryValues);
            const minMemory = Math.min(...memoryValues);
            const avgMemory = memoryValues.reduce((sum, val) => sum + val, 0) / memoryValues.length;
            
            console.log(`\n🧠 Memory Analysis:`);
            console.log(`   Peak Memory Usage: ${maxMemory.toFixed(1)}%`);
            console.log(`   Average Memory Usage: ${avgMemory.toFixed(1)}%`);
            console.log(`   Minimum Memory Usage: ${minMemory.toFixed(1)}%`);
            console.log(`   Memory Samples: ${memoryValues.length}`);
            
            // Check if memory optimization is working
            if (maxMemory < 90) {
                console.log(`✅ Memory optimization working well - peak usage below 90%`);
            } else if (maxMemory < 95) {
                console.log(`⚠️ Memory usage high but manageable - peak usage ${maxMemory.toFixed(1)}%`);
            } else {
                console.log(`❌ Memory usage critical - peak usage ${maxMemory.toFixed(1)}%`);
            }
        }
        
        console.log('\n🚀 Ready for larger scale testing!');
        
    }, CONFIG.testDuration);
};

// Run if called directly
if (require.main === module) {
    runMemoryTest().catch(error => {
        console.error('Fatal error during memory test:', error);
        process.exit(1);
    });
} 