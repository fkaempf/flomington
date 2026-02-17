# Flomington Full Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor Flomington from a 4800-line single-file React app into a modern Vite + React + TypeScript + Supabase application with full feature parity.

**Architecture:** Vite builds a React 18 + TypeScript SPA. Zustand manages state in 4 stores (stocks, crosses, ui, sync). Supabase provides Postgres + real-time sync. localStorage serves as offline cache. StatiCrypt encrypts the build output for GitHub Pages deployment.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS v4, Zustand, Supabase, Vitest, React Testing Library, StatiCrypt

**Reference:** Design doc at `docs/plans/2026-02-17-full-refactor-design.md`. Original source at `src/index.html` (4800 lines, all current logic lives here).

---

## Phase 1: Scaffold

### Task 1: Initialize Vite + React + TypeScript project

**Context:** We're creating a new project structure alongside the existing `src/index.html`. The new app will live in `src/` with proper file structure. The old `src/index.html` stays until migration is complete.

**Files:**
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/vite-env.d.ts`
- Modify: `package.json`
- Create: `.env`
- Create: `.env.example`

**Step 1: Install dependencies**

```bash
npm install react@18 react-dom@18 zustand @supabase/supabase-js
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom vitest @testing-library/react @testing-library/jest-dom jsdom tailwindcss @tailwindcss/vite postcss autoprefixer staticrypt
```

**Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 4: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 5: Create src/vite-env.d.ts**

```typescript
/// <reference types="vite/client" />
```

**Step 6: Create src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Step 7: Create src/App.tsx (minimal shell)**

```tsx
export default function App() {
  return <div className="min-h-screen bg-zinc-950 text-zinc-300">Flomington</div>;
}
```

**Step 8: Create src/index.css with Tailwind and theme variables**

Port the CSS custom properties from the original `src/index.html` (lines 16-37):

```css
@import 'tailwindcss';

:root {
  color-scheme: dark;
  --bg: #09090b;
  --surface: rgba(255,255,255,0.05);
  --surface-2: rgba(255,255,255,0.08);
  --surface-3: rgba(255,255,255,0.12);
  --border: rgba(255,255,255,0.08);
  --border-2: rgba(255,255,255,0.14);
  --text-1: #fafafa;
  --text-2: #a1a1aa;
  --text-3: #52525b;
  --accent: #8b5cf6;
  --accent-2: #a78bfa;
  --accent-glow: rgba(139,92,246,0.15);
  --accent-glow-2: rgba(139,92,246,0.08);
  --green: #22c55e;
  --amber: #f59e0b;
  --red: #ef4444;
  --radius: 16px;
  --radius-sm: 12px;
  --radius-xs: 8px;
}

* { -webkit-tap-highlight-color: transparent; }

body {
  background: var(--bg);
  color: var(--text-2);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  overscroll-behavior: none;
  letter-spacing: -0.01em;
}
```

**Step 9: Create index.html (Vite entry)**

Create a new `index.html` at project root for Vite (not the encrypted one -- that gets generated at deploy time). Name it `app.html` to avoid conflicting with the existing encrypted `index.html`:

Actually, we need to handle the conflict. The existing `index.html` is the encrypted StatiCrypt output. Vite needs its own `index.html`. Solution: configure Vite to use `app.html` as the entry, or move the encrypted output elsewhere during development. Simplest: rename the Vite entry to `app.html` and configure Vite accordingly.

```html
<!-- app.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#09090b">
  <title>Flomington</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

Update `vite.config.ts` to use `app.html`:
```typescript
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'app.html',
    },
  },
});
```

**Step 10: Create src/test/setup.ts**

```typescript
import '@testing-library/jest-dom';
```

**Step 11: Update package.json scripts**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run",
    "encrypt": "npm run build && staticrypt dist/app.html -d . --short --remember 30 --template-title 'Flomington' --template-instructions 'Enter the lab password to access the fly stock manager.' --template-color-primary '#8b5cf6' --template-color-secondary '#09090b' -p '0a1fams'",
    "deploy": "npm run encrypt && git add index.html && git push"
  }
}
```

**Step 12: Create .env.example**

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Step 13: Verify dev server starts**

Run: `npm run dev`
Expected: Vite dev server starts, page shows "Flomington" text on dark background.

**Step 14: Commit**

```bash
git add -A && git commit -m "feat: scaffold Vite + React + TypeScript project"
```

---

### Task 2: TypeScript type definitions

**Context:** Define all data types from the existing app. Reference `src/index.html` lines 412-413 for field lists, lines 570-587 for tag logic, and the cross status workflow.

**Files:**
- Create: `src/types/stock.ts`
- Create: `src/types/cross.ts`
- Create: `src/types/user.ts`
- Create: `src/types/index.ts`

**Step 1: Create src/types/stock.ts**

```typescript
export interface Stock {
  id: string;
  name: string;
  genotype?: string;
  variant?: 'stock' | 'expanded';
  category?: string;
  location?: string; // '25inc' | '25room' | '18' | 'RT'
  source?: string;
  sourceId?: string;
  flybaseId?: string;
  janeliaLine?: string;
  maintainer?: string;
  notes?: string;
  isGift?: boolean;
  giftFrom?: string;
  copies?: number;
  createdAt?: string;
  lastFlipped?: string;
  updatedAt?: string;
}

export type StockTag =
  | 'Dead' | 'Alive'
  | 'Opto' | 'Imaging'
  | 'AD' | 'DBD' | 'Split-GAL4'
  | 'GAL4' | 'LexA' | 'UAS';

export type StockVariant = 'stock' | 'expanded';

export type Temperature = '25inc' | '25room' | '18' | 'RT';

export const FLIP_DAYS: Record<string, number> = {
  '25inc': 14,
  '25room': 14,
  '18': 42,
  'RT': 28,
};

export const EXPANDED_FLIP_DAYS = 7;
```

**Step 2: Create src/types/cross.ts**

```typescript
export const CROSS_STATUSES = [
  'set up',
  'waiting for virgins',
  'collecting virgins',
  'waiting for progeny',
  'collecting progeny',
  'screening',
  'ripening',
  'done',
] as const;

export type CrossStatus = (typeof CROSS_STATUSES)[number];

export interface CollectionEntry {
  date: string;
  count: number;
}

export interface Cross {
  id: string;
  parentA?: string;
  parentB?: string;
  owner: string;
  crossType?: 'simple' | 'sequential';
  parentCrossId?: string;
  temperature?: string;
  setupDate?: string;
  status: CrossStatus;
  targetCount?: number;
  collected?: CollectionEntry[];
  vials?: string[];
  virginsCollected?: number;
  manualFlipDate?: string;
  manualEcloseDate?: string;
  manualVirginDate?: string;
  experimentType?: string;
  experimentDate?: string;
  retinalStartDate?: string;
  waitStartDate?: string;
  ripeningStartDate?: string;
  notes?: string;
  updatedAt?: string;
}
```

**Step 3: Create src/types/user.ts**

```typescript
export const USERS = ['Flo', 'Bella', 'Seba', 'Catherine', 'Tomke', 'Shahar', 'Myrto'] as const;
export type UserName = (typeof USERS)[number];
export const ADMIN_USER: UserName = 'Flo';

export interface Transfer {
  id: string;
  type: 'stock' | 'cross' | 'collection';
  itemId: string;
  fromUser: string;
  toUser: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface VirginBankEntry {
  stockId: string;
  count: number;
}

export type BackgroundType = 'none' | 'grainient' | 'particles' | 'squares' | 'dots' | 'snow';

export type Screen = 'home' | 'stocks' | 'crosses' | 'virgins' | 'settings';
```

**Step 4: Create src/types/index.ts**

```typescript
export * from './stock';
export * from './cross';
export * from './user';
```

**Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 6: Commit**

```bash
git add src/types/ && git commit -m "feat: add TypeScript type definitions for stocks, crosses, users"
```

---

### Task 3: Utility functions

**Context:** Extract pure utility functions from `src/index.html`. These are used throughout the app: date helpers, flip day calculations, genotype tag detection, PIN hashing. Reference original source for exact logic.

**Files:**
- Create: `src/utils/dates.ts`
- Create: `src/utils/flipDays.ts`
- Create: `src/utils/genotype.ts`
- Create: `src/utils/pin.ts`
- Create: `src/utils/id.ts`
- Create: `src/utils/index.ts`
- Test: `src/utils/__tests__/dates.test.ts`
- Test: `src/utils/__tests__/flipDays.test.ts`
- Test: `src/utils/__tests__/genotype.test.ts`

**Step 1: Write failing tests for date utils**

Reference original `src/index.html` for `dFromNow`, `addDays`, `fmtDate` functions (~lines 400-410).

```typescript
// src/utils/__tests__/dates.test.ts
import { describe, it, expect } from 'vitest';
import { daysFromNow, addDays, formatDate } from '../dates';

describe('daysFromNow', () => {
  it('returns negative for past dates', () => {
    const yesterday = addDays(new Date(), -1).toISOString();
    expect(daysFromNow(yesterday)).toBe(-1);
  });

  it('returns positive for future dates', () => {
    const tomorrow = addDays(new Date(), 1).toISOString();
    expect(daysFromNow(tomorrow)).toBe(1);
  });

  it('returns 0 for today', () => {
    expect(daysFromNow(new Date().toISOString())).toBe(0);
  });
});

describe('addDays', () => {
  it('adds days to a date', () => {
    const base = new Date('2026-01-01');
    const result = addDays(base, 5);
    expect(result.getDate()).toBe(6);
  });

  it('subtracts days with negative value', () => {
    const base = new Date('2026-01-10');
    const result = addDays(base, -3);
    expect(result.getDate()).toBe(7);
  });
});

describe('formatDate', () => {
  it('formats a date as short string', () => {
    const result = formatDate('2026-03-15');
    expect(result).toMatch(/Mar 15/);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/dates.test.ts`
Expected: FAIL -- module not found

**Step 3: Implement date utils**

```typescript
// src/utils/dates.ts
export function addDays(date: Date | string, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function daysFromNow(dateStr: string): number {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = d.getTime() - now.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDateFull(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/dates.test.ts`
Expected: PASS

**Step 5: Write failing tests for flip day calculations**

```typescript
// src/utils/__tests__/flipDays.test.ts
import { describe, it, expect } from 'vitest';
import { getFlipDays, getFlipProgress } from '../flipDays';
import type { Stock } from '../../types';

describe('getFlipDays', () => {
  it('returns 14 for 25inc stock', () => {
    expect(getFlipDays({ location: '25inc', variant: 'stock' } as Stock)).toBe(14);
  });

  it('returns 42 for 18C stock', () => {
    expect(getFlipDays({ location: '18', variant: 'stock' } as Stock)).toBe(42);
  });

  it('returns 7 for expanded variant', () => {
    expect(getFlipDays({ location: '25inc', variant: 'expanded' } as Stock)).toBe(7);
  });

  it('returns 28 for RT', () => {
    expect(getFlipDays({ location: 'RT', variant: 'stock' } as Stock)).toBe(28);
  });
});
```

**Step 6: Run to verify fail, implement, verify pass**

```typescript
// src/utils/flipDays.ts
import type { Stock } from '../types';
import { FLIP_DAYS, EXPANDED_FLIP_DAYS } from '../types';
import { daysFromNow } from './dates';

export function getFlipDays(stock: Stock): number {
  if (stock.variant === 'expanded') return EXPANDED_FLIP_DAYS;
  return FLIP_DAYS[stock.location || '25inc'] || 14;
}

export function getFlipAge(stock: Stock): number {
  const lastDate = stock.lastFlipped || stock.createdAt;
  if (!lastDate) return 0;
  return Math.abs(daysFromNow(lastDate));
}

export function getFlipProgress(stock: Stock): number {
  const age = getFlipAge(stock);
  const total = getFlipDays(stock);
  return Math.min(Math.round((age / total) * 100), 100);
}

export function isOverdue(stock: Stock): boolean {
  return getFlipAge(stock) >= getFlipDays(stock);
}
```

**Step 7: Write failing tests for genotype tag detection**

Reference `src/index.html` lines 565-587 for `stockTags` function, OPTO/CALC constants.

```typescript
// src/utils/__tests__/genotype.test.ts
import { describe, it, expect } from 'vitest';
import { getStockTags } from '../genotype';
import type { Stock } from '../../types';

const makeStock = (overrides: Partial<Stock>): Stock => ({
  id: 'test', name: 'test', ...overrides,
});

describe('getStockTags', () => {
  it('detects AD from genotype', () => {
    const s = makeStock({ genotype: 'w[1118]; P{y[+t7.7] w[+mC]=R23F02-p65.AD}attP40' });
    expect(getStockTags(s)).toContain('AD');
  });

  it('detects DBD from genotype', () => {
    const s = makeStock({ genotype: 'w[1118]; P{y[+t7.7] w[+mC]=R23F02-GAL4.DBD}attP2' });
    expect(getStockTags(s)).toContain('DBD');
  });

  it('detects Split-GAL4 when both AD and DBD present', () => {
    const s = makeStock({ genotype: 'w[1118]; P{R58E02-p65.AD}attP40; P{R40F04-GAL4.DBD}attP2' });
    expect(getStockTags(s)).toContain('Split-GAL4');
    expect(getStockTags(s)).not.toContain('AD');
    expect(getStockTags(s)).not.toContain('DBD');
  });

  it('detects GAL4 from genotype', () => {
    const s = makeStock({ genotype: 'w[1118]; P{GAL4-Mef2.R}3' });
    expect(getStockTags(s)).toContain('GAL4');
  });

  it('detects LexA from genotype', () => {
    const s = makeStock({ genotype: 'w[1118]; P{GMR56C09-lexA}attP40' });
    expect(getStockTags(s)).toContain('LexA');
  });

  it('detects UAS from genotype', () => {
    const s = makeStock({ genotype: 'w[*]; P{20XUAS-CsChrimson.mVenus}attP18' });
    expect(getStockTags(s)).toContain('UAS');
  });

  it('detects Opto from genotype keywords', () => {
    const s = makeStock({ genotype: 'P{20XUAS-CsChrimson.mVenus}' });
    expect(getStockTags(s)).toContain('Opto');
  });

  it('detects Imaging from GFP', () => {
    const s = makeStock({ genotype: 'UAS-CD8-GFP' });
    expect(getStockTags(s)).toContain('Imaging');
  });

  it('detects Dead from notes', () => {
    const s = makeStock({ notes: 'This stock is dead' });
    expect(getStockTags(s)).toContain('Dead');
  });
});
```

**Step 8: Implement genotype utils**

```typescript
// src/utils/genotype.ts
import type { Stock, StockTag } from '../types';

const OPTO_KEYWORDS = ['cschrimson', 'chrimson', 'gtacr', 'guillardia', 'channelrhodopsin', 'halorhodopsin', 'chronos', 'cheta', 'reach', 'bireachex'];
const IMAGING_KEYWORDS = ['gcamp', 'gfp', 'tdtomato', 'mcherry', 'rfp', 'yfp', 'cfp', 'venus', 'citrine', 'cerulean', 'mkate'];

export function getStockTags(stock: Stock): StockTag[] {
  const tags: StockTag[] = [];
  const g = (stock.genotype || '').toLowerCase();
  const n = (stock.notes || '').toLowerCase();
  const nm = (stock.name || '').toLowerCase();
  const all = g + ' ' + n;

  if (/\bdead\b/i.test(stock.notes || '')) tags.push('Dead');
  if (/\balive\b/i.test(stock.notes || '')) tags.push('Alive');

  if (OPTO_KEYWORDS.some(k => all.includes(k))) tags.push('Opto');
  if (IMAGING_KEYWORDS.some(k => all.includes(k)) || all.includes('gfp')) tags.push('Imaging');

  const hasAD = all.includes('p65.ad') || all.includes('-p65.ad}') || n.includes(' ad ') || n.includes(' ad(') || /\bAD\b/.test(stock.notes || '');
  const hasDBD = all.includes('gal4.dbd') || all.includes('-gal4.dbd}') || n.includes(' dbd ') || n.includes(' dbd(') || /\bDBD\b/.test(stock.notes || '');

  if (hasAD && hasDBD) {
    tags.push('Split-GAL4');
  } else {
    if (hasAD) tags.push('AD');
    if (hasDBD) tags.push('DBD');
  }

  if (/lexa/i.test(g) || /\blexa\b/i.test(n)) tags.push('LexA');
  if (/gal4/i.test(g) && !hasAD && !hasDBD) tags.push('GAL4');
  if (/uas/i.test(g) || /\buas\b/i.test(n) || /\buas\b/i.test(nm)) tags.push('UAS');

  return tags;
}

export const TAG_STYLES: Record<string, { background: string; color: string }> = {
  Dead: { background: 'rgba(239,68,68,0.25)', color: '#fca5a5' },
  Alive: { background: 'rgba(34,197,94,0.25)', color: '#86efac' },
  Opto: { background: 'rgba(239,68,68,0.1)', color: '#fca5a5' },
  Imaging: { background: 'rgba(34,197,94,0.1)', color: '#86efac' },
  AD: { background: 'rgba(249,168,212,0.1)', color: '#f9a8d4' },
  DBD: { background: 'rgba(147,197,253,0.1)', color: '#93c5fd' },
  'Split-GAL4': { background: 'rgba(139,92,246,0.1)', color: '#a78bfa' },
  UAS: { background: 'rgba(251,191,36,0.1)', color: '#fbbf24' },
  GAL4: { background: 'rgba(253,224,71,0.1)', color: '#fde047' },
  LexA: { background: 'rgba(94,234,212,0.1)', color: '#5eead4' },
};
```

**Step 9: Implement PIN and ID utils**

```typescript
// src/utils/pin.ts
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const pinHash = await hashPin(pin);
  return pinHash === hash;
}
```

```typescript
// src/utils/id.ts
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
```

```typescript
// src/utils/index.ts
export * from './dates';
export * from './flipDays';
export * from './genotype';
export * from './pin';
export * from './id';
```

**Step 10: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 11: Commit**

```bash
git add src/utils/ && git commit -m "feat: add utility functions with tests (dates, flip days, genotype tags, PIN)"
```

---

### Task 4: Supabase service + client

**Context:** Set up the Supabase client and define the database service layer. The user needs to create a Supabase project at supabase.com and get the URL + anon key. The SQL schema should be runnable in the Supabase SQL editor.

**Files:**
- Create: `src/services/supabase.ts`
- Create: `supabase/schema.sql`

**Step 1: Create Supabase schema SQL**

```sql
-- supabase/schema.sql
-- Run this in Supabase SQL Editor to create all tables

CREATE TABLE IF NOT EXISTS stocks (
  id text PRIMARY KEY,
  name text NOT NULL,
  genotype text,
  variant text DEFAULT 'stock',
  category text,
  location text DEFAULT '25inc',
  source text,
  source_id text,
  flybase_id text,
  janelia_line text,
  maintainer text,
  notes text,
  is_gift boolean DEFAULT false,
  gift_from text,
  copies integer DEFAULT 1,
  created_at timestamptz,
  last_flipped timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crosses (
  id text PRIMARY KEY,
  parent_a text,
  parent_b text,
  owner text NOT NULL,
  cross_type text DEFAULT 'simple',
  parent_cross_id text,
  temperature text,
  setup_date timestamptz,
  status text NOT NULL DEFAULT 'set up',
  target_count integer,
  collected jsonb DEFAULT '[]',
  vials jsonb DEFAULT '[]',
  virgins_collected integer DEFAULT 0,
  manual_flip_date timestamptz,
  manual_eclose_date timestamptz,
  manual_virgin_date timestamptz,
  experiment_type text,
  experiment_date timestamptz,
  retinal_start_date timestamptz,
  wait_start_date timestamptz,
  ripening_start_date timestamptz,
  notes text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pins (
  user_name text PRIMARY KEY,
  hash text NOT NULL
);

CREATE TABLE IF NOT EXISTS virgin_banks (
  user_name text NOT NULL,
  stock_id text NOT NULL,
  count integer DEFAULT 0,
  PRIMARY KEY (user_name, stock_id)
);

CREATE TABLE IF NOT EXISTS transfers (
  id text PRIMARY KEY,
  type text NOT NULL,
  item_id text,
  from_user text NOT NULL,
  to_user text NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collections (
  name text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stocks_updated_at BEFORE UPDATE ON stocks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER crosses_updated_at BEFORE UPDATE ON crosses FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE stocks;
ALTER PUBLICATION supabase_realtime ADD TABLE crosses;
ALTER PUBLICATION supabase_realtime ADD TABLE pins;
ALTER PUBLICATION supabase_realtime ADD TABLE virgin_banks;
ALTER PUBLICATION supabase_realtime ADD TABLE transfers;
ALTER PUBLICATION supabase_realtime ADD TABLE collections;

-- Allow anonymous access (app uses shared password via StatiCrypt, not Supabase auth)
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE crosses ENABLE ROW LEVEL SECURITY;
ALTER TABLE pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE virgin_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON stocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON crosses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON pins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON virgin_banks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON transfers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON collections FOR ALL USING (true) WITH CHECK (true);
```

**Step 2: Create Supabase client service**

```typescript
// src/services/supabase.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
```

**Step 3: Commit**

```bash
git add src/services/supabase.ts supabase/ && git commit -m "feat: add Supabase client and database schema"
```

---

### Task 5: Zustand stores

**Context:** Create the 4 Zustand stores that replace the 29+ useLS hooks. Each store handles CRUD, persists to localStorage as cache, and syncs with Supabase. Reference `src/index.html` for all state fields used in the App component (~lines 4605-4650).

**Files:**
- Create: `src/stores/stockStore.ts`
- Create: `src/stores/crossStore.ts`
- Create: `src/stores/uiStore.ts`
- Create: `src/stores/syncStore.ts`
- Create: `src/stores/index.ts`
- Test: `src/stores/__tests__/stockStore.test.ts`
- Test: `src/stores/__tests__/crossStore.test.ts`

**Step 1: Write failing test for stock store**

```typescript
// src/stores/__tests__/stockStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStockStore } from '../stockStore';
import type { Stock } from '../../types';

describe('stockStore', () => {
  beforeEach(() => {
    useStockStore.setState({ stocks: [] });
  });

  it('adds a stock', () => {
    const stock: Stock = { id: 's1', name: 'Test Stock' };
    useStockStore.getState().addStock(stock);
    expect(useStockStore.getState().stocks).toHaveLength(1);
    expect(useStockStore.getState().stocks[0].name).toBe('Test Stock');
  });

  it('updates a stock', () => {
    useStockStore.setState({ stocks: [{ id: 's1', name: 'Old' }] });
    useStockStore.getState().updateStock('s1', { name: 'New' });
    expect(useStockStore.getState().stocks[0].name).toBe('New');
  });

  it('deletes a stock', () => {
    useStockStore.setState({ stocks: [{ id: 's1', name: 'Test' }] });
    useStockStore.getState().deleteStock('s1');
    expect(useStockStore.getState().stocks).toHaveLength(0);
  });

  it('flips a stock', () => {
    const now = new Date().toISOString().slice(0, 10);
    useStockStore.setState({ stocks: [{ id: 's1', name: 'Test', lastFlipped: '2026-01-01' }] });
    useStockStore.getState().flipStock('s1');
    expect(useStockStore.getState().stocks[0].lastFlipped?.slice(0, 10)).toBe(now);
  });
});
```

**Step 2: Run test to verify fail**

Run: `npx vitest run src/stores/__tests__/stockStore.test.ts`
Expected: FAIL

**Step 3: Implement stock store**

```typescript
// src/stores/stockStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Stock } from '../types';

interface StockState {
  stocks: Stock[];
  addStock: (stock: Stock) => void;
  updateStock: (id: string, updates: Partial<Stock>) => void;
  deleteStock: (id: string) => void;
  flipStock: (id: string) => void;
  setStocks: (stocks: Stock[]) => void;
}

export const useStockStore = create<StockState>()(
  persist(
    (set) => ({
      stocks: [],
      addStock: (stock) => set((s) => ({ stocks: [...s.stocks, stock] })),
      updateStock: (id, updates) =>
        set((s) => ({
          stocks: s.stocks.map((st) => (st.id === id ? { ...st, ...updates } : st)),
        })),
      deleteStock: (id) => set((s) => ({ stocks: s.stocks.filter((st) => st.id !== id) })),
      flipStock: (id) =>
        set((s) => ({
          stocks: s.stocks.map((st) =>
            st.id === id ? { ...st, lastFlipped: new Date().toISOString() } : st
          ),
        })),
      setStocks: (stocks) => set({ stocks }),
    }),
    { name: 'flo-stocks' }
  )
);
```

**Step 4: Run test to verify pass**

Run: `npx vitest run src/stores/__tests__/stockStore.test.ts`
Expected: PASS

**Step 5: Create cross store (same pattern)**

```typescript
// src/stores/crossStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Cross, CrossStatus, CROSS_STATUSES } from '../types';

interface CrossState {
  crosses: Cross[];
  addCross: (cross: Cross) => void;
  updateCross: (id: string, updates: Partial<Cross>) => void;
  deleteCross: (id: string) => void;
  advanceStatus: (id: string) => void;
  setCrosses: (crosses: Cross[]) => void;
}

const STATUS_ORDER: CrossStatus[] = [
  'set up', 'waiting for virgins', 'collecting virgins',
  'waiting for progeny', 'collecting progeny', 'screening', 'ripening', 'done',
];

function nextStatus(current: CrossStatus): CrossStatus {
  const idx = STATUS_ORDER.indexOf(current);
  return idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : current;
}

export const useCrossStore = create<CrossState>()(
  persist(
    (set) => ({
      crosses: [],
      addCross: (cross) => set((s) => ({ crosses: [...s.crosses, cross] })),
      updateCross: (id, updates) =>
        set((s) => ({
          crosses: s.crosses.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),
      deleteCross: (id) => set((s) => ({ crosses: s.crosses.filter((c) => c.id !== id) })),
      advanceStatus: (id) =>
        set((s) => ({
          crosses: s.crosses.map((c) =>
            c.id === id ? { ...c, status: nextStatus(c.status) } : c
          ),
        })),
      setCrosses: (crosses) => set({ crosses }),
    }),
    { name: 'flo-crosses' }
  )
);
```

**Step 6: Create UI store**

```typescript
// src/stores/uiStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Screen, BackgroundType, UserName } from '../types';

interface UiState {
  currentUser: UserName;
  activeScreen: Screen;
  printList: string[];
  printListCrosses: string[];
  background: BackgroundType;
  setUser: (user: UserName) => void;
  setScreen: (screen: Screen) => void;
  addToPrint: (id: string) => void;
  removeFromPrint: (id: string) => void;
  clearPrintList: () => void;
  addToPrintCrosses: (id: string) => void;
  removeFromPrintCrosses: (id: string) => void;
  setBackground: (bg: BackgroundType) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      currentUser: 'Flo',
      activeScreen: 'home',
      printList: [],
      printListCrosses: [],
      background: 'grainient',
      setUser: (currentUser) => set({ currentUser }),
      setScreen: (activeScreen) => set({ activeScreen }),
      addToPrint: (id) => set((s) => ({ printList: [...new Set([...s.printList, id])] })),
      removeFromPrint: (id) => set((s) => ({ printList: s.printList.filter((x) => x !== id) })),
      clearPrintList: () => set({ printList: [], printListCrosses: [] }),
      addToPrintCrosses: (id) => set((s) => ({ printListCrosses: [...new Set([...s.printListCrosses, id])] })),
      removeFromPrintCrosses: (id) => set((s) => ({ printListCrosses: s.printListCrosses.filter((x) => x !== id) })),
      setBackground: (background) => set({ background }),
    }),
    { name: 'flo-ui' }
  )
);
```

**Step 7: Create sync store**

```typescript
// src/stores/syncStore.ts
import { create } from 'zustand';

interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  error: string | null;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setLastSync: (time: string) => void;
  setError: (error: string | null) => void;
}

export const useSyncStore = create<SyncState>()((set) => ({
  isOnline: navigator.onLine,
  isSyncing: false,
  lastSyncAt: null,
  error: null,
  setOnline: (isOnline) => set({ isOnline }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setLastSync: (lastSyncAt) => set({ lastSyncAt, error: null }),
  setError: (error) => set({ error, isSyncing: false }),
}));
```

**Step 8: Create stores barrel export**

```typescript
// src/stores/index.ts
export { useStockStore } from './stockStore';
export { useCrossStore } from './crossStore';
export { useUiStore } from './uiStore';
export { useSyncStore } from './syncStore';
```

**Step 9: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 10: Commit**

```bash
git add src/stores/ && git commit -m "feat: add Zustand stores (stocks, crosses, ui, sync) with localStorage persistence"
```

---

### Task 6: UI primitives

**Context:** Create the shared UI components used across all screens. Port the styling from the original app's component patterns. These are the building blocks: Modal, Button, Input, Badge, Toast, etc.

**Files:**
- Create: `src/components/ui/Modal.tsx`
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Input.tsx`
- Create: `src/components/ui/Badge.tsx`
- Create: `src/components/ui/Toast.tsx`
- Create: `src/components/ui/Select.tsx`
- Create: `src/components/ui/ConfirmDialog.tsx`
- Create: `src/components/ui/CircleProgress.tsx`
- Create: `src/components/ui/index.ts`

**Step 1: Implement each primitive component**

Port the styling from the original app. Reference `src/index.html` for the Modal (~line 4100), Btn/Inp/Txt patterns, badge class, toast hook, circle progress component.

Each component should use Tailwind classes matching the existing dark theme. Keep components small and focused.

**Step 2: Verify dev server renders components**

Run: `npm run dev`
Expected: No errors, components render.

**Step 3: Commit**

```bash
git add src/components/ui/ && git commit -m "feat: add shared UI primitives (Modal, Button, Input, Badge, Toast, etc.)"
```

---

### Task 7: App shell + navigation

**Context:** Create the layout wrapper with bottom navigation matching the current app. Reference `src/index.html` for the bottom nav (~lines 4680-4720) and header bar.

**Files:**
- Create: `src/components/layout/AppShell.tsx`
- Create: `src/components/layout/BottomNav.tsx`
- Create: `src/components/layout/Header.tsx`
- Create: `src/components/layout/index.ts`
- Modify: `src/App.tsx`

**Step 1: Create BottomNav**

5 tabs: Home, Stocks, Cross, Virgins, Settings. Uses `useUiStore` for active screen.

**Step 2: Create Header**

User selector dropdown + date display, matching current header.

**Step 3: Create AppShell**

Wraps content with header + bottom nav + background.

**Step 4: Update App.tsx**

Route between screens based on `useUiStore.activeScreen`. Render the active screen component (placeholder divs for now).

**Step 5: Verify navigation works**

Run: `npm run dev`
Expected: Can tap between all 5 tabs, header shows user selector.

**Step 6: Commit**

```bash
git add src/components/layout/ src/App.tsx && git commit -m "feat: add app shell with bottom nav and header"
```

---

## Phase 3: Components (port each screen)

### Task 8: HomeScreen

**Context:** Port the home dashboard. Reference `src/index.html` HomeScreen (~lines 2300-2600). Shows: overdue flip count, stocks due per collection, active crosses summary.

**Files:**
- Create: `src/components/home/HomeScreen.tsx`
- Create: `src/components/home/FlipSection.tsx`
- Create: `src/components/home/ActiveCrosses.tsx`
- Create: `src/components/home/index.ts`

Port the flip tracking logic, overdue detection, collection grouping. Use `useStockStore` and `useCrossStore` instead of props.

**Commit:** `feat: add HomeScreen with flip tracking and active crosses`

---

### Task 9: StocksScreen

**Context:** The largest screen (~630 lines in original). Port stock list with search, filters, collections, bulk operations. Reference `src/index.html` StocksScreen (~lines 2580-3200).

**Files:**
- Create: `src/components/stocks/StocksScreen.tsx`
- Create: `src/components/stocks/StockCard.tsx`
- Create: `src/components/stocks/StockModal.tsx`
- Create: `src/components/stocks/StockForm.tsx`
- Create: `src/components/stocks/CollectionTabs.tsx`
- Create: `src/components/stocks/index.ts`

Key features to port:
- Search across name, genotype, all IDs
- Filter by Mine/All
- Sort by Flip/Added/A-Z
- Copy selector (show specific copy number)
- Collection tabs with add/edit
- Stock cards with flip progress, tags, genotype
- Stock detail modal with edit, delete, transfer, print
- Multi-select mode for bulk operations
- Add new stock form with BDSC lookup

**Commit:** `feat: add StocksScreen with search, filters, collections, CRUD`

---

### Task 10: CrossesScreen + CrossCard

**Context:** Port cross management. Reference `src/index.html` for CrossCard (~lines 1490-1830) and cross-related components.

**Files:**
- Create: `src/components/crosses/CrossesScreen.tsx`
- Create: `src/components/crosses/CrossCard.tsx`
- Create: `src/components/crosses/CrossTimeline.tsx`
- Create: `src/components/crosses/NewCrossWizard.tsx`
- Create: `src/components/crosses/EditCrossModal.tsx`
- Create: `src/components/crosses/ScreeningGuide.tsx`
- Create: `src/components/crosses/index.ts`

Key features:
- Cross card with status workflow, advance button
- Collection logging (date + count)
- Re-vial creation
- Screening guide generation
- Timeline visualization
- New cross wizard (multi-step)
- Sequential crosses support
- Auto-promote based on temperature/days

**Commit:** `feat: add CrossesScreen with full lifecycle workflow`

---

### Task 11: VirginsScreen

**Context:** Port virgin bank. Reference `src/index.html` VirginsScreen (~lines 2070-2160).

**Files:**
- Create: `src/components/virgins/VirginsScreen.tsx`
- Create: `src/components/virgins/index.ts`

Per-user virgin bank with add/remove counts per stock.

**Commit:** `feat: add VirginsScreen with per-user virgin bank`

---

### Task 12: SettingsScreen

**Context:** Port settings. Reference `src/index.html` SettingsScreen (~lines 3490-3850).

**Files:**
- Create: `src/components/settings/SettingsScreen.tsx`
- Create: `src/components/settings/SyncSettings.tsx`
- Create: `src/components/settings/PinLock.tsx`
- Create: `src/components/settings/AdminPanel.tsx`
- Create: `src/components/settings/index.ts`

Key features:
- Supabase sync status display
- Google Sheets export (manual trigger)
- Background effect selector
- PIN management (set/change per user)
- Admin panel (behind Flo's PIN): import/export, demo data, clear all
- Virgins per cross setting

**Commit:** `feat: add SettingsScreen with sync, PIN, admin panel`

---

### Task 13: PrintLabelsModal

**Context:** Port label printing. Reference `src/index.html` PrintLabelsModal (~lines 4183-4400).

**Files:**
- Create: `src/components/labels/PrintModal.tsx`
- Create: `src/components/labels/LabelPreview.tsx`
- Create: `src/components/labels/index.ts`

Key features:
- Two Avery formats (L7651: 65/sheet, L7161: 18/sheet)
- QR code generation (use qrcode-generator library)
- Grid overlay toggle
- Skip labels offset
- Batch print stocks + crosses
- Opens in popup window for printing

**Commit:** `feat: add PrintLabelsModal with Avery formats and QR codes`

---

## Phase 4: Integrations

### Task 14: BDSC stock lookup

**Context:** Port BDSC integration. Reference `src/index.html` for `fetchBDSCInfo` and Janelia FlyLight detection.

**Files:**
- Create: `src/services/bdsc.ts`

Fetches stock info from Bloomington, auto-fills genotype, source ID, FlyBase ID, Janelia line detection.

**Commit:** `feat: add BDSC stock lookup service`

---

### Task 15: Google Sheets export

**Context:** Keep Sheets export as a manual feature. Reference `src/index.html` for `sheetsPush`/`sheetsPull`.

**Files:**
- Create: `src/services/sheets.ts`

Export stocks/crosses/pins to Google Sheets. Import from Sheets. Uses the existing Apps Script endpoint.

**Commit:** `feat: add Google Sheets export/import service`

---

### Task 16: Calendar export + deep links

**Context:** Port .ics calendar export and deep link handling (?stock=ID, ?cross=ID).

**Files:**
- Create: `src/services/calendar.ts`
- Create: `src/hooks/useDeepLink.ts`

**Commit:** `feat: add calendar export and deep link support`

---

## Phase 5: Polish

### Task 17: Background effects

**Context:** Port the WebGL grainient shader and other background effects. Reference `src/index.html` BackgroundCanvas (~lines 3935-4100).

**Files:**
- Create: `src/components/layout/BackgroundCanvas.tsx`

6 modes: none, grainient (WebGL2 shader), particles, squares, dots, snow.

**Commit:** `feat: add animated background effects (grainient, particles, etc.)`

---

### Task 18: Supabase real-time sync

**Context:** Wire up Supabase real-time subscriptions so changes propagate across devices. Handle offline queue.

**Files:**
- Create: `src/services/sync.ts`
- Create: `src/hooks/useSync.ts`

Subscribe to all tables. On change, update local stores. On mutation, push to Supabase. Queue mutations when offline, replay when online.

**Commit:** `feat: add Supabase real-time sync with offline queue`

---

### Task 19: Transfer system

**Context:** Port stock/cross/collection transfers between users.

**Files:**
- Create: `src/components/transfers/TransferModal.tsx`
- Create: `src/stores/transferStore.ts`

**Commit:** `feat: add transfer system for stocks, crosses, and collections`

---

### Task 20: Data migration tool

**Context:** Create a one-time migration to move existing localStorage data to Supabase.

**Files:**
- Create: `src/services/migration.ts`

Reads existing `flo-stocks`, `flo-crosses`, `flo-pin-*` from localStorage and upserts into Supabase. Shows progress in Settings.

**Commit:** `feat: add data migration tool (localStorage to Supabase)`

---

## Phase 6: Testing & Deploy

### Task 21: Integration tests

**Files:**
- Create: `src/test/stocks.test.tsx`
- Create: `src/test/crosses.test.tsx`

Test key user flows: add stock, flip stock, create cross, advance cross status.

**Commit:** `test: add integration tests for stock and cross workflows`

---

### Task 22: Build + encrypt + deploy pipeline

**Context:** Wire up the full build pipeline: Vite build -> StatiCrypt encrypt -> deploy to GitHub Pages.

**Step 1: Verify build works**

Run: `npm run build`
Expected: `dist/` contains `app.html` with inlined JS/CSS.

**Step 2: Verify encryption works**

Run: `npm run encrypt`
Expected: Encrypted `index.html` at project root.

**Step 3: Test encrypted site**

Open `index.html` in browser, enter password "0a1fams", verify app loads.

**Step 4: Deploy**

```bash
git add index.html && git push
```

**Step 5: Verify GitHub Pages**

Open deployed URL, verify app works end-to-end.

**Commit:** `feat: complete build and deployment pipeline`

---

### Task 23: Cleanup

- Remove old `src/index.html` (single-file app)
- Remove old `index_source.html` backup
- Update `CLAUDE.md` with new project structure
- Update `README.md`

**Commit:** `chore: remove legacy single-file app, update docs`

---

## Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| 1: Scaffold | 1-5 | Vite, types, utils, Supabase, stores |
| 2: UI Foundation | 6-7 | Primitives, app shell, navigation |
| 3: Screens | 8-13 | Home, Stocks, Crosses, Virgins, Settings, Labels |
| 4: Integrations | 14-16 | BDSC, Sheets export, calendar, deep links |
| 5: Polish | 17-20 | Backgrounds, real-time sync, transfers, migration |
| 6: Ship | 21-23 | Tests, build pipeline, cleanup |
