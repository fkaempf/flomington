# Flomington — Project Context

## What is this?
Drosophila (fruit fly) stock manager web app for a neuroscience lab. Single-file React 18 + Tailwind CSS app, CDN-loaded with Babel transpilation. Deployed via GitHub Pages with StatiCrypt encryption.

## Architecture
- **`src/index.html`** — The source app (~5000 lines, gitignored). ALL code lives here. Use `git add -f src/index.html` to stage.
- **`index.html`** — StatiCrypt encrypted output (deployed). Generated from src/index.html.
- **`google-apps-script.js`** — Google Apps Script for Sheets sync. User must manually paste into their Google Sheet's Apps Script editor and redeploy.
- **`sw.js`** — Cleanup-only service worker that unregisters itself and clears caches (PWA was removed).
- **`package.json`** — Contains the `encrypt` script (staticrypt).

## Encryption workflow
```bash
npx staticrypt src/index.html -d . --short --remember 30 --template-title 'Flomington' --template-instructions 'Enter the lab password to access the fly stock manager.' --template-color-primary '#8b5cf6' --template-color-secondary '#09090b' -p "0a1fams"
```
Then: `git add index.html && git add -f src/index.html && git commit && git push`

## Key technical details
- **Data storage**: localStorage for everything, synced to Google Sheets (stocks, crosses, PINs)
- **Sync flow**: On load, pulls from Google Sheets FIRST (blocks UI with animated fly), then allows interaction. Auto-pushes changes after 3s debounce.
- **Users**: `['Flo', 'Bella', 'Seba', 'Catherine', 'Tomke', 'Shahar', 'Myrto']`
- **PIN system**: SHA-256 hashed PINs stored per-user in localStorage AND synced to Google Sheets "Pins" tab. PINs are site-wide across devices.
- **Admin**: Flo is the admin. Google Sheets sync settings, import/export, demo data, clear all are behind Flo's PIN in Settings.
- **Google Sheets**: 3 sheets — "Stocks", "Crosses", "Pins". Single Apps Script endpoint handles all.
- **Labels**: Avery L7651 (38.1x21.2mm, 65/sheet) and L7161 (63.5x46.6mm, 18/sheet). QR codes via qrcode-generator CDN. Print opens popup window.
- **Deep links**: `?stock=<id>` and `?cross=<id>` with owner-only access control for crosses.
- **Background**: WebGL2 grainient shader for animated background.

## Google Sheets sync URL (hardcoded)
```
https://script.google.com/macros/s/AKfycbxuR_-oBOJlg4bwL-A0S1wIF2irDL0zky57REwP_kLEHBnhy8fgUm_MpSk4ct22kHCdKw/exec
```

## Important patterns
- `useLS(key, init)` — useState backed by localStorage
- `sheetsPush(url, stocks, crosses, pins)` / `sheetsPull(url)` — Google Sheets sync
- `mergeStocks(local, remote)` / `mergeCrosses(local, remote)` — merge by ID (local wins on conflict)
- Cross statuses: `set up → waiting for virgins → collecting virgins → waiting for progeny → collecting progeny → screening → ripening → done`
- Flip schedules: 25C = 14d, 18C = 42d, RT = 28d, expanded = 7d

## What's done
- Full stock management (CRUD, categories, collections, flip tracking, transfer between users)
- Full cross management (multi-status workflow, auto-promote, screening guide, virgin bank)
- VCS (Virgin Collection Stock) — scheduled virgin collections with dynamic recalculation, dashboard, notifications
- Exp bank — experiment tracking with quick-log from cross cards and stock modal
- Label printing (2 Avery formats, QR codes, template grid overlay, stocks + crosses)
- Supabase bidirectional sync (stocks, crosses, PINs) with realtime subscriptions
- Pull-first sync with ambient fly loading screen
- Admin PIN gate for sensitive settings (Flo only)
- Deep links with access control
- SVG fly favicon

## Version History

| Version | Commit | Date | Description |
|---------|--------|------|-------------|
| 0.9.0 | `1cd4ae8` | 2026-03-02 | VCS (Virgin Collection Stock) scheduling & dashboard |
| 0.8.0 | `668c8aa` | 2026-03-01 | Exp bank screen with state and nav tab |
| 0.7.0 | `f648303` | 2026-02-27 | Replace Google Sheets sync with Supabase backend |
| 0.6.0 | `948fab0` | 2026-02-26 | Ambient fly loading, migration script |
| 0.5.0 | `3787ed8` | 2026-02-25 | Label printing refinements (grid toggle, full names) |
| 0.4.0 | `c0f3e50` | 2026-02-25 | Supabase push reliability, realtime race fixes |
| 0.3.0 | `d990f65` | 2026-02-23 | UAS tag pills, deep links, QR code labels |
| 0.2.0 | — | 2026-02 | Cross workflow, virgin bank, screening guide |
| 0.1.0 | — | 2026-01 | Initial stock management, Google Sheets sync |

**Versioning convention:** MAJOR.MINOR.PATCH — bump MINOR for new features/screens, PATCH for fixes/tweaks. Update this table when shipping notable changes.

## What's still TODO
- Google Calendar integration (flip reminders, cross milestones)
- Verify encrypted site works end-to-end
- Test on mobile browsers (Safari iOS, Chrome Android)
- Decouple demo data from Supabase sync (currently loadDemo pushes to Supabase)
