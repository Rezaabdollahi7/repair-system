-- Reference data, not seed data: three rows shared by every workspace,
-- referenced by users.role_id, never edited by anyone. The application role
-- has SELECT on this table and nothing else.
--
-- Moved out of prisma/seed.ts, which also creates a default workspace and a
-- super admin — right for development, wrong for a production database where
-- that is a workshop nobody owns and an account nobody asked for. Setting up
-- production is now `migrate deploy` and nothing else.
--
-- ON CONFLICT so a database seeded before this migration is not broken by it.
-- No setval: the column is SERIAL and an ordinary INSERT advances the
-- sequence on its own.
INSERT INTO roles (name, label) VALUES
  ('super_admin', 'سوپر ادمین'),
  ('admin', 'ادمین'),
  ('technician', 'تکنسین')
ON CONFLICT (name) DO NOTHING;
