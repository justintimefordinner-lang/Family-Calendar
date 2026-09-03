#!/usr/bin/env bash
# Pull the latest code and restart. Run from the repo root: bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
npm install --omit=dev --no-audit --no-fund
# better-sqlite3 downloads a prebuilt binary in its install script; pre-approve it for newer npm
npm approve-scripts better-sqlite3 >/dev/null 2>&1 || true
# The service is either the templated unit from install.sh (family-calendar@<user>)
# or a plain family-calendar.service if it was installed/renamed by hand.
UNIT="family-calendar@$(id -un)"
if [ -f /etc/systemd/system/family-calendar.service ]; then UNIT="family-calendar"; fi
sudo systemctl restart "$UNIT"
sleep 2
systemctl --no-pager --lines=5 status "$UNIT" || true
