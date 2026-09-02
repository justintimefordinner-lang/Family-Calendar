# Showing the display full-screen on the Pi

The touchscreen shows `http://localhost:3100/` in Chromium kiosk mode, starting automatically at boot.

## Quick way

```bash
cd ~/Family-Calendar && bash deploy/kiosk-setup.sh && sudo reboot
```

The script installs Chromium, sets the Pi to boot to the desktop with auto-login, turns off
screen blanking, hides the mouse cursor, and adds an autostart entry. Requires Raspberry Pi OS
**with desktop** (if you installed the Lite image, install the desktop first:
`sudo apt-get install -y raspberrypi-ui-mods` and reboot).

## Hardware notes

- **HDMI touchscreen** (e.g. a 24" 1080p CUNPU-style monitor): HDMI for the picture plus the
  monitor's USB-B cable into any Pi USB port for touch. It shows up as a standard USB HID
  touch device — no driver. Ignore the "macOS not supported" note; Linux is fine.
- **Official Raspberry Pi Touch Display (DSI ribbon)**: works out of the box on Pi 4/5.
- The layout is designed for **1920×1080 landscape**. Anything 1280 px wide or more works; smaller
  panels get cramped.

## Rotating the screen

Desktop menu → Preferences → **Screen Configuration** → right-click the display → Orientation → Apply.
Touch input follows the rotation automatically on recent Raspberry Pi OS.

## Screen off at night (optional)

The app's own photo screensaver keeps the panel on. To actually switch the display off on a
schedule, add cron entries (`crontab -e`), for example off at 10 pm and on at 6 am:

```
0 22 * * * wlr-randr --output HDMI-A-1 --off
0 6  * * * wlr-randr --output HDMI-A-1 --on
```

(`wlr-randr` lists your output name. On older X11 installs use `xset dpms force off` / `xset dpms force on` with `DISPLAY=:0`.)

## Leaving kiosk mode

With a keyboard attached press `Alt+F4`. To stop it starting at boot, delete
`~/.config/autostart/family-calendar-kiosk.desktop` (and the `family-calendar-kiosk` lines in
`~/.config/labwc/autostart` if present).
