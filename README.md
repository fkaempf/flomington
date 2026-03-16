# Flomington

A Drosophila fly stock manager built for lab teams. Tracks stocks, crosses, virgin collections, experimental animals, and maintenance schedules in an encrypted web app with Supabase sync.

## Features

- **Stock Management** -- Create, edit, and organise fly stocks into collections. Track flip schedules with visual progress bars and overdue alerts.
- **Cross Tracking** -- Full cross lifecycle from virgin collection through screening and ripening, with auto-calculated dates and status advancement.
- **VCS (Virgin Collection Scheduling)** -- Scheduled virgin collections with temperature-aware windows (8h at 25C, 16h at 18C), dashboard, and notifications.
- **Virgin Bank** -- Log and track banked virgins per stock, quick-start crosses from the bank.
- **Experiment Bank** -- Track experimental animals collected from crosses and stocks.
- **Transfers** -- Request and approve stock/cross/collection transfers between lab members.
- **Multi-user** -- Per-user PIN authentication, individual virgin banks, and ownership tracking. PIN reset clears local data and logs out.
- **Label Printing** -- Avery L7651 and L7161 formats with QR codes for stocks, crosses, and virgins.
- **Data Portability** -- JSON export/import and .ics calendar export for cross milestones.
- **Supabase Sync** -- Bidirectional sync with realtime subscriptions, periodic polling (30s), and pull-on-focus for cross-device usage. Remote-wins strategy with local delete protection.
- **Offline-first** -- All data lives in localStorage with Supabase as sync layer.
- **Animated Backgrounds** -- Grainient, particles, squares, dot grid, or pixel snow.

## Tech Stack

- React 18 + Tailwind CSS (CDN)
- Single-file architecture (`src/index.html`)
- Supabase (Postgres + Realtime)
- [StatiCrypt](https://github.com/robinmoisson/staticrypt) for password-gated deployment
- localStorage persistence with Supabase sync

## Development

The app is a single-file React app (`src/index.html`, ~6600 lines) that runs via CDN-loaded React and Babel transpilation. The source file is gitignored; use `git add -f src/index.html` to stage.

```bash
# Install dependencies
npm install

# Encrypt and deploy
export FLOMINGTON_PW="<lab-password>"
npx staticrypt src/index.html -d . --short --remember 30 \
  --template-title 'Flomington' \
  --template-instructions 'Enter the lab password to access the fly stock manager.' \
  --template-color-primary '#8b5cf6' --template-color-secondary '#09090b' \
  -p "$FLOMINGTON_PW"
git add index.html && git add -f src/index.html && git commit && git push
```

## Project Structure

```
src/index.html          # Source app (single-file, gitignored)
index.html              # StatiCrypt encrypted output (deployed)
sw.js                   # Cleanup service worker
package.json            # Dependencies and scripts
vite-src/               # Partial Vite modularization (WIP)
```

## Deployment

Hosted via GitHub Pages from `main` at `floriankaempf.com/flomington/`. Encrypt the source, commit the encrypted output, and push.

## Sync Architecture

- **Push**: 3s debounced after any local state change. Pulls remote first to avoid re-creating deleted entries.
- **Pull**: On page load (remote-wins), every 30s (periodic polling), and on tab focus (mobile sleep recovery).
- **Realtime**: Supabase Postgres Changes subscriptions for instant cross-device updates.
- **Conflict resolution**: Remote wins for pulls. Local deletes are tracked for 15s to prevent realtime/pull from re-adding them. Push skips entries that were deleted remotely (tracked via lastPulledIds).
- **Error handling**: Sync dot turns red on any Supabase error. Click to copy error log to clipboard.
