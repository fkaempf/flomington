# Experimental Animals Bank + Dead Stock Flip Skip — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an "Exp Bank" screen for tracking screened experimental animals (by sex, from crosses or stocks), replace Settings in the bottom nav with Exp, move Settings to a header gear icon, and exclude dead stocks from flip tracking.

**Architecture:** New `useLS` store `expBank` keyed by source ID (cross or stock) with `{ m, f, source }` values. New `ExpScreen` component modeled after `VirginsScreen`. Settings tab removed from bottom nav and accessed via gear icon in the header. Dead stock exclusion is a simple filter addition to 4 locations.

**Tech Stack:** React 18, Tailwind CSS (all in `src/index.html`)

---

### Task 1: Exclude Dead Stocks from Flip Tracking

**Files:**
- Modify: `src/index.html:2463-2469` (actionSummary)
- Modify: `src/index.html:2475-2483` (stocksNeedFlip)
- Modify: `src/index.html:2636` (dueIndividual in Home collections)
- Modify: `src/index.html:2647` (dueGroups in Home collections)
- Modify: `src/index.html:2715` (flip modal dueStocks)

**Context:** `stockTags(s)` at line 712 already detects "dead" in notes and returns a tags array including `'Dead'`. We need to filter out dead stocks anywhere flip due dates are calculated. There are 5 locations.

**Step 1: Add dead check to `actionSummary` (line ~2463)**

In the `stocks.forEach` inside `actionSummary`, add a dead check after the maintainer check:

```js
// Before (line 2463-2464):
stocks.forEach(s => {
  if (s.maintainer && s.maintainer !== currentUser) return;

// After:
stocks.forEach(s => {
  if (s.maintainer && s.maintainer !== currentUser) return;
  if (stockTags(s).includes('Dead')) return;
```

**Step 2: Add dead check to `stocksNeedFlip` (line ~2476-2477)**

```js
// Before:
return stocks.filter(s => {
  if (s.maintainer && s.maintainer !== currentUser) return false;

// After:
return stocks.filter(s => {
  if (s.maintainer && s.maintainer !== currentUser) return false;
  if (stockTags(s).includes('Dead')) return false;
```

**Step 3: Add dead check to `dueIndividual` filter (line ~2636)**

```js
// Before:
const myStocks = stocks.filter(s => !s.maintainer || s.maintainer === currentUser);

// After:
const myStocks = stocks.filter(s => (!s.maintainer || s.maintainer === currentUser) && !stockTags(s).includes('Dead'));
```

This also covers `dueGroups` since it's derived from `myStocks`.

**Step 4: Add dead check to flip modal `dueStocks` (line ~2715)**

```js
// Before:
const dueStocks = catStocks.filter(s => {

// After:
const dueStocks = catStocks.filter(s => {
  if (stockTags(s).includes('Dead')) return false;
```

**Step 5: Verify and commit**

Test by checking that a stock with "dead" in its notes does not appear in the flip-due sections.

```bash
git add -f src/index.html
git commit -m "feat: exclude dead stocks from flip tracking"
```

---

### Task 2: Move Settings from Bottom Nav to Header Gear Icon

**Files:**
- Modify: `src/index.html:5028-5036` (header)
- Modify: `src/index.html:5087-5090` (bottom nav settings tab — remove)

**Context:** The header currently has: `h1 "Flomington"` (left), user selector `<select>` (center), date display (right). We add a gear icon button between the user selector and the date. The `tab` state and `setTab` are in the `App` component, same scope as the header.

**Step 1: Remove Settings tab from bottom nav**

Delete the settings nav-item div (lines ~5087-5090):

```jsx
// DELETE these lines:
<div onClick={() => setTab('settings')} className={`nav-item ${tab === 'settings' ? 'active' : ''}`}>
  {IconSettings(tab === 'settings')}
  <span style={{ color: tab === 'settings' ? 'var(--accent-2)' : 'var(--text-3)' }}>Settings</span>
</div>
```

**Step 2: Add gear icon to header**

After the date `<span>` in the header (line ~5035), add a gear icon button:

```jsx
<button onClick={() => setTab('settings')} className="touch"
  style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={tab === 'settings' ? 'var(--accent-2)' : 'var(--text-3)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
</button>
```

**Step 3: Commit**

```bash
git add -f src/index.html
git commit -m "feat: move settings to header gear icon"
```

---

### Task 3: Add `expBank` State and Plumb Through App

**Files:**
- Modify: `src/index.html:4800` (near virginBank useLS — add expBank)
- Modify: `src/index.html:504-522` (supabasePush — add expBank)
- Modify: `src/index.html:476-501` (supabasePull — add expBank)

**Context:** The app uses `useLS` for all state. The `virginBank` at line 4800 is per-user: `useLS('flo-virgins-${currentUser}', {})`. Follow the same pattern. The sync functions (`supabasePush`/`supabasePull`) sync data to Supabase. For now, `expBank` only needs localStorage — sync can be added later if needed.

**Step 1: Add expBank state**

After the virginBank line (~4800), add:

```js
const [expBank, setExpBank] = useLS(`flo-exp-${currentUser}`, {});
```

**Step 2: Wire expBank into the demo data factory**

In the `demoData()` function (around line 1364), add an `expBank` return field with sample data:

```js
expBank: {
  'c5': { m: 8, f: 12, source: 'cross' },
  's3': { m: 3, f: 5, source: 'stock' }
}
```

**Step 3: Commit**

```bash
git add -f src/index.html
git commit -m "feat: add expBank useLS state"
```

---

### Task 4: Add Exp Tab to Bottom Nav

**Files:**
- Modify: `src/index.html:5081-5086` (after Virgins nav item — add Exp)

**Context:** Bottom nav currently has 4 items after removing settings (Task 2): Home, Stocks, +Cross, Virgins. Add "Exp" after Virgins. Use a flask/microscope icon. Color theme: cyan/teal (`#5eead4`) to differentiate from Virgins' pink.

**Step 1: Add Exp nav item**

After the Virgins nav-item div, add:

```jsx
<div onClick={() => setTab('exp')} className={`nav-item ${tab === 'exp' ? 'active' : ''}`}>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={tab === 'exp' ? '#5eead4' : '#52525b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3h6v7l4 9H5l4-9V3z"/><line x1="9" y1="3" x2="15" y2="3"/>
  </svg>
  <span style={{ color: tab === 'exp' ? '#5eead4' : 'var(--text-3)' }}>Exp</span>
</div>
```

**Step 2: Add tab routing**

In the main content area (around line 5055, near the other tab renders), add:

```jsx
{tab === 'exp' && <ExpScreen stocks={stocks} crosses={crosses} expBank={expBank} setExpBank={setExpBank} toast={toast} />}
```

**Step 3: Commit**

```bash
git add -f src/index.html
git commit -m "feat: add Exp tab to bottom nav"
```

---

### Task 5: Build `ExpScreen` Component

**Files:**
- Modify: `src/index.html` — add new component after `VirginsScreen` (after line ~3765)

**Context:** Model closely after `VirginsScreen` (lines 3686-3765). The exp bank stores `{ [sourceId]: { m, f, source } }`. Sources can be crosses or stocks. Use teal/cyan color theme (`#5eead4`, `rgba(94,234,212,...)`) instead of Virgins' pink. Show `♂` and `♀` counts separately.

**Step 1: Create ExpScreen component**

Insert after the VirginsScreen closing (after line ~3765):

```jsx
function ExpScreen({ stocks, crosses, expBank, setExpBank, toast }) {
  const [search, setSearch] = useState('');
  const [logMode, setLogMode] = useState('cross'); // 'cross' or 'stock'

  const totalM = Object.values(expBank).reduce((s, e) => s + (e.m || 0), 0);
  const totalF = Object.values(expBank).reduce((s, e) => s + (e.f || 0), 0);

  const bankedEntries = useMemo(() => {
    return Object.entries(expBank)
      .filter(([, v]) => (v.m || 0) + (v.f || 0) > 0)
      .map(([id, v]) => {
        const src = v.source === 'cross'
          ? crosses.find(c => c.id === id)
          : stocks.find(s => s.id === id);
        const name = v.source === 'cross'
          ? (src ? `${(stocks.find(s => s.id === src.parentA)?.name || '?')} × ${(stocks.find(s => s.id === src.parentB)?.name || '?')}` : id)
          : (src?.name || id);
        return { id, ...v, name, srcObj: src };
      })
      .sort((a, b) => ((b.m || 0) + (b.f || 0)) - ((a.m || 0) + (a.f || 0)));
  }, [expBank, stocks, crosses]);

  function addExp(sourceId, sex, n, source) {
    setExpBank(prev => {
      const cur = prev[sourceId] || { m: 0, f: 0, source };
      return { ...prev, [sourceId]: { ...cur, [sex]: Math.max(0, (cur[sex] || 0) + n) } };
    });
    toast.add(`${n > 0 ? '+' : ''}${n} ${sex === 'm' ? '♂' : '♀'} logged`);
  }

  function clearEntry(sourceId) {
    setExpBank(prev => { const next = { ...prev }; delete next[sourceId]; return next; });
    toast.add('Cleared');
  }

  // Filter crosses to those in screening/collecting progeny/ripening/done status
  const eligibleCrosses = crosses.filter(c =>
    ['collecting progeny', 'screening', 'ripening', 'done'].includes(c.status)
  );

  return (
    <div>
      {/* Overview Card */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Experimental Animals</p>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>{totalM}♂ {totalF}♀ total</span>
        </div>
        {bankedEntries.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {bankedEntries.map(e => (
              <div key={e.id} className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(94,234,212,0.06)', border: '1px solid rgba(94,234,212,0.1)' }}>
                <div className="text-center">
                  <span className="text-lg font-bold" style={{ color: '#5eead4' }}>{(e.m || 0) + (e.f || 0)}</span>
                  <p className="text-[9px]" style={{ color: 'var(--text-3)' }}>{e.m || 0}♂ {e.f || 0}♀</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-1)' }}>{e.name}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{e.source === 'cross' ? '✕ cross' : '▪ stock'}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-center py-3" style={{ color: 'var(--text-3)' }}>No experimental animals logged yet</p>
        )}
      </div>

      {/* Log Section */}
      <div className="flex items-center gap-2 mb-4">
        <p className="section-header flex-1" style={{ margin: 0 }}>Log Animals</p>
        <div className="flex gap-1">
          <button onClick={() => setLogMode('cross')} className="px-3 py-1 text-xs font-semibold rounded-lg cursor-pointer"
            style={logMode === 'cross' ? { background: 'rgba(94,234,212,0.15)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.2)' } : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>Crosses</button>
          <button onClick={() => setLogMode('stock')} className="px-3 py-1 text-xs font-semibold rounded-lg cursor-pointer"
            style={logMode === 'stock' ? { background: 'rgba(94,234,212,0.15)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.2)' } : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>Stocks</button>
        </div>
      </div>
      <Inp placeholder={logMode === 'cross' ? 'Search crosses...' : 'Search stocks...'} value={search} onChange={e => setSearch(e.target.value)} className="mb-4" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        {logMode === 'cross' ? (
          eligibleCrosses.filter(c => {
            if (!search) return true;
            const q = search.toLowerCase();
            const pA = stocks.find(s => s.id === c.parentA);
            const pB = stocks.find(s => s.id === c.parentB);
            return [pA?.name, pB?.name, c.notes || ''].some(x => (x || '').toLowerCase().includes(q));
          }).map(c => {
            const pA = stocks.find(s => s.id === c.parentA);
            const pB = stocks.find(s => s.id === c.parentB);
            const label = `${pA?.name || '?'} × ${pB?.name || '?'}`;
            const entry = expBank[c.id] || { m: 0, f: 0 };
            return (
              <div key={c.id} className="card p-4">
                <div className="flex items-center gap-3 mb-1">
                  <div className="flex-1 min-w-0">
                    <span className="text-[15px] font-bold" style={{ color: 'var(--text-1)' }}>{label}</span>
                    {((entry.m || 0) + (entry.f || 0)) > 0 && (
                      <span className="badge ml-2" style={{ background: 'rgba(94,234,212,0.12)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.15)' }}>{entry.m || 0}♂ {entry.f || 0}♀</span>
                    )}
                  </div>
                  {((entry.m || 0) + (entry.f || 0)) > 0 && (
                    <button onClick={() => clearEntry(c.id)} className="text-xs cursor-pointer" style={{ color: 'var(--text-3)' }}>clear</button>
                  )}
                </div>
                <p className="text-[10px] mb-3" style={{ color: 'var(--text-3)' }}>{c.status}</p>
                <div className="mb-2">
                  <p className="text-[10px] mb-1" style={{ color: '#93c5fd' }}>♂ Males</p>
                  <div className="flex gap-2">
                    <button onClick={() => addExp(c.id, 'm', -1, 'cross')} className="qlog-btn flex-1" disabled={(entry.m || 0) <= 0} style={(entry.m || 0) <= 0 ? { opacity: 0.3 } : {}}>-1</button>
                    {[1, 3, 5].map(n => <button key={n} onClick={() => addExp(c.id, 'm', n, 'cross')} className="qlog-btn flex-1">+{n}</button>)}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] mb-1" style={{ color: '#f9a8d4' }}>♀ Females</p>
                  <div className="flex gap-2">
                    <button onClick={() => addExp(c.id, 'f', -1, 'cross')} className="qlog-btn flex-1" disabled={(entry.f || 0) <= 0} style={(entry.f || 0) <= 0 ? { opacity: 0.3 } : {}}>-1</button>
                    {[1, 3, 5].map(n => <button key={n} onClick={() => addExp(c.id, 'f', n, 'cross')} className="qlog-btn flex-1">+{n}</button>)}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          stocks.filter(s => !search || [s.name, s.genotype || ''].some(x => x.toLowerCase().includes(search.toLowerCase()))).map(s => {
            const entry = expBank[s.id] || { m: 0, f: 0 };
            return (
              <div key={s.id} className="card p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[15px] font-bold" style={{ color: 'var(--text-1)' }}>{s.name}</span>
                    {((entry.m || 0) + (entry.f || 0)) > 0 && (
                      <span className="badge ml-2" style={{ background: 'rgba(94,234,212,0.12)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.15)' }}>{entry.m || 0}♂ {entry.f || 0}♀</span>
                    )}
                  </div>
                  {((entry.m || 0) + (entry.f || 0)) > 0 && (
                    <button onClick={() => clearEntry(s.id)} className="text-xs cursor-pointer" style={{ color: 'var(--text-3)' }}>clear</button>
                  )}
                </div>
                <div className="mb-2">
                  <p className="text-[10px] mb-1" style={{ color: '#93c5fd' }}>♂ Males</p>
                  <div className="flex gap-2">
                    <button onClick={() => addExp(s.id, 'm', -1, 'stock')} className="qlog-btn flex-1" disabled={(entry.m || 0) <= 0} style={(entry.m || 0) <= 0 ? { opacity: 0.3 } : {}}>-1</button>
                    {[1, 3, 5].map(n => <button key={n} onClick={() => addExp(s.id, 'm', n, 'stock')} className="qlog-btn flex-1">+{n}</button>)}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] mb-1" style={{ color: '#f9a8d4' }}>♀ Females</p>
                  <div className="flex gap-2">
                    <button onClick={() => addExp(s.id, 'f', -1, 'stock')} className="qlog-btn flex-1" disabled={(entry.f || 0) <= 0} style={(entry.f || 0) <= 0 ? { opacity: 0.3 } : {}}>-1</button>
                    {[1, 3, 5].map(n => <button key={n} onClick={() => addExp(s.id, 'f', n, 'stock')} className="qlog-btn flex-1">+{n}</button>)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {(logMode === 'cross' ? eligibleCrosses.length : stocks.length) === 0 && (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>{logMode === 'cross' ? 'No crosses in screening/collecting stage yet' : 'Add stocks first'}</p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add -f src/index.html
git commit -m "feat: add ExpScreen component for experimental animals"
```

---

### Task 6: Add Exp Bank Quick-Log to Cross Cards and Stock Modal

**Files:**
- Modify: `src/index.html:1763` (CrossCard props — add expBank, setExpBank)
- Modify: `src/index.html` (CrossCard detail section — add log buttons during screening)
- Modify: `src/index.html:3407` (StockModal props — add expBank, setExpBank)
- Modify: `src/index.html:3634-3657` (StockModal — add Exp Bank section after Virgin Bank)
- All parent component call sites that render CrossCard and StockModal — pass through expBank/setExpBank

**Context:** During screening status, users want a quick way to log experimental animals directly from the cross card. Also, the StockModal should have an "Exp Bank" section similar to the existing "Virgin Bank" section (lines 3634-3657), but with separate ♂/♀ buttons.

**Step 1: Add expBank props to CrossCard and show quick-log during screening**

Add `expBank` and `setExpBank` to CrossCard's destructured props. Then in the cross detail view, when status is `'screening'`, add a compact ♂/♀ logging section.

Find the screening section in the cross card detail (near the screening guide area ~line 2036) and add:

```jsx
{cross.status === 'screening' && expBank && setExpBank && (() => {
  const entry = expBank[cross.id] || { m: 0, f: 0 };
  return (
    <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(94,234,212,0.04)', border: '1px solid rgba(94,234,212,0.1)' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold" style={{ color: '#5eead4' }}>Exp Bank</p>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>{entry.m || 0}♂ {entry.f || 0}♀</p>
      </div>
      <div className="mb-2">
        <p className="text-[10px] mb-1" style={{ color: '#93c5fd' }}>♂</p>
        <div className="flex gap-1">
          <button onClick={() => setExpBank(prev => { const cur = prev[cross.id] || { m: 0, f: 0, source: 'cross' }; return { ...prev, [cross.id]: { ...cur, m: Math.max(0, cur.m - 1) } }; })} className="qlog-btn flex-1" disabled={(entry.m || 0) <= 0} style={(entry.m || 0) <= 0 ? { opacity: 0.3 } : {}}>-1</button>
          {[1, 3, 5].map(n => <button key={n} onClick={() => setExpBank(prev => { const cur = prev[cross.id] || { m: 0, f: 0, source: 'cross' }; return { ...prev, [cross.id]: { ...cur, m: (cur.m || 0) + n } }; })} className="qlog-btn flex-1">+{n}</button>)}
        </div>
      </div>
      <div>
        <p className="text-[10px] mb-1" style={{ color: '#f9a8d4' }}>♀</p>
        <div className="flex gap-1">
          <button onClick={() => setExpBank(prev => { const cur = prev[cross.id] || { m: 0, f: 0, source: 'cross' }; return { ...prev, [cross.id]: { ...cur, f: Math.max(0, cur.f - 1) } }; })} className="qlog-btn flex-1" disabled={(entry.f || 0) <= 0} style={(entry.f || 0) <= 0 ? { opacity: 0.3 } : {}}>-1</button>
          {[1, 3, 5].map(n => <button key={n} onClick={() => setExpBank(prev => { const cur = prev[cross.id] || { m: 0, f: 0, source: 'cross' }; return { ...prev, [cross.id]: { ...cur, f: (cur.f || 0) + n } }; })} className="qlog-btn flex-1">+{n}</button>)}
        </div>
      </div>
    </div>
  );
})()}
```

**Step 2: Add Exp Bank section to StockModal**

After the Virgin Bank section (~line 3657), add an analogous Exp Bank section. Add `expBank` and `setExpBank` to StockModal's props.

```jsx
{!isNew && expBank && setExpBank && (
  <div className="mb-4 p-3 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
    <div className="flex items-center justify-between mb-2">
      <p className="text-xs font-semibold" style={{ color: '#5eead4' }}>Exp Bank</p>
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>{(expBank[f.id]?.m || 0)}♂ {(expBank[f.id]?.f || 0)}♀</p>
    </div>
    <div className="mb-2">
      <p className="text-[10px] mb-1" style={{ color: '#93c5fd' }}>♂ Males</p>
      <div className="flex gap-2">
        <button onClick={() => { if ((expBank[f.id]?.m || 0) > 0) { setExpBank(prev => ({ ...prev, [f.id]: { ...(prev[f.id] || { m: 0, f: 0, source: 'stock' }), m: Math.max(0, (prev[f.id]?.m || 0) - 1) } })); toast.add('-1 ♂'); } }}
          disabled={(expBank[f.id]?.m || 0) <= 0}
          className="flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
          style={(expBank[f.id]?.m || 0) > 0 ? { background: 'rgba(239,68,68,0.08)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)' } : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)', opacity: 0.4 }}>-1</button>
        {[1, 3, 5].map(n => (
          <button key={n} onClick={() => { setExpBank(prev => ({ ...prev, [f.id]: { ...(prev[f.id] || { m: 0, f: 0, source: 'stock' }), m: (prev[f.id]?.m || 0) + n } })); toast.add(`+${n} ♂ logged`); }}
            className="flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
            style={{ background: 'rgba(94,234,212,0.08)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.15)' }}>+{n}</button>
        ))}
      </div>
    </div>
    <div>
      <p className="text-[10px] mb-1" style={{ color: '#f9a8d4' }}>♀ Females</p>
      <div className="flex gap-2">
        <button onClick={() => { if ((expBank[f.id]?.f || 0) > 0) { setExpBank(prev => ({ ...prev, [f.id]: { ...(prev[f.id] || { m: 0, f: 0, source: 'stock' }), f: Math.max(0, (prev[f.id]?.f || 0) - 1) } })); toast.add('-1 ♀'); } }}
          disabled={(expBank[f.id]?.f || 0) <= 0}
          className="flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
          style={(expBank[f.id]?.f || 0) > 0 ? { background: 'rgba(239,68,68,0.08)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)' } : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)', opacity: 0.4 }}>-1</button>
        {[1, 3, 5].map(n => (
          <button key={n} onClick={() => { setExpBank(prev => ({ ...prev, [f.id]: { ...(prev[f.id] || { m: 0, f: 0, source: 'stock' }), f: (prev[f.id]?.f || 0) + n } })); toast.add(`+${n} ♀ logged`); }}
            className="flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
            style={{ background: 'rgba(94,234,212,0.08)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.15)' }}>+{n}</button>
        ))}
      </div>
    </div>
  </div>
)}
```

**Step 3: Pass expBank/setExpBank through all CrossCard and StockModal call sites**

Find every `<CrossCard` and `<StockModal` render and add `expBank={expBank} setExpBank={setExpBank}` props. Key locations:
- HomeScreen CrossCard renders (~lines 2626, 2702)
- HomeScreen StockModal render (~line 2767)
- StocksScreen StockModal renders (~line 3122)
- All parent components (HomeScreen, StocksScreen) need expBank/setExpBank in their own props

**Step 4: Commit**

```bash
git add -f src/index.html
git commit -m "feat: add exp bank quick-log to cross cards and stock modal"
```

---

### Task 7: Wire expBank into Demo Data and Settings Reset

**Files:**
- Modify: `src/index.html` (demoData function ~line 1364)
- Modify: `src/index.html` (SettingsScreen — clear all / load demo data handlers)

**Context:** The demo data factory and settings screen clear/reset need to handle expBank like they handle virginBank.

**Step 1: Add expBank to demo data**

In the `demoData()` function, add sample expBank entries using cross/stock IDs from the demo data:

```js
expBank: {
  'c5': { m: 8, f: 12, source: 'cross' },
  'c15': { m: 3, f: 5, source: 'cross' },
  's3': { m: 2, f: 4, source: 'stock' }
}
```

**Step 2: Handle expBank in settings reset/demo load**

Find where virginBank is cleared/loaded in SettingsScreen and do the same for expBank. Pass `setExpBank` as a prop to SettingsScreen.

**Step 3: Commit**

```bash
git add -f src/index.html
git commit -m "feat: wire expBank into demo data and settings reset"
```
