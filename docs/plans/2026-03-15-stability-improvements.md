# Stability Improvements - Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Flomington more stable and future-proof without a full rebuild - sync localStorage-only data to Supabase, deduplicate VCS card rendering, and add robustness improvements.

**Architecture:** Everything lives in `src/index.html` (~6300 lines). Supabase sync follows the existing pattern: field maps, `toSnake`/`toCamel` converters, `supabasePull`/`supabasePush`, debounced push effect, and realtime subscriptions. Three new Supabase tables needed: `virgin_banks`, `exp_banks`, `transfers`.

**Tech Stack:** React 18, Tailwind CSS, Supabase JS v2 (all CDN-loaded, single file)

**Branch:** `feature/stability-improvements`

---

## Phase 1: Data Sync (Tasks 1-5)

### Task 1: Create Supabase Tables

**Files:** None (Supabase SQL console only)

Three data types are localStorage-only and lost on new device: virginBank, expBank, and transfers.

- [ ] **Step 1: Run SQL in Supabase SQL Editor**

```sql
CREATE TABLE virgin_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text NOT NULL,
  stock_id text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_name, stock_id)
);

CREATE TABLE exp_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text NOT NULL,
  source_id text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('stock', 'cross')),
  male_count integer NOT NULL DEFAULT 0,
  female_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_name, source_id)
);

CREATE TABLE transfers (
  id text PRIMARY KEY,
  from_user text NOT NULL,
  to_user text NOT NULL,
  transfer_type text NOT NULL CHECK (transfer_type IN ('stock', 'cross', 'collection')),
  item_id text,
  collection_name text,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  seen boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER PUBLICATION supabase_realtime ADD TABLE virgin_banks;
ALTER PUBLICATION supabase_realtime ADD TABLE exp_banks;
ALTER PUBLICATION supabase_realtime ADD TABLE transfers;

ALTER TABLE virgin_banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON virgin_banks FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE exp_banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON exp_banks FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON transfers FOR ALL USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Verify tables accessible via Supabase dashboard**

---

### Task 2: Add Virgin Bank Supabase Sync

**Files:**
- Modify: `src/index.html:435-441` (toSnake - fix null handling)
- Modify: `src/index.html` (add push/pull helpers after ~line 534)
- Modify: `src/index.html:~5874` (pull virgin bank during initial sync)
- Modify: `src/index.html:~5935-5957` (debounced push - add virginBank)
- Modify: `src/index.html:~617` (realtime subscription for virgin_banks)

**Context:** Virgin bank stored per-user as `useLS('flo-virgins-${currentUser}', {})` at line 5827. Shape: `{ [stockId]: number }`.

- [ ] **Step 1: Fix toSnake null handling (line 438)**

Change `if (obj[camel] !== undefined && obj[camel] !== null)` to `if (obj[camel] !== undefined)` so null VCS propagates to Supabase.

- [ ] **Step 2: Add push/pull helpers**

```js
async function supabasePushVirginBank(userName, virginBank) {
  const sb = getSb();
  if (!sb) return;
  const rows = Object.entries(virginBank)
    .filter(([, count]) => count > 0)
    .map(([stockId, count]) => ({
      user_name: userName, stock_id: stockId, count,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length > 0) {
    const { error } = await sb.from('virgin_banks').upsert(rows, { onConflict: 'user_name,stock_id' });
    if (error) console.error('Virgin bank push failed:', error);
  }
  const { data: remote } = await sb.from('virgin_banks').select('stock_id').eq('user_name', userName);
  if (remote) {
    const localIds = new Set(Object.keys(virginBank).filter(k => virginBank[k] > 0));
    const toDelete = remote.filter(r => !localIds.has(r.stock_id)).map(r => r.stock_id);
    if (toDelete.length > 0) {
      await sb.from('virgin_banks').delete().eq('user_name', userName).in('stock_id', toDelete);
    }
  }
}

async function supabasePullVirginBank(userName) {
  const sb = getSb();
  if (!sb) return {};
  const { data, error } = await sb.from('virgin_banks').select('*').eq('user_name', userName);
  if (error || !data) return {};
  const bank = {};
  data.forEach(row => { if (row.count > 0) bank[row.stock_id] = row.count; });
  return bank;
}
```

- [ ] **Step 3: Pull during initial sync (after stocks/crosses merge)**

```js
supabasePullVirginBank(currentUser).then(remoteVB => {
  setVirginBank(prev => {
    const merged = { ...remoteVB };
    Object.entries(prev).forEach(([k, v]) => {
      if (v > 0) merged[k] = Math.max(merged[k] || 0, v);
    });
    return merged;
  });
});
```

- [ ] **Step 4: Add virginBank to debounced push effect**

Add `supabasePushVirginBank(currentUser, virginBank)` inside `doPush()` and add `virginBank` to the dependency array.

- [ ] **Step 5: Add realtime subscription for virgin_banks**

```js
.on('postgres_changes', { event: '*', schema: 'public', table: 'virgin_banks' }, payload => {
  if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
    const row = payload.new;
    setVirginBank(prev => {
      if (row.count > 0) return { ...prev, [row.stock_id]: row.count };
      const next = { ...prev }; delete next[row.stock_id]; return next;
    });
  } else if (payload.eventType === 'DELETE' && payload.old?.stock_id) {
    setVirginBank(prev => { const next = { ...prev }; delete next[payload.old.stock_id]; return next; });
  }
})
```

- [ ] **Step 6: Verify**

Open app on two browsers as same user. Add virgins on browser A, confirm they appear on browser B.

- [ ] **Step 7: Commit**

```bash
git add -f src/index.html
git commit -m "feat: sync virgin bank to Supabase with realtime updates"
```

---

### Task 3: Add Exp Bank Supabase Sync

**Files:** Same areas as Task 2, but for exp_banks table.

**Context:** Exp bank stored as `useLS('flo-exp-${currentUser}', {})` at line 5828. Shape: `{ [sourceId]: { m: number, f: number, source: 'cross'|'stock' } }`.

- [ ] **Step 1: Add push/pull helpers**

```js
async function supabasePushExpBank(userName, expBank) {
  const sb = getSb();
  if (!sb) return;
  const rows = Object.entries(expBank)
    .filter(([, v]) => (v.m || 0) + (v.f || 0) > 0)
    .map(([sourceId, v]) => ({
      user_name: userName, source_id: sourceId,
      source_type: v.source || 'cross',
      male_count: v.m || 0, female_count: v.f || 0,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length > 0) {
    const { error } = await sb.from('exp_banks').upsert(rows, { onConflict: 'user_name,source_id' });
    if (error) console.error('Exp bank push failed:', error);
  }
  const { data: remote } = await sb.from('exp_banks').select('source_id').eq('user_name', userName);
  if (remote) {
    const localIds = new Set(Object.keys(expBank).filter(k => (expBank[k].m || 0) + (expBank[k].f || 0) > 0));
    const toDelete = remote.filter(r => !localIds.has(r.source_id)).map(r => r.source_id);
    if (toDelete.length > 0) {
      await sb.from('exp_banks').delete().eq('user_name', userName).in('source_id', toDelete);
    }
  }
}

async function supabasePullExpBank(userName) {
  const sb = getSb();
  if (!sb) return {};
  const { data, error } = await sb.from('exp_banks').select('*').eq('user_name', userName);
  if (error || !data) return {};
  const bank = {};
  data.forEach(row => {
    bank[row.source_id] = { m: row.male_count || 0, f: row.female_count || 0, source: row.source_type || 'cross' };
  });
  return bank;
}
```

- [ ] **Step 2: Pull during initial sync, push in debounced effect, add realtime** (same pattern as Task 2)

- [ ] **Step 3: Verify and commit**

```bash
git add -f src/index.html
git commit -m "feat: sync exp bank to Supabase with realtime updates"
```

---

### Task 4: Add Transfers Supabase Sync

**Files:** Same sync areas + `createTransfer` function (~line 6099)

**Context:** Transfers stored as `useLS('flo-transfers', [])` at line 5830. This is the most impactful sync gap - transfers are cross-user requests that are currently invisible to the recipient on other devices.

- [ ] **Step 1: Add push/pull helpers**

```js
async function supabasePushTransfers(transfers) {
  const sb = getSb();
  if (!sb || !transfers?.length) return;
  const rows = transfers.map(t => ({
    id: t.id, from_user: t.from, to_user: t.to,
    transfer_type: t.type, item_id: t.itemId || null,
    collection_name: t.collection || null,
    display_name: t.name, status: t.status || 'pending',
    seen: t.seen || false, created_at: t.createdAt || new Date().toISOString(),
  }));
  const { error } = await sb.from('transfers').upsert(rows, { onConflict: 'id' });
  if (error) console.error('Transfers push failed:', error);
}

async function supabasePullTransfers() {
  const sb = getSb();
  if (!sb) return [];
  const { data, error } = await sb.from('transfers').select('*');
  if (error || !data) return [];
  return data.map(row => ({
    id: row.id, from: row.from_user, to: row.to_user,
    type: row.transfer_type, itemId: row.item_id,
    collection: row.collection_name, name: row.display_name,
    status: row.status, seen: row.seen || false, createdAt: row.created_at,
  }));
}
```

- [ ] **Step 2: Pull during initial sync with merge logic**

Local wins for status (user may have already accepted/declined locally).

- [ ] **Step 3: Push immediately on createTransfer for instant cross-device visibility**

- [ ] **Step 4: Add realtime subscription for transfers**

- [ ] **Step 5: Verify and commit**

```bash
git add -f src/index.html
git commit -m "feat: sync transfers to Supabase with realtime updates"
```

---

### Task 5: Auto-Cleanup Old Transfers

- [ ] **Step 1: After pulling transfers, remove resolved+seen transfers older than 7 days**
- [ ] **Step 2: Delete stale transfers from Supabase too**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat: auto-cleanup resolved transfers older than 7 days"
```

---

## Phase 2: VCS Card Deduplication (Task 6)

### Task 6: Extract Shared VcsCard Component

**Files:**
- Add: VcsCard function component (insert before HomeScreen, ~line 2665)
- Modify: `src/index.html:2960-3149` (cross VCS cards - replace with VcsCard)
- Modify: `src/index.html:3151-3315` (stock VCS cards - replace with VcsCard)

**Context:** VCS card rendering is duplicated ~300 lines. Every VCS fix (grace period, progress bar, etc.) requires patching both places. Differences: stock uses `s.id`/`s.name`/`logAction`, cross uses `c.id`/`cl(c, stocks)`/`logCrossAction`, stock has print button.

- [ ] **Step 1: Define VcsCard component**

Props: `id, name, vcs, now, onAction, onClick, confirm18, setConfirm18, bankPrompt, setBankPrompt, statusLabel, showPrint, printActive, onTogglePrint`

Contains: header with dot/name/metadata, progress bar, status message, action buttons, 18C confirmation dialog.

Does NOT contain: bank prompt UI (different between stocks and crosses - caller renders it).

- [ ] **Step 2: Wrap with React.memo**

```js
const VcsCard = React.memo(function VcsCard({ ... }) { ... });
```

- [ ] **Step 3: Replace cross VCS cards with VcsCard**

```jsx
<VcsCard id={c.id} name={cl(c, stocks)} vcs={c.vcs} now={now}
  onAction={(type, key, temp) => logCrossAction(c.id, type, key, temp)}
  onClick={() => { setSelectedCrossId(c.id); }}
  confirm18={crossVcs18Confirm} setConfirm18={setCrossVcs18Confirm}
  bankPrompt={crossVcsBankPrompt} setBankPrompt={setCrossVcsBankPrompt}
  statusLabel={`${vCollected}/${vTarget}`} />
```

- [ ] **Step 4: Replace stock VCS cards with VcsCard**

```jsx
<VcsCard id={s.id} name={s.name} vcs={v} now={now}
  onAction={(type, key, temp) => logAction(type, key, temp, s)}
  onClick={() => setHomeEditStock({ ...s })}
  confirm18={vcs18Confirm} setConfirm18={setVcs18Confirm}
  bankPrompt={vcsBankPrompt} setBankPrompt={setVcsBankPrompt}
  statusLabel={`${doneCount}/${v.collectionsPerDay}`}
  showPrint printActive={printListVirgins.includes(s.id)}
  onTogglePrint={() => { ... }} />
```

- [ ] **Step 5: Verify all VCS actions still work (collect, clear, discard, 18C confirm, bank prompt) for both stocks and crosses**

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor: extract shared VcsCard component, eliminate 300-line duplication"
```

---

## Phase 3: Robustness (Tasks 7-9)

### Task 7: Add ErrorBoundary Component

- [ ] **Step 1: Add ErrorBoundary class component (~line 945)**

Shows error message + "Try Again" button instead of white screen crash.

- [ ] **Step 2: Wrap each screen tab in ErrorBoundary**

- [ ] **Step 3: Test by temporarily throwing in ExpScreen, then commit**

```bash
git commit -m "feat: add ErrorBoundary wrapper around all screen components"
```

---

### Task 8: Add Persistent Sync Status Indicator

- [ ] **Step 1: Add colored dot to header (green=synced, yellow=syncing, red=failed)**
- [ ] **Step 2: Add CSS pulse animation for syncing state**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add persistent sync status indicator in header"
```

---

### Task 9: Performance Quick Wins

- [ ] **Step 1: Wrap CrossCard with React.memo**
- [ ] **Step 2: Memoize filtered cross/stock lists in HomeScreen with useMemo**
- [ ] **Step 3: Commit**

```bash
git commit -m "perf: add React.memo to CrossCard, memoize expensive filters"
```

---

## Phase 4: Docs (Task 10)

### Task 10: Update CLAUDE.md and Version Table

- [ ] **Step 1: Add v1.0.0 version entry**
- [ ] **Step 2: Update "What's done" section**
- [ ] **Step 3: Encrypt and final commit**

```bash
npx staticrypt src/index.html -d . --short --remember 30 ...
git commit -m "v1.0.0: stability improvements - sync, dedup, robustness"
```

---

---

## Phase 5: Data Safety (Tasks 11-13) — from deep audit

### Task 11: Add Confirmation Dialogs for Destructive Actions

**Files:** Modify: `src/index.html` (clearAll, loadDemo, changePin functions)

- [ ] **Step 1: Wrap `clearAll()` (~line 4962) in Confirm dialog**
- [ ] **Step 2: Wrap `loadDemo()` (~line 4950) in Confirm dialog** — "Load demo data? This replaces all current data."
- [ ] **Step 3: Wrap `changePin()` (~line 4968) in Confirm dialog** — "Reset all user PINs?"
- [ ] **Step 4: Add undo to bulk delete (~line 3602)** — store backup array, add undo callback to toast
- [ ] **Step 5: Block ALL sync in demo mode** (currently only blocks initial push, not subsequent)
- [ ] **Step 6: Show "Demo Mode" banner when `demoMode.current === true`**
- [ ] **Step 7: Add basic validation to JSON import** — check `Array.isArray(d.stocks)`, file size < 10MB
- [ ] **Step 8: Commit**

```bash
git commit -m "feat: add confirmation dialogs for destructive actions, demo mode banner"
```

---

### Task 12: Fix VCS Overnight Reset Bug

**Files:** Modify: `src/index.html:748-752` (todayActions in computeNextActions)

**Context:** todayActions never resets across overnight boundaries. If the app is closed after afternoon collect and reopened next morning, stale actions block new morning collections.

- [ ] **Step 1: Add cycle boundary detection in computeNextActions**

When `lastClearTime` is set and current time is past the deadline + grace period, treat todayActions as stale. Only count actions from the current cycle window:

```js
// After computing deadline (line 755)
const cycleExpired = deadline && nowMs > deadline + 30 * 60000;

// In the todayActions filter (line 748), also check if action is within current cycle
(todayActions || []).forEach(a => {
  if (!a.key) return;
  const actionMs = a.time ? new Date(a.time).getTime() : 0;
  if (actionMs >= clearMs && !cycleExpired) doneKeys.add(a.key);
});
```

- [ ] **Step 2: Distinguish overdue vs expired in status colors**

`isOverdue` (30min past scheduled time) should show yellow/amber, not red. Only `isPastDeadline` (8h expiry) should be red.

- [ ] **Step 3: Show warning for auto-skipped actions** instead of silently removing them

```js
// Instead of result.shift(), mark as tooLate
if (result.length > 1 && result[0].timeUntilMs < -2 * 3600000) {
  result[0].tooLate = true;
}
```

- [ ] **Step 4: Commit**

```bash
git commit -m "fix: VCS overnight reset, distinguish overdue vs expired, show skipped actions"
```

---

### Task 13: Fix Cross Workflow Edge Cases

**Files:** Modify: `src/index.html` (stock deletion, setStatus, re-vial)

- [ ] **Step 1: Warn before deleting stocks with active crosses**

In the stock delete handler, check if any crosses reference the stock as parentA/parentB:

```js
const affectedCrosses = crosses.filter(c => c.parentA === stockId || c.parentB === stockId);
if (affectedCrosses.length > 0) {
  // Show warning in Confirm dialog: "This stock is used in N crosses"
}
```

- [ ] **Step 2: Initialize VCS when manually setting status to "collecting virgins"**

In `setStatus()` (~line 2074), add VCS creation same as `advance()`:

```js
if (st === 'collecting virgins' && !cross.vcs) {
  updates.vcs = makeVcs(cross.temperature === '18C', 2, VCS_DEFAULTS[vcsKey(...)]);
}
```

- [ ] **Step 3: Clear stale VCS on re-vial**

In `revial()` (~line 2035), set `vcs: null` on the clone.

- [ ] **Step 4: Use deep merge for collected/vials in realtime handler**

In the realtime stock/cross handler (~line 585), don't overwrite arrays:

```js
if (idx >= 0) {
  const merged = { ...next[idx], ...item };
  // Preserve longer arrays (don't truncate)
  if (next[idx].collected?.length > (item.collected?.length || 0)) merged.collected = next[idx].collected;
  if (next[idx].vials?.length > (item.vials?.length || 0)) merged.vials = next[idx].vials;
  next[idx] = merged;
}
```

- [ ] **Step 5: Commit**

```bash
git commit -m "fix: cross workflow - orphan warning, VCS on manual status, deep merge arrays"
```

---

## Phase 6: Mobile UX (Tasks 14-15) — from deep audit

### Task 14: Fix iOS Safe Area and Touch Targets

**Files:** Modify: `src/index.html` (CSS + button sizing)

- [ ] **Step 1: Add iOS safe area to bottom nav (~line 354)**

```css
.bottom-nav {
  bottom: max(16px, env(safe-area-inset-bottom, 16px));
}
```

- [ ] **Step 2: Increase VCS action button touch targets**

Change all VCS card buttons from `text-[11px] px-2 py-1.5` to `text-[12px] px-3 py-2` for minimum ~36px height. Apply to:
- VCS collect/clear/discard buttons (~lines 3066-3094, 3242-3270)
- 18C confirmation buttons (~lines 3113-3118, 3288-3293)
- Virgin bank log buttons (~lines 3128-3146)

- [ ] **Step 3: Increase modal close button to 44px**

Change `w-8 h-8` to `w-11 h-11` (~line 1801)

- [ ] **Step 4: Commit**

```bash
git commit -m "fix: iOS safe area, increase touch targets for VCS buttons"
```

---

### Task 15: Add Offline Indicator

**Files:** Modify: `src/index.html` (App component, header area)

- [ ] **Step 1: Add online/offline event listeners**

```js
const [isOnline, setIsOnline] = useState(navigator.onLine);
useEffect(() => {
  const on = () => setIsOnline(true);
  const off = () => setIsOnline(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
}, []);
```

- [ ] **Step 2: Show offline badge in header when disconnected**

```jsx
{!isOnline && (
  <span className="px-2 py-0.5 rounded text-[10px] font-semibold"
    style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5' }}>Offline</span>
)}
```

- [ ] **Step 3: Add localStorage quota warning to useLS**

In the catch block of `useLS` (~line 937), check for `QuotaExceededError` and show toast.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: offline indicator, localStorage quota warning"
```

---

## Phase 7: Supabase Hardening (Task 16) — from security audit + Supabase best practices

### Task 16: Add RLS Policies and Pin CDN Versions

> **Reference:** [Supabase shared responsibility model](https://supabase.com/docs/guides/deployment/shared-responsibility-model), [Leanware RLS best practices](https://www.leanware.co/insights/supabase-best-practices)

**Files:** Supabase SQL console + `src/index.html` (CDN script tags)

- [ ] **Step 1: Add RLS policies to existing tables**

```sql
-- Stocks: everyone can read, authenticated can write (keep simple per Leanware guide)
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON stocks FOR ALL USING (true) WITH CHECK (true);

-- Same for crosses and pins (already done for new tables)
ALTER TABLE crosses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON crosses FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON pins FOR ALL USING (true) WITH CHECK (true);
```

Note: For an internal lab tool with 7 trusted users, "allow all" RLS is appropriate. The important thing is that RLS is ENABLED so Supabase enforces the policy layer. If the app ever becomes multi-lab, tighten these to user-based policies.

- [ ] **Step 2: Pin CDN versions with exact versions (~line 9-13)**

```html
<script src="https://unpkg.com/react@18.2.0/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone@7.24.0/babel.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/dist/umd/supabase.min.js"></script>
```

- [ ] **Step 3: Fix esc() function to escape quotes**

```js
const esc = t => t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
```

- [ ] **Step 4: Commit**

```bash
git commit -m "security: enable RLS on all tables, pin CDN versions, fix XSS escaping"
```

---

## Phase 8: Docs + Version (Task 17)

### Task 17: Update CLAUDE.md, Encrypt, Final Commit

- [ ] **Step 1: Add v1.0.0 version entry to CLAUDE.md**

```
| 1.0.0 | `<hash>` | 2026-03-15 | Stability: Supabase sync for virgin/exp banks + transfers, VcsCard dedup, error boundaries, data safety, mobile fixes, RLS |
```

- [ ] **Step 2: Update "What's done" section** with all new features
- [ ] **Step 3: Encrypt and final commit**

```bash
npx staticrypt src/index.html -d . --short --remember 30 --template-title 'Flomington' --template-instructions 'Enter the lab password to access the fly stock manager.' --template-color-primary '#8b5cf6' --template-color-secondary '#09090b' -p "0a1fams"
git add index.html && git add -f src/index.html && git add CLAUDE.md
git commit -m "v1.0.0: stability improvements complete"
```

---

## Task Dependencies (Updated)

```
Phase 1: Task 1 (SQL) --> Task 2 (virgin bank) --> Task 3 (exp bank) --> Task 4 (transfers) --> Task 5 (cleanup)
Phase 2: Task 6 (VcsCard) - independent
Phase 3: Task 7 (ErrorBoundary) - independent
         Task 8 (sync indicator) - after Phase 1
         Task 9 (React.memo) - after Task 6
Phase 5: Task 11 (data safety) - independent
         Task 12 (VCS overnight fix) - independent
         Task 13 (cross workflow) - independent
Phase 6: Task 14 (mobile) - independent
         Task 15 (offline) - independent
Phase 7: Task 16 (Supabase + security) - after Phase 1
Phase 8: Task 17 (docs) - last
```

Recommended execution order:
1 → 2 → 3 → 4 → 5 → 11 → 12 → 13 → 6 → 7 → 8 → 14 → 15 → 9 → 16 → 18 → 19 → 20 → 17

Data safety (11) and bug fixes (12, 13) first. Then dedup (6) and robustness (7-9).
Mobile + security (14-16) next. Architecture (18-20) last since they're refactoring.
Docs (17) always last.

---

---

## Phase 9: Architecture Improvements (Tasks 18-20) — from reference reading

> These tasks apply patterns from [Bulletproof React](https://github.com/alan2207/bulletproof-react), [LaunchDarkly React 2025](https://launchdarkly.com/docs/blog/react-architecture-2025), [Strapi state management guide](https://strapi.io/blog/react-and-nextjs-in-2025-modern-best-practices), and [Supabase best practices](https://www.leanware.co/insights/supabase-best-practices). All applicable WITHOUT a build system.

### Task 18: Add React Context to Kill Prop Drilling

**Context:** HomeScreen takes 22+ props, StocksScreen 19, PrintLabelsModal 14. All from `App()` which is ~450 lines of state + prop threading. Two contexts eliminate this without new dependencies.

- [ ] **Step 1: Create DataContext (server-synced state)**

Define above App(), move all useLS state + Supabase sync logic into DataProvider:

```jsx
const DataCtx = React.createContext();

function DataProvider({ children }) {
  const [currentUser, setCurrentUser] = useLS('flo-user', 'Flo');
  const [stocks, setStocks] = useLS('flo-stocks', []);
  const [crosses, setCrosses] = useLS('flo-crosses', []);
  const [virginBank, setVirginBank] = useLS(`flo-virgins-${currentUser}`, {});
  const [expBank, setExpBank] = useLS(`flo-exp-${currentUser}`, {});
  const [transfers, setTransfers] = useLS('flo-transfers', []);
  const [collections, setCollections] = useLS('flo-collections', ['No Collection']);
  // ... all Supabase sync effects move here ...

  const value = useMemo(() => ({
    stocks, setStocks, crosses, setCrosses, virginBank, setVirginBank,
    expBank, setExpBank, transfers, setTransfers, collections, setCollections,
    currentUser, setCurrentUser, syncStatus,
  }), [stocks, crosses, virginBank, expBank, transfers, collections, currentUser, syncStatus]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

function useData() { return React.useContext(DataCtx); }
```

- [ ] **Step 2: Create UIContext (ephemeral state)**

```jsx
const UICtx = React.createContext();
// Holds: tab, printLists, printOpen, bulkBarActive, toast, bgEffect
function useUI() { return React.useContext(UICtx); }
```

- [ ] **Step 3: Wrap App render in both providers**

```jsx
function App() {
  return (
    <DataProvider>
      <UIProvider>
        <AppShell />
      </UIProvider>
    </DataProvider>
  );
}
```

- [ ] **Step 4: Migrate HomeScreen to useData()** — drops from 22+ props to ~1 (`initialCrossId`)
- [ ] **Step 5: Migrate StocksScreen to useData()** — drops from 19 props to ~1 (`initialStockId`)
- [ ] **Step 6: Migrate remaining screens** (VirginsScreen, ExpScreen, SettingsScreen, PrintLabelsModal)
- [ ] **Step 7: Commit**

```bash
git commit -m "refactor: add DataContext + UIContext, eliminate prop drilling"
```

**Result:** App() drops from ~450 lines to ~80. Screen component signatures drop from 20+ props to 0-3.

---

### Task 19: Extract Custom Hooks from App

**Context:** App currently has ~120 lines of pure state+effect logic (sync, deep links, notifications, print lists) mixed with rendering. Extract into composable hooks.

- [ ] **Step 1: Extract `useSupabaseSync()`** — pull/push/realtime effects (~lines 5868-5972)
- [ ] **Step 2: Extract `useDeepLinks()`** — URL param parsing (~lines 5978-6013)
- [ ] **Step 3: Extract `useVcsNotifications()`** — notification effects (~lines 6016-6090)
- [ ] **Step 4: Handle realtime status callbacks**

```js
.subscribe((status, err) => {
  if (status === 'CHANNEL_ERROR') setSyncStatus('Realtime error');
  if (status === 'TIMED_OUT') setSyncStatus('Connection timed out');
})
```

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor: extract useSupabaseSync, useDeepLinks, useVcsNotifications hooks"
```

---

### Task 20: Break HomeScreen into Section Components + Add DB Indexes

**Context:** HomeScreen is ~830 lines. Break into focused sections. Also add database indexes per 42 Coffee Cups best practices.

- [ ] **Step 1: Extract `HomeFlipSchedule`** — the flip schedule section
- [ ] **Step 2: Extract `HomeVcsDashboard`** — VCS cards section (now uses shared VcsCard from Task 6)
- [ ] **Step 3: Extract `HomeActiveCrosses`** — active crosses list
- [ ] **Step 4: Extract `HomeTransferBanner`** — transfer notifications
- [ ] **Step 5: Add database indexes**

```sql
CREATE INDEX idx_crosses_parent_a ON crosses(parent_a);
CREATE INDEX idx_crosses_parent_b ON crosses(parent_b);
CREATE INDEX idx_crosses_owner ON crosses(owner);
CREATE INDEX idx_crosses_status ON crosses(status);
CREATE INDEX idx_virgin_banks_user ON virgin_banks(user_name);
CREATE INDEX idx_exp_banks_user ON exp_banks(user_name);
CREATE INDEX idx_transfers_to ON transfers(to_user);
CREATE INDEX idx_transfers_status ON transfers(status);
```

- [ ] **Step 6: Version-control the schema**

```bash
brew install supabase/tap/supabase
supabase link --project-ref rawkyzzqyvizrglanyzi
supabase db pull
git add supabase/
```

- [ ] **Step 7: Commit**

```bash
git commit -m "refactor: break HomeScreen into sections, add DB indexes, pull schema"
```

---

## Architecture Reference Links

> Insights from these resources are now incorporated into Tasks 18-20 above.

**React Architecture (read by agents):**
- [Bulletproof React](https://github.com/alan2207/bulletproof-react) — feature-based structure, unidirectional flow, no nested render functions
- [Robin Wieruch folder structure](https://www.robinwieruch.de/react-folder-structure/) — co-location principle, progressive scaling
- [LaunchDarkly React 2025](https://launchdarkly.com/docs/blog/react-architecture-2025) — container/presenter split, state machines for workflows, custom hooks as abstraction boundary
- [Strapi React best practices](https://strapi.io/blog/react-and-nextjs-in-2025-modern-best-practices) — state management decision tree: useState for small apps, Context for cross-cutting, Zustand only if complex shared state needed

**Key decisions from reading:**
- **DO use Context API** — zero new dependencies, kills prop drilling, proportional to project size
- **DON'T use Zustand/Redux/TanStack Query** — requires build step or CDN overhead, overkill for 7-user lab tool
- **DON'T use useReducer** — state is wide (many independent arrays), not complex (deeply nested)
- **DO extract custom hooks** — useSupabaseSync, useDeepLinks, useVcsNotifications
- **DO break mega-components** — HomeScreen (830 lines) into 4-5 sections of ~150 lines each

**Supabase (read by agents):**
- [Supabase shared responsibility model](https://supabase.com/docs/guides/deployment/shared-responsibility-model) — RLS is YOUR responsibility, backups on Free tier are daily only
- [Leanware best practices](https://www.leanware.co/insights/supabase-best-practices) — single channel for multiple table listeners, batch upserts, exponential backoff
- [Supabase migrations](https://supabase.com/docs/guides/local-development/declarative-database-schemas) — `supabase db pull` to version-control schema

**Key decisions from reading:**
- **Enable RLS with permissive policies** — `USING (true)` is fine for 7 trusted users, but RLS must be ON
- **App already uses single realtime channel** (line 577: `sb.channel('db-changes')`) — good
- **Add `updated_at` columns** for future last-write-wins conflict resolution
- **Run `supabase db pull`** to version-control the schema in git
- **Handle realtime status callbacks** (CHANNEL_ERROR, TIMED_OUT) — surface to user

**Database Design:**
- [42 Coffee Cups best practices](https://www.42coffeecups.com/blog/database-design-best-practices) — index foreign keys, 3NF target, strategic denormalization only after profiling
- **VCS as JSONB in stocks is fine** — nested config read/written as unit, no need to normalize
- **collected[] and vials[] as JSON in crosses is fine** — same reasoning, always read/written together

## Risk Notes

- **toSnake null fix (Task 2):** Now sends null values to Supabase. Verify `notes`, `giftFrom`, `janeliaLine` columns accept null (they should).
- **Realtime user filtering:** Virgin bank and exp bank handlers need to check `user_name` matches current user to avoid cross-contamination.
- **VcsCard extraction (Task 6):** Bank prompts must NOT go inside VcsCard — cross bank prompt updates `virginsCollected`, stock bank prompt updates `virginBank`. Keep them as caller-rendered.
- **Merge on pull:** Using "local wins with higher value" for counts, "local wins for status" for transfers.
- **VCS overnight fix (Task 12):** The `cycleExpired` check changes behavior. Test carefully: clear at 17:30, reopen at 09:00 next morning — morning collect should appear as the next action.
- **Deep merge arrays (Task 13):** Preserving longer arrays prevents truncation but means deletes from other devices may not propagate. Acceptable tradeoff for a lab tool.
