# Flomington — Project Context

## What is this?
Drosophila (fruit fly) stock manager web app for a neuroscience lab. Modular React 19 + Vite + Tailwind CSS 4 app. Deployed via GitHub Pages with GitHub Actions.

## Architecture
```
src/
├── App.jsx                  # Main shell: state, sync, routing, nav
├── main.jsx                 # Entry point (ReactDOM.createRoot)
├── index.html               # HTML shell
├── index.css                # Tailwind v4 + custom styles
├── screens/
│   ├── HomeScreen.jsx       # Crosses, VCS dashboard, transfers
│   ├── StocksScreen.jsx     # Stock CRUD, search, categories
│   ├── VirginsScreen.jsx    # Virgin bank per user
│   ├── ExpScreen.jsx        # Experiment bank
│   └── SettingsScreen.jsx   # Admin, sync config, demo data
├── components/
│   ├── CrossCard.jsx        # Cross card with timeline
│   ├── StockModal.jsx       # Stock editor + VCS setup
│   ├── PrintLabelsModal.jsx # Label printing (4 formats, QR, vertical, fold)
│   ├── NewCrossWizard.jsx   # Multi-step cross setup
│   ├── EditCrossModal.jsx   # Cross field editor
│   ├── PinLock.jsx          # PIN auth screen
│   ├── AmbientFly.jsx       # Animated fly background
│   ├── BackgroundCanvas.jsx # WebGL2 grainient shader
│   └── ui/index.jsx         # Modal, Btn, Inp, Toast, ErrorBoundary
├── hooks/
│   └── useLS.js             # localStorage-backed useState
└── utils/
    ├── constants.js         # USERS, STATUSES, TEMPS, LABEL_FORMATS, etc.
    ├── dates.js             # Date formatting, parsing, flip day calcs
    ├── helpers.js           # UID, stock/cross name helpers, tag detection
    ├── supabase.js          # Client, field maps, sync (delta push, pull, realtime)
    ├── vcs.js               # VCS engine (schedules, deadlines, actions)
    └── demo.js              # Demo data generator
```

Other files:
- **`vite.config.js`** — Vite config (React plugin, Tailwind v4, base path)
- **`package.json`** — Dependencies and scripts (dev, build, deploy)
- **`supabase/schema.sql`** — Database schema reference
- **`.github/workflows/deploy.yml`** — GitHub Actions deployment

## Build & Deploy
```bash
npm run dev      # Vite dev server with HMR
npm run build    # Production build to dist/
npm run deploy   # Build + StatiCrypt encryption
git push         # Triggers GitHub Actions → GitHub Pages
```

## Key technical details
- **Data storage**: localStorage (via useLS hook), synced to Supabase with realtime subscriptions
- **Sync flow**: Pull-first on load (blocks UI with animated fly), delta-only pushes (hash-based), 30s periodic poll, tab-focus re-pull
- **Users**: `['Flo', 'Bella', 'Seba', 'Catherine', 'Tomke', 'Shahar', 'Myrto', 'Greg']`
- **PIN system**: SHA-256 hashed PINs stored per-user in localStorage AND synced to Supabase
- **Admin**: Flo is the admin. Supabase sync settings, import/export, demo data behind Flo's PIN
- **Labels**: Avery L7651 (65/sheet), L7161 (18/sheet), L4736 (48/sheet, removable), L4737 (27/sheet, removable). QR codes, vertical orientation, fold-over buffers
- **Deep links**: `?stock=<id>` and `?cross=<id>` with owner-only access control
- **Background**: WebGL2 grainient shader
- **No emojis in the app UI.** Use text symbols (♀, ♂, ✕, etc.) instead.

## Important patterns
- `useLS(key, init)` — useState backed by localStorage
- `supabasePush(stocks, crosses, pins)` / `supabasePull()` — delta-only Supabase sync
- `sanitizeRow(row)` — empty string → null, VCS object → JSON string for DB
- `mergeStocks(local, remote)` / `mergeCrosses(local, remote)` — merge by ID
- Cross statuses: `set up → waiting for virgins → collecting virgins → waiting for progeny → collecting progeny → screening → ripening → done`
- Flip schedules: 25C = 14d, 18C = 42d, RT = 28d, expanded = 7d
- VCS: 8h virgin window at 25C, 16h at 18C, 30min grace period, never auto-skip last clear

## What's done
- Full stock management (CRUD, categories, collections, flip tracking, transfer between users)
- Full cross management (multi-status workflow, auto-promote, screening guide, virgin bank)
- VCS (Virgin Collection Stock) — scheduled virgin collections with dynamic recalculation, dashboard, notifications
- Exp bank — experiment tracking with quick-log from cross cards and stock modal
- Label printing (4 Avery formats incl. removable, QR codes, vertical mode, fold buffers, grid overlay)
- Supabase bidirectional sync with delta pushes, realtime subscriptions, error logging
- Pull-first sync with ambient fly loading screen
- Admin PIN gate for sensitive settings (Flo only)
- Deep links with access control
- Editable virgin bank and exp bank counts (tap to edit)
- Offline indicator, mobile compositing fixes, Android notification fallback
- SVG fly favicon

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.1.0 | 2026-03-25 | Vite modular rewrite with full feature parity |

**Versioning convention:** MAJOR.MINOR.PATCH — bump MINOR for new features/screens, PATCH for fixes/tweaks.

## What's still TODO
- Google Calendar integration (flip reminders, cross milestones)
- Test on mobile browsers (Safari iOS, Chrome Android)
- Decouple demo data from Supabase sync (currently loadDemo pushes to Supabase)
