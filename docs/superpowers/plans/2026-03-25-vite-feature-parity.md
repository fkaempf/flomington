# Vite Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the vite-src modular app to full feature parity with the monolith (src/index.html), covering ~28 missing or partially-implemented features across sync, VCS, labels, UI, and data.

**Architecture:** Port features directly from the monolith into the existing vite-src file structure. No new files needed — all changes go into existing modules. The monolith at `src/index.html` is the source of truth for all behavior.

**Tech Stack:** React 19, Vite 6, Tailwind CSS 4, Supabase JS client, qrcode-generator

**Reference:** The monolith is at `src/index.html`. Line numbers reference that file.

---

## Chunk 1: Constants & Config

### Task 1: Add Greg to USERS and add missing label formats

**Files:**
- Modify: `vite-src/utils/constants.js`

- [ ] **Step 1: Add Greg to USERS array**

```javascript
// Line 3 — change:
export const USERS = ['Flo', 'Bella', 'Seba', 'Catherine', 'Tomke', 'Shahar', 'Myrto'];
// to:
export const USERS = ['Flo', 'Bella', 'Seba', 'Catherine', 'Tomke', 'Shahar', 'Myrto', 'Greg'];
```

- [ ] **Step 2: Add L4736 and L4737 to LABEL_FORMATS with removable flag**

```javascript
// Lines 21-24 — replace LABEL_FORMATS with:
export const LABEL_FORMATS = {
  'L7651': { name: 'Avery J8651 / L7651', cols: 5, rows: 13, labelW: 38.1, labelH: 21.2, marginTop: 10.7, marginLeft: 4.75, gapX: 2.5, gapY: 0, pageW: 210, pageH: 297 },
  'L7161': { name: 'Avery J8161 / L7161', cols: 3, rows: 6, labelW: 63.5, labelH: 46.6, marginTop: 8.7, marginLeft: 7.21, gapX: 2.54, gapY: 0, pageW: 210, pageH: 297 },
  'L4736': { name: 'Avery L4736 [removable]', cols: 4, rows: 12, labelW: 45.7, labelH: 21.2, marginTop: 10.7, marginLeft: 10.05, gapX: 2.5, gapY: 0, pageW: 210, pageH: 297, removable: true },
  'L4737': { name: 'Avery L4737 [removable]', cols: 3, rows: 9, labelW: 63.5, labelH: 29.6, marginTop: 13.15, marginLeft: 5.21, gapX: 2.54, gapY: 0, pageW: 210, pageH: 297, removable: true },
};
```

- [ ] **Step 3: Commit**

```bash
git add vite-src/utils/constants.js
git commit -m "Add Greg to USERS, add L4736/L4737 removable label formats"
```

---

## Chunk 2: VCS Fixes

### Task 2: Fix getVirginWindowH to accept at18 parameter

**Files:**
- Modify: `vite-src/utils/vcs.js:7`

- [ ] **Step 1: Update getVirginWindowH to accept at18 param**

```javascript
// Line 7 — change:
export function getVirginWindowH() { return 8; }
// to:
export function getVirginWindowH(at18) { return at18 ? 16 : 8; }
```

- [ ] **Step 2: Fix the fallback call at line 128 to pass cycleAt18**

The `vcsWindowProgress` function calls `getVirginWindowH()` without args at line 128. It needs the vcs context:

```javascript
// Line 128 — change:
  const windowMs = getVirginWindowH() * 3600000;
// to:
  const windowMs = getVirginWindowH(vcs.overnightAt18) * 3600000;
```

- [ ] **Step 3: Commit**

```bash
git add vite-src/utils/vcs.js
git commit -m "Fix VCS: 16h virgin window at 18C, 8h at 25C"
```

### Task 3: Never auto-skip the last clear of the day

**Files:**
- Modify: `vite-src/utils/vcs.js:92-96`

- [ ] **Step 1: Add last-clear protection to auto-advance logic**

```javascript
// Lines 92-96 — replace the while loop:
  while (result.length > 1 && result[0].timeUntilMs < -2 * 3600000) {
    result[0].skipped = true;
    result.shift();
  }
// with:
  while (result.length > 1 && result[0].timeUntilMs < -2 * 3600000) {
    const isClear = ['clear', 'clear_discard', 'collect_clear'].includes(result[0].type);
    if (isClear && !result.slice(1).some(a => ['clear', 'clear_discard', 'collect_clear'].includes(a.type))) break;
    result[0].skipped = true;
    result.shift();
  }
```

- [ ] **Step 2: Commit**

```bash
git add vite-src/utils/vcs.js
git commit -m "Never auto-skip the last clear action of the day"
```

### Task 4: Only ask 18C prompt for evening clears

**Files:**
- Modify: `vite-src/screens/HomeScreen.jsx`

- [ ] **Step 1: Find the VCS action handlers for both crosses and stocks**

In HomeScreen.jsx, search for where VCS actions are handled — the code where `overnightAt18` triggers a confirmation prompt. Add `&& next.key === 'evening'` to each condition.

The pattern to find: `v.overnightAt18` or `vcs.overnightAt18` checks.

For EVERY instance where the code checks `overnightAt18` to trigger a 18C confirmation, add `&& next.key === 'evening'` so only the evening clear triggers the 18C prompt — not morning or afternoon actions.

Also for grace period discard actions: do NOT prompt for 18C.

- [ ] **Step 2: Verify all instances are patched**

Search for all `overnightAt18` references in HomeScreen.jsx and confirm each has the `next.key === 'evening'` guard.

- [ ] **Step 3: Commit**

```bash
git add vite-src/screens/HomeScreen.jsx
git commit -m "Only ask 18C prompt for evening clears, not all actions"
```

---

## Chunk 3: Supabase Sync Improvements

### Task 5: Add sanitizeRow and CROSS_FIELD_MAP vcs field

**Files:**
- Modify: `vite-src/utils/supabase.js`

- [ ] **Step 1: Add vcs to CROSS_FIELD_MAP**

```javascript
// Line 23 — add before the closing brace:
  ripeningStartDate: 'ripening_start_date', vcs: 'vcs',
```

- [ ] **Step 2: Add sanitizeRow function after toCamel**

```javascript
// After line 43 (after toCamel function), add:
export function sanitizeRow(row) {
  for (const k of Object.keys(row)) {
    if (row[k] === '') row[k] = null;
    if (k === 'vcs' && row[k] && typeof row[k] === 'object') row[k] = JSON.stringify(row[k]);
  }
  return row;
}
```

- [ ] **Step 3: Apply sanitizeRow in supabasePush**

```javascript
// Line 100 — change:
    const rows = stocks.map(s => toSnake(s, STOCK_FIELD_MAP));
// to:
    const rows = stocks.map(s => sanitizeRow(toSnake(s, STOCK_FIELD_MAP)));

// Line 105 — change:
    const rows = crosses.map(c => toSnake(c, CROSS_FIELD_MAP));
// to:
    const rows = crosses.map(c => sanitizeRow(toSnake(c, CROSS_FIELD_MAP)));
```

- [ ] **Step 4: Commit**

```bash
git add vite-src/utils/supabase.js
git commit -m "Add sanitizeRow, add vcs to CROSS_FIELD_MAP"
```

### Task 6: Add delta-only pushes with hash-based change detection

**Files:**
- Modify: `vite-src/utils/supabase.js`

- [ ] **Step 1: Add hash tracking state and helper**

```javascript
// After sanitizeRow, add:
const _lastPushed = { stocks: new Map(), crosses: new Map() };
function _rowHash(row) { return JSON.stringify(row); }
```

- [ ] **Step 2: Replace supabasePush with delta-aware version**

Replace the existing `supabasePush` function (lines 96-115) with:

```javascript
export async function supabasePush(stocks, crosses, pins) {
  const sb = getSb();
  if (!sb) throw new Error('Supabase not configured');
  let stocksPushed = 0, crossesPushed = 0;
  if (stocks && stocks.length > 0) {
    const allRows = stocks.map(s => sanitizeRow(toSnake(s, STOCK_FIELD_MAP)));
    const changed = allRows.filter(r => _rowHash(r) !== _lastPushed.stocks.get(r.id));
    if (changed.length > 0) {
      const { error } = await sb.from('stocks').upsert(changed, { onConflict: 'id' });
      if (error) throw error;
      stocksPushed = changed.length;
    }
    const newSnap = new Map();
    allRows.forEach(r => newSnap.set(r.id, _rowHash(r)));
    _lastPushed.stocks = newSnap;
  }
  if (crosses && crosses.length > 0) {
    const allRows = crosses.map(c => sanitizeRow(toSnake(c, CROSS_FIELD_MAP)));
    const changed = allRows.filter(r => _rowHash(r) !== _lastPushed.crosses.get(r.id));
    if (changed.length > 0) {
      const { error } = await sb.from('crosses').upsert(changed, { onConflict: 'id' });
      if (error) throw error;
      crossesPushed = changed.length;
    }
    const newSnap = new Map();
    allRows.forEach(r => newSnap.set(r.id, _rowHash(r)));
    _lastPushed.crosses = newSnap;
  }
  if (pins && pins.length > 0) {
    const rows = pins.map(p => ({ user_name: p.user, hash: p.hash }));
    const { error } = await sb.from('pins').upsert(rows, { onConflict: 'user_name' });
    if (error) throw error;
  }
  return { stockCount: stocksPushed, crossCount: crossesPushed };
}
```

- [ ] **Step 3: Fix virgin bank push — remove updated_at**

In `supabasePushVirginBank` (line 135), remove the `updated_at` field from the row — the Supabase column doesn't accept it:

```javascript
// Line 134-136 — change:
    .map(([stockId, count]) => ({
      user_name: userName, stock_id: stockId, count,
      updated_at: new Date().toISOString(),
    }));
// to:
    .map(([stockId, count]) => ({
      user_name: userName, stock_id: stockId, count,
    }));
```

- [ ] **Step 4: Commit**

```bash
git add vite-src/utils/supabase.js
git commit -m "Delta-only Supabase pushes, fix virgin bank 400 error"
```

### Task 7: Add cross VCS parsing in supabasePull

**Files:**
- Modify: `vite-src/utils/supabase.js`

- [ ] **Step 1: Parse VCS JSON for crosses in supabasePull**

In the `supabasePull` function, the crosses mapping (lines 84-91) doesn't parse VCS. Add VCS parsing:

```javascript
// After line 89, add:
    if (typeof c.vcs === 'string') try { c.vcs = JSON.parse(c.vcs); } catch { c.vcs = null; }
```

- [ ] **Step 2: Commit**

```bash
git add vite-src/utils/supabase.js
git commit -m "Parse VCS JSON for crosses in Supabase pull"
```

### Task 8: Fix initial pull — remote-wins for crosses with VCS backfill

**Files:**
- Modify: `vite-src/App.jsx`

- [ ] **Step 1: Fix crosses initial pull (line 230)**

```javascript
// Line 230 — change:
      if (remote.crosses) setCrosses(remote.crosses);
// to:
      if (remote.crosses) setCrosses(prev => {
        const localMap = new Map(prev.map(c => [c.id, c]));
        return remote.crosses.map(rc => {
          const local = localMap.get(rc.id);
          if (local?.vcs && !rc.vcs) return { ...rc, vcs: local.vcs };
          return rc;
        });
      });
```

- [ ] **Step 2: Commit**

```bash
git add vite-src/App.jsx
git commit -m "Fix initial pull: remote-wins for crosses with VCS backfill"
```

### Task 9: Add sync error logging and status improvements

**Files:**
- Modify: `vite-src/App.jsx`

- [ ] **Step 1: Add syncErrorLog ref and pullInProgress ref**

After `const realtimeUpdateRef = useRef(false);` (around line 205), add:

```javascript
  const syncErrorLog = useRef([]);
  const pullInProgress = useRef(false);
```

- [ ] **Step 2: Update the push effect to check pullInProgress**

In the auto-push effect (around line 339), update the check:

```javascript
// Change:
    if (realtimeUpdateRef.current) { realtimeUpdateRef.current = false; if (!pendingPush.current) return; }
// to:
    if (realtimeUpdateRef.current || pullInProgress.current) { realtimeUpdateRef.current = false; if (!pendingPush.current) return; }
```

- [ ] **Step 3: Wrap push errors to log them**

In the push `.catch()` (around line 352), add error logging:

```javascript
// Change:
      }).catch(() => {
        setSyncStatus('Push failed – retrying...');
// to:
      }).catch((err) => {
        syncErrorLog.current.push({ time: new Date().toISOString(), type: 'push', error: String(err) });
        setSyncStatus('Push failed – retrying...');
```

- [ ] **Step 4: Add tab-focus re-pull and 30s periodic poll**

After the flush effect (after line 371), add:

```javascript
  // Re-pull auxiliary data on tab focus and every 30s
  const lastRePull = useRef(0);
  const rePullAux = useCallback(() => {
    if (!sbConfigured || pullInProgress.current) return;
    pullInProgress.current = true;
    Promise.all([
      supabasePullVirginBank(currentUser),
      supabasePullExpBank(currentUser),
      supabasePullTransfers(),
    ]).then(([remoteVB, remoteEB, remoteT]) => {
      realtimeUpdateRef.current = true;
      setVirginBank(remoteVB);
      realtimeUpdateRef.current = true;
      setExpBank(remoteEB);
      realtimeUpdateRef.current = true;
      setTransfers(prev => {
        const localMap = new Map(prev.map(t => [t.id, t]));
        const merged = [...prev];
        remoteT.forEach(rt => { if (!localMap.has(rt.id)) merged.push(rt); });
        return merged;
      });
    }).catch(() => {}).finally(() => { pullInProgress.current = false; });
  }, [sbConfigured, currentUser]);

  useEffect(() => {
    const onVis = () => { if (!document.hidden) rePullAux(); };
    document.addEventListener('visibilitychange', onVis);
    const iv = setInterval(rePullAux, 30000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(iv); };
  }, [rePullAux]);
```

- [ ] **Step 5: Make sync dot clickable to copy error log**

In the header sync status rendering (around line 549), wrap the dot in an onClick:

```javascript
// Add onClick to the sync indicator wrapper div:
<div className="flex items-center gap-1" title={syncStatus}
  onClick={() => {
    if (syncErrorLog.current.length > 0) {
      navigator.clipboard.writeText(JSON.stringify(syncErrorLog.current, null, 2));
      toast.add('Error log copied to clipboard');
    } else {
      rePullAux();
      toast.add('Pulling...');
    }
  }}
  style={{ cursor: 'pointer' }}>
```

- [ ] **Step 6: Commit**

```bash
git add vite-src/App.jsx
git commit -m "Add sync error logging, tab-focus re-pull, 30s poll, clickable sync dot"
```

---

## Chunk 4: Label Printing Enhancements

### Task 10: Add vertical toggle, fold buffers, and format improvements

**Files:**
- Modify: `vite-src/components/PrintLabelsModal.jsx`

- [ ] **Step 1: Add vertical and fold buffer state**

At the top of the component, after the existing format state, add:

```javascript
const [vertical, setVertical] = useState(false);
const [skipLabels, setSkipLabels] = useState(0);
const [bufferTop, setBufferTop] = useState(0);
const [bufferRight, setBufferRight] = useState(0);
const [bufferBottom, setBufferBottom] = useState(0);
const [bufferLeft, setBufferLeft] = useState(15);
useEffect(() => {
  if (vertical) { setBufferLeft(0); setBufferTop(15); }
  else { setBufferTop(0); setBufferLeft(15); }
}, [vertical]);
```

- [ ] **Step 2: Change default format to L4737**

```javascript
// Change the format state default from 'L7161' to 'L4737':
const [format, setFormat] = useState('L4737');
```

- [ ] **Step 3: Update format dropdown to show full names with [removable]**

The format select should display `f.name` from the LABEL_FORMATS object, which now includes "[removable]" for L4736/L4737.

- [ ] **Step 4: Add vertical toggle checkbox and fold buffer controls**

Add UI controls in the print modal settings area:
- Checkbox: "Vertical orientation" that toggles `vertical`
- Number inputs for fold buffers (top, right, bottom, left) in mm
- "Skip labels" input

- [ ] **Step 5: Apply vertical and fold buffers to the label rendering**

In the label cell rendering code, apply:
- Rotate label content 90deg when `vertical` is true
- Apply fold buffers as padding: `max(basePadding, buffer)` for each side
- For L4737, apply margin corrections: -1mm top, -1mm left

- [ ] **Step 6: Commit**

```bash
git add vite-src/components/PrintLabelsModal.jsx
git commit -m "Add vertical labels, fold buffers, L4736/L4737 defaults"
```

---

## Chunk 5: UI & Mobile Fixes

### Task 11: Portal modals to document.body

**Files:**
- Modify: `vite-src/components/ui/index.jsx`

- [ ] **Step 1: Import createPortal**

```javascript
import ReactDOM from 'react-dom';
```

- [ ] **Step 2: Update Modal to use createPortal**

Wrap the modal return in `ReactDOM.createPortal(...)`:

```javascript
return ReactDOM.createPortal(
  <div className="fixed inset-0 z-50 flex items-center justify-center px-5 pt-5 pb-24"
    onClick={onClose} onWheel={e => e.stopPropagation()}>
    {/* existing backdrop + modal content */}
  </div>,
  document.body
);
```

- [ ] **Step 3: Add body/main overflow management**

Add a useEffect to lock scrolling when modal is open:

```javascript
useEffect(() => {
  const main = document.querySelector('main');
  if (!main) return;
  const prevMain = main.style.overflow;
  const prevBody = document.body.style.overflow;
  main.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  return () => { main.style.overflow = prevMain; document.body.style.overflow = prevBody; };
}, []);
```

- [ ] **Step 4: Commit**

```bash
git add vite-src/components/ui/index.jsx
git commit -m "Portal modals to document.body, fix scroll containment"
```

### Task 12: Mobile compositing and safe area fixes

**Files:**
- Modify: `vite-src/App.jsx`
- Modify: `vite-src/index.css`

- [ ] **Step 1: Add GPU compositing to main content**

In App.jsx, the `<main>` element (around line 580), add compositing style:

```javascript
<main className="flex-1 overflow-y-auto pb-28" style={{ position: 'relative', zIndex: 1, WebkitTransform: 'translateZ(0)' }}>
```

- [ ] **Step 2: Add iOS safe area CSS**

In `index.css`, add safe area support for the bottom nav:

```css
.bottom-nav {
  padding-bottom: env(safe-area-inset-bottom);
}
```

- [ ] **Step 3: Commit**

```bash
git add vite-src/App.jsx vite-src/index.css
git commit -m "Fix mobile black screen with GPU compositing, add iOS safe areas"
```

### Task 13: Notification crash fix for Android

**Files:**
- Modify: `vite-src/App.jsx`

- [ ] **Step 1: Wrap all `new Notification()` calls in try/catch**

Create a `sendNotification` helper and replace all `new Notification(...)` calls:

```javascript
const sendNotification = useCallback((title, opts) => {
  try { new Notification(title, opts); } catch {
    if (navigator.serviceWorker) navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opts)).catch(() => {});
  }
}, []);
```

Replace every `new Notification(...)` in the notification effect (lines ~453-500) with `sendNotification(...)`.

- [ ] **Step 2: Commit**

```bash
git add vite-src/App.jsx
git commit -m "Fix Android notification crash: try/catch with SW fallback"
```

---

## Chunk 6: Feature Parity

### Task 14: Editable virgin bank count

**Files:**
- Modify: `vite-src/screens/VirginsScreen.jsx`

- [ ] **Step 1: Add editingVirginId state**

```javascript
const [editingVirginId, setEditingVirginId] = useState(null);
```

- [ ] **Step 2: Add sort by banked count (highest first)**

Sort the stock entries so stocks with more banked virgins appear first:

```javascript
const sortedEntries = entries.sort((a, b) => (virginBank[b.id] || 0) - (virginBank[a.id] || 0));
```

- [ ] **Step 3: Make the count number clickable for inline editing**

Where the virgin count is displayed, wrap it in a click handler:

```javascript
{editingVirginId === s.id ? (
  <input type="number" className="text-xl font-bold w-12 bg-transparent text-center outline-none"
    style={{ color: '#f9a8d4', border: '1px solid rgba(249,168,212,0.3)', borderRadius: '6px' }}
    defaultValue={virginBank[s.id]} autoFocus min="0"
    onFocus={e => e.target.select()}
    onBlur={e => {
      const val = Math.max(0, parseInt(e.target.value) || 0);
      if (val === 0) { setVirginBank(prev => { const next = {...prev}; delete next[s.id]; return next; }); }
      else setVirginBank(prev => ({...prev, [s.id]: val}));
      setEditingVirginId(null);
    }}
    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingVirginId(null); }}
  />
) : (
  <span onClick={() => setEditingVirginId(s.id)} style={{ cursor: 'pointer' }}>{virginBank[s.id]}</span>
)}
```

- [ ] **Step 4: Commit**

```bash
git add vite-src/screens/VirginsScreen.jsx
git commit -m "Make virgin bank count editable, sort by count"
```

### Task 15: Editable exp bank male/female counts

**Files:**
- Modify: `vite-src/screens/ExpScreen.jsx`

- [ ] **Step 1: Add editingExp state**

```javascript
const [editingExp, setEditingExp] = useState(null); // { id, sex }
```

- [ ] **Step 2: Make male/female counts clickable for inline editing**

Where male and female counts are displayed, add inline editing:

For male count:
```javascript
{editingExp?.id === e.id && editingExp?.sex === 'm' ? (
  <input type="number" className="w-8 bg-transparent text-center text-[9px] outline-none font-bold"
    style={{ color: '#93c5fd', border: '1px solid rgba(147,197,253,0.3)', borderRadius: '4px' }}
    defaultValue={e.m || 0} autoFocus min="0"
    onFocus={ev => ev.target.select()}
    onBlur={ev => {
      const val = Math.max(0, parseInt(ev.target.value) || 0);
      setExpBank(prev => {
        const cur = prev[e.id] || { m: 0, f: 0, source: e.source };
        const next = { ...prev, [e.id]: { ...cur, m: val } };
        if (val === 0 && (cur.f || 0) === 0) delete next[e.id];
        return next;
      });
      setEditingExp(null);
    }}
    onKeyDown={ev => { if (ev.key === 'Enter') ev.target.blur(); if (ev.key === 'Escape') setEditingExp(null); }}
  />
) : (
  <span onClick={() => setEditingExp({ id: e.id, sex: 'm' })} style={{ cursor: 'pointer' }}>{e.m || 0}</span>
)}
```

Same pattern for female count with `sex: 'f'` and pink color `#f9a8d4`.

- [ ] **Step 3: Commit**

```bash
git add vite-src/screens/ExpScreen.jsx
git commit -m "Make exp bank male/female counts editable by tapping"
```

---

## Chunk 7: GitHub Pages Configuration

### Task 16: Configure Vite build for GitHub Pages

**Files:**
- Modify: `vite.config.js`
- Modify: `package.json`

- [ ] **Step 1: Verify vite.config.js has correct base path**

The `base` should be `/flomington-refactored/` for GitHub Pages (matching the repo name):

```javascript
export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'vite-src',
  base: '/flomington-refactored/',
  build: { outDir: '../dist', emptyOutDir: true },
});
```

- [ ] **Step 2: Update package.json deploy script**

Ensure the deploy script builds and optionally encrypts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "vite build && npx staticrypt dist/index.html -d dist --short --remember 30 --template-title 'Flomington' --template-instructions 'Enter the lab password.' --template-color-primary '#8b5cf6' --template-color-secondary '#09090b' -p '0a1fams'"
  }
}
```

- [ ] **Step 3: Add GitHub Pages workflow file**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Commit**

```bash
git add vite.config.js package.json .github/workflows/deploy.yml
git commit -m "Configure GitHub Pages deployment with Actions workflow"
```

---

## Chunk 8: Build Verification

### Task 17: Build and verify

- [ ] **Step 1: Run the build**

```bash
npm run build
```

Expected: Clean build with no errors.

- [ ] **Step 2: Run dev server and verify**

```bash
npm run dev
```

Open the dev server URL. Verify:
- App loads with PinLock screen
- User selector includes Greg
- Label format dropdown shows all 4 formats including [removable]
- Sync indicator dot appears in header
- VCS schedule uses correct windows (8h/16h)

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "v1.1.0: Full feature parity with monolith"
git push
```
