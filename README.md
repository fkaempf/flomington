# Flomington

A Drosophila fly stock manager built for lab teams. Tracks stocks, crosses, virgin collections, experimental animals, and maintenance schedules in an encrypted web app with Supabase sync.

## Features

### Core Management
- **Stock Management** -- Create, edit, and organise fly stocks into collections. Track flip schedules with visual progress bars and overdue alerts. Bulk copy with auto-numbered copies (#1, #2, ...) shown everywhere.
- **Cross Tracking** -- Full cross lifecycle from virgin collection through screening and ripening, with auto-calculated dates, status advancement, and screening guide.

### Virgin & Experiment Tracking
- **VCS (Virgin Collection Scheduling)** -- Scheduled virgin collections with temperature-aware windows (8h at 25C, 16h at 18C), dashboard, and notifications.
- **Virgin Bank** -- Log and track banked virgins per stock, quick-start crosses from the bank.
- **Experiment Bank** -- Track experimental animals collected from crosses and stocks with sex-specific counts.

### Collaboration
- **Transfers** -- Request and approve stock/cross/collection transfers between lab members.
- **Multi-user** -- Per-user PIN authentication, individual virgin banks, and ownership tracking. Admin features (import/export, demo data) behind Flo's PIN.

### Output
- **Label Printing** -- Avery L7651 (65/page), L7161 (18/page), L4736 (48/page, removable), and L4737 (27/page, removable). QR codes with deep links, vertical orientation, fold-over buffer zones (top/right/bottom/left), and skip labels for partially used sheets.
- **Deep Links** -- `?stock=<id>` and `?cross=<id>` URLs with QR codes on printed labels for quick scanning.
- **Data Portability** -- JSON export/import and .ics calendar export for cross milestones.

### Sync & Storage
- **Supabase Sync** -- Bidirectional sync with realtime subscriptions, delta-only pushes (~90% message reduction), periodic polling (30s), and pull-on-focus. Remote-wins strategy with local delete protection.
- **Offline-first** -- All data lives in localStorage with Supabase as sync layer.

### UI
- **Animated Backgrounds** -- WebGL2 grainient shader, particles, squares, dot grid, or pixel snow.
- **Ambient Fly** -- Animated loading screen during initial sync pull.

## Tech Stack

- React 18 + Tailwind CSS (CDN, Babel transpilation)
- Single-file architecture (`src/index.html`, ~6900 lines)
- Supabase (Postgres + Realtime)
- [StatiCrypt](https://github.com/robinmoisson/staticrypt) for password-gated deployment
- localStorage persistence with Supabase sync

## Development

The app is a single-file React app that runs via CDN-loaded React and Babel transpilation. The source file is gitignored; use `git add -f src/index.html` to stage.

```bash
# Install dependencies
npm install

# Encrypt and deploy
npx staticrypt src/index.html -d . --short --remember 30 \
  --template-title 'Flomington' \
  --template-instructions 'Enter the lab password to access the fly stock manager.' \
  --template-color-primary '#8b5cf6' --template-color-secondary '#09090b' \
  -p "<lab-password>"
git add index.html && git add -f src/index.html && git commit && git push
```

## Project Structure

```
src/index.html          # Source app (single-file, gitignored)
index.html              # StatiCrypt encrypted output (deployed)
sw.js                   # Cleanup service worker
supabase/               # Supabase migrations and config
package.json            # Dependencies and scripts
```

## Deployment

Hosted via GitHub Pages from `main` at `floriankaempf.com/flomington/`. Encrypt the source, commit the encrypted output, and push.

## Sync Architecture

- **Push**: 3s debounced after local changes. Delta-only -- only sends rows that actually changed. Pulls remote first to avoid re-creating deleted entries.
- **Pull**: On page load (remote-wins), every 30s (periodic polling), and on tab focus (mobile sleep recovery).
- **Realtime**: Supabase Postgres Changes subscriptions for instant cross-device updates.
- **Conflict resolution**: Remote wins for pulls. Local deletes tracked for 15s to prevent realtime/pull from re-adding. Push skips entries deleted remotely (tracked via lastPulledIds).
- **Error handling**: Sync dot turns red on Supabase error. Click to copy error log.
