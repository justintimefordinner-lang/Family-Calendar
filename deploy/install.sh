#!/usr/bin/env bash
# One-time install on a Raspberry Pi (Raspberry Pi OS / Debian). Run from the repo root:
#   bash deploy/install.sh
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd)"
USER_NAME="$(id -un)"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node 20+ first, e.g.:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node 20 or newer is required (found $(node -v))."
  exit 1
fi

echo "==> Installing dependencies"
npm install --omit=dev

echo "==> Creating data directory"
mkdir -p data/photos

echo "==> Installing systemd service (family-calendar@$USER_NAME)"
sed "s#/home/%i/Family-Calendar#$REPO_DIR#g" deploy/family-calendar.service | sudo tee /etc/systemd/system/family-calendar@.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now "family-calendar@$USER_NAME"

IP="$(hostname -I | awk '{print $1}')"
echo
echo "Family Calendar is running."
echo "  Display:    http://$IP:3100/"
echo "  Parent app: http://$IP:3100/parent"
echo
echo "Next: open the parent app on your phone to run first-time setup."
echo "To show the display full-screen on this Pi, see deploy/kiosk.md"
