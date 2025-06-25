# Redis Pub/Sub for Cross-Server Synchronization

## Overview

We've replaced the auto-refresh polling mechanism with **Redis Pub/Sub** for real-time cross-server synchronization. This provides immediate cache invalidation across all server instances when policies change.

## Architecture

### Before: Auto-Refresh Polling
- ❌ Periodic polling every 10 minutes
- ❌ High memory usage during refresh cycles
- ❌ Delayed synchronization (up to 10 minutes)
- ❌ HTTP webhook calls between servers

### After: Redis Pub/Sub
- ✅ Real-time synchronization
- ✅ Event-driven cache invalidation
- ✅ Lower memory usage (no polling)
- ✅ Reliable message delivery

## Implementation

### 1. Redis Connection Setup

```javascript
// Initialize Redis clients
const redisPublisher = redis.createClient({ url: 'redis://localhost:6379' });
const redisSubscriber = redis.createClient({ url: 'redis://localhost:6379' });

// Subscribe to tenant refresh channel
await redisSubscriber.subscribe('tenant-refresh', (message) => {
  const data = JSON.parse(message);
  handleTenantRefresh(data);
});
```

### 2. Publishing Refresh Events

```javascript
const publishTenantRefresh = async (tenant, operation) => {
  const message = {
    tenant,
    operation,
    serverId: process.env.SERVER_ID || `server-${process.env.PORT || 3000}`,
    timestamp: new Date().toISOString()
  };
  
  await redisPublisher.publish('tenant-refresh', JSON.stringify(message));
};
```

### 3. Handling Refresh Events

```javascript
const handleTenantRefresh = async (data) => {
  const { tenant, operation, serverId } = data;
  
  // Skip if this is our own message
  if (serverId === process.env.SERVER_ID) {
    return;
  }
  
  // Refresh the tenant's cache
  await refreshTenantPolicies(tenant);
};
```

## API Changes

### Updated Endpoints

All policy modification endpoints now use `refreshTenantAndNotify()`:

- **`POST /create-group`**: Creates group and notifies via Redis
- **`POST /add-permission`**: Adds permission and notifies via Redis  
- **`POST /assign-user`**: Assigns user and notifies via Redis
- **`POST /refresh-tenant`**: Manual refresh with Redis notification

### Removed Endpoints

- ❌ `POST /webhook/refresh` (replaced by Redis)
- ❌ `GET /servers` (no longer needed)

## Configuration

### Environment Variables

```bash
# Server identification (optional)
SERVER_ID=server-1
PORT=3000

# Redis connection (defaults to localhost:6379)
REDIS_URL=redis://localhost:6379
```

### Redis Setup

```bash
# Install Redis (macOS)
brew install redis

# Start Redis
redis-server

# Test connection
redis-cli ping
```

## Testing

### Redis Sync Test

```bash
# Install Redis dependency
npm install redis

# Start multiple servers
PORT=3000 node index.js &
PORT=3001 node index.js &
PORT=3002 node index.js &

# Run Redis sync test
node test_redis_sync.js
```

### Expected Results

```
🔄 Testing Redis Pub/Sub Synchronization
==========================================

📝 Step 1: Creating group on server 1...
✅ Group created: { success: true, message: "Group 'testgroup' is ready to use..." }

📝 Step 2: Adding permission on server 2...
✅ Permission added: { success: true }

📝 Step 3: Assigning user on server 3...
✅ User assigned: { success: true }

📝 Step 4: Testing access on all servers...
✅ Server 1 (http://localhost:3000): Access ALLOWED
✅ Server 2 (http://localhost:3001): Access ALLOWED
✅ Server 3 (http://localhost:3002): Access ALLOWED

🎉 Redis Pub/Sub Synchronization Test Completed!
```

## Benefits

### ✅ **Real-time Synchronization**
- Immediate cache invalidation across all servers
- No polling delays or missed updates
- Event-driven architecture

### ✅ **Reduced Resource Usage**
- No periodic refresh cycles
- Lower memory pressure
- More efficient network usage

### ✅ **Improved Reliability**
- Redis handles message delivery
- Automatic reconnection
- No HTTP timeout issues

### ✅ **Better Scalability**
- Horizontal scaling without configuration
- Dynamic server discovery
- No hardcoded server lists

## Monitoring

### Redis Connection Status

Check server logs for Redis connection messages:
```
✅ Redis pub/sub initialized successfully
📡 Published refresh to Redis for tenant: tenantid1
🔄 Received Redis refresh for tenant: tenantid1, operation: add-permission from server-3001
```

### Cache Statistics

Monitor cache consistency across servers:
```bash
curl http://localhost:3000/cache-stats
curl http://localhost:3001/cache-stats
curl http://localhost:3002/cache-stats
```

## Troubleshooting

### Redis Connection Issues

1. **Check Redis is running**:
   ```bash
   redis-cli ping
   ```

2. **Verify Redis URL**:
   ```javascript
   // Default: redis://localhost:6379
   const redisPublisher = redis.createClient({
     url: process.env.REDIS_URL || 'redis://localhost:6379'
   });
   ```

3. **Check server logs**:
   ```
   ❌ Failed to initialize Redis: connect ECONNREFUSED
   ```

### Message Delivery Issues

1. **Check server IDs**:
   ```javascript
   // Ensure unique server identification
   const serverId = process.env.SERVER_ID || `server-${process.env.PORT || 3000}`;
   ```

2. **Verify message format**:
   ```javascript
   // Message structure
   {
     tenant: 'tenantid1',
     operation: 'add-permission',
     serverId: 'server-3000',
     timestamp: '2024-01-01T00:00:00.000Z'
   }
   ```

## Production Considerations

### 1. Redis High Availability
- Use Redis Cluster or Redis Sentinel
- Configure failover mechanisms
- Monitor Redis health

### 2. Message Persistence
- Consider Redis Streams for message persistence
- Implement retry mechanisms
- Handle message ordering

### 3. Security
- Use Redis authentication
- Configure network security
- Encrypt sensitive data

### 4. Monitoring
- Monitor Redis memory usage
- Track message delivery rates
- Alert on connection failures

## Migration from Webhooks

### Before (Webhooks)
```javascript
// HTTP webhook calls
await notifyOtherServers(tenant, 'add-permission');
await refreshTenantPolicies(tenant);
```

### After (Redis)
```javascript
// Redis pub/sub
await refreshTenantAndNotify(tenant, 'add-permission');
```

### Benefits of Migration
- ✅ **Faster**: No HTTP round-trips
- ✅ **Reliable**: Redis handles delivery
- ✅ **Scalable**: No server list management
- ✅ **Efficient**: Event-driven architecture

## Conclusion

The Redis Pub/Sub implementation provides a robust, scalable solution for cross-server synchronization. It eliminates the need for polling and provides real-time cache invalidation across all server instances. 