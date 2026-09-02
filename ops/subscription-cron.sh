#!/usr/bin/env bash
#
# Nightly subscription maintenance for Dofixo.
#
# Runs on the host from cron, exactly like backup-database.sh, and for the
# same reason: an app that has stopped serving must not also be the thing
# responsible for warning people their subscription is ending.
#
# The work itself is TypeScript inside the container — the arithmetic on
# expiry dates, the ordered deletion across twenty tables and the settlement
# of abandoned payments are not things to write in bash, and in TypeScript
# they are covered by the unit suite. This script is only the shell that
# reaches in.
#
# ⚠️ Safe to run twice. subscription_notifications is keyed on the expiry a
# message was sent about, so a second run in one night sends nothing twice.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() {
  printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
}

# The same config the backup uses: on the server there is no repository, only
# the compose file and these scripts side by side, and the compose file is
# not named docker-compose.yml.
CONFIG="$SCRIPT_DIR/backup.env"
[ -f "$CONFIG" ] || die "$CONFIG not found."

# shellcheck source=/dev/null
set -a && . "$CONFIG" && set +a

for var in COMPOSE_DIR COMPOSE_FILE COMPOSE_ENV_FILE; do
  [ -n "${!var:-}" ] || die "$var is not set in $CONFIG"
done

BACKEND_SERVICE="${BACKEND_SERVICE:-backend}"

command -v docker >/dev/null || die "docker is not installed"

log "running subscription job"

# -T so docker allocates no tty: cron has no terminal, and without it docker
# refuses outright.
#
# exec into the running container rather than `run` on a fresh one: the image
# is already there, the environment is already loaded, and a second container
# would need every variable passed again.
docker compose -f "$COMPOSE_DIR/$COMPOSE_FILE" \
  --env-file "$COMPOSE_DIR/$COMPOSE_ENV_FILE" \
  exec -T "$BACKEND_SERVICE" node dist/scripts/subscriptionCron.js

log "done"
