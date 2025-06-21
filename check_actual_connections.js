const mysql = require('mysql2/promise');

async function checkActualConnections() {
    console.log('🔍 Checking Actual MySQL Connection Usage');
    console.log('=' .repeat(50));
    
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'casbin',
        password: 'casbin1234',
        database: 'casbin_db'
    });
    
    try {
        // Get connection limits and current usage
        const [maxConnections] = await connection.execute('SHOW VARIABLES LIKE "max_connections"');
        const [currentConnections] = await connection.execute('SHOW STATUS LIKE "Threads_connected"');
        const [processList] = await connection.execute('SHOW PROCESSLIST');
        
        const maxConn = maxConnections[0].Value;
        const currentConn = currentConnections[0].Value;
        const usagePercent = ((currentConn / maxConn) * 100).toFixed(1);
        
        console.log(`📊 Connection Summary:`);
        console.log(`   MySQL max_connections: ${maxConn}`);
        console.log(`   Currently connected: ${currentConn}`);
        console.log(`   Usage: ${usagePercent}%`);
        console.log('');
        
        // Group connections by user and show details
        const userConnections = {};
        processList.forEach(process => {
            const user = process.User || 'unknown';
            if (!userConnections[user]) {
                userConnections[user] = [];
            }
            userConnections[user].push({
                id: process.Id,
                host: process.Host,
                db: process.db,
                command: process.Command,
                time: process.Time,
                state: process.State,
                info: process.Info
            });
        });
        
        console.log('🔍 Active Connections by User:');
        console.log('=' .repeat(50));
        
        Object.entries(userConnections).forEach(([user, connections]) => {
            console.log(`\n👤 User: ${user} (${connections.length} connections)`);
            
            connections.forEach(conn => {
                const status = conn.command === 'Sleep' ? '💤' : '🔄';
                const timeStr = conn.time > 0 ? `${conn.time}s` : '0s';
                console.log(`   ${status} ID:${conn.id} | ${conn.command} | ${timeStr} | ${conn.host} | ${conn.db || 'no db'}`);
                
                if (conn.info && conn.command !== 'Sleep') {
                    console.log(`      Query: ${conn.info.substring(0, 50)}${conn.info.length > 50 ? '...' : ''}`);
                }
            });
        });
        
        // Show connection distribution
        console.log('\n📈 Connection Distribution:');
        console.log('=' .repeat(50));
        Object.entries(userConnections).forEach(([user, connections]) => {
            const sleeping = connections.filter(c => c.command === 'Sleep').length;
            const active = connections.length - sleeping;
            console.log(`   ${user}: ${connections.length} total (${active} active, ${sleeping} sleeping)`);
        });
        
        // Check for potential connection leaks
        const longSleeping = processList.filter(p => p.Command === 'Sleep' && p.Time > 300); // >5 minutes
        if (longSleeping.length > 0) {
            console.log('\n⚠️  Long-sleeping connections (>5 minutes):');
            longSleeping.forEach(conn => {
                console.log(`   ID:${conn.Id} | ${conn.User} | ${conn.Host} | ${conn.Time}s`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error checking connections:', error.message);
    } finally {
        await connection.end();
    }
}

checkActualConnections().catch(console.error); 