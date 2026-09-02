# Family Calendar

A self-hosted family hub for a wall-mounted touchscreen, with a companion parent app for phones.
Built for a Raspberry Pi and a 1080p landscape display, but it is plain Node.js and runs anywhere.

**The display (`/`)** — tap *Everyone* or a family member's name to see:

- Their Google Calendar events in a week or month view (family calendars show for everyone)
- Today's chores with big tap-to-complete checkmarks
- An **Earn Money** section: extra chores that pay out once a parent approves
- Their money "invested with Dad": balance, pending earnings, interest, and history
- Weather, tonight's dinner, the shopping list, and a photo screensaver when idle

**The parent app (`/parent`)** — PIN-protected, installable on a phone home screen:

- Chores: add/edit regular and Earn Money chores, assign them, set schedules, approve payouts
- Money: deposits, withdrawals, adjustments, and a monthly interest rate you control
- Birthdays & events kept in the app itself (birthdays repeat yearly and show the age)
- Meals for the week, the shared shopping list
- Family members, Google accounts and calendar mapping, weather location, display options, photos

Nothing about your family lives in this repository: the family name, kids, PIN, and Google
connection are all entered on the device during first-run setup and stored in a local SQLite file.

---

## How Google Calendar fits in

The app is **read-only** against Google. Everyone keeps using the normal Google Calendar app on
their phones to add, change, and remove events. The recommended layout:

1. In one parent's Google account create a calendar per kid (e.g. "Ava", "Ben") plus a "Family" calendar.
2. Share each calendar with whoever should be able to edit it (your spouse, an older kid's account).
3. Connect that parent's Google account in the parent app and map each calendar to a family member.

You can connect more than one Google account (for example, your spouse's) and map its calendars
the same way.

**Simpler alternative — one calendar, names in the titles.** Map your main calendar as *Family*
and just put the kid's name in the event title ("Owen soccer practice", "Piper's dentist",
"Ava & Kai swim lessons"). The display matches family-member names (whole words, any case) and
shows the event in that kid's view with their color; an event naming two kids shows for both, and
a title with no names is a family event that appears on the *Everyone* view only. Selecting a
person on the display shows just their events, chores and money. Both approaches can be mixed.

Shorthand works too: a title that *starts* with an initial or abbreviation followed by a space or
punctuation is matched ("O soccer", "P - dentist", "O/P carpool", "J: piano"). Add nicknames or
abbreviations per member in Settings › Family (e.g. "Pip") and they match anywhere in a title.
A lone leading "A" or "I" only counts when followed by punctuation ("A - dentist"), so
"A day at the zoo" stays a family event.

---

## Install on a Raspberry Pi

Requirements: Raspberry Pi OS (64-bit recommended), Node.js 20+, git.

```bash
# Node 20 (skip if `node -v` already shows 20 or newer)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs

cd ~
git clone https://github.com/<your-user>/Family-Calendar.git
cd Family-Calendar
bash deploy/install.sh
```

That installs dependencies, creates `data/`, and registers a systemd service that starts on boot.
The app listens on port **3100**. Open `http://<pi-ip>:3100/parent` on your phone to run setup.

- Update later: `bash deploy/update.sh`
- Logs: `journalctl -u family-calendar@$USER -f`
- Full-screen display on the Pi's touchscreen: see [deploy/kiosk.md](deploy/kiosk.md)
- Change the port or data directory with a `.env` file (see `.env.example`)

### Add the parent app to your phone

Open `http://<pi-ip>:3100/parent` in Chrome (Android) or Safari (iPhone) and choose
*Add to Home Screen*. It only works on your home Wi-Fi unless you set up a VPN such as Tailscale.

---

## Google Calendar setup (one time, about 10 minutes)

1. Go to <https://console.cloud.google.com/> and create a project (any name, e.g. "Family Calendar").
2. **APIs & Services → Library** → search *Google Calendar API* → **Enable**.
3. **APIs & Services → OAuth consent screen** → External → fill in the app name and your email.
   Add the scopes `.../auth/calendar.readonly` and `.../auth/userinfo.email`.
   Add yourself (and your spouse) under **Test users**.
4. **Credentials → Create credentials → OAuth client ID** → Application type **Desktop app**.
   Copy the *Client ID* and *Client secret*.
5. In the parent app: **Settings → Google Calendar**, paste the ID and secret, **Save**.
6. Tap **Connect a Google account** and sign in.
   - If you do this in a browser *on the Pi itself*, it finishes automatically.
   - On a phone, the final redirect to `http://localhost:3100/...` fails to load. That is expected:
     copy the address from the browser's address bar and paste it into the **Finish connecting** box.
7. Pick who each calendar belongs to (Hidden / Family / a member). Events sync every 5 minutes.

> **Important — publish the consent screen.** While the OAuth consent screen is in *Testing*,
> Google expires the connection every 7 days and you would have to reconnect. On the consent screen
> page click **Publish app** (you do not need to complete verification; you will just see an
> "unverified app" warning during sign-in, which is fine for personal use).

---

## Chores model

| Kind | Who | When it shows | On tap |
| --- | --- | --- | --- |
| Regular chore | one member | every day, certain weekdays, or one time | marked done immediately; tap again to undo |
| Earn Money chore | one member or *Anyone* | same options | goes to *Waiting for approval*; a parent taps **Pay** in the parent app and the amount is credited |

Deleting a chore hides it but keeps history. Removing a payout transaction under *Money* marks
the completion as rejected so it can be redone.

### Parent notifications

The parent app cannot use browser push notifications on a plain-HTTP home network, so
notifications go through [ntfy](https://ntfy.sh) (free, open source):

1. Install the ntfy app on each parent's phone.
2. Parent app → Settings → Notifications → *Generate* a secret topic → Save.
3. In the ntfy app subscribe to that topic. Tap *Send test*.

When a kid finishes an Earn Money chore, parents get a notification with **Pay** and **Reject**
buttons (signed one-time links back to the Pi — the phone must be able to reach the Pi, i.e. be on
the home Wi-Fi or VPN) plus an *Open app* button. Approving a repeating chore in the app asks
whether to keep it on the list or remove it.

## Money model

Each kid has a ledger of signed transactions: deposits, withdrawals, chore payouts, interest, and
manual adjustments. The balance is the sum. If an interest rate is set, on the chosen day each month
every kid with a positive balance is credited `balance × rate ÷ 12`.

---

## Development

```bash
npm install
npm run dev          # restarts on file changes
# open http://localhost:3100
```

- `server/` — Express API, SQLite via better-sqlite3, Google sync, interest job
- `public/` — the display (`index.html`, `js/kiosk.js`) and parent app (`parent/`, `js/parent.js`); no build step
- `data/` — created at runtime: `family.db` and `photos/` (git-ignored)

### API overview

Unauthenticated (used by the display): `GET /api/state`, `/api/events`, `/api/chores/day`,
`POST /api/chores/:id/complete`, `DELETE /api/chores/completions/:id`, `/api/finance/summary`,
`/api/finance/:memberId`, `/api/meals`, `/api/shopping…`, `/api/weather`, `/api/photos`.

Parent PIN required (cookie session): everything else — members, chores, approvals, transactions,
meals, settings, Google accounts and calendars, photo upload.

## License

MIT
