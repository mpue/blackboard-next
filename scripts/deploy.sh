#!/usr/bin/env bash
# Builds the Docker images locally (web: the app, api: accounts and cloud
# projects, compiler: C/C++ for the code editor), copies them to the server
# over SSH and (re)starts the containers there. The server needs Docker; the
# reverse proxy route (see README, "Docker") is set up once by hand.
#
#   scripts/deploy.sh                      # defaults below
#   DEPLOY_HOST=root@example.org DEPLOY_PORT=8210 scripts/deploy.sh
#
# On the server, $DEPLOY_DIR/server.env holds the secrets of the API (SMTP,
# Google sign-in; see server/.env.example). The first deploy creates it from
# the example; the database lives in $DEPLOY_DIR/data.

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-root@pueski.de}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/blackboard}"
DEPLOY_PORT="${DEPLOY_PORT:-8210}"
# what the browser sees: origin and the path the reverse proxy serves the app under
DEPLOY_ORIGIN="${DEPLOY_ORIGIN:-https://pueski.de}"
DEPLOY_PATH="${DEPLOY_PATH:-/blackboard}"
WEB_IMAGE="blackboard-next:latest"
API_IMAGE="blackboard-api:latest"
COMPILER_IMAGE="blackboard-compiler:latest"

here="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> building $WEB_IMAGE, $API_IMAGE and $COMPILER_IMAGE"
docker build --target web -t "$WEB_IMAGE" "$here"
docker build --target api -t "$API_IMAGE" "$here"
docker build --target compiler -t "$COMPILER_IMAGE" "$here"

echo "==> copying images to $DEPLOY_HOST"
docker save "$WEB_IMAGE" "$API_IMAGE" "$COMPILER_IMAGE" | gzip -1 | ssh "$DEPLOY_HOST" 'gunzip | docker load'
ssh "$DEPLOY_HOST" "mkdir -p '$DEPLOY_DIR'"
scp -q "$here/server/.env.example" "$DEPLOY_HOST:$DEPLOY_DIR/server.env.example"

echo "==> starting containers, the app on 127.0.0.1:$DEPLOY_PORT"
ssh "$DEPLOY_HOST" DEPLOY_DIR="$DEPLOY_DIR" DEPLOY_PORT="$DEPLOY_PORT" DEPLOY_ORIGIN="$DEPLOY_ORIGIN" DEPLOY_PATH="$DEPLOY_PATH" \
  WEB_IMAGE="$WEB_IMAGE" API_IMAGE="$API_IMAGE" COMPILER_IMAGE="$COMPILER_IMAGE" 'bash -s' <<'REMOTE'
set -euo pipefail
cd "$DEPLOY_DIR"
if [ ! -e server.env ]; then
  install -m 600 server.env.example server.env
  echo "created $DEPLOY_DIR/server.env: fill in SMTP and Google sign-in there, then deploy again"
fi
# the API runs as user node (uid 1000)
mkdir -p data
chown 1000:1000 data
cat > compose.yaml <<EOF
# managed by scripts/deploy.sh
services:
  blackboard:
    image: $WEB_IMAGE
    container_name: blackboard
    restart: unless-stopped
    environment:
      API_URL: http://api:8787$DEPLOY_PATH
    ports:
      - "127.0.0.1:$DEPLOY_PORT:8080"
    depends_on:
      - api
  api:
    image: $API_IMAGE
    container_name: blackboard-api
    restart: unless-stopped
    env_file: server.env
    environment:
      ORIGIN: $DEPLOY_ORIGIN
      PUBLIC_PATH: $DEPLOY_PATH
      COMPILER_URL: http://compiler:8789
    volumes:
      - ./data:/data
    networks:
      - default
      - compile
  # compiles code from the web: nothing secret inside, no way out, small limits
  compiler:
    image: $COMPILER_IMAGE
    container_name: blackboard-compiler
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /tmp:size=512m,mode=1777,noexec,nosuid
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    pids_limit: 256
    mem_limit: 1g
    cpus: 2
    networks:
      - compile
networks:
  compile:
    internal: true
EOF
docker compose up -d --force-recreate --remove-orphans
for i in $(seq 1 30); do
  if curl -fs -o /dev/null "http://127.0.0.1:$DEPLOY_PORT/" && curl -fs -o /dev/null "http://127.0.0.1:$DEPLOY_PORT/api/health"; then
    echo "app and API answer on 127.0.0.1:$DEPLOY_PORT"
    exit 0
  fi
  sleep 1
done
echo "containers do not answer" >&2
docker compose logs --tail 50 >&2
exit 1
REMOTE
