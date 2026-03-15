# Flomington

A Drosophila fly stock manager built for lab teams. Tracks stocks, crosses, virgin collections, experimental animals, and maintenance schedules in an encrypted web app with Supabase sync.

## Features

- **Stock Management** — Create, edit, and organise fly stocks into collections. Track flip schedules with visual progress bars and overdue alerts.
- **Cross Tracking** — Full cross lifecycle from virgin collection through screening and ripening, with auto-calculated dates and status advancement.
- **VCS (Virgin Collection Scheduling)** — Scheduled virgin collections with dynamic recalculation, dashboard, and notifications.
- **Virgin Bank** — Log and track banked virgins per stock, quick-start crosses from the bank.
- **Experiment Bank** — Track experimental animals collected from crosses and stocks.
- **Transfers** — Request and approve stock/cross/collection transfers between lab members.
- **Multi-user** — Per-user PIN authentication, individual virgin banks, and ownership tracking.
- **Label Printing** — Avery L7651 and L7161 formats with QR codes for stocks, crosses, and virgins.
- **Data Portability** — JSON export/import and .ics calendar export for cross milestones.
- **Supabase Sync** — Bidirectional sync with realtime subscriptions for cross-device usage.
- **Offline-first** — All data lives in localStorage with Supabase as sync layer.
- **Animated Backgrounds** — Grainient, particles, squares, dot grid, or pixel snow.

## Tech Stack

- React 19 + Tailwind CSS v4
- Vite build system
- Supabase (Postgres + Realtime)
- [StatiCrypt](https://github.com/robinmoisson/staticrypt) for password-gated deployment
- localStorage persistence with Supabase sync

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Build + encrypt for deployment
npm run deploy
```

## Project Structure

```
vite-src/
  main.jsx              # Entry point
  App.jsx               # Root component, state management, sync
  components/           # Reusable UI components
  screens/              # Screen components (Home, Stocks, Virgins, Exp, Settings)
  hooks/                # Custom hooks (useLS)
  utils/                # Constants, helpers, date utils, Supabase, VCS logic
dist/                   # Built + encrypted output (deployed)
```

## Deployment

Hosted via GitHub Pages from `main`. Run `npm run deploy` to build and encrypt, then push.

## Branches

- **main** — Production (Vite build, deployed via GitHub Pages)
- **static** — Archived pre-Vite single-file version
