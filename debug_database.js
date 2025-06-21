const mysql = require('mysql2/promise');

async function debugDatabase() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'casbin',
        password: 'casbin1234',
        database: 'casbin_db'
    });

    try {
        console.log('=== Checking all policies in database ===');
        
        // Check all policies
        const [policies] = await connection.execute(
            'SELECT ptype, v0, v1, v2, v3, v4 FROM casbin_rule WHERE ptype = ?',
            ['p']
        );
        console.log('Policies (ptype=p):', policies);
        
        // Check all grouping policies
        const [groupingPolicies] = await connection.execute(
            'SELECT ptype, v0, v1, v2 FROM casbin_rule WHERE ptype = ?',
            ['g']
        );
        console.log('Grouping Policies (ptype=g):', groupingPolicies);
        
        // Check policies for tenant1 specifically
        const [tenant1Policies] = await connection.execute(
            'SELECT ptype, v0, v1, v2, v3, v4 FROM casbin_rule WHERE ptype = ? AND v3 = ?',
            ['p', 'tenant1']
        );
        console.log('Tenant1 Policies:', tenant1Policies);
        
        // Check grouping policies for tenant1 specifically
        const [tenant1GroupingPolicies] = await connection.execute(
            'SELECT ptype, v0, v1, v2 FROM casbin_rule WHERE ptype = ? AND v2 = ?',
            ['g', 'tenant1']
        );
        console.log('Tenant1 Grouping Policies:', tenant1GroupingPolicies);
        
    } catch (error) {
        console.error('Database error:', error);
    } finally {
        await connection.end();
    }
}

debugDatabase(); 