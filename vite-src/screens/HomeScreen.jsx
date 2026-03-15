import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, Btn, Inp, Confirm, CircleProgress, Field } from '../components/ui';
import { STATUSES, STATUS_SHORT, VCS_DEFAULTS, USERS } from '../utils/constants.js';
import { today, fmt, fmtFull, dFromNow, normDate } from '../utils/dates.js';
import { fmtTime, fmtDur } from '../utils/dates.js';
import { uid, sn, sg, cl, clFull, tempLabel, tempFull, nextSt, stIdx, stockTags, crossDetect, getFlipDays, getTL, calcTL, getScreeningGuide, isTouchDevice, dlICS } from '../utils/helpers.js';
import { markEdited, markDeleted, supabaseDeleteNow } from '../utils/supabase.js';
import { computeNextActions, getVcsStatus, vcsWindowProgress, makeVcs, vcsKey, computeDeadline } from '../utils/vcs.js';
import CrossCard from '../components/CrossCard.jsx';
import StockModal from '../components/StockModal.jsx';

function HomeScreen({ stocks, setStocks, crosses, setCrosses, toast, onNewCross, virginBank, setVirginBank, virginsPerCross, currentUser, transfers, onAcceptTransfer, onDeclineTransfer, onTransfer, STOCK_CATS, sentTransfers, onDismissTransfer, printListCrosses, setPrintListCrosses, printListVirgins, setPrintListVirgins, initialCrossId, expBank, setExpBank }) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [flipCat, setFlipCat] = useState(null);
  const [flipDate, setFlipDate] = useState(today());
  const [homeEditStock, setHomeEditStock] = useState(null);
  const [vcsBankPrompt, setVcsBankPrompt] = useState(null); // { stockId, stockName }
  const [vcs18Confirm, setVcs18Confirm] = useState(null); // { stockId, key, type, withCollect }
  const [crossVcs18Confirm, setCrossVcs18Confirm] = useState(null); // { crossId, key, type }
  const [crossVcsBankPrompt, setCrossVcsBankPrompt] = useState(null); // { crossId, crossName }
  const [selectedCrossId, setSelectedCrossId] = useState(initialCrossId || null);
  const activeRef = useRef(null);
  const healthRef = useRef(null);

  const myCrosses = useMemo(() => crosses.filter(c => !c.owner || c.owner === currentUser), [crosses, currentUser]);
  const activeCrosses = useMemo(() => {
    const urgent = ['collecting virgins', 'collecting progeny', 'ripening'];
    return myCrosses.filter(c => c.status !== 'done').sort((a, b) => urgent.includes(b.status) - urgent.includes(a.status));
  }, [myCrosses]);
  const completedCrosses = useMemo(() => myCrosses.filter(c => c.status === 'done'), [myCrosses]);

  // Auto-promote waiting states
  useEffect(() => {
    const promotions = [
      { from: 'waiting for virgins', to: 'collecting virgins', field: 'setupDate', days: 9 },
      { from: 'waiting for progeny', to: 'collecting progeny', field: 'waitStartDate', days: 9 },
    ];
    let changed = false;
    const updated = crosses.map(c => {
      for (const p of promotions) {
        if (c.status === p.from && c[p.field] && -dFromNow(c[p.field]) >= p.days) {
          changed = true;
          markEdited(c.id);
          toast.add(`${cl(c, stocks)} → ${p.to}`);
          const extra = p.to === 'collecting virgins' ? { vcs: makeVcs(c.overnightAt18 !== false, 2, VCS_DEFAULTS[vcsKey(c.overnightAt18 !== false, 2)]) } : {};
          return { ...c, status: p.to, ...extra };
        }
      }
      return c;
    });
    if (changed) setCrosses(updated);
  }, [crosses, stocks]);

  // Backfill: auto-assign VCS to collecting-virgins crosses that lack it
  useEffect(() => {
    const need = crosses.filter(c => c.status === 'collecting virgins' && !c.vcs);
    if (!need.length) return;
    setCrosses(p => p.map(c => {
      if (c.status === 'collecting virgins' && !c.vcs) {
        const o18 = c.overnightAt18 !== false;
        return { ...c, vcs: makeVcs(o18, 2, VCS_DEFAULTS[vcsKey(o18, 2)]) };
      }
      return c;
    }));
  }, [crosses]);

  // Active tasks: only crosses that need action RIGHT NOW
  const activeTasks = useMemo(() => {
    const now = new Date();
    return activeCrosses.filter(c => {
      if (c.status === 'collecting virgins') {
        // With VCS: only show if next action is within 20min or overdue
        if (c.vcs?.enabled) {
          const actions = computeNextActions(c.vcs, now);
          const next = actions[0];
          if (!next) return false;
          return next.timeUntilMs <= 20 * 60000 || next.isPastDeadline;
        }
        return true; // no VCS: always show
      }
      if (c.status === 'collecting progeny') return true;
      if (c.status === 'ripening') {
        if (!c.ripeningStartDate) return false;
        const cd = crossDetect(c, stocks);
        const rDays = -dFromNow(c.ripeningStartDate);
        return rDays >= (cd.o ? 3 : 5);
      }
      if (c.status === 'waiting for virgins') return -dFromNow(c.setupDate) >= 9;
      if (c.status === 'waiting for progeny') return c.waitStartDate && -dFromNow(c.waitStartDate) >= 9;
      return false;
    });
  }, [activeCrosses, stocks]);

  const actionSummary = useMemo(() => {
    let overdue = 0;
    let dueToday = 0;

    activeCrosses.forEach(c => {
      const tl = getTL(c);
      const cd = crossDetect(c, stocks);
      if (c.status === 'set up') {
        const d = dFromNow(tl.virginStart);
        if (d < 0) overdue++;
        else if (d === 0) dueToday++;
      }
      if (c.status === 'waiting for progeny' && c.waitStartDate && -dFromNow(c.waitStartDate) >= 9) overdue++;
      // retinal starts automatically when entering ripening
    });

    stocks.forEach(s => {
      if (s.maintainer && s.maintainer !== currentUser) return;
      if (stockTags(s).includes('Dead')) return;
      const ld = s.lastFlipped || s.createdAt;
      if (!ld) return;
      const age = -dFromNow(ld);
      const threshold = getFlipDays(s);
      if (age >= threshold) overdue++;
    });

    return { overdue, dueToday };
  }, [activeCrosses, stocks]);

  const stocksNeedFlip = useMemo(() => {
    return stocks.filter(s => {
      if (s.maintainer && s.maintainer !== currentUser) return false;
      if (stockTags(s).includes('Dead')) return false;
      const ld = s.lastFlipped || s.createdAt;
      if (!ld) return false;
      const age = -dFromNow(ld);
      const threshold = getFlipDays(s);
      return age >= threshold;
    });
  }, [stocks, currentUser]);

  function flipStock(id) {
    markEdited(id);
    setStocks(p => p.map(s => s.id === id ? { ...s, lastFlipped: today() } : s));
    toast.add('Flipped');
  }

  function scrollToActive() {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="pb-8">
      {/* Transfer notifications */}
      {transfers && transfers.length > 0 && (
        <div className="mb-6 space-y-2">
          {transfers.map(t => (
            <div key={t.id} className="card p-4" style={{ borderColor: 'rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.06)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                    {t.from} wants to transfer {t.type === 'collection' ? `"${t.collection}" collection` : t.name || t.type}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                    {t.type === 'stock' ? 'Stock maintainership' : t.type === 'cross' ? 'Cross ownership' : 'Entire collection'}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Btn onClick={() => onAcceptTransfer(t)} style={{ fontSize: '12px', padding: '6px 12px' }}>Accept</Btn>
                  <Btn v="s" onClick={() => onDeclineTransfer(t)} style={{ fontSize: '12px', padding: '6px 12px' }}>Decline</Btn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sent transfer results */}
      {sentTransfers && sentTransfers.length > 0 && (
        <div className="mb-6 space-y-2">
          {sentTransfers.map(t => (
            <div key={t.id} className="card p-4" style={{ borderColor: t.status === 'accepted' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)', background: t.status === 'accepted' ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                    {t.to} {t.status} your transfer of {t.type === 'collection' ? `"${t.collection}" collection` : t.name || t.type}
                  </p>
                </div>
                <button onClick={() => onDismissTransfer(t)}
                  className="text-xs px-3 py-1.5 rounded-lg transition-all active:scale-95 shrink-0"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>OK</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action banner */}
      <div className="mb-6">
        {actionSummary.overdue > 0 ? (
          <div className="banner banner-red" onClick={scrollToActive}>
            {actionSummary.overdue} thing{actionSummary.overdue > 1 ? 's' : ''} overdue
          </div>
        ) : actionSummary.dueToday > 0 ? (
          <div className="banner banner-amber" onClick={scrollToActive}>
            {actionSummary.dueToday} thing{actionSummary.dueToday > 1 ? 's' : ''} due today
          </div>
        ) : null}
      </div>

      {/* Active Tasks - immediately after overdue banner */}
      {activeTasks.length > 0 && (
        <div className="mb-6">
          <p className="section-header">Active Tasks</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeTasks.map(c => {
              const isCollVgn = c.status === 'collecting virgins';
              const isCollProg = c.status === 'collecting progeny';
              const isRipening = c.status === 'ripening';
              const isVirgin = c.status === 'waiting for virgins';
              const cd = crossDetect(c, stocks);
              let waited, ripeRemaining;
              if (isRipening && c.ripeningStartDate) {
                const rDays = -dFromNow(c.ripeningStartDate);
                const rTarget = cd.o ? 3 : 5;
                ripeRemaining = Math.max(0, rTarget - rDays);
              }
              waited = (isCollVgn || isCollProg || isRipening) ? 0 : -dFromNow(isVirgin ? c.setupDate : c.waitStartDate);
              const target = 9;
              const remaining = (isCollVgn || isCollProg || isRipening) ? 0 : target - waited;
              const ready = isCollVgn || isCollProg || (isRipening && (ripeRemaining === undefined || ripeRemaining <= 0)) || remaining <= 0;
              const ripeWaiting = isRipening && ripeRemaining > 0;
              const tintR = ready ? 'rgba(239,68,68,' : 'rgba(245,158,11,';
              const tintC = ready ? '#fca5a5' : '#fcd34d';
              return (
                <div key={c.id} className="card p-4 cursor-pointer" style={{ borderColor: tintR + '0.15)', background: tintR + '0.06)' }}
                  onClick={() => { setSelectedCrossId(null); setTimeout(() => setSelectedCrossId(c.id), 0); activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{
                      background: tintR + '0.1)',
                      border: '1px solid ' + tintR + '0.15)',
                    }}>
                      <span className="text-xs" style={{ color: tintC }}>{ripeWaiting ? ripeRemaining + 'd' : ready ? '!' : remaining + 'd'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--text-1)' }}>{cl(c, stocks)}</p>
                      <p className="text-xs" style={{ color: tintC }}>
                        {isRipening ? (ripeRemaining <= 0 ? 'Ripening complete - ready!' : `${ripeRemaining}d ${cd.o ? 'retinal uptake' : 'GCaMP expression'} remaining`)
                          : isCollProg ? 'Collect progeny now!'
                          : isCollVgn ? 'Collect virgins for this cross'
                          : ready
                            ? (isVirgin ? 'Virgins eclosing - collect now!' : 'Progeny ready - collect now!')
                            : (isVirgin ? `${remaining}d until virgins eclose` : `${remaining}d until progeny ready`)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VCS Dashboard + Virgin-phase crosses */}
      {(() => {
        const vcsStocks = stocks.filter(s => s.vcs?.enabled && s.maintainer === currentUser && !stockTags(s).includes('Dead'));
        const virginCrosses = myCrosses.filter(c => c.status === 'collecting virgins' || c.status === 'waiting for virgins');
        if (!vcsStocks.length && !virginCrosses.length) return null;
        const now = new Date();
        // Sort by urgency: red first, then yellow, then green, then by next action time
        const sorted = [...vcsStocks].sort((a, b) => {
          const sa = getVcsStatus(a.vcs, now), sb = getVcsStatus(b.vcs, now);
          const order = { red: 0, yellow: 1, green: 2 };
          if (order[sa] !== order[sb]) return order[sa] - order[sb];
          const na = computeNextActions(a.vcs, now), nb = computeNextActions(b.vcs, now);
          return (na[0]?.suggestedMs || Infinity) - (nb[0]?.suggestedMs || Infinity);
        });
        return (
          <div className="mb-6">
            <p className="section-header">Virgin Collections</p>

            {/* Waiting-for-virgins crosses (simple cards) */}
            {(() => {
              const waitingCrosses = virginCrosses.filter(c => c.status === 'waiting for virgins');
              if (!waitingCrosses.length) return null;
              return (
                <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-3`}>
                  {waitingCrosses.map(c => {
                    const waited = -dFromNow(c.setupDate);
                    const remaining = 9 - waited;
                    const ready = remaining <= 0;
                    const dotColor = ready ? '#f9a8d4' : 'var(--text-3)';
                    const borderColor = ready ? 'rgba(249,168,212,0.3)' : 'rgba(148,163,184,0.15)';
                    return (
                      <div key={c.id} className="card p-3 cursor-pointer" style={{ border: `1px solid ${borderColor}` }}
                        onClick={() => { setSelectedCrossId(null); setTimeout(() => setSelectedCrossId(c.id), 0); activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                            <p className="text-xs font-bold truncate" style={{ color: 'var(--text-1)' }}>{cl(c, stocks)}</p>
                          </div>
                          <span className="text-[9px] shrink-0 ml-2" style={{ color: 'var(--text-3)' }}>
                            {c.overnightAt18 !== undefined ? (c.overnightAt18 ? '18°C' : 'RT') + ' · ' : ''}{remaining}d
                          </span>
                        </div>
                        <p className="text-[11px] mb-1.5" style={{ color: ready ? '#f9a8d4' : 'var(--text-3)' }}>
                          {ready ? 'Virgins eclosing - collect!' : `Waiting - ${remaining}d until virgins`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Collecting-virgins crosses - full VCS-style cards */}
            {(() => {
              const collectingCrosses = virginCrosses.filter(c => c.status === 'collecting virgins' && c.vcs?.enabled);
              if (!collectingCrosses.length) return null;
              // Sort by urgency like VCS stocks
              const sortedCrosses = [...collectingCrosses].sort((a, b) => {
                const sa = getVcsStatus(a.vcs, now), sb = getVcsStatus(b.vcs, now);
                const order = { red: 0, yellow: 1, green: 2 };
                if (order[sa] !== order[sb]) return order[sa] - order[sb];
                const na = computeNextActions(a.vcs, now), nb = computeNextActions(b.vcs, now);
                return (na[0]?.suggestedMs || Infinity) - (nb[0]?.suggestedMs || Infinity);
              });

              function logCrossAction(crossId, type, key, temp) {
                const c = crosses.find(x => x.id === crossId);
                if (!c?.vcs) return;
                const v = c.vcs;
                const actions = computeNextActions(v, now);
                const next = actions[0];
                const action = { type, key, time: new Date().toISOString(), scheduled: next?.scheduled || '' };
                const newActions = [...(v.todayActions || []), action];
                let newVcs = { ...v, todayActions: newActions };
                if (type === 'clear' || type === 'clear_discard') {
                  newVcs.lastClearTime = action.time;
                  newVcs.lastClearTemp = temp || (v.overnightAt18 ? '18' : '25');
                  newVcs.virginDeadline = computeDeadline(action.time, newVcs.lastClearTemp === '18');
                  newVcs.todayActions = [action];
                }
                markEdited(crossId);
                setCrosses(p => p.map(x => x.id === crossId ? { ...x, vcs: newVcs } : x));
                const cName = cl(c, stocks);
                const msgs = { collect: 'Collected', clear: v.overnightAt18 ? 'Cleared → 18°C' : 'Cleared', clear_discard: 'Cleared & discarded' };
                toast.add(`${cName}: ${msgs[type] || 'Done'}`);
              }

              return (
                <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 ${vcsStocks.length ? 'mb-3' : ''}`}>
                  {sortedCrosses.map(c => {
                    const v = c.vcs;
                    const status = getVcsStatus(v, now);
                    const actions = computeNextActions(v, now);
                    const next = actions[0];
                    const progress = vcsWindowProgress(v, now);
                    const cycleAt18 = v.lastClearTemp ? v.lastClearTemp === '18' : v.overnightAt18;
                    const deadline = v.lastClearTime ? computeDeadline(v.lastClearTime, cycleAt18) : null;
                    const vCollected = c.virginsCollected || 0;
                    const vTarget = virginsPerCross || 5;

                    const borderColor = status === 'red' ? 'rgba(239,68,68,0.3)' : status === 'yellow' ? 'rgba(234,179,8,0.3)' : 'rgba(94,234,212,0.2)';
                    const dotColor = status === 'red' ? '#ef4444' : status === 'yellow' ? '#eab308' : '#5eead4';
                    const isInGracePeriod = next?.isInGracePeriod || (deadline && now > new Date(deadline) && now <= new Date(new Date(deadline).getTime() + 30 * 60000));
                    const isPastDeadline = next?.isPastDeadline || (deadline && now > new Date(new Date(deadline).getTime() + 30 * 60000));

                    return (
                      <div key={c.id} className="card p-3 cursor-pointer" style={{ border: `1px solid ${borderColor}` }}
                        onClick={() => { setSelectedCrossId(null); setTimeout(() => setSelectedCrossId(c.id), 0); activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                            <p className="text-xs font-bold truncate" style={{ color: 'var(--text-1)' }}>{cl(c, stocks)}</p>
                          </div>
                          <span className="text-[9px] shrink-0 ml-2" style={{ color: 'var(--text-3)' }}>
                            {v.overnightAt18 ? '18°C' : '25°C'} · {v.collectionsPerDay}x · {vCollected}/{vTarget}
                          </span>
                        </div>

                        {/* Progress bar */}
                        {v.lastClearTime && (
                          <div className="mb-1.5">
                            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                              <div className="h-full rounded-full transition-all" style={{
                                width: `${Math.min(100, progress * 100)}%`,
                                background: progress > 0.9 ? '#ef4444' : progress > 0.7 ? '#eab308' : '#5eead4'
                              }} />
                            </div>
                            <div className="flex justify-between mt-0.5">
                              <span className="text-[9px]" style={{ color: 'var(--text-3)' }}>Cleared {fmtTime(v.lastClearTime)}</span>
                              <span className="text-[9px]" style={{ color: progress > 0.9 ? '#ef4444' : 'var(--text-3)' }}>{next ? 'Next ' + fmtTime(next.suggestedTime) : (deadline ? 'Expires ' + fmtTime(deadline) : '--')}</span>
                            </div>
                          </div>
                        )}

                        {/* Status message */}
                        {isPastDeadline ? (
                          <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#ef4444' }}>Expired - clear & discard</p>
                        ) : isInGracePeriod ? (
                          <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#eab308' }}>LATE - collect now or discard</p>
                        ) : next && next.timeUntilMs > 2 * 3600000 ? (
                          <p className="text-[11px] mb-1.5" style={{ color: '#5eead4' }}>Done for now - next: {fmtTime(next.suggestedTime)}</p>
                        ) : next ? (
                          <p className="text-[11px] mb-1.5" style={{ color: next.isOverdue ? '#ef4444' : next.timeUntilMs < 30 * 60000 ? '#eab308' : 'var(--text-2)' }}>
                            {next.isOverdue ? 'OVERDUE: ' : ''}{next.label} - {fmtTime(next.suggestedTime)} ({next.timeUntilMs > 0 ? 'in ' + fmtDur(next.timeUntilMs) : fmtDur(Math.abs(next.timeUntilMs)) + ' ago'})
                          </p>
                        ) : (
                          <p className="text-[11px] mb-1.5" style={{ color: '#5eead4' }}>All done for this window</p>
                        )}

                        {/* Action buttons - only show when next action is within 20min or overdue */}
                        {(isPastDeadline || isInGracePeriod || (next && next.timeUntilMs <= 20 * 60000)) && <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                          {isPastDeadline ? (
                            <button onClick={() => { if (v.overnightAt18) setCrossVcs18Confirm({ crossId: c.id, key: next?.key || 'evening', type: 'clear_discard' }); else logCrossAction(c.id, 'clear_discard', next?.key || 'evening'); }}
                              className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                              style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>Clear & Discard</button>
                          ) : isInGracePeriod ? (
                            <>
                              <button onClick={() => { logCrossAction(c.id, 'collect', next?.key || 'afternoon'); setCrossVcsBankPrompt({ crossId: c.id, crossName: cl(c, stocks) }); }}
                                className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                                style={{ background: 'rgba(234,179,8,0.12)', color: '#fbbf24', border: '1px solid rgba(234,179,8,0.2)' }}>Collect (late)</button>
                              <button onClick={() => { if (v.overnightAt18) setCrossVcs18Confirm({ crossId: c.id, key: next?.key || 'evening', type: 'clear_discard' }); else logCrossAction(c.id, 'clear_discard', next?.key || 'evening'); }}
                                className="px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                                style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>Discard</button>
                            </>
                          ) : next?.type === 'collect' || next?.type === 'collect_clear' ? (
                            <>
                              <button onClick={() => {
                                if (next.type === 'collect_clear' && v.overnightAt18) {
                                  setCrossVcsBankPrompt({ crossId: c.id, crossName: cl(c, stocks) });
                                  setCrossVcs18Confirm({ crossId: c.id, key: next.key, type: 'clear', withCollect: true });
                                } else {
                                  logCrossAction(c.id, next.type === 'collect_clear' ? 'clear' : 'collect', next.key);
                                  setCrossVcsBankPrompt({ crossId: c.id, crossName: cl(c, stocks) });
                                }
                              }}
                                className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                                style={{ background: 'rgba(94,234,212,0.12)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.2)' }}>
                                {next.type === 'collect_clear' ? 'Collect + Clear' : 'Collected'}
                              </button>
                              <button onClick={() => { if (v.overnightAt18) setCrossVcs18Confirm({ crossId: c.id, key: next.key, type: 'clear' }); else logCrossAction(c.id, 'clear', next.key); }}
                                className="px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                                style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>Clear</button>
                            </>
                          ) : next?.type === 'clear_discard' ? (
                            <button onClick={() => { if (v.overnightAt18) setCrossVcs18Confirm({ crossId: c.id, key: next.key, type: 'clear_discard' }); else logCrossAction(c.id, 'clear_discard', next.key); }}
                              className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                              style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>Clear + Discard</button>
                          ) : next?.type === 'clear' ? (
                            <button onClick={() => { if (v.overnightAt18) setCrossVcs18Confirm({ crossId: c.id, key: next.key, type: 'clear' }); else logCrossAction(c.id, 'clear', next.key); }}
                              className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                              style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                              Mark Cleared</button>
                          ) : null}
                        </div>}

                        {/* 18°C confirmation */}
                        {crossVcs18Confirm?.crossId === c.id && (
                          <div className="mt-2 p-2 rounded-lg" onClick={e => e.stopPropagation()} style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
                            <p className="text-[9px] font-semibold mb-1.5" style={{ color: '#a78bfa' }}>Moved to 18°C?</p>
                            <div className="flex gap-1.5">
                              <button onClick={() => { logCrossAction(c.id, crossVcs18Confirm.type, crossVcs18Confirm.key, '18'); setCrossVcs18Confirm(null); }}
                                className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                                style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.15)' }}>Yes, 18°C</button>
                              <button onClick={() => { logCrossAction(c.id, crossVcs18Confirm.type, crossVcs18Confirm.key, '25'); setCrossVcs18Confirm(null); }}
                                className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                                style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>No, RT</button>
                            </div>
                          </div>
                        )}

                        {/* Inline virgin log prompt - logs to cross.virginsCollected */}
                        {crossVcsBankPrompt?.crossId === c.id && (
                          <div className="mt-2 p-2 rounded-lg" onClick={e => e.stopPropagation()} style={{ background: 'rgba(94,234,212,0.06)', border: '1px solid rgba(94,234,212,0.15)' }}>
                            <p className="text-[9px] font-semibold mb-1.5" style={{ color: '#5eead4' }}>Log virgins collected?</p>
                            <div className="flex gap-1.5">
                              {[1, 3, 5].map(n => (
                                <button key={n} onClick={() => {
                                  const newCount = (c.virginsCollected || 0) + n;
                                  markEdited(c.id);
                                  if (newCount >= (virginsPerCross || 5)) {
                                    setCrosses(p => p.map(x => x.id === c.id ? { ...x, virginsCollected: newCount, status: 'waiting for progeny', waitStartDate: today(), vcs: null } : x));
                                    toast.add(`${virginsPerCross || 5} virgins collected → waiting for progeny`);
                                  } else {
                                    setCrosses(p => p.map(x => x.id === c.id ? { ...x, virginsCollected: newCount } : x));
                                    toast.add(`+${n} virgin${n > 1 ? 's' : ''} (${newCount}/${virginsPerCross || 5})`);
                                  }
                                  setCrossVcsBankPrompt(null);
                                }}
                                  className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                                  style={{ background: 'rgba(94,234,212,0.1)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.15)' }}>+{n}</button>
                              ))}
                              <button onClick={() => setCrossVcsBankPrompt(null)}
                                className="px-3 py-2 text-[12px] rounded-lg cursor-pointer"
                                style={{ color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>Skip</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {vcsStocks.length > 0 && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sorted.map(s => {
                const v = s.vcs;
                const status = getVcsStatus(v, now);
                const actions = computeNextActions(v, now);
                const next = actions[0];
                const progress = vcsWindowProgress(v, now);
                const cycleAt18 = v.lastClearTemp ? v.lastClearTemp === '18' : v.overnightAt18;
                const deadline = v.lastClearTime ? computeDeadline(v.lastClearTime, cycleAt18) : null;
                const doneCount = (v.todayActions || []).filter(a => a.type === 'collect').length;
                const totalCollects = v.collectionsPerDay;

                const borderColor = status === 'red' ? 'rgba(239,68,68,0.3)' : status === 'yellow' ? 'rgba(234,179,8,0.3)' : 'rgba(94,234,212,0.2)';
                const dotColor = status === 'red' ? '#ef4444' : status === 'yellow' ? '#eab308' : '#5eead4';

                function logAction(type, key, temp) {
                  const action = { type, key, time: new Date().toISOString(), scheduled: next?.scheduled || '' };
                  const newActions = [...(v.todayActions || []), action];
                  let newVcs = { ...v, todayActions: newActions };
                  if (type === 'clear' || type === 'clear_discard') {
                    newVcs.lastClearTime = action.time;
                    newVcs.lastClearTemp = temp || (v.overnightAt18 ? '18' : '25');
                    newVcs.virginDeadline = computeDeadline(action.time, newVcs.lastClearTemp === '18');
                    newVcs.todayActions = [action]; // Reset for new window
                  }
                  markEdited(s.id);
                  setStocks(p => p.map(st => st.id === s.id ? { ...st, vcs: newVcs } : st));
                  const msgs = { collect: 'Collected', clear: v.overnightAt18 ? 'Cleared → 18°C' : 'Cleared', clear_discard: 'Cleared & discarded' };
                  toast.add(`${s.name}: ${msgs[type] || 'Done'}`);
                }

                const isInGracePeriod = next?.isInGracePeriod || (deadline && now > new Date(deadline) && now <= new Date(new Date(deadline).getTime() + 30 * 60000));
                const isPastDeadline = next?.isPastDeadline || (deadline && now > new Date(new Date(deadline).getTime() + 30 * 60000));

                return (
                  <div key={s.id} className="card p-3 cursor-pointer" style={{ border: `1px solid ${borderColor}` }} onClick={() => setHomeEditStock({ ...s })}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                        <p className="text-xs font-bold truncate" style={{ color: 'var(--text-1)' }}>{s.name}</p>
                      </div>
                      <span className="text-[9px] shrink-0 ml-2" style={{ color: 'var(--text-3)' }}>{v.overnightAt18 ? '18°C' : '25°C'} · {v.collectionsPerDay}× · {doneCount}/{totalCollects}</span>
                      <button onClick={(e) => { e.stopPropagation(); setPrintListVirgins(p => p.includes(s.id) ? p.filter(x => x !== s.id) : [...p, s.id]); toast.add(printListVirgins.includes(s.id) ? 'Removed virgin label' : 'Added virgin label'); }}
                        className="p-1 rounded-md transition-all active:scale-90 cursor-pointer shrink-0 ml-1" title="Print virgin label"
                        style={{ color: printListVirgins.includes(s.id) ? '#5eead4' : 'var(--text-3)', background: 'transparent' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      </button>
                    </div>

                    {/* Progress bar */}
                    {v.lastClearTime && (
                      <div className="mb-1.5">
                        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                          <div className="h-full rounded-full transition-all" style={{
                            width: `${Math.min(100, progress * 100)}%`,
                            background: progress > 0.9 ? '#ef4444' : progress > 0.7 ? '#eab308' : '#5eead4'
                          }} />
                        </div>
                        <div className="flex justify-between mt-0.5">
                          <span className="text-[9px]" style={{ color: 'var(--text-3)' }}>Cleared {fmtTime(v.lastClearTime)}</span>
                          <span className="text-[9px]" style={{ color: progress > 0.9 ? '#ef4444' : 'var(--text-3)' }}>{next ? 'Next ' + fmtTime(next.suggestedTime) : (deadline ? 'Expires ' + fmtTime(deadline) : '--')}</span>
                        </div>
                      </div>
                    )}

                    {/* Status message */}
                    {isPastDeadline ? (
                      <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#ef4444' }}>Expired - clear & discard</p>
                    ) : isInGracePeriod ? (
                      <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#eab308' }}>LATE - collect now or discard</p>
                    ) : next && next.timeUntilMs > 2 * 3600000 ? (
                      <p className="text-[11px] mb-1.5" style={{ color: '#5eead4' }}>Done for now - next: {fmtTime(next.suggestedTime)}</p>
                    ) : next ? (
                      <p className="text-[11px] mb-1.5" style={{ color: next.isOverdue ? '#ef4444' : next.timeUntilMs < 30 * 60000 ? '#eab308' : 'var(--text-2)' }}>
                        {next.isOverdue ? 'OVERDUE: ' : ''}{next.label} - {fmtTime(next.suggestedTime)} ({next.timeUntilMs > 0 ? 'in ' + fmtDur(next.timeUntilMs) : fmtDur(Math.abs(next.timeUntilMs)) + ' ago'})
                      </p>
                    ) : (
                      <p className="text-[11px] mb-1.5" style={{ color: '#5eead4' }}>All done for this window</p>
                    )}

                    {/* Action buttons - only show when next action is within 20min or overdue */}
                    {(isPastDeadline || isInGracePeriod || (next && next.timeUntilMs <= 20 * 60000)) && <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                      {isPastDeadline ? (
                        <button onClick={() => { if (v.overnightAt18) setVcs18Confirm({ stockId: s.id, key: next?.key || 'evening', type: 'clear_discard' }); else logAction('clear_discard', next?.key || 'evening'); }}
                          className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                          style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>Clear & Discard</button>
                      ) : isInGracePeriod ? (
                        <>
                          <button onClick={() => { logAction('collect', next?.key || 'afternoon'); setVcsBankPrompt({ stockId: s.id, stockName: s.name }); }}
                            className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                            style={{ background: 'rgba(234,179,8,0.12)', color: '#fbbf24', border: '1px solid rgba(234,179,8,0.2)' }}>Collect (late)</button>
                          <button onClick={() => { if (v.overnightAt18) setVcs18Confirm({ stockId: s.id, key: next?.key || 'evening', type: 'clear_discard' }); else logAction('clear_discard', next?.key || 'evening'); }}
                            className="px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                            style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>Discard</button>
                        </>
                      ) : next?.type === 'collect' || next?.type === 'collect_clear' ? (
                        <>
                          <button onClick={() => {
                            if (next.type === 'collect_clear' && v.overnightAt18) {
                              setVcsBankPrompt({ stockId: s.id, stockName: s.name });
                              setVcs18Confirm({ stockId: s.id, key: next.key, type: 'clear', withCollect: true });
                            } else {
                              logAction(next.type === 'collect_clear' ? 'clear' : 'collect', next.key);
                              setVcsBankPrompt({ stockId: s.id, stockName: s.name });
                            }
                          }}
                            className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                            style={{ background: 'rgba(94,234,212,0.12)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.2)' }}>
                            {next.type === 'collect_clear' ? 'Collect + Clear' : 'Collected ✓'}
                          </button>
                          <button onClick={() => { if (v.overnightAt18) setVcs18Confirm({ stockId: s.id, key: next.key, type: 'clear' }); else logAction('clear', next.key); }}
                            className="px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                            style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>Clear</button>
                        </>
                      ) : next?.type === 'clear_discard' ? (
                        <button onClick={() => { if (v.overnightAt18) setVcs18Confirm({ stockId: s.id, key: next.key, type: 'clear_discard' }); else logAction('clear_discard', next.key); }}
                          className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                          style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>Clear + Discard</button>
                      ) : next?.type === 'clear' ? (
                        <button onClick={() => { if (v.overnightAt18) setVcs18Confirm({ stockId: s.id, key: next.key, type: 'clear' }); else logAction('clear', next.key); }}
                          className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                          style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                          Mark Cleared</button>
                      ) : null}
                    </div>}

                    {/* 18°C confirmation */}
                    {vcs18Confirm?.stockId === s.id && (
                      <div className="mt-2 p-2 rounded-lg" onClick={e => e.stopPropagation()} style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
                        <p className="text-[9px] font-semibold mb-1.5" style={{ color: '#a78bfa' }}>Moved to 18°C?</p>
                        <div className="flex gap-1.5">
                          <button onClick={() => { logAction(vcs18Confirm.type, vcs18Confirm.key, '18'); setVcs18Confirm(null); }}
                            className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                            style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.15)' }}>Yes, 18°C</button>
                          <button onClick={() => { logAction(vcs18Confirm.type, vcs18Confirm.key, '25'); setVcs18Confirm(null); }}
                            className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                            style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>No, RT</button>
                        </div>
                      </div>
                    )}

                    {/* Inline virgin bank prompt */}
                    {vcsBankPrompt?.stockId === s.id && (
                      <div className="mt-2 p-2 rounded-lg" onClick={e => e.stopPropagation()} style={{ background: 'rgba(94,234,212,0.06)', border: '1px solid rgba(94,234,212,0.15)' }}>
                        <p className="text-[9px] font-semibold mb-1.5" style={{ color: '#5eead4' }}>Log virgins to bank?</p>
                        <div className="flex gap-1.5">
                          {[1, 3, 5].map(n => (
                            <button key={n} onClick={() => {
                              setVirginBank(prev => ({ ...prev, [s.id]: (prev[s.id] || 0) + n }));
                              toast.add(`+${n} virgins banked for ${s.name}`);
                              setVcsBankPrompt(null);
                            }}
                              className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                              style={{ background: 'rgba(94,234,212,0.1)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.15)' }}>+{n}</button>
                          ))}
                          <button onClick={() => setVcsBankPrompt(null)}
                            className="px-3 py-2 text-[12px] rounded-lg cursor-pointer"
                            style={{ color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>Skip</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>}
          </div>
        );
      })()}


      {/* Onboarding */}
      {stocks.length === 0 && crosses.length === 0 && (
        <div className="card p-8 mb-6 text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--accent-glow-2)', border: '1px solid rgba(139,92,246,0.15)' }}>
            <span className="text-3xl">🪰</span>
          </div>
          <p className="text-base font-bold mb-2" style={{ color: 'var(--text-1)' }}>Welcome to Flomington</p>
          <p className="text-sm mb-1" style={{ color: 'var(--text-3)' }}>Add your fly stocks first, then start crossing.</p>
          <p className="text-xs mb-5" style={{ color: 'var(--text-3)' }}>Or load demo data from Settings.</p>
        </div>
      )}

      {/* Active Crosses */}
      {activeCrosses.length > 0 && (
        <div ref={activeRef} className="mb-8">
          <p className="section-header">Active Crosses</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeCrosses.map(c => (
              <CrossCard key={c.id} cross={c} stocks={stocks} setCrosses={setCrosses} toast={toast} virginBank={virginBank} setVirginBank={setVirginBank} virginsPerCross={virginsPerCross} forceOpen={selectedCrossId && (selectedCrossId === c.id || c.id.startsWith(selectedCrossId))} currentUser={currentUser} onTransfer={onTransfer} printListCrosses={printListCrosses} setPrintListCrosses={setPrintListCrosses} expBank={expBank} setExpBank={setExpBank} />
            ))}
          </div>
        </div>
      )}

      {/* Stock Collections - show categories with stocks due for flipping */}
      {(() => {
        // Individual stocks: expanded + "No Collection" (only show if maintainer matches)
        const myStocks = stocks.filter(s => (!s.maintainer || s.maintainer === currentUser) && !stockTags(s).includes('Dead'));
        const dueIndividual = myStocks.filter(s => (s.category || 'No Collection') === 'No Collection').filter(s => {
          const age = s.lastFlipped || s.createdAt ? -dFromNow(s.lastFlipped || s.createdAt) : null;
          return age !== null && age >= getFlipDays(s);
        });
        // Group collections by (cat, copies) - each copy number flips independently
        const dueGroups = [];
        STOCK_CATS.filter(cat => cat !== 'No Collection').forEach(cat => {
          const catStocks = myStocks.filter(s => (s.category || 'No Collection') === cat);
          const copyNums = [...new Set(catStocks.map(s => Number(s.copies) || 1))].sort((a, b) => a - b);
          copyNums.forEach(cn => {
            const group = catStocks.filter(s => (Number(s.copies) || 1) === cn);
            const dueCount = group.filter(s => {
              const age = s.lastFlipped || s.createdAt ? -dFromNow(s.lastFlipped || s.createdAt) : null;
              return age !== null && age >= getFlipDays(s);
            }).length;
            if (dueCount > 0) dueGroups.push({ cat, copies: cn, stocks: group, dueCount, total: group.length });
          });
        });
        if (dueIndividual.length === 0 && dueGroups.length === 0) return null;
        return (
          <div ref={healthRef} className="mb-8">
            <p className="section-header">Stocks Due for Flipping</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {dueIndividual.map(s => (
                <div key={s.id} className="card p-4 cursor-pointer" style={{ borderColor: 'rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.04)' }} onClick={() => setHomeEditStock({ ...s })}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-[15px] font-bold" style={{ color: 'var(--text-1)' }}>{s.name}</p>
                        {((s.copies || 1) > 1 || myStocks.some(x => x.id !== s.id && x.name === s.name && (x.category || 'No Collection') === (s.category || 'No Collection'))) && <span className="badge" style={{ background: 'rgba(59,130,246,0.1)', color: '#93c5fd' }}>#{s.copies || 1}</span>}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: '#fca5a5' }}>{-dFromNow(s.lastFlipped || s.createdAt)}d - needs flip</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); flipStock(s.id); }}
                      className="touch px-4 py-2 text-sm font-semibold rounded-xl transition-all active:scale-95 shrink-0"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)' }}>
                      Flip
                    </button>
                  </div>
                </div>
              ))}
              {dueGroups.map(g => (
                <div key={`${g.cat}-${g.copies}`} className="card p-5 cursor-pointer" style={{ borderColor: 'rgba(239,68,68,0.1)' }} onClick={() => { setFlipCat({ cat: g.cat, copies: g.copies }); setFlipDate(today()); }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[15px] font-bold" style={{ color: 'var(--text-1)' }}>{g.cat}{g.copies > 1 || dueGroups.filter(x => x.cat === g.cat).length > 1 ? ` #${g.copies}` : ''}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{g.total} stock{g.total !== 1 ? 's' : ''}</p>
                    </div>
                    <span className="badge" style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)' }}>
                      {g.dueCount} to flip
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Completed */}
      {completedCrosses.length > 0 && (
        <div className="mb-6">
          <button onClick={() => setShowCompleted(!showCompleted)}
            className="text-xs font-medium touch w-full text-left py-2" style={{ color: 'var(--text-3)' }}>
            {showCompleted ? '▾' : '▸'} {completedCrosses.length} completed
          </button>
          {showCompleted && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-2">
              {completedCrosses.map(c => (
                <CrossCard key={c.id} cross={c} stocks={stocks} setCrosses={setCrosses} toast={toast} virginBank={virginBank} setVirginBank={setVirginBank} virginsPerCross={virginsPerCross} printListCrosses={printListCrosses} setPrintListCrosses={setPrintListCrosses} expBank={expBank} setExpBank={setExpBank} />
              ))}
            </div>
          )}
        </div>
      )}


      {/* Flip date modal for stock collections */}
      <Modal open={!!flipCat} onClose={() => setFlipCat(null)} title={`${typeof flipCat === 'object' ? flipCat?.cat : flipCat} - Flip`}>
        {flipCat && (() => {
          const fc = typeof flipCat === 'object' ? flipCat : { cat: flipCat, copies: null };
          const catStocks = stocks.filter(s => (s.category || 'No Collection') === fc.cat && (fc.copies == null || Number(s.copies || 1) === fc.copies));
          const dueStocks = catStocks.filter(s => {
            if (stockTags(s).includes('Dead')) return false;
            const age = s.lastFlipped || s.createdAt ? -dFromNow(s.lastFlipped || s.createdAt) : null;
            return age !== null && age >= getFlipDays(s);
          }).sort((a, b) => {
            const aa = -(a.lastFlipped || a.createdAt ? dFromNow(a.lastFlipped || a.createdAt) : 0);
            const bb = -(b.lastFlipped || b.createdAt ? dFromNow(b.lastFlipped || b.createdAt) : 0);
            return bb - aa;
          });
          const label = fc.cat + (fc.copies != null && fc.copies > 1 ? ` #${fc.copies}` : '');
          return (
            <div>
              {dueStocks.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: '#fca5a5' }}>{dueStocks.length} stock{dueStocks.length !== 1 ? 's' : ''} due</p>
                  <div className="space-y-1.5" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    {dueStocks.map(s => {
                      const age = -dFromNow(s.lastFlipped || s.createdAt);
                      return (
                        <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)' }}>
                          <button onClick={() => { setFlipCat(null); setHomeEditStock({ ...s }); }}
                            className="text-left flex-1 min-w-0" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{s.name}</p>
                              {((s.copies || 1) > 1 || catStocks.some(x => x.id !== s.id && x.name === s.name)) && <span className="badge text-[10px]" style={{ background: 'rgba(59,130,246,0.1)', color: '#93c5fd' }}>#{s.copies || 1}</span>}
                            </div>
                            <p className="text-[11px]" style={{ color: '#fca5a5' }}>{age}d / {getFlipDays(s)}d</p>
                          </button>
                          <button onClick={() => { flipStock(s.id); }}
                            className="touch px-3 py-1 text-xs font-semibold rounded-lg transition-all active:scale-95 shrink-0 ml-2"
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)' }}>
                            Flip
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <Field label="Or set date for all">
                <Inp type="date" value={flipDate} onChange={e => setFlipDate(e.target.value)} />
              </Field>
              <div className="flex gap-2 mt-2">
                <Btn onClick={() => {
                  const ids = new Set(catStocks.map(s => s.id));
                  ids.forEach(id => markEdited(id));
                  setStocks(p => p.map(s => ids.has(s.id) ? { ...s, lastFlipped: flipDate } : s));
                  toast.add(`${label} flipped on ${fmt(flipDate)}`);
                  setFlipCat(null);
                }} className="flex-1">Set All Flipped</Btn>
                <Btn v="s" onClick={() => setFlipCat(null)}>Cancel</Btn>
              </div>
            </div>
          );
        })()}
      </Modal>
      <StockModal stock={homeEditStock} onClose={() => setHomeEditStock(null)} stocks={stocks} setStocks={setStocks} toast={toast} onDelete={() => {}} STOCK_CATS={STOCK_CATS} currentUser={currentUser} onTransfer={onTransfer} virginBank={virginBank} setVirginBank={setVirginBank} expBank={expBank} setExpBank={setExpBank} />
    </div>
  );
}

/* ========== STOCKS SCREEN ========== */
export default HomeScreen;
