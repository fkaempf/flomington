# VCS Multi-Instance Sync and Conflict Test Cases

**Date:** 2026-03-26
**Scope:** 50 test cases covering multi-instance sync conflicts in the VCS system
**Context:** Supabase Postgres + Realtime websockets, shallow merge `{ ...local, ...remote }`, proposed timestamp-based VCS winner, `isEditedLocally()` 10s guard, `isDeletedLocally()` 15s guard, hash-based delta push, pull-first on load, 30s poll + tab-focus re-pull

---

## Simultaneous Clears (SY-001 to SY-006)

### SY-001: Two users clear same stock within 1 second
- **Setup:** Stock S1 with VCS enabled, `lastClearTime = T-8h`. Instance A (Flo), Instance B (Bella). Supabase has S1 with stale VCS.
- **Action:** At T+0.0s, Flo taps "Clear" on A. At T+0.5s, Bella taps "Clear" on B. Both call `markEdited(S1.id)` and push.
- **Expected:** Both instances converge to whichever `lastClearTime` was written to Supabase last (Bella's, ~T+0.5s). Both show the same `todayActions` and `virginDeadline`. No duplicate clear actions.
- **Risk:** Shallow merge `{ ...local, ...remote }` keeps Flo's VCS on A because `isEditedLocally` blocks the realtime UPDATE from Bella's push. After 10s, the next poll or realtime event overwrites Flo's clear with Bella's, losing Flo's clear timestamp. With no timestamp comparison, the "winner" is arbitrary.

### SY-002: Same user clears same stock from two tabs
- **Setup:** Stock S1, VCS enabled. Flo has Tab A and Tab B both open. Supabase is in sync.
- **Action:** Tab A clears S1 at T+0. Tab B still shows old state (pre-clear). Tab B clears S1 at T+3s.
- **Expected:** Both tabs converge to Tab B's clear time. `todayActions` contains only the most recent clear action (Tab B's), since clear resets `todayActions = [action]`.
- **Risk:** Tab A's `isEditedLocally` guard (10s) blocks realtime from Tab B's push, so Tab A retains its own clear time until the guard expires. After expiry, the 30s poll or realtime re-delivery overwrites Tab A with Tab B's state. Tab A user sees a confusing state jump.

### SY-003: Simultaneous clear on two different stocks
- **Setup:** Stock S1 (VCS, maintainer Flo), Stock S2 (VCS, maintainer Bella). Instance A (Flo), Instance B (Bella). Both synced.
- **Action:** Flo clears S1 on A, Bella clears S2 on B at the same moment. Both push.
- **Expected:** No conflict. A receives realtime for S2 update, B receives realtime for S1 update. Both stocks have correct independent VCS states.
- **Risk:** None expected -- different IDs, no merge collision. The only risk is if a push/pull cycle includes both stocks and the hash comparison causes an unnecessary re-push.

### SY-004: Clear at T+0, identical clear at T+11s (after edit guard expires)
- **Setup:** Stock S1, VCS enabled. Instance A and B both synced.
- **Action:** A clears at T+0, pushes. B receives realtime at T+1s but B also clears at T+0.5s so `isEditedLocally` blocks it. At T+11s, A's guard expires. A receives a 30s poll that includes B's later push.
- **Expected:** A should adopt B's clear time (T+0.5s) since it is the Supabase state. Both converge.
- **Risk:** A's `lastClearTime` is T+0, B's is T+0.5s. After A's edit guard expires, the next realtime or poll overwrites A with B's state. This is correct behavior but the user on A sees their clear "undo" itself 10-11 seconds later, with no feedback.

### SY-005: Rapid double-clear on one instance, single clear on other
- **Setup:** Stock S1, VCS enabled. Instance A, Instance B. Synced.
- **Action:** A clears at T+0, then clears again at T+2s (user double-tapped or cycle rolled). B clears at T+1s. All three push within the 3s debounce window.
- **Expected:** A's second clear (T+2s) should win on A. B's clear (T+1s) should be in Supabase. Final state depends on push order. If A's debounced push (at T+5s) fires after B's push, A's T+2s state wins in Supabase.
- **Risk:** A's local state has `todayActions = [clear@T+2s]` because each clear resets the array. But if B's push lands in Supabase between A's two clears, the hash comparison sees A as changed and pushes again. Race condition in upsert ordering determines winner.

### SY-006: Evening clear on A, morning clear-discard on B within overlap window
- **Setup:** Stock S1, VCS overnight at 18C. A clears at 17:30 (evening clear). B sees this via realtime. Next morning at 09:00, B does morning clear+discard.
- **Action:** B pushes. A is asleep (tab closed). A opens tab at 09:30.
- **Expected:** A does tab-focus re-pull, gets B's morning state with `lastClearTime = 09:00`, `todayActions = [clear_discard@09:00]`. A converges to B's state.
- **Risk:** If A's tab was backgrounded but not closed, `rePullAux` only pulls virgin/exp banks and transfers -- it does NOT re-pull stocks. The stocks channel relies on realtime. If the realtime message was missed while backgrounded, A remains stuck on the evening-clear state until the next full page reload.

---

## Clear vs. Collect Race (SY-007 to SY-012)

### SY-007: A collects while B clears the same stock simultaneously
- **Setup:** Stock S1, VCS enabled, `lastClearTime = T-6h`. Next action is "Afternoon collect + clear". Instance A (Flo), Instance B (Bella).
- **Action:** A taps "Collect" at T+0. B taps "Clear" at T+0.5s. Both push.
- **Expected:** Final VCS should have both actions in `todayActions` if collect happened before clear, OR only the clear action if clear resets `todayActions`. Since clear resets `todayActions = [clearAction]`, the collect is lost.
- **Risk:** A's collect gets pushed to Supabase, then B's clear overwrites `todayActions` entirely (clear resets the array). A's collect is permanently lost. The user on A sees "Collected" toast but the action disappears when B's state arrives.

### SY-008: Collect on A, then collect_clear on B for same action slot
- **Setup:** Cross C1, VCS enabled, next action is "Afternoon collect + clear" (type `collect_clear`). Instance A, Instance B.
- **Action:** A does only the collect part at T+0. B does the full collect_clear at T+1s.
- **Expected:** B's state wins because it includes the clear which resets `todayActions`. Virgin bank should reflect both collections if banks are per-user.
- **Risk:** A logged a `collect` action, B logged a `clear` action (the `collect_clear` handler calls `logAction('clear', key)` after collecting). The collect from A is lost in VCS state but the virgin bank entry (per-user) survives independently.

### SY-009: Morning collect on A, evening clear arrives from B mid-operation
- **Setup:** Stock S1, overnight at 18C. B did the evening clear last night. A opens tab in the morning to do the morning collect.
- **Action:** A taps "Morning collect" at 09:00. While A's push is debouncing (3s), a realtime UPDATE arrives from B who just edited S1's notes field.
- **Expected:** The realtime handler checks `isEditedLocally(S1.id)` -- returns true (A just called `markEdited`). Realtime is blocked. A's push fires at T+3s with the collect recorded.
- **Risk:** B's edit was to `notes` only, not VCS. But the realtime payload contains the full row including VCS. If the edit guard expires before A's push completes, and another realtime arrives, the shallow merge `{ ...local, ...remote }` could overwrite A's VCS with the pre-collect state from Supabase.

### SY-010: Two users do morning collect on same cross within 2 seconds
- **Setup:** Cross C1, status "collecting virgins", VCS enabled. Instance A (Flo), Instance B (Bella).
- **Action:** A records collect at T+0, B records collect at T+1s. Both push.
- **Expected:** Since VCS is on a cross and `todayActions` is an array, the last push wins. If B pushes after A, B's `todayActions` includes only B's collect (since B started from the same base state as A). A's collect is lost from `todayActions`.
- **Risk:** Both users physically collected virgins, but the VCS only shows one collection event. The `virginsCollected` counter is also per-cross, not per-user, so both increments may not survive. The virgin banks (per-user) correctly reflect both collections, but the cross's VCS dashboard is wrong.

### SY-011: Collect on A races with auto-promote on B
- **Setup:** Cross C1, status "waiting for virgins", `setupDate` = 9 days ago. Instance A still shows old state. Instance B loads fresh and triggers auto-promote to "collecting virgins" with a new VCS via `makeVcs()`.
- **Action:** B's auto-promote fires, sets `status = 'collecting virgins'`, creates VCS, pushes. Meanwhile A (stale) has no VCS on C1.
- **Expected:** A receives realtime with the promoted cross including VCS. A should adopt B's state. If A also triggers auto-promote locally (since A also sees the 9-day threshold), A creates a separate `makeVcs()` with a different `createdAt` timestamp.
- **Risk:** Two independent `makeVcs()` calls produce different `lastClearTime` and `createdAt` values (both set to `new Date().toISOString()`). The VCS objects are not identical. Whichever pushes last overwrites the other, potentially confusing the virgin window calculation.

### SY-012: Collect on A at exactly the 30-minute grace period boundary
- **Setup:** Stock S1, VCS enabled, `lastClearTime = T-8h` (25C, 8h window). Grace period ends at T-8h+8h+30m = T+30m. Instance A, Instance B.
- **Action:** A collects at exactly T+30m (grace boundary). B's instance shows `isPastDeadline = true` and the cycle has expired. B clears to start a new cycle at T+31m.
- **Expected:** A's collect is recorded in the expired cycle's `todayActions`. B's clear resets everything. Both converge to B's new cycle.
- **Risk:** A sees the collect succeed locally but `cycleExpired` is true in `computeNextActions`, so the collect key is not added to `doneKeys` (line 57: `if (actionMs >= clearMs && !cycleExpired) doneKeys.add(a.key)`). The collect appears recorded but has no effect on the computed actions. This is confusing but not a sync conflict per se.

---

## VCS Null Transition / Cross Promotion (SY-013 to SY-018)

### SY-013: Cross promotes to "waiting for progeny" on A, B still shows "collecting virgins" with active VCS
- **Setup:** Cross C1, status "collecting virgins", `virginsCollected = 4`, `virginsPerCross = 5`. Instance A, Instance B.
- **Action:** A records the 5th virgin, triggering promotion to "waiting for progeny" with `vcs: null`. A pushes. B still shows VCS dashboard for C1.
- **Expected:** B receives realtime UPDATE with `status = 'waiting for progeny'`, `vcs = null`. B's VCS dashboard for C1 disappears.
- **Risk:** B's `isEditedLocally` check passes (B didn't edit C1 recently). The shallow merge `{ ...prev[idx], ...item }` applies. But if the Supabase column for `vcs` is `null`, the `toCamel` conversion returns `vcs: null`, so `{ ...local, ...remote }` sets `vcs: null` correctly. This should work, but if the JSON parse of null fails silently, `vcs` could remain as the old object.

### SY-014: A promotes cross, B logs VCS action on same cross at same time
- **Setup:** Cross C1, status "collecting virgins", `virginsCollected = 4`, target = 5. VCS enabled with pending morning collect. Instance A, Instance B.
- **Action:** A collects the 5th virgin at T+0 (promotes to "waiting for progeny", `vcs: null`). B logs a morning collect on C1 at T+0.5s (B hasn't received A's promotion yet).
- **Expected:** A's state has `vcs: null`, B's state has updated VCS with the collect action. The last push to Supabase wins.
- **Risk:** If B pushes after A, Supabase has B's state with VCS still active and status still "collecting virgins". A then receives this via realtime, but `isEditedLocally(C1.id)` is true (A just promoted). After 10s, A's guard expires and the next update overwrites A's promotion with B's stale state. The cross reverts from "waiting for progeny" back to "collecting virgins" -- a serious regression.

### SY-015: Auto-promote fires on both instances simultaneously
- **Setup:** Cross C1, status "waiting for virgins", `setupDate` = exactly 9 days ago. Both A and B are open. Both instances run the `useEffect` that checks promotions.
- **Action:** Both A and B detect the 9-day threshold and call `makeVcs()` independently, both setting status to "collecting virgins".
- **Expected:** Both create VCS objects with slightly different `lastClearTime` and `createdAt` (milliseconds apart). Both call `markEdited(C1.id)`. Both push.
- **Risk:** Two different VCS objects exist. The second push overwrites the first. Both instances' edit guards block the other's realtime. After guards expire (10s), the next sync event may flip the VCS object. The `todayActions` array and `lastClearTime` may oscillate between the two versions until one instance stops pushing.

### SY-016: VCS backfill on pull-first meets realtime VCS update
- **Setup:** Cross C1, status "collecting virgins", `vcs = null` in Supabase (legacy data). Instance A has `vcs` object in localStorage. Instance B is a fresh load.
- **Action:** A loads, pull-first fires. The merge logic (line 240) sees `local.vcs` exists and `rc.vcs` is null, so it preserves local VCS: `{ ...rc, vcs: local.vcs }`. Meanwhile B also loads and the backfill `useEffect` (line 54-65) creates a new VCS via `makeVcs()`. B pushes.
- **Expected:** A has the old localStorage VCS, B has a fresh VCS. Supabase gets B's VCS (B pushed). A eventually receives B's VCS via realtime.
- **Risk:** A's VCS (from localStorage) may have stale `lastClearTime` from days ago. B's VCS has `lastClearTime = now`. After A adopts B's VCS, the state is correct. But if A pushes before receiving B's realtime (the 2-second `initialPushBlocked` delay), A's stale VCS overwrites B's fresh one in Supabase.

### SY-017: Cross promoted to "collecting progeny" -- VCS set to null, then realtime re-adds it
- **Setup:** Cross C1, status "collecting virgins" with VCS. A promotes to "waiting for progeny" (`vcs: null`). Then auto-promote (9 days from `waitStartDate`) promotes to "collecting progeny" (no VCS re-created for this transition).
- **Action:** A pushes `vcs: null`. B receives realtime, updates C1. Later, a stale realtime echo arrives from an earlier Supabase write that still had VCS.
- **Expected:** Stale realtime should not re-add VCS since the shallow merge only applies fields present in the payload. If `vcs` is `null` in the stale payload, it sets `vcs: null`.
- **Risk:** If the stale payload has `vcs` as a non-null JSON string from before the promotion, the shallow merge `{ ...local, ...remote }` will overwrite `vcs: null` with the old VCS object, resurrecting it. The cross then shows a VCS dashboard despite being in "collecting progeny" status.

### SY-018: Delete cross with active VCS on A, B still interacting with it
- **Setup:** Cross C1, VCS enabled. Instance A, Instance B.
- **Action:** A deletes C1 at T+0. `markDeleted(C1.id)` gives 15s protection. `supabaseDeleteNow('crosses', C1.id)` fires. B logs a VCS action on C1 at T+1s.
- **Expected:** A's delete removes C1 from Supabase. B's push tries to upsert C1 with updated VCS. Since the row was deleted, the upsert re-creates it. C1 reappears in Supabase.
- **Risk:** A receives the realtime INSERT (C1 re-created by B's upsert). `isDeletedLocally(C1.id)` returns true (within 15s), so A ignores it. After 15s, if B pushes again or another realtime arrives, C1 reappears on A. The delete is effectively undone.

---

## Stale Realtime After Edit Guard Expiry (SY-019 to SY-024)

### SY-019: Edit guard expires, then delayed realtime overwrites local VCS action
- **Setup:** Stock S1, VCS enabled. Instance A clears S1 at T+0. `markEdited(S1.id)` starts 10s timer.
- **Action:** At T+5s, realtime arrives with pre-clear state (from some other change propagation). Blocked by edit guard. At T+11s, guard expires. At T+12s, a second realtime arrives (Supabase realtime retry or a different field update from B) carrying the same pre-clear VCS.
- **Expected:** At T+12s, the realtime is NOT blocked (guard expired). Shallow merge overwrites S1's VCS with the stale pre-clear state.
- **Risk:** A's clear action is lost. The user cleared 12 seconds ago and now sees the VCS revert to "needs clearing" state. The virgin window and deadline are wrong. This is the core problem the timestamp-based VCS winner is meant to fix.

### SY-020: Edit guard expires between debounced push and Supabase confirmation
- **Setup:** Stock S1. A edits S1 at T+0. `markEdited` starts at T+0. Debounced push scheduled for T+3s.
- **Action:** Push fires at T+3s, takes 2s network round-trip. At T+5s, Supabase confirms. Supabase emits realtime at T+5.1s (echo of A's own push). Meanwhile at T+10s, edit guard expires. At T+10.5s, B pushes a different version of S1 (edited notes). Realtime arrives at T+11s.
- **Expected:** At T+11s, `isEditedLocally` returns false. The realtime payload from B has B's notes change but may carry stale VCS (B's local copy didn't have A's VCS action because B pushed from stale state).
- **Risk:** A's VCS action is in Supabase (pushed at T+3s) but B's push at T+10.5s used B's local state which didn't include A's VCS action (B may have been offline or missed the realtime). B's upsert overwrites the entire row including VCS, reverting A's action.

### SY-021: Multiple rapid edits extend effective guard window, then cliff expiry
- **Setup:** Stock S1 with VCS. A performs collect at T+0, then another collect at T+5s, then a clear at T+9s. Each calls `markEdited(S1.id)`.
- **Action:** Each `markEdited` sets a new 10s `setTimeout` that deletes the ID from `_editedIds`. The first timeout fires at T+10s, removing the guard. But the second was set at T+5s (fires at T+15s), and the third at T+9s (fires at T+19s).
- **Expected:** Guard remains active until T+19s because each `markEdited` adds a new timeout but doesn't clear the previous one. The ID stays in the Set until the *first* timeout fires and removes it at T+10s.
- **Risk:** The implementation does `_editedIds.add(id); setTimeout(() => _editedIds.delete(id), 10000)`. Multiple calls add the same ID (no-op on Set) but each schedules a separate delete. The FIRST timeout to fire (T+10s) removes the ID, even though later edits at T+5s and T+9s intended to extend protection. The guard effectively expires 10s after the FIRST edit, not the LAST edit. This is a bug.

### SY-022: Realtime flood after guard expiry causes rapid state oscillation
- **Setup:** Stock S1. A and B both editing VCS. Multiple realtime messages queued by Supabase.
- **Action:** A's guard expires at T+10s. Supabase delivers 3 queued realtime messages in rapid succession (T+10.1s, T+10.2s, T+10.3s) with progressively older VCS states.
- **Expected:** Each realtime triggers `setStocks(prev => ...)` with shallow merge. The state updates 3 times in quick succession, potentially causing React to batch them unpredictably.
- **Risk:** React 19 batches state updates, so only the last merge may apply. If the messages are ordered oldest-first (Supabase guarantees ordering per-table), the final state is the newest queued message. But if ordering is not guaranteed, the final state could be any of the three, potentially the oldest/most stale.

### SY-023: Guard expiry coincides with 30s periodic poll
- **Setup:** Stock S1. A edits VCS at T+0. Guard expires at T+10s. Next periodic `rePullAux` fires at T+10s (by coincidence).
- **Action:** `rePullAux` only pulls virgin banks, exp banks, and transfers -- NOT stocks/crosses. So it does not overwrite S1.
- **Expected:** No conflict from `rePullAux`. S1 VCS remains as A set it. Only realtime or a full page reload re-pulls stocks.
- **Risk:** Actually no risk from the poll since `rePullAux` doesn't pull stocks. The risk is the false assumption that the 30s poll acts as a safety net -- it does NOT re-pull stocks or crosses, only auxiliary tables.

### SY-024: Tab-focus re-pull arrives exactly as edit guard expires
- **Setup:** Stock S1. A edits VCS at T+0. User switches away from A's tab at T+5s, switches back at T+10s.
- **Action:** Tab-focus triggers `rePullAux` at T+10s. But `rePullAux` does NOT re-pull stocks (only virgin/exp banks and transfers). The edit guard for S1 expires at T+10s simultaneously.
- **Expected:** No stock re-pull occurs. S1 keeps A's local state. A's debounced push (at T+3s) already sent to Supabase. If another realtime arrives now, the guard is expired and could overwrite.
- **Risk:** Users may expect tab-focus to "refresh everything" but it only refreshes auxiliary tables. Stocks rely entirely on realtime websocket, which may have dropped messages while the tab was backgrounded (browsers throttle WebSocket in background tabs).

---

## Two Users on Same Stock (SY-025 to SY-030)

### SY-025: Flo edits stock notes, Bella logs VCS action, same stock
- **Setup:** Stock S1, VCS enabled, maintainer Flo. Instance A (Flo) editing notes. Instance B (Bella) logging VCS action.
- **Action:** A saves notes at T+0, pushes at T+3s. B logs collect at T+1s, pushes at T+4s.
- **Expected:** B's push (T+4s) upserts the entire row with B's local state. B's local state has old notes (didn't receive A's push yet) but new VCS. Supabase now has new VCS but old notes.
- **Risk:** A's notes edit is overwritten by B's upsert. Full-row upsert with `onConflict: 'id'` replaces the entire row. There is no field-level merge on the Supabase side. This is a fundamental limitation of the sync architecture.

### SY-026: Maintainer changes stock's VCS schedule while another user collects
- **Setup:** Stock S1, VCS enabled, 2 collections/day. Flo changes to 3 collections/day on A. Bella is mid-collect on B.
- **Action:** A pushes schedule change at T+0. B pushes collect at T+1s. B's push has old schedule (2/day) plus the new collect action.
- **Expected:** B's push overwrites A's schedule change. Supabase reverts to 2/day.
- **Risk:** Same full-row upsert problem as SY-025. The VCS object is a single JSON blob; there is no field-level merge within it. Schedule change and action logging cannot be independently merged.

### SY-027: Two users log VCS collect on same stock, different action keys
- **Setup:** Stock S1, VCS enabled, 3 collections/day. Flo logs midday collect, Bella logs afternoon collect. Both see different "next action" because of timing.
- **Action:** Flo pushes midday collect at T+0. Bella pushes afternoon collect at T+1s from stale state (doesn't have Flo's midday collect).
- **Expected:** Bella's push replaces `todayActions`. Flo's midday collect is lost from the array.
- **Risk:** Since both started from the same base `todayActions`, Bella's push creates `[...oldActions, afternoonCollect]` without Flo's midday. Flo's collection physically happened but the VCS state doesn't reflect it. The dashboard shows midday collect still pending.

### SY-028: Non-maintainer triggers VCS action via shared stock
- **Setup:** Stock S1, maintainer Flo. The VCS dashboard filters by `s.maintainer === currentUser`, so Bella cannot see S1's VCS on her dashboard.
- **Action:** Bella opens S1 via deep link `?stock=S1.id` and edits it via StockModal. Bella changes a field that incidentally touches the VCS object (e.g., disables VCS).
- **Expected:** Bella's push sets `vcs: null` on S1. Flo receives realtime, S1 disappears from her VCS dashboard.
- **Risk:** No ownership check on VCS disable. Any user who can edit the stock can disable VCS. The `markEdited` guard on Flo's side would not be active (Flo hasn't edited recently), so the realtime is accepted immediately.

### SY-029: Transfer stock with active VCS from Flo to Bella
- **Setup:** Stock S1, VCS enabled, maintainer Flo. Flo initiates transfer to Bella. Transfer is accepted.
- **Action:** Flo's code sets `maintainer = 'Bella'` and pushes. Bella receives via realtime.
- **Expected:** S1 disappears from Flo's VCS dashboard (filtered by `maintainer === currentUser`) and appears on Bella's. VCS state is preserved.
- **Risk:** If Flo had a pending VCS action in `todayActions`, it transfers to Bella. Bella sees "Morning collect" as done even though it was Flo who did it. The VCS state doesn't track WHO performed each action, only that it was done.

### SY-030: Both users edit stock copies count while VCS is active
- **Setup:** Stock S1, VCS enabled, `copies = 2`. Instance A (Flo) changes to 3 copies. Instance B (Bella) changes to 4 copies.
- **Action:** A pushes at T+0, B pushes at T+1s. B's local state has `copies: 4` but VCS from before A's push.
- **Expected:** B's push sets copies to 4, but may also carry stale VCS if Flo had just logged a VCS action.
- **Risk:** Full-row upsert makes it impossible to independently update `copies` and `vcs` fields. The last writer wins on ALL fields.

---

## Two Users on Different Stocks (SY-031 to SY-033)

### SY-031: Independent VCS actions on different stocks, simultaneous push
- **Setup:** Stock S1 (maintainer Flo), Stock S2 (maintainer Bella). Both VCS enabled. Instance A (Flo), Instance B (Bella).
- **Action:** Flo clears S1 at T+0, Bella clears S2 at T+0. Both debounced pushes fire at T+3s.
- **Expected:** Both pushes succeed independently. `supabasePush` sends `changed` rows only (hash-based delta). A sends S1, B sends S2. No conflict.
- **Risk:** If both A and B push their entire stocks array (including the other's stock with stale VCS), the second push could overwrite the first's VCS change. However, the delta push only sends rows whose hash changed locally, so only the modified stock is pushed. This should be safe as long as neither instance modified the other's stock locally.

### SY-032: Different stocks, but one user's push includes stale copy of other's stock
- **Setup:** Stock S1 (Flo), Stock S2 (Bella). Flo's local copy of S2 is stale (old VCS). Flo edits S1.
- **Action:** Flo pushes. Delta hash sees S1 changed, S2 unchanged. Only S1 is pushed. Bella pushes S2. Only S2 is pushed.
- **Expected:** No interference. Hash-based delta correctly limits each push to the modified stock.
- **Risk:** If the hash of S2 on Flo's instance somehow differs from the last pushed hash (e.g., a realtime update changed a field without a push), S2 would be included in Flo's push with stale VCS. The `_lastPushed` map is initialized empty and populated on first push, so the very first push after page load sends ALL stocks regardless of what changed.

### SY-033: First push after load sends all stocks, potentially overwriting concurrent changes
- **Setup:** Instance A loads, pull-first completes. Instance B has been making VCS changes since A last closed.
- **Action:** A does a small edit (e.g., stock notes). The debounced push fires. `_lastPushed.stocks` is empty (fresh page load), so `_rowHash(r) !== _lastPushed.stocks.get(r.id)` is true for ALL stocks. A pushes the entire stocks array including stale VCS states for stocks B modified.
- **Expected:** All of A's stocks overwrite Supabase, including B's recent VCS changes that A received in pull-first but that B may have further updated between A's pull and A's push.
- **Risk:** A's first push is a full overwrite. If B made a VCS action in the few seconds between A's pull-first and A's first push, that action is lost. The `initialPushBlocked` 2-second delay (line 314-322) mitigates this slightly but does not eliminate it.

---

## Offline to Online Reconnection (SY-034 to SY-038)

### SY-034: Instance goes offline during VCS action, reconnects
- **Setup:** Instance A online, performs VCS clear on S1. Network drops before push completes.
- **Action:** Push fails, `catch` handler logs error and schedules retry in 5s. Network restores at T+8s. Retry succeeds. Meanwhile B has been making changes.
- **Expected:** A's retry pushes A's local state (including the clear). If B also cleared S1 during A's outage, A's push overwrites B's clear.
- **Risk:** The retry at T+8s pushes A's state which may be stale relative to B's changes. No merge logic runs on retry -- it's a blind upsert of A's current local state.

### SY-035: Offline for hours, reconnect with massively stale VCS
- **Setup:** Instance A goes offline at 09:00 with `lastClearTime = 08:30`. B does multiple VCS cycles throughout the day. Instance A reconnects at 17:00.
- **Action:** A's Supabase client reconnects websocket. Realtime subscription may or may not deliver all missed events (Supabase realtime does not guarantee delivery of missed events during disconnection).
- **Expected:** A should do a full page reload to get fresh data. Without reload, A may only receive future realtime events, not the backlog.
- **Risk:** A's local VCS state is 8+ hours stale. The `computeNextActions` function will show `cycleExpired = true` (past deadline + 30m). If A makes any edit and pushes, the stale VCS overwrites hours of B's work. There is no "you are stale, please reload" detection.

### SY-036: Push queued during offline, fires immediately on reconnect, races with pull
- **Setup:** A is offline. User makes VCS action. `pendingPush` is true. Network restores.
- **Action:** `beforeunload` or `visibilitychange` didn't fire (tab stayed visible). The debounced push already failed and scheduled a 5s retry. On network restore, the retry fires, pushing stale-ish data. Separately, the user might reload the page, triggering pull-first.
- **Expected:** If the user doesn't reload, only the retry push happens (no automatic re-pull of stocks). The push sends A's local state.
- **Risk:** No mechanism triggers a re-pull of stocks/crosses on network reconnect. Only `rePullAux` runs on the 30s interval, and it only pulls auxiliary tables. The stock VCS state may remain stale indefinitely after reconnect.

### SY-037: WebSocket reconnects but delivers events out of order
- **Setup:** Supabase realtime reconnects after brief outage. Multiple events queued server-side.
- **Action:** Events delivered: UPDATE S1 (VCS clear at T+5), UPDATE S1 (VCS collect at T+3). Out of order.
- **Expected:** Each event triggers `setStocks(prev => { ...prev[idx], ...item })`. The collect (T+3) arrives last and overwrites the clear (T+5). Final state has `lastClearTime` from the collect event's version, which is pre-clear.
- **Risk:** Shallow merge with no timestamp comparison means the last-delivered event wins regardless of when it actually occurred. Out-of-order delivery causes the older state to overwrite the newer state.

### SY-038: Offline instance pushes VCS delete, online instance has re-created the stock
- **Setup:** A deletes stock S1 at T+0 (offline). B notices S1 is gone (after a while), re-creates it with a new ID and new VCS setup at T+60s. A comes online at T+120s.
- **Action:** A's push fires `supabaseSyncDeletes('stocks', localIds)`. A's local IDs don't include S1 (deleted) or S1' (new, not yet pulled). S1 is already gone from Supabase. S1' is in Supabase with new ID. `supabaseSyncDeletes` sees S1' as `remoteOnly` (not in A's local IDs) and DELETES it.
- **Expected:** B's re-created stock S1' is deleted by A's sync.
- **Risk:** `supabaseSyncDeletes` deletes any remote ID not present locally. After an offline period, the local state may be missing stocks added by other users. Those stocks get deleted. This is a critical data loss vector.

---

## Tab-Focus Re-Pull Overwrites (SY-039 to SY-041)

### SY-039: Tab-focus re-pull overwrites virgin bank changes made offline
- **Setup:** Instance A backgrounded. User made virgin bank changes while tab was in focus. Then A was backgrounded.
- **Action:** A regains focus. `rePullAux` fires, pulls virgin bank from Supabase. `setVirginBank(remoteVB)` replaces local state entirely (line 397: `realtimeUpdateRef.current = true; setVirginBank(remoteVB)`).
- **Expected:** If A had pushed before being backgrounded, Supabase has A's changes and the re-pull returns them. If A's push hadn't completed (e.g., 3s debounce hadn't fired), A's local changes are lost.
- **Risk:** `rePullAux` does a hard replace of virgin bank state (`setVirginBank(remoteVB)`) without merge. Unlike the initial pull-first which does `Math.max(local, remote)` merge, the re-pull is a full overwrite. Any unpushed local virgin bank changes are lost.

### SY-040: Tab-focus re-pull of exp bank drops locally deleted entries
- **Setup:** Instance A deletes an exp entry. `deletedExpIds.current.add(sourceId)` with 15s timeout. A is backgrounded immediately.
- **Action:** A's push debounce fires (background tabs can still run setTimeout). Push deletes the entry from Supabase. A regains focus at T+20s (after 15s `deletedExpIds` timeout expired). `rePullAux` pulls exp bank. The entry is gone from Supabase.
- **Expected:** Re-pull returns exp bank without the deleted entry. A's local state is replaced. Correct behavior.
- **Risk:** If A regains focus BEFORE the push completes (push failed due to network), the re-pull returns the entry (still in Supabase). `deletedExpIds` may have expired (>15s). The entry reappears locally. The user deleted it but it came back.

### SY-041: Tab-focus re-pull on Instance A while Instance B is mid-push
- **Setup:** Instance A regains focus. Instance B is in the middle of a `supabasePushExpBank` that includes a delete-then-upsert sequence.
- **Action:** A's `rePullAux` runs `supabasePullExpBank`. B's push has completed the delete step but not the upsert step.
- **Expected:** A pulls the exp bank in an intermediate state -- some entries deleted but new entries not yet inserted. A gets an incomplete exp bank.
- **Risk:** The `supabasePushExpBank` function deletes orphans first, then upserts remaining entries (lines 193-210). If A pulls between these two steps, A sees a temporarily reduced set. The re-pull does a full replace, so A's local state loses the entries that B is about to re-insert.

---

## Rapid Push/Pull Cycles (SY-042 to SY-044)

### SY-042: Push-pull-push oscillation from two instances editing the same stock VCS
- **Setup:** Instance A and B both have stock S1 with VCS. Both are in sync at T+0.
- **Action:** A edits VCS at T+0 (state VA), pushes at T+3s. B receives realtime at T+3.5s, but `isEditedLocally` blocks it (B edited at T+1s, state VB). B pushes VB at T+4s. A receives realtime at T+4.5s, blocked by guard. A's guard expires at T+10s, A receives next event, adopts VB. A pushes VB (unchanged from Supabase, hash matches, no actual push). Stable.
- **Expected:** After both guards expire, both converge to whichever state is in Supabase (VB, since B pushed last).
- **Risk:** Between T+0 and T+10s, A shows VA and B shows VB. Users see inconsistent states for 10+ seconds. If either user makes a decision (e.g., physically collecting virgins) based on their local state, the action may be wrong for the converged state.

### SY-043: Debounce timer reset causes push starvation
- **Setup:** Instance A making rapid VCS changes (collect, collect, clear in succession). Each state change triggers `useEffect` which clears and resets the 3s debounce timer.
- **Action:** Change at T+0 schedules push at T+3. Change at T+1 cancels that, schedules at T+4. Change at T+2 cancels, schedules at T+5. Eventually pushes at T+5 with the final state.
- **Expected:** Only the final state is pushed. Intermediate states are never sent to Supabase. This is correct debounce behavior.
- **Risk:** If the user closes the tab during the debounce window, `beforeunload` fires `flush()` which calls `pushNow.current()`. This should catch the pending push. But if the browser kills the tab before the async push completes, data is lost.

### SY-044: Echo suppression via `realtimeUpdateRef` causes missed legitimate updates
- **Setup:** A pushes stock S1. Supabase emits realtime echo. A sets `realtimeUpdateRef.current = true` to suppress re-push. Meanwhile B pushes S2.
- **Action:** A receives realtime for S1 (own echo, correctly suppressed). Then A receives realtime for S2 (B's change). Both trigger `setStocks`. A sees `realtimeUpdateRef.current = true` (set by the S1 handler). The `useEffect` push handler checks this flag and skips the push.
- **Expected:** The S2 update is correctly applied to A's local state (realtime handler adds/merges it). The `realtimeUpdateRef` prevents an unnecessary re-push of S2 back to Supabase. This is correct.
- **Risk:** If A had made a local change to S2 between the realtime arrival and the push check, that local change would be skipped because `realtimeUpdateRef` is true. The flag is a coarse-grained push suppression -- it doesn't distinguish which stock was the realtime target.

---

## Realtime During Local State Update (SY-045 to SY-046)

### SY-045: Realtime arrives while React is processing a VCS setState
- **Setup:** Stock S1. User taps "Clear" on A, triggering `setStocks(p => p.map(...))`. Before React commits the update, a realtime event arrives for S1.
- **Action:** Realtime handler calls `setStocks(prev => { ...prev[idx], ...item })`. React 19 batches both updates. The second updater function receives the result of the first as `prev`.
- **Expected:** The clear updater runs first (user interaction has priority in React 19's event system). The realtime updater runs second, with `prev` containing the cleared state. The shallow merge `{ ...clearedStock, ...remoteItem }` overwrites the clear if `remoteItem.vcs` is stale.
- **Risk:** React 19 processes state updates in order of enqueue. If the realtime handler was enqueued first (e.g., from a microtask), it runs first. But `markEdited` was called synchronously in the click handler before the realtime could arrive. As long as `markEdited` runs before the realtime handler checks `isEditedLocally`, the guard protects. The timing is safe for synchronous interactions.

### SY-046: Realtime batch for multiple stocks includes one edited and one not
- **Setup:** Stocks S1, S2. A edited S1 (guard active). Realtime delivers updates for both S1 and S2 in the same Postgres transaction.
- **Action:** Supabase may deliver them as two separate events or batched. Each event checks `isEditedLocally`. S1 is blocked, S2 is accepted.
- **Expected:** S2 is updated, S1 is protected. Correct selective filtering.
- **Risk:** If the Supabase row for S2 was modified in the same transaction as S1 (e.g., a batch upsert), the realtime events may carry the same commit timestamp. The S2 update is correctly applied. No issue unless the application conflates the two.

---

## Virgin Bank and Exp Bank Per-User Isolation (SY-047 to SY-049)

### SY-047: Flo's virgin bank push does not affect Bella's virgin bank
- **Setup:** Flo has `flo-virgins-Flo = { S1: 5 }`. Bella has `flo-virgins-Bella = { S1: 3 }`. Both in Supabase keyed by `(user_name, stock_id)`.
- **Action:** Flo pushes virgin bank. `supabasePushVirginBank('Flo', bank)` upserts with `onConflict: 'user_name,stock_id'`. Flo's push only affects rows with `user_name = 'Flo'`.
- **Expected:** Bella's rows untouched. Per-user isolation is enforced by the composite key.
- **Risk:** The delete step in `supabasePushVirginBank` (line 168-175) queries with `.eq('user_name', userName)`, so it only deletes Flo's orphaned entries. Correct isolation.

### SY-048: Realtime virgin bank update for wrong user applied to current user
- **Setup:** Flo is logged in on A. Bella pushes her virgin bank on B. Supabase realtime fires for `virgin_banks` table.
- **Action:** The realtime handler (line 80-89) receives the INSERT/UPDATE payload. The handler does NOT check `payload.new.user_name` against `currentUser`. It blindly calls `setVirginBank(prev => { ...prev, [row.stock_id]: row.count })`.
- **Expected:** Flo's virgin bank state gets Bella's entry. If both have stock S1, Flo's count is overwritten with Bella's count.
- **Risk:** There is NO user filtering in the virgin bank realtime handler. Any user's virgin bank changes are applied to the current user's local state. This is a confirmed bug: the realtime handler should check `if (row.user_name !== currentUser) return;` but it does not.

### SY-049: Exp bank delete on A, realtime re-adds on B due to echo
- **Setup:** Flo deletes exp entry for cross C1 on Instance A. `deletedExpIds.current.add('C1')` with 15s timeout. `supabasePushExpBank` runs: deletes from Supabase first, then upserts remaining.
- **Action:** The delete triggers a Supabase DELETE event on the `exp_banks` table. B receives it and removes the entry. Then A's upsert of remaining entries triggers UPDATE events. B receives those (they don't include C1, so no issue). Meanwhile A receives the DELETE echo for C1 -- the handler (line 101-103) calls `setExpBank(prev => { ...prev }; delete next['C1'])`. The `deletedExpIdsRef` check (line 94) only protects against INSERT/UPDATE, not DELETE. The DELETE handler correctly removes it.
- **Expected:** Both A and B end up without the C1 entry. Correct.
- **Risk:** If the order of Supabase events is swapped (DELETE for C1 arrives after an INSERT for a different entry that was part of the same `supabasePushExpBank` call), there's no issue because they target different `source_id` values.

---

## PIN Sync Across Instances (SY-050)

### SY-050: PIN change on A, realtime arrives on B, localStorage updated without user action
- **Setup:** Flo changes her PIN on Instance A. `supabasePush` includes the new PIN hash. Instance B has Flo logged in.
- **Action:** Supabase realtime fires for `pins` table with `{ user_name: 'Flo', hash: '<new_hash>' }`. B's handler (line 71-79) sets `localStorage.setItem('flo-pin-Flo', newHash)` and increments `pinVersion`.
- **Expected:** B immediately has the new PIN. If B's user is currently locked, the new PIN works on the next unlock attempt. If B's user is unlocked (24h remember), no visible change.
- **Risk:** The PIN realtime handler has NO `isEditedLocally` guard. If two instances set different PINs simultaneously, the last realtime to arrive wins on both instances. One user's PIN choice is silently overwritten. Additionally, the handler writes to localStorage for ANY user's PIN (not just the current user), which is actually correct since PINs are stored per-user-key. However, if Bella changes her PIN on B and Flo is on A, Flo's localStorage gets Bella's new PIN hash -- which is correct (PINs are shared knowledge for the lock screen).
