-- Roadmap 2.3 — Row-Level Security on every tenant-scoped table.
--
-- Written by hand rather than generated: RLS has no representation in
-- schema.prisma, so Prisma will never emit it and never detect drift in it.
--
-- Layering (see CLAUDE.md): the controllers already filter by workspaceId.
-- This is the second, independent layer. Either one alone stops a leak;
-- neither is allowed to be skipped.

-- ─────────────────────────────────────────────────────────────
-- 1. The workspace of the current request
-- ─────────────────────────────────────────────────────────────

-- Every policy below routes through this one function so the definition of
-- "current workspace" lives in exactly one place.
--
-- The second argument to current_setting() makes it return NULL instead of
-- raising when the setting was never assigned, and NULLIF turns an empty
-- string into NULL too. Both cases collapse to NULL, and `workspace_id = NULL`
-- is never true — so a query issued without a workspace context returns no
-- rows and writes nothing. Failing closed is the entire point.
CREATE OR REPLACE FUNCTION app_current_workspace_id()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.workspace_id', true), '')::integer;
$$;

COMMENT ON FUNCTION app_current_workspace_id() IS
  'Workspace id of the current request. Set per transaction by the Prisma '
  'client extension (roadmap 2.4) with SET LOCAL app.workspace_id. NULL when '
  'unset, which makes every RLS policy deny.';

-- ─────────────────────────────────────────────────────────────
-- 2. The application role
-- ─────────────────────────────────────────────────────────────

-- The API connects as this role from task 2.4 onward. It is deliberately NOT
-- the owner of any table: in Postgres, a table's owner (and any superuser)
-- bypasses RLS entirely unless FORCE ROW LEVEL SECURITY is set. Keeping
-- migrations and the seed script on the owner account and the running app on
-- a separate, unprivileged one means the policies are actually in force where
-- it matters, while schema changes and seeding still work normally.
--
-- Created without LOGIN: the password is set out of band so this file — which
-- lives in git forever — never carries a credential. Connecting before that
-- ALTER ROLE fails loudly with an authentication error rather than silently.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dofixo_app') THEN
    CREATE ROLE dofixo_app NOLOGIN;
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Privileges for the application role
-- ─────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO dofixo_app;

-- DML only. No CREATE, no DROP, no ALTER: the app has no business changing
-- its own schema, and an injection that reaches DDL is a different class of
-- incident than one that reaches a row.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dofixo_app;

-- Prisma's autoincrement() compiles to SERIAL, so INSERT needs nextval() on
-- the backing sequences.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dofixo_app;

-- The two GRANTs above only cover objects that exist right now. These make
-- every table and sequence created by a later migration inherit the same
-- privileges automatically, so a new model doesn't silently become
-- unreadable to the app.
--
-- FOR ROLE is omitted on purpose: it then defaults to the role running the
-- migration, which is the same role that will own those future tables.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dofixo_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO dofixo_app;

-- Roles are shared reference data: readable by everyone, writable by nobody
-- but the seed script (which runs as the owner).
REVOKE INSERT, UPDATE, DELETE ON TABLE roles FROM dofixo_app;

-- A workspace is created at sign-up and removed by an operator, neither of
-- which is an ordinary request. See the note at the bottom of this file.
REVOKE INSERT, DELETE ON TABLE workspaces FROM dofixo_app;

-- Migration history is not application data. Guarded because the table may
-- not exist yet when this migration replays into a fresh shadow database.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE _prisma_migrations FROM dofixo_app;
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. The workspaces table itself
-- ─────────────────────────────────────────────────────────────

-- Not tenant-scoped in the same sense as the rest — it IS the tenant — but it
-- still needs a policy, or one shop could read every other shop's name and
-- subscription state.
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_self ON workspaces
  USING (id = app_current_workspace_id())
  WITH CHECK (id = app_current_workspace_id());

-- ─────────────────────────────────────────────────────────────
-- 5. Tenant-scoped tables
-- ─────────────────────────────────────────────────────────────
--
-- All 18 tables carrying a workspace_id column. One policy each, covering
-- every command: USING filters the rows a statement may read or touch,
-- WITH CHECK constrains the rows it may leave behind, so an UPDATE cannot
-- move a row into another workspace and an INSERT cannot plant one there.
--
-- The policies apply to PUBLIC rather than naming dofixo_app, so that any
-- future connection role is scoped by default instead of by remembering to
-- add it here.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON users
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON customers
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON devices
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE device_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON device_images
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE device_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON device_assignments
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON categories
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE items ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON items
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON inventory_transactions
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON purchase_invoices
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE purchase_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON purchase_invoice_items
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE sale_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON sale_invoices
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE sale_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON sale_invoice_items
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON services
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE repair_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON repair_invoices
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE repair_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON repair_invoice_items
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE repair_invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON repair_invoice_payments
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON settings
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON backups
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

-- ─────────────────────────────────────────────────────────────
-- Follow-up work this migration deliberately leaves undone
-- ─────────────────────────────────────────────────────────────
--
-- * The app still connects as the owner and therefore still bypasses all of
--   the above. Switching DATABASE_URL to dofixo_app belongs with task 2.4,
--   which supplies the SET LOCAL that makes these policies resolve to a real
--   workspace. Doing it earlier would leave the app reading zero rows with no
--   error message.
--
-- * ALTER DEFAULT PRIVILEGES carries grants forward to future tables, but
--   nothing carries RLS forward. Any later migration adding a table with a
--   workspace_id column must enable RLS and add the policy in that same
--   migration. prisma/rls-check.sql detects the omission.
--
-- * Sign-up (task 3.1) creates a Workspace and its first User before any
--   workspace context exists, and login looks a user up by username before
--   the caller's workspace is known. Neither can run under these policies as
--   an ordinary query; both need a narrow, deliberate aperture. Designed in
--   2.4/3.x, not improvised here.