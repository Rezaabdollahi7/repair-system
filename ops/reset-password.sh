#!/usr/bin/env bash
#
# Resets one user's password and ends their sessions.
#
#   ./ops/reset-password.sh <phone>
#
# For the call that starts "I've forgotten my password". Until SMS OTP
# (roadmap 8.6) exists, an operator is the only way back in — so this has to
# be quick enough to do on the phone and narrow enough to be safe at 2am.
#
# ⚠️ Verify who you are talking to first. ops/reset-password.md has the
# checklist; this script cannot tell an owner from an impostor.

set -euo pipefail

PHONE="${1:-}"
[ -n "$PHONE" ] || { echo "usage: $0 <phone>" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

CONFIG="$SCRIPT_DIR/backup.env"
[ -f "$CONFIG" ] || { echo "ERROR: $CONFIG not found" >&2; exit 1; }
# shellcheck source=/dev/null
set -a && . "$CONFIG" && set +a

cd "$REPO_ROOT"

pg() {
  docker compose exec -T "$POSTGRES_SERVICE" \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
}

# ─── Who is this? ─────────────────────────────────────────────

# Shown before anything is changed, so the operator can read it back to the
# caller and stop if it doesn't match.
echo
pg -c "
  SELECT u.id, u.full_name, u.username, r.name AS role, u.is_active,
         w.id AS workspace_id, w.name AS workspace, w.status,
         u.created_at::date AS joined
  FROM users u
  JOIN roles r ON r.id = u.role_id
  JOIN workspaces w ON w.id = u.workspace_id
  WHERE u.username = '$PHONE';"

FOUND="$(pg -tAc "SELECT count(*) FROM users WHERE username = '$PHONE';")"

if [ "$FOUND" = "0" ]; then
  echo "No account with that number. Check the digits, and remember the"
  echo "username is always 09xxxxxxxxx — not a landline, not a name."
  exit 1
fi

# The username is unique platform-wide, so this should be impossible. If it
# ever isn't, something is very wrong and a password reset is not the thing
# to do about it.
[ "$FOUND" = "1" ] || { echo "ERROR: $FOUND accounts share that number" >&2; exit 1; }

ACTIVE="$(pg -tAc "SELECT is_active FROM users WHERE username = '$PHONE';")"
if [ "$ACTIVE" != "t" ]; then
  echo "This account is deactivated. A new password won't let them in —"
  echo "someone in their workshop switched it off, probably on purpose."
  echo "Talk to the workshop's admin, not the caller."
  exit 1
fi

# ─── Confirm ──────────────────────────────────────────────────

echo
echo "This will set a new password and sign this account out everywhere."
printf "Type the phone number again to confirm: "
read -r CONFIRM

[ "$CONFIRM" = "$PHONE" ] || { echo "Numbers don't match. Nothing changed."; exit 1; }

# ─── Reset ────────────────────────────────────────────────────

# Random rather than chosen: a password the operator picked is a password the
# operator knows, and one spoken over the phone should stop working as soon
# as the owner is back in.
NEW_PASSWORD="$(node -e "console.log(require('crypto').randomBytes(9).toString('base64url'))")"

# Hashed here rather than in SQL: bcrypt with the same cost the application
# uses, so the row is indistinguishable from one the app wrote itself.
HASH="$(cd backend && node -e "
  const bcrypt = require('bcryptjs');
  console.log(bcrypt.hashSync(process.argv[1], 10));
" "$NEW_PASSWORD")"

# One transaction: a password changed without the sessions ending would leave
# whoever prompted this call still signed in.
pg -v ON_ERROR_STOP=1 <<SQL >/dev/null
BEGIN;

UPDATE users SET password = '$HASH' WHERE username = '$PHONE';

-- Deleted rather than revoked: a revoked token presented again is read as a
-- stolen copy and ends every session that user has, which is exactly what
-- this reset is already doing. Leaving rows behind would only make the next
-- sign-in look like an attack.
DELETE FROM refresh_tokens
WHERE user_id = (SELECT id FROM users WHERE username = '$PHONE');

COMMIT;
SQL

echo
echo "  ┌─────────────────────────────────────────┐"
printf "  │  %-37s  │\n" "$NEW_PASSWORD"
echo "  └─────────────────────────────────────────┘"
echo
echo "Read it to them, watch them sign in, and tell them to change it from"
echo "the settings page. You know this password; it should stop working."
echo