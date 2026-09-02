#!/usr/bin/env bash
# Pull the latest code and restart. Run from the repo root: bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
npm install --omit=dev
sudo systemctl restart "family-calendar@$(id -un)"
sleep 2
systemctl --no-pager --lines=5 status "family-calendar@$(id -un)" || true
