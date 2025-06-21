const mysql = require('mysql2/promise');

async function monitorMySQLConnections() {
    console.log('🔍 MySQL Connection Monitor Started');
    console.log('=' .repeat(50));
    
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'casbin',
        password: 'casbin1234',
        database: 'casbin_db'
    });
    
    let iteration = 0;
    
    const monitor = setInterval(async () => {
        try {
            iteration++;
            
            // Get connection stats
            const [maxConnections] = await connection.execute('SHOW VARIABLES LIKE "max_connections"');
            const [currentConnections] = await connection.execute('SHOW STATUS LIKE "Threads_connected"');
            const [processList] = await connection.execute('SHOW PROCESSLIST');
            
            const maxConn = maxConnections[0].Value;
            const currentConn = currentConnections[0].Value;
            const usagePercent = ((currentConn / maxConn) * 100).toFixed(1);
            
            console.log(`\n📊 Iteration ${iteration} - ${new Date().toLocaleTimeString()}`);
            console.log(`Max Connections: ${maxConn}`);
            console.log(`Current Connections: ${currentConn} (${usagePercent}%)`);
            
            // Show active connections by user
            const userConnections = {};
            processList.forEach(process => {
                const user = process.User || 'unknown';
                userConnections[user] = (userConnections[user] || 0) + 1;
            });
            
            console.log('Active connections by user:');
            Object.entries(userConnections).forEach(([user, count]) => {
                console.log(`  ${user}: ${count} connections`);
            });
            
            // Show long-running queries (>5 seconds)
            const longQueries = processList.filter(p => p.Time > 5 && p.Command !== 'Sleep');
            if (longQueries.length > 0) {
                console.log('⚠️  Long-running queries (>5s):');
                longQueries.forEach(q => {
                    console.log(`  ${q.Id}: ${q.Command} - ${q.Time}s - ${q.Info || 'No query'}`);
                });
            }
            
            // Show sleeping connections
            const sleepingConnections = processList.filter(p => p.Command === 'Sleep');
            console.log(`Sleeping connections: ${sleepingConnections.length}`);
            
            // Alert if usage is high
            if (usagePercent > 80) {
                console.log('🚨 WARNING: High connection usage!');
            }
            
        } catch (error) {
            console.error('❌ Error monitoring connections:', error.message);
        }
    }, 2000); // Check every 2 seconds
    
    // Stop monitoring after 5 minutes
    setTimeout(() => {
        clearInterval(monitor);
        connection.end();
        console.log('\n🛑 Monitoring stopped');
    }, 300000);
    
    console.log('Monitoring will continue for 5 minutes...');
    console.log('Press Ctrl+C to stop early');
}

monitorMySQLConnections().catch(console.error); 