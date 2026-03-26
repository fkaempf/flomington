# VCS Temperature Logic -- 50 Test Cases

All tests target the interaction between `overnightAt18`, `lastClearTemp`, `cycleAt18`, the "Moved to 18C?" confirmation dialog, deadline computation, next-action type derivation, and toast messages.

Key formula under test:
```
cycleAt18 = lastClearTemp ? lastClearTemp === '18' : overnightAt18
windowMs  = cycleAt18 ? 16h : 8h
deadline  = lastClearTime + windowMs
morning action = cycleAt18 ? 'collect' : 'clear_discard'
```

Schedule defaults referenced:
- 18_2: evening 17:30, morning 09:30, afternoon 17:00
- 25_2: evening 18:00, morning 09:00, afternoon 14:30

---

## TMP-001: First clear on fresh VCS with overnightAt18=true

**Setup:** overnightAt18=true, lastClearTemp=null (fresh makeVcs just ran -- actually `makeVcs` sets lastClearTemp='18'), lastClearTime=now.
**Action:** VCS is created via makeVcs(true, 2, schedule).
**Expected:** lastClearTemp='18', virginDeadline = now + 16h, cycleAt18=true. Morning action type = 'collect'. Toast: none (creation, not user action).
**Risk:** If makeVcs forgets to set lastClearTemp, cycleAt18 falls back to overnightAt18 (same result here, but diverges in TMP-010).

---

## TMP-002: First clear on fresh VCS with overnightAt18=false

**Setup:** overnightAt18=false, created via makeVcs(false, 2, schedule).
**Action:** VCS is created.
**Expected:** lastClearTemp='25', virginDeadline = now + 8h, cycleAt18=false. Morning action type = 'clear_discard'. Label for evening clear = 'Clear' (not 'Clear -> 18C').
**Risk:** Window accidentally set to 16h if overnightAt18 coercion goes wrong.

---

## TMP-003: Evening clear on overnightAt18=true stock, user confirms "Yes, 18C"

**Setup:** overnightAt18=true, lastClearTemp='18', lastClearTime=yesterday 17:30.
**Action:** User taps evening clear button. 18C confirmation dialog appears. User taps "Yes, 18C".
**Expected:** logAction called with temp='18'. lastClearTemp='18', lastClearTime=now, virginDeadline=now+16h. Toast: "StockName: Cleared -> 18C". todayActions reset to [this action].
**Risk:** Dialog not appearing because overnightAt18 check fails.

---

## TMP-004: Evening clear on overnightAt18=true stock, user says "No, RT"

**Setup:** overnightAt18=true, lastClearTemp='18', lastClearTime=yesterday 17:30.
**Action:** User taps evening clear. 18C dialog appears. User taps "No, RT".
**Expected:** logAction called with temp='25'. lastClearTemp='25', lastClearTime=now, virginDeadline=now+8h. cycleAt18 becomes false for this cycle. Morning action switches to 'clear_discard'. Toast: "StockName: Cleared -> 18C" (BUG RISK: toast uses overnightAt18, not lastClearTemp).
**Risk:** Toast says "Cleared -> 18C" even though user chose RT, because toast message is derived from `v.overnightAt18` not the actual temp chosen. This is a known inaccuracy.

---

## TMP-005: Evening clear on overnightAt18=false stock -- no dialog shown

**Setup:** overnightAt18=false, lastClearTemp='25', lastClearTime=yesterday 18:00.
**Action:** User taps evening clear button.
**Expected:** No 18C confirmation dialog appears (condition `v.overnightAt18 && next.key === 'evening'` is false). logAction called directly with no temp arg. lastClearTemp defaults to '25' (via `temp || (v.overnightAt18 ? '18' : '25')`). Deadline = now + 8h. Toast: "StockName: Cleared".
**Risk:** If overnightAt18 is undefined instead of false, falsy check passes but edge case with `!== false` elsewhere could behave differently.

---

## TMP-006: Morning action after overnight at 18C -- collect type

**Setup:** overnightAt18=true, lastClearTemp='18', lastClearTime=yesterday 17:30. Now = today 09:30.
**Action:** computeNextActions runs. Evening key is auto-marked done. Morning is next.
**Expected:** Morning action type = 'collect' (not 'clear_discard'). Label = "Morning collect". 16h window means deadline = yesterday 17:30 + 16h = today 09:30. Action is exactly at deadline.
**Risk:** If cycleAt18 computed incorrectly, morning becomes 'clear_discard' and user discards good virgins.

---

## TMP-007: Morning action after overnight at RT (25C) -- clear_discard type

**Setup:** overnightAt18=true, lastClearTemp='25' (user said "No, RT" last evening). lastClearTime=yesterday 18:00. Now = today 09:00.
**Action:** computeNextActions runs.
**Expected:** cycleAt18 = (lastClearTemp === '18') = false. Morning action type = 'clear_discard'. Label = "Morning clear + discard". 8h window means deadline = yesterday 18:00 + 8h = today 02:00. Deadline already passed. This cycle is expired (now > deadline + 30min grace).
**Risk:** User expects to collect virgins because overnightAt18=true, but lastClearTemp overrides to RT behavior. Mismatch between displayed "18C" badge and actual behavior.

---

## TMP-008: Deadline calculation at 18C -- 16 hour window

**Setup:** overnightAt18=true, lastClearTemp='18', lastClearTime='2026-03-26T17:30:00.000Z'.
**Action:** computeDeadline called.
**Expected:** Deadline = '2026-03-27T09:30:00.000Z' (17:30 + 16h = 09:30 next day). getVirginWindowH(true) = 16.
**Risk:** Off-by-one in hour math, DST transitions adding/removing an hour.

---

## TMP-009: Deadline calculation at 25C -- 8 hour window

**Setup:** overnightAt18=false, lastClearTemp='25', lastClearTime='2026-03-26T18:00:00.000Z'.
**Action:** computeDeadline called.
**Expected:** Deadline = '2026-03-27T02:00:00.000Z' (18:00 + 8h = 02:00 next day). getVirginWindowH(false) = 8.
**Risk:** Same DST concern. Also the deadline lands at 2 AM, which means by morning it will always be expired at RT.

---

## TMP-010: cycleAt18 fallback when lastClearTemp is null

**Setup:** overnightAt18=true, lastClearTemp=null (hypothetical: field cleared or legacy data), lastClearTime=some time.
**Action:** computeNextActions evaluates cycleAt18.
**Expected:** `lastClearTemp ? ... : overnightAt18` -- null is falsy, so cycleAt18 = overnightAt18 = true. 16h window, morning = collect.
**Risk:** If lastClearTemp is empty string '' instead of null, '' is also falsy -- same fallback. But if it is '0' or some unexpected value, it would be truthy and check `=== '18'` which would be false, giving cycleAt18=false incorrectly.

---

## TMP-011: cycleAt18 fallback when lastClearTemp is undefined

**Setup:** overnightAt18=false, lastClearTemp=undefined, lastClearTime=some time.
**Action:** computeNextActions evaluates cycleAt18.
**Expected:** undefined is falsy. cycleAt18 = overnightAt18 = false. 8h window, morning = clear_discard.
**Risk:** None specific, but indicates old VCS objects created before lastClearTemp was added still work correctly.

---

## TMP-012: Switching from 18C to RT mid-cycle -- deadline shrinks

**Setup:** overnightAt18=true, lastClearTemp='18', lastClearTime=today 17:30. Deadline = tomorrow 09:30.
**Action:** User performs an evening clear action (somehow a second clear in same window) and chooses "No, RT".
**Expected:** New lastClearTime=now, lastClearTemp='25', new deadline = now + 8h. The 16h deadline is discarded. todayActions reset.
**Risk:** If the user expected the old 16h window to persist and the new clear shrinks it, morning collect virgins that were viable under 16h window are now expired under 8h.

---

## TMP-013: Switching from RT to 18C mid-cycle -- deadline extends

**Setup:** overnightAt18=true, lastClearTemp='25' (previously chose RT). lastClearTime=today 18:00.
**Action:** User somehow triggers another clear and chooses "Yes, 18C".
**Expected:** New lastClearTime=now, lastClearTemp='18', new deadline = now + 16h. Window extends significantly.
**Risk:** Virgins from the RT-temperature environment are now assumed to be at 18C. Biologically incorrect if the vial was not actually moved.

---

## TMP-014: overnightAt18=false but user chose 18C previously -- badge mismatch

**Setup:** overnightAt18=false, lastClearTemp='18' (somehow set, e.g. manual data edit or cross-VCS shared state).
**Action:** Display renders. computeNextActions runs.
**Expected:** Badge shows "25C" (uses overnightAt18). But cycleAt18=true (lastClearTemp='18'). Morning action = 'collect'. 16h window. User sees 25C label but system behaves as 18C.
**Risk:** UI/logic mismatch. User thinks it is a 25C stock but the engine uses 18C timing. This scenario should not happen in normal flow because dialog only appears when overnightAt18=true, but could occur with data corruption.

---

## TMP-015: overnightAt18=true but lastClearTemp='25' -- dialog still appears on next evening

**Setup:** overnightAt18=true, lastClearTemp='25' (user said RT last time). Evening clear action comes up.
**Action:** User taps evening clear button.
**Expected:** The 18C confirmation dialog appears because the condition is `v.overnightAt18 && next.key === 'evening'`. overnightAt18 is still true. User gets the choice again.
**Risk:** None -- this is correct behavior. User can switch back to 18C or stay at RT each evening.

---

## TMP-016: Non-evening clear action on overnightAt18=true stock -- no dialog

**Setup:** overnightAt18=true, lastClearTemp='18'. Morning collect action is next.
**Action:** User taps "Collected" button for morning collect.
**Expected:** No 18C dialog (condition checks `next.key === 'evening'`). Action logged as 'collect', no temp parameter. lastClearTemp unchanged. lastClearTime unchanged (only clears update it).
**Risk:** If the key check is missing, dialog would spuriously appear on morning/midday/afternoon actions.

---

## TMP-017: collect_clear (afternoon) on overnightAt18=true with evening key

**Setup:** overnightAt18=true, lastClearTemp='18'. All prior actions done. Afternoon collect_clear is next, and its key is 'afternoon' not 'evening'.
**Action:** User taps "Collect + Clear".
**Expected:** No dialog because `next.key === 'evening'` is false (key is 'afternoon'). logAction called as 'clear' directly. lastClearTemp defaults to '18' (from `v.overnightAt18 ? '18' : '25'`).
**Risk:** The afternoon clear silently sets temp back to the overnightAt18 default without asking. If user had overridden to RT earlier, this would reset to 18C without confirmation.

---

## TMP-018: collect_clear with key='evening' on overnightAt18=true -- dialog and bank prompt

**Setup:** overnightAt18=true. The last remaining action has type='collect_clear' and key='evening' (edge case from schedule configuration).
**Action:** User taps "Collect + Clear".
**Expected:** Code path: `next.type === 'collect_clear' && v.overnightAt18 && next.key === 'evening'` is true. Both bank prompt and 18C confirmation are shown. User must answer both.
**Risk:** Two overlapping prompts. If user dismisses one, the other may be orphaned.

---

## TMP-019: Grace period behavior at 18C -- 16h + 30min

**Setup:** overnightAt18=true, lastClearTemp='18', lastClearTime=yesterday 17:30. Deadline = today 09:30. Now = today 09:45 (15min past deadline, within 30min grace).
**Action:** computeNextActions runs.
**Expected:** isInGracePeriod = true, isPastDeadline = false. Status = 'red'. Message = "LATE - collect now or discard". Collect (late) and Discard buttons shown.
**Risk:** If grace period uses wrong window size (8h instead of 16h), the deadline would be yesterday 01:30, and we would be past grace, triggering "Expired" instead.

---

## TMP-020: Grace period behavior at 25C -- 8h + 30min

**Setup:** overnightAt18=false, lastClearTemp='25', lastClearTime=yesterday 18:00. Deadline = today 02:00. Now = today 02:20.
**Action:** computeNextActions runs.
**Expected:** isInGracePeriod = true (now > deadline, now <= deadline + 30min). Status = 'red'. User can still collect (late).
**Risk:** In practice nobody is using the app at 2:20 AM, so this state would only be encountered the next morning when it is already fully expired.

---

## TMP-021: Past deadline at 18C -- virgins mated

**Setup:** overnightAt18=true, lastClearTemp='18', lastClearTime=yesterday 17:30. Deadline = today 09:30. Now = today 10:15 (45min past, beyond grace).
**Action:** computeNextActions runs.
**Expected:** isPastDeadline = true. cycleExpired = true (nowMs > deadline + 30min). All todayActions from previous window are discarded. Status = 'red'. Message = "Expired - clear & discard". Only "Clear & Discard" button shown.
**Risk:** If cycleExpired incorrectly includes the grace period, actions done during grace window would be lost.

---

## TMP-022: Past deadline at 25C -- always expired by morning

**Setup:** overnightAt18=false, lastClearTemp='25', lastClearTime=yesterday 18:00. Deadline = today 02:00. Now = today 09:00 (7 hours past deadline).
**Action:** computeNextActions runs.
**Expected:** isPastDeadline = true, cycleExpired = true. Only "Clear & Discard" available. This is the expected normal flow for 25C overnight: virgins from overnight are already mated.
**Risk:** User might not understand why they cannot collect in the morning. The clear_discard morning action was designed for this, but if the cycle is expired, even that scheduled action gets the expired treatment.

---

## TMP-023: vcsKey maps overnightAt18 to schedule defaults

**Setup:** overnightAt18=true, collectionsPerDay=2.
**Action:** vcsKey(true, 2) called.
**Expected:** Returns '18_2'. VCS_DEFAULTS['18_2'] = { eveningClear: '17:30', morningCollect: '09:30', afternoonCollect: '17:00' }.
**Risk:** If vcsKey uses lastClearTemp instead of overnightAt18, schedule defaults would shift when user temporarily chooses RT.

---

## TMP-024: vcsKey for overnightAt18=false, 3 collections

**Setup:** overnightAt18=false, collectionsPerDay=3.
**Action:** vcsKey(false, 3) called.
**Expected:** Returns '25_3'. VCS_DEFAULTS['25_3'] = { eveningClear: '18:00', morningCollect: '09:00', middayCollect: '12:00', afternoonCollect: '16:30' }.
**Risk:** 3-collection schedule includes midday. If collectionsPerDay check in computeNextActions fails, midday action is dropped.

---

## TMP-025: Toast message for 'clear' on overnightAt18=true stock

**Setup:** overnightAt18=true, any lastClearTemp.
**Action:** logAction('clear', 'evening', '18').
**Expected:** Toast = "StockName: Cleared -> 18C". The toast message map uses `v.overnightAt18 ? 'Cleared -> 18C' : 'Cleared'`.
**Risk:** Toast always says "Cleared -> 18C" for overnightAt18=true stocks, even if the user just chose "No, RT". The temp parameter affects lastClearTemp but NOT the toast.

---

## TMP-026: Toast message for 'clear' on overnightAt18=true stock when user chose RT

**Setup:** overnightAt18=true, user chose "No, RT" in the dialog.
**Action:** logAction('clear', 'evening', '25').
**Expected:** Toast = "StockName: Cleared -> 18C" (because toast uses overnightAt18, not the temp arg). lastClearTemp = '25'. Deadline = now + 8h.
**Risk:** Misleading toast. User sees "Cleared -> 18C" but the system recorded '25'. They may think it is at 18C when it is not.

---

## TMP-027: Toast message for 'clear_discard'

**Setup:** overnightAt18=true or false.
**Action:** logAction('clear_discard', 'morning').
**Expected:** Toast = "StockName: Cleared & discarded". Same for both temperatures.
**Risk:** None -- clear_discard toast does not mention temperature.

---

## TMP-028: Toast message for 'collect'

**Setup:** Any temperature.
**Action:** logAction('collect', 'morning').
**Expected:** Toast = "StockName: Collected". No temperature reference.
**Risk:** None.

---

## TMP-029: Alternating 18C and RT choices -- cycle 1 at 18C

**Setup:** overnightAt18=true. Day 1 evening: user chooses "Yes, 18C".
**Action:** Evening clear at 17:30, temp='18'.
**Expected:** lastClearTemp='18', deadline = 17:30 + 16h = 09:30 next day. Morning action = 'collect'.
**Risk:** None for this cycle alone.

---

## TMP-030: Alternating 18C and RT choices -- cycle 2 switches to RT

**Setup:** Continuing from TMP-029. Day 2 evening: user completes morning collect, afternoon collect+clear. Evening clear dialog appears, user chooses "No, RT".
**Action:** Evening clear at 17:30, temp='25'.
**Expected:** lastClearTemp='25', deadline = 17:30 + 8h = 01:30 next day. Morning action = 'clear_discard'. cycleAt18=false.
**Risk:** Schedule times are still from '18_2' defaults (set at VCS creation), but behavior follows '25' window. The 09:30 morning slot now shows 'clear_discard' instead of 'collect'.

---

## TMP-031: Alternating 18C and RT choices -- cycle 3 back to 18C

**Setup:** Continuing from TMP-030. Day 3: cycle 2 expired (8h window). User clears and chooses "Yes, 18C" again.
**Action:** Evening clear, temp='18'.
**Expected:** lastClearTemp='18', deadline = now + 16h. Morning reverts to 'collect'. System oscillates correctly.
**Risk:** todayActions array accumulates across days if not reset. Check that clear resets todayActions to [current action only].

---

## TMP-032: Always choosing RT on an overnightAt18=true stock -- 5 consecutive cycles

**Setup:** overnightAt18=true, user always chooses "No, RT" every evening.
**Action:** 5 evening clears, all with temp='25'.
**Expected:** Every cycle: lastClearTemp='25', 8h window, morning = clear_discard. The 18C dialog appears every single evening (overnightAt18 never changes). Badge still shows "18C".
**Risk:** User fatigue from repeated dialog. overnightAt18 flag never updates to reflect actual usage pattern. Badge is permanently misleading.

---

## TMP-033: Always choosing 18C on an overnightAt18=true stock -- steady state

**Setup:** overnightAt18=true, user always chooses "Yes, 18C".
**Action:** Multiple cycles, all with temp='18'.
**Expected:** Every cycle: lastClearTemp='18', 16h window, morning = collect. Dialog appears every evening. Consistent behavior.
**Risk:** Minimal -- this is the happy path.

---

## TMP-034: overnightAt18=false stock -- no dialog ever, always 25C

**Setup:** overnightAt18=false, multiple cycles.
**Action:** Evening clears, morning clears, afternoon collects.
**Expected:** No 18C dialog ever. lastClearTemp always defaults to '25'. 8h window. Morning always = clear_discard. Toast: "Cleared" (no "-> 18C").
**Risk:** If user physically moves vials to 18C but the stock is marked as RT, there is no way to override within the VCS flow.

---

## TMP-035: VCS creation from cross entering "collecting virgins" with overnightAt18 undefined

**Setup:** Cross with overnightAt18=undefined. Status transitions to 'collecting virgins'.
**Action:** `makeVcs(c.overnightAt18 !== false, 2, ...)` is called. `undefined !== false` is true.
**Expected:** makeVcs(true, 2, ...) -- stock is treated as 18C. lastClearTemp='18', 16h window.
**Risk:** Crosses that never had overnightAt18 set default to 18C. If the cross is actually at RT, user gets wrong window. The `!== false` pattern means only explicit `false` gives RT.

---

## TMP-036: VCS creation from cross with overnightAt18=false

**Setup:** Cross with overnightAt18=false. Status transitions to 'collecting virgins'.
**Action:** `makeVcs(false, 2, ...)` called.
**Expected:** overnightAt18=false, lastClearTemp='25', 8h window, morning = clear_discard.
**Risk:** None -- explicit false correctly routes to RT.

---

## TMP-037: Deadline recalculation after temp change -- 18C to 25C

**Setup:** overnightAt18=true, lastClearTemp='18', lastClearTime=today 17:30, virginDeadline=tomorrow 09:30.
**Action:** User triggers another clear (e.g., during grace period after first window). Chooses "No, RT".
**Expected:** lastClearTime = now, lastClearTemp = '25', virginDeadline = now + 8h. Old 16h deadline is fully replaced. computeDeadline(now, false) = now + 8h.
**Risk:** If virginDeadline field is not recalculated and the UI uses the stale virginDeadline instead of recomputing from lastClearTime + window, the displayed deadline would be wrong.

---

## TMP-038: Deadline recalculation after temp change -- 25C to 18C

**Setup:** overnightAt18=true, lastClearTemp='25', lastClearTime=today 18:00, virginDeadline=today 02:00 (next day).
**Action:** New evening clear, user chooses "Yes, 18C".
**Expected:** lastClearTime = now, lastClearTemp = '18', virginDeadline = now + 16h. Window extends.
**Risk:** Same as TMP-037 -- stale virginDeadline field.

---

## TMP-039: computeDeadline with null clearIso

**Setup:** lastClearTime = null.
**Action:** computeDeadline(null, true) called.
**Expected:** Returns null. No deadline computed.
**Risk:** Downstream code must handle null deadline. If `deadline` is used in arithmetic without null check, NaN propagates.

---

## TMP-040: getVirginWindowH boundary values

**Setup:** N/A.
**Action:** getVirginWindowH(true) and getVirginWindowH(false).
**Expected:** 16 and 8 respectively. In milliseconds: 57600000 and 28800000.
**Risk:** If someone passes a string '18' instead of boolean true, truthy coercion means it still returns 16. But passing 0, '', null, undefined all return 8.

---

## TMP-041: Evening clear on expired cycle (isPastDeadline=true) -- no dialog shown

**Setup:** overnightAt18=true, lastClearTemp='18', cycle expired (past deadline + grace).
**Action:** UI shows "Clear & Discard" button for expired state.
**Expected:** The expired-state Clear & Discard button calls `logCrossAction(c.id, 'clear_discard', next?.key || 'evening')` directly, WITHOUT checking for the 18C dialog. No confirmation appears.
**Risk:** After discarding, lastClearTemp defaults to `v.overnightAt18 ? '18' : '25'` = '18' since no temp arg passed. The next cycle silently assumes 18C without asking.

---

## TMP-042: Grace period discard on overnightAt18=true -- dialog appears

**Setup:** overnightAt18=true, lastClearTemp='18', in grace period. next.key = 'evening' (or defaulting to 'evening').
**Action:** User taps "Discard" button during grace period.
**Expected:** Condition `v.overnightAt18 && (next?.key || 'evening') === 'evening'` evaluates. If true, 18C confirmation dialog appears before discard. User must choose temp.
**Risk:** The key defaulting to 'evening' may cause the dialog to appear even when the actual next action key is not 'evening'.

---

## TMP-043: vcsWindowProgress uses overnightAt18 in fallback, not cycleAt18

**Setup:** overnightAt18=true, lastClearTemp='25'. No remaining actions (all done).
**Action:** vcsWindowProgress called.
**Expected:** Fallback path: `getVirginWindowH(vcs.overnightAt18)` = 16. But the actual window is 8h (based on lastClearTemp='25'). Progress bar tracks against wrong window size.
**Risk:** Progress bar shows ~50% when it should show ~100%. The bar appears green when the window is actually nearly expired. This is a bug in the fallback path of vcsWindowProgress.

---

## TMP-044: Display badge vs actual behavior when overnightAt18 and lastClearTemp disagree

**Setup:** overnightAt18=true, lastClearTemp='25'.
**Action:** UI renders the VCS card header.
**Expected:** Header shows "18C" (from `v.overnightAt18 ? '18C' : '25C'`). But actual cycle uses 8h window and clear_discard morning. Inconsistency between badge and behavior.
**Risk:** User sees "18C" and expects 16h window and morning collect, but system operates on RT timing. Could lead to missed collections.

---

## TMP-045: Evening clear action label depends on overnightAt18, not lastClearTemp

**Setup:** overnightAt18=true, lastClearTemp='25'.
**Action:** computeNextActions builds actions array.
**Expected:** Evening clear label = 'Clear -> 18C' (from `overnightAt18 ? 'Clear -> 18C' : 'Clear'`). This is correct: the label describes the intended action (clearing and moving to 18C), even if last cycle was at RT.
**Risk:** None -- label describes intent, not previous state.

---

## TMP-046: Three collections per day at 18C -- midday collect present

**Setup:** overnightAt18=true, lastClearTemp='18', collectionsPerDay=3. Schedule = VCS_DEFAULTS['18_3'].
**Action:** computeNextActions builds actions.
**Expected:** 4 actions: evening clear (17:30), morning collect (09:30), midday collect (14:00), afternoon collect+clear (17:00). All collect types (morning, midday) are 'collect' because cycleAt18=true.
**Risk:** If collectionsPerDay=3 but schedule.middayCollect is null, the midday action is silently dropped, leaving only 3 actions.

---

## TMP-047: Three collections per day at 25C -- midday collect present but morning is clear_discard

**Setup:** overnightAt18=false, lastClearTemp='25', collectionsPerDay=3. Schedule = VCS_DEFAULTS['25_3'].
**Action:** computeNextActions builds actions.
**Expected:** 4 actions: evening clear (18:00), morning clear_discard (09:00), midday collect (12:00), afternoon collect+clear (16:30). Morning is clear_discard, but midday is still 'collect'.
**Risk:** User might expect midday to also be clear_discard at 25C, but only morning changes based on temperature. Midday is always collect.

---

## TMP-048: Clear action without temp argument on overnightAt18=true stock (non-evening key)

**Setup:** overnightAt18=true, lastClearTemp='18'. User triggers a clear action that is not at the evening key (e.g., afternoon collect+clear with key='afternoon').
**Action:** logAction('clear', 'afternoon') -- no temp argument.
**Expected:** In logAction: `temp || (v.overnightAt18 ? '18' : '25')` = undefined || '18' = '18'. lastClearTemp silently set to '18'. Deadline = now + 16h.
**Risk:** If overnightAt18 was true but user had been choosing RT, the afternoon clear resets back to 18C behavior without asking. The "No, RT" override from the evening dialog is lost.

---

## TMP-049: Clear action without temp argument on overnightAt18=false stock

**Setup:** overnightAt18=false, lastClearTemp='25'. Any clear action without explicit temp.
**Action:** logAction('clear', 'afternoon') -- no temp.
**Expected:** `temp || (v.overnightAt18 ? '18' : '25')` = undefined || '25' = '25'. Consistent behavior.
**Risk:** None -- overnightAt18=false stocks always default to '25' and never show the dialog.

---

## TMP-050: Rapid successive clears -- temp from second clear overrides first

**Setup:** overnightAt18=true, lastClearTemp='18'. User clears evening with "Yes, 18C" (lastClearTemp='18', lastClearTime=T1). Then immediately clears again (e.g., taps button twice quickly) and the second time chooses "No, RT".
**Action:** Two logAction('clear', 'evening', '18') then logAction('clear', 'evening', '25') in quick succession.
**Expected:** After first: lastClearTime=T1, lastClearTemp='18', deadline=T1+16h, todayActions=[action1]. After second: lastClearTime=T2, lastClearTemp='25', deadline=T2+8h, todayActions=[action2]. Second clear fully overrides first.
**Risk:** If React state batching causes both to read the same `v` snapshot, both could write based on stale state. The `setCrosses(p => p.map(...))` functional updater should prevent this, but the `logAction` closure captures `v` at render time, not at click time.
