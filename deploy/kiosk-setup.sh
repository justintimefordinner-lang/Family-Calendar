#!/usr/bin/env bash
# Make this Pi boot straight into the Family Calendar display, full-screen in Chromium.
# Run once on the Pi (with the touchscreen attached is fine, but not required):
#   bash deploy/kiosk-setup.sh
# Requires Raspberry Pi OS *with desktop*. Re-running is safe.
set -euo pipefail

PORT="${PORT:-3100}"
URL="http://localhost:${PORT}/"
USER_NAME="$(id -un)"

echo "==> Installing Chromium and unclutter (hides the mouse cursor)"
sudo apt-get update -qq
sudo apt-get install -y chromium-browser unclutter 2>/dev/null || sudo apt-get install -y chromium unclutter

CHROME="$(command -v chromium-browser || command -v chromium || true)"
if [ -z "$CHROME" ]; then
  echo "Chromium was not found after install. Is this Raspberry Pi OS with the desktop?"
  exit 1
fi

echo "==> Booting to the desktop with auto-login"
sudo raspi-config nonint do_boot_behaviour B4 || true   # B4 = desktop, auto-login
sudo raspi-config nonint do_blanking 1 || true          # 1 = screen blanking off

FLAGS="--kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
--disable-features=TranslateUI --check-for-update-interval=31536000 --touch-events=enabled \
--overscroll-history-navigation=0 --password-store=basic --app=${URL}"

echo "==> Adding the autostart entry"
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/family-calendar-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Family Calendar Kiosk
Comment=Full-screen family calendar display
Exec=/bin/bash -c 'unclutter -idle 1 -root & sleep 6; ${CHROME} ${FLAGS}'
X-GNOME-Autostart-enabled=true
EOF

# Newer Raspberry Pi OS (labwc) also reads this file.
if command -v labwc >/dev/null 2>&1; then
  mkdir -p "$HOME/.config/labwc"
  touch "$HOME/.config/labwc/autostart"
  grep -q 'family-calendar-kiosk' "$HOME/.config/labwc/autostart" || cat >> "$HOME/.config/labwc/autostart" <<EOF
# family-calendar-kiosk
unclutter -idle 1 -root &
(sleep 6; ${CHROME} ${FLAGS}) &
EOF
fi

echo
echo "Done. The display will open ${URL} full-screen after the next reboot:"
echo "  sudo reboot"
echo
echo "Tips:"
echo "  - Exit kiosk mode with a keyboard: Alt+F4"
echo "  - Screen upside down / sideways? Screen Configuration in the desktop menu, or see deploy/kiosk.md"
echo "  - The family calendar service must be running (bash deploy/install.sh) - it is, if you can open the parent app."
