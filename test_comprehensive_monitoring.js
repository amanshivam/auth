const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration
const SERVER_URLS = ['http://localhost:3000', 'http://localhost:3002'];
const TEST_DURATION = 60000; // 1 minute
const REQUEST_INTERVAL = 100; // 100ms between requests
const MONITORING_INTERVAL = 1000; // 1 second

// Test data
const testTenants = ['tenantid1', 'tenantid2', 'tenantid3', 'tenantid4', 'tenantid5'];
const testUsers = ['user1', 'user2', 'user3', 'user4', 'user5'];
const testResources = ['resourceid1', 'resourceid2', 'resourceid3', 'resourceid4', 'resourceid5'];
const testActions = ['read', 'write', 'delete'];

// Monitoring data
const monitoringData = {
  startTime: Date.now(),
  requests: [],
  systemMetrics: [],
  errors: [],
  latencyStats: {
    total: 0,
    sum: 0,
    min: Infinity,
    max: 0,
    percentiles: []
  }
};

// Helper function to get random element
const getRandomElement = (array) => array[Math.floor(Math.random() * array.length)];

// Helper function to get random server
const getRandomServer = () => SERVER_URLS[Math.floor(Math.random() * SERVER_URLS.length)];

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

// Request monitoring
const makeRequest = async (endpoint, data) => {
  const start = Date.now();
  const server = getRandomServer();
  
  try {
    const response = await axios.post(`${server}${endpoint}`, data, {
      timeout: 10000
    });
    
    const duration = Date.now() - start;
    const requestData = {
      timestamp: start,
      endpoint,
      server,
      duration,
      status: response.status,
      success: true,
      data: response.data
    };
    
    monitoringData.requests.push(requestData);
    
    // Update latency stats
    monitoringData.latencyStats.total++;
    monitoringData.latencyStats.sum += duration;
    monitoringData.latencyStats.min = Math.min(monitoringData.latencyStats.min, duration);
    monitoringData.latencyStats.max = Math.max(monitoringData.latencyStats.max, duration);
    
    return requestData;
  } catch (error) {
    const duration = Date.now() - start;
    const requestData = {
      timestamp: start,
      endpoint,
      server,
      duration,
      status: error.response?.status || 0,
      success: false,
      error: error.message
    };
    
    monitoringData.requests.push(requestData);
    monitoringData.errors.push(requestData);
    
    // Update latency stats even for failed requests
    monitoringData.latencyStats.total++;
    monitoringData.latencyStats.sum += duration;
    monitoringData.latencyStats.min = Math.min(monitoringData.latencyStats.min, duration);
    monitoringData.latencyStats.max = Math.max(monitoringData.latencyStats.max, duration);
    
    return requestData;
  }
};

// Test scenarios
const testScenarios = [
  // Health check
  () => axios.get(`${getRandomServer()}/health`),
  
  // Create group
  () => makeRequest('/create-group', {
    groupName: `testgroup${Date.now()}`,
    tenant: getRandomElement(testTenants)
  }),
  
  // Add permission
  () => makeRequest('/add-permission', {
    role: `group${Math.floor(Math.random() * 5) + 1}`,
    obj: getRandomElement(testResources),
    act: getRandomElement(testActions),
    tenant: getRandomElement(testTenants)
  }),
  
  // Assign user
  () => makeRequest('/assign-user', {
    userId: getRandomElement(testUsers),
    groupName: `group${Math.floor(Math.random() * 5) + 1}`,
    tenant: getRandomElement(testTenants)
  }),
  
  // Check access
  () => makeRequest('/check-access', {
    userId: getRandomElement(testUsers),
    obj: getRandomElement(testResources),
    act: getRandomElement(testActions),
    tenant: getRandomElement(testTenants)
  }),
  
  // Get user policies
  () => makeRequest('/getUserPolicies', {
    userId: getRandomElement(testUsers),
    tenant: getRandomElement(testTenants)
  }),
  
  // Cache stats
  () => axios.get(`${getRandomServer()}/cache-stats`)
];

// Main test function
const runComprehensiveTest = async () => {
  console.log('🔍 Starting Comprehensive System Monitoring Test');
  console.log('=' .repeat(80));
  console.log(`📊 Configuration:`);
  console.log(`   - Test Duration: ${TEST_DURATION / 1000} seconds`);
  console.log(`   - Request Interval: ${REQUEST_INTERVAL}ms`);
  console.log(`   - Monitoring Interval: ${MONITORING_INTERVAL}ms`);
  console.log(`   - Servers: ${SERVER_URLS.join(', ')}`);
  console.log('=' .repeat(80));
  
  const startTime = Date.now();
  let requestCount = 0;
  
  // Start system monitoring
  const systemMonitoringInterval = setInterval(async () => {
    const metrics = await getSystemMetrics();
    monitoringData.systemMetrics.push(metrics);
  }, MONITORING_INTERVAL);
  
  // Start request testing
  const requestInterval = setInterval(async () => {
    if (Date.now() - startTime >= TEST_DURATION) {
      clearInterval(requestInterval);
      clearInterval(systemMonitoringInterval);
      await finishTest();
      return;
    }
    
    // Execute random test scenario
    const scenario = testScenarios[Math.floor(Math.random() * testScenarios.length)];
    try {
      await scenario();
      requestCount++;
      
      if (requestCount % 10 === 0) {
        console.log(`📈 Processed ${requestCount} requests...`);
      }
    } catch (error) {
      console.error('Test scenario error:', error.message);
    }
  }, REQUEST_INTERVAL);
  
  // Wait for test completion
  await new Promise(resolve => {
    setTimeout(resolve, TEST_DURATION + 1000);
  });
};

// Finish test and generate report
const finishTest = async () => {
  console.log('\n📊 Generating Comprehensive Test Report...');
  
  // Calculate latency percentiles
  const latencies = monitoringData.requests.map(r => r.duration).sort((a, b) => a - b);
  monitoringData.latencyStats.percentiles = {
    p50: latencies[Math.floor(latencies.length * 0.5)],
    p90: latencies[Math.floor(latencies.length * 0.9)],
    p95: latencies[Math.floor(latencies.length * 0.95)],
    p99: latencies[Math.floor(latencies.length * 0.99)]
  };
  
  // Generate report
  const report = generateReport();
  
  // Save detailed data
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = path.join(__dirname, `test_report_${timestamp}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(monitoringData, null, 2));
  
  console.log(`📄 Detailed report saved to: ${reportFile}`);
  console.log(report);
};

// Generate comprehensive report
const generateReport = () => {
  const totalTime = (Date.now() - monitoringData.startTime) / 1000;
  const totalRequests = monitoringData.requests.length;
  const successfulRequests = monitoringData.requests.filter(r => r.success).length;
  const failedRequests = monitoringData.errors.length;
  const successRate = (successfulRequests / totalRequests * 100).toFixed(2);
  const avgLatency = monitoringData.latencyStats.sum / monitoringData.latencyStats.total;
  
  // System metrics analysis
  const memoryUsage = monitoringData.systemMetrics
    .filter(m => m.memory && m.memory.length > 0)
    .map(m => m.memory[0]?.rss || 0);
  
  const avgMemory = memoryUsage.length > 0 ? 
    memoryUsage.reduce((a, b) => a + b, 0) / memoryUsage.length : 0;
  const maxMemory = Math.max(...memoryUsage, 0);
  
  // Endpoint analysis
  const endpointStats = {};
  monitoringData.requests.forEach(req => {
    if (!endpointStats[req.endpoint]) {
      endpointStats[req.endpoint] = { count: 0, totalLatency: 0, errors: 0 };
    }
    endpointStats[req.endpoint].count++;
    endpointStats[req.endpoint].totalLatency += req.duration;
    if (!req.success) endpointStats[req.endpoint].errors++;
  });
  
  let report = '\n' + '=' .repeat(80);
  report += '\n📈 COMPREHENSIVE TEST REPORT';
  report += '\n' + '=' .repeat(80);
  
  report += '\n📊 Overall Statistics:';
  report += `\n   - Test Duration: ${totalTime.toFixed(2)} seconds`;
  report += `\n   - Total Requests: ${totalRequests}`;
  report += `\n   - Successful Requests: ${successfulRequests}`;
  report += `\n   - Failed Requests: ${failedRequests}`;
  report += `\n   - Success Rate: ${successRate}%`;
  report += `\n   - Requests per Second: ${(totalRequests / totalTime).toFixed(2)}`;
  
  report += '\n\n⏱️  Latency Statistics:';
  report += `\n   - Average Latency: ${avgLatency.toFixed(2)}ms`;
  report += `\n   - Min Latency: ${monitoringData.latencyStats.min}ms`;
  report += `\n   - Max Latency: ${monitoringData.latencyStats.max}ms`;
  report += `\n   - P50 (Median): ${monitoringData.latencyStats.percentiles.p50}ms`;
  report += `\n   - P90: ${monitoringData.latencyStats.percentiles.p90}ms`;
  report += `\n   - P95: ${monitoringData.latencyStats.percentiles.p95}ms`;
  report += `\n   - P99: ${monitoringData.latencyStats.percentiles.p99}ms`;
  
  report += '\n\n💾 System Metrics:';
  report += `\n   - Average Memory Usage: ${(avgMemory / 1024).toFixed(2)} MB`;
  report += `\n   - Peak Memory Usage: ${(maxMemory / 1024).toFixed(2)} MB`;
  report += `\n   - System Metrics Collected: ${monitoringData.systemMetrics.length}`;
  
  report += '\n\n🔍 Endpoint Analysis:';
  Object.entries(endpointStats).forEach(([endpoint, stats]) => {
    const avgLatency = stats.totalLatency / stats.count;
    const errorRate = (stats.errors / stats.count * 100).toFixed(2);
    report += `\n   ${endpoint}:`;
    report += `\n     - Requests: ${stats.count}`;
    report += `\n     - Avg Latency: ${avgLatency.toFixed(2)}ms`;
    report += `\n     - Error Rate: ${errorRate}%`;
  });
  
  if (failedRequests > 0) {
    report += '\n\n❌ Error Analysis:';
    const errorTypes = {};
    monitoringData.errors.forEach(error => {
      const type = error.error || 'Unknown';
      errorTypes[type] = (errorTypes[type] || 0) + 1;
    });
    
    Object.entries(errorTypes).forEach(([type, count]) => {
      const percentage = (count / failedRequests * 100).toFixed(2);
      report += `\n   ${type}: ${count} occurrences (${percentage}%)`;
    });
  }
  
  report += '\n\n💡 Performance Insights:';
  if (avgLatency > 1000) {
    report += '\n   ⚠️  Average latency is high (>1s). Consider optimizing database queries.';
  } else if (avgLatency > 500) {
    report += '\n   ⚠️  Average latency is moderate (>500ms). Monitor for bottlenecks.';
  } else {
    report += '\n   ✅ Average latency is good (<500ms).';
  }
  
  if (successRate < 95) {
    report += '\n   ⚠️  Success rate is below 95%. Investigate error patterns.';
  } else {
    report += '\n   ✅ Success rate is excellent (>95%).';
  }
  
  if (maxMemory > 500 * 1024) { // 500MB
    report += '\n   ⚠️  Peak memory usage is high (>500MB). Monitor for memory leaks.';
  } else {
    report += '\n   ✅ Memory usage is within acceptable limits.';
  }
  
  report += '\n' + '=' .repeat(80);
  
  return report;
};

// Run the test
if (require.main === module) {
  runComprehensiveTest().catch(error => {
    console.error('Fatal error during comprehensive test:', error);
    process.exit(1);
  });
}

module.exports = { runComprehensiveTest };