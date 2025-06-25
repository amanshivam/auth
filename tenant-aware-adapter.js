const { SequelizeAdapter } = require('casbin-sequelize-adapter');
const { Sequelize } = require('sequelize');

class TenantAwareAdapter extends SequelizeAdapter {
  constructor(sequelize, options = {}) {
    super(sequelize, options);
    this.tenant = null;
    this.sequelize = sequelize; // Ensure sequelize is properly set
  }

  // Set the tenant for this adapter instance
  setTenant(tenant) {
    this.tenant = tenant;
  }

  // Override loadPolicy to only load policies for the specific tenant
  async loadPolicy(model) {
    if (!this.tenant) {
      throw new Error('Tenant must be set before loading policies');
    }

    console.log(`📊 Loading policies for tenant: ${this.tenant}`);
    
    try {
      // Load policies (ptype='p') where v3 = tenant
      const policies = await this.sequelize.query(
        'SELECT v0, v1, v2, v3, v4 FROM casbin_rule WHERE ptype = ? AND v3 = ?',
        {
          replacements: ['p', this.tenant],
          type: Sequelize.QueryTypes.SELECT,
          timeout: 10000,
          logging: false
        }
      );

      // Load grouping policies (ptype='g') where v2 = tenant
      const groupingPolicies = await this.sequelize.query(
        'SELECT v0, v1, v2 FROM casbin_rule WHERE ptype = ? AND v2 = ?',
        {
          replacements: ['g', this.tenant],
          type: Sequelize.QueryTypes.SELECT,
          timeout: 10000,
          logging: false
        }
      );

      console.log(`✅ Loaded ${policies.length} policies and ${groupingPolicies.length} grouping policies for tenant: ${this.tenant}`);

      // Load policies into the model
      for (const policy of policies) {
        const policyArray = [policy.v0, policy.v1, policy.v2, policy.v3, policy.v4].filter(v => v !== null);
        model.addPolicy('p', 'p', policyArray);
      }

      // Load grouping policies into the model
      for (const groupingPolicy of groupingPolicies) {
        const policyArray = [groupingPolicy.v0, groupingPolicy.v1, groupingPolicy.v2];
        model.addPolicy('g', 'g', policyArray);
      }

      console.log(`✅ Successfully loaded policies for tenant: ${this.tenant}`);
    } catch (error) {
      console.error(`❌ Failed to load policies for tenant ${this.tenant}:`, error.message);
      throw error;
    }
  }

  // Override savePolicy to ensure tenant is set
  async savePolicy(model) {
    if (!this.tenant) {
      throw new Error('Tenant must be set before saving policies');
    }
    
    // Clear existing policies for this tenant
    await this.sequelize.query(
      'DELETE FROM casbin_rule WHERE (ptype = ? AND v3 = ?) OR (ptype = ? AND v2 = ?)',
      {
        replacements: ['p', this.tenant, 'g', this.tenant],
        timeout: 10000
      }
    );

    // Save policies with tenant information
    const policies = model.getPolicy('p', 'p');
    for (const policy of policies) {
      const policyArray = [...policy, this.tenant]; // Add tenant as v3
      await this.addPolicy('p', 'p', policyArray);
    }

    // Save grouping policies with tenant information
    const groupingPolicies = model.getPolicy('g', 'g');
    for (const policy of groupingPolicies) {
      const policyArray = [...policy.slice(0, 2), this.tenant]; // Add tenant as v2
      await this.addPolicy('g', 'g', policyArray);
    }

    console.log(`✅ Saved ${policies.length} policies and ${groupingPolicies.length} grouping policies for tenant: ${this.tenant}`);
  }

  // Override addPolicy to include tenant information
  async addPolicy(sec, ptype, rule) {
    if (!this.tenant) {
      throw new Error('Tenant must be set before adding policies');
    }

    const values = [];
    for (let i = 0; i < 5; i++) {
      if (i < rule.length) {
        values.push(rule[i]);
      } else {
        values.push(null);
      }
    }

    // For policies (p), tenant goes in v3; for grouping policies (g), tenant goes in v2
    if (ptype === 'p') {
      values[3] = this.tenant; // v3 = tenant
    } else if (ptype === 'g') {
      values[2] = this.tenant; // v2 = tenant
    }

    await this.sequelize.query(
      'INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4) VALUES (?, ?, ?, ?, ?, ?)',
      {
        replacements: [ptype, ...values],
        timeout: 5000
      }
    );
  }

  // Override removePolicy to handle tenant-specific removal
  async removePolicy(sec, ptype, rule) {
    if (!this.tenant) {
      throw new Error('Tenant must be set before removing policies');
    }

    const values = [];
    for (let i = 0; i < 5; i++) {
      if (i < rule.length) {
        values.push(rule[i]);
      } else {
        values.push(null);
      }
    }

    // Add tenant condition to the WHERE clause
    if (ptype === 'p') {
      values[3] = this.tenant; // v3 = tenant
    } else if (ptype === 'g') {
      values[2] = this.tenant; // v2 = tenant
    }

    await this.sequelize.query(
      'DELETE FROM casbin_rule WHERE ptype = ? AND v0 = ? AND v1 = ? AND v2 = ? AND v3 = ? AND v4 = ?',
      {
        replacements: [ptype, ...values],
        timeout: 5000
      }
    );
  }

  // Override removeFilteredPolicy to handle tenant-specific removal
  async removeFilteredPolicy(sec, ptype, fieldIndex, ...fieldValues) {
    if (!this.tenant) {
      throw new Error('Tenant must be set before removing filtered policies');
    }

    let whereClause = 'ptype = ?';
    const replacements = [ptype];

    // Build WHERE clause based on field values
    for (let i = 0; i < fieldValues.length; i++) {
      if (fieldValues[i] !== null && fieldValues[i] !== undefined) {
        whereClause += ` AND v${fieldIndex + i} = ?`;
        replacements.push(fieldValues[i]);
      }
    }

    // Add tenant condition
    if (ptype === 'p') {
      whereClause += ' AND v3 = ?';
      replacements.push(this.tenant);
    } else if (ptype === 'g') {
      whereClause += ' AND v2 = ?';
      replacements.push(this.tenant);
    }

    await this.sequelize.query(
      `DELETE FROM casbin_rule WHERE ${whereClause}`,
      {
        replacements,
        timeout: 5000
      }
    );
  }
}

// Factory function to create tenant-aware adapter
const createTenantAwareAdapter = async (config, tenant) => {
  const sequelize = new Sequelize(config);
  
  // Test connection
  await sequelize.authenticate();
  console.log(`✅ Database connection established for tenant: ${tenant}`);
  
  const adapter = new TenantAwareAdapter(sequelize);
  adapter.setTenant(tenant);
  
  return adapter;
};

module.exports = {
  TenantAwareAdapter,
  createTenantAwareAdapter
}; 