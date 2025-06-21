// WARNING: Do NOT call adapter.close() on the shared singleton adapter except for graceful shutdown!

const sequelize = require('./sequelize');

async function debugLoader() {
    try {
        console.log('=== Testing loadTenantPolicies function ===');
        
        // Load policies (ptype='p') where v3 = tenant
        const policies = await sequelize.query(
            'SELECT v0, v1, v2, v3, v4 FROM casbin_rule WHERE ptype = ? AND v3 = ?',
            {
                replacements: ['p', 'tenant1'],
                type: sequelize.QueryTypes.SELECT,
                timeout: 5000,
                logging: false
            }
        );
        
        console.log('Policies loaded:', policies);
        
        // Load grouping policies (ptype='g') where v2 = tenant
        const groupingPolicies = await sequelize.query(
            'SELECT v0, v1, v2 FROM casbin_rule WHERE ptype = ? AND v2 = ?',
            {
                replacements: ['g', 'tenant1'],
                type: sequelize.QueryTypes.SELECT,
                timeout: 5000,
                logging: false
            }
        );
        
        console.log('Grouping Policies loaded:', groupingPolicies);
        
    } catch (error) {
        console.error('Error:', error);
    }
}

debugLoader(); 