# VCS Fixes, Testing & Demo Video — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 VCS bugs, add Playwright test infrastructure with 500+ test cases covering 15 problem themes, multi-instance sync tests, and record a demo video.

**Architecture:** TDD approach — write failing tests first, then implement fixes. Tests use Playwright with `page.clock.install()` for time manipulation, localStorage seeding for deterministic data, and dual browser contexts for sync tests. Video is a single continuous Playwright recording with DOM-injected title cards and clock overlay.

**Tech Stack:** Playwright, Vite dev server, Supabase (test project), React 19

**Spec:** `docs/superpowers/specs/2026-03-26-vcs-fixes-testing-spec.md`
**Test Cases:** `docs/plans/` (500 cases across 10 files)
**Test Supabase:** credentials in `.env.test`

---

## File Map

### New Files
| File | Responsibility |
|------|----------------|
| `playwright.config.js` | Playwright config (webServer, testDir, video settings) |
| `tests/utils/seed.js` | Seed localStorage with deterministic VCS test data |
| `tests/utils/clock.js` | Time manipulation helpers (set, advance, overlay) |
| `tests/utils/title-card.js` | DOM-injected title cards for video |
| `tests/utils/helpers.js` | Common test helpers (navigate, bypass PIN, wait) |
| `tests/vcs-fixes.spec.js` | Fast assertion tests for all 8 fixes |
| `tests/vcs-behavior.spec.js` | VCS cycle behavioral tests with time manipulation |
| `tests/vcs-themes.spec.js` | 15-theme comprehensive test suite (500 cases) |
| `tests/sync.spec.js` | Multi-instance sync tests (2 browser contexts) |
| `tests/vcs-video.spec.js` | Video recording demo (15 scenes from themes) |

### Modified Files
| File | Changes |
|------|---------|
| `src/screens/HomeScreen.jsx` | Fixes 1-5: debounce, markEdited, toast, doneCount, virginDeadline |
| `src/utils/vcs.js` | Fixes 4,6: getCurrentCycleDoneCount export, NaN guard, remove virginDeadline from makeVcs |
| `src/utils/demo.js` | Fix 5: remove virginDeadline from demo data |
| `src/App.jsx` | Fix 7: timestamp-based VCS merge in realtime handlers |
| `package.json` | Add Playwright dep + test scripts |

---

## Task 1: Playwright Infrastructure

**Files:**
- Create: `playwright.config.js`
- Modify: `package.json`

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create playwright.config.js**

```javascript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173/flomington/',
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/flomington/',
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
  projects: [
    { name: 'fixes', testMatch: 'vcs-fixes.spec.js' },
    { name: 'behavior', testMatch: 'vcs-behavior.spec.js' },
    { name: 'themes', testMatch: 'vcs-themes.spec.js' },
    { name: 'sync', testMatch: 'sync.spec.js' },
    {
      name: 'video',
      testMatch: 'vcs-video.spec.js',
      use: {
        video: { mode: 'on', size: { width: 1280, height: 720 } },
        headless: true,
      },
    },
  ],
});
```

- [ ] **Step 3: Add npm scripts to package.json**

Add to the `"scripts"` object:

```json
"test": "npx playwright test --project=fixes --project=behavior",
"test:all": "npx playwright test --project=fixes --project=behavior --project=themes",
"test:sync": "npx playwright test --project=sync",
"test:video": "npx playwright test --project=video"
```

- [ ] **Step 4: Create tests/ directory structure**

```bash
mkdir -p tests/utils tests/output
```

- [ ] **Step 5: Commit**

```bash
git add playwright.config.js package.json package-lock.json tests/
git commit -m "feat: add Playwright test infrastructure and config"
```

---

## Task 2: Test Utilities

**Files:**
- Create: `tests/utils/seed.js`
- Create: `tests/utils/clock.js`
- Create: `tests/utils/title-card.js`
- Create: `tests/utils/helpers.js`

- [ ] **Step 1: Create tests/utils/helpers.js**

Common test helpers for navigation, PIN bypass, state reading. Includes:
- `gotoApp(page, { user, supabase })` — navigate with PIN bypassed
- `getStockVcs(page, stockId)` — read VCS from localStorage
- `getCross(page, crossId)` — read cross from localStorage
- `getVirginCount(page, stockId)` — read virgin bank count
- `countActions(page, stockId, type)` — count todayActions of type
- `waitForRender(page, ms)` — wait for React re-render

Reads `TEST_SUPABASE_URL` and `TEST_SUPABASE_ANON_KEY` from `process.env` for sync tests.

- [ ] **Step 2: Create tests/utils/seed.js**

Deterministic seed data with absolute timestamps (base date: 2026-03-27). Includes:
- `makeStocks()` — 8 stocks covering: fresh-18-2, midcycle, near-deadline, grace-period, expired, 25C-3clear, disabled, no-VCS
- `makeCrosses()` — 2 crosses: collecting-virgins (2/5), threshold (4/5)
- `seedScript()` — returns a function for `page.addInitScript()` that sets localStorage

All timestamps are ISO strings, no relative dates.

- [ ] **Step 3: Create tests/utils/clock.js**

Time manipulation helpers:
- `freezeAt(page, iso)` — install frozen clock before page.goto
- `advance(page, duration)` — fastForward time with React re-render wait
- `updateClockOverlay(page, label)` — inject/update fixed-position clock badge (top-right, monospace, purple on dark bg)
- `setTime(page, iso, label)` — set fixed time and update overlay

- [ ] **Step 4: Create tests/utils/title-card.js**

Video title card helper:
- `showTitleCard(page, title, subtitle, durationMs)` — creates a full-screen dark overlay with centered text using `document.createElement` and `textContent` (no innerHTML), waits for duration, removes it

- [ ] **Step 5: Commit**

```bash
git add tests/utils/
git commit -m "feat: add Playwright test utilities (seed, clock, title-card, helpers)"
```

---

## Task 3: Fix 1 — Double-Tap Debounce

**Files:**
- Modify: `src/screens/HomeScreen.jsx`

- [ ] **Step 1: Add debounce state (after line 20)**

```javascript
const [stockVcsDebouncing, setStockVcsDebouncing] = useState(false);
const [crossVcsDebouncing, setCrossVcsDebouncing] = useState(false);
```

- [ ] **Step 2: Guard logAction (line ~519)**

Add at the start of `logAction`:
```javascript
if (stockVcsDebouncing) return;
setStockVcsDebouncing(true);
setTimeout(() => setStockVcsDebouncing(false), 500);
```

- [ ] **Step 3: Guard logCrossAction (line ~322)**

Add after the first line of `logCrossAction`:
```javascript
if (crossVcsDebouncing) return;
setCrossVcsDebouncing(true);
setTimeout(() => setCrossVcsDebouncing(false), 500);
```

- [ ] **Step 4: Add `disabled={stockVcsDebouncing}` to all stock VCS buttons (~lines 580-666)**

Apply to: clear, collect, clear_discard, collect_clear buttons, 18C confirm Yes/No buttons, bank prompt +N buttons. Add opacity 0.5 style when debouncing.

- [ ] **Step 5: Add `disabled={crossVcsDebouncing}` to all cross VCS buttons (~lines 390-496)**

Same pattern for cross VCS action buttons and cross bank prompt buttons.

- [ ] **Step 6: Verify build + commit**

```bash
npm run build
git add src/screens/HomeScreen.jsx
git commit -m "fix: add double-tap debounce protection to all VCS action buttons"
```

---

## Task 4: Fix 2 — Missing markEdited for Stock Virgin Bank

**Files:**
- Modify: `src/screens/HomeScreen.jsx`

- [ ] **Step 1: Add `markEdited(s.id)` to stock bank prompt +N handler (~line 649)**

After `setVirginBank(prev => ...)`, add `markEdited(s.id);`

- [ ] **Step 2: Verify build + commit**

```bash
npm run build
git add src/screens/HomeScreen.jsx
git commit -m "fix: call markEdited when banking virgins from stock VCS prompt"
```

---

## Task 5: Fix 3 — Toast Shows Wrong Temperature

**Files:**
- Modify: `src/screens/HomeScreen.jsx`

- [ ] **Step 1: Fix toast in logCrossAction (~line 340)**

Replace `v.overnightAt18 ? 'Cleared ...' : 'Cleared'` with:
```javascript
const actualTemp = temp || newVcs.lastClearTemp || (v.overnightAt18 ? '18' : '25');
```
Then use `actualTemp === '18'` in the msgs object.

- [ ] **Step 2: Same fix in logAction (~line 531)**

Identical change.

- [ ] **Step 3: Verify build + commit**

```bash
npm run build
git add src/screens/HomeScreen.jsx
git commit -m "fix: toast uses actual lastClearTemp instead of overnightAt18 config"
```

---

## Task 6: Fix 4 — Cycle-Aware doneCount Helper

**Files:**
- Modify: `src/utils/vcs.js`
- Modify: `src/screens/HomeScreen.jsx`

- [ ] **Step 1: Add `getCurrentCycleDoneCount` to vcs.js (after line 132)**

```javascript
export function getCurrentCycleDoneCount(vcs, type = 'collect') {
  if (!vcs?.todayActions || !vcs.lastClearTime) return 0;
  const clearMs = new Date(vcs.lastClearTime).getTime();
  return vcs.todayActions.filter(a => {
    if (a.type !== type || !a.time) return false;
    return new Date(a.time).getTime() >= clearMs;
  }).length;
}
```

- [ ] **Step 2: Replace inline doneCount in HomeScreen.jsx**

Find `(v.todayActions || []).filter(a => a.type === 'collect').length` and replace with `getCurrentCycleDoneCount(v, 'collect')`. Add to the import.

- [ ] **Step 3: Verify build + commit**

```bash
npm run build
git add src/utils/vcs.js src/screens/HomeScreen.jsx
git commit -m "fix: use cycle-aware doneCount helper instead of flat todayActions filter"
```

---

## Task 7: Fix 5 — Remove Dead virginDeadline Field

**Files:**
- Modify: `src/utils/vcs.js` (line 19)
- Modify: `src/screens/HomeScreen.jsx` (lines 334, 526)
- Modify: `src/utils/demo.js` (lines 32, 42, 53, 66, 76, 324, 341, 357)

- [ ] **Step 1: Remove `virginDeadline: computeDeadline(now, !!o18),` from makeVcs in vcs.js**

- [ ] **Step 2: Remove `newVcs.virginDeadline = computeDeadline(...)` from both logCrossAction (line 334) and logAction (line 526) in HomeScreen.jsx**

- [ ] **Step 3: Remove all `virginDeadline: null,` lines from demo.js (8 occurrences)**

- [ ] **Step 4: Verify build + commit**

```bash
npm run build
git add src/utils/vcs.js src/screens/HomeScreen.jsx src/utils/demo.js
git commit -m "fix: remove dead virginDeadline field (always recomputed from lastClearTime)"
```

---

## Task 8: Fix 6 — NaN Guard on parseHHMM

**Files:**
- Modify: `src/utils/vcs.js`

- [ ] **Step 1: Add NaN check after each parseHHMM call in computeNextActions**

Find each `if (schedMins === null)` guard and change to:
```javascript
if (schedMins === null || isNaN(schedMins)) continue;
```

- [ ] **Step 2: Verify build + commit**

```bash
npm run build
git add src/utils/vcs.js
git commit -m "fix: guard against NaN from invalid schedule time strings in parseHHMM"
```

---

## Task 9: Fix 7 — Timestamp-Based VCS Merge in Realtime

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add VCS merge to stocks realtime handler (~line 46-50)**

Replace the existing `setStocks` callback. After `const merged = { ...next[idx], ...item }`, add:

```javascript
if (item.vcs !== undefined && next[idx].vcs && item.vcs) {
  const localTime = new Date(next[idx].vcs.lastClearTime || 0).getTime();
  const remoteTime = new Date(item.vcs.lastClearTime || 0).getTime();
  if (remoteTime <= localTime) merged.vcs = next[idx].vcs;
}
```

- [ ] **Step 2: Same change for crosses realtime handler (~line 62-66)**

Identical VCS merge logic.

- [ ] **Step 3: Verify build + commit**

```bash
npm run build
git add src/App.jsx
git commit -m "fix: timestamp-based VCS merge in realtime prevents stale overwrites"
```

---

## Task 10: VCS Fix Assertion Tests

**Files:**
- Create: `tests/vcs-fixes.spec.js`

- [ ] **Step 1: Write tests for all 8 fixes**

Test cases:
- Fix 1: Rapid double-click on collect logs only 1 action; buttons show disabled during debounce
- Fix 2: Bank virgins, verify markEdited was called (check Supabase push timing)
- Fix 3: Clear with "No, RT", verify toast text
- Fix 4: Seed stock with pre-clear collects, verify doneCount shows 0
- Fix 5: After clear, verify VCS has no virginDeadline key
- Fix 6: Seed stock with invalid schedule time, verify no crash
- Fix 7: Simulate remote with older lastClearTime, verify local preserved

- [ ] **Step 2: Run tests**

```bash
npx playwright test --project=fixes
```

- [ ] **Step 3: Commit**

```bash
git add tests/vcs-fixes.spec.js
git commit -m "test: add assertion tests for all 8 VCS fixes"
```

---

## Task 11: VCS Behavioral Tests

**Files:**
- Create: `tests/vcs-behavior.spec.js`

- [ ] **Step 1: Write behavioral tests with time manipulation**

Test cases:
- Full 18C 2-clear cycle (clear -> collect -> collect+clear -> new cycle)
- Full 25C 3-clear cycle with clear_discard morning
- Grace period transitions (green -> yellow -> red -> expired)
- Cross VCS auto-promote at virgin threshold
- Bank prompt stays open after +N clicks
- 18C confirmation dialog flow
- Never-skip-last-clear rule
- Urgency sorting (red > yellow > green)

- [ ] **Step 2: Run tests**

```bash
npx playwright test --project=behavior
```

- [ ] **Step 3: Commit**

```bash
git add tests/vcs-behavior.spec.js
git commit -m "test: add VCS behavioral tests with time manipulation"
```

---

## Task 12: Video Demo Script

**Files:**
- Create: `tests/vcs-video.spec.js`

- [ ] **Step 1: Write 15-scene video demo**

Scenes (title card + actions + 2s pauses):
1. VCS Overview — Dashboard with multiple stocks
2. Morning Collection — Collect + bank prompt (+3, +1, Done)
3. Double-Tap Protection — Rapid click, only 1 logged
4. Afternoon Clear + 18C Confirm — "Yes, 18C"
5. Temperature Override — "No, RT", correct toast
6. 25C Window Expired — 8h passed, Clear & Discard only
7. Grace Period — Both Collect(late) and Discard visible
8. Fully Expired — Only Clear & Discard
9. Cross VCS — Bank prompt with running X/5 count
10. Cross Auto-Promote — +1 at 4/5, promotes to waiting-for-progeny
11. 3-Clear Schedule — Morning clear_discard, midday+afternoon collect
12. Cycle-Aware doneCount — Count survives clear correctly
13. Realtime VCS Merge — Newer timestamp wins
14. Edit Guard — 10s protection
15. Closing card — All fixes applied

Uses `showTitleCard()` (textContent, not innerHTML), `updateClockOverlay()`, `freezeAt()`, `advance()`.

- [ ] **Step 2: Record video**

```bash
npx playwright test --project=video
```

Video output in `test-results/` directory.

- [ ] **Step 3: Commit**

```bash
git add tests/vcs-video.spec.js
git commit -m "test: add VCS demo video recording script with 15 scenes"
```

---

## Task 13: Final Verification + Push

- [ ] **Step 1: Production build**

```bash
npm run build
```

- [ ] **Step 2: Run all fast tests**

```bash
npx playwright test --project=fixes --project=behavior
```

- [ ] **Step 3: Deploy pipeline**

```bash
npm run deploy
```

- [ ] **Step 4: Commit everything**

```bash
git add src/ tests/ playwright.config.js package.json package-lock.json supabase/ docs/superpowers/plans/
git commit -m "VCS system: 8 fixes, Playwright test suite, demo video

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Push**

```bash
git push
```
