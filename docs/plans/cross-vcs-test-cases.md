# Cross-Specific VCS Behavior - Test Cases

50 test cases covering cross VCS assignment, backfill, auto-promotion, dashboard filtering, bank prompt counting, and edge cases.

---

## Backfill on Page Load

### CX-001: Backfill assigns VCS to collecting-virgins cross without VCS on load
- **Setup**: Cross `{ status: 'collecting virgins', vcs: null, overnightAt18: true }`
- **Action**: HomeScreen mounts, backfill useEffect runs
- **Expected**: Cross gets `vcs: makeVcs(true, 2, VCS_DEFAULTS['18_2'])` with `enabled: true`, `overnightAt18: true`, `collectionsPerDay: 2`, schedule from `18_2`
- **Risk**: Backfill fires before crosses are populated from Supabase pull, creating a VCS with stale `lastClearTime`

### CX-002: Backfill assigns VCS to collecting-virgins cross with overnightAt18 explicitly false
- **Setup**: Cross `{ status: 'collecting virgins', vcs: null, overnightAt18: false }`
- **Action**: HomeScreen mounts, backfill useEffect runs
- **Expected**: Cross gets `vcs: makeVcs(false, 2, VCS_DEFAULTS['25_2'])` with `overnightAt18: false`
- **Risk**: `overnightAt18 !== false` evaluates truthy for `undefined`; backfill uses the same check, so `false` must produce a 25C schedule

### CX-003: Backfill defaults overnightAt18 to true when undefined
- **Setup**: Cross `{ status: 'collecting virgins', vcs: null }` (no `overnightAt18` field)
- **Action**: HomeScreen mounts, backfill useEffect runs
- **Expected**: `c.overnightAt18 !== false` is `true`, so cross gets 18C VCS schedule (`18_2`)
- **Risk**: If `overnightAt18` is `undefined`, the `!== false` check returns `true`; any future refactor to a truthy check would break the default

### CX-004: Backfill skips crosses that already have VCS
- **Setup**: Cross `{ status: 'collecting virgins', vcs: { enabled: true, ... } }`
- **Action**: HomeScreen mounts, backfill useEffect runs
- **Expected**: Cross is unchanged; `need` array is empty, useEffect returns early
- **Risk**: If the filter used `!c.vcs?.enabled` instead of `!c.vcs`, a VCS with `enabled: false` would be overwritten

### CX-005: Backfill skips crosses not in collecting-virgins status
- **Setup**: Cross `{ status: 'waiting for virgins', vcs: null }`
- **Action**: HomeScreen mounts, backfill useEffect runs
- **Expected**: Cross is unchanged; filter `c.status === 'collecting virgins'` excludes it
- **Risk**: Typo in status string would silently fail to match

### CX-006: Backfill handles multiple crosses needing VCS simultaneously
- **Setup**: Three crosses all `{ status: 'collecting virgins', vcs: null }` with `overnightAt18: true, false, undefined` respectively
- **Action**: HomeScreen mounts, backfill useEffect runs
- **Expected**: All three get VCS: first gets `18_2`, second gets `25_2`, third gets `18_2` (default). Each gets its own independent `lastClearTime` set to `new Date().toISOString()` at creation time
- **Risk**: If `setCrosses` callback reads stale closure, only the last cross might be updated; the `.map()` pattern avoids this

### CX-007: Backfill does not fire when no crosses lack VCS
- **Setup**: Two crosses: one `{ status: 'collecting virgins', vcs: { enabled: true } }`, one `{ status: 'done', vcs: null }`
- **Action**: HomeScreen mounts
- **Expected**: `need.length === 0`, useEffect returns early, `setCrosses` is never called
- **Risk**: Unnecessary re-renders if the guard is missing

---

## Backfill When Status Changes

### CX-008: Auto-promote from waiting-for-virgins to collecting-virgins assigns VCS
- **Setup**: Cross `{ status: 'waiting for virgins', setupDate: 10 days ago, overnightAt18: true, vcs: null }`
- **Action**: HomeScreen auto-promote useEffect fires (9 days elapsed >= threshold of 9)
- **Expected**: Cross updated to `{ status: 'collecting virgins', vcs: makeVcs(true, 2, VCS_DEFAULTS['18_2']) }`
- **Risk**: The auto-promote useEffect creates VCS inline; if it didn't, the backfill would catch it next render, but `lastClearTime` would differ

### CX-009: Manual advance from waiting-for-virgins to collecting-virgins assigns VCS
- **Setup**: Cross `{ status: 'waiting for virgins', overnightAt18: false }`, user clicks advance
- **Action**: `advance()` in CrossCard computes `ns = 'collecting virgins'`, applies extra `{ vcs: makeVcs(false, 2, VCS_DEFAULTS['25_2']) }`
- **Expected**: Cross gets status `'collecting virgins'` with 25C VCS
- **Risk**: If advance skips collecting-virgins (due to banked virgins), VCS is never created -- this is correct behavior

### CX-010: Manual setStatus to collecting-virgins assigns VCS when cross lacks one
- **Setup**: Cross `{ status: 'set up', vcs: null, overnightAt18: true }`, user manually sets status to `'collecting virgins'`
- **Action**: `setStatus('collecting virgins')` in CrossCard
- **Expected**: Extra `{ vcs: makeVcs(true, 2, VCS_DEFAULTS['18_2']) }` applied because `!cross.vcs` is true
- **Risk**: None; the condition `st === 'collecting virgins' && !cross.vcs` handles this

### CX-011: Manual setStatus to collecting-virgins preserves existing VCS
- **Setup**: Cross `{ status: 'collecting virgins', vcs: { enabled: true, lastClearTime: '2026-03-25T09:00:00Z', todayActions: [...] } }`, user sets status to `'collecting virgins'` again
- **Action**: `setStatus('collecting virgins')` in CrossCard
- **Expected**: Extra is `{}` because `cross.vcs` is truthy; existing VCS with actions preserved
- **Risk**: If the condition were `st === 'collecting virgins'` without `&& !cross.vcs`, VCS would be reset

### CX-012: Status change to collecting-virgins from any non-standard status triggers backfill
- **Setup**: Cross `{ status: 'screening', vcs: null }`, user manually sets status to `'collecting virgins'`
- **Action**: `setStatus('collecting virgins')`
- **Expected**: VCS assigned via the `setStatus` extra logic (since `!cross.vcs` is true)
- **Risk**: If `setStatus` didn't handle this, the backfill useEffect would catch it on next render, but with a different timestamp

---

## Auto-Promotion at Threshold

### CX-013: logVirgin promotes when count reaches virginsPerCross (exact threshold)
- **Setup**: Cross `{ status: 'collecting virgins', virginsCollected: 4, vcs: { enabled: true } }`, `virginsPerCross = 5`
- **Action**: `logVirgin(1)` in CrossCard (newCount = 5)
- **Expected**: Cross becomes `{ virginsCollected: 5, status: 'waiting for progeny', waitStartDate: today(), vcs: null }`
- **Risk**: Off-by-one: `>=` vs `>` -- code uses `>=`, so exact match promotes correctly

### CX-014: VCS dashboard bank prompt promotes when count reaches threshold
- **Setup**: Cross `{ status: 'collecting virgins', virginsCollected: 3, vcs: { enabled: true } }`, `virginsPerCross = 5`
- **Action**: User clicks `+3` in crossVcsBankPrompt (newCount = 6)
- **Expected**: `newCount >= 5` is true; cross promoted to `{ status: 'waiting for progeny', waitStartDate: today(), vcs: null }`, prompt dismissed
- **Risk**: The HomeScreen bank prompt and CrossCard logVirgin are separate code paths; both must check the same threshold

### CX-015: VCS set to null on promotion to waiting-for-progeny
- **Setup**: Cross `{ status: 'collecting virgins', vcs: { enabled: true, lastClearTime: '...', todayActions: [...] } }`, virginsCollected reaches threshold
- **Action**: Auto-promotion fires (via logVirgin or dashboard bank prompt)
- **Expected**: `vcs: null` in the updated cross object
- **Risk**: If only `vcs.enabled` were set to false instead of null, the VCS card would still render (filtered by `c.vcs?.enabled`)

### CX-016: waitStartDate set to today() on promotion
- **Setup**: Cross `{ status: 'collecting virgins', virginsCollected: 4 }`, `virginsPerCross = 5`
- **Action**: `logVirgin(1)` promotes the cross
- **Expected**: `waitStartDate` is set to `today()` (YYYY-MM-DD string), enabling the 9-day waiting-for-progeny countdown
- **Risk**: If `waitStartDate` were missing, the progeny countdown UI would show `NaN` or incorrect remaining days

---

## Auto-Promotion Overshoot

### CX-017: logVirgin promotes when count exceeds threshold
- **Setup**: Cross `{ status: 'collecting virgins', virginsCollected: 3 }`, `virginsPerCross = 5`
- **Action**: `logVirgin(5)` (newCount = 8)
- **Expected**: `newCount >= vTarget` is true; cross promoted with `virginsCollected: 8`
- **Risk**: The overshoot count (8) is stored but not used further; the promotion still triggers correctly

### CX-018: Dashboard +5 button overshoots from 2 collected with threshold 5
- **Setup**: Cross `{ status: 'collecting virgins', virginsCollected: 2, vcs: { enabled: true } }`, `virginsPerCross = 5`
- **Action**: User clicks `+5` in crossVcsBankPrompt (newCount = 7)
- **Expected**: Promoted to `waiting for progeny` with `virginsCollected: 7, vcs: null`
- **Risk**: None specific; the `>=` check handles overshoot

### CX-019: logVirgin with n=0 does not promote or change count
- **Setup**: Cross `{ status: 'collecting virgins', virginsCollected: 5 }`, `virginsPerCross = 5`
- **Action**: `logVirgin(0)` (newCount = 5)
- **Expected**: `newCount >= vTarget` is true (5 >= 5); cross is promoted again even though it was already at threshold. This is a potential double-promote if the cross is still in collecting-virgins state
- **Risk**: If the cross is somehow still at `collecting virgins` with `virginsCollected >= vTarget`, logging 0 would trigger promotion. UI should prevent this state.

### CX-020: logVirgin below threshold does not promote
- **Setup**: Cross `{ status: 'collecting virgins', virginsCollected: 0 }`, `virginsPerCross = 5`
- **Action**: `logVirgin(1)` (newCount = 1)
- **Expected**: Cross updated to `{ virginsCollected: 1 }`, no status change, VCS preserved
- **Risk**: None; the `else` branch runs correctly

---

## Bank Prompt Counting

### CX-021: Dashboard bank prompt shows correct X/target count
- **Setup**: Cross `{ status: 'collecting virgins', virginsCollected: 3 }`, `virginsPerCross = 5`
- **Action**: User triggers crossVcsBankPrompt for this cross
- **Expected**: Prompt displays `3/5`
- **Risk**: The template uses `c.virginsCollected || 0` and `virginsPerCross || 5`; if `virginsCollected` is `undefined`, it correctly falls back to 0

### CX-022: Dashboard bank prompt updates count after +1 without promotion
- **Setup**: Cross `{ virginsCollected: 2 }`, `virginsPerCross = 5`
- **Action**: User clicks `+1` in bank prompt
- **Expected**: Count updates to 3, toast shows `+1 virgin (3/5)`, prompt stays open
- **Risk**: The prompt reads `c.virginsCollected` from the latest `crosses` state via the map; if the prompt closed before state propagated, the count would appear stale

### CX-023: Bank prompt auto-dismisses on promotion
- **Setup**: Cross `{ virginsCollected: 4 }`, `virginsPerCross = 5`
- **Action**: User clicks `+1` in bank prompt (newCount = 5)
- **Expected**: Cross promoted, `setCrossVcsBankPrompt(null)` called, prompt disappears
- **Risk**: If `setCrossVcsBankPrompt(null)` were missing, the prompt would remain visible for a promoted cross that no longer appears in the VCS dashboard

### CX-024: Bank prompt shows 0/target for cross with undefined virginsCollected
- **Setup**: Cross `{ status: 'collecting virgins', virginsCollected: undefined }`, `virginsPerCross = 5`
- **Action**: Bank prompt rendered
- **Expected**: Shows `0/5` because `c.virginsCollected || 0` is `0`
- **Risk**: If the fallback were missing, it would show `undefined/5`

### CX-025: Bank prompt uses virginsPerCross override (non-default)
- **Setup**: Cross `{ virginsCollected: 2 }`, `virginsPerCross = 10`
- **Action**: Bank prompt rendered
- **Expected**: Shows `2/10`, promotion requires 10 virgins
- **Risk**: If `virginsPerCross` prop were not passed from App to HomeScreen, the fallback `|| 5` would apply

---

## VCS Null After Promotion

### CX-026: Advance button sets vcs to null when reaching waiting-for-progeny
- **Setup**: Cross `{ status: 'collecting virgins', vcs: { enabled: true } }`
- **Action**: `advance()` computes `ns = 'waiting for progeny'`; extra = `{ waitStartDate: today(), vcs: null }`
- **Expected**: Cross VCS is null after advance
- **Risk**: The extra for `waiting for progeny` is checked before the `collecting virgins` branch; order matters since advance goes forward

### CX-027: setStatus to waiting-for-progeny clears VCS
- **Setup**: Cross `{ status: 'collecting virgins', vcs: { enabled: true, todayActions: [3 actions] } }`
- **Action**: `setStatus('waiting for progeny')`
- **Expected**: Extra = `{ waitStartDate: today(), vcs: null }`; all VCS data discarded
- **Risk**: VCS history (todayActions) is permanently lost; no undo beyond the toast callback

### CX-028: Re-vial creates clone with vcs: null
- **Setup**: Cross `{ status: 'waiting for progeny', vcs: null }` (already promoted)
- **Action**: `revial()` creates a clone
- **Expected**: Clone has `{ status: 'waiting for progeny', waitStartDate: today(), vcs: null }`
- **Risk**: If the original cross still had VCS (edge case: manual setStatus back), the clone would correctly get `vcs: null`

### CX-029: VCS remains null through subsequent status transitions after promotion
- **Setup**: Cross promoted to `{ status: 'waiting for progeny', vcs: null }`
- **Action**: Auto-promote to `collecting progeny` after 9 days
- **Expected**: The auto-promote extra for `collecting progeny` is `{}` (no VCS assignment); VCS stays null
- **Risk**: If auto-promote logic mistakenly assigned VCS for `collecting progeny`, it would create an unwanted VCS

---

## Dashboard Appearance / Disappearance

### CX-030: Collecting-virgins cross with VCS appears in VCS dashboard
- **Setup**: Cross `{ status: 'collecting virgins', vcs: { enabled: true }, owner: 'Flo' }`, currentUser = `'Flo'`
- **Action**: VCS dashboard renders
- **Expected**: Cross included in `collectingCrosses` filter: `c.status === 'collecting virgins' && c.vcs?.enabled`
- **Risk**: If `vcs.enabled` were falsy, cross would not appear

### CX-031: Cross disappears from VCS dashboard on promotion to waiting-for-progeny
- **Setup**: Cross `{ status: 'collecting virgins', vcs: { enabled: true } }` visible in dashboard
- **Action**: Virgin count reaches threshold, cross promoted to `{ status: 'waiting for progeny', vcs: null }`
- **Expected**: Cross no longer matches `c.status === 'collecting virgins'`; removed from dashboard on next render
- **Risk**: React state update batching could cause a brief flash where the cross is promoted but still rendered in the dashboard

### CX-032: Cross in waiting-for-virgins appears in VCS section (simple card, not VCS card)
- **Setup**: Cross `{ status: 'waiting for virgins', setupDate: 3 days ago, owner: 'Flo' }`, currentUser = `'Flo'`
- **Action**: VCS dashboard renders
- **Expected**: Cross appears in `waitingCrosses` section (simple countdown card with `Xd` remaining), not in `collectingCrosses` VCS cards
- **Risk**: If `virginCrosses` filter used only `collecting virgins`, waiting crosses would be invisible in the VCS section

### CX-033: Cross with VCS but wrong status does not appear in VCS dashboard
- **Setup**: Cross `{ status: 'screening', vcs: { enabled: true } }` (stale VCS from a bug or manual edit)
- **Action**: VCS dashboard renders
- **Expected**: Cross excluded from `collectingCrosses` because `c.status !== 'collecting virgins'`; also excluded from `waitingCrosses`
- **Risk**: The stale VCS data persists in storage but is harmless; however, it wastes space and could confuse export/debug

### CX-034: Cross with status collecting-virgins but vcs.enabled = false does not appear
- **Setup**: Cross `{ status: 'collecting virgins', vcs: { enabled: false } }`
- **Action**: VCS dashboard renders
- **Expected**: `c.vcs?.enabled` is false; cross excluded from `collectingCrosses`. However, the backfill useEffect checks `!c.vcs` not `!c.vcs?.enabled`, so it will NOT overwrite the disabled VCS
- **Risk**: Cross stuck in collecting-virgins with no VCS card and no backfill -- user must manually fix

### CX-035: Cross owned by another user excluded from VCS dashboard
- **Setup**: Cross `{ status: 'collecting virgins', vcs: { enabled: true }, owner: 'Bella' }`, currentUser = `'Flo'`
- **Action**: VCS dashboard renders
- **Expected**: `myCrosses` filter excludes it (`c.owner === 'Bella' !== 'Flo'`), so it never reaches `virginCrosses`
- **Risk**: None; the owner filter is at the top level

### CX-036: Cross with no owner appears in all users' VCS dashboards
- **Setup**: Cross `{ status: 'collecting virgins', vcs: { enabled: true }, owner: undefined }`
- **Action**: VCS dashboard renders for any user
- **Expected**: `!c.owner || c.owner === currentUser` -- since `!undefined` is true, cross appears for every user
- **Risk**: Multiple users could log actions on the same cross VCS, causing conflicts

---

## Multiple Crosses Collecting Simultaneously

### CX-037: Two crosses in collecting-virgins sorted by VCS urgency
- **Setup**: Cross A `{ vcs: { ... status red } }`, Cross B `{ vcs: { ... status green } }`, both `status: 'collecting virgins'`
- **Action**: VCS dashboard renders and sorts
- **Expected**: Cross A (red) appears before Cross B (green); sort order: `{ red: 0, yellow: 1, green: 2 }`
- **Risk**: If both have same status, secondary sort by `suggestedMs` applies; ties go to Infinity

### CX-038: logCrossAction targets correct cross when multiple are active
- **Setup**: Cross A (id: `'c1'`) and Cross B (id: `'c2'`), both collecting virgins with VCS
- **Action**: User clicks collect on Cross A's VCS card
- **Expected**: `logCrossAction('c1', ...)` finds cross A via `crosses.find(x => x.id === 'c1')`, updates only that cross's VCS
- **Risk**: If `setCrosses` map callback had a bug, it could update the wrong cross; the `.map(x => x.id === crossId ? ...)` pattern is safe

### CX-039: Bank prompt for cross A does not affect cross B
- **Setup**: Cross A with `crossVcsBankPrompt = { crossId: 'c1' }`, Cross B (id: `'c2'`) also in collecting-virgins
- **Action**: User clicks `+1` in Cross A's bank prompt
- **Expected**: Only Cross A's `virginsCollected` incremented; Cross B unchanged. Bank prompt rendered only for `crossVcsBankPrompt?.crossId === c.id`
- **Risk**: If `crossVcsBankPrompt` stored the wrong crossId, the wrong cross would get the increment

### CX-040: Promoting one cross does not affect other collecting crosses
- **Setup**: Cross A `{ virginsCollected: 4 }` and Cross B `{ virginsCollected: 2 }`, both collecting, `virginsPerCross = 5`
- **Action**: Cross A gets `+1` via bank prompt (promoted)
- **Expected**: Cross A becomes `waiting for progeny, vcs: null`; Cross B remains `collecting virgins` with VCS intact and `virginsCollected: 2`
- **Risk**: If `setCrosses` replaced the entire array instead of mapping, other crosses could be affected

---

## Cross With VCS But Wrong Status

### CX-041: Cross in done status with stale VCS object
- **Setup**: Cross `{ status: 'done', vcs: { enabled: true, lastClearTime: '...' } }`
- **Action**: App renders; notifications useEffect runs
- **Expected**: Notifications filter uses `c.status === 'collecting virgins'` so this cross is excluded. VCS dashboard also excludes it. Backfill does not touch it (wrong status). VCS data persists but is inert.
- **Risk**: Stale VCS data inflates localStorage/Supabase row size but causes no functional issues

### CX-042: Cross in set-up status with VCS (created via manual edit/import)
- **Setup**: Cross `{ status: 'set up', vcs: { enabled: true } }`
- **Action**: VCS dashboard renders
- **Expected**: Not shown in VCS dashboard (status is not `collecting virgins`). Not affected by backfill (wrong status).
- **Risk**: If user advances this cross to `collecting virgins` via advance(), the `ns === 'collecting virgins'` branch would add a new VCS, but `setStatus` would check `!cross.vcs` and skip since VCS exists

### CX-043: Cross moved backward from collecting-virgins to waiting-for-virgins via setStatus
- **Setup**: Cross `{ status: 'collecting virgins', vcs: { enabled: true, todayActions: [...] } }`
- **Action**: User manually `setStatus('waiting for virgins')`
- **Expected**: Status changes; `setStatus` extra for `waiting for virgins` is `{}`, so VCS is preserved. Cross disappears from VCS dashboard (wrong status). When it auto-promotes back to `collecting virgins`, the auto-promote creates a new VCS (overwriting the old one).
- **Risk**: The old VCS with stale todayActions is lost on re-promotion. If the user manually sets back to `collecting virgins` via setStatus, the existing VCS is preserved (because `!cross.vcs` is false).

---

## Cross Without VCS in Collecting Status

### CX-044: Cross in collecting-virgins with vcs: null (pre-backfill state)
- **Setup**: Cross loaded from Supabase with `{ status: 'collecting virgins', vcs: null }` (e.g., created by old app version)
- **Action**: HomeScreen mounts, backfill runs
- **Expected**: Backfill creates VCS with `overnightAt18 !== false` default (true), schedule `18_2`
- **Risk**: `lastClearTime` is set to `now` by `makeVcs`, which may not reflect the actual last clear time for a cross that has been collecting for days

### CX-045: Cross in collecting-virgins with vcs: undefined (missing field)
- **Setup**: Cross `{ status: 'collecting virgins' }` -- no `vcs` field at all
- **Action**: HomeScreen mounts, backfill filter checks `!c.vcs` -- `!undefined` is true
- **Expected**: Backfill assigns VCS. `c.vcs?.enabled` in dashboard would have been `undefined` before backfill, so cross would be invisible until backfill fires.
- **Risk**: Brief render between mount and backfill useEffect where cross is in collecting-virgins but not shown in VCS dashboard

---

## overnightAt18 Default Behavior

### CX-046: overnightAt18 defaults to true in NewCrossWizard
- **Setup**: User creates a new cross without toggling the overnight button
- **Action**: `finish()` in NewCrossWizard, `overnightAt18` state initialized to `true`
- **Expected**: Cross created with `overnightAt18: true`. When later promoted to collecting-virgins, VCS gets 18C schedule (16h window, morning collect)
- **Risk**: If default changed to `false`, users would get 8h windows unexpectedly

### CX-047: overnightAt18 not set produces 18C VCS via !== false check
- **Setup**: Cross `{ status: 'collecting virgins', overnightAt18: undefined }` (field missing from old data)
- **Action**: Backfill runs: `const o18 = c.overnightAt18 !== false` evaluates to `true`
- **Expected**: VCS created with `overnightAt18: true`, schedule `18_2`
- **Risk**: This is the desired default, but it's implicit. A cross created at RT might get 18C VCS if `overnightAt18` was never explicitly set to `false`.

### CX-048: overnightAt18 = true produces correct VCS schedule parameters
- **Setup**: Cross with `overnightAt18: true`
- **Action**: VCS created via `makeVcs(true, 2, VCS_DEFAULTS['18_2'])`
- **Expected**: VCS has `overnightAt18: true`, `collectionsPerDay: 2`, schedule `{ eveningClear: '17:30', morningCollect: '09:30', middayCollect: null, afternoonCollect: '17:00' }`. Virgin window = 16h. Morning action is `collect` (not `clear_discard`).
- **Risk**: If `VCS_DEFAULTS['18_2']` were missing or had wrong values, the schedule would be incorrect

---

## virginsPerCross Override

### CX-049: Custom virginsPerCross of 10 delays promotion
- **Setup**: Cross `{ status: 'collecting virgins', virginsCollected: 7 }`, `virginsPerCross = 10`
- **Action**: `logVirgin(1)` (newCount = 8)
- **Expected**: `8 < 10`, no promotion. Cross stays collecting-virgins with `virginsCollected: 8`
- **Risk**: If the CrossCard reads `virginsPerCross` from a stale prop while Settings updates it, the threshold could be inconsistent between the card and the dashboard prompt

---

## Cross VCS Consistency With Stock VCS

### CX-050: Cross VCS uses identical computeNextActions engine as stock VCS
- **Setup**: Cross `{ status: 'collecting virgins', vcs: { enabled: true, overnightAt18: true, collectionsPerDay: 2, schedule: VCS_DEFAULTS['18_2'], lastClearTime: '2026-03-26T17:30:00Z', lastClearTemp: '18', todayActions: [] } }`
- **Action**: `computeNextActions(cross.vcs, now)` called from VCS dashboard
- **Expected**: Returns the same action sequence as a stock with identical VCS config: evening clear (auto-done), morning collect, afternoon collect+clear. Same deadline computation, same grace period, same overdue/skip logic.
- **Risk**: Cross VCS and stock VCS share the same `computeNextActions` function from `vcs.js`, so they are guaranteed consistent. However, the logAction wrappers differ: `logCrossAction` (HomeScreen inline) vs `logAction` (stock VCS), and any divergence in how they update `todayActions`, `lastClearTime`, or `lastClearTemp` would break consistency. Both paths must set `lastClearTime` on clear, reset `todayActions` to `[action]` on clear, and preserve `lastClearTemp`.
