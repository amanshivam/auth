const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration for check-access performance test
const SERVER_URLS = ['http://localhost:3000', 'http://localhost:3002'];
const TOTAL_REQUESTS = 10000; // 10,000 check-access requests
const CONCURRENT_REQUESTS = 50; // 50 concurrent requests
const MONITORING_INTERVAL = 5000; // 5 seconds
const TEST_DURATION = 300; // 5 minutes

// Test data ranges (based on ingestion)
const TENANT_RANGE = { min: 1, max: 43210 };
const USER_RANGE = { min: 1, max: 50 };
const RESOURCE_RANGE = { min: 1, max: 50 };
const ACTIONS = ['create', 'read', 'update', 'delete', 'share'];

// Performance tracking
let startTime = Date.now();
let totalRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;
let totalLatency = 0;
let minLatency = Infinity;
let maxLatency = 0;
let latencyBuckets = {
    '0-10ms': 0,
    '10-50ms': 0,
    '50-100ms': 0,
    '100-500ms': 0,
    '500ms+': 0
};

// System metrics tracking
let systemMetrics = [];
let cacheStats = [];
let queueStats = [];

// Helper function to get random server
const getRandomServer = () => {
    return SERVER_URLS[Math.floor(Math.random() * SERVER_URLS.length)];
};

// Helper function to get random value in range
const getRandomInRange = (range) => {
    return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
};

// Helper function to categorize latency
const categorizeLatency = (latency) => {
    if (latency < 10) return '0-10ms';
    if (latency < 50) return '10-50ms';
    if (latency < 100) return '50-100ms';
    if (latency < 500) return '100-500ms';
    return '500ms+';
};

// Helper function to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// System monitoring functions
const getSystemMetrics = async () => {
    try {
        // Get memory usage using ps (works on macOS)
        const { stdout: memOutput } = await execAsync('ps -o pid,rss,vsz,pcpu -p $(pgrep -f "node index.js")');
        const memLines = memOutput.trim().split('\n').slice(1);
        
        // Get CPU usage using top with correct macOS syntax
        let cpuOutput = '';
        try {
            const { stdout } = await execAsync('top -l 1 -pid $(pgrep -f "node index.js" | tr "\\n" "," | sed "s/,$//") | grep -E "CPU|node"');
            cpuOutput = stdout.trim();
        } catch (error) {
            // Fallback: use ps for CPU info
            const { stdout } = await execAsync('ps -o pid,pcpu -p $(pgrep -f "node index.js")');
            cpuOutput = stdout.trim();
        }
        
        // Get disk I/O (simplified for macOS)
        let diskOutput = '';
        try {
            const { stdout } = await execAsync('iostat -d 1 1 | tail -n +3');
            diskOutput = stdout.trim();
        } catch (error) {
            diskOutput = 'Disk I/O not available';
        }
        
        return {
            timestamp: Date.now(),
            memory: memLines.map(line => {
                const [pid, rss, vsz, pcpu] = line.trim().split(/\s+/);
                return { pid, rss: parseInt(rss), vsz: parseInt(vsz), pcpu: parseFloat(pcpu) };
            }),
            cpu: cpuOutput,
            disk: diskOutput
        };
    } catch (error) {
        console.error('Error getting system metrics:', error.message);
        return { timestamp: Date.now(), error: error.message };
    }
};

// Get cache and queue stats
const getCacheAndQueueStats = async () => {
    try {
        const [cacheResponse, queueResponse] = await Promise.all([
            axios.get(`${getRandomServer()}/cache-stats`),
            axios.get(`${getRandomServer()}/queue-stats`)
        ]);
        
        return {
            timestamp: Date.now(),
            cache: cacheResponse.data,
            queue: queueResponse.data
        };
    } catch (error) {
        return { timestamp: Date.now(), error: error.message };
    }
};

// Single check-access request
const makeCheckAccessRequest = async () => {
    const requestStart = Date.now();
    
    try {
        const tenantId = getRandomInRange(TENANT_RANGE);
        const userId = getRandomInRange(USER_RANGE);
        const resourceId = getRandomInRange(RESOURCE_RANGE);
        const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
        
        const response = await axios.post(`${getRandomServer()}/check-access`, {
            userId: `user${userId}`,
            obj: `resourceid${resourceId}`,
            act: action,
            tenant: `tenantid${tenantId}`
        }, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });
        
        const latency = Date.now() - requestStart;
        
        // Update statistics
        totalRequests++;
        successfulRequests++;
        totalLatency += latency;
        minLatency = Math.min(minLatency, latency);
        maxLatency = Math.max(maxLatency, latency);
        
        const category = categorizeLatency(latency);
        latencyBuckets[category]++;
        
        return { success: true, latency, allowed: response.data.allowed };
        
    } catch (error) {
        const latency = Date.now() - requestStart;
        
        totalRequests++;
        failedRequests++;
        totalLatency += latency;
        minLatency = Math.min(minLatency, latency);
        maxLatency = Math.max(maxLatency, latency);
        
        const category = categorizeLatency(latency);
        latencyBuckets[category]++;
        
        return { success: false, latency, error: error.message };
    }
};

// Run concurrent requests
const runConcurrentRequests = async (count) => {
    const promises = [];
    for (let i = 0; i < count; i++) {
        promises.push(makeCheckAccessRequest());
    }
    return Promise.allSettled(promises);
};

// Monitor system during test
const startMonitoring = () => {
    const monitorInterval = setInterval(async () => {
        try {
            const [systemMetric, cacheQueueStat] = await Promise.all([
                getSystemMetrics(),
                getCacheAndQueueStats()
            ]);
            
            systemMetrics.push(systemMetric);
            cacheStats.push(cacheQueueStat.cache);
            queueStats.push(cacheQueueStat.queue);
            
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            const successRate = totalRequests > 0 ? ((successfulRequests / totalRequests) * 100).toFixed(2) : '0.00';
            const avgLatency = totalRequests > 0 ? (totalLatency / totalRequests).toFixed(2) : '0.00';
            
            console.log(`[${elapsed}s] 📊 Progress: ${totalRequests}/${TOTAL_REQUESTS} | Success: ${successRate}% | Avg Latency: ${avgLatency}ms`);
            
        } catch (error) {
            console.error('Monitoring error:', error.message);
        }
    }, MONITORING_INTERVAL);
    
    return monitorInterval;
};

// Generate test report
const generateReport = () => {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const successRate = ((successfulRequests / totalRequests) * 100).toFixed(2);
    const avgLatency = (totalLatency / totalRequests).toFixed(2);
    const requestsPerSecond = (totalRequests / totalTime).toFixed(2);
    
    // Calculate percentiles
    const latencies = [];
    // We'll need to collect latencies during the test for accurate percentiles
    // For now, we'll use the buckets to estimate
    
    const report = {
        testInfo: {
            totalRequests: TOTAL_REQUESTS,
            concurrentRequests: CONCURRENT_REQUESTS,
            testDuration: totalTime,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date().toISOString()
        },
        results: {
            totalRequests,
            successfulRequests,
            failedRequests,
            successRate: parseFloat(successRate),
            averageLatency: parseFloat(avgLatency),
            minLatency,
            maxLatency,
            requestsPerSecond: parseFloat(requestsPerSecond),
            latencyDistribution: latencyBuckets
        },
        systemMetrics: {
            samples: systemMetrics.length,
            averageMemory: systemMetrics.length > 0 ? 
                systemMetrics.reduce((sum, m) => sum + (m.memory?.[0]?.rss || 0), 0) / systemMetrics.length : 0
        },
        cacheStats: cacheStats.length > 0 ? cacheStats[cacheStats.length - 1] : {},
        queueStats: queueStats.length > 0 ? queueStats[queueStats.length - 1] : {}
    };
    
    return report;
};

// Main test function
const runPerformanceTest = async () => {
    console.log('🚀 Starting Check-Access Performance Test');
    console.log(`📊 Target: ${TOTAL_REQUESTS.toLocaleString()} requests, ${CONCURRENT_REQUESTS} concurrent`);
    console.log(`⏱️  Duration: ${TEST_DURATION} seconds`);
    console.log(`🏢 Tenant Range: ${TENANT_RANGE.min}-${TENANT_RANGE.max}`);
    console.log(`👤 User Range: ${USER_RANGE.min}-${USER_RANGE.max}`);
    console.log(`📦 Resource Range: ${RESOURCE_RANGE.min}-${RESOURCE_RANGE.max}`);
    console.log('='.repeat(80));
    
    startTime = Date.now();
    
    // Start monitoring
    const monitorInterval = startMonitoring();
    
    try {
        // Run requests in batches
        const batchSize = CONCURRENT_REQUESTS;
        const totalBatches = Math.ceil(TOTAL_REQUESTS / batchSize);
        
        for (let batch = 0; batch < totalBatches; batch++) {
            const remainingRequests = TOTAL_REQUESTS - totalRequests;
            const currentBatchSize = Math.min(batchSize, remainingRequests);
            
            if (currentBatchSize <= 0) break;
            
            await runConcurrentRequests(currentBatchSize);
            
            // Progress update
            const progress = ((totalRequests / TOTAL_REQUESTS) * 100).toFixed(2);
            console.log(`📈 Batch ${batch + 1}/${totalBatches}: ${totalRequests}/${TOTAL_REQUESTS} (${progress}%)`);
            
            // Removed delay for production-like speed
        }
        
        // Stop monitoring
        clearInterval(monitorInterval);
        
        // Generate and save report
        const report = generateReport();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportFile = `check_access_performance_report_${timestamp}.json`;
        
        require('fs').writeFileSync(reportFile, JSON.stringify(report, null, 2));
        
        // Print summary
        console.log('\n' + '='.repeat(80));
        console.log('🎉 PERFORMANCE TEST COMPLETED!');
        console.log('='.repeat(80));
        console.log(`⏱️  Total Time: ${report.results.testDuration} seconds`);
        console.log(`📊 Total Requests: ${report.results.totalRequests.toLocaleString()}`);
        console.log(`✅ Successful Requests: ${report.results.successfulRequests.toLocaleString()}`);
        console.log(`❌ Failed Requests: ${report.results.failedRequests.toLocaleString()}`);
        console.log(`📈 Success Rate: ${report.results.successRate}%`);
        console.log(`⚡ Requests/Second: ${report.results.requestsPerSecond}`);
        console.log(`⏱️  Average Latency: ${report.results.averageLatency}ms`);
        console.log(`📊 Min/Max Latency: ${report.results.minLatency}ms / ${report.results.maxLatency}ms`);
        console.log(`📁 Report saved to: ${reportFile}`);
        
        // Latency distribution
        console.log('\n📊 Latency Distribution:');
        Object.entries(report.results.latencyDistribution).forEach(([range, count]) => {
            const percentage = ((count / totalRequests) * 100).toFixed(2);
            console.log(`   ${range}: ${count.toLocaleString()} (${percentage}%)`);
        });
        
        console.log('\n🚀 Performance test completed successfully!');
        
    } catch (error) {
        clearInterval(monitorInterval);
        console.error('❌ Performance test failed:', error.message);
        process.exit(1);
    }
};

// Run the test
runPerformanceTest(); 