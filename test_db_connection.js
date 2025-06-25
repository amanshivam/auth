const mysql = require('mysql2/promise');
const logger = require('./logger');

// Test database connection
const testDatabaseConnection = async () => {
    console.log('🔍 Testing Database Connection...');
    console.log('='.repeat(80));
    
    const config = {
        user: 'casbin',
        password: 'casbin1234',
        database: 'casbin_db',
        host: 'localhost',
        port: 3306,
        connectionLimit: 5,
        acquireTimeout: 60000,
        timeout: 60000
    };
    
    try {
        console.log('📡 Attempting to connect to MySQL...');
        const connection = await mysql.createConnection(config);
        console.log('✅ MySQL connection successful');
        
        // Test a simple query
        console.log('📊 Testing simple query...');
        const [rows] = await connection.execute('SELECT COUNT(*) as count FROM casbin_rule');
        console.log('✅ Query successful:', rows[0].count, 'records found');
        
        // Test tenant-specific query
        console.log('📊 Testing tenant query...');
        const [tenantRows] = await connection.execute(
            'SELECT COUNT(*) as count FROM casbin_rule WHERE v3 = ?',
            ['tenantid1']
        );
        console.log('✅ Tenant query successful:', tenantRows[0].count, 'records for tenantid1');
        
        await connection.end();
        console.log('✅ Database connection test completed successfully');
        
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.error('Error code:', error.code);
        console.error('Error errno:', error.errno);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('💡 MySQL server is not running or not accessible');
            console.log('   Start MySQL: brew services start mysql');
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('💡 Access denied - check username/password');
        } else if (error.code === 'ER_BAD_DB_ERROR') {
            console.log('💡 Database does not exist');
        }
        
        return false;
    }
};

// Test Sequelize connection (same as used in casbin.js)
const testSequelizeConnection = async () => {
    console.log('\n🔍 Testing Sequelize Connection...');
    console.log('='.repeat(80));
    
    try {
        const { Sequelize } = require('sequelize');
        
        const sequelize = new Sequelize({
            username: 'casbin',
            password: 'casbin1234',
            database: 'casbin_db',
            dialect: 'mysql',
            host: 'localhost',
            port: 3306,
            pool: {
                max: 5,
                min: 1,
                acquire: 30000,
                idle: 10000
            },
            logging: false
        });
        
        console.log('📡 Testing Sequelize connection...');
        await sequelize.authenticate();
        console.log('✅ Sequelize connection successful');
        
        // Test query
        const [results] = await sequelize.query('SELECT COUNT(*) as count FROM casbin_rule');
        console.log('✅ Sequelize query successful:', results[0].count, 'records');
        
        await sequelize.close();
        console.log('✅ Sequelize connection test completed');
        
        return true;
    } catch (error) {
        console.error('❌ Sequelize connection failed:', error.message);
        return false;
    }
};

// Main test function
const runTests = async () => {
    console.log('🚀 Database Connection Diagnostics');
    console.log('='.repeat(80));
    
    const mysqlSuccess = await testDatabaseConnection();
    const sequelizeSuccess = await testSequelizeConnection();
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 Test Results:');
    console.log(`   MySQL Connection: ${mysqlSuccess ? '✅ Success' : '❌ Failed'}`);
    console.log(`   Sequelize Connection: ${sequelizeSuccess ? '✅ Success' : '❌ Failed'}`);
    
    if (mysqlSuccess && sequelizeSuccess) {
        console.log('\n✅ All database connections working!');
        console.log('💡 The issue might be with the casbin-sequelize-adapter configuration');
    } else {
        console.log('\n❌ Database connection issues detected');
        console.log('💡 Please fix the database connection before running Redis tests');
    }
};

// Run if called directly
if (require.main === module) {
    runTests().catch(error => {
        console.error('Fatal error during database test:', error);
        process.exit(1);
    });
} 