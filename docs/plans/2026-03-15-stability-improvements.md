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

## Task Dependencies

```
Task 1 (SQL) --> Task 2 (virgin bank) --> Task 3 (exp bank) --> Task 4 (transfers) --> Task 5 (cleanup)
Task 6 (VcsCard) - independent of Phase 1
Task 7 (ErrorBoundary) - independent
Task 8 (sync indicator) - after Tasks 2-4
Task 9 (React.memo) - after Task 6
Task 10 (docs) - last
```

Recommended order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

## Risk Notes

- **toSnake null fix (Task 2):** Now sends null values to Supabase. Verify `notes`, `giftFrom`, `janeliaLine` columns accept null (they should).
- **Realtime user filtering:** Virgin bank and exp bank handlers need to check `user_name` matches current user to avoid cross-contamination.
- **VcsCard extraction (Task 6):** Bank prompts must NOT go inside VcsCard - cross bank prompt updates `virginsCollected`, stock bank prompt updates `virginBank`. Keep them as caller-rendered.
- **Merge on pull:** Using "local wins with higher value" for counts, "local wins for status" for transfers.
