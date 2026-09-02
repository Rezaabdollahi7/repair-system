-- Roadmap 8.5 — let a workspace see that a code has run out.
--
-- maxUses is checked with COUNT(*) over discount_code_uses, which sits under
-- the ordinary workspace_isolation policy: a caller counts only their own
-- rows. Every workspace therefore sees zero, the ceiling is never reached,
-- and a code shared in a Telegram group is a permanent discount — the exact
-- thing maxUses exists to stop. The integration suite caught it.
--
-- A second, read-only policy rather than dropping the first: policies are
-- OR'd, so this widens SELECT alone while INSERT stays scoped. A workspace
-- still cannot write a use for anyone else.
--
-- Not a SECURITY DEFINER function. The three that exist are apertures for
-- callers with no workspace context at all; this caller has one, and what it
-- needs is a count of rows it may not otherwise see. A policy is the smaller
-- answer (RULES.md §7 — do not add a fourth aperture to avoid writing one).
--
-- ⚠️ What this exposes is how many workspaces have spent a given code, and
-- only to someone who already knows the code. That is a number we would
-- print on a campaign page.
CREATE POLICY discount_code_use_count ON discount_code_uses
  FOR SELECT
  USING (true);

COMMENT ON POLICY discount_code_use_count ON discount_code_uses IS
  'Widens SELECT so maxUses can be counted across workspaces. INSERT stays '
  'scoped by workspace_isolation; the two are OR-ed for SELECT only.';
