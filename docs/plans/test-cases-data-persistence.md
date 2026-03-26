# Test Cases: Data Persistence, Serialization, and localStorage

**Scope:** VCS system data round-trips through localStorage (useLS), Supabase sync (sanitizeRow, toSnake/toCamel, JSON.parse), delta hashing, and field migration.

---

## DP-001: VCS object round-trip through localStorage via useLS

- **Setup:** Stock with VCS: `{ enabled: true, overnightAt18: true, collectionsPerDay: 2, schedule: { eveningClear: "17:30", morningCollect: "09:30", afternoonCollect: "17:00" }, lastClearTime: "2026-03-26T17:30:00.000Z", lastClearTemp: "18", virginDeadline: "2026-03-27T09:30:00.000Z", todayActions: [], createdAt: "2026-03-20T10:00:00.000Z" }`. Stock stored in `flo-stocks` array.
- **Action:** App loads, useLS reads `flo-stocks` from localStorage, JSON.parse reconstructs array.
- **Expected:** VCS object restored identically. `schedule` sub-object intact. `todayActions` is `[]`, not `null`. All ISO strings preserved exactly.
- **Risk:** JSON.parse silently converts nothing wrong here, but if localStorage was written with a non-JSON value (e.g., `[object Object]`), useLS catch block returns `init` (empty array), wiping all stocks.

---

## DP-002: VCS object round-trip through Supabase (push then pull)

- **Setup:** Stock with VCS object in memory. `_lastPushed.stocks` map is empty (first push).
- **Action:** `supabasePush` calls `toSnake` then `sanitizeRow` which JSON.stringifies the VCS object. Later, `supabasePull` reads the string, `toCamel` maps it back, then `JSON.parse` reconstructs the object.
- **Expected:** VCS object identical after round-trip. Nested `schedule` object, `todayActions` array all intact.
- **Risk:** `sanitizeRow` mutates the row in-place. If the same row reference is reused after push, the VCS field is now a string instead of an object, which could corrupt in-memory state if not careful about copying.

---

## DP-003: Corrupted VCS JSON string in Supabase

- **Setup:** Supabase `stocks` row has `vcs` column = `'{"enabled":true, "todayActions":[{'`. Truncated/malformed JSON.
- **Action:** `supabasePull` fetches row, detects `typeof s.vcs === 'string'`, calls `JSON.parse`.
- **Expected:** `JSON.parse` throws, catch block sets `s.vcs = null`. Stock loads without VCS. No crash.
- **Risk:** If the fallback `null` is not handled by all consumers (e.g., `computeNextActions` checks `vcs?.enabled`), the stock appears as non-VCS. Data loss of VCS config that must be re-entered manually.

---

## DP-004: VCS field is null in Supabase

- **Setup:** Supabase `stocks` row has `vcs` column = `null` (never configured).
- **Action:** `supabasePull` reads row. `typeof s.vcs === 'string'` is false for null, so no parse attempted.
- **Expected:** `s.vcs` remains `null`. Stock renders without VCS dashboard entry. `computeNextActions(null)` returns `[]` due to `!vcs?.enabled` guard.
- **Risk:** None expected. Well-handled path.

---

## DP-005: Empty todayActions array survives serialization

- **Setup:** VCS with `todayActions: []`.
- **Action:** `sanitizeRow` JSON.stringifies VCS. Supabase stores `"todayActions":[]`. Pull parses it back.
- **Expected:** `todayActions` is `[]` (empty array), not `null` or `undefined`.
- **Risk:** Some code uses `(todayActions || [])` defensively, so even if this became `null` it would work, but the empty array should round-trip cleanly.

---

## DP-006: todayActions with single action entry

- **Setup:** VCS with `todayActions: [{ type: "collect", key: "morning", time: "2026-03-26T09:30:00.000Z", scheduled: "09:30" }]`.
- **Action:** Push to Supabase, pull back.
- **Expected:** Array with one object restored. All fields (`type`, `key`, `time`, `scheduled`) preserved as strings.
- **Risk:** None expected for single entry.

---

## DP-007: todayActions with 100 action entries (stress test)

- **Setup:** VCS with `todayActions` containing 100 action objects (simulating a bug where actions accumulate without reset).
- **Action:** `sanitizeRow` JSON.stringifies the large VCS object. Push to Supabase.
- **Expected:** JSON string is large but valid. Supabase `text`/`jsonb` column accepts it. Pull parses successfully. `computeNextActions` iterates all 100 in the `forEach` loop building `doneKeys`.
- **Risk:** Performance degradation in `computeNextActions` (O(n) loop over 100 entries per render tick). Supabase column size limit if using `varchar` instead of `text`/`jsonb`. Delta hash string comparison becomes expensive.

---

## DP-008: VCS object with extra unknown fields

- **Setup:** VCS object includes fields not in current schema: `{ enabled: true, ..., unknownField: "test", futureFlag: 42 }`.
- **Action:** Store in localStorage via useLS, push to Supabase via sanitizeRow.
- **Expected:** Unknown fields preserved in localStorage (JSON round-trip keeps all keys). Supabase stores them inside the JSON string (since VCS is stored as a single JSON blob, not individual columns). Pull restores them.
- **Risk:** None for persistence. But if a future code path destructures VCS and spreads into a new object, unknown fields carry forward. If code does `{ ...v, todayActions: newActions }`, unknown fields are preserved.

---

## DP-009: VCS missing required fields (no schedule object)

- **Setup:** VCS object: `{ enabled: true, overnightAt18: false, collectionsPerDay: 2 }`. Missing `schedule`, `lastClearTime`, `lastClearTemp`, `todayActions`.
- **Action:** `computeNextActions` is called on this VCS.
- **Expected:** `schedule` is `undefined`, so `schedule.eveningClear` etc. are `undefined`. `parseHHMM(undefined)` returns `null`, so actions are skipped. `lastClearTime` is `undefined`, `clearMs` = 0. `todayActions` guard `(todayActions || [])` handles the undefined. Returns empty actions array.
- **Risk:** The function won't crash but returns no actions, making VCS appear "all done" (green status). The user sees a VCS-enabled stock with no upcoming actions, which is confusing.

---

## DP-010: VCS missing lastClearTime field

- **Setup:** VCS: `{ enabled: true, overnightAt18: true, collectionsPerDay: 2, schedule: { eveningClear: "17:30", morningCollect: "09:30", afternoonCollect: "17:00" }, todayActions: [] }`. No `lastClearTime`.
- **Action:** `computeNextActions` runs.
- **Expected:** `lastClearTime` is undefined. `clearMs = 0` (falsy path). `deadline = null`. Evening clear not auto-marked done (guard `if (lastClearTime) doneKeys.add('evening')` fails). All scheduled actions appear in result.
- **Risk:** All actions show as pending including evening clear, which is normally auto-done. User may be confused by the "Clear" action appearing when they haven't started a cycle.

---

## DP-011: localStorage cleared mid-session

- **Setup:** App is running with stocks and crosses loaded in React state. User opens DevTools and calls `localStorage.clear()`.
- **Action:** React state is unaffected (useState holds values in memory). Next state update triggers useLS write effect, which re-persists current state to localStorage.
- **Expected:** On the next `setStocks` or `setCrosses` call, the useLS effect writes the current state back to localStorage. Data survives the clear as long as the app remains open.
- **Risk:** If the app is refreshed before any state update triggers a write, ALL data is lost (useLS init reads empty localStorage, falls back to `init` which is `[]` for stocks/crosses). Virgin banks, PINs, user preference all gone.

---

## DP-012: localStorage cleared then app refreshed before sync

- **Setup:** App has stocks with VCS in localStorage. User clears localStorage and immediately refreshes.
- **Action:** useLS reads `flo-stocks`, gets `null`, falls back to `[]`. Supabase pull triggers, fetches remote data.
- **Expected:** Remote data replaces local. If VCS was synced to Supabase, it is restored. If VCS was only in localStorage (never pushed), it is lost.
- **Risk:** VCS data created offline and never synced is permanently lost. The pull-first logic in App.jsx replaces stocks entirely with remote data (not merge -- it maps over `remote.stocks` only preserving local VCS if remote has none).

---

## DP-013: localStorage quota exceeded on VCS write

- **Setup:** localStorage is nearly full (5MB limit). Stocks array with many VCS objects is large.
- **Action:** useLS effect calls `localStorage.setItem(key, JSON.stringify(v))`. Throws `QuotaExceededError`.
- **Expected:** useLS catches the error, logs `'localStorage full'` to console. React state is unaffected (data still in memory). But localStorage does NOT contain the latest state.
- **Risk:** Silent data loss on next refresh. App continues working in-memory but any page reload loses unsaved changes. No user-visible warning. If Supabase sync is active, push will still work (it reads from React state, not localStorage).

---

## DP-014: Concurrent localStorage writes from two tabs

- **Setup:** Two tabs open with the same user. Tab A modifies stock VCS, tab B modifies a different stock's VCS. Both write to `flo-stocks`.
- **Action:** Tab A calls `setStocks(...)` which triggers useLS write. Tab B calls `setStocks(...)` independently.
- **Expected:** Last write wins. Whichever tab's useLS effect fires last overwrites `flo-stocks` in localStorage. The other tab's changes to different stocks are lost from localStorage.
- **Risk:** Data loss of one tab's changes. There is no cross-tab `storage` event listener in useLS to detect external writes. Neither tab is aware of the conflict. Supabase push may partially save one tab's changes, but the localStorage state will be inconsistent.

---

## DP-015: sanitizeRow converts empty string VCS to null

- **Setup:** Stock row after `toSnake`: `{ id: "abc", name: "Test", vcs: "" }`.
- **Action:** `sanitizeRow` iterates keys. `row.vcs === ''` triggers `row[k] = null`.
- **Expected:** `vcs` becomes `null`. Pushed to Supabase as null. On pull, stock has no VCS.
- **Risk:** If a bug sets VCS to empty string instead of null/undefined, it silently clears the VCS config. This is actually correct behavior (empty string shouldn't be a VCS), but could mask bugs.

---

## DP-016: sanitizeRow with VCS as already-stringified JSON (double stringify)

- **Setup:** Due to a bug, VCS is already a JSON string before `sanitizeRow`: `row.vcs = '{"enabled":true}'` (typeof === 'string').
- **Action:** `sanitizeRow` checks `k === 'vcs' && row[k] && typeof row[k] === 'object'`. Since it's a string, the condition is false. VCS is left as-is.
- **Expected:** The already-stringified VCS is pushed as a string. On pull, `JSON.parse` parses it correctly back to an object.
- **Risk:** No double-stringify occurs. This is safe. But if VCS were somehow double-stringified (a string containing `'"{\\"enabled\\":true}"'`), pull would parse the outer string, leaving an inner string, which would not be re-parsed -- VCS would be a string, not an object, causing runtime errors.

---

## DP-017: sanitizeRow mutates row in-place (aliasing risk)

- **Setup:** Stock object in React state. `toSnake` creates a new object, but `sanitizeRow` mutates it.
- **Action:** `supabasePush` calls `sanitizeRow(toSnake(s, STOCK_FIELD_MAP))`. The result of `toSnake` is a new object, so the original stock is not mutated.
- **Expected:** Original stock object in React state retains VCS as an object. The snake-case copy has VCS as a string.
- **Risk:** Safe because `toSnake` creates a new object. But if someone calls `sanitizeRow` directly on a stock object reference, VCS would be mutated from object to string in React state, breaking all VCS rendering.

---

## DP-018: Delta hash detects VCS todayActions change

- **Setup:** Stock pushed once with `todayActions: []`. Hash stored in `_lastPushed.stocks`. User logs a collect action, `todayActions: [{ type: "collect", key: "morning", time: "..." }]`.
- **Action:** Next push: `sanitizeRow(toSnake(stock))` produces a row. `_rowHash(row)` (JSON.stringify) produces a different string than the stored hash.
- **Expected:** Stock is included in the `changed` array and upserted to Supabase.
- **Risk:** None. The stringify of the entire row captures all nested changes.

---

## DP-019: Delta hash false positive from key ordering

- **Setup:** Stock pushed with VCS fields in order `{ enabled, overnightAt18, ... }`. On next push cycle, the in-memory object has the same fields but in a different property insertion order.
- **Action:** `JSON.stringify` produces a string. If key order differs, the hash differs, triggering an unnecessary push.
- **Expected:** Unnecessary push (upsert with identical data). No data corruption, just wasted network.
- **Risk:** `toSnake` iterates `Object.entries(STOCK_FIELD_MAP)` which has a fixed order, so the snake-case row always has the same key order. Inside VCS (which is stringified), key order depends on how the object was constructed. Spread operators and `Object.assign` can change order. Possible phantom pushes.

---

## DP-020: Delta hash with undefined vs missing field

- **Setup:** First push: stock has `{ id: "a", name: "X", vcs: null }`. Second push: identical stock but VCS key is `undefined` (not present after toSnake since `obj[camel] !== undefined` skips it).
- **Action:** First hash includes `"vcs":null`. Second hash omits `vcs` key entirely.
- **Expected:** Hashes differ. Stock is re-pushed even though semantically identical.
- **Risk:** Unnecessary push. No data loss. But `null` vs missing field could cause issues if Supabase column has a NOT NULL constraint (it shouldn't for VCS).

---

## DP-021: virginDeadline field present in old VCS data

- **Setup:** Existing stock in localStorage with VCS containing `virginDeadline: "2026-03-27T09:30:00.000Z"` (legacy field).
- **Action:** App loads, useLS restores stock. `computeNextActions` runs.
- **Expected:** `virginDeadline` field is ignored by `computeNextActions` (it computes deadline dynamically from `lastClearTime`). Field remains in the object but has no effect.
- **Risk:** None functionally. The field takes up space in localStorage and Supabase. Delta hash includes it, so removing it from the object would trigger a push.

---

## DP-022: virginDeadline removal backward compatibility

- **Setup:** Remote Supabase row has VCS JSON with `virginDeadline`. New code version deployed that still writes `virginDeadline` in `makeVcs` (line 19 of vcs.js) and in `logAction` (HomeScreen.jsx line 334, 526).
- **Action:** Stock is pulled, VCS parsed. `virginDeadline` is present. User logs a clear action, code sets `newVcs.virginDeadline = computeDeadline(...)`.
- **Expected:** Field continues to be written and round-trips. No error.
- **Risk:** If `virginDeadline` is removed from `makeVcs` and `logAction` in a future commit but old data still has it, the field persists in localStorage and Supabase until the VCS object is fully reconstructed. No functional issue since `computeNextActions` never reads it.

---

## DP-023: VCS with null virginDeadline in demo data

- **Setup:** Demo data sets `virginDeadline: null` explicitly (demo.js lines 32, 42, 66, etc.).
- **Action:** `sanitizeRow` processes the VCS. `JSON.stringify` includes `"virginDeadline":null`.
- **Expected:** Field stored as null in JSON string. On pull, parsed back as null. `computeDeadline` is never called with this value (it's computed dynamically).
- **Risk:** None. The null value is benign.

---

## DP-024: PIN hash stored in localStorage

- **Setup:** User "Flo" sets PIN "1234". `hashPin("1234")` produces SHA-256 hex string. Stored as `localStorage.setItem('flo-pin-Flo', hash)`.
- **Action:** App loads. PinLock reads `localStorage.getItem('flo-pin-Flo')`.
- **Expected:** Hash string retrieved. User enters PIN, `hashPin("1234")` produces same hash, comparison succeeds, user unlocks.
- **Risk:** PIN hash is stored as a raw string, NOT via useLS (no JSON.stringify wrapping). If someone accidentally wraps it with useLS or JSON.stringify, the stored value would be `'"abc123..."'` (double-quoted), and direct comparison would fail.

---

## DP-025: PIN hash synced to Supabase and restored

- **Setup:** Flo's PIN hash in localStorage. Supabase `pins` table has `{ user_name: 'Flo', hash: '...' }`.
- **Action:** `supabasePush` sends `{ user_name: 'Flo', hash: '...' }`. On another device, `supabasePull` retrieves it. Code checks `!localStorage.getItem('flo-pin-Flo')` before writing.
- **Expected:** PIN hash restored on new device. Only written if not already present (avoids overwriting local PIN change).
- **Risk:** If user changes PIN on device A and device B already has the old PIN, device B won't update because `localStorage.getItem('flo-pin-Flo')` returns the old hash (truthy). The `!localStorage.getItem(...)` guard prevents sync of updated PINs. This is a known limitation.

---

## DP-026: PIN hash with special characters in PIN

- **Setup:** User enters PIN with special characters (e.g., "12!@"). `hashPin` encodes `"12!@flo-salt"` via TextEncoder.
- **Action:** SHA-256 hash computed, stored in localStorage.
- **Expected:** Hash is a 64-char hex string regardless of input. Stored and retrieved correctly.
- **Risk:** None. SHA-256 output is always hex characters.

---

## DP-027: Virgin bank serialization via useLS

- **Setup:** Virgin bank: `{ "stock-abc": 5, "stock-def": 12 }`. Stored under `flo-virgins-Flo`.
- **Action:** useLS writes `JSON.stringify({ "stock-abc": 5, "stock-def": 12 })`. On reload, useLS reads and parses.
- **Expected:** Object restored with integer counts. Stock IDs as string keys preserved.
- **Risk:** None for simple number values. But if a count is accidentally set to a string (e.g., `"5"`), JSON round-trip preserves the string. Code doing `count + 1` would produce `"51"` instead of `6`.

---

## DP-028: Virgin bank with zero-count entries

- **Setup:** Virgin bank: `{ "stock-abc": 0, "stock-def": 5 }`.
- **Action:** `supabasePushVirginBank` filters `([, count]) => count > 0`, so stock-abc is excluded from push. Only stock-def pushed.
- **Expected:** Zero-count entries not synced to Supabase. On pull, only stock-def returns. Local zero-count entry lost on cross-device sync.
- **Risk:** If user sets a count to 0 on device A, device B still shows the old count from Supabase. The zero isn't pushed as a deletion either (the delete logic checks remote entries not in `localIds` where localIds only includes `count > 0`). Actually, the delete logic DOES handle this: `localIds = new Set(Object.keys(virginBank).filter(k => virginBank[k] > 0))`, so stock-abc with 0 is not in localIds, and the remote entry IS deleted. Correct behavior.

---

## DP-029: Virgin bank push when localStorage key changes on user switch

- **Setup:** User switches from Flo to Bella. useLS key changes from `flo-virgins-Flo` to `flo-virgins-Bella`.
- **Action:** useLS detects key change in the `useEffect` with `prevKey` ref. Reads `flo-virgins-Bella` from localStorage.
- **Expected:** Bella's virgin bank loaded. Flo's virgin bank remains in localStorage under `flo-virgins-Flo` (not overwritten).
- **Risk:** The useLS effect that writes `v` to localStorage fires on `[key, v]` changes. When key changes, `v` is updated to Bella's data (from the read effect), then the write effect fires with the new key and new value. But there's a timing issue: the write effect runs after both key and v change. If key changes first and v hasn't updated yet, it could write Flo's data to Bella's key. However, React batches these updates, so both effects run with consistent state.

---

## DP-030: Exp bank serialization with male/female counts

- **Setup:** Exp bank: `{ "cross-123": { m: 10, f: 15, source: "cross" } }`. Stored under `flo-exp-Flo`.
- **Action:** useLS writes JSON. On reload, parsed back.
- **Expected:** Nested object with `m`, `f`, `source` fields restored correctly.
- **Risk:** If `source` field is missing (old data format), `supabasePushExpBank` defaults to `v.source || 'cross'`. Round-trip safe.

---

## DP-031: toSnake skips undefined VCS field

- **Setup:** Stock object: `{ id: "abc", name: "Test" }`. No `vcs` property.
- **Action:** `toSnake(stock, STOCK_FIELD_MAP)` iterates entries. `obj['vcs']` is `undefined`, so `if (obj[camel] !== undefined)` is false. `vcs` key not included in output.
- **Expected:** Snake-case row has no `vcs` key. Supabase upsert does not set the `vcs` column (uses existing value or default null).
- **Risk:** If Supabase column has a default value, it stays. If the intent was to clear VCS, this won't do it. The stock must explicitly set `vcs: null` for it to be included in the push and clear the column.

---

## DP-032: toCamel with unknown Supabase columns

- **Setup:** Supabase returns a row with an extra column not in `STOCK_FIELD_MAP`: `{ id: "abc", name: "Test", vcs: null, created_by: "admin" }`.
- **Action:** `toCamel` builds a reverseMap from STOCK_FIELD_MAP. For `created_by`, no reverse mapping exists. The fallback `reverseMap[key] || key` uses the original key `created_by`.
- **Expected:** Output object has `created_by` (snake_case) as a key. Not converted to camelCase.
- **Risk:** The extra field persists in the stock object. If the stock is later pushed, `toSnake` won't include `created_by` (not in STOCK_FIELD_MAP), so it's silently dropped on the next push. Harmless but potentially confusing during debugging.

---

## DP-033: VCS schedule object with null middayCollect

- **Setup:** VCS for 2-collection schedule: `schedule: { eveningClear: "17:30", morningCollect: "09:30", middayCollect: null, afternoonCollect: "17:00" }`.
- **Action:** `JSON.stringify` includes `"middayCollect":null`. `sanitizeRow` does NOT convert this to null (it's nested inside the VCS object which is stringified as a whole). Push. Pull. Parse.
- **Expected:** `schedule.middayCollect` is `null` after round-trip. `computeNextActions` only adds midday action `if (collectionsPerDay === 3 && schedule.middayCollect)`, so null correctly excluded.
- **Risk:** None. Null value correctly prevents the midday collection slot.

---

## DP-034: VCS with boolean false fields

- **Setup:** VCS: `{ enabled: false, overnightAt18: false, ... }`.
- **Action:** `JSON.stringify` correctly serializes `false` as `false`. `sanitizeRow` only converts empty strings to null, not false. Push and pull.
- **Expected:** `enabled: false` and `overnightAt18: false` preserved. `computeNextActions` returns `[]` because `!vcs?.enabled` is true.
- **Risk:** None. Boolean false is correctly handled by JSON serialization and the sanitizeRow check.

---

## DP-035: VCS with Date objects instead of ISO strings

- **Setup:** Bug scenario: VCS `lastClearTime` is a Date object instead of an ISO string: `lastClearTime: new Date("2026-03-26T17:30:00Z")`.
- **Action:** `JSON.stringify` converts Date to ISO string: `"2026-03-26T17:30:00.000Z"`. Push to Supabase. Pull back as string.
- **Expected:** After round-trip, `lastClearTime` is an ISO string (not a Date object). `computeNextActions` calls `new Date(lastClearTime).getTime()` which works on both Date objects and ISO strings.
- **Risk:** Code that checks `typeof lastClearTime === 'string'` would fail before serialization. But after localStorage/Supabase round-trip, it's always a string. The inconsistency is only in-memory before persistence.

---

## DP-036: VCS with Infinity or NaN in collectionsPerDay

- **Setup:** Bug: `collectionsPerDay: NaN` or `collectionsPerDay: Infinity`.
- **Action:** `JSON.stringify` converts `NaN` to `null` and `Infinity` to `null`. Push to Supabase.
- **Expected:** After round-trip, `collectionsPerDay` is `null`. The check `if (collectionsPerDay === 3 && ...)` fails (null !== 3). Only the standard evening/morning/afternoon actions are generated, midday is skipped.
- **Risk:** `null` for collectionsPerDay makes the VCS partially non-functional. The dashboard would show `null` in the display string `{v.collectionsPerDay}x`. No crash, but confusing UI.

---

## DP-037: Very large VCS object approaching localStorage quota

- **Setup:** 500 stocks, each with VCS containing 50 todayActions entries. Total `flo-stocks` JSON is ~2MB.
- **Action:** useLS writes the full array on every stock update.
- **Expected:** Write succeeds if under 5MB quota. Each single stock VCS change rewrites the entire 2MB string.
- **Risk:** Performance: `JSON.stringify` of 2MB on every state change. Approaches quota limit quickly. If quota exceeded, useLS silently logs error and stops persisting. User unaware of data loss risk.

---

## DP-038: localStorage write with circular reference in VCS

- **Setup:** Bug: VCS object has a circular reference (e.g., `vcs.self = vcs`).
- **Action:** useLS calls `JSON.stringify(stocks)`. Throws `TypeError: Converting circular structure to JSON`.
- **Expected:** useLS catch block catches the error. But the catch only handles `QuotaExceededError` specifically. For other errors, the catch still executes (it's a bare catch), but only logs for quota errors.
- **Risk:** The write silently fails. localStorage retains the previous version. No user notification. On refresh, stale data loaded. Actually, looking at the code: the catch is bare (`catch (e)`) and only does `if (e?.name === 'QuotaExceededError') console.error(...)`. Other errors are silently swallowed.

---

## DP-039: useLS init with invalid JSON in localStorage

- **Setup:** `localStorage.getItem('flo-stocks')` returns `"not valid json {["`.
- **Action:** useLS constructor calls `JSON.parse(s)`. Throws SyntaxError.
- **Expected:** Catch block returns `init` (empty array `[]`). All stocks lost.
- **Risk:** Total data loss of stocks. If Supabase sync is configured, pull-first logic restores from remote. If offline-only, data is gone. The corrupted localStorage entry is overwritten on the next state write.

---

## DP-040: useLS key change triggers re-read from localStorage

- **Setup:** `currentUser` changes from "Flo" to "Bella". useLS key for virgin bank changes from `flo-virgins-Flo` to `flo-virgins-Bella`.
- **Action:** useLS `useEffect` with `[key]` dependency detects `prevKey.current !== key`. Reads `flo-virgins-Bella` from localStorage.
- **Expected:** State updated to Bella's virgin bank. Previous Flo data persisted in `flo-virgins-Flo`.
- **Risk:** The effect updates state via `setV(...)` which triggers the write effect. The write effect sees the new key and the new value, so it writes Bella's data to `flo-virgins-Bella`. Correct. But there's a render cycle between key change and state update where the component briefly has Bella's key but Flo's data.

---

## DP-041: Multiple useLS hooks sharing overlapping keys

- **Setup:** `flo-vcs-notify` used in both App.jsx (line 484) and SettingsScreen.jsx (line 11).
- **Action:** User toggles VCS notify in Settings. SettingsScreen's useLS writes to `flo-vcs-notify`. App.jsx's useLS has a stale value.
- **Expected:** App.jsx's `vcsNotify` state does NOT auto-update because useLS has no `storage` event listener. The two hooks are independent React state instances.
- **Risk:** Inconsistent state between components until App re-reads on next mount. Since SettingsScreen is rendered inside App, both are mounted simultaneously. The App.jsx value is stale until page refresh. However, in practice, SettingsScreen likely calls a prop callback that updates App's state too. Checking the code would confirm.

---

## DP-042: flo-unlock-ts stored as raw string (not JSON)

- **Setup:** On PIN unlock, code runs `localStorage.setItem('flo-unlock-ts', String(Date.now()))`. This is a raw numeric string, NOT JSON.
- **Action:** On app load, code reads `localStorage.getItem('flo-unlock-ts')` and uses `Number(ts)`.
- **Expected:** Works correctly. `Number("1711461600000")` returns the timestamp. Lock check: `Date.now() - Number(ts) > 24h`.
- **Risk:** If this value were accidentally read by a useLS hook (which JSON.parses), `JSON.parse("1711461600000")` would return the number, which would actually work. No real risk, but inconsistent storage pattern (raw string vs JSON).

---

## DP-043: Supabase pull during active localStorage write

- **Setup:** User edits a stock VCS. useLS write effect is queued. Simultaneously, a 30s periodic Supabase pull completes and calls `setStocks(remote)`.
- **Action:** React batches state updates. The pull's `setStocks` and the edit's `setStocks` are both functional updates (using `prev =>` pattern in pull).
- **Expected:** React applies both updates sequentially. The pull replaces stocks with remote data (it maps over `remote.stocks`, not merging with local). The edit's pending update may be lost.
- **Risk:** VCS edit lost if the periodic pull overwrites stocks between the user action and the push. The `markEdited(id)` + `isEditedLocally(id)` pattern is used for realtime events but NOT for periodic pulls. Periodic pull in App.jsx replaces stocks entirely.

---

## DP-044: VCS action time stored during timezone change

- **Setup:** User in UTC+1 logs a VCS action at 17:30 local time. `new Date().toISOString()` produces `"2026-03-26T16:30:00.000Z"`. Later, user travels to UTC+2.
- **Action:** `computeNextActions` compares `lastClearTime` ISO string with `now.getTime()`.
- **Expected:** All comparisons use UTC milliseconds. Timezone change has no effect on the math. `new Date("2026-03-26T16:30:00.000Z").getTime()` is absolute.
- **Risk:** The `schedule` times (e.g., `"17:30"`) are local wall-clock times parsed by `parseHHMM`. The `suggestedMs` is computed relative to `baseDay.setHours(0,0,0,0)` which uses LOCAL midnight. After timezone change, the scheduled times shift by the timezone difference. This could cause incorrect overdue calculations for a cycle that spans a timezone change.

---

## DP-045: Realtime subscription receives VCS update as JSON string

- **Setup:** Supabase realtime sends a stock update where `vcs` is a JSON string (as stored in DB).
- **Action:** App.jsx realtime handler processes the payload. The handler likely calls `toCamel` but may or may not JSON.parse the VCS field.
- **Expected:** If the realtime handler uses the same `supabasePull` parsing logic, VCS is correctly parsed. If it handles raw payloads differently, VCS may remain a string.
- **Risk:** Need to verify the realtime handler parses VCS strings. If VCS stays as a string in React state, all rendering code expecting an object will fail (`vcs.enabled`, `vcs.todayActions`, etc.). The `?.` optional chaining on `vcs?.enabled` would return undefined (strings don't have `enabled` property), so VCS would appear disabled.

---

## DP-046: Merge conflict when local has VCS but remote has null VCS

- **Setup:** Local stock has VCS configured. Remote Supabase stock has `vcs: null` (VCS was disabled on another device).
- **Action:** `supabasePull` runs. App.jsx pull handler (line 231): `if (local?.vcs && !rs.vcs) { return { ...rs, vcs: local.vcs }; }`.
- **Expected:** Local VCS is PRESERVED over the remote null. The pull handler explicitly keeps local VCS when remote has none.
- **Risk:** This means VCS can never be disabled remotely -- if device A disables VCS (sets null), device B will keep its local VCS and re-push it. The VCS "sticks" and can only be disabled on the device that currently has it. This is intentional (VCS backfill) but could confuse users expecting cross-device VCS removal.

---

## DP-047: Stock with VCS pushed, then VCS removed locally, then push

- **Setup:** Stock previously pushed with VCS. `_lastPushed.stocks` has hash including VCS JSON string. User disables VCS, stock now has `vcs: null`.
- **Action:** Next push: `toSnake` includes `vcs: null` (null !== undefined). `sanitizeRow` does not touch null (only empty string becomes null). Row hash now includes `"vcs":null`.
- **Expected:** Hash differs from stored hash (which had VCS JSON string). Stock is included in changed set. Upsert sends `vcs: null` to Supabase. VCS cleared remotely.
- **Risk:** The VCS backfill on pull (DP-046) will re-add the VCS from any other device that still has it locally. The disable doesn't propagate reliably across devices.

---

## DP-048: VCS schedule times as non-string values

- **Setup:** Bug: schedule `eveningClear` is a number `1730` instead of string `"17:30"`.
- **Action:** `sanitizeRow` + `JSON.stringify` stores `1730` as a number. On pull, parsed back as number. `parseHHMM(1730)` receives a number.
- **Expected:** `parseHHMM` behavior depends on implementation. If it expects a string with ":" separator, `1730` (number) would fail to match. `parseHHMM` likely returns `null`, causing the action to be skipped.
- **Risk:** VCS actions silently disappear from the dashboard. No error thrown, just no scheduled actions generated. Hard to debug.

---

## DP-049: flo-stocks contains non-array JSON

- **Setup:** `localStorage.getItem('flo-stocks')` returns `'{"corrupted": true}'` (an object, not an array).
- **Action:** useLS parses it. `JSON.parse('{"corrupted": true}')` returns an object. React state is now an object, not an array.
- **Expected:** App code assumes `stocks` is an array. `stocks.map(...)`, `stocks.filter(...)`, `stocks.find(...)` all throw `TypeError: stocks.map is not a function`.
- **Risk:** App crashes. ErrorBoundary catches the render error and shows fallback UI. But the corrupted state persists in localStorage. On refresh, same crash. User must manually clear localStorage or hope Supabase pull replaces the data (pull handler in App.jsx maps over `remote.stocks`, not local, so it would recover).

---

## DP-050: VCS createdAt field preserved through all persistence layers

- **Setup:** VCS created with `createdAt: "2026-03-20T10:00:00.000Z"`. Stock goes through: React state -> useLS -> localStorage -> useLS read -> React state -> toSnake -> sanitizeRow (VCS stringified) -> Supabase -> supabasePull -> JSON.parse -> toCamel -> React state.
- **Action:** Full round-trip through all layers.
- **Expected:** `createdAt` field preserved as the original ISO string `"2026-03-20T10:00:00.000Z"` at every stage. No transformation applied (not in any field map as a standalone field -- it's inside the VCS JSON blob).
- **Risk:** None for the value itself. But `createdAt` inside VCS is distinct from `createdAt` on the stock (which IS in `STOCK_FIELD_MAP` mapped to `created_at`). If someone confuses the two, they might update the wrong one. The VCS `createdAt` tracks when VCS was enabled; the stock `createdAt` tracks when the stock was created.
