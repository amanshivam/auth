const { getTenantEnforcer } = require('./casbin');

async function testEnforcerCreation() {
    console.log('🧪 Testing Enforcer Creation');
    console.log('='.repeat(50));
    
    try {
        console.log('📋 Creating enforcer for test tenant...');
        const enforcer = await getTenantEnforcer('test-tenant-enforcer');
        console.log('✅ Enforcer created successfully!');
        
        console.log('📋 Testing basic enforcer operations...');
        const policies = await enforcer.getPolicy();
        const groupingPolicies = await enforcer.getGroupingPolicy();
        
        console.log(`✅ Enforcer has ${policies.length} policies and ${groupingPolicies.length} grouping policies`);
        
        console.log('📋 Testing access check...');
        const result = await enforcer.enforce('test-user', 'test-resource', 'read', 'test-tenant-enforcer');
        console.log(`✅ Access check result: ${result}`);
        
        console.log('\n' + '='.repeat(50));
        console.log('✅ Enforcer creation test passed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the test
testEnforcerCreation(); 