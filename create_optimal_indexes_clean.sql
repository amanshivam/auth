-- Fixed Optimal Indexes for Multi-Tenant Casbin System
-- Addresses MySQL key length limitation (max 3072 bytes)

-- 1. Primary tenant access index (most critical for performance)
-- Optimizes: SELECT ... WHERE ptype = 'p' AND v3 = ?
-- Using partial index to stay within key length limits
CREATE INDEX idx_casbin_tenant_policies ON casbin_rule (ptype, v3);

-- 2. Tenant grouping policies index
-- Optimizes: SELECT ... WHERE ptype = 'g' AND v2 = ?
CREATE INDEX idx_casbin_tenant_grouping ON casbin_rule (ptype, v2);

-- 3. Tenant cleanup index (simplified)
-- Optimizes: DELETE ... WHERE (ptype = 'p' AND v3 = ?) OR (ptype = 'g' AND v2 = ?)
CREATE INDEX idx_casbin_tenant_cleanup ON casbin_rule (ptype, v3, v2);

-- 4. Exact policy matching index (simplified)
-- Optimizes: DELETE ... WHERE ptype = ? AND v0 = ? AND v1 = ? AND v2 = ? AND v3 = ? AND v4 = ?
-- Using partial index with key columns only
CREATE INDEX idx_casbin_policy_exact ON casbin_rule (ptype, v0, v1, v2, v3);

-- 5. Statistics and monitoring indexes
-- For database stats queries
CREATE INDEX idx_casbin_stats_ptype ON casbin_rule (ptype);


-- 6. User-specific policy lookup (for common access patterns)
-- Optimizes: WHERE ptype = 'p' AND v0 = ? (user-based lookups)
CREATE INDEX idx_casbin_user_policies ON casbin_rule (ptype, v0, v3);

-- 7. Resource-specific policy lookup
-- Optimizes: WHERE ptype = 'p' AND v1 = ? (resource-based lookups)
CREATE INDEX idx_casbin_resource_policies ON casbin_rule (ptype, v1, v3);

-- 8. Action-specific policy lookup
-- Optimizes: WHERE ptype = 'p' AND v2 = ? (action-based lookups)
CREATE INDEX idx_casbin_action_policies ON casbin_rule (ptype, v2, v3);

-- Show index information after creation
SHOW INDEX FROM casbin_rule;

-- Analyze table to update statistics
ANALYZE TABLE casbin_rule;

-- Show table size and index information
SELECT 
    table_name,
    ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)',
    ROUND((index_length / 1024 / 1024), 2) AS 'Index Size (MB)'
FROM information_schema.tables 
WHERE table_schema = 'casbin_db' AND table_name = 'casbin_rule'; 