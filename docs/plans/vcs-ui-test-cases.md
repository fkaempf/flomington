# VCS UI Display, Progress Bars, and Sorting -- Test Cases

50 test cases for the VCS system's visual rendering, progress bar behavior, and sort ordering.

---

## Status Dot Colors

### UI-001: Green status dot when next action is >30min away
- **Setup**: 1 VCS stock, `lastClearTime` = 2h ago at 25C, `eveningClear` = 17:30, `morningCollect` = 09:00, `afternoonCollect` = 14:30. Current time such that next action is ~4h away. `todayActions` = [evening done].
- **Expected**: Card shows green dot (`#5eead4`), green border (`rgba(94,234,212,0.2)`). Status message: "Done for now - next: [time]" in green.
- **Risk**: `getVcsStatus` could miscompute `timeUntilMs` if `suggestedMs` calculation crosses a day boundary, returning yellow instead of green.

### UI-002: Yellow status dot when next action is <30min away
- **Setup**: 1 VCS stock at 25C, `lastClearTime` = 5h ago, next scheduled action is in 20min. No overdue, no grace period.
- **Expected**: Yellow dot (`#eab308`), yellow border (`rgba(234,179,8,0.3)`). Status message shows action label with time, text color `#eab308`. Action buttons visible (within 20min threshold).
- **Risk**: The 30min yellow threshold in `getVcsStatus` and the 20min button-visibility threshold are different values; status could be yellow but buttons still hidden if time is between 20-30min.

### UI-003: Yellow status dot when action is overdue but not past deadline
- **Setup**: 1 VCS stock at 25C. Next action scheduled time has passed by 45min, but still within the 8h virgin window. `isOverdue = true`, `isPastDeadline = false`, `isInGracePeriod = false`.
- **Expected**: Yellow dot. Status text: "OVERDUE: [label] - [time] ([duration] ago)" in red (`#ef4444`). Action buttons visible.
- **Risk**: Status dot is yellow per `getVcsStatus` but the status message text is red because it checks `next.isOverdue` separately. This mismatch could confuse users; test must confirm both renderings are intentional.

### UI-004: Red status dot when in grace period
- **Setup**: 1 VCS stock at 25C, `lastClearTime` = 8h 15min ago (past 8h window but within +30min grace). `isInGracePeriod = true`.
- **Expected**: Red dot (`#ef4444`), red border. Status: "LATE - collect now or discard" in yellow (`#eab308`). Two buttons: "Collect (late)" + "Discard".
- **Risk**: The grace period message is yellow but the dot is red. If `isInGracePeriod` is miscalculated due to `lastClearTemp` being null, the fallback check in the rendering (`deadline && now > new Date(deadline)`) might not match.

### UI-005: Red status dot when past deadline + grace
- **Setup**: 1 VCS stock at 25C, `lastClearTime` = 9h ago (past 8h window + 30min grace). `isPastDeadline = true`.
- **Expected**: Red dot, red border. Status: "Expired - clear & discard" in red, bold. Single button: "Clear & Discard" in red.
- **Risk**: If `todayActions` contains stale actions from a prior cycle that didn't get cleared, `computeNextActions` may return empty (all done) and `getVcsStatus` returns green instead of red.

### UI-006: Green status dot when all actions completed for window
- **Setup**: 1 VCS stock at 25C with 2 collections/day. All 3 non-evening actions marked done in `todayActions` (morning, afternoon). Still within 8h window.
- **Expected**: Green dot. Status: "All done for this window" in green. No action buttons. Progress bar at ~100% (time-based, near deadline).
- **Risk**: If `computeNextActions` returns empty array, `getVcsStatus` returns `'green'`. But `vcsWindowProgress` falls back to the full 8h window calculation, so progress bar might show unexpected value.

### UI-007: 18C stock green status dot with 16h window
- **Setup**: 1 VCS stock at 18C (`overnightAt18 = true`), `lastClearTime` = 4h ago. Next morning collect is 12h away.
- **Expected**: Green dot. Badge shows "18C" temperature. Progress bar fill very small (~25% of way to next action). Status message indicates next action time.
- **Risk**: `getVirginWindowH(true)` returns 16, but progress tracks to next action not to 16h window. If next action is correctly computed, progress should reflect distance to that action, not the full 16h.

---

## Progress Bar Rendering

### UI-008: Progress bar at 0% immediately after clear
- **Setup**: 1 VCS stock, `lastClearTime` = now (just cleared). Next action is 5h away.
- **Expected**: Progress bar visible, width = "0%". Bar color green (`#5eead4`). Left label: "Cleared [current time]". Right label: "Next [action time]".
- **Risk**: `vcsWindowProgress` computes `(nowMs - clearMs) / (nextMs - clearMs)`. If `nowMs === clearMs`, result is 0. But floating point could produce a tiny nonzero value, making the bar 0.0001% wide (imperceptible, but technically nonzero).

### UI-009: Progress bar at ~50% midway to next action
- **Setup**: 1 VCS stock at 25C, `lastClearTime` = 2.5h ago, next action at 5h mark (2.5h remaining).
- **Expected**: Progress bar width ~50%. Color green (`#5eead4`, since 0.5 < 0.7). Right label shows next action time.
- **Risk**: If there are multiple pending actions, the progress tracks to the first one (soonest), not the last. If the first action was skipped by auto-advance, the target time changes and 50% may not be where expected.

### UI-010: Progress bar at exactly 70% boundary -- green to yellow transition
- **Setup**: 1 VCS stock, `lastClearTime` = 3.5h ago, next action in 1.5h (total span 5h, progress = 3.5/5 = 0.70).
- **Expected**: Progress bar at 70%. Color is still green because the threshold is `> 0.7` (strictly greater). Bar color `#5eead4`.
- **Risk**: The condition is `progress > 0.7 ? '#eab308' : '#5eead4'`. At exactly 0.7, it stays green. Off-by-one in floating point comparison could push it to yellow.

### UI-011: Progress bar at 71% -- yellow color
- **Setup**: 1 VCS stock, progress computes to 0.71 (e.g., 3.55h into a 5h span to next action).
- **Expected**: Bar width ~71%. Color yellow (`#eab308`) because `0.71 > 0.7`.
- **Risk**: None specific; straightforward threshold check. But if `computeNextActions` returns a different first action than expected (e.g., due to auto-skip of 2h+ overdue), the denominator changes.

### UI-012: Progress bar at exactly 90% boundary -- yellow to red transition
- **Setup**: 1 VCS stock, progress = 0.90 exactly (e.g., 4.5h of 5h to next action).
- **Expected**: Bar at 90%, color still yellow (`#eab308`) because threshold is `> 0.9` (strictly greater).
- **Risk**: At 0.9 exactly, the bar remains yellow. The right-side label also checks `progress > 0.9` for red coloring, so at exactly 0.9 it stays default color (`var(--text-3)`).

### UI-013: Progress bar at 95% -- red color
- **Setup**: 1 VCS stock, progress = 0.95.
- **Expected**: Bar at 95%, color red (`#ef4444`). Right-side time label also red (`#ef4444`). Status dot could still be green/yellow depending on time-to-action vs. the 30min threshold.
- **Risk**: Progress bar color and status dot color are computed independently. Progress bar uses `vcsWindowProgress` ratio, status dot uses `getVcsStatus` time thresholds. They can disagree: e.g., bar red at 95% but dot green if still >30min away.

### UI-014: Progress bar at 100% (clamped)
- **Setup**: 1 VCS stock, `lastClearTime` = 6h ago, next action was scheduled at 5h mark (now 1h overdue). `vcsWindowProgress` returns `Math.min(1, ...)` = 1.0.
- **Expected**: Bar at 100% width, red color. Progress clamped by `Math.min(1, ...)`.
- **Risk**: The action is overdue; if it gets auto-skipped (>2h overdue rule), `computeNextActions` shifts to the next action and progress recalculates against a new target time, causing the bar to jump from 100% back down.

### UI-015: Progress bar hidden when no lastClearTime
- **Setup**: 1 VCS stock with `enabled = true` but `lastClearTime = null` (freshly created VCS that hasn't been cleared yet).
- **Expected**: No progress bar rendered (the `{v.lastClearTime && (...)}` guard prevents it). Status dot still shows. Badge and status text still render.
- **Risk**: `makeVcs` sets `lastClearTime = now` on creation, so this state shouldn't normally occur. But if VCS data is imported or manually edited to have null `lastClearTime`, the card should not crash.

### UI-016: Progress bar color does not match status dot color
- **Setup**: 1 VCS stock at 25C, `lastClearTime` = 4.8h ago, next action at 5h mark (12min away). Progress = 0.96 (red bar). `timeUntilMs` = 12min < 30min (yellow dot).
- **Expected**: Bar red (`#ef4444`), dot yellow (`#eab308`). These are intentionally different systems. Bar tracks progress ratio, dot tracks urgency state.
- **Risk**: Users may find the color mismatch confusing. Test confirms both render as designed per their respective algorithms.

---

## Sort Order

### UI-017: VCS stocks sorted red > yellow > green
- **Setup**: 3 VCS stocks: Stock-A (red/expired), Stock-B (yellow/action in 15min), Stock-C (green/action in 3h). All same user.
- **Expected**: Dashboard order: Stock-A, Stock-B, Stock-C. Red card at top.
- **Risk**: Sort uses `const order = { red: 0, yellow: 1, green: 2 }`. If `getVcsStatus` returns `'none'` (disabled VCS), it maps to `undefined` which is `NaN` in comparison, causing unpredictable sort.

### UI-018: Within same color, sorted by soonest action first
- **Setup**: 3 VCS stocks all yellow: Stock-X (action in 25min), Stock-Y (action in 10min), Stock-Z (action in 20min).
- **Expected**: Order: Stock-Y (10min), Stock-Z (20min), Stock-X (25min).
- **Risk**: The secondary sort uses `(na[0]?.suggestedMs || Infinity)`. If a yellow stock has no pending actions (all done, but somehow still yellow from grace period), it sorts to the end with `Infinity`.

### UI-019: Sort stability -- same status, same action time
- **Setup**: 2 VCS stocks both green, both with next action at exactly the same `suggestedMs` value (e.g., both scheduled at 14:30, same clear time).
- **Expected**: Order is stable (does not flip on re-render). Both appear with identical visual treatment.
- **Risk**: JavaScript's `Array.sort` is not guaranteed stable in all engines. If both have identical `suggestedMs`, their relative order may change across renders, causing visual flickering.

### UI-020: Cross VCS cards sorted separately from stock VCS cards
- **Setup**: 2 crosses in "collecting virgins" with VCS (1 red, 1 green), and 2 VCS stocks (1 yellow, 1 green). Same user.
- **Expected**: Cross VCS cards appear in their own grid above stock VCS cards. Cross order: red cross first, green cross second. Stock order: yellow stock first, green stock second. The two grids are independent.
- **Risk**: The code renders `sortedCrosses` in one grid and `sorted` (stocks) in another. If the rendering structure changes, crosses and stocks could intermix.

### UI-021: Sort with mix of all three status colors plus ties
- **Setup**: 6 VCS stocks: 2 red (A at suggestedMs 100, B at 200), 2 yellow (C at 300, D at 250), 2 green (E at 500, F at 400).
- **Expected**: Order: A, B, D, C, F, E. Within red: A before B (lower suggestedMs). Within yellow: D before C. Within green: F before E.
- **Risk**: The comparator `order[sa] - order[sb]` returns 0 for same-color, then falls through to `suggestedMs` comparison. If `computeNextActions` is called twice per stock during sort (once for status, once for suggestedMs), performance could degrade with many stocks.

### UI-022: Single VCS stock -- no sorting needed
- **Setup**: 1 VCS stock, green status.
- **Expected**: Single card renders in the dashboard grid. No sort comparison errors.
- **Risk**: Array.sort on a single-element array should be a no-op. Edge case: the `.sort()` callback is still invoked by some engines with a single element; ensure no crash if `computeNextActions` returns empty.

### UI-023: 20+ VCS stocks sorting performance
- **Setup**: 25 VCS stocks with mixed statuses: 5 red, 8 yellow, 12 green. Various action times.
- **Expected**: All 25 cards render in correct urgency order. Page does not lag visually. `useMemo` prevents re-sort unless dependencies change.
- **Risk**: Each sort comparison calls `getVcsStatus` and `computeNextActions` (which itself calls `parseHHMM`, date arithmetic, etc.). With 25 stocks and O(n log n) comparisons (~120 calls), this could be slow if `computeNextActions` is expensive. The sort is inside an IIFE, not `useMemo`, so it re-runs every render.

### UI-024: VCS stock with 'none' status excluded from dashboard
- **Setup**: 3 stocks: Stock-A with VCS enabled (green), Stock-B with VCS disabled (`enabled: false`), Stock-C with no VCS object. Same user.
- **Expected**: Only Stock-A appears in the VCS dashboard. Stock-B and Stock-C filtered out by `s.vcs?.enabled`. No sort comparison with `'none'` status.
- **Risk**: The filter `stocks.filter(s => s.vcs?.enabled && s.maintainer === currentUser && !stockTags(s).includes('Dead'))` also excludes Dead-tagged stocks. If a stock has VCS enabled but is tagged Dead, it should not appear.

### UI-025: Dead-tagged VCS stock excluded from dashboard
- **Setup**: 1 VCS stock with `enabled: true` but stock notes contain "Dead" tag (e.g., notes = "Dead - contaminated").
- **Expected**: Stock does not appear in VCS dashboard due to `!stockTags(s).includes('Dead')` filter.
- **Risk**: `stockTags` parses the notes field. If the tag detection regex matches "Deadline" or "Dead-end" as "Dead", the stock would be incorrectly excluded.

---

## Bank Prompt Display

### UI-026: Stock VCS bank prompt with 0 banked virgins
- **Setup**: 1 VCS stock, `virginBank[stockId]` = 0 or undefined. Click collect action to open bank prompt.
- **Expected**: Bank prompt shows "Log virgins to bank" header. No banked count shown (the `{(virginBank[s.id] || 0) > 0 && ...}` guard hides it). Three buttons: +1, +3, +5, and "Done".
- **Risk**: If `virginBank[s.id]` is `undefined`, the `|| 0` fallback handles it. But if it's `null` (from a sync issue), `null > 0` is false, so the guard still works.

### UI-027: Stock VCS bank prompt showing running count
- **Setup**: 1 VCS stock, `virginBank[stockId]` = 7. Bank prompt open.
- **Expected**: Header shows "Log virgins to bank" on left, "7 banked" on right in teal bold (`#5eead4`). Clicking +3 updates display to "10 banked" without closing prompt.
- **Risk**: The count updates via `setVirginBank` which triggers a re-render. If the bank prompt is keyed incorrectly or the `vcsBankPrompt` state gets cleared during re-render, the prompt could close unexpectedly.

### UI-028: Stock VCS bank prompt after multiple +N clicks
- **Setup**: 1 VCS stock, `virginBank[stockId]` starts at 0. Open bank prompt, click +5, then +3, then +1.
- **Expected**: After each click: count shows 5, then 8, then 9. Each click triggers a toast ("+ N virgins banked for [name]"). Prompt stays open throughout.
- **Risk**: Rapid clicks could cause state update batching issues if React batches `setVirginBank` updates. Since each update uses the functional form `prev => ({...prev, [s.id]: (prev[s.id] || 0) + n})`, batching should be safe.

### UI-029: Stock VCS bank prompt "Done" closes prompt
- **Setup**: 1 VCS stock with bank prompt open, 5 banked.
- **Expected**: Clicking "Done" sets `vcsBankPrompt` to null. Prompt disappears. Banked count persists in `virginBank`.
- **Risk**: If the card `onClick` (which opens the stock modal) fires before `e.stopPropagation()` on the prompt wrapper, the modal could open simultaneously.

### UI-030: Cross VCS bank prompt shows X/target count
- **Setup**: 1 cross in "collecting virgins", `virginsCollected = 2`, `virginsPerCross = 5`. Bank prompt open.
- **Expected**: Header shows "Log virgins collected" on left, "2/5" on right in teal bold. Buttons: +1, +3, +5, Done.
- **Risk**: `virginsPerCross` is passed as a prop; if undefined, it falls back to `|| 5`. If it's `0`, the display would show "2/0" and any click would auto-promote to "waiting for progeny" since `newCount >= 0` is always true.

### UI-031: Cross VCS bank prompt auto-promotes at target
- **Setup**: 1 cross in "collecting virgins", `virginsCollected = 3`, `virginsPerCross = 5`. Bank prompt open. User clicks +3 (total becomes 6 >= 5).
- **Expected**: Cross status changes to "waiting for progeny". VCS is set to null. Bank prompt closes automatically. Toast: "5 virgins collected -> waiting for progeny".
- **Risk**: The toast message always says the target number, not the actual collected count. If 6 were collected (3+3), the toast still says "5 virgins collected". The cross stores `virginsCollected = 6` (the actual sum), not clamped to target.

### UI-032: Cross VCS bank prompt stays open below target
- **Setup**: 1 cross in "collecting virgins", `virginsCollected = 1`, `virginsPerCross = 5`. Click +1 in bank prompt.
- **Expected**: Count updates to "2/5". Toast: "+1 virgin (2/5)". Prompt remains open. Cross stays in "collecting virgins".
- **Risk**: None specific. The condition `newCount >= (virginsPerCross || 5)` is false (2 < 5), so the else branch runs.

---

## doneCount Badge

### UI-033: doneCount shows 0/2 with no collections done
- **Setup**: 1 VCS stock at 25C, 2 collections/day. `todayActions = []` (or only the initial clear). Evening clear is auto-marked done.
- **Expected**: Badge: "25C . 2x . 0/2". `doneCount` = 0 because `todayActions.filter(a => a.type === 'collect').length` is 0 (the evening clear is type 'clear', not 'collect').
- **Risk**: If the user's VCS schedule has a `morning clear_discard` (at 25C), that's also not type 'collect', so it correctly doesn't increment `doneCount`. But if the code changes to count all actions, the badge would be wrong.

### UI-034: doneCount shows 1/2 after one collection
- **Setup**: 1 VCS stock at 25C, 2 collections/day. `todayActions` = [{ type: 'clear', key: 'evening' }, { type: 'collect', key: 'afternoon', time: '...' }].
- **Expected**: Badge: "25C . 2x . 1/2".
- **Risk**: `doneCount` counts all `type === 'collect'` in `todayActions`. The afternoon action at 25C is actually `collect_clear` in the schedule, but when logged the code splits it: the collect is logged as `'clear'` (line 606: `logAction(next.type === 'collect_clear' ? 'clear' : 'collect', ...)`). So the logged type might be 'clear' not 'collect', making `doneCount` = 0 instead of 1.

### UI-035: doneCount shows 2/2 after all collections complete
- **Setup**: 1 VCS stock at 25C, 2 collections/day. All collect-type actions recorded in `todayActions`.
- **Expected**: Badge: "25C . 2x . 2/2". All actions done, green status, "All done for this window" message.
- **Risk**: See UI-034 risk. The `collect_clear` action type logging may not record as `type: 'collect'`, causing undercount.

### UI-036: doneCount resets after a new clear
- **Setup**: 1 VCS stock. `todayActions` had 2 collects, then a new evening clear is performed. The clear handler sets `newVcs.todayActions = [action]` (resets to just the clear action).
- **Expected**: Badge resets to "0/N" because `todayActions` now contains only the new clear action (type 'clear'), and `doneCount` filters for `type === 'collect'` which yields 0.
- **Risk**: If the clear handler doesn't reset `todayActions`, old collect actions persist and `doneCount` incorrectly shows prior cycle's collections.

### UI-037: doneCount for 3 collections/day at 18C
- **Setup**: 1 VCS stock at 18C, 3 collections/day. Morning collect done, midday collect done, afternoon not yet.
- **Expected**: Badge: "18C . 3x . 2/3". `totalCollects = v.collectionsPerDay = 3`.
- **Risk**: At 18C, the morning action is `type: 'collect'` (not `clear_discard`). So `doneCount` correctly counts morning + midday as 2. If the cycle logic miscategorizes morning as `clear_discard` for an 18C stock, count would be wrong.

### UI-038: doneCount for cross VCS card shows collected/target instead
- **Setup**: 1 cross in "collecting virgins" with VCS, `virginsCollected = 3`, `virginsPerCross = 5`.
- **Expected**: Cross card badge shows "18C . 2x . 3/5" (collected/target, not doneCount/totalCollects). The cross card uses `vCollected/vTarget` format.
- **Risk**: The cross card badge renders `{v.overnightAt18 ? '18C' : '25C'} . {v.collectionsPerDay}x . {vCollected}/{vTarget}` which is the virgin target count, not the daily collection cycle count. This is intentionally different from stock VCS cards.

---

## Empty States

### UI-039: No VCS stocks and no virgin-phase crosses
- **Setup**: User has stocks and crosses, but no stocks have VCS enabled and no crosses are in "collecting virgins" or "waiting for virgins".
- **Expected**: The entire "Virgin Collections" section does not render (`if (!vcsStocks.length && !virginCrosses.length) return null`). No section header, no empty grid.
- **Risk**: If a cross is in "collecting virgins" but VCS is not yet backfilled (the `useEffect` backfill hasn't run), it would appear in `virginCrosses` but `c.vcs?.enabled` would be false, causing it to be filtered out of `collectingCrosses`. The section header "Virgin Collections" would still render because `virginCrosses.length > 0`.

### UI-040: VCS section with only waiting-for-virgins crosses (no stocks, no collecting)
- **Setup**: 2 crosses in "waiting for virgins" status, 0 VCS stocks, 0 "collecting virgins" crosses.
- **Expected**: "Virgin Collections" section renders. Only the waiting crosses grid shows. No VCS stock grid. No collecting crosses grid.
- **Risk**: The waiting crosses grid has its own rendering block. If all three sub-blocks (waiting, collecting, stocks) return null except waiting, the section still renders with just the header + waiting grid.

### UI-041: Virgin bank overview empty state
- **Setup**: `virginBank = {}` (no virgins banked for any stock).
- **Expected**: Virgin Bank card shows "Virgin Bank" header with "0 total". Body shows "No virgins banked yet" centered text. No grid.
- **Risk**: `Object.values({}).reduce(...)` = 0. `bankedStocks` is empty array. The empty state message renders.

### UI-042: Exp bank overview empty state
- **Setup**: `expBank = {}`.
- **Expected**: "Experimental Animals" header with "0M 0F total". Body: "No experimental animals logged yet".
- **Risk**: Same pattern as virgin bank. `Object.values({}).reduce(...)` works on empty object.

---

## Virgin Bank Sorting and Display

### UI-043: Virgin bank overview sorted by count descending
- **Setup**: 5 stocks. `virginBank` = { A: 12, B: 3, C: 0, D: 7, E: 1 }.
- **Expected**: Overview grid order: A (12), D (7), B (3), E (1). Stock C does not appear (count 0, filtered by `bankedStocks = stocksWithVirgins.filter(s => s.count > 0)`).
- **Risk**: The overview uses `bankedStocks` which is derived from `stocksWithVirgins` (already sorted descending). The `filter` preserves sort order. Correct.

### UI-044: Virgin log section sorted by banked count descending
- **Setup**: Same as UI-043. No search filter active.
- **Expected**: Log section lists all 5 stocks: A (12), D (7), B (3), E (1), C (0). Stock C appears last (count 0 but still shown for logging). Each with badge showing count if >0.
- **Risk**: The log sort is `.sort((a, b) => (virginBank[b.id] || 0) - (virginBank[a.id] || 0))`. Stocks with 0 virgins all sort to the bottom but their relative order among themselves is unstable.

### UI-045: Exp bank log section (crosses) sorted by total banked descending
- **Setup**: 4 eligible crosses. `expBank` = { C1: {m:5, f:3}, C2: {m:0, f:0}, C3: {m:2, f:6}, C4: {m:1, f:1} }.
- **Expected**: Cross log order: C3 (8 total), C1 (8 total), C4 (2 total), C2 (0 total). C1 and C3 tied at 8; order between them is unstable.
- **Risk**: Sort by `(expBank[b.id]?.m || 0) + (expBank[b.id]?.f || 0)` for total. Ties broken arbitrarily.

---

## Editable Counts

### UI-046: Tap virgin count to enter edit mode
- **Setup**: Virgin bank overview, Stock-A with count = 5. User taps the "5" number.
- **Expected**: Number replaced by an `<input type="number">` with `defaultValue=5`, auto-focused, text selected. Input styled with pink border (`rgba(249,168,212,0.3)`).
- **Risk**: `setEditingVirginId(s.id)` triggers re-render. If React re-renders the list and the component key changes, the input may not appear or may lose focus.

### UI-047: Blur on editable virgin count saves new value
- **Setup**: Stock-A virgin count editing, user types "8" and clicks away (blur).
- **Expected**: `setVirginBank` called with `{...prev, [s.id]: 8}`. Input reverts to static display showing 8. `editingVirginId` set to null.
- **Risk**: `parseInt(e.target.value)` on non-numeric input returns NaN, `|| 0` catches it. Negative values clamped by `Math.max(0, ...)`. If user types "0", the entry is deleted from virginBank (`delete next[s.id]`), removing the card from the overview.

### UI-048: Escape on editable virgin count cancels edit
- **Setup**: Stock-A virgin count editing, original value = 5, user types "12" then presses Escape.
- **Expected**: `setEditingVirginId(null)` called. Input disappears, static "5" restored (the `defaultValue` was never committed). No `setVirginBank` call.
- **Risk**: The Escape handler calls `setEditingVirginId(null)` but does NOT call `e.target.blur()`. If the browser keeps the input mounted briefly during re-render, the `onBlur` handler could fire after Escape, saving the edited value anyway.

### UI-049: Tap exp bank male count to enter edit mode
- **Setup**: Exp bank overview, entry with id=X, m=3, f=7. User taps the "3" (male count).
- **Expected**: Male count becomes input with `defaultValue=3`, auto-focused. Female count remains static. `editingExp` = `{ id: X, sex: 'm' }`.
- **Risk**: Both male and female counts are inline in the same `<p>` element. The input replaces only one span. If both are clicked simultaneously (touch event propagation), `editingExp` could be set twice, with the second overwriting the first.

### UI-050: Exp bank edit sets to 0 and both m+f=0 deletes entry
- **Setup**: Exp bank overview, entry with id=X, m=2, f=0. User edits male count to 0 and blurs.
- **Expected**: Since `val === 0 && (cur.f || 0) === 0`, the entry is deleted from `expBank` (`delete next[e.id]`). The card disappears from the overview. Total count updates.
- **Risk**: The deletion happens inside `setExpBank` functional update. If `cur.f` is `undefined` instead of `0` (stale data), `(cur.f || 0) === 0` is still true, so deletion still occurs. Correct behavior, but the entry disappearing mid-edit could surprise users.

---

## Print Label Toggle in Bank Overview

(Covered tangentially in bank overview context)

Note: Print label toggle buttons appear on VCS stock cards (virgin labels) and exp bank overview cards (exp labels). These are the printer icon buttons that toggle items in/out of the print list.

The VCS stock card print toggle is tested implicitly in the rendering tests above (it sits next to the doneCount badge in each VCS stock card). The virgin bank overview print toggle is on each banked stock card in the VirginsScreen. The exp bank overview print toggle is on each banked entry card in the ExpScreen. All follow the same pattern: teal when selected, default gray when not, with a toast on toggle.
