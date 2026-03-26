# VCS Deadline, Expiry & Grace Period Test Cases

## Reference: Core Logic (from `vcs.js`)

```
deadline       = lastClearTime + windowMs   (8h for 25C, 16h for 18C)
cycleExpired   = now > deadline + 30min
isInGracePeriod = now > deadline && now <= deadline + 30min
isPastDeadline  = now > deadline + 30min
isOverdue (action) = now > suggestedTime + 30min
auto-skip      = first action >2h overdue AND not last clear
```

**Status color rules (getVcsStatus):**
- `red`    = isPastDeadline OR isInGracePeriod
- `yellow` = isOverdue (action >30min late) OR timeUntilMs < 30min
- `green`  = everything else (or no actions remaining)

**UI behavior:**
- Buttons shown when: isPastDeadline OR isInGracePeriod OR next action <= 20min away
- Past deadline: only "Clear & Discard" button
- In grace period: "Collect (late)" + "Discard" buttons
- Normal: action-specific button (collect, clear, etc.)

---

## Test Setup Convention

All times are ISO 8601. Schedule uses VCS_DEFAULTS:
- **18C/2cpd**: evening 17:30, morning 09:30, afternoon 17:00
- **25C/2cpd**: evening 18:00, morning 09:00, afternoon 14:30

`lastClearTime` = when the evening clear happened (auto-marks 'evening' done).
`lastClearTemp` = '18' or '25' (determines window length).
`todayActions` = array of `{ key, type, time }` logged since last clear.

---

## DL-001: Exact deadline moment at 25C

- **Setup**: lastClearTime = `2026-03-26T18:00:00Z`, lastClearTemp = '25', todayActions = [], now = `2026-03-27T02:00:00Z` (exactly 8h later)
- **Expected**: deadline = 02:00:00Z. `now === deadline` so `now > deadline` is false. isInGracePeriod = false. isPastDeadline = false. Status = yellow (morning action at 09:00 is >30min away, but the next action's timeUntil depends on schedule). Actually the morning action is scheduled ~09:00 next day relative to clear; `timeUntilMs` for morning = 09:00 - 02:00 = 7h > 30min. Status = **green**. Buttons hidden. Collect allowed via normal flow.
- **Risk**: Off-by-one on `now > deadline` -- if implementation uses `>=`, this would flip to grace period erroneously.

## DL-002: 1ms before deadline at 25C

- **Setup**: lastClearTime = `2026-03-26T18:00:00Z`, lastClearTemp = '25', todayActions = [], now = `2026-03-27T01:59:59.999Z`
- **Expected**: now < deadline (02:00:00Z). isInGracePeriod = false. isPastDeadline = false. Status = **green** (next action is morning at ~09:00, hours away). Buttons hidden.
- **Risk**: Millisecond precision issues in Date comparison.

## DL-003: 1ms after deadline at 25C

- **Setup**: lastClearTime = `2026-03-26T18:00:00Z`, lastClearTemp = '25', todayActions = [], now = `2026-03-27T02:00:00.001Z`
- **Expected**: now > deadline. now <= deadline + 30min (02:30:00Z). isInGracePeriod = **true**. isPastDeadline = false. Status = **red**. Buttons: "Collect (late)" + "Discard". Collect IS allowed (late).
- **Risk**: Grace period incorrectly not triggering at 1ms boundary.

## DL-004: Exact grace period end at 25C

- **Setup**: lastClearTime = `2026-03-26T18:00:00Z`, lastClearTemp = '25', todayActions = [], now = `2026-03-27T02:30:00Z` (deadline + 30min exactly)
- **Expected**: `now > deadline + 30min` is false (equal, not greater). isInGracePeriod = true (now > deadline AND now <= deadline+30min). isPastDeadline = false. Status = **red**. Buttons: "Collect (late)" + "Discard". Collect allowed.
- **Risk**: Boundary condition -- `<=` vs `<` in grace check. The code uses `nowMs > deadline + 30 * 60000` for cycleExpired/isPastDeadline, so exact equality stays in grace.

## DL-005: 1ms after grace period end at 25C

- **Setup**: lastClearTime = `2026-03-26T18:00:00Z`, lastClearTemp = '25', todayActions = [], now = `2026-03-27T02:30:00.001Z`
- **Expected**: `now > deadline + 30min` = true. isPastDeadline = true. cycleExpired = true. Status = **red**. Buttons: only "Clear & Discard". Collect **NOT** allowed.
- **Risk**: Transition from grace to expired off by 1ms. Also: todayActions done during the cycle should be invalidated since cycleExpired resets doneKeys.

## DL-006: 1ms before grace period end at 25C

- **Setup**: lastClearTime = `2026-03-26T18:00:00Z`, lastClearTemp = '25', todayActions = [], now = `2026-03-27T02:29:59.999Z`
- **Expected**: Still in grace period. isInGracePeriod = true. isPastDeadline = false. Status = **red**. Buttons: "Collect (late)" + "Discard".
- **Risk**: Rounding or truncation of milliseconds making this appear expired.

## DL-007: Exact deadline moment at 18C

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T09:30:00Z` (exactly 16h later)
- **Expected**: deadline = 09:30:00Z. `now > deadline` is false. isInGracePeriod = false. isPastDeadline = false. Morning action at 09:30 has timeUntilMs = 0, which is < 30min. Status = **yellow**. Buttons shown (within 20min). Collect allowed.
- **Risk**: 18C deadline coincides exactly with morning collect time -- both thresholds trigger simultaneously.

## DL-008: 1ms after deadline at 18C

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T09:30:00.001Z`
- **Expected**: isInGracePeriod = true. Status = **red**. Buttons: "Collect (late)" + "Discard".
- **Risk**: At 18C the deadline and the morning collect time are often identical, so the action isOverdue and isInGracePeriod may both be true -- status should still be red.

## DL-009: Grace period end at 18C

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T10:00:00.001Z` (16h + 30min + 1ms)
- **Expected**: isPastDeadline = true. cycleExpired = true. Status = **red**. Only "Clear & Discard". Collect not allowed.
- **Risk**: 18C window is 16h; miscalculating as 8h would put deadline at 01:30 instead of 09:30.

## DL-010: Deadline crossing midnight (25C evening clear at 22:00)

- **Setup**: lastClearTime = `2026-03-25T22:00:00Z`, lastClearTemp = '25', schedule = {eveningClear:'22:00', morningCollect:'09:00', afternoonCollect:'14:30'}, todayActions = [], now = `2026-03-26T06:00:00Z` (8h later = deadline)
- **Expected**: deadline = 06:00:00Z on Mar 26. At exactly 06:00, still not past. isInGracePeriod = false. Status depends on next action timing. Morning action at 09:00 is 3h away (>30min). Status = **green**.
- **Risk**: Day-boundary math -- `suggestedMs` computation adds 86400000 if scheduled time is before clearMs. Morning 09:00 on Mar 26 is after 22:00 on Mar 25, so it should NOT add a day. If it does, morning action lands on Mar 27.

## DL-011: Deadline crossing into next day (18C clear at 20:00)

- **Setup**: lastClearTime = `2026-03-25T20:00:00Z`, lastClearTemp = '18', schedule = {eveningClear:'20:00', morningCollect:'09:30', afternoonCollect:'17:00'}, todayActions = [], now = `2026-03-26T12:00:00Z` (16h later)
- **Expected**: deadline = `2026-03-26T12:00:00Z`. Exactly at deadline, not past. Morning collect at 09:30 on Mar 26 -- timeUntilMs = 09:30 - 12:00 = -2.5h (overdue >2h). Auto-skip applies IF there's a later action. Afternoon collect at 17:00 exists. Morning is skipped. Next = afternoon at 17:00, timeUntilMs = 5h. Status = **green**.
- **Risk**: Auto-skip removing an action that should still be shown because it was the only collect opportunity before deadline.

## DL-012: Multi-day gap -- user away for weekend (25C, 48h since clear)

- **Setup**: lastClearTime = `2026-03-22T18:00:00Z`, lastClearTemp = '25', todayActions = [], now = `2026-03-24T18:00:00Z` (48h later)
- **Expected**: deadline was `2026-03-23T02:00:00Z`. Grace ended `2026-03-23T02:30:00Z`. Now is 39.5h past grace end. isPastDeadline = true. cycleExpired = true. Status = **red**. Only "Clear & Discard". All todayActions invalidated.
- **Risk**: Extremely stale data -- UI should clearly show expired, not silently show green because all actions auto-skipped.

## DL-013: Multi-day gap at 18C (72h since clear)

- **Setup**: lastClearTime = `2026-03-22T17:30:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-25T17:30:00Z` (72h later)
- **Expected**: deadline was `2026-03-23T09:30:00Z`. Grace ended `2026-03-23T10:00:00Z`. isPastDeadline = true. cycleExpired = true. Status = **red**. Only "Clear & Discard".
- **Risk**: Same as DL-012 but verifying the 18C window isn't somehow recalculating.

## DL-014: lastClearTime is null

- **Setup**: lastClearTime = null, lastClearTemp = '25', todayActions = [], now = any
- **Expected**: `computeDeadline(null, ...)` returns null. deadline = null. cycleExpired = false (deadline is falsy). isInGracePeriod = false. isPastDeadline = false. No deadline-based coloring. Actions compute from `new Date(now)` as fallback. Status depends on action schedule only.
- **Risk**: Null propagation -- `clearMs` = 0 (epoch), so `suggestedMs` calculation may place actions in 1970. The code sets `clearDate = new Date(now)` when lastClearTime is falsy, but `clearMs = 0` is used for todayActions filtering.

## DL-015: lastClearTime is undefined (VCS just enabled, never cleared)

- **Setup**: VCS object with `lastClearTime: undefined`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T10:00:00Z`
- **Expected**: Same as DL-014 -- computeDeadline returns null. No deadline. Status based on scheduled action proximity.
- **Risk**: `undefined` vs `null` handling in `new Date(undefined)` returns Invalid Date, but the code checks `if (!clearIso) return null` which catches both.

## DL-016: lastClearTime is very old (2 weeks ago)

- **Setup**: lastClearTime = `2026-03-12T17:30:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T10:00:00Z` (14 days later)
- **Expected**: deadline = `2026-03-13T09:30:00Z`, long expired. cycleExpired = true. isPastDeadline = true. Status = **red**. All scheduled actions from that cycle are massively overdue. Auto-skip would try to skip actions but the last clear action cannot be skipped. Only "Clear & Discard" shown.
- **Risk**: Auto-skip loop running many iterations. The `while` loop only shifts the first element, so with 3 actions max, it's bounded. But suggestedMs could be weeks in the past, causing all `timeUntilMs` to be hugely negative.

## DL-017: Grace period with morning collect already done (18C)

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [{key:'morning', type:'collect', time:'2026-03-26T09:45:00Z'}], now = `2026-03-26T09:45:00Z` (15min past deadline)
- **Expected**: deadline = 09:30:00Z. now > deadline, now <= 10:00:00Z (grace end). isInGracePeriod = true. Morning is done (in doneKeys). Next action = afternoon collect at 17:00. But isPastDeadline on that action is still computed from the same deadline. The afternoon action has isInGracePeriod = true. Status = **red**. Buttons: "Collect (late)" + "Discard" for afternoon action.
- **Risk**: Collecting during grace and then seeing the next action also flagged as grace -- the grace applies to the whole cycle, not per-action.

## DL-018: Expired with morning collect done but afternoon not

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [{key:'morning', type:'collect', time:'2026-03-26T09:35:00Z'}], now = `2026-03-26T10:00:00.001Z` (past grace)
- **Expected**: cycleExpired = true. But `doneKeys` check: `actionMs >= clearMs && !cycleExpired` -- since cycleExpired is true, morning collect is NOT in doneKeys. All actions appear undone. Next = morning (not skipped because evening is auto-done). isPastDeadline = true. Status = **red**. Only "Clear & Discard".
- **Risk**: The cycleExpired flag invalidates all todayActions, so previously collected virgins in this cycle are effectively orphaned. UI should still show "Clear & Discard" not "Collect".

## DL-019: Expired with no actions done (18C, simple timeout)

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T12:00:00Z` (2.5h past grace end)
- **Expected**: deadline = 09:30. Grace ended 10:00. cycleExpired = true. Morning collect (09:30) is overdue by 2.5h. Afternoon collect (17:00) not yet. Auto-skip: morning timeUntilMs = -2.5h = -9000000 < -7200000 (2h). There's a later action (afternoon). But wait -- is morning a clear? No, it's 'collect'. The auto-skip condition checks `isClear` only to protect the last clear. 'collect' is not a clear type, so it CAN be skipped. After skipping morning, next = afternoon at 17:00, timeUntilMs = +5h. But isPastDeadline = true on afternoon action. Status = **red** (isPastDeadline). Only "Clear & Discard".
- **Risk**: Auto-skip removing the morning collect but the afternoon still showing as expired -- correct behavior since the whole cycle is expired.

## DL-020: Expired with all actions done

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [{key:'morning', type:'collect', time:'2026-03-26T09:30:00Z'}, {key:'afternoon', type:'collect_clear', time:'2026-03-26T17:00:00Z'}], now = `2026-03-26T10:30:00Z`
- **Expected**: deadline = 09:30. Grace ended 10:00. now = 10:30 > grace end. cycleExpired = true. Since cycleExpired = true, doneKeys ignores todayActions. All actions reappear as undone. But wait -- afternoon action was done at 17:00 which is after 10:30? No, the time is set to 17:00 but now is 10:30. Actually the todayActions time of 17:00 is in the future relative to now at 10:30 -- this is impossible in practice but let's see: `actionMs (17:00) >= clearMs (17:30 yesterday)` = true, and `!cycleExpired` = false, so it's NOT added to doneKeys. Morning (09:30) also not added. All actions undone. Status = **red**.
- **Risk**: Time-traveling todayActions (future timestamps) combined with cycleExpired creates confusing state.

## DL-021: Yellow status -- next action exactly 30min away

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T09:00:00Z` (morning collect at 09:30, 30min away)
- **Expected**: Morning collect timeUntilMs = 30 * 60000 = 1800000. Condition: `timeUntilMs < 30 * 60000` is false (not strictly less). Status = **green**. Buttons hidden (>20min away... 30min > 20min, so hidden).
- **Risk**: Boundary: `<` vs `<=`. At exactly 30min, user expects yellow but gets green. This is a known edge case in the code.

## DL-022: Yellow status -- next action 29min 59s away

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T09:00:01Z` (29m59s to morning collect)
- **Expected**: timeUntilMs = 1799000 < 1800000. Status = **yellow**. Buttons still hidden (29m59s > 20min).
- **Risk**: Yellow status shown but no buttons -- user sees urgency indicator but cannot act. Buttons appear only at <=20min.

## DL-023: Yellow status -- action 31min overdue

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T10:01:00Z` (morning was 09:30, now 31min late)
- **Expected**: Morning collect timeUntilMs = -31min. isOverdue = true (now > suggestedTime + 30min). But also: deadline = 09:30. now (10:01) > deadline (09:30), now <= deadline + 30min (10:00)? No, 10:01 > 10:00. isPastDeadline = true. Status = **red** (isPastDeadline takes priority). Only "Clear & Discard".
- **Risk**: At 18C with default schedule, the deadline and morning collect are at the same time (09:30). So being 31min late on the action also means being 31min past deadline, which is 1min past grace. The yellow "overdue" status is never reachable for the morning action at 18C because deadline expiry hits first.

## DL-024: Yellow status -- action overdue but within deadline grace (25C)

- **Setup**: lastClearTime = `2026-03-25T18:00:00Z`, lastClearTemp = '25', schedule = 25C/2cpd defaults, todayActions = [], now = `2026-03-26T01:45:00Z`
- **Expected**: deadline = 02:00. Morning action at 09:00 (next day). timeUntilMs for morning = ~7h15m (well ahead). No action is overdue. But wait -- evening clear was at 18:00, morning is at 09:00 next day. The scheduled time 09:00 on Mar 26 is after clear at 18:00 on Mar 25, so no day-add needed. timeUntilMs = 09:00 - 01:45 = 7h15m. Status = **green**.
- **Risk**: This test verifies that approaching the deadline alone doesn't cause yellow -- only approaching/overdue actions do.

## DL-025: Action exactly 30min overdue (isOverdue boundary)

- **Setup**: lastClearTime = `2026-03-25T18:00:00Z`, lastClearTemp = '25', todayActions = [], now = `2026-03-26T09:30:00Z` (morning collect was 09:00, exactly 30min late)
- **Expected**: `nowMs > suggestedMs + 30 * 60000` = `09:30 > 09:00 + 30min` = `09:30 > 09:30` = false. isOverdue = false. timeUntilMs = -30min < 30min. Status = **yellow** (timeUntilMs < 30min). Buttons: shown (timeUntilMs <= 20min? -30min <= 20min = true). Normal action button.
- **Risk**: At exactly 30min overdue, isOverdue is false but timeUntilMs is negative, triggering yellow through the `< 30min` path.

## DL-026: Action 31min overdue at 25C (before deadline)

- **Setup**: lastClearTime = `2026-03-25T18:00:00Z`, lastClearTemp = '25', todayActions = [], now = `2026-03-26T09:31:00Z` (morning was 09:00, 31min late)
- **Expected**: isOverdue = true (09:31 > 09:30). deadline = 02:00, now = 09:31, well past deadline+30min (02:30). isPastDeadline = true. cycleExpired = true. Status = **red**. Only "Clear & Discard".
- **Risk**: At 25C with evening clear at 18:00, the 8h deadline (02:00) expires long before the morning action at 09:00. So ANY overdue morning action is automatically past deadline too. The yellow "overdue" state is unreachable for morning actions at 25C default schedule.

## DL-027: Overdue action reachable at 25C (afternoon collect)

- **Setup**: lastClearTime = `2026-03-25T18:00:00Z`, lastClearTemp = '25', todayActions = [{key:'morning', type:'clear_discard', time:'2026-03-26T09:05:00Z'}], now = `2026-03-26T09:05:00Z`
- **Expected**: Morning done. Next = afternoon at 14:30. timeUntilMs = 14:30-09:05 = 5h25m. deadline = 02:00, now = 09:05 >> 02:30. isPastDeadline = true. Status = **red**.
- **Risk**: Even though the user completed the morning action, the cycle is already expired (deadline was 02:00). The afternoon action shows isPastDeadline. This is correct -- the 8h virgin window expired at 02:00.

## DL-028: Auto-skip with 2h overdue non-clear action

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', collectionsPerDay = 3, schedule = 18C/3cpd, todayActions = [], now = `2026-03-26T09:30:00Z` (deadline moment)
- **Expected**: Actions: morning collect (09:30), midday collect (14:00), afternoon collect+clear (17:00). Evening auto-done. Morning timeUntilMs = 0 (not >2h overdue). No auto-skip. Next = morning. timeUntilMs = 0 < 30min. Status = **yellow**. Buttons shown.
- **Risk**: With 3cpd, the auto-skip logic needs to correctly preserve the last clear (afternoon collect_clear).

## DL-029: Auto-skip cascade -- morning >2h overdue, midday >2h overdue

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', collectionsPerDay = 3, schedule = 18C/3cpd, todayActions = [], now = `2026-03-26T16:30:00Z`
- **Expected**: deadline = 09:30. Grace ended 10:00. now = 16:30 >> 10:00. isPastDeadline = true. cycleExpired = true. Morning (09:30) timeUntilMs = -7h. Midday (14:00) timeUntilMs = -2.5h. Afternoon (17:00) timeUntilMs = +30min. Auto-skip: morning is first, >2h overdue, later actions exist. Morning is collect (not clear). Skip it. Now midday is first, >2h overdue. Midday is collect. Afternoon exists and is collect_clear (a clear type). Skip midday. Now afternoon is first, timeUntilMs = +30min, not >2h overdue. Stop. But isPastDeadline = true on afternoon. Status = **red**. Only "Clear & Discard".
- **Risk**: Auto-skip runs but isPastDeadline still dominates. The skipped actions shouldn't resurface.

## DL-030: Auto-skip protection -- last clear cannot be skipped

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', collectionsPerDay = 2, todayActions = [{key:'morning', type:'collect', time:'2026-03-26T09:35:00Z'}], now = `2026-03-26T09:50:00Z` (within grace)
- **Expected**: deadline = 09:30. Grace ends 10:00. now in grace. Morning done (actionMs 09:35 >= clearMs 17:30, and !cycleExpired since grace not ended). Next = afternoon collect_clear (17:00). It's the only remaining action. timeUntilMs = 17:00-09:50 = 7h10m. Not overdue. But isInGracePeriod = true (now > deadline, now <= deadline+30min). Status = **red**. Buttons: "Collect (late)" + "Discard".
- **Risk**: The afternoon action isn't overdue but the whole cycle is in grace. The last clear protection is irrelevant here since nothing is >2h overdue.

## DL-031: Auto-skip tries to skip the only remaining clear

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', collectionsPerDay = 2, todayActions = [{key:'morning', type:'collect', time:'2026-03-26T09:35:00Z'}], now = `2026-03-26T19:30:00Z` (afternoon was 17:00, now 2.5h overdue)
- **Expected**: cycleExpired = true (09:30 + 30min = 10:00, now = 19:30 >> 10:00). Morning collect is NOT in doneKeys (cycleExpired invalidates). Actions: morning (09:30, -10h), afternoon (17:00, -2.5h). Morning timeUntilMs = -10h < -2h. Is morning a clear? No, it's 'collect'. Is there a later action? Yes (afternoon). But check: `!result.slice(1).some(a => isClear(a.type))` -- afternoon is 'collect_clear' which IS a clear type. So the break condition is false (there IS a clear later). Skip morning. Now afternoon is first, timeUntilMs = -2.5h < -2h. Afternoon is 'collect_clear' (a clear type). `result.slice(1)` is empty, so no later clears exist. The `isClear && !result.slice(1).some(...)` condition: isClear=true, slice(1) has no clears = true. Break! Afternoon is NOT skipped. Status = **red** (isPastDeadline). Only "Clear & Discard".
- **Risk**: Auto-skip correctly preserves the last clear action even when it's >2h overdue. If this protection fails, no actions remain and status would show green (no actions = green), hiding the expired state.

## DL-032: Deadline at exactly midnight

- **Setup**: lastClearTime = `2026-03-25T16:00:00Z`, lastClearTemp = '25', todayActions = [], now = `2026-03-26T00:00:00Z` (midnight = exactly 8h later)
- **Expected**: deadline = midnight. now = deadline exactly. `now > deadline` = false. Not in grace. Status depends on next action. Morning at 09:00 is 9h away. Status = **green**.
- **Risk**: Midnight boundary -- Date objects crossing day boundary. `baseDay.setHours(0,0,0,0)` should work correctly.

## DL-033: Deadline crossing DST spring-forward (if applicable)

- **Setup**: lastClearTime = `2026-03-29T01:00:00+01:00` (Europe, just before spring forward at 02:00), lastClearTemp = '25', todayActions = [], now = `2026-03-29T10:00:00+02:00` (after DST change, 8h wall-clock later but 7h UTC later)
- **Expected**: Since all times are ISO/UTC internally, deadline = clearTime + 8h in UTC. `2026-03-29T00:00:00Z + 8h = 08:00:00Z`. Now in UTC = `2026-03-29T08:00:00Z`. Exactly at deadline. Not past. Status depends on actions.
- **Risk**: If implementation uses local time instead of UTC for arithmetic, the DST jump would make 8h of wall-clock time = 7h real time, and the deadline would appear to be reached 1h early.

## DL-034: Grace period exactly at action scheduled time (18C coincidence)

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T09:30:00Z`
- **Expected**: deadline = 09:30. Morning collect also at 09:30. At exactly 09:30: now = deadline, not past. Morning timeUntilMs = 0, which is < 30min. Status = **yellow**. Buttons shown (0 <= 20min). Normal collect button.
- **Risk**: The deadline and the scheduled action coincide. The user should be able to collect right at deadline without seeing "expired". This is the critical "just in time" scenario.

## DL-035: One second into grace with action at deadline time (18C)

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T09:30:01Z`
- **Expected**: now > deadline (09:30:00). isInGracePeriod = true. Morning collect timeUntilMs = -1s. Status = **red** (isInGracePeriod). Buttons: "Collect (late)" + "Discard".
- **Risk**: User is 1 second late and immediately gets red status + "late" label. This is technically correct but may feel harsh.

## DL-036: Rapid clears -- second clear 1 hour after first

- **Setup**: First clear at 17:30, then user clears again at 18:30. lastClearTime = `2026-03-25T18:30:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T09:30:00Z`
- **Expected**: deadline = 18:30 + 16h = `2026-03-26T10:30:00Z`. Morning collect at 09:30 -- timeUntilMs = 0. Deadline is 10:30, not yet reached. Status = **yellow** (timeUntilMs < 30min). Buttons shown. Normal collect.
- **Risk**: The new clear time shifts the deadline forward. Morning collect scheduled at 09:30 is before the old deadline but well within the new deadline. The `suggestedMs` computation: baseDay = 2026-03-25 00:00, scheduled morning 09:30 = 2026-03-25T09:30. Is 09:30 <= clearMs (18:30)? Yes. So suggestedMs += 86400000 = 2026-03-26T09:30. Correct.

## DL-037: Rapid clears -- clear, collect, clear again within minutes

- **Setup**: lastClearTime = `2026-03-25T17:45:00Z` (re-cleared at 17:45 after original 17:30), lastClearTemp = '18', todayActions = [{key:'morning', type:'collect', time:'2026-03-25T17:40:00Z'}], now = `2026-03-26T09:30:00Z`
- **Expected**: New cycle starts at 17:45. Morning collect from todayActions at 17:40 has actionMs = 17:40 < clearMs = 17:45, so it's NOT in doneKeys (belongs to previous cycle). Morning action at 09:30 is available. deadline = 17:45 + 16h = 09:45. timeUntilMs = 0. Status = **yellow**.
- **Risk**: The todayActions from the previous cycle bleed into the new cycle if the time check fails. The `actionMs >= clearMs` guard prevents this.

## DL-038: Clear at 25C but overnight at 18C (temperature override)

- **Setup**: overnightAt18 = true, lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '25' (user chose "No, room temp"), todayActions = [], now = `2026-03-26T01:30:00Z`
- **Expected**: `cycleAt18 = lastClearTemp === '18'` = false. Window = 8h. deadline = 01:30. Exactly at deadline. Not past. The morning action type = `isMorningCollect ? 'collect' : 'clear_discard'`. Since cycleAt18 = false, isMorningCollect = false. Morning = 'clear_discard'. Status depends on next action timing.
- **Risk**: `overnightAt18` says 18C but `lastClearTemp` overrides to 25C for this cycle. If code uses `overnightAt18` instead of `lastClearTemp` for deadline, window would be 16h instead of 8h.

## DL-039: Clear at 18C when default is 25C (reverse override)

- **Setup**: overnightAt18 = false, lastClearTime = `2026-03-25T18:00:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T09:00:00Z`
- **Expected**: cycleAt18 = true (lastClearTemp = '18'). Window = 16h. deadline = 10:00. Morning action is 'collect' (isMorningCollect = true since cycleAt18 = true). timeUntilMs for morning at 09:30 = +30min. Status = **green** (30min >= 30min, not strictly less). Buttons hidden (30min > 20min).
- **Risk**: The override makes this a 16h window even though the stock is normally 25C. If the UI shows "8h window" text but uses 16h internally, user gets confused.

## DL-040: All actions completed before deadline (happy path)

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [{key:'morning', type:'collect', time:'2026-03-26T09:30:00Z'}, {key:'afternoon', type:'collect_clear', time:'2026-03-26T17:00:00Z'}], now = `2026-03-26T09:35:00Z` (still within deadline)
- **Expected**: deadline = 09:30. now = 09:35 > deadline. isInGracePeriod = true (09:35 <= 10:00). But morning is done, afternoon is done (actionMs 17:00 >= clearMs -- wait, 17:00 on Mar 26 > 17:30 on Mar 25). Both in doneKeys. computeNextActions returns []. getVcsStatus: no actions = **green**. Buttons hidden.
- **Risk**: All actions done returns green even during grace period. This is correct -- there's nothing left to do. But the afternoon action time (17:00) is in the future relative to now (09:35). In practice this can't happen (you can't log a future action), but the code allows it.

## DL-041: Progress bar at 50% of window (25C)

- **Setup**: lastClearTime = `2026-03-25T18:00:00Z`, lastClearTemp = '25', todayActions = [], now = `2026-03-25T22:00:00Z` (4h into 8h window)
- **Expected**: `vcsWindowProgress` tracks toward next scheduled action, not deadline. Next action = morning at 09:00 (Mar 26). Progress = (22:00 - 18:00) / (09:00 next day - 18:00) = 4h / 15h = 0.267. Not 0.5 as deadline-based would suggest. Status = **green**.
- **Risk**: Progress bar does NOT represent deadline proximity. A user seeing 27% progress might think they have 73% of the deadline left, but actually 50% of the deadline has elapsed. The progress tracks to next action, not to expiry.

## DL-042: Progress bar past deadline with actions remaining

- **Setup**: lastClearTime = `2026-03-25T18:00:00Z`, lastClearTemp = '25', todayActions = [], now = `2026-03-26T09:15:00Z` (morning collect at 09:00 is 15min late, deadline was 02:00)
- **Expected**: Progress toward morning action (09:00). elapsed = 15h15m, span = 15h. Progress = 15.25/15 = 1.0 (clamped). `progress > 0.9` triggers red color on time display. But isPastDeadline = true. Status = **red**.
- **Risk**: Progress bar at 100% combined with red status. The progress bar is clamped to 1.0 but the underlying time keeps advancing.

## DL-043: Grace period with 3 collections per day -- midday action pending

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', collectionsPerDay = 3, schedule = 18C/3cpd, todayActions = [{key:'morning', type:'collect', time:'2026-03-26T09:30:00Z'}], now = `2026-03-26T09:45:00Z`
- **Expected**: deadline = 09:30. now in grace (09:45 <= 10:00). Morning done. Next = midday (14:00). timeUntilMs = 4h15m. isInGracePeriod = true (from deadline). Status = **red**. Buttons: "Collect (late)" + "Discard" for midday.
- **Risk**: The midday action is 4h away but the cycle is in grace. Should the user be urged to collect midday NOW (late) or wait until 14:00? The code shows late buttons because isInGracePeriod is a cycle-wide flag.

## DL-044: Action button visibility threshold -- exactly 20min away

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T09:10:00Z` (morning at 09:30, 20min away)
- **Expected**: timeUntilMs = 20 * 60000 = 1200000. Button condition: `timeUntilMs <= 20 * 60000` = true (<=, not <). Buttons **shown**. Status: timeUntilMs = 1200000 < 1800000 (30min). Status = **yellow**. Normal collect button.
- **Risk**: The button threshold uses `<=` so exactly 20min shows buttons. The status threshold uses `<` so 30min exactly does NOT show yellow, but 20min does.

## DL-045: Action button visibility -- 21min away

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T09:09:00Z` (morning at 09:30, 21min away)
- **Expected**: timeUntilMs = 21min = 1260000. Button condition: 1260000 <= 1200000 = false. Buttons **hidden**. Status: 1260000 < 1800000 = true. Status = **yellow**. Yellow dot visible but no buttons.
- **Risk**: Window of 21-30min where yellow status shows but no buttons exist. User sees urgency but can't act through the dashboard.

## DL-046: Negative timeUntilMs with buttons (overdue action)

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = [], now = `2026-03-26T09:35:00Z` (morning at 09:30, 5min late, within deadline grace)
- **Expected**: timeUntilMs = -5min = -300000. Button condition: -300000 <= 1200000 = true. Buttons shown. isInGracePeriod = true (now > 09:30 deadline, now <= 10:00). Status = **red**. Buttons: "Collect (late)" + "Discard".
- **Risk**: Negative timeUntilMs always passes the `<= 20min` check, so overdue actions always show buttons. This is correct behavior.

## DL-047: VCS disabled -- no deadline computation

- **Setup**: VCS with `enabled: false`, lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = '18', todayActions = []
- **Expected**: `computeNextActions` returns [] immediately. `getVcsStatus` returns 'none'. No deadline calculated. No buttons. No status color.
- **Risk**: A disabled VCS with stale data should not trigger any alerts. If `enabled` check is missing, old deadline data could surface.

## DL-048: VCS re-enabled after being disabled for days

- **Setup**: VCS with `enabled: true`, lastClearTime = `2026-03-20T17:30:00Z` (6 days ago), lastClearTemp = '18', todayActions = [], now = `2026-03-26T10:00:00Z`
- **Expected**: deadline = `2026-03-21T09:30:00Z`. Grace ended `2026-03-21T10:00:00Z`. cycleExpired = true. isPastDeadline = true. Status = **red**. Only "Clear & Discard".
- **Risk**: After re-enabling, the user should be forced to do a fresh clear before any collections. The expired state correctly enforces this. But if the UI doesn't show the "Clear & Discard" button prominently, the user might not know what to do.

## DL-049: Deadline with lastClearTemp missing (legacy data)

- **Setup**: lastClearTime = `2026-03-25T17:30:00Z`, lastClearTemp = undefined (or null), overnightAt18 = true, todayActions = [], now = `2026-03-26T09:30:00Z`
- **Expected**: `cycleAt18 = lastClearTemp ? lastClearTemp === '18' : overnightAt18` = `undefined ? ... : true` = true. Window = 16h. deadline = 09:30. Falls back to overnightAt18 for cycle behavior. Status as per DL-034.
- **Risk**: Legacy VCS objects created before lastClearTemp was added might not have this field. The fallback to overnightAt18 is correct but should be tested.

## DL-050: Simultaneous deadline and auto-skip edge case (25C, 3cpd)

- **Setup**: lastClearTime = `2026-03-25T18:00:00Z`, lastClearTemp = '25', collectionsPerDay = 3, schedule = {eveningClear:'18:00', morningCollect:'09:00', middayCollect:'12:00', afternoonCollect:'16:30'}, todayActions = [], now = `2026-03-26T14:30:00Z`
- **Expected**: deadline = 02:00. Grace ended 02:30. cycleExpired = true. All todayActions invalidated. Actions: morning (09:00, -5.5h), midday (12:00, -2.5h), afternoon (16:30, +2h). Auto-skip: morning timeUntilMs = -5.5h < -2h. Morning is 'clear_discard' (25C, so isMorningCollect = false). Is 'clear_discard' a clear type? Yes. Check: are there later clears? Midday is 'collect' (no). Afternoon is 'collect_clear' (yes, it's a clear). So there IS a later clear. Skip morning. Now midday is first, timeUntilMs = -2.5h < -2h. Midday is 'collect'. Skip (later actions exist). Now afternoon is first, timeUntilMs = +2h. Not >2h overdue. Stop. isPastDeadline = true. Status = **red**. Only "Clear & Discard".
- **Risk**: The auto-skip logic for 'clear_discard' at morning position: the code checks `['clear', 'clear_discard', 'collect_clear'].includes(result[0].type)` then checks if there are later clears. If there are, it skips. If morning clear_discard is the ONLY clear and gets skipped incorrectly, the cycle has no way to restart.
