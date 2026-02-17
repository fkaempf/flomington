# Flomington Full Refactor Design

## Context

Flomington is a Drosophila stock manager web app for a neuroscience lab. Currently a single-file (~4800 LOC) React 18 + Tailwind CSS app loaded via CDN with runtime Babel transpilation. Deployed via GitHub Pages with StatiCrypt encryption.

The app is feature-complete but the single-file architecture makes maintenance, testing, and further development increasingly difficult.

## Goals

- Full modernization: maintainability, performance, professionalism
- Keep all existing features (stocks, crosses, labels, virgin bank, transfers, sync, etc.)
- Rethink and improve UX where it makes sense
- Add a real database (Supabase free tier) while keeping offline support
- Keep StatiCrypt shared password authentication
- Keep GitHub Pages hosting
- Mobile-first (critical for bench use)

## Tech Stack

- **Vite** -- build tool, dev server, HMR
- **React 18** + **TypeScript** -- components with type safety
- **Tailwind CSS v4** -- compiled via PostCSS (not CDN)
- **Zustand** -- lightweight state management
- **Supabase** -- Postgres database, real-time subscriptions (free tier)
- **Vitest** + **React Testing Library** -- testing
- **StatiCrypt** -- shared password gate on built output
- **GitHub Pages** -- deployment target

## Project Structure

```
src/
  main.tsx                    -- Entry point
  App.tsx                     -- Router, layout, global providers
  types/
    stock.ts                  -- Stock, StockTag, etc.
    cross.ts                  -- Cross, CrossStatus, etc.
    user.ts                   -- User, Transfer, etc.
  stores/
    stockStore.ts             -- Stocks CRUD + derived state
    crossStore.ts             -- Crosses CRUD + status transitions
    uiStore.ts                -- Current user, active screen, modals
    syncStore.ts              -- Supabase sync + offline queue
  services/
    supabase.ts               -- Client, real-time subscriptions
    sheets.ts                 -- Google Sheets export (kept as feature)
    bdsc.ts                   -- Bloomington stock lookup
    calendar.ts               -- .ics export
  hooks/
    useFlipSchedule.ts        -- Flip day calculations
    useStockTags.ts           -- Auto-detect AD/DBD/GAL4/UAS/etc.
    useOffline.ts             -- Offline detection + queue
  components/
    ui/                       -- Reusable primitives (Modal, Button, Input, Badge, Toast, etc.)
    layout/                   -- AppShell, BottomNav, Header
    stocks/                   -- StockList, StockCard, StockModal
    crosses/                  -- CrossList, CrossCard, NewCrossWizard
    labels/                   -- PrintModal, LabelPreview
    virgins/                  -- Virgin bank UI
    settings/                 -- Settings + admin panel
    home/                     -- Dashboard
  utils/
    dates.ts, flipDays.ts, genotype.ts, pin.ts
  assets/
    -- Favicon, static images
```

## Data Model (Supabase Schema)

### stocks
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| name | text NOT NULL | |
| genotype | text | |
| variant | text | 'stock' or 'expanded' |
| category | text | Collection name |
| location | text | '25inc', '25room', '18', 'RT' |
| source | text | |
| source_id | text | |
| flybase_id | text | |
| janelia_line | text | |
| maintainer | text | |
| notes | text | |
| is_gift | boolean | |
| gift_from | text | |
| copies | integer | Default 1 |
| created_at | timestamptz | |
| last_flipped | timestamptz | |
| updated_at | timestamptz | Auto-updated |

### crosses
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| parent_a | text FK stocks | |
| parent_b | text FK stocks | |
| owner | text NOT NULL | |
| cross_type | text | 'simple' or 'sequential' |
| parent_cross_id | text FK crosses | |
| temperature | text | |
| setup_date | timestamptz | |
| status | text NOT NULL | 8-step workflow |
| target_count | integer | |
| collected | jsonb | [{date, count}] |
| vials | jsonb | |
| virgins_collected | integer | |
| manual_flip_date | timestamptz | |
| manual_eclose_date | timestamptz | |
| manual_virgin_date | timestamptz | |
| experiment_type | text | |
| experiment_date | timestamptz | |
| retinal_start_date | timestamptz | |
| wait_start_date | timestamptz | |
| ripening_start_date | timestamptz | |
| notes | text | |
| updated_at | timestamptz | Auto-updated |

### pins
| Column | Type |
|--------|------|
| user_name | text PK |
| hash | text NOT NULL |

### virgin_banks
| Column | Type |
|--------|------|
| user_name | text (composite PK) |
| stock_id | text FK stocks (composite PK) |
| count | integer |

### transfers
| Column | Type |
|--------|------|
| id | text PK |
| type | text ('stock', 'cross', 'collection') |
| item_id | text |
| from_user | text |
| to_user | text |
| status | text (default 'pending') |
| created_at | timestamptz |

### collections
| Column | Type |
|--------|------|
| name | text PK |
| created_at | timestamptz |

### Sync strategy
- Supabase real-time subscriptions for live updates across devices
- localStorage as offline cache (write to local first, sync when online)
- Offline queue: mutations made offline get pushed when reconnected
- Google Sheets export stays as a manual feature in Settings

## State Management (Zustand)

Four focused stores replace 29+ useLS hooks:

**stockStore** -- stocks CRUD, derived data (overdue, search, categories)

**crossStore** -- crosses CRUD, status workflow, active/done filtering

**uiStore** -- current user, active screen, print list, background preference

**syncStore** -- Supabase connection, offline queue, sync status

Each store subscribes to Supabase real-time and writes to localStorage as cache.

## Component Architecture

State-based routing (no React Router -- single-page app behind StatiCrypt).

### Screens
- **HomeScreen** -- dashboard with overdue flips, active crosses, action queue
- **StocksScreen** -- searchable stock list with filters, collections, bulk ops
- **CrossesScreen** -- cross list with status workflow, timeline view
- **VirginsScreen** -- virgin bank per user
- **SettingsScreen** -- sync config, Google Sheets export, admin panel

### Shared UI
- Modal, Button, Input, Select, Badge, Toast
- PinLock, ConfirmDialog
- CircleProgress, Timeline

### UX improvements
- Better stock search/filter UX
- Improved cross status visualization
- Streamlined new cross wizard
- Better print preview
- Smoother transitions/animations

## Build & Deployment

```
src/ -> Vite build -> dist/ -> StatiCrypt -> index.html -> git push -> GitHub Pages
```

### npm scripts
- `dev` -- vite dev server
- `build` -- vite build
- `test` -- vitest
- `encrypt` -- staticrypt on dist/index.html
- `deploy` -- build + encrypt + push

### Config
- Single-page app output (JS/CSS bundled)
- Tailwind compiled via PostCSS
- Environment variables for Supabase URL/anon key

## Migration Strategy

### Phase 1: Scaffold
Set up Vite + TypeScript + Tailwind + Zustand. Empty app shell with routing and bottom nav.

### Phase 2: Data layer
Supabase tables, stores, sync service. Migrate existing localStorage data to Supabase.

### Phase 3: Components
Port each screen one at a time: Home, Stocks, Crosses, Virgins, Settings, Labels.

### Phase 4: Integrations
BDSC lookup, Google Sheets export, calendar export, QR/deep links.

### Phase 5: Polish
Background effects (WebGL grainient), PIN system, transfers, offline support.

### Phase 6: Testing & deploy
Full test suite, StatiCrypt encryption, GitHub Pages deployment.

## Features Preserved (full parity)

- Stock CRUD with categories, collections, flip tracking, copy management
- Cross lifecycle (8-step status workflow, auto-promote, screening guide)
- Label printing (Avery L7651 + L7161, QR codes, grid overlay, batch)
- Google Sheets export
- BDSC/FlyBase/Janelia stock lookup
- Virgin bank per user
- Transfer system (stock/cross/collection)
- PIN authentication (SHA-256, per-user, admin gate)
- Deep links (?stock=ID, ?cross=ID)
- Background effects (grainient, particles, squares, dots, snow)
- Auto-detected stock tags (AD, DBD, GAL4, LexA, UAS, Opto, Imaging)
- Calendar export (.ics)
- Multi-user support (7 users)
- Offline support via localStorage cache
