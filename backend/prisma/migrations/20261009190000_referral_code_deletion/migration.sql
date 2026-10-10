-- ─────────────────────────────────────────────────────────────
-- Workspace deletion could not delete referral codes
--
-- The subscriptions migration (20260830053153) revoked DELETE on
-- referral_codes from the application role, to keep a code from vanishing
-- under a referral it had produced. Workspace deletion (8.7) was then written
-- to remove the deleted workshop's code — «a link to a deleted workshop
-- should stop working» — as that same role. The two never met in a test, so
-- every run of deleteWorkspaceData stopped at referral_codes with
-- «permission denied», rolled back, and left the workspace undeleted; the
-- nightly job would retry it, and fail, every night.
--
-- Agreed on 9 October: keep the deletion and let it through. DELETE is given
-- back, but only for the caller's own workspace and only through a policy
-- of its own — no other command is widened. UPDATE stays revoked: a code that
-- changes is still a link that silently stops working.
--
-- Nothing here touches a row. The referrals that a deleted code produced
-- keep their own copy of both workspace ids, so the relationship survives
-- the code, which was the original worry.
-- ─────────────────────────────────────────────────────────────

GRANT DELETE ON TABLE referral_codes TO dofixo_app;

-- Without a DELETE policy RLS would let the grant delete nothing: the two
-- existing policies cover SELECT and INSERT only.
CREATE POLICY referral_code_delete ON referral_codes
  FOR DELETE
  USING (workspace_id = app_current_workspace_id());
