# Memory Optimization for RBAC System

## Problem Analysis

The system was experiencing **JavaScript heap out of memory** errors during high-load check-access operations due to:

1. **Uncontrolled LRU Cache Growth**: Cache size was 100 tenants with no memory-based eviction
2. **Aggressive Auto-Refresh**: Refreshing all tenants every 5 minutes without memory checks
3. **No Memory Monitoring**: No visibility into heap usage during operations
4. **Poor Enforcer Cleanup**: Old enforcers not properly cleared from memory
5. **Concurrent Request Overload**: Multiple requests creating enforcers simultaneously

## Optimizations Implemented

### 1. Enhanced LRU Cache with Memory Management

```javascript
class TenantEnforcerCache {
  constructor(maxSize = 50) { // Reduced from 100 to 50
    this.memoryUsage = new Map(); // Track memory per tenant
    this.cleanupInterval = 60000; // Cleanup every minute
  }
  
  // Memory-aware eviction
  cleanup() {
    const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    if (heapUsagePercent > 80) {
      // Aggressive eviction: remove 50% of cache
      const evictCount = Math.floor(this.cache.size * 0.5);
    }
  }
  
  // Proper enforcer cleanup
  evictTenant(tenant) {
    const enforcer = this.cache.get(tenant);
    if (enforcer) {
      enforcer.clearPolicy();
      enforcer.clearGroupingPolicy();
      if (global.gc) global.gc(); // Force garbage collection
    }
  }
}
```

### 2. Memory-Aware Auto-Refresh

```javascript
const setupAutoRefresh = () => {
  setInterval(async () => {
    const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    // Skip refresh if memory usage is too high
    if (heapUsagePercent > 85) {
      logger.warn(`⚠️ Skipping auto-refresh due to high memory usage: ${heapUsagePercent.toFixed(1)}%`);
      return;
    }
    
    // Process in smaller batches with memory checks
    const batchSize = 3; // Reduced from 5
    for (let i = 0; i < tenants.length; i += batchSize) {
      const currentHeapPercent = (currentMemory.heapUsed / currentMemory.heapTotal) * 100;
      
      if (currentHeapPercent > 90) {
        logger.warn(`⚠️ Stopping auto-refresh due to critical memory usage`);
        break;
      }
      
      // Process batch with longer delays
      await new Promise(resolve => setTimeout(resolve, 2000)); // Increased from 1000ms
    }
  }, 600000); // Increased from 5 minutes to 10 minutes
};
```

### 3. Memory Monitoring System

```javascript
const monitorMemory = () => {
  const memoryUsage = tenantCache.getCurrentMemoryUsage();
  const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
  
  logger.info(`📊 Memory Status - Heap: ${memoryUsage.heapUsed}MB/${memoryUsage.heapTotal}MB (${heapUsagePercent.toFixed(1)}%)`);
  
  // Force garbage collection if memory usage is high
  if (heapUsagePercent > 80 && global.gc) {
    logger.info(`🧹 Forcing garbage collection due to high memory usage`);
    global.gc();
  }
};
```

### 4. Optimized Refresh Function

```javascript
const refreshTenantPolicies = async (tenant) => {
  // Check memory before refresh
  const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
  
  if (heapUsagePercent > 95) {
    logger.warn(`⚠️ Skipping refresh for tenant ${tenant} due to critical memory usage`);
    return;
  }
  
  // Clean up old enforcer first
  const oldEnforcer = tenantCache.get(tenant);
  if (oldEnforcer) {
    oldEnforcer.clearPolicy();
    oldEnforcer.clearGroupingPolicy();
  }
  
  // Create new enforcer
  const newEnforcer = await createTenantEnforcer(tenant);
  tenantCache.set(tenant, newEnforcer);
};
```

### 5. New API Endpoints

- **`GET /memory-stats`**: Real-time memory monitoring
- **Enhanced `GET /cache-stats`**: Detailed cache statistics with memory usage

## Configuration Changes

### Cache Settings
- **Max Cache Size**: 100 → 50 tenants
- **Cleanup Interval**: Every minute
- **Aggressive Eviction**: Triggered at 80% heap usage

### Auto-Refresh Settings
- **Frequency**: 5 minutes → 10 minutes
- **Batch Size**: 5 → 3 tenants
- **Batch Delay**: 1 second → 2 seconds
- **Memory Threshold**: Skip at 85% heap usage

### Memory Monitoring
- **Monitoring Interval**: Every 30 seconds
- **GC Trigger**: At 80% heap usage
- **Critical Threshold**: 95% heap usage

## Testing

### Memory Optimization Test
```bash
node test_memory_optimization.js
```

This test:
- Runs concurrent check-access requests for 1 minute
- Monitors memory usage every 5 seconds
- Reports peak, average, and minimum memory usage
- Validates optimization effectiveness

### Expected Results
- **Peak Memory**: < 90% (vs previous 100%+ causing crashes)
- **Memory Stability**: Consistent usage patterns
- **Cache Efficiency**: Proper eviction and cleanup
- **No Crashes**: System remains stable under load

## Production Recommendations

### 1. Node.js Configuration
```bash
# Increase heap size for safety
NODE_OPTIONS="--max-old-space-size=8192 --expose-gc" nodemon index.js
```

### 2. Monitoring
- Monitor `/memory-stats` endpoint during high load
- Set alerts for memory usage > 85%
- Track cache hit/miss ratios

### 3. Scaling
- Start with 50 tenant cache size
- Increase gradually based on memory monitoring
- Consider distributed caching for very large deployments

### 4. Database Optimization
- Monitor connection pool usage
- Consider read replicas for policy loading
- Implement policy caching at database level

## Benefits

### ✅ **Prevents Memory Crashes**
- Aggressive memory monitoring and cleanup
- Automatic garbage collection triggers
- Memory-aware operations

### ✅ **Improved Performance**
- Better cache efficiency
- Reduced memory pressure
- Stable response times

### ✅ **Production Ready**
- Real-time monitoring capabilities
- Configurable thresholds
- Graceful degradation under load

### ✅ **Scalable Architecture**
- Memory-based eviction strategies
- Batch processing with memory checks
- Proper resource cleanup

## Future Enhancements

1. **Distributed Caching**: Redis-based tenant cache sharing
2. **Policy Compression**: Reduce memory footprint of policies
3. **Lazy Loading**: Load policies only when needed
4. **Memory Pooling**: Reuse enforcer objects
5. **Predictive Eviction**: ML-based cache optimization

## Conclusion

The memory optimizations provide a robust foundation for handling large-scale RBAC operations while preventing heap out of memory errors. The system now gracefully handles memory pressure and maintains stable performance under load. 