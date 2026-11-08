#!/usr/bin/env bash
# Builds the Docker image locally, copies it to the server over SSH and
# (re)starts the container there. The server needs Docker; the reverse proxy
# route (see README, "Docker") is set up once by hand.
#
#   scripts/deploy.sh                      # defaults below
#   DEPLOY_HOST=root@example.org DEPLOY_PORT=8210 scripts/deploy.sh

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-root@pueski.de}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/blackboard}"
DEPLOY_PORT="${DEPLOY_PORT:-8210}"
IMAGE="blackboard-next:latest"

here="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$here/.." && pwd)"

echo "==> building $IMAGE"
docker build -f "$here/Dockerfile" -t "$IMAGE" "$repo"

echo "==> copying image to $DEPLOY_HOST"
docker save "$IMAGE" | gzip -1 | ssh "$DEPLOY_HOST" 'gunzip | docker load'

echo "==> starting container on 127.0.0.1:$DEPLOY_PORT"
ssh "$DEPLOY_HOST" DEPLOY_DIR="$DEPLOY_DIR" DEPLOY_PORT="$DEPLOY_PORT" IMAGE="$IMAGE" 'bash -s' <<'REMOTE'
set -euo pipefail
mkdir -p "$DEPLOY_DIR"
cat > "$DEPLOY_DIR/compose.yaml" <<EOF
# managed by blackboard-next/scripts/deploy.sh
services:
  blackboard:
    image: $IMAGE
    container_name: blackboard
    restart: unless-stopped
    ports:
      - "127.0.0.1:$DEPLOY_PORT:8080"
EOF
cd "$DEPLOY_DIR"
docker compose up -d --force-recreate
for i in $(seq 1 20); do
  if curl -fs -o /dev/null "http://127.0.0.1:$DEPLOY_PORT/"; then
    echo "container answers on 127.0.0.1:$DEPLOY_PORT"
    exit 0
  fi
  sleep 1
done
echo "container does not answer" >&2
docker compose logs --tail 50 >&2
exit 1
REMOTE
