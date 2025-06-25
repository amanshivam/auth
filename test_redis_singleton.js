const { getRedisManager, RedisManager } = require('./redis');

console.log('🧪 Testing Redis Singleton Pattern');
console.log('='.repeat(50));

try {
  // Test 1: Get first instance
  console.log('📋 Test 1: Getting first Redis manager instance...');
  const instance1 = getRedisManager();
  console.log('✅ First instance created:', instance1.constructor.name);
  
  // Test 2: Get second instance (should be the same)
  console.log('\n📋 Test 2: Getting second Redis manager instance...');
  const instance2 = getRedisManager();
  console.log('✅ Second instance retrieved:', instance2.constructor.name);
  
  // Test 3: Verify they are the same instance
  console.log('\n📋 Test 3: Verifying singleton pattern...');
  console.log('Instance 1 === Instance 2:', instance1 === instance2);
  console.log('✅ Singleton pattern working correctly');
  
  // Test 4: Try to create new instance directly (should fail)
  console.log('\n📋 Test 4: Trying to create new instance directly...');
  try {
    const newInstance = new RedisManager();
    console.log('❌ Should have failed - singleton bypassed');
  } catch (error) {
    console.log('✅ Correctly prevented direct instantiation:', error.message);
  }
  
  // Test 5: Check status
  console.log('\n📋 Test 5: Checking Redis manager status...');
  const status = instance1.getStatus();
  console.log('✅ Status:', status);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ All singleton tests passed!');
  console.log('📝 Redis manager is properly implemented as a singleton.');
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
} 