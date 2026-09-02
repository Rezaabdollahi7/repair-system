#!/usr/bin/env bash
#
# Pulls one workspace out of an encrypted backup, ready to load into a live
# database as a NEW workspace.
#
#   ./ops/extract-workspace.sh <backup.age> <workspace-id> <age-key-file>
#
# Produces a plain .sql file. Loading it is a separate, deliberate step —
# see ops/restore-workspace.md.
#
# The workspace comes back under a new id, not its original one. Ids come
# from sequences shared across every tenant, so replaying old ones into a
# live database would collide with rows other workshops have created since.
# Every id is shifted by a fixed offset instead, which foreign keys follow
# because Prisma declares them ON UPDATE CASCADE.

set -euo pipefail

BACKUP="${1:-}"
WORKSPACE_ID="${2:-}"
KEY_FILE="${3:-}"

[ -n "$BACKUP" ] && [ -n "$WORKSPACE_ID" ] && [ -n "$KEY_FILE" ] || {
  echo "usage: $0 <backup.age> <workspace-id> <age-key-file>" >&2
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

log() { printf '%s  %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

[ -f "$BACKUP" ] || die "$BACKUP not found"
[ -f "$KEY_FILE" ] || die "$KEY_FILE not found"

CONFIG="$SCRIPT_DIR/backup.env"
[ -f "$CONFIG" ] || die "$CONFIG not found"
# shellcheck source=/dev/null
set -a && . "$CONFIG" && set +a

# Far above anything a live sequence will have reached at this scale, and
# still comfortably inside a 32-bit integer.
OFFSET=1000000
TEMP_DB="workspace_extract_$$"
OUT="workspace-${WORKSPACE_ID}-$(date -u '+%Y%m%dT%H%M%SZ').sql"

cd "$REPO_ROOT"

pg() { docker compose exec -T "$POSTGRES_SERVICE" psql -U "$POSTGRES_USER" "$@"; }

cleanup() {
  pg -d postgres -c "DROP DATABASE IF EXISTS $TEMP_DB;" >/dev/null 2>&1 || true
  rm -f /tmp/extract-$$.sql
}
trap cleanup EXIT

# ─── Restore the backup into a scratch database ───────────────

log "restoring backup into $TEMP_DB"

age -d -i "$KEY_FILE" "$BACKUP" | gunzip > "/tmp/extract-$$.sql" \
  || die "decryption failed — wrong key, or a corrupt file"

pg -d postgres -c "CREATE DATABASE $TEMP_DB OWNER $POSTGRES_USER;" >/dev/null

pg -d "$TEMP_DB" < "/tmp/extract-$$.sql" >/dev/null 2>&1

FOUND="$(pg -d "$TEMP_DB" -tAc \
  "SELECT count(*) FROM workspaces WHERE id = $WORKSPACE_ID;")"
[ "$FOUND" = "1" ] || die "workspace $WORKSPACE_ID is not in this backup"

NAME="$(pg -d "$TEMP_DB" -tAc \
  "SELECT name FROM workspaces WHERE id = $WORKSPACE_ID;")"
log "found: $NAME"

# ─── Reduce the scratch database to one workspace ─────────────

# Everything tenant-scoped hangs off workspaces with ON DELETE CASCADE, so
# removing the others empties all nineteen tables of their rows. Far less
# error-prone than listing the tables and deleting from each in order.
log "removing every other workspace"
pg -d "$TEMP_DB" -c "DELETE FROM workspaces WHERE id <> $WORKSPACE_ID;" >/dev/null

# Sessions are not data worth restoring: these tokens were issued to browsers
# that have long since been told they are invalid, and reviving them would
# resurrect credentials the rotation logic had deliberately revoked.
pg -d "$TEMP_DB" -c "DELETE FROM refresh_tokens;" >/dev/null

# ─── Shift every id out of the way ────────────────────────────

log "shifting ids by $OFFSET"

# One statement per table. Foreign keys follow on their own: Prisma declares
# them ON UPDATE CASCADE, so moving customers.id moves devices.customer_id
# with it, and moving workspaces.id moves workspace_id everywhere.
#
# workspaces goes last, so the cascade lands on rows whose own ids have
# already settled.
for table in users customers categories items devices device_images \
             device_assignments services inventory_transactions \
             purchase_invoices purchase_invoice_items \
             sale_invoices sale_invoice_items \
             repair_invoices repair_invoice_items repair_invoice_payments \
             settings backups workspaces; do
  pg -d "$TEMP_DB" -c "UPDATE $table SET id = id + $OFFSET;" >/dev/null \
    || die "could not shift ids in $table"
done

NEW_ID=$((WORKSPACE_ID + OFFSET))
log "workspace will arrive as id $NEW_ID"

# ─── Dump what's left ─────────────────────────────────────────

# roles is reference data the live database already has, and the migration
# history belongs to the database rather than to any tenant.
log "writing $OUT"

docker compose exec -T "$POSTGRES_SERVICE" \
  pg_dump -U "$POSTGRES_USER" -d "$TEMP_DB" \
  --data-only \
  --exclude-table=roles \
  --exclude-table=_prisma_migrations \
  --exclude-table=refresh_tokens \
  > "$OUT" || die "pg_dump failed"

ROWS="$(grep -c '^INSERT\|^COPY' "$OUT" || true)"
log "done: $OUT ($(numfmt --to=iec "$(stat -c %s "$OUT")"), $ROWS data blocks)"
log ""
log "next: read ops/restore-workspace.md before loading this anywhere"