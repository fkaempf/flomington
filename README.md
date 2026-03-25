# Flomington

A Drosophila fly stock manager built for lab teams. Tracks stocks, crosses, virgin collections, experimental animals, and maintenance schedules with Supabase sync.

**Live:** [floriankaempf.com/flomington-refactored](https://floriankaempf.com/flomington-refactored/)

## Features

### Core Management
- **Stock Management** -- Create, edit, and organise fly stocks into collections. Track flip schedules with visual progress bars and overdue alerts.
- **Cross Tracking** -- Full cross lifecycle from virgin collection through screening and ripening, with auto-calculated dates and screening guide.

### Virgin & Experiment Tracking
- **VCS (Virgin Collection Scheduling)** -- Temperature-aware windows (8h at 25C, 16h at 18C), dashboard, and notifications.
- **Virgin Bank** -- Log and track banked virgins per stock, quick-start crosses from the bank.
- **Experiment Bank** -- Track experimental animals with sex-specific counts. Tap to edit.

### Collaboration
- **Transfers** -- Request and approve stock/cross/collection transfers between lab members.
- **Multi-user** -- Per-user PIN authentication, individual virgin banks, and ownership tracking.

### Output
- **Label Printing** -- Avery L7651 (65/page), L7161 (18/page), L4736 (48/page, removable), L4737 (27/page, removable). QR codes, vertical orientation, fold-over buffers.
- **Deep Links** -- `?stock=<id>` and `?cross=<id>` with QR codes on labels.

### Sync
- **Supabase Sync** -- Delta-only pushes, realtime subscriptions, 30s polling, pull-on-focus. Offline-first via localStorage.

## Tech Stack

- React 19, Vite 6, Tailwind CSS 4
- Supabase (Postgres + Realtime)
- GitHub Pages via GitHub Actions

## Development

```bash
npm install
npm run dev      # Dev server with HMR
npm run build    # Production build
```

## Project Structure

```
src/
├── App.jsx              # Main shell: state, sync, routing
├── screens/             # HomeScreen, StocksScreen, VirginsScreen, ExpScreen, SettingsScreen
├── components/          # CrossCard, StockModal, PrintLabelsModal, PinLock, etc.
├── hooks/               # useLS (localStorage-backed state)
└── utils/               # constants, dates, helpers, supabase, vcs, demo
```

## Deployment

Pushes to `main` auto-deploy via GitHub Actions to GitHub Pages.
