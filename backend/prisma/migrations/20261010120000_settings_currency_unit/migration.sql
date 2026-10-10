-- ─────────────────────────────────────────────────────────────
-- The unit a workshop reads money in
--
-- Every amount in the database is in rials and stays that way. This column
-- only says how the screens print it: «toman», the default, divides by ten
-- for display and multiplies back on input; «rial» prints the stored figure.
-- So switching it rewrites nothing and cannot lose a digit.
--
-- Existing workshops get «toman» too, as agreed on 10 October — it is what
-- a shop in Iran says out loud, and what new workshops will start on.
--
-- settings already has RLS and its workspace_isolation policy; a column
-- needs neither.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "settings"
  ADD COLUMN "currency_unit" TEXT NOT NULL DEFAULT 'toman';

ALTER TABLE "settings"
  ADD CONSTRAINT "settings_currency_unit_check"
  CHECK ("currency_unit" IN ('toman', 'rial'));
