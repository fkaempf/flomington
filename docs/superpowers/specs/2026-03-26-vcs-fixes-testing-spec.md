# VCS System Fixes, Playwright Testing & Demo Video

**Date:** 2026-03-26
**Status:** Draft
**Scope:** 8 bug fixes + Playwright test suite + multi-instance sync tests + demo video

---

## 1. Prerequisites (Human, Before Execution)

Before autonomous execution begins, the user must:

1. **Create a free Supabase test project** at https://supabase.com/dashboard
2. **Apply the schema** from `supabase/schema.sql` (+ new `exp_banks` table)
3. **Provide credentials** — create `.env.test` in project root:
   ```
   TEST_SUPABASE_URL=https://<test-project>.supabase.co
   TEST_SUPABASE_ANON_KEY=<anon-key>
   ```
4. **Add `.env.test` to `.gitignore`**

---

## 2. Bug Fixes

### Fix 1: Double-Tap Debounce (High)

**Problem:** No protection against rapid double-clicks on VCS action buttons, causing duplicate entries in `todayActions`.

**Solution:** Add `useState`-based debounce with visual feedback.

- Add state: `const [vcsDebouncing, setVcsDebouncing] = useState(false);`
- Wrap `logAction` and `logCrossAction`: set `vcsDebouncing = true` on entry, `false` after 500ms
- Apply `disabled={vcsDebouncing}` + `opacity: 0.5` to all VCS action buttons:
  - Clear, Collect, Clear+Discard, Collect+Clear buttons
  - 18°C confirmation Yes/No buttons
  - Bank prompt +1/+3/+5 buttons
- Handler-level debounce (one gate for all stock VCS, one for all cross VCS)

**Files:** `src/screens/HomeScreen.jsx`

### Fix 2: Missing `markEdited` for Stock Virgin Bank (Medium)

**Problem:** Banking virgins from VCS prompt doesn't call `markEdited(s.id)`, so the change may not push to Supabase.

**Solution:** Add `markEdited(s.id)` inside the stock VCS bank prompt +N click handler.

**Files:** `src/screens/HomeScreen.jsx` (~line 649)

### Fix 3: Toast Shows Wrong Temperature (Low)

**Problem:** Toast messages use `v.overnightAt18` for display text, but the actual temperature for this cycle might differ if user chose "No, RT".

**Solution:** Use the `temp` parameter (if provided) or `newVcs.lastClearTemp` instead of `v.overnightAt18` in toast messages.

**Change in both `logAction` and `logCrossAction`:**
```javascript
// Before:
const msgs = { clear: v.overnightAt18 ? 'Cleared -> 18C' : 'Cleared', ... };
// After:
const actualTemp = temp || newVcs.lastClearTemp || (v.overnightAt18 ? '18' : '25');
const msgs = { clear: actualTemp === '18' ? 'Cleared -> 18C' : 'Cleared', ... };
```

**Files:** `src/screens/HomeScreen.jsx`

### Fix 4: `doneCount` Shows Stale Counts (Low)

**Problem:** `doneCount` counts ALL collects in `todayActions`, including those from previous cycles. The original `todayActions = [action]` reset on clear is actually correct and prevents unbounded growth.

**Solution:** Keep the existing reset behavior. Add a cycle-aware helper for display:

```javascript
// In vcs.js — new export
export function getCurrentCycleDoneCount(vcs, type = 'collect') {
  if (!vcs?.todayActions || !vcs.lastClearTime) return 0;
  const clearMs = new Date(vcs.lastClearTime).getTime();
  return vcs.todayActions.filter(a => {
    if (a.type !== type || !a.time) return false;
    return new Date(a.time).getTime() >= clearMs;
  }).length;
}
```

Replace the inline `doneCount` calculation in HomeScreen.jsx with this helper.

**Files:** `src/utils/vcs.js`, `src/screens/HomeScreen.jsx`

### Fix 5: Remove Dead `virginDeadline` Field (Low)

**Problem:** `virginDeadline` is computed on every clear but never read. All UI code recomputes deadline from `lastClearTime`.

**Solution:** Remove `virginDeadline` from:
- `makeVcs()` in `vcs.js`
- Both `logAction` and `logCrossAction` in `HomeScreen.jsx`
- `demo.js` seed data

**Note:** This will cause a one-time hash change triggering Supabase re-upsert of all affected rows. Harmless.

**Files:** `src/utils/vcs.js`, `src/screens/HomeScreen.jsx`, `src/utils/demo.js`

### Fix 6: NaN Guard on `parseHHMM` (Very Low)

**Problem:** Invalid schedule time strings (e.g., `"12:abc"`) produce NaN, which passes the null check and creates broken actions.

**Solution:** Add after `parseHHMM` call in `computeNextActions`:
```javascript
if (schedMins === null || isNaN(schedMins)) continue;
```

**Files:** `src/utils/vcs.js` (~line 66)

### Fix 7: Deep Merge VCS on Realtime Updates (Medium)

**Problem:** Realtime updates use shallow merge (`{ ...localStock, ...remoteItem }`), replacing the entire local VCS object with potentially stale remote data.

**Solution:** Timestamp-based VCS winner selection using `lastClearTime` as version clock:

```javascript
// In App.jsx realtime handler
if (item.vcs !== undefined && next[idx].vcs) {
  const localTime = new Date(next[idx].vcs.lastClearTime || 0).getTime();
  const remoteTime = new Date(item.vcs?.lastClearTime || 0).getTime();
  if (remoteTime <= localTime) {
    // Local is newer — keep local VCS, accept other fields
    merged.vcs = next[idx].vcs;
  }
  // else: remote is newer, merged.vcs already has remote value from spread
}
```

Apply to both stocks (line ~48) and crosses (line ~64) realtime handlers.

**Why not field-level merge:** Mixing `lastClearTime` from user A with `todayActions` from user B creates inconsistent state. The clear operation atomically sets both, so they must travel together.

**Files:** `src/App.jsx`

### Fix 8: Protect `todayActions` From Stale Overwrites (Medium)

**Problem:** After `isEditedLocally()` 10-second guard expires, a stale realtime update can overwrite local VCS.

**Solution:** This is solved by Fix 7 — the timestamp-based comparison persists beyond the 10-second window. If local VCS has a newer `lastClearTime`, remote updates won't overwrite it regardless of `isEditedLocally()` status.

No additional code change needed beyond Fix 7.

---

## 3. Schema Update

Add missing `exp_banks` table to `supabase/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS exp_banks (
  user_name TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'cross',
  male_count INTEGER NOT NULL DEFAULT 0,
  female_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_name, source_id)
);

ALTER TABLE exp_banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all exp_banks" ON exp_banks FOR ALL USING (true) WITH CHECK (true);
```

---

## 4. Test Infrastructure

### Setup

- **Playwright** as devDependency (`@playwright/test`)
- **npm scripts:**
  - `npm test` — fast assertion tests (no video, parallel)
  - `npm run test:video` — slow video recording demo (sequential)
  - `npm run test:sync` — multi-instance sync tests (sequential, needs test Supabase)
- **Directory structure:**

```
tests/
  playwright.config.js
  utils/
    seed.js           # Seed localStorage with deterministic VCS data
    clock.js          # Time manipulation helpers (freeze, advance, overlay)
    title-card.js     # Inject/remove full-screen title cards
    supabase-admin.js # Direct Supabase client for test setup/teardown
  vcs-fixes.spec.js   # Fast assertions for all 8 fixes
  vcs-behavior.spec.js # Full VCS cycle walkthrough with time manipulation
  sync.spec.js        # Multi-instance sync tests (2 browser contexts)
  vcs-video.spec.js   # Slow video recording demo
  output/             # Video output directory
```

### Playwright Config

```javascript
// playwright.config.js
export default {
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173/flomington/',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/flomington/',
    reuseExistingServer: !process.env.CI,
  },
};
```

### Time Manipulation Strategy

Use Playwright's `page.clock.install()`:
- Install BEFORE `page.goto()` to control all time APIs
- Intercepts `new Date()`, `Date.now()`, `.toISOString()`, `setTimeout`, `setInterval`
- Use `page.clock.fastForward()` to jump between times mid-test without page reload
- 30-second sync poll fires automatically when time advances past its interval

### Data Seeding Strategy

Seed localStorage via `page.addInitScript()` BEFORE navigation:
- Use absolute ISO timestamps (not relative dates like demo.js)
- Bypass PIN lock: set `flo-unlock-ts` to current timestamp
- For unit/behavior tests: do NOT set `flo-sb-url`/`flo-sb-key` (prevents Supabase pull overwrite)
- For sync tests: set `flo-sb-url`/`flo-sb-key` to test project, seed Supabase tables directly

### PIN Lock Bypass

```javascript
localStorage.setItem('flo-unlock-ts', String(Date.now()));
localStorage.setItem('flo-user', 'Flo');
```

### Seed Data Scenarios (8 stocks with fixed timestamps)

| ID | Name | Config | State | Tests |
|----|------|--------|-------|-------|
| `seed-fresh-18-2` | Oregon-R | 18C, 2-clear | Just cleared, green | Normal cycle |
| `seed-midcycle-18-2` | w1118 | 18C, 2-clear | Morning done, afternoon pending | Partial progress |
| `seed-near-deadline` | yw | 18C, 3-clear | <30min to deadline, yellow | Urgency display |
| `seed-grace-period` | Canton-S | 18C, 2-clear | Deadline + 15min | Grace period UI |
| `seed-expired` | TM3/TM6 | 25C, 2-clear | Deadline + 45min | Expired, clear & discard only |
| `seed-25-3clear` | Sp/CyO | 25C, 3-clear | Fresh, morning = clear_discard | 3-clear + 25C behavior |
| `seed-disabled` | balancer | Disabled | VCS off | No actions shown |
| `seed-null-clear` | new-stock | 18C, 2-clear | Never cleared | No deadline yet |

Plus 2 crosses:
| ID | Status | VCS | Tests |
|----|--------|-----|-------|
| `seed-cross-collecting` | collecting virgins | 18C, 2-clear, 2/5 collected | Bank prompt, running count |
| `seed-cross-threshold` | collecting virgins | 18C, 2-clear, 4/5 collected | Auto-promote on +1 |

---

## 5. Test Specifications

### vcs-fixes.spec.js (Fast, Parallel)

| Test | What It Asserts |
|------|-----------------|
| Double-tap protection | Click collect twice rapidly, verify only 1 action in todayActions |
| Buttons disabled during debounce | After click, verify `disabled` attribute on VCS buttons |
| markEdited on stock bank | Bank +3 virgins, verify markEdited was called (check Supabase push) |
| Toast correct temperature | Clear with "No, RT", verify toast says "Cleared" not "Cleared -> 18C" |
| doneCount cycle-aware | Seed stock with pre-clear collects in todayActions, verify display shows 0 |
| virginDeadline removed | After clear, verify VCS object has no virginDeadline key |
| NaN schedule guard | Seed stock with invalid schedule time, verify no crash, no NaN actions |
| Realtime VCS merge | Simulate remote update with older lastClearTime, verify local VCS preserved |

### vcs-behavior.spec.js (Sequential, Time Manipulation)

| Test | Time Sequence | What It Verifies |
|------|---------------|------------------|
| Full 18C 2-clear cycle | 17:30 -> 09:30 -> 17:00 -> 17:30 | Clear -> collect -> collect+clear -> new cycle |
| Full 25C 3-clear cycle | 18:00 -> 09:00 -> 12:00 -> 16:30 | Clear -> discard -> collect -> collect+clear |
| Grace period transitions | deadline-1min -> deadline -> deadline+15min -> deadline+31min | Green -> yellow -> red(grace) -> red(expired) |
| Cross VCS auto-promote | Collect virgins until threshold | Cross status changes to "waiting for progeny" |
| Bank prompt stays open | Click +3, +1, +1 | Prompt visible after each click, count updates, dismiss with Done |
| 18C confirmation flow | Evening clear on 18C stock | Prompt appears, "Yes" sets lastClearTemp=18, "No" sets 25 |
| Never skip last clear | Advance 3+ hours past afternoon | Last clear action still visible, not auto-skipped |
| Sorting by urgency | Multiple VCS stocks at different states | Red first, then yellow, then green |

### sync.spec.js (Sequential, Two Browser Contexts)

| Test | Setup | What It Verifies |
|------|-------|------------------|
| VCS clear syncs to other instance | A clears stock VCS | B sees updated lastClearTime within 5s |
| Newer VCS wins | A clears at T1, B clears at T2>T1 | Both end up with B's VCS (newer lastClearTime) |
| Older remote doesn't overwrite | A clears at T2, remote sends T1 | A keeps its VCS (local is newer) |
| Cross VCS promotion syncs | A collects last virgin, cross promotes | B sees cross status = "waiting for progeny", VCS = null |
| Virgin bank per-user isolation | A (Flo) banks virgins | B (Bella) doesn't see them in her bank |
| Simultaneous collect | A and B both collect at ~same time | Both actions eventually reconciled |

---

## 6. Demo Video Specification

### Recording Config

- **Format:** Single `.webm`, Playwright built-in recording
- **Resolution:** 1280x720
- **One continuous test** in `vcs-video.spec.js`
- **Output:** `tests/output/vcs-demo.webm`

### Dev-Only Overlays (injected via Playwright, not in app code)

**Clock overlay:** Fixed-position badge, top-right of nav bar, monospace font, dark semi-transparent background. Shows `HH:MM - Day`. Re-injected after each time change via `page.evaluate()`.

**Title cards:** Full-screen dark overlay (`z-index: 99999`), centered white text (48px), shown for 3 seconds via `page.waitForTimeout(3000)`. Injected/removed via DOM manipulation.

### Scene List

| # | Title Card | Simulated Time | Actions | Duration |
|---|-----------|----------------|---------|----------|
| 1 | "VCS Overview - 2-Clear at 18C" | 09:00 Mar 27 | Show dashboard with multiple VCS cards, point out status colors and progress bars | ~12s |
| 2 | "Morning Collection - Virgins Ready" | 09:30 Mar 27 | Tap collect on stock, bank prompt appears with running count, tap +3, +1, tap Done | ~15s |
| 3 | "Double-Tap Protection" | 09:35 Mar 27 | Rapid-click collect button 3x, show only 1 action logged, buttons briefly disabled | ~10s |
| 4 | "Afternoon Collect + Evening Clear" | 17:00 Mar 27 | Tap collect+clear, 18C confirmation appears, choose "Yes, 18C" | ~12s |
| 5 | "Temperature Override - Room Temp" | 17:05 Mar 27 | Clear another stock, choose "No, RT", toast correctly says "Cleared" (not "-> 18C") | ~10s |
| 6 | "Next Morning - 25C Window Expired" | 09:00 Mar 28 | Stock that was RT overnight shows expired (8h window passed), only "Clear & Discard" button | ~10s |
| 7 | "Grace Period - 15min Past Deadline" | deadline+15m | VCS in grace period, both "Collect (late)" and "Discard" visible | ~10s |
| 8 | "Fully Expired - Past Grace" | deadline+45m | Only "Clear & Discard" shown, red status, red progress bar | ~8s |
| 9 | "Cross VCS - Collecting Virgins" | 09:30 | Cross card with VCS, bank prompt shows 2/5, tap +1, prompt stays open showing 3/5 | ~12s |
| 10 | "Cross Threshold - Auto-Promote" | 09:32 | Add +3 to reach 5/5, cross auto-promotes to "waiting for progeny", card disappears from VCS section | ~10s |
| 11 | "3-Clear Schedule at 25C" | 09:00 | Stock with 3-clear, show morning = "Clear & Discard" (not collect), midday and afternoon slots | ~10s |
| 12 | "todayActions Preserved" | 17:30 | Show collect count badge survives through cycle, doneCount correctly filters by cycle | ~8s |

**Total estimated:** ~3:30, ~27MB

### Pacing

- 2-second pause after each user action (viewer sees state change)
- 3-second hold on title cards
- 500ms pause before/after title card transitions (clean capture)

---

## 7. Execution Plan (for `claude --dangerously-skip-permissions`)

### Phase 0: Human Prerequisites
- Create test Supabase project
- Add `.env.test` with credentials
- Add `.env.test` to `.gitignore`

### Phase 1: Setup (Sequential, ~5 min)
1. Install Playwright: `npm install -D @playwright/test && npx playwright install chromium`
2. Create `playwright.config.js`
3. Create `tests/utils/` helper files (seed, clock, title-card, supabase-admin)
4. Update `supabase/schema.sql` with `exp_banks` table
5. Add npm scripts to `package.json`

**Checkpoint:** `npx playwright test --list` shows 0 tests (infrastructure ready)

### Phase 2: Bug Fixes (Partially Parallel, ~10 min)
- **Agent A:** Fixes 1-5 (debounce, markEdited, toast, doneCount, virginDeadline) in `HomeScreen.jsx` + `demo.js`
- **Agent B:** Fixes 4, 6 (doneCount helper export, NaN guard) in `vcs.js` — no HomeScreen edits
- **Agent C:** Fix 7 (realtime VCS merge) in `App.jsx`

Agents A+C run in parallel (different files). Agent B runs in parallel with C but coordinates with A on the new `getCurrentCycleDoneCount` export (B writes the function, A imports it).

**Checkpoint:** `npm run build` succeeds

### Phase 3: Tests (Parallel, ~15 min)
- **Agent D:** Write `vcs-fixes.spec.js` (8 assertion tests)
- **Agent E:** Write `vcs-behavior.spec.js` (8 behavioral tests with time manipulation)
- **Agent F:** Write `sync.spec.js` (6 multi-instance tests)
- **Agent G:** Write seed data in `tests/utils/seed.js`

**Checkpoint:** `npm test` — all tests pass

### Phase 4: Video (Sequential, ~10 min)
- **Agent H:** Write `vcs-video.spec.js` (12-scene demo)
- Run `npm run test:video`

**Checkpoint:** `tests/output/vcs-demo.webm` exists and is >5MB

### Phase 5: Validation (Sequential, ~5 min)
- `npm run build` succeeds
- `npm test` all green
- `npm run deploy` (build + encrypt) succeeds
- Commit all changes

**Checkpoint:** Clean git status, production build valid

### Failure Handling
- **Setup fails:** ABORT, require human intervention
- **Build fails after fixes:** ABORT, report which fix broke it
- **Tests fail:** Report failures with logs, don't push
- **Video recording fails:** Non-blocking, skip and continue to validation

### Agent Conflict Avoidance
- Phase 2 agents touch different files (no overlapping edits)
- Phase 3 agents write new files only (no conflicts)
- Max 4 parallel agents at any time

---

## 8. Files Modified

| File | Fixes | Phase |
|------|-------|-------|
| `src/screens/HomeScreen.jsx` | 1, 2, 3, 4, 5 | 2 |
| `src/utils/vcs.js` | 4, 5, 6 | 2 |
| `src/utils/demo.js` | 5 | 2 |
| `src/App.jsx` | 7 | 2 |
| `supabase/schema.sql` | exp_banks table | 1 |
| `package.json` | test scripts, Playwright dep | 1 |
| `playwright.config.js` | NEW | 1 |
| `tests/**` | NEW (all test files) | 3-4 |
| `.gitignore` | .env.test, tests/output/ | 1 |

---

## 9. Out of Scope

- Supabase env var support in Vite config (test overrides via localStorage are sufficient)
- DST handling (single-timezone lab)
- Mid-cycle `overnightAt18` toggle protection (can't be changed after creation)
- CI/CD integration for tests (local only for now)
- Desktop app changes
