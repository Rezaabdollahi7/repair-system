#!/usr/bin/env bash
#
# Nightly Postgres backup for Dofixo.
#
# Runs on the host, outside the containers, from cron. Deliberately not an
# application feature: an app broken badly enough to need restoring should not
# also be the thing responsible for having taken the backup.
#
# The dump is encrypted with a public key. The private half is not on this
# machine and never should be — a server that has been broken into must not be
# able to read its own backup history.
#
#   ./ops/backup-database.sh
#
# ⚠️ The VPS's own snapshots do not replace this. A machine snapshot is
# crash-consistent rather than application-consistent, restoring one means
# restoring the whole server, and a single workspace cannot be pulled out of
# it — which is what the operator runbook needs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

log() {
  printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
}

# ─── Configuration ────────────────────────────────────────────

CONFIG="$SCRIPT_DIR/backup.env"
[ -f "$CONFIG" ] || die "$CONFIG not found. Copy backup.env.example to it."

# shellcheck source=/dev/null
set -a && . "$CONFIG" && set +a

for var in POSTGRES_SERVICE POSTGRES_USER POSTGRES_DB AGE_PUBLIC_KEY \
           S3_ENDPOINT S3_BUCKET S3_PREFIX S3_ACCESS_KEY S3_SECRET_KEY; do
  [ -n "${!var:-}" ] || die "$var is not set in $CONFIG"
done

for tool in docker age aws; do
  command -v "$tool" >/dev/null || die "$tool is not installed"
done

# ─── Working space ────────────────────────────────────────────

# mktemp rather than a fixed path: two overlapping runs would otherwise
# overwrite each other's dump halfway through.
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
NAME="dofixo-${STAMP}.sql.gz.age"
LOCAL="$WORK_DIR/$NAME"

# Which tier this run belongs to. Three separate folders rather than one with
# clever date arithmetic: each is pruned independently, so a bug in one
# cannot delete the others, and "what have I got" is answerable by listing.
#
# The first of the month wins over Sunday, so a monthly is never missed.
DAY_OF_MONTH="$(date -u '+%d')"
DAY_OF_WEEK="$(date -u '+%u')"   # 1 = Monday, 7 = Sunday

if [ "$DAY_OF_MONTH" = "01" ]; then
  TIER="monthly"
  KEEP=3
elif [ "$DAY_OF_WEEK" = "7" ]; then
  TIER="weekly"
  KEEP=4
else
  TIER="daily"
  KEEP=7
fi

# ─── Dump ─────────────────────────────────────────────────────

log "dumping $POSTGRES_DB"

# The whole pipeline runs in one pass: the plain dump never lands on disk, so
# an unencrypted copy of every customer's data is never sitting in /tmp.
#
# -T so docker doesn't allocate a tty, which would corrupt the binary stream.
# --clean --if-exists so the dump can be replayed over an existing database
# without hand-dropping it first.
cd "$REPO_ROOT"
docker compose exec -T "$POSTGRES_SERVICE" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip -9 \
  | age -r "$AGE_PUBLIC_KEY" -o "$LOCAL"

# PIPESTATUS rather than $?: with a pipeline, only the last command's status
# is reported, so a failed pg_dump would otherwise produce a valid encrypted
# file containing an error message.
STATUS=("${PIPESTATUS[@]}")
[ "${STATUS[0]}" -eq 0 ] || die "pg_dump failed (exit ${STATUS[0]})"
[ "${STATUS[1]}" -eq 0 ] || die "gzip failed (exit ${STATUS[1]})"
[ "${STATUS[2]}" -eq 0 ] || die "age failed (exit ${STATUS[2]})"

SIZE="$(stat -c %s "$LOCAL")"

# A dump of an empty database is still a few kilobytes of schema, so anything
# this small means something went wrong quietly.
[ "$SIZE" -gt 1024 ] || die "dump is suspiciously small ($SIZE bytes)"

log "dumped and encrypted: $NAME ($(numfmt --to=iec "$SIZE"))"

# ─── Upload ───────────────────────────────────────────────────

export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
export AWS_DEFAULT_REGION="default"

REMOTE_DIR="s3://$S3_BUCKET/$S3_PREFIX/$TIER"

log "uploading to $REMOTE_DIR/ (keeping $KEEP)"

aws s3 cp "$LOCAL" "$REMOTE_DIR/$NAME" \
  --endpoint-url "$S3_ENDPOINT" \
  --only-show-errors \
  || die "upload failed"

# ─── Prune ────────────────────────────────────────────────────

# After the upload, never before: pruning first would leave a window where
# the oldest backup is gone and the newest hasn't arrived.
#
# Names sort chronologically because the timestamp is ISO-like and zero
# padded, so plain sort is enough — no date parsing to get wrong.
EXISTING="$(aws s3 ls "$REMOTE_DIR/" --endpoint-url "$S3_ENDPOINT" \
  | awk '{print $4}' | grep -v '^$' | sort)" || die "listing failed"

COUNT="$(printf '%s\n' "$EXISTING" | grep -c . || true)"

if [ "$COUNT" -gt "$KEEP" ]; then
  # A cap on how many a single run may remove. If a listing ever comes back
  # wrong, this turns a catastrophe into a puzzle.
  DOOMED="$(printf '%s\n' "$EXISTING" | head -n "$((COUNT - KEEP))" | head -n 5)"

  while IFS= read -r old; do
    [ -n "$old" ] || continue
    log "pruning $TIER/$old"
    aws s3 rm "$REMOTE_DIR/$old" --endpoint-url "$S3_ENDPOINT" --only-show-errors \
      || log "WARNING: could not remove $old"
  done <<< "$DOOMED"
fi

log "done ($TIER, $COUNT backups before this run)"