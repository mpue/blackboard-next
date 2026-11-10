#!/usr/bin/env bash
# Sets up the mail account of the API on the server: writes the SMTP settings
# into server.env and restarts the API. Only the password is asked for; it
# goes over SSH's standard input, so it never shows up in a command line or
# in the shell history.
#
#   scripts/set-smtp.sh                     # Strato, blackboard@pueski.de
#   SMTP_USER=noreply@example.org SMTP_HOST=mail.example.org scripts/set-smtp.sh

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-root@pueski.de}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/blackboard}"
SMTP_HOST="${SMTP_HOST:-smtp.strato.de}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_USER="${SMTP_USER:-blackboard@pueski.de}"
SMTP_FROM="${SMTP_FROM:-BlackBoard <$SMTP_USER>}"

read -rsp "Passwort des Postfachs $SMTP_USER: " pass
echo
if [ -z "$pass" ]; then
  echo "Kein Passwort eingegeben, nichts geändert." >&2
  exit 1
fi
# the values are written in single quotes, so Docker Compose takes them literally
case "$pass$SMTP_FROM" in *"'"*)
  echo "Passwort und Absender dürfen kein ' enthalten." >&2
  exit 1 ;;
esac

echo "==> schreibe die SMTP-Einstellungen nach $DEPLOY_HOST:$DEPLOY_DIR/server.env"
printf '%s\n' "$pass" | ssh "$DEPLOY_HOST" "set -e
cd '$DEPLOY_DIR'
IFS= read -r pass
touch server.env
chmod 600 server.env
sed -i '/^#* *SMTP_\(HOST\|PORT\|SECURE\|USER\|PASS\|FROM\)=/d' server.env
printf \"SMTP_HOST='%s'\nSMTP_PORT='%s'\nSMTP_USER='%s'\nSMTP_PASS='%s'\nSMTP_FROM='%s'\n\" '$SMTP_HOST' '$SMTP_PORT' '$SMTP_USER' \"\$pass\" '$SMTP_FROM' >> server.env
docker compose up -d --force-recreate api >/dev/null 2>&1
sleep 4
docker compose logs api --tail 1"
echo "Steht oben 'SMTP on', gehen die Mails jetzt raus."
