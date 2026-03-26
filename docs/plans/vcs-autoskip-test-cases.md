# VCS Auto-Skip, Cycle Transition, and "Never Skip Last Clear" Test Cases

**Target function**: `computeNextActions(vcs, now)` in `src/utils/vcs.js`
**Date**: 2026-03-26

---

## Reference: Key Thresholds

- **Auto-skip threshold**: `timeUntilMs < -2h` (i.e., >2h overdue)
- **Overdue threshold**: `nowMs > suggestedMs + 30min`
- **Grace period**: `nowMs > deadline && nowMs <= deadline + 30min`
- **Cycle expired**: `nowMs > deadline + 30min`
- **Clear types**: `'clear'`, `'clear_discard'`, `'collect_clear'`
- **Action order** (2-collection): evening(clear) -> morning(collect or clear_discard) -> afternoon(collect_clear)
- **Action order** (3-collection): evening(clear) -> morning(collect or clear_discard) -> midday(collect) -> afternoon(collect_clear)
- **Evening auto-done**: When `lastClearTime` is set, `'evening'` is always added to `doneKeys`

## Base Schedule (used unless otherwise specified)

```
25C / 2-collection:
  eveningClear: '18:00', morningCollect: '09:00', afternoonCollect: '14:30'

18C / 2-collection:
  eveningClear: '17:30', morningCollect: '09:30', afternoonCollect: '17:00'

25C / 3-collection:
  eveningClear: '18:00', morningCollect: '09:00', middayCollect: '12:00', afternoonCollect: '16:30'

18C / 3-collection:
  eveningClear: '17:30', morningCollect: '09:30', middayCollect: '14:00', afternoonCollect: '17:00'
```

---

## AS-001: Morning 3h overdue -- should auto-skip to afternoon

**Setup**:
- 25C, 2-collection schedule (morning=clear_discard at 09:00, afternoon=collect_clear at 14:30)
- lastClearTime: today 18:00 (previous day)
- todayActions: []
- now: next day 12:30 (morning is 3.5h overdue)

**Expected**:
- Morning (09:00) is 3.5h overdue -> timeUntilMs ~ -3.5h < -2h -> auto-skipped
- Afternoon (14:30) is next and only action shown
- result.length = 1, result[0].key = 'afternoon'

**Risk**: Morning clear_discard gets skipped even though it resets fly collection. But clear_discard is a clear type, so the "never skip last clear" rule applies -- however afternoon (collect_clear) is also a clear type and remains in queue, so the skip is allowed.

---

## AS-002: Morning 1h overdue -- should NOT auto-skip

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: previous day 18:00
- todayActions: []
- now: next day 10:30 (morning is 1.5h overdue, within 2h threshold)

**Expected**:
- Morning (09:00) timeUntilMs ~ -1.5h, which is > -2h -> NOT auto-skipped
- result[0].key = 'morning', result[0].isOverdue = true
- result[1].key = 'afternoon'
- result.length = 2

**Risk**: Off-by-one in the comparison. The check is `< -2h` (strictly less than), so -1.5h does NOT satisfy the skip condition. Correct behavior.

---

## AS-003: Morning exactly 2h overdue -- boundary test, should NOT skip

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: previous day 18:00
- todayActions: []
- now: next day 11:00 (morning is exactly 2h overdue -> timeUntilMs = -2h exactly)

**Expected**:
- timeUntilMs = -7200000 exactly. Condition is `< -7200000` (strictly less than), so -7200000 is NOT < -7200000 -> NOT skipped
- result[0].key = 'morning'
- result.length = 2

**Risk**: Floating-point precision or off-by-one ms could push this across the boundary. The strict `<` means exactly -2h is safe.

---

## AS-004: Morning 2h + 1ms overdue -- just past boundary, should skip

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: previous day 18:00
- todayActions: []
- now: next day 11:00:00.001 (morning is 2h + 1ms overdue)

**Expected**:
- timeUntilMs = -7200001 < -7200000 -> auto-skip triggered
- Morning skipped, result[0].key = 'afternoon'
- result.length = 1

**Risk**: 1ms precision might be lost in Date arithmetic. In practice JavaScript Date has ms precision so this should work.

---

## AS-005: Afternoon overdue but it is the last clear -- should NOT skip

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: previous day 18:00
- todayActions: [{ key: 'morning', time: next day 09:15 }]
- now: next day 17:00 (afternoon at 14:30 is 2.5h overdue)

**Expected**:
- Morning is in doneKeys (done within cycle)
- Evening is in doneKeys (auto-added)
- Only afternoon remains: type='collect_clear' (a clear type)
- result.length = 1, so the while loop condition `result.length > 1` is FALSE -> no skip attempted
- result[0].key = 'afternoon', isOverdue = true

**Risk**: None for the "last clear" rule here because result.length = 1 exits the while loop before the clear check even runs.

---

## AS-006: Afternoon 3h overdue, morning also overdue, afternoon is last clear -- should skip morning but NOT afternoon

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: previous day 18:00
- todayActions: []
- now: next day 18:00 (morning 9h overdue, afternoon 3.5h overdue)

**Expected**:
- Both morning and afternoon in result, sorted by suggestedMs
- While loop iteration 1: morning timeUntilMs ~ -9h < -2h. Morning type='clear_discard' (a clear type). Check: does result.slice(1) contain a clear type? Yes, afternoon is 'collect_clear'. So morning IS skipped.
- While loop iteration 2: afternoon timeUntilMs ~ -3.5h < -2h. Afternoon type='collect_clear' (a clear type). Check: does result.slice(1) have a clear type? result.slice(1) is empty (length=1 after shift). But wait -- the while condition `result.length > 1` is now FALSE (length=1), so the loop exits BEFORE checking afternoon.
- result[0].key = 'afternoon'

**Risk**: Subtle interaction -- morning is a clear type and gets skipped because afternoon (also clear) is behind it. Then the loop stops because only 1 item remains.

---

## AS-007: All actions overdue except evening clear is already done -- morning skipped, afternoon kept as last clear

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: previous day 18:00
- todayActions: []
- now: next day 20:00 (morning 11h overdue, afternoon 5.5h overdue)

**Expected**:
- Evening auto-done via doneKeys. Morning and afternoon remain.
- While loop: morning (clear_discard) >2h overdue. result.slice(1) has afternoon (collect_clear) -> another clear exists -> skip morning.
- Next iteration: afternoon (collect_clear) >2h overdue. result.length=1 -> while loop exits.
- result = [afternoon], isPastDeadline = true (past 8h window + 30min)

**Risk**: Same as AS-006. The while loop length check protects the last item regardless of type.

---

## AS-008: Fresh cycle, no overdue actions

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: today 18:00 (just cleared)
- todayActions: []
- now: today 18:05

**Expected**:
- Evening auto-done
- Morning scheduled for tomorrow 09:00 -> timeUntilMs ~ +14.9h -> not overdue
- Afternoon scheduled for tomorrow 14:30 -> timeUntilMs ~ +20.4h -> not overdue
- No auto-skipping. result = [morning, afternoon]
- result[0].isOverdue = false

**Risk**: Day boundary calculation. Morning 09:00 is before the 18:00 clear, so `suggestedMs <= clearMs` triggers `+= 86400000`, correctly placing it at tomorrow 09:00.

---

## AS-009: 18C morning is collect (not clear_discard) -- 3h overdue, skippable because afternoon has clear

**Setup**:
- 18C, 2-collection schedule (morning=collect at 09:30, afternoon=collect_clear at 17:00)
- lastClearTime: previous day 17:30, lastClearTemp: '18'
- todayActions: []
- now: next day 13:00 (morning 3.5h overdue)

**Expected**:
- Morning type='collect' (NOT a clear type) -> the "never skip last clear" rule doesn't apply, it skips freely
- Morning timeUntilMs ~ -3.5h < -2h -> skipped
- result[0].key = 'afternoon'

**Risk**: Someone might think 'collect' is protected. It is NOT a clear type, so it skips normally regardless of what follows.

---

## AS-010: 18C afternoon is last clear, 4h overdue -- never skip

**Setup**:
- 18C, 2-collection schedule
- lastClearTime: previous day 17:30, lastClearTemp: '18'
- todayActions: [{ key: 'morning', time: next day 09:45 }]
- now: next day 21:30 (afternoon 17:00 is 4.5h overdue)

**Expected**:
- Morning done. Only afternoon remains. result.length=1 -> while loop doesn't run.
- result[0].key = 'afternoon', isOverdue = true, isPastDeadline = true (past 16h window)

**Risk**: None -- single item in result is always safe.

---

## AS-011: 3-collection schedule -- midday skipped, afternoon kept as last clear

**Setup**:
- 25C, 3-collection schedule (morning=09:00, midday=12:00, afternoon=16:30)
- lastClearTime: previous day 18:00
- todayActions: []
- now: next day 14:30 (morning 5.5h overdue, midday 2.5h overdue, afternoon 2h ahead)

**Expected**:
- Morning timeUntilMs ~ -5.5h < -2h. Type='clear_discard'. result.slice(1) has midday(collect) and afternoon(collect_clear). Afternoon is a clear type -> skip morning.
- Midday timeUntilMs ~ -2.5h < -2h. Type='collect'. Not a clear type -> skip freely.
- Afternoon timeUntilMs ~ +2h -> NOT overdue. Loop stops (condition not met).
- result = [afternoon]

**Risk**: The while loop correctly chains multiple skips in sequence.

---

## AS-012: 3-collection schedule -- midday overdue but under 2h, morning skipped

**Setup**:
- 25C, 3-collection schedule
- lastClearTime: previous day 18:00
- todayActions: []
- now: next day 13:30 (morning 4.5h overdue, midday 1.5h overdue)

**Expected**:
- Morning >2h overdue, type=clear_discard, afternoon(collect_clear) exists in rest -> skip morning.
- Midday timeUntilMs ~ -1.5h, NOT < -2h -> loop stops.
- result = [midday, afternoon]

**Risk**: After skipping morning, the while loop re-checks result[0] which is now midday. Midday is only 1.5h overdue so the loop exits correctly.

---

## AS-013: 3-collection -- all three overdue, afternoon is last clear

**Setup**:
- 25C, 3-collection schedule
- lastClearTime: previous day 18:00
- todayActions: []
- now: next day 19:00 (morning 10h, midday 7h, afternoon 2.5h overdue)

**Expected**:
- Morning(clear_discard) >2h, afternoon(collect_clear) in rest -> skip.
- Midday(collect) >2h, not a clear type -> skip.
- Afternoon(collect_clear) >2h, but result.length=1 -> loop exits.
- result = [afternoon]

**Risk**: Two consecutive skips of different types (clear_discard then collect) before hitting the protected last clear.

---

## AS-014: 3-collection -- skip collect but NOT clear_discard when clear_discard is last clear type

**Setup**:
- 25C, 3-collection schedule
- lastClearTime: previous day 18:00
- todayActions: [{ key: 'afternoon', time: next day 16:45 }]
- now: next day + 1 at 12:00

**Expected**:
- Wait -- afternoon was done in todayActions. But afternoon's time (next day 16:45) is >= clearMs (previous day 18:00) and cycle may or may not be expired.
- Deadline = clearMs + 8h = previous day 18:00 + 8h = next day 02:00. cycleExpired at now (next day+1 12:00) > 02:00 + 30min = 02:30 -> cycleExpired = true.
- When cycleExpired, todayActions filtering: `actionMs >= clearMs && !cycleExpired` -> cycleExpired is true, so NO actions added to doneKeys (except evening which is unconditional).
- So morning and midday and afternoon are all NOT done.
- Morning(clear_discard) scheduled at next day 09:00 (>24h overdue). Midday at 12:00 (>24h overdue). Afternoon at 16:30.
- Morning(clear_discard) >2h overdue. Is it a clear type? Yes. Does rest contain a clear? result has midday(collect) and afternoon(collect_clear). Afternoon is clear -> skip morning.
- Midday(collect) >2h overdue. Not a clear type -> skip.
- Afternoon(collect_clear) >2h overdue. result.length=1 -> loop exits.
- result = [afternoon]

**Risk**: cycleExpired resets doneKeys, so even "done" afternoon reappears. The stale cycle shows everything as overdue. User should start a new cycle.

---

## AS-015: Cycle transition -- new clear resets everything

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: today 18:00 (fresh clear just performed)
- todayActions: [{ key: 'morning', time: today 09:15 }, { key: 'afternoon', time: today 14:40 }]
- now: today 18:05

**Expected**:
- clearMs = today 18:00. todayActions: morning at 09:15 < clearMs -> not added to doneKeys. afternoon at 14:40 < clearMs -> not added to doneKeys.
- Evening auto-done.
- Morning and afternoon are NOT done (their times are before the new clear).
- Both scheduled for tomorrow. No overdue.
- result = [morning, afternoon]

**Risk**: Old todayActions from a previous cycle are correctly ignored because `actionMs < clearMs`.

---

## AS-016: todayActions from previous cycle being filtered out

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: today 17:00 (second clear of the day)
- todayActions: [{ key: 'morning', time: today 09:15 }, { key: 'afternoon', time: today 14:30 }]
- now: today 17:10

**Expected**:
- clearMs = today 17:00. Morning 09:15 < 17:00 -> filtered. Afternoon 14:30 < 17:00 -> filtered.
- Only evening in doneKeys (auto-added).
- Morning/afternoon scheduled for tomorrow. Not overdue.
- result = [morning, afternoon]

**Risk**: The `actionMs >= clearMs` filter correctly discards actions from the old cycle even though they happened "today".

---

## AS-017: todayActions with action exactly at clearMs boundary

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: '2026-03-26T18:00:00.000Z'
- todayActions: [{ key: 'morning', time: '2026-03-26T18:00:00.000Z' }]
- now: 2026-03-27T10:00:00Z

**Expected**:
- actionMs for morning = clearMs exactly. Condition: `actionMs >= clearMs` -> true. `!cycleExpired` -> cycle is not expired (deadline = 02:00 + 30min = 02:30, now = 10:00 > 02:30 -> cycleExpired = TRUE).
- Since cycleExpired is true, `actionMs >= clearMs && !cycleExpired` -> false. Morning NOT in doneKeys.
- Morning shows as overdue (1h overdue, not >2h -> no auto-skip).
- result = [morning, afternoon]

**Risk**: The `&&` means BOTH conditions must be true. When cycle is expired, nothing gets into doneKeys. This is the intended "expired cycle" behavior.

---

## AS-018: doneKeys with actions after lastClearTime in non-expired cycle

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: today 18:00
- todayActions: [{ key: 'morning', time: tomorrow 09:15 }]
- now: tomorrow 09:30

**Expected**:
- Deadline = today 18:00 + 8h = tomorrow 02:00. cycleExpired at 09:30 > 02:30 -> TRUE.
- cycleExpired -> todayActions not added to doneKeys.
- Morning NOT marked done despite being in todayActions.

**Risk**: This is a confusing scenario. The 8h window expired at 02:00, but morning collection happened at 09:15 (well past deadline). The system treats the cycle as expired so the action is "forgotten". In practice the user should have started a new cycle.

---

## AS-019: doneKeys with action after lastClearTime in valid (non-expired) cycle

**Setup**:
- 18C, 2-collection schedule (16h window)
- lastClearTime: today 17:30
- todayActions: [{ key: 'morning', time: tomorrow 09:35 }]
- now: tomorrow 09:40

**Expected**:
- Deadline = today 17:30 + 16h = tomorrow 09:30. cycleExpired at 09:40 > 09:30 + 30min = 10:00 -> FALSE (still in grace period).
- `actionMs >= clearMs && !cycleExpired` -> morning at 09:35 >= 17:30 && !false -> TRUE. Morning added to doneKeys.
- Only afternoon remains. Not overdue.
- result = [afternoon]

**Risk**: Within the 30min grace period, doneKeys still works. This is correct -- the cycle hasn't fully expired yet.

---

## AS-020: Multiple cycles in one day -- rapid clears

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: today 14:00 (second clear, unusual mid-day)
- todayActions: [{ key: 'morning', time: today 09:15 }, { key: 'afternoon', time: today 13:50 }]
- now: today 14:10

**Expected**:
- clearMs = today 14:00. Morning 09:15 < 14:00 -> not in doneKeys. Afternoon 13:50 < 14:00 -> not in doneKeys.
- Evening auto-done.
- Morning at 09:00 -> suggestedMs = today 09:00. Since 09:00 < 14:00 (clearMs), add 86400000 -> tomorrow 09:00.
- Afternoon at 14:30 -> suggestedMs = today 14:30. 14:30 > 14:00 -> stays today 14:30.
- Afternoon timeUntilMs ~ -20min -> not overdue (overdue needs >30min past scheduled). Actually wait: isOverdue = nowMs > suggestedMs + 30min -> 14:10 > 15:00? No -> not overdue.
- result = [afternoon, morning] sorted by suggestedMs -> [afternoon(today 14:30), morning(tomorrow 09:00)]

**Risk**: The day boundary logic with mid-day clears. Morning gets pushed to tomorrow because its scheduled time (09:00) is before the clear time (14:00). Afternoon stays today because 14:30 > 14:00.

---

## AS-021: Cycle expired then new clear resets doneKeys

**Setup**:
- 25C, 2-collection schedule
- First: lastClearTime was yesterday 18:00, todayActions had morning and afternoon done
- Then: user does new clear, lastClearTime = today 18:00
- todayActions: [{ key: 'morning', time: today 09:15 }, { key: 'afternoon', time: today 14:40 }]
- now: today 18:15

**Expected**:
- clearMs = today 18:00. Both todayActions times < 18:00 -> not in doneKeys.
- Fresh cycle: evening done, morning and afternoon for tomorrow.
- result = [morning, afternoon]

**Risk**: Old todayActions linger in the array but are filtered by clearMs. The app should ideally clear todayActions on new cycle, but even if it doesn't, the filter handles it.

---

## AS-022: No lastClearTime -- fallback behavior

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: null (VCS just enabled, no clear done yet)
- todayActions: []
- now: today 10:00

**Expected**:
- clearMs = 0 (from `lastClearTime ? ... : 0`)
- deadline = null (from `lastClearTime ? clearMs + windowMs : null`)
- cycleExpired = false (deadline is null)
- Evening NOT auto-added (requires `if (lastClearTime)`)
- clearDate falls back to `new Date(now)`, baseDay = today 00:00
- Evening at 18:00 today. Morning at 09:00 -> suggestedMs = today 09:00. Is 09:00 <= clearMs(0)? No -> stays today 09:00.
- Morning timeUntilMs = 09:00 - 10:00 = -1h. Overdue but < 2h threshold.
- Actions sorted: [morning(09:00), evening(18:00)] -- wait, afternoon too.
- result = [morning, afternoon(14:30), evening(18:00)]

**Risk**: Without lastClearTime, evening is NOT auto-done and all actions appear. The order might confuse users. The "correct" first action is evening (clear) to start the cycle.

---

## AS-023: No lastClearTime, morning 3h overdue -- skip morning but evening(clear) protects itself

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: null
- todayActions: []
- now: today 12:30

**Expected**:
- All three actions: morning(09:00, clear_discard), afternoon(14:30, collect_clear), evening(18:00, clear)
- Sorted: [morning(09:00), afternoon(14:30), evening(18:00)]
- Morning timeUntilMs ~ -3.5h < -2h. Type=clear_discard, a clear type. Does rest contain a clear? afternoon(collect_clear) yes -> skip morning.
- Afternoon timeUntilMs ~ +2h -> not overdue. Loop stops.
- result = [afternoon, evening]

**Risk**: Even without lastClearTime, the skip logic works. Evening clear survives because it's not overdue.

---

## AS-024: Skipping a collect action (non-clear) -- always allowed

**Setup**:
- 18C, 3-collection schedule (morning=collect, midday=collect, afternoon=collect_clear)
- lastClearTime: previous day 17:30, lastClearTemp: '18'
- todayActions: []
- now: next day 12:00 (morning 2.5h overdue)

**Expected**:
- Morning(collect) timeUntilMs ~ -2.5h < -2h. Not a clear type -> skip freely, no protection check.
- Midday(14:00) timeUntilMs ~ +2h -> not overdue. Loop stops.
- result = [midday, afternoon]

**Risk**: Collect actions get no protection. This is correct -- missing a collect is less critical than missing the clear that resets the cycle.

---

## AS-025: Two collect actions overdue, then clear_discard also overdue but protected

**Setup**:
- 25C, 3-collection schedule but with lastClearTemp='25' (so morning=clear_discard)
- Schedule: morning=09:00(clear_discard), midday=12:00(collect), afternoon=16:30(collect_clear)
- lastClearTime: previous day 18:00
- todayActions: []
- now: next day 14:30 (morning 5.5h, midday 2.5h overdue)

**Expected**:
- Wait, this is same as AS-011. Let me adjust.
- Actually morning is first in sorted order. Morning(clear_discard) 5.5h overdue, rest has afternoon(collect_clear) -> skip.
- Midday(collect) 2.5h overdue, not a clear type -> skip.
- Afternoon not overdue -> result = [afternoon]

**Risk**: Same as AS-011. Documenting to confirm collect types never block the skip chain.

---

## AS-026: clear_discard is last clear in queue -- protected from skip

**Setup**:
- 25C, 3-collection schedule
- lastClearTime: previous day 18:00
- todayActions: [{ key: 'afternoon', time: next day 16:45 }]
- now: next day 16:50
- Cycle: deadline = next day 02:00, cycleExpired at 16:50 > 02:30 -> TRUE

**Expected**:
- cycleExpired -> todayActions not in doneKeys (afternoon not marked done).
- All three actions: morning(09:00, clear_discard), midday(12:00, collect), afternoon(16:30, collect_clear)
- Morning 7.8h overdue. Type=clear_discard (clear type). Rest has midday(collect) and afternoon(collect_clear). Afternoon is clear -> skip morning.
- Midday 4.8h overdue. Type=collect -> skip.
- Afternoon 20min overdue. timeUntilMs ~ -20min, NOT < -2h -> loop stops.
- result = [afternoon]

**Risk**: cycleExpired causes afternoon to re-appear even though it was "done". System correctly shows it because the cycle context has been lost.

---

## AS-027: Only morning(clear_discard) left, 3h overdue -- never skip (last clear)

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: previous day 18:00
- todayActions: [{ key: 'afternoon', time: next day 14:40 }]
- now: next day 15:00
- Deadline = next day 02:00, cycleExpired at 15:00 > 02:30 -> TRUE

**Expected**:
- cycleExpired -> afternoon not in doneKeys. Both morning and afternoon appear.
- Actually morning at 09:00 is 6h overdue. Afternoon at 14:30 is 30min overdue.
- Morning(clear_discard) 6h overdue. Is rest clear? afternoon(collect_clear) yes -> skip morning.
- Afternoon timeUntilMs ~ -30min, NOT < -2h -> loop stops.
- result = [afternoon]

**Risk**: Hmm, in this expired cycle, both clears are present. Let me construct the case where truly only the clear_discard remains.

---

## AS-028: REVISED -- Only clear_discard remains (afternoon already done in valid cycle), 3h overdue

**Setup**:
- 18C, 2-collection schedule (16h window)
- lastClearTime: today 17:30, lastClearTemp: '18'
- todayActions: [{ key: 'afternoon', time: tomorrow 17:10 }]
- now: tomorrow 13:00

**Expected**:
- Deadline = today 17:30 + 16h = tomorrow 09:30. cycleExpired at 13:00 > 10:00 -> TRUE.
- cycleExpired -> afternoon NOT in doneKeys.
- Morning(collect at 09:30) and afternoon(collect_clear at 17:00) both appear.
- Morning timeUntilMs ~ -3.5h. Type=collect (at 18C, morning is collect). Not a clear type -> skip freely.
- Afternoon timeUntilMs ~ +4h -> not overdue. Loop stops.
- result = [afternoon]

**Risk**: At 18C, morning is 'collect' not 'clear_discard', so it's never protected. To get a protected clear_discard we need 25C.

---

## AS-029: 25C, only clear_discard remaining after afternoon done, cycle NOT expired

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: previous day 18:00
- todayActions: [{ key: 'afternoon', time: next day 00:30 }]
- now: next day 01:00

**Expected**:
- Deadline = next day 02:00. cycleExpired at 01:00 < 02:30 -> FALSE.
- afternoon time 00:30 >= clearMs(18:00) && !false -> TRUE. afternoon in doneKeys.
- Only morning remains. morning at 09:00 -> suggestedMs > clearMs (09:00 next day > 18:00 prev day) -> stays.
- Morning timeUntilMs = 09:00 - 01:00 = +8h -> not overdue.
- result = [morning]
- No skip needed (not overdue).

**Risk**: This constructs a valid scenario where only clear_discard remains, but it's not overdue. See AS-030 for the overdue version.

---

## AS-030: 25C, only clear_discard remaining, IS overdue and IS last clear -- protected

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: previous day 10:00 (unusual early clear)
- Schedule: eveningClear: '10:00', morningCollect: '13:00', afternoonCollect: '16:00'
- todayActions: [{ key: 'afternoon', time: previous day 16:15 }]
- now: previous day 16:30

**Expected**:
- clearMs = previous day 10:00. Deadline = 10:00 + 8h = 18:00. cycleExpired at 16:30 < 18:30 -> FALSE.
- afternoon time 16:15 >= 10:00 && !false -> TRUE. afternoon in doneKeys.
- Morning scheduled at 13:00 (same day, 13:00 > 10:00 -> stays). timeUntilMs = 13:00 - 16:30 = -3.5h.
- Only morning remains. result.length = 1 -> while loop doesn't execute.
- result = [morning], isOverdue = true

**Risk**: Even though morning is >2h overdue, it's the only item so `result.length > 1` fails and the while loop never runs. The "never skip last clear" is enforced by the length check, not the type check.

---

## AS-031: Non-clear action is last item, overdue -- still not skipped (length=1 protection)

**Setup**:
- 18C, 2-collection schedule
- lastClearTime: today 17:30, lastClearTemp: '18'
- todayActions: [{ key: 'afternoon', time: tomorrow 17:10 }]
- now: tomorrow 09:20
- Deadline = tomorrow 09:30. cycleExpired at 09:20 < 10:00 -> FALSE.

**Expected**:
- afternoon in doneKeys (17:10 >= 17:30? No! 17:10 < 17:30 -> NOT in doneKeys).
- Actually afternoon time tomorrow 17:10. clearMs = today 17:30. tomorrow 17:10 > today 17:30 -> YES, in doneKeys.
- Morning(collect) at 09:30 -> timeUntilMs = +10min. Not overdue.
- result = [morning]. Not overdue, no skip.

**Risk**: Time comparison across days. Tomorrow 17:10 is indeed > today 17:30 in epoch ms.

---

## AS-032: Evening clear appears when lastClearTime is null, and it's the last clear -- protected

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: null
- todayActions: []
- now: today 21:00

**Expected**:
- No lastClearTime -> evening NOT auto-done. clearDate = now.
- baseDay = today 00:00.
- evening(18:00) -> suggestedMs = today 18:00. Is 18:00 <= clearMs(0)? No -> stays.
- morning(09:00) -> suggestedMs = today 09:00. 09:00 <= 0? No -> stays.
- afternoon(14:30) -> stays.
- Sorted: [morning(09:00), afternoon(14:30), evening(18:00)]
- Morning timeUntilMs = 09:00 - 21:00 = -12h. Type=clear_discard. Rest has afternoon(collect_clear) -> skip.
- Afternoon timeUntilMs = 14:30 - 21:00 = -6.5h. Type=collect_clear. Rest has evening(clear). evening is a clear type -> skip afternoon.
- Evening timeUntilMs = 18:00 - 21:00 = -3h. Type=clear. result.length=1 -> loop exits.
- result = [evening]

**Risk**: Evening clear is the very last action standing. Protected by length=1. This correctly guides the user to do the clear to start a proper cycle.

---

## AS-033: 3-collection 18C -- midday(collect) 2.5h overdue, morning(collect) already done

**Setup**:
- 18C, 3-collection schedule
- lastClearTime: previous day 17:30, lastClearTemp: '18'
- todayActions: [{ key: 'morning', time: next day 09:40 }]
- now: next day 16:50
- Deadline = next day 09:30. cycleExpired at 16:50 > 10:00 -> TRUE.

**Expected**:
- cycleExpired -> morning NOT in doneKeys (despite being in todayActions).
- All three: morning(09:30, collect), midday(14:00, collect), afternoon(17:00, collect_clear)
- Morning 7.3h overdue. Type=collect -> skip.
- Midday 2.8h overdue. Type=collect -> skip.
- Afternoon 10min ahead. Not overdue -> loop stops.
- result = [afternoon]

**Risk**: cycleExpired resets all progress. Morning was done but the system "forgets" it. Two non-clear skips in a row.

---

## AS-034: Grace period -- cycle NOT yet expired, actions still tracked

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: previous day 18:00
- todayActions: [{ key: 'morning', time: next day 09:10 }]
- now: next day 02:15 (deadline = 02:00, grace ends 02:30)

**Expected**:
- cycleExpired = 02:15 > 02:30? NO -> not expired (still in grace).
- morning time 09:10... wait, 09:10 is in the future relative to now (02:15). But actionMs >= clearMs? 09:10 next day > 18:00 prev day -> yes. And !cycleExpired -> true. So morning IS in doneKeys.
- But wait, how can morning be done at 09:10 if now is 02:15? This is a data inconsistency (future todayAction). The system doesn't validate this -- it just checks the conditions.
- Afternoon not done. timeUntilMs = 14:30 - 02:15 = +12.25h. Not overdue.
- result = [afternoon]

**Risk**: Future-timestamped todayActions can pollute doneKeys. The system trusts the data.

---

## AS-035: Exact grace period boundary -- now = deadline + 30min exactly

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: previous day 18:00 (deadline = next day 02:00)
- todayActions: [{ key: 'morning', time: next day 09:10 }]
- now: next day 02:30:00.000 exactly

**Expected**:
- cycleExpired = `nowMs > deadline + 30 * 60000`. deadline + 30min = 02:30:00.000. nowMs = 02:30:00.000. Is 02:30 > 02:30? NO (not strictly greater). -> cycleExpired = FALSE.
- Morning in doneKeys (actionMs >= clearMs && !cycleExpired).
- result = [afternoon]

**Risk**: Exact boundary. `>` means 02:30 exactly is NOT expired. 1ms later it would be. This is the grace period's last valid moment.

---

## AS-036: 1ms past grace period -- cycle expires, doneKeys reset

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: previous day 18:00
- todayActions: [{ key: 'morning', time: next day 09:10 }]
- now: next day 02:30:00.001

**Expected**:
- cycleExpired = 02:30:00.001 > 02:30:00.000 -> TRUE.
- Morning NOT in doneKeys.
- Morning at 09:00. timeUntilMs = 09:00 - 02:30 = +6.5h -> not overdue.
- result = [morning, afternoon]

**Risk**: 1ms flips the cycle. Morning reappears. This could cause a "flash" in the UI if the user is watching at exactly the grace boundary.

---

## AS-037: While loop processes multiple skips -- 3 items, first two skippable

**Setup**:
- 25C, 3-collection schedule
- lastClearTime: two days ago 18:00
- todayActions: []
- now: today 12:00 (everything from yesterday is massively overdue)

**Expected**:
- Deadline = two days ago 18:00 + 8h = yesterday 02:00. cycleExpired = true.
- morning at yesterday 09:00, midday at yesterday 12:00, afternoon at yesterday 16:30 (all >24h overdue).
- Actually wait -- suggestedMs is based on clearDate. clearDate = two days ago 18:00. baseDay = two days ago 00:00.
- evening at 18:00 two days ago (auto-done).
- morning at 09:00 -> two days ago 09:00 <= clearMs (two days ago 18:00) -> +86400000 -> yesterday 09:00.
- midday at 12:00 -> two days ago 12:00 <= 18:00 -> +86400000 -> yesterday 12:00.
- afternoon at 16:30 -> two days ago 16:30 <= 18:00 -> +86400000 -> yesterday 16:30.
- All are >19h overdue.
- Morning(clear_discard) >2h. Rest has afternoon(collect_clear) -> skip.
- Midday(collect) >2h -> skip.
- Afternoon(collect_clear) >2h. result.length=1 -> loop exits.
- result = [afternoon], massively overdue and past deadline.

**Risk**: Very stale cycle. The system still shows the afternoon collect_clear, guiding the user to at least do a clear to restart.

---

## AS-038: While loop -- result becomes length 1 mid-iteration

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: previous day 18:00
- todayActions: []
- now: next day 17:00 (morning 8h overdue, afternoon 2.5h overdue)

**Expected**:
- morning and afternoon in result.
- Iteration 1: morning(clear_discard) 8h overdue. Rest = [afternoon(collect_clear)] -> has clear -> skip morning. result.shift() -> result = [afternoon].
- Iteration 2: while condition: result.length > 1 -> 1 > 1 -> FALSE. Loop exits.
- result = [afternoon]

**Risk**: The while loop correctly checks length BEFORE processing. When result shrinks to 1, it stops.

---

## AS-039: Empty result after all actions done -- no skipping needed

**Setup**:
- 25C, 2-collection schedule
- lastClearTime: previous day 18:00
- todayActions: [{ key: 'morning', time: next day 09:10 }, { key: 'afternoon', time: next day 14:40 }]
- now: next day 14:50
- Deadline = next day 02:00. cycleExpired at 14:50 > 02:30 -> TRUE.

**Expected**:
- cycleExpired -> todayActions not in doneKeys. morning and afternoon reappear.
- Morning 5.8h overdue, afternoon 20min overdue.
- Morning(clear_discard) >2h. Rest has afternoon(collect_clear) -> skip.
- Afternoon timeUntilMs ~ -20min. NOT < -2h -> loop stops.
- result = [afternoon]

**Risk**: Even though user "completed" both actions, cycle expiry means they reappear. If cycle were NOT expired, result would be empty [].

---

## AS-040: All actions done in valid cycle -- empty result, no skip logic runs

**Setup**:
- 18C, 2-collection schedule (16h window)
- lastClearTime: today 17:30, lastClearTemp: '18'
- todayActions: [{ key: 'morning', time: tomorrow 09:35 }, { key: 'afternoon', time: tomorrow 17:05 }]
- now: tomorrow 17:10
- Deadline = tomorrow 09:30. cycleExpired at 17:10 > 10:00 -> TRUE.

**Expected**:
- cycleExpired -> todayActions NOT in doneKeys. Both reappear.
- Morning 7.7h overdue, afternoon 10min overdue.
- Morning(collect) >2h -> skip (not a clear type, skips freely).
- Afternoon timeUntilMs ~ -10min -> NOT < -2h -> loop stops.
- result = [afternoon]

**Risk**: 16h window expired hours ago. System shows afternoon again. To get a truly empty result, we need a non-expired cycle.

---

## AS-041: All actions done, cycle still valid -- truly empty result

**Setup**:
- 18C, 2-collection schedule (16h window)
- lastClearTime: today 17:30, lastClearTemp: '18'
- todayActions: [{ key: 'morning', time: tomorrow 09:35 }, { key: 'afternoon', time: tomorrow 16:55 }]
- now: tomorrow 09:00 (within 16h window, deadline at 09:30)

**Expected**:
- cycleExpired = 09:00 > 10:00? NO -> not expired.
- morning time 09:35 >= clearMs && !false -> wait, 09:35 tomorrow is in the future vs now (09:00). But actionMs is just checked against clearMs (today 17:30). 09:35 tomorrow > 17:30 today -> yes. In doneKeys.
- afternoon time 16:55 >= clearMs -> yes. In doneKeys.
- Evening auto-done. All three done.
- result = [] (empty, all filtered by doneKeys).
- While loop: result.length = 0, 0 > 1 -> false. No iteration.

**Risk**: Future-dated todayActions again. The system accepts them. Empty result = "all done" state = green status.

---

## AS-042: collect_clear is the ONLY action (custom 1-collection equivalent)

**Setup**:
- 25C, 2-collection schedule but morning already done
- lastClearTime: previous day 18:00
- todayActions: [{ key: 'morning', time: next day 09:15 }]
- now: next day 01:30 (within cycle, deadline 02:00)

**Expected**:
- cycleExpired = 01:30 > 02:30? NO.
- morning in doneKeys. Only afternoon remains.
- Afternoon at 14:30. timeUntilMs = 14:30 - 01:30 = +13h. Not overdue.
- result = [afternoon]

**Risk**: Single remaining action. No skip logic triggers. Clean case.

---

## AS-043: Skip chain stops at non-clear action that's under 2h overdue

**Setup**:
- 25C, 3-collection schedule
- lastClearTime: previous day 18:00
- todayActions: []
- now: next day 11:30 (morning 2.5h overdue, midday 30min ahead)

**Expected**:
- Morning(clear_discard) timeUntilMs ~ -2.5h < -2h. Rest has afternoon(collect_clear) -> skip.
- Midday(collect) timeUntilMs ~ +30min -> NOT overdue. NOT < -2h. Loop stops.
- result = [midday, afternoon]

**Risk**: Skip chain halts at the first non-overdue action. The subsequent afternoon is also shown (it's further in the future).

---

## AS-044: Skip chain -- first item is non-clear and overdue, skips without clear check

**Setup**:
- 18C, 3-collection schedule (morning=collect at 09:30)
- lastClearTime: previous day 17:30, lastClearTemp: '18'
- todayActions: []
- now: next day 12:00

**Expected**:
- Morning(collect) timeUntilMs ~ -2.5h < -2h. Type=collect, NOT a clear type. The `isClear` check is false, so the `if` block doesn't trigger. Code does `result[0].skipped = true; result.shift()`. Morning skipped.
- Midday(collect at 14:00) timeUntilMs ~ +2h -> not overdue. Loop stops.
- result = [midday, afternoon]

**Risk**: The code structure: `if (isClear && noOtherClear) break;` -- for non-clear types, the if is false, so it falls through to the skip. This is correct.

---

## AS-045: The "break" in action -- clear type with no other clear in queue

**Setup**:
- 25C, 3-collection schedule
- lastClearTime: previous day 18:00
- todayActions: [{ key: 'morning', time: next day 09:10 }]
- now: next day 01:30 (valid cycle)

**Expected**:
- morning in doneKeys. midday and afternoon remain.
- midday(collect at 12:00). suggestedMs = next day 12:00. timeUntilMs = 12:00 - 01:30 = +10.5h. Not overdue.
- No skip. result = [midday, afternoon].

**Risk**: Clean case. Neither action is overdue, so skip logic never activates.

---

## AS-046: The "break" in action -- collect_clear is first, 3h overdue, no other clear behind it

**Setup**:
- 25C, 3-collection schedule
- lastClearTime: previous day 18:00
- todayActions: [{ key: 'morning', time: next day 09:10 }, { key: 'midday', time: next day 12:15 }]
- now: next day 01:00 (valid cycle, deadline 02:00)

**Expected**:
- Both morning and midday in doneKeys (valid cycle). Only afternoon remains.
- Afternoon at 16:30. timeUntilMs = 16:30 - 01:00 = +15.5h. Not overdue. No skip.
- result = [afternoon]

**Risk**: Again, length=1 prevents the while loop. But let's construct the case where length > 1 and the first IS the last clear.

---

## AS-047: collect_clear first in queue of 2, no other clear behind it -- break triggered

**Setup**:
- 25C, 3-collection schedule
- lastClearTime: previous day 18:00
- todayActions: [{ key: 'morning', time: next day 09:10 }]
- now: next day 19:00
- Deadline = next day 02:00. cycleExpired at 19:00 > 02:30 -> TRUE.

**Expected**:
- cycleExpired -> morning NOT in doneKeys.
- morning(09:00), midday(12:00), afternoon(16:30) all appear.
- morning(clear_discard) 10h overdue. Rest has afternoon(collect_clear) -> skip.
- midday(collect) 7h overdue. Not a clear type -> skip.
- afternoon(collect_clear) 2.5h overdue. result.length=1 -> loop exits.
- result = [afternoon]

**Risk**: The length=1 check fires before the clear check. Let me construct a case where length > 1 but the first IS the last clear.

---

## AS-048: TRUE "break" scenario -- collect_clear is first of 2 items, other item is non-clear

**Setup**:
- Custom schedule to make collect_clear come before a non-clear action.
- Actually, this can't happen with normal schedules because afternoon(collect_clear) is always last chronologically.
- BUT: if cycle expired and times wrap around oddly... Let me think.
- Actually: consider a 3-collection 18C schedule where midday(collect) is scheduled AFTER afternoon(collect_clear).
- Custom schedule: eveningClear: '17:30', morningCollect: '09:30', middayCollect: '18:00', afternoonCollect: '17:00'
- lastClearTime: previous day 17:30, lastClearTemp: '18'
- todayActions: [{ key: 'morning', time: next day 09:40 }]
- now: next day 20:30
- Deadline = next day 09:30. cycleExpired -> TRUE.

**Expected**:
- cycleExpired -> morning NOT in doneKeys. All three appear.
- morning(collect, 09:30) 11h overdue. midday(collect, 18:00) 2.5h overdue. afternoon(collect_clear, 17:00) 3.5h overdue.
- Sorted: [morning(09:30), afternoon(17:00), midday(18:00)]
- morning(collect) 11h overdue. Not a clear -> skip.
- afternoon(collect_clear) 3.5h overdue. Type=collect_clear, a clear type. Does rest (=[midday]) have a clear? midday type=collect -> NO. -> **BREAK**. Loop exits. afternoon NOT skipped.
- result = [afternoon, midday]

**Risk**: This is the actual "break" codepath being exercised! The collect_clear is protected because the only remaining item (midday) is a plain collect, not a clear type. Without this break, afternoon would be skipped and the user would lose their last chance to clear.

---

## AS-049: All clear types overdue in sequence -- each checks rest for clears

**Setup**:
- Custom 3-collection schedule where ALL actions are clear types (unusual config).
- Use 25C with overnightAt18=false: morning=clear_discard, afternoon=collect_clear.
- Add midday with schedule. At 25C/3-coll, midday type=collect (not a clear type). So we can't make all three clear types.
- Instead: 25C, 2-collection. morning=clear_discard, afternoon=collect_clear. Both are clear types.
- lastClearTime: previous day 18:00
- todayActions: []
- now: next day 17:00

**Expected**:
- morning(clear_discard, 09:00) 8h overdue. afternoon(collect_clear, 14:30) 2.5h overdue.
- morning: isClear=true. Rest=[afternoon]. afternoon type=collect_clear, a clear -> other clear exists -> skip morning.
- afternoon: isClear=true. result.length=1 -> loop exits.
- result = [afternoon]

**Risk**: When two clear types are in sequence, the first can be skipped because the second exists. The second is protected by length=1.

---

## AS-050: Cascading skip with alternating clear/non-clear in 3-collection

**Setup**:
- 25C, 3-collection: morning(clear_discard), midday(collect), afternoon(collect_clear)
- lastClearTime: 3 days ago 18:00 (very stale)
- todayActions: []
- now: today 20:00

**Expected**:
- clearDate = 3 days ago 18:00. baseDay = 3 days ago 00:00.
- morning at 09:00 -> 3 days ago 09:00 <= clearMs -> +1 day -> 2 days ago 09:00. timeUntilMs ~ -62h.
- midday at 12:00 -> 3 days ago 12:00 <= clearMs -> +1 day -> 2 days ago 12:00. timeUntilMs ~ -56h.
- afternoon at 16:30 -> 3 days ago 16:30 <= clearMs -> +1 day -> 2 days ago 16:30. timeUntilMs ~ -51.5h.
- All massively overdue (>2 days).
- morning(clear_discard) >2h. Rest has afternoon(collect_clear) -> skip.
- midday(collect) >2h. Not a clear -> skip.
- afternoon(collect_clear) >2h. result.length=1 -> loop exits.
- result = [afternoon]. isPastDeadline = true. Status = red.

**Risk**: Even days-stale VCS resolves to showing the final collect_clear. The system never fully "gives up" -- it always shows at least one action to guide the user back to doing a clear.

---

## Summary Matrix

| ID | Category | Auto-Skip? | Last-Clear Protected? | Key Behavior Tested |
|----|----------|------------|----------------------|---------------------|
| AS-001 | Basic skip | Yes (morning) | N/A | 3.5h overdue skips |
| AS-002 | No skip | No | N/A | 1.5h overdue stays |
| AS-003 | Boundary | No | N/A | Exact 2h boundary (strict <) |
| AS-004 | Boundary | Yes | N/A | 2h + 1ms triggers skip |
| AS-005 | Last clear | N/A | Yes (length=1) | Single item never enters loop |
| AS-006 | Chain skip | Yes (morning) | Yes (afternoon, length=1) | Clear skips if another clear follows |
| AS-007 | Chain skip | Yes (morning) | Yes (afternoon, length=1) | Same as 006, later time |
| AS-008 | Fresh cycle | No | N/A | No overdue in fresh cycle |
| AS-009 | 18C collect | Yes (morning) | N/A | Non-clear always skippable |
| AS-010 | 18C last clear | N/A | Yes (length=1) | Single item in 18C |
| AS-011 | 3-coll chain | Yes (morning+midday) | Yes (afternoon) | Multi-skip chain |
| AS-012 | 3-coll partial | Yes (morning) | N/A | Chain stops at <2h item |
| AS-013 | 3-coll all overdue | Yes (morning+midday) | Yes (afternoon, length=1) | All overdue, last protected |
| AS-014 | Cycle expired | Yes (morning+midday) | Yes (afternoon, length=1) | cycleExpired resets doneKeys |
| AS-015 | Cycle transition | No | N/A | New clear invalidates old actions |
| AS-016 | Cycle transition | No | N/A | clearMs filter on todayActions |
| AS-017 | Boundary | No skip (1h overdue) | N/A | cycleExpired resets at exact boundary |
| AS-018 | Expired cycle | N/A | N/A | Expired cycle ignores doneKeys |
| AS-019 | Grace period | N/A | N/A | Grace period keeps doneKeys valid |
| AS-020 | Rapid clear | No | N/A | Mid-day clear, day boundary push |
| AS-021 | Cycle reset | No | N/A | New clear + stale todayActions |
| AS-022 | No clear time | No (1h overdue) | N/A | Null lastClearTime fallback |
| AS-023 | No clear time | Yes (morning) | N/A | Null lastClearTime + skip |
| AS-024 | Collect skip | Yes (morning) | N/A | Collect type never protected |
| AS-025 | Chain skip | Yes (morning+midday) | N/A | Non-clear types skip freely |
| AS-026 | Expired + skip | Yes (morning+midday) | N/A | cycleExpired + multi-skip |
| AS-027 | Expired | Yes (morning) | N/A | Expired cycle re-shows actions |
| AS-028 | 18C expired | Yes (morning) | N/A | 18C collect skip after expiry |
| AS-029 | Valid cycle | No | N/A | Single remaining, not overdue |
| AS-030 | Last clear_discard | N/A | Yes (length=1) | clear_discard protected when alone |
| AS-031 | Length protection | N/A | N/A | Any type protected at length=1 |
| AS-032 | No clear time | Yes (morning+afternoon) | Yes (evening, length=1) | Evening clear survives as last |
| AS-033 | 18C 3-coll expired | Yes (morning+midday) | N/A | Expired resets, multi-skip |
| AS-034 | Grace doneKeys | N/A | N/A | Grace period preserves doneKeys |
| AS-035 | Boundary grace | N/A | N/A | Exact grace boundary (not expired) |
| AS-036 | Boundary grace | N/A | N/A | 1ms past grace = expired |
| AS-037 | Stale cycle | Yes (morning+midday) | Yes (afternoon, length=1) | Days-old cycle, multi-skip |
| AS-038 | Loop mechanics | Yes (morning) | Yes (afternoon, length=1) | Length shrinks mid-loop |
| AS-039 | Expired redisplay | Yes (morning) | N/A | Done actions reappear after expiry |
| AS-040 | Expired redisplay | Yes (morning) | N/A | 18C done actions reappear |
| AS-041 | Valid empty | No | N/A | All done, valid cycle = empty |
| AS-042 | Single remaining | No | N/A | One action left, not overdue |
| AS-043 | Chain stops | Yes (morning) | N/A | Stops at non-overdue action |
| AS-044 | Non-clear skip | Yes (morning) | N/A | Collect skips without clear check |
| AS-045 | Clean case | No | N/A | No overdue = no skip |
| AS-046 | Clean case | No | N/A | Single item, not overdue |
| AS-047 | Expired chain | Yes (morning+midday) | Yes (afternoon, length=1) | Expired + full skip chain |
| AS-048 | **BREAK path** | Break triggered | Yes (break) | collect_clear first, no clear behind -> break |
| AS-049 | Clear sequence | Yes (first clear) | Yes (second, length=1) | Two clears: first skips, second protected |
| AS-050 | Very stale | Yes (morning+midday) | Yes (afternoon, length=1) | Days-stale cycle, cascading skip |
