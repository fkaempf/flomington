/* ========== VCS (Virgin Collection Stock) ========== */

import { parseHHMM } from './dates.js';

export function vcsKey(o18, n) { return (o18 ? '18' : '25') + '_' + n; }

export function getVirginWindowH() { return 8; }

// Compute virgin deadline from a clear timestamp
export function computeDeadline(clearIso, o18) {
  if (!clearIso) return null;
  return new Date(new Date(clearIso).getTime() + getVirginWindowH(o18) * 3600000).toISOString();
}

export function makeVcs(o18, cpd, sched) {
  const now = new Date().toISOString();
  return {
    enabled: true, overnightAt18: !!o18, collectionsPerDay: cpd, schedule: { ...sched },
    lastClearTime: now, lastClearTemp: o18 ? '18' : '25', virginDeadline: computeDeadline(now, !!o18),
    todayActions: [], createdAt: now,
  };
}

// Core dynamic engine: compute next actions for a VCS stock
export function computeNextActions(vcs, now) {
  if (!vcs?.enabled) return [];
  now = now || new Date();
  const { overnightAt18, collectionsPerDay, schedule, lastClearTime, lastClearTemp, todayActions } = vcs;
  // Use lastClearTemp for current cycle behavior (allows "No, room temp" override)
  const cycleAt18 = lastClearTemp ? lastClearTemp === '18' : overnightAt18;
  const windowMs = getVirginWindowH(cycleAt18) * 3600000;

  // Build the ordered action sequence for one cycle
  const isMorningCollect = cycleAt18;
  const actions = [];
  actions.push({ key: 'evening', type: 'clear', label: overnightAt18 ? 'Clear → 18°C' : 'Clear', scheduled: schedule.eveningClear });
  actions.push({ key: 'morning', type: isMorningCollect ? 'collect' : 'clear_discard',
    label: isMorningCollect ? 'Morning collect' : 'Morning clear + discard', scheduled: schedule.morningCollect });
  if (collectionsPerDay === 3 && schedule.middayCollect)
    actions.push({ key: 'midday', type: 'collect', label: 'Midday collect', scheduled: schedule.middayCollect });
  actions.push({ key: 'afternoon', type: 'collect_clear', label: 'Afternoon collect + clear', scheduled: schedule.afternoonCollect });

  // Only count actions from the current window (since last clear)
  const doneKeys = new Set();
  const clearMs = lastClearTime ? new Date(lastClearTime).getTime() : 0;
  const nowMs = now.getTime();

  // Compute deadline from last clear
  const deadline = lastClearTime ? clearMs + windowMs : null;
  const cycleExpired = deadline && nowMs > deadline + 30 * 60000;

  // The clear that set lastClearTime IS the evening clear - auto-mark it done
  if (lastClearTime) doneKeys.add('evening');
  (todayActions || []).forEach(a => {
    if (!a.key) return;
    const actionMs = a.time ? new Date(a.time).getTime() : 0;
    if (actionMs >= clearMs && !cycleExpired) doneKeys.add(a.key);
  });

  // Fixed schedule times - no dynamic shift. Deadline moves with actual clear time.
  const result = [];
  for (const act of actions) {
    if (doneKeys.has(act.key)) continue;

    const schedMins = parseHHMM(act.scheduled);
    if (schedMins === null) continue;

    // Place at the next occurrence of scheduled time after the clear
    const clearDate = lastClearTime ? new Date(lastClearTime) : new Date(now);
    const baseDay = new Date(clearDate); baseDay.setHours(0, 0, 0, 0);
    let suggestedMs = baseDay.getTime() + schedMins * 60000;

    // Day boundary: if scheduled time is before the clear, it's tomorrow
    if (suggestedMs <= clearMs) suggestedMs += 86400000;

    const isOverdue = nowMs > suggestedMs + 30 * 60000;
    const graceMs = 30 * 60000;
    const isInGracePeriod = deadline ? nowMs > deadline && nowMs <= deadline + graceMs : false;
    const isPastDeadline = deadline ? nowMs > deadline + graceMs : false;

    result.push({
      ...act, suggestedTime: new Date(suggestedMs).toISOString(), suggestedMs,
      isOverdue, isInGracePeriod, isPastDeadline,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      deadlineMs: deadline, timeUntilMs: suggestedMs - nowMs,
    });
  }

  // Sort by chronological time
  result.sort((a, b) => a.suggestedMs - b.suggestedMs);

  // Auto-advance: if the first action is >2h overdue and there's a later action, skip it
  while (result.length > 1 && result[0].timeUntilMs < -2 * 3600000) {
    result[0].skipped = true;
    result.shift();
  }

  return result;
}

// Status color: green/yellow/red
export function getVcsStatus(vcs, now) {
  if (!vcs?.enabled) return 'none';
  now = now || new Date();
  const actions = computeNextActions(vcs, now);
  if (!actions.length) return 'green';
  const next = actions[0];
  if (next.isPastDeadline) return 'red';
  if (next.isInGracePeriod) return 'red';
  if (next.isOverdue) return 'yellow';
  if (next.timeUntilMs < 30 * 60000) return 'yellow';
  return 'green';
}

// Progress through virgin window (0-1)
export function vcsWindowProgress(vcs, now) {
  if (!vcs?.lastClearTime) return 0;
  now = now || new Date();
  const clearMs = new Date(vcs.lastClearTime).getTime();
  const nowMs = now.getTime();
  // Progress tracks toward next scheduled action, not the expiry deadline
  const actions = computeNextActions(vcs, now);
  if (actions.length > 0) {
    const nextMs = actions[0].suggestedMs;
    if (nextMs > clearMs) return Math.max(0, Math.min(1, (nowMs - clearMs) / (nextMs - clearMs)));
  }
  // Fallback: track toward 8h expiry if no actions left
  const windowMs = getVirginWindowH() * 3600000;
  return Math.max(0, Math.min(1, (nowMs - clearMs) / windowMs));
}
