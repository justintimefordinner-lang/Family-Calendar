# Showing the display full-screen on the Pi

The touchscreen shows `http://localhost:3100/` in Chromium kiosk mode. These steps
assume Raspberry Pi OS with the desktop (Wayland/labwc or X11) and auto-login enabled.

## 1. Install Chromium (if it is not already there)

```bash
sudo apt-get update && sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium
```

## 2. Autostart the kiosk

Create `~/.config/autostart/family-calendar.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Family Calendar
Exec=/bin/bash -c 'sleep 8; chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --check-for-update-interval=31536000 --touch-events=enabled --overscroll-history-navigation=0 --app=http://localhost:3100/'
X-GNOME-Autostart-enabled=true
```

If your Chromium binary is `chromium` rather than `chromium-browser`, change the `Exec` line.

## 3. Keep the screen awake

Raspberry Pi OS (Bookworm, Wayland):

```bash
# disable screen blanking via raspi-config: Display Options -> Screen Blanking -> No
sudo raspi-config nonint do_blanking 1
```

The app's own photo screensaver takes over after the idle time set in the parent app
(Settings > Display), so the screen stays on but shows family photos.

## 4. Optional: hide the mouse cursor on a touch-only screen

```bash
sudo apt-get install -y unclutter
```

Add `unclutter -idle 1 &` as another autostart entry or before the chromium line above.

## 5. Reboot

```bash
sudo reboot
```

Tap anywhere on the screensaver to wake the display. To exit kiosk mode with a keyboard, press `Alt+F4`.
