-- Clean up existing duplicates and add performance indexes
-- This is a safe approach that won't cause index length issues

-- Check for existing duplicates
SELECT 'Checking for existing duplicates...' as message;

-- Check for duplicate policies
SELECT ptype, v0, v1, v2, v3, COUNT(*) as count 
FROM casbin_rule 
WHERE ptype = 'p' 
GROUP BY ptype, v0, v1, v2, v3 
HAVING COUNT(*) > 1;

-- Check for duplicate grouping policies
SELECT ptype, v0, v1, v2, COUNT(*) as count 
FROM casbin_rule 
WHERE ptype = 'g' 
GROUP BY ptype, v0, v1, v2 
HAVING COUNT(*) > 1;

-- Remove duplicates (keep only one record of each)
-- For policies
DELETE p1 FROM casbin_rule p1
INNER JOIN casbin_rule p2 
WHERE p1.id > p2.id 
AND p1.ptype = p2.ptype 
AND p1.ptype = 'p'
AND p1.v0 = p2.v0 
AND p1.v1 = p2.v1 
AND p1.v2 = p2.v2 
AND p1.v3 = p2.v3;

-- For grouping policies
DELETE g1 FROM casbin_rule g1
INNER JOIN casbin_rule g2 
WHERE g1.id > g2.id 
AND g1.ptype = g2.ptype 
AND g1.ptype = 'g'
AND g1.v0 = g2.v0 
AND g1.v1 = g2.v1 
AND g1.v2 = g2.v2;

-- Add basic performance indexes (these are shorter and should work)
CREATE INDEX idx_casbin_ptype ON casbin_rule (ptype);
CREATE INDEX idx_casbin_tenant_p ON casbin_rule (ptype, v3);
CREATE INDEX idx_casbin_tenant_g ON casbin_rule (ptype, v2);

-- Show final index structure
SHOW INDEX FROM casbin_rule; 