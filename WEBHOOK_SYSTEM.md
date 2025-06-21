# Webhook-Based Cache Consistency System

This system ensures immediate cache consistency across multiple server instances by using webhook notifications.

## How It Works

1. **Policy Update**: When a server updates policies (create group, add permission, assign user)
2. **Database Update**: Changes are saved to the database
3. **Local Refresh**: The updating server refreshes its own cache
4. **Webhook Notification**: The server notifies all other servers via HTTP webhooks
5. **Remote Refresh**: Other servers immediately refresh their caches
6. **Immediate Consistency**: All servers have the latest policies within milliseconds

## Configuration

### Environment Variables

```bash
# Server identifier (auto-generated if not set)
SERVER_ID=my-server-1

# Secret key for webhook authentication
WEBHOOK_SECRET=your-secret-key-here

# Comma-separated list of other server URLs
OTHER_SERVERS=http://localhost:3001,http://localhost:3002,http://localhost:3003
```

### Example Startup Commands

```bash
# Server 1
OTHER_SERVERS=http://localhost:3001,http://localhost:3002 WEBHOOK_SECRET=mysecret123 node index.js 3000

# Server 2  
OTHER_SERVERS=http://localhost:3000,http://localhost:3002 WEBHOOK_SECRET=mysecret123 node index.js 3001

# Server 3
OTHER_SERVERS=http://localhost:3000,http://localhost:3001 WEBHOOK_SECRET=mysecret123 node index.js 3002
```

## API Endpoints

### Webhook Endpoints

- `POST /webhook/refresh` - Receive refresh notifications from other servers
- `GET /health` - Health check and server information
- `GET /servers` - Server configuration and discovery

### Standard Endpoints (Enhanced)

All write operations now trigger webhook notifications:

- `POST /create-group` - Creates group and notifies other servers
- `POST /add-permission` - Adds permission and notifies other servers  
- `POST /assign-user` - Assigns user and notifies other servers

## Testing

Run the webhook system test:

```bash
node test_webhook_system.js
```

This test will:
1. Check server health
2. Create a group on Server 1
3. Add permissions on Server 1
4. Assign a user on Server 1
5. Immediately check access on Server 2 (should work due to webhooks)

## Benefits

✅ **Immediate Consistency**: No waiting for auto-refresh intervals
✅ **Low Latency**: Webhook notifications are fast (milliseconds)
✅ **Reliable**: Uses HTTP with retry logic
✅ **Secure**: Webhook secret authentication
✅ **Scalable**: Works with any number of servers
✅ **Fault Tolerant**: Failed notifications don't block operations

## Monitoring

Check webhook activity in server logs:

```
✅ Notified http://localhost:3001 to refresh tenant: tenant1
🔄 Received refresh notification from server-3000 for tenant: tenant1, operation: assign-user
```

## Troubleshooting

### Webhook Notifications Failing

1. Check server URLs in `OTHER_SERVERS`
2. Verify webhook secret matches across all servers
3. Check network connectivity between servers
4. Review server logs for error messages

### Cache Inconsistency

1. Verify webhook endpoints are accessible
2. Check if servers are receiving notifications
3. Monitor auto-refresh logs as fallback
4. Use manual refresh endpoint if needed: `POST /refresh-tenant`

## Security Considerations

- Use strong, unique webhook secrets
- Run servers on private networks when possible
- Consider HTTPS for webhook communications in production
- Monitor webhook endpoints for abuse 