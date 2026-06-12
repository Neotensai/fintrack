# FinTrack — Personal Budget & Affordability Tracker

A fully offline, installable budget app. No accounts, no servers — all data stays on your phone.

## What's inside

- index.html — app shell and styles
- app.js — all logic (no external libraries, works fully offline)
- manifest.json — PWA manifest (app name, icon, standalone display)
- sw.js — service worker for offline caching
- icon-192.png / icon-512.png — app icons (replace with your own if you like)

## Features

- Overall balance + monthly net, with a 30K starting balance you can change in Settings
- Cash expenses deduct instantly; credit expenses deduct 3 months later on the 27th, with a visual pipeline
- Spending pace indicator — warns when you're spending faster than the month is passing
- "Can I afford this?" simulator: safety buffer (SB = avg expenses × 3), 90-day pending credit, cash flow recovery model with 12-month projection
- Year view with per-month breakdown and balance trajectory
- Recurring transactions (subscriptions/bills auto-post monthly)
- Category budgets with spend bars, savings goals
- Edit/delete any transaction; CSV export; JSON backup & restore
- Everything persists on-device via localStorage

## Turn it into an Android APK

### Option A — Install as a PWA (fastest, ~5 minutes, no APK needed)

1. Host the folder anywhere with HTTPS. Easiest: create a free GitHub account,
   make a new repository, upload these 6 files, then enable Settings → Pages.
   You'll get a URL like https://yourname.github.io/fintrack/
2. Open that URL in Chrome on your Android phone.
3. Tap the three-dot menu → "Add to Home screen" → "Install".

It installs like a real app: own icon, fullscreen, works offline. For personal
use this is functionally identical to an APK.

### Option B — Real APK with PWABuilder (~10 minutes, free)

1. Host the folder as in Option A (HTTPS is required).
2. Go to https://www.pwabuilder.com, paste your URL, click Start.
3. Choose Android → Generate. Download the package.
4. The zip contains a signed APK you can sideload, plus an AAB if you ever
   want to publish on Google Play.
5. On your phone: copy the APK over, tap it, allow "install from unknown
   sources" when prompted.

### Option C — Capacitor (full native project, for developers)

```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init FinTrack com.yourname.fintrack --web-dir .
npx cap add android
npx cap open android   # requires Android Studio
# Build → Build APK(s) in Android Studio
```

This gives you a real native shell and access to native plugins
(notifications, file system, biometrics) if you want to extend it later.

## Notes

- Data lives in the app's localStorage. Use Settings → "Backup everything"
  regularly; restoring the JSON on a new phone brings everything back.
- Opening index.html directly from the file system works for a quick test,
  but the service worker (offline cache) only activates when served over
  HTTP(S) or inside an APK wrapper.
