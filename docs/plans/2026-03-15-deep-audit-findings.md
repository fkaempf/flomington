# Deep Audit Findings — 5 Agent Analysis

## Summary

5 specialized agents audited the entire Flomington codebase. Combined findings: **66 issues** across 5 areas.

| Agent | Issues Found | Critical | High | Medium | Low |
|-------|-------------|----------|------|--------|-----|
| VCS Scheduling | 15 | 2* | 3 | 6 | 4 |
| Cross Workflow | 15 | 0 | 4 | 6 | 5 |
| Mobile UX & Offline | 14 | 5 | 0 | 6 | 3 |
| Security & Data Integrity | 12 | 3 | 5 | 3 | 1 |
| Missing Features & Polish | 10 | 1 | 2 | 4 | 3 |

*Note: VCS agent flagged getVirginWindowH() returning 8h as a bug — this is INTENTIONAL per user correction (stocks are at 25C during the day, 18C is overnight only).

---

## Top Priority Fixes (Grouped by Impact)

### Data Safety (fix first)
1. **"Clear All Data" has no confirmation dialog** — one click destroys everything
2. **"Load Demo Data" has no confirmation** — overwrites production data
3. **Demo mode doesn't fully block sync** — demo data can push to Supabase
4. **Import JSON has no validation** — malformed data silently corrupts state
5. **Bulk delete has no undo** — unlike single delete which has undo toast
6. **"Change PIN" clears all PINs without confirmation**

### VCS Engine Bugs
7. **todayActions never resets across overnight boundaries** — stale actions block next morning's collections
8. **Auto-advance silently skips missed actions** — user unaware morning collect was abandoned
9. **Overdue (30min late) vs Expired (8h deadline) show same red UI** — user thinks virgins are dead when they have hours left

### Cross Workflow
10. **Deleted parent stocks leave orphaned crosses** — shows "?? x ??" with no warning
11. **Manual "set status" to "collecting virgins" doesn't create VCS** — cross invisible in VCS dashboard
12. **Shallow merge on realtime can truncate collected/vials arrays**
13. **Re-vial inherits stale VCS from original cross**

### Mobile UX
14. **iOS safe area not handled** — nav bar hidden by home indicator
15. **VCS action buttons too small (11px, ~20px height)** — minimum should be 44px
16. **window.open() blocked on mobile Safari** — printing doesn't work
17. **No offline indicator** — user doesn't know if viewing stale data

### Security (relevant if app scope expands)
18. **StatiCrypt password in git history** (CLAUDE.md)
19. **PIN bypass via localStorage editing** — client-side only validation
20. **CDN versions not pinned** — no SRI hashes

---

## VCS Scheduling — Detailed Findings

### Intentionally Not Bugs (per user correction)
- getVirginWindowH() always returns 8 — CORRECT (daytime = 25C)
- Deadline is about expiry, collections happen at scheduled times — CORRECT

### Real Bugs
- **todayActions stale state**: If app closed after afternoon collect, reopened next morning, yesterday's actions are still in todayActions. The clear from yesterday is still `lastClearTime`, so yesterday's collect is >= clearMs and marked as done. Morning collect gets skipped.
- **Auto-advance**: `while (result.length > 1 && result[0].timeUntilMs < -2h) result.shift()` — no UI indication. User sees next action without knowing one was silently dropped.
- **Status color conflation**: `isOverdue` (30min past scheduled time) and `isPastDeadline` (8h expiry) both show red. These are very different situations.
- **Notification fired set recreated on every React effect re-run** — can cause duplicate notifications when stocks/crosses state changes.
- **No maintainer check on VCS action logging** — any user can log actions on any stock's VCS.
- **DST transition**: ISO UTC storage + local time display can be off by 1h during spring/fall transitions.

---

## Cross Workflow — Detailed Findings

### Status Transition Issues
- Ripening auto-skip (non-opto crosses) only works via advance(), not manual setStatus()
- No validation on backward status jumps (screening → collecting virgins allowed)
- Manual status change to "collecting virgins" doesn't initialize VCS

### Orphaned Data
- Stock deletion has no cascade — crosses with deleted parents show "?? x ??"
- No warning before deleting stocks used as cross parents
- Re-vial inherits stale VCS config and experiment metadata

### Sync Concerns
- Virgin bank depletion race condition with multi-device sync
- Shallow merge on realtime updates can truncate collected/vials arrays
- Sequential cross feature (parentCrossId) exists in schema but has zero logic

### Missing Features
- Balancer marker list incomplete (missing In2, In3, Sb, etc.)
- No screening hints for UAS/GAL4 fluorescent markers
- Calendar export missing ripening events
- Ripening duration hardcoded (3d opto, 5d GCaMP)

---

## Mobile UX — Detailed Findings

### Touch Targets (HIGH)
- VCS action buttons: 11px text, px-2 py-1.5 = ~20px height (should be 44px)
- Virgin bank log buttons: same issue
- 18C confirmation buttons: same issue
- Modal close button: 32x32px (should be 44px)

### Layout (HIGH)
- Bottom nav: `bottom: 16px` without `env(safe-area-inset-bottom)` — hidden on notched iPhones
- Modal inputs hidden by virtual keyboard on iOS
- Potential horizontal overflow on VCS cards on narrow screens (375px)

### Offline (HIGH)
- No `navigator.onLine` check or `online`/`offline` event listeners
- No visual indicator of sync state on main screens
- localStorage quota exceeded silently swallowed
- Supabase pull failure doesn't show warning to user

### Print (HIGH)
- `window.open()` returns null on mobile Safari — no fallback
- QR code CDN may fail on slow mobile networks

### Performance
- WebGL2 grainient: no fallback for older browsers, battery drain on mobile
- Already disabled on mobile (< 1024px) — good decision

---

## Security — Detailed Findings

### Critical (if app scope expands beyond trusted lab)
- Supabase anon key hardcoded with no RLS — any client can read/write/delete all data
- PIN validation is client-side only — editing localStorage bypasses it
- StatiCrypt password "$FLOMINGTON_PW" committed to CLAUDE.md in git history

### High
- QR code innerHTML XSS potential (SVG injection via compromised CDN)
- `esc()` function missing quote escaping (' and " not escaped)
- Deep link prefix matching could hit wrong stock/cross
- Realtime payloads accepted without schema validation
- Import JSON accepted without schema validation

### Medium
- Cross owner check is client-side only
- CDN versions not pinned (React@18, not React@18.2.0), no SRI hashes
- BDSC fetch via third-party CORS proxy (privacy + reliability)

---

## Missing Features & Polish — Detailed Findings

### Data Safety Gaps
- Clear All, Load Demo, Change PIN — no confirmation dialogs
- Bulk delete — no undo (single delete has undo)
- Demo mode — can leak to Supabase sync
- JSON import — no schema validation

### Feature Gaps
- No search on VCS dashboard (HomeScreen)
- VCS notification timing settings (remindMin, overdueMin) stored in localStorage but no settings UI
- No CSV export option
- No merge/append import option (only full replace)
- Collection pinning (categories disappear when last stock deleted)
- Sequential cross feature incomplete (schema exists, no logic)

### Polish
- Empty states lack guidance ("No stocks found" → should suggest next steps)
- Notification emoji in VCS alerts violates no-emoji rule
- Inconsistent confirmation patterns (some use Confirm component, others inline)
- No loading skeleton during initial sync
