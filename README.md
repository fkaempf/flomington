# Flomington

A Drosophila fly stock manager built for lab teams. Tracks stocks, crosses, virgin collections, and maintenance schedules — all in a single encrypted web app with no backend.

## Features

- **Stock Management** — Create, edit, and organise fly stocks into collections. Track flip schedules with visual progress bars and overdue alerts.
- **Cross Tracking** — Full cross lifecycle from virgin collection through screening and ripening, with auto-calculated dates and status advancement.
- **Virgin Bank** — Log and track banked virgins per stock, quick-start crosses from the bank.
- **Transfers** — Request and approve stock/cross/collection transfers between lab members.
- **Multi-user** — Per-user PIN authentication, individual virgin banks, and ownership tracking.
- **Stock Splitting** — Any user can split off a copy of any stock under their own maintenance.
- **Data Portability** — JSON export/import and .ics calendar export for cross milestones.
- **Offline-first** — All data lives in localStorage. No server, no account needed.
- **Animated Backgrounds** — Choose from grainient, particles, squares, dot grid, or pixel snow.

## Tech Stack

- React 18 + Tailwind CSS (CDN)
- Single HTML file architecture
- [StatiCrypt](https://github.com/robinmoisson/staticrypt) for password-gated deployment
- localStorage persistence
- PWA-ready (mobile web app meta tags, dark theme)

## Development

The source lives in `src/index.html`. The deployed `index.html` at the root is the StatiCrypt-encrypted version.

```bash
# Install dependencies
npm install

# Encrypt for deployment
npm run encrypt
```

## Deployment

Hosted via GitHub Pages. Push the encrypted `index.html` to `main` and it deploys automatically.
