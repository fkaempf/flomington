# Test Cases: Debounce, Double-Tap Protection, and Input Validation (VCS System)

Proposed fix: `useState`-based debounce with 500ms guard on all VCS action buttons. Buttons disabled + `opacity: 0.5` during debounce window.

Scope: `logAction` / `logCrossAction` buttons (clear, collect, clear_discard, collect_clear), 18C confirmation Yes/No buttons, bank prompt +1/+3/+5 buttons, `parseHHMM` NaN guard, `virginDeadline` removal, cycle-aware `doneCount`.

---

## Single Click Baseline

### DB-001 — Single click on Collect button logs exactly one action
- **Setup**: Stock VCS enabled, 25C, 2x/day. Next action is "collect" (morning), within 20min window.
- **Action**: Click "Collected" once. Wait 1s.
- **Expected**: Exactly 1 `collect` action in `todayActions`. Button becomes disabled with opacity 0.5 for 500ms, then re-enables. Toast shows "StockName: Collected".
- **Risk**: Without debounce, even a single click could fire multiple React synthetic events if the handler is slow.

### DB-002 — Single click on Clear button logs exactly one action
- **Setup**: Stock VCS enabled, 25C, 2x/day. Next action is "clear" (evening), within 20min window.
- **Action**: Click "Mark Cleared" once. Wait 1s.
- **Expected**: Exactly 1 `clear` action logged. `lastClearTime` updated once. `todayActions` reset to `[action]`. Button disabled 500ms.
- **Risk**: Clear resets `todayActions` to `[action]` -- double-fire would produce `[action]` twice or lose the first.

### DB-003 — Single click on Clear & Discard button logs exactly one action
- **Setup**: Stock VCS enabled, window expired (past deadline + 30min grace). "Clear & Discard" visible.
- **Action**: Click "Clear & Discard" once.
- **Expected**: 1 `clear_discard` action. `lastClearTime` updated. `todayActions` reset to `[action]`.
- **Risk**: `clear_discard` triggers both clear reset AND discard -- double-fire could corrupt state.

### DB-004 — Single click on Collect + Clear button logs exactly one action
- **Setup**: Stock VCS 18C, 2x/day. Next action is "collect_clear" (afternoon), within 20min. `overnightAt18` true, key is "evening".
- **Action**: Click "Collect + Clear" once.
- **Expected**: 18C confirm prompt appears. No action logged yet. Button disabled 500ms.
- **Risk**: Without debounce, prompt could open twice creating duplicate state.

---

## Double-Click Protection (<100ms)

### DB-005 — Double-click <50ms on Collect button logs only one action
- **Setup**: Stock VCS enabled, 25C, next action "collect" within window.
- **Action**: Double-click "Collected" with <50ms between clicks (natural mouse double-click).
- **Expected**: 1 collect action in `todayActions`. Second click ignored (button disabled). Toast fires once.
- **Risk**: Pre-fix: 2 actions logged, bank prompt opens then immediately reopens, virgin count double-incremented.

### DB-006 — Double-click <50ms on Clear button does not double-reset todayActions
- **Setup**: Stock VCS with 2 existing actions in `todayActions` (morning collect done, midday collect done). Next action is "clear" (evening).
- **Action**: Double-click "Mark Cleared" <50ms apart.
- **Expected**: `todayActions` reset to `[clearAction]` once. `lastClearTime` set once. Not `[clearAction, clearAction]`.
- **Risk**: Double clear could produce `todayActions = [action]` then immediately `[action2]`, losing the first clear's timestamp context.

### DB-007 — Double-click <50ms on Clear & Discard in expired state
- **Setup**: VCS window expired. Single "Clear & Discard" button showing.
- **Action**: Double-click <50ms.
- **Expected**: 1 `clear_discard` logged. Second click blocked by disabled state.
- **Risk**: Two clears could set `lastClearTime` to two different ISO timestamps milliseconds apart, confusing cycle calculation.

### DB-008 — Double-click <50ms on Collect (late) during grace period
- **Setup**: VCS in grace period (past deadline, within +30min). "Collect (late)" and "Discard" buttons visible.
- **Action**: Double-click "Collect (late)" <50ms.
- **Expected**: 1 collect logged. Bank prompt opens once. Virgin count incremented once (if bank prompt +N clicked later).
- **Risk**: Double collect + double bank prompt open = duplicate toast "Collected" and prompt flicker.

---

## Boundary Timing (500ms debounce window)

### DB-009 — Second click at exactly 499ms is still blocked
- **Setup**: Stock VCS, next action "collect" within window.
- **Action**: Click "Collected" at t=0. Click again at t=499ms.
- **Expected**: Only 1 action logged. Second click hits disabled state.
- **Risk**: Off-by-one in `Date.now() - lastClickTime < 500` vs `<= 500`.

### DB-010 — Second click at exactly 500ms is allowed
- **Setup**: Stock VCS, next action "collect" within window. After first click, the VCS engine recalculates and the same button may still be visible (e.g., if the action was a collect but another collect is next).
- **Action**: Click "Collected" at t=0. Click again at t=500ms.
- **Expected**: If the button is still visible and enabled (VCS has another pending action of same type), the second click registers. If the action already advanced, button may have changed.
- **Risk**: Debounce guard uses `>=` vs `>` for the 500ms boundary.

### DB-011 — Second click at 501ms after debounce expires
- **Setup**: Stock VCS, next action "collect" within window.
- **Action**: Click at t=0, wait 501ms, click again.
- **Expected**: Both clicks process (if button still present and VCS state still shows a pending action). 2 total actions if applicable.
- **Risk**: Button might have disappeared after first action completed all pending work.

### DB-012 — Click during debounce then click after debounce expires
- **Setup**: Stock VCS, next action "collect" within window.
- **Action**: Click at t=0 (succeeds). Click at t=200ms (blocked). Click at t=600ms.
- **Expected**: Actions at t=0 and t=600ms both process (if second action available). t=200ms click silently ignored.
- **Risk**: The t=200ms blocked click could reset the debounce timer, extending the lockout to t=700ms.

---

## Triple and Rapid Clicks

### DB-013 — Triple click <100ms on Collect button
- **Setup**: Stock VCS, next action "collect".
- **Action**: Three clicks in rapid succession (<100ms total).
- **Expected**: Exactly 1 action logged. Clicks 2 and 3 blocked by disabled state.
- **Risk**: React batching could process all three in same render cycle before `disabled` state takes effect.

### DB-014 — Five rapid clicks on Clear & Discard
- **Setup**: VCS expired state.
- **Action**: Five clicks within 200ms.
- **Expected**: 1 `clear_discard` logged. `lastClearTime` set once.
- **Risk**: Race condition where `setStocks` from click 1 hasn't committed when click 2 reads old state.

### DB-015 — Rapid clicks during React state batching
- **Setup**: Stock VCS, "Collected" button visible. Intentionally slow render (React concurrent mode).
- **Action**: 10 clicks within 500ms.
- **Expected**: Exactly 1 action. Debounce guard fires synchronously before any async state update.
- **Risk**: If debounce relies on `useState` and the state update is batched, the guard may not be set before click 2 arrives. Must use `useRef` for the timestamp or `useState` with functional update.

---

## Alternating Between Different Buttons

### DB-016 — Click Collect then immediately click Clear (<100ms)
- **Setup**: Stock VCS, next action is "collect_clear" showing both "Collect + Clear" and standalone "Clear" buttons.
- **Action**: Click "Collect + Clear" at t=0. Click "Clear" at t=50ms.
- **Expected**: Only 1 action logged (the collect+clear). Clear button is also disabled during debounce.
- **Risk**: If debounce is per-button rather than global, the Clear button could fire independently.

### DB-017 — Click Collect (late) then immediately click Discard during grace period
- **Setup**: VCS in grace period. Both "Collect (late)" and "Discard" visible.
- **Action**: Click "Collect (late)" at t=0. Click "Discard" at t=80ms.
- **Expected**: Only collect fires. Discard blocked by global debounce.
- **Risk**: Without global debounce, both actions fire -- collecting AND discarding in the same cycle, corrupting state.

### DB-018 — Click Clear on stock A then immediately click Clear on stock B
- **Setup**: Two VCS stocks both showing "Mark Cleared" buttons in the dashboard.
- **Action**: Click stock A's "Mark Cleared" at t=0. Click stock B's "Mark Cleared" at t=100ms.
- **Expected**: Both actions fire. Debounce is per-stock (or per-card), not global across all stocks.
- **Risk**: If debounce is accidentally global, legitimate actions on different stocks are blocked.

### DB-019 — Click Collect on cross-VCS then immediately click Collect on stock-VCS
- **Setup**: Cross-VCS card showing "Collected" and stock-VCS card showing "Collected" in the same dashboard.
- **Action**: Click cross "Collected" at t=0. Click stock "Collected" at t=100ms.
- **Expected**: Both fire independently. They operate on different entities (cross vs stock).
- **Risk**: Shared debounce state between `logCrossAction` and `logAction` could block the second.

### DB-020 — Alternating Collect and Clear on same stock within debounce window
- **Setup**: Stock VCS shows "Collected" and "Clear" side by side (collect_clear next action).
- **Action**: Click "Collected" at t=0, "Clear" at t=100ms, "Collected" at t=200ms, "Clear" at t=300ms.
- **Expected**: Only the first click fires (whichever it was). All subsequent within 500ms blocked.
- **Risk**: Alternating button identity could confuse per-button debounce.

---

## 18C Confirmation Dialog Debounce

### DB-021 — Double-click "Yes, 18C" in stock 18C confirmation
- **Setup**: Stock VCS 18C. User clicked "Mark Cleared", 18C confirm prompt is visible with "Yes, 18C" and "No, RT" buttons.
- **Action**: Double-click "Yes, 18C" <50ms.
- **Expected**: 1 clear action with temp='18'. Prompt closes once. `setVcs18Confirm(null)` called once.
- **Risk**: Double-fire logs 2 clears, second `setVcs18Confirm(null)` is harmless but the action is duplicated.

### DB-022 — Double-click "No, RT" in stock 18C confirmation
- **Setup**: Stock VCS 18C confirm prompt visible.
- **Action**: Double-click "No, RT" <50ms.
- **Expected**: 1 clear action with temp='25'. Prompt dismissed once.
- **Risk**: Same as DB-021 but with RT temperature.

### DB-023 — Click "Yes, 18C" then "No, RT" within 100ms
- **Setup**: Cross-VCS 18C confirm prompt visible (crossVcs18Confirm set).
- **Action**: Click "Yes, 18C" at t=0, click "No, RT" at t=80ms.
- **Expected**: Only "Yes, 18C" fires. Second click blocked by debounce.
- **Risk**: Both fire -- two actions logged with conflicting temperatures (18 then 25), confusing cycle detection.

### DB-024 — Click "No, RT" then "Yes, 18C" within 100ms
- **Setup**: Stock VCS 18C confirm prompt visible.
- **Action**: Click "No, RT" at t=0, click "Yes, 18C" at t=80ms.
- **Expected**: Only "No, RT" fires with temp='25'.
- **Risk**: Reverse of DB-023 -- conflicting temperatures.

### DB-025 — 18C confirm appears, user clicks Yes after 600ms (beyond debounce of parent button)
- **Setup**: User clicked "Mark Cleared" (which triggered 18C confirm). 600ms pass. User clicks "Yes, 18C".
- **Action**: "Mark Cleared" at t=0 (opens prompt, no action logged). "Yes, 18C" at t=600ms.
- **Expected**: "Yes, 18C" fires normally. Clear with temp='18' logged. The 500ms debounce from the parent "Mark Cleared" button should not affect the confirmation button's debounce.
- **Risk**: Parent button debounce could leak into child prompt buttons if they share state.

### DB-026 — Cross-VCS 18C confirm with withCollect flag -- double-click Yes
- **Setup**: Cross-VCS 18C, next action is "collect_clear" at evening. User clicked "Collect + Clear", which sets both `crossVcsBankPrompt` and `crossVcs18Confirm` with `withCollect: true`.
- **Action**: Double-click "Yes, 18C" <50ms.
- **Expected**: 1 `clear` action with temp='18'. Bank prompt remains open for virgin logging. Confirm prompt closes.
- **Risk**: Double-fire logs 2 clears with the `withCollect` path, double-resetting `todayActions`.

---

## Bank Prompt Button Debounce

### DB-027 — Double-click +1 on stock virgin bank prompt
- **Setup**: Stock VCS bank prompt open. Current bank: `virginBank[stockId] = 3`.
- **Action**: Double-click "+1" <50ms.
- **Expected**: Bank incremented by 1 (to 4), not 2. Toast fires once: "+1 virgins banked for StockName".
- **Risk**: Without debounce, bank goes to 5, overcounting virgins.

### DB-028 — Double-click +5 on stock virgin bank prompt
- **Setup**: Stock VCS bank prompt open. Current bank: 0.
- **Action**: Double-click "+5" <50ms.
- **Expected**: Bank = 5, not 10. Single toast.
- **Risk**: Double-fire adds 10 virgins, severely overcounting.

### DB-029 — Triple-click +3 on cross virgin log prompt
- **Setup**: Cross in "collecting virgins", cross-VCS bank prompt open. `virginsCollected = 2`, `virginsPerCross = 5`.
- **Action**: Triple-click "+3" <100ms.
- **Expected**: `virginsCollected` goes from 2 to 5 (hitting target). Status auto-advances to "waiting for progeny". Only 1 advance, not 3 attempts.
- **Risk**: Triple-fire: first +3 -> 5 (advance), second +3 -> 8 on now-waiting-for-progeny cross (invalid), third +3 -> 11. Virgin count corrupted.

### DB-030 — Click +1 then +5 on bank prompt within 100ms
- **Setup**: Stock VCS bank prompt. Bank = 0.
- **Action**: Click "+1" at t=0, click "+5" at t=80ms.
- **Expected**: Bank = 1 (only +1 fires). +5 blocked by debounce.
- **Risk**: Both fire, bank = 6.

### DB-031 — Click +5 then Done on cross bank prompt within 100ms
- **Setup**: Cross VCS bank prompt open. `virginsCollected = 0`.
- **Action**: Click "+5" at t=0, click "Done" at t=80ms.
- **Expected**: +5 fires (virginsCollected = 5, status advances to waiting for progeny). Done button blocked by debounce. Prompt auto-closes via `setCrossVcsBankPrompt(null)` from the target-reached path.
- **Risk**: Both fire -- +5 advances status, then Done tries to close an already-null prompt.

### DB-032 — Cross bank prompt +1 click right at virginsPerCross threshold
- **Setup**: Cross VCS, `virginsCollected = 4`, `virginsPerCross = 5`. Bank prompt open.
- **Action**: Click "+1" once.
- **Expected**: `virginsCollected = 5`. Status advances to "waiting for progeny". `vcs` set to null. Toast: "5 virgins collected -> waiting for progeny". Prompt closes.
- **Risk**: Status advance + VCS nullification in one update. If debounce fails and a second click arrives, it tries to increment on a cross that no longer has VCS.

### DB-033 — Bank prompt +3 overshoots virginsPerCross target
- **Setup**: Cross VCS, `virginsCollected = 4`, `virginsPerCross = 5`. Bank prompt open.
- **Action**: Click "+3" once.
- **Expected**: `virginsCollected = 7` (overshoot is allowed in current code: `newCount >= vTarget` triggers advance). Status advances. Count stored as 7.
- **Risk**: This is expected behavior, but with double-click it would be +6, further inflating count.

---

## Mobile Touch Events

### DB-034 — Mobile touchstart + click event pair on Collect
- **Setup**: Mobile Safari / Chrome Android. VCS stock, "Collected" button visible.
- **Action**: Tap "Collected" once on touchscreen. Browser fires touchstart -> touchend -> click (300ms delay on some browsers, 0ms with `touch-action: manipulation`).
- **Expected**: 1 action logged. The touchstart and click event pair should not be treated as two separate clicks.
- **Risk**: If onClick fires twice (once for touch, once for synthesized click), 2 actions logged. CSS `touch-action: manipulation` and debounce together prevent this.

### DB-035 — Mobile double-tap on 18C "Yes" button
- **Setup**: Mobile device. Cross-VCS 18C confirm prompt visible.
- **Action**: Double-tap "Yes, 18C" (iOS double-tap ~300ms apart).
- **Expected**: 1 clear action logged. iOS double-tap zoom should be prevented by viewport meta. Second tap blocked by debounce.
- **Risk**: iOS zoom gesture intercepts first tap, then second tap fires the action, or both fire.

### DB-036 — Mobile long-press then release on bank +5 button
- **Setup**: Mobile device. Stock VCS bank prompt open.
- **Action**: Long-press "+5" for 800ms then release.
- **Expected**: 1 action fires on the click event (or touchend). No context menu interference. Bank +5.
- **Risk**: Long-press might trigger context menu on Android. If touchend and click both fire after long-press, could double-count.

### DB-037 — Mobile scroll-then-tap on VCS action button
- **Setup**: Mobile device. VCS dashboard scrollable. User scrolls, finger lands on "Collected" button.
- **Action**: Scroll gesture that ends on button, followed by intentional tap.
- **Expected**: Scroll does not trigger button action. Subsequent deliberate tap fires once.
- **Risk**: `touchstart` on scroll could register as button interaction.

---

## Debounce State Lifecycle

### DB-038 — Debounce resets after component unmount/remount
- **Setup**: Stock VCS, user clicks "Collected" (debounce starts). User navigates away from HomeScreen, then back within 500ms.
- **Action**: Click "Collected" again immediately after returning.
- **Expected**: If component remounted, debounce state is fresh -- click fires. If component stayed mounted (tab-based routing), debounce may still be active.
- **Risk**: `useState` debounce resets on unmount, `useRef` persists until unmount. Navigation timing determines behavior.

### DB-039 — Debounce state is independent per VCS card
- **Setup**: Three stock-VCS cards in dashboard, all showing "Collected" buttons.
- **Action**: Click stock A "Collected" at t=0. Click stock B "Collected" at t=100ms. Click stock C "Collected" at t=200ms.
- **Expected**: All three fire independently. Each card has its own debounce state.
- **Risk**: If debounce is a single `useState` in HomeScreen parent, all three cards share it and B/C are blocked.

### DB-040 — Disabled visual state matches debounce timing
- **Setup**: Stock VCS, "Collected" button visible.
- **Action**: Click "Collected". Observe button for 500ms.
- **Expected**: Button immediately gets `opacity: 0.5` and `disabled` attribute at t=0. At t=500ms, opacity returns to 1.0 and `disabled` is removed (if button is still rendered).
- **Risk**: Visual feedback and actual debounce guard out of sync -- button looks enabled but debounce still active, or vice versa.

### DB-041 — Debounce does not block different action types after clear changes next action
- **Setup**: Stock VCS, next action is "clear" (evening). User clicks "Mark Cleared". After clear, next action recalculates to "collect" (morning, if overnight 18C).
- **Action**: Click "Mark Cleared" at t=0. VCS recalculates. At t=600ms "Collected" button appears. Click "Collected".
- **Expected**: Both actions fire. Debounce from "Mark Cleared" has expired by t=600ms. New "Collected" button has fresh debounce.
- **Risk**: Debounce timer from first button leaks to newly rendered second button.

---

## parseHHMM NaN Guard

### DB-042 — parseHHMM with "abc" returns null (NaN guard)
- **Setup**: VCS schedule has `eveningClear: "abc"`.
- **Action**: `computeNextActions` calls `parseHHMM("abc")`.
- **Expected**: With NaN guard: returns `null` (or `NaN` is detected and action is skipped via `if (schedMins === null) continue`). Without guard: `"abc".split(':').map(Number)` -> `[NaN, NaN]` -> `NaN * 60 + NaN` -> `NaN`, which would produce NaN `suggestedMs` and corrupt sorting.
- **Risk**: NaN propagates into `suggestedMs`, `timeUntilMs`, sorting comparisons. `result.sort()` with NaN values produces undefined order.

### DB-043 — parseHHMM with empty string returns null
- **Setup**: VCS schedule has `morningCollect: ""`.
- **Action**: `computeNextActions` processes this action.
- **Expected**: `parseHHMM("")` returns `null` (existing guard: `if (!s) return null`). Action skipped by `if (schedMins === null) continue`.
- **Risk**: Empty string is already guarded by `if (!s)`. No change needed. This is a regression test.

### DB-044 — parseHHMM with null value returns null
- **Setup**: VCS schedule has `middayCollect: null` (standard for 2x/day schedule).
- **Action**: `computeNextActions` checks `if (collectionsPerDay === 3 && schedule.middayCollect)` -- this guard prevents null from reaching `parseHHMM`.
- **Expected**: Midday action is never added to the actions array. `parseHHMM` never called with null.
- **Risk**: If the guard is removed or bypassed, `parseHHMM(null)` -> `null` (safe, existing guard). Double-safe.

### DB-045 — parseHHMM with "25:99" (out-of-range time)
- **Setup**: VCS schedule manually edited to `eveningClear: "25:99"`.
- **Action**: `parseHHMM("25:99")` -> `25 * 60 + 99` = `1599` minutes = 26h39m.
- **Expected**: With NaN guard only: returns 1599 (not NaN, so guard doesn't catch it). `suggestedMs` placed at 26h39m after midnight, effectively next day. Action may appear out of order.
- **Risk**: NaN guard does not catch out-of-range values. Separate range validation needed if this is a concern. Currently no user-facing schedule editor allows this.

### DB-046 — parseHHMM with "12:30" (valid input, baseline)
- **Setup**: Standard VCS schedule, `afternoonCollect: "12:30"`.
- **Action**: `parseHHMM("12:30")` -> `12 * 60 + 30` = `750`.
- **Expected**: Returns 750. Used correctly in `suggestedMs` calculation.
- **Risk**: None. Baseline correctness check.

---

## Null / Missing Schedule Fields

### DB-047 — Null schedule object in VCS
- **Setup**: Stock VCS where `vcs.schedule` is `null` (corrupted data or migration artifact).
- **Action**: `computeNextActions` destructures `schedule` from `vcs` -> `null`. Accessing `schedule.eveningClear` throws.
- **Expected**: Should gracefully handle null schedule. Either return empty actions array or guard with `if (!schedule) return []`.
- **Risk**: Uncaught TypeError crashes the VCS dashboard rendering, breaking the entire HomeScreen.

### DB-048 — Missing individual schedule field (afternoonCollect undefined)
- **Setup**: Stock VCS with `schedule: { eveningClear: "18:00", morningCollect: "09:00" }` -- missing `afternoonCollect`.
- **Action**: `computeNextActions` creates afternoon action with `scheduled: undefined`. `parseHHMM(undefined)` -> `null`. `if (schedMins === null) continue` skips it.
- **Expected**: Afternoon action skipped. Other actions computed normally.
- **Risk**: Gracefully handled by existing null check in `parseHHMM`. Missing field produces fewer actions but no crash.

### DB-049 — VCS enabled but all schedule times are undefined
- **Setup**: `vcs: { enabled: true, schedule: {}, lastClearTime: "...", todayActions: [] }`.
- **Action**: `computeNextActions` builds actions array with all `scheduled: undefined`. Every action skipped by `parseHHMM` returning null.
- **Expected**: Returns empty array. `getVcsStatus` returns 'green' (no pending actions). Dashboard shows "All done for this window".
- **Risk**: User sees "all done" but actually nothing is configured. No visual warning that schedule is empty. UX issue, not a crash.

---

## virginDeadline Removal and Cycle-Aware doneCount

### DB-050 — doneCount uses cycle-aware helper instead of flat todayActions filter
- **Setup**: Stock VCS, 18C, 2x/day. `todayActions` contains: `[{ type: 'clear', key: 'evening', time: T1 }, { type: 'collect', key: 'morning', time: T2 }, { type: 'collect', key: 'afternoon', time: T3 }]` where T1 is from the previous cycle (before last clear) and T2, T3 are from the current cycle.
- **Action**: Dashboard renders `doneCount/totalCollects` badge (e.g., "1/2" or "2/2").
- **Expected**: With cycle-aware helper: `doneCount` only counts collects where `actionTime >= lastClearTime`. If T1 < lastClearTime, it is excluded. Only T2 and T3 count (both from current cycle). Display: "2/2". Pre-fix flat filter `(v.todayActions || []).filter(a => a.type === 'collect').length` would count all three if T1.type were 'collect', producing "3/2".
- **Risk**: After a clear resets `todayActions` to `[clearAction]`, old actions from pre-clear are gone. But if `todayActions` is not reset (e.g., `collect_clear` type), stale collects from previous window inflate the count. The cycle-aware helper must filter by `time >= lastClearTime`.
