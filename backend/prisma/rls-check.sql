-- Manual verification for roadmap 2.3. Run against a seeded dev database:
--
--   docker compose exec -T postgres psql -U dofixo -d dofixo_dev \
--     -v ON_ERROR_STOP=0 < backend/prisma/rls-check.sql
--
-- Everything happens inside a transaction that is rolled back, so the two
-- probe workspaces never survive the run.

BEGIN;

-- Part 1 — is any tenant table unprotected?
-- Every table carrying a workspace_id must have RLS on. This query is the
-- guard against a future migration adding a model and forgetting the policy;
-- it should return zero rows.
SELECT c.relname AS "table missing RLS"
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns col
    WHERE col.table_schema = 'public'
      AND col.table_name = c.relname
      AND col.column_name = 'workspace_id'
  )
ORDER BY c.relname;

-- Part 2 — probe data, inserted as the owner, which bypasses RLS.
-- Fixed ids well above anything the sequences have reached, so they can be
-- referenced literally below.
INSERT INTO workspaces (id, name, status, updated_at) VALUES
  (9001, 'RLS-PROBE-A', 'trial', now()),
  (9002, 'RLS-PROBE-B', 'trial', now());

INSERT INTO customers (workspace_id, name) VALUES
  (9001, 'مشتری کارگاه الف'),
  (9002, 'مشتری کارگاه ب');

-- Part 3 — read back as the unprivileged application role.
SET LOCAL ROLE dofixo_app;

SET LOCAL app.workspace_id = '9001';
SELECT 'expect only کارگاه الف' AS check, name
FROM customers WHERE workspace_id IN (9001, 9002);

SET LOCAL app.workspace_id = '9002';
SELECT 'expect only کارگاه ب' AS check, name
FROM customers WHERE workspace_id IN (9001, 9002);

-- Without a workspace context the policy has nothing to match, so the whole
-- table must look empty — no error, no rows.
RESET app.workspace_id;
SELECT 'expect 0' AS check, count(*) AS visible_customers FROM customers;

-- Part 4 — WITH CHECK. Writing into someone else's workspace must be
-- refused, not merely filtered out afterwards. This statement is expected to
-- fail with "new row violates row-level security policy"; it aborts the
-- transaction, which is why it comes last.
SET LOCAL app.workspace_id = '9001';
INSERT INTO customers (workspace_id, name) VALUES (9002, 'نشتی');

ROLLBACK;