import React, { useState, useEffect } from 'react';
import { Modal, Btn, Confirm, CircleProgress } from './ui';
import { STATUSES, STATUS_SHORT, VCS_DEFAULTS, USERS } from '../utils/constants.js';
import { today, fmt, dFromNow } from '../utils/dates.js';
import { fmtTime } from '../utils/dates.js';
import { uid, sn, sg, cl, nextSt, stIdx, tempLabel, crossDetect, getScreeningGuide, getTL, isTouchDevice, dlICS } from '../utils/helpers.js';
import { markEdited, markDeleted, unmarkDeleted, supabaseDeleteNow } from '../utils/supabase.js';
import { computeNextActions, makeVcs, vcsKey } from '../utils/vcs.js';
import EditCrossModal from './EditCrossModal.jsx';

function CrossTimeline({ cross }) {
  const si = stIdx(cross.status);
  const positions = STATUSES.map((_, i) => (i / (STATUSES.length - 1)) * 100);
  const fillPct = positions[si];

  return (
    <div className="py-3 px-1">
      <div className="tl-track">
        <div className="tl-fill" style={{ width: `${fillPct}%` }} />
        {STATUSES.map((st, i) => {
          let cls = 'tl-dot ';
          if (i < si) cls += 'tl-dot-done';
          else if (i === si) cls += 'tl-dot-current pulse-dot';
          else cls += 'tl-dot-future';
          return <div key={i} className={cls} style={{ left: `${positions[i]}%` }} />;
        })}
      </div>
      <div className="relative mt-3" style={{ height: '14px' }}>
        {STATUS_SHORT.map((lbl, i) => (
          <span key={i} className="tl-label"
            style={{
              position: 'absolute',
              left: `${positions[i]}%`,
              transform: 'translateX(-50%)',
              color: i < si ? 'rgba(34,197,94,0.5)' : i === si ? 'var(--accent-2)' : 'var(--text-3)',
              fontWeight: i === si ? 700 : 600,
            }}>
            {lbl}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ========== NEXT ACTION HELPER ========== */
function getNextAction(cross, stocks) {
  const tl = getTL(cross);
  const cd = crossDetect(cross, stocks);

  if (cross.status === 'done') return null;

  switch (cross.status) {
    case 'set up':
      return { text: 'Cross set up - advance when ready', urgent: false };
    case 'waiting for virgins': {
      const waited = -dFromNow(cross.setupDate);
      const remaining = 9 - waited;
      if (remaining <= 0) return { text: 'Virgins eclosing - collect now!', urgent: true };
      if (remaining === 1) return { text: 'Virgins eclose tomorrow', urgent: false };
      return { text: `Waiting for virgins - ${remaining}d remaining`, urgent: false };
    }
    case 'collecting virgins':
      return { text: 'Collecting virgins - set up cross when ready', urgent: false };
    case 'waiting for progeny': {
      const waitStart = cross.waitStartDate;
      if (waitStart) {
        const waited = -dFromNow(waitStart);
        const remaining = 9 - waited;
        if (remaining <= 0) return { text: 'Progeny ready - collect now!', urgent: true };
        return { text: `Waiting for progeny - ${remaining}d remaining`, urgent: false };
      }
      return { text: 'Waiting for progeny', urgent: false };
    }
    case 'collecting progeny':
      return { text: 'Collecting progeny', urgent: false };
    case 'ripening': {
      const rStart = cross.ripeningStartDate;
      if (rStart) {
        const days = -dFromNow(rStart);
        const target = cd.o ? 3 : 5; // retinal needs 3d, GCaMP needs 5d expression
        const remaining = target - days;
        if (remaining <= 0) return { text: `Ripening complete - ready for experiment`, urgent: true };
        return { text: `Ripening - ${remaining}d remaining (${cd.o ? 'retinal uptake' : 'GCaMP expression'})`, urgent: false };
      }
      return { text: cd.o ? 'Ripening - retinal uptake (3d)' : 'Ripening - GCaMP expression (5d)', urgent: false };
    }
    case 'screening':
      return { text: 'Screen and score', urgent: false };
    default:
      return null;
  }
}

/* ========== CIRCULAR PROGRESS ========== */

function CrossCard({ cross, stocks, setCrosses, toast, virginBank, setVirginBank, virginsPerCross, forceOpen, currentUser, onTransfer, printListCrosses, setPrintListCrosses, expBank, setExpBank }) {
  const [detailOpen, setDetailOpen] = useState(false);
  useEffect(() => { if (forceOpen) setDetailOpen(true); }, [forceOpen]);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const tl = getTL(cross);
  const cd = crossDetect(cross, stocks);
  const tot = (cross.collected || []).reduce((s, e) => s + e.count, 0);
  const isVirginPhase = ['waiting for virgins', 'collecting virgins'].includes(cross.status);
  const vTarget = virginsPerCross || 5;
  const vCollected = cross.virginsCollected || 0;
  const hasTarget = isVirginPhase ? vTarget > 0 : cross.targetCount > 0;
  const isCollecting = ['waiting for virgins', 'collecting virgins', 'waiting for progeny', 'collecting progeny', 'screening'].includes(cross.status);
  const nextAction = getNextAction(cross, stocks);
  const isDone = cross.status === 'done';

  function advance(e) {
    e?.stopPropagation();
    let ns = nextSt(cross.status);
    // Skip ripening for crosses without opto/imaging
    if (ns === 'ripening' && !cd.o && !cd.c) ns = nextSt(ns);
    // Auto-skip "collecting virgins" if enough virgins are banked for the virgin parent
    if (ns === 'collecting virgins' && virginBank && setVirginBank) {
      const needed = virginsPerCross || 5;
      const available = virginBank[cross.parentA] || 0;
      if (available >= needed) {
        setVirginBank(prev => ({ ...prev, [cross.parentA]: (prev[cross.parentA] || 0) - needed }));
        ns = 'collecting progeny';
        toast.add(`Used ${needed} banked virgins → ${ns}`);
        markEdited(cross.id);
        setCrosses(p => p.map(c => c.id === cross.id ? { ...c, status: ns } : c));
        return;
      }
    }
    markEdited(cross.id);
    const extra = ns === 'waiting for progeny' ? { waitStartDate: today(), vcs: null }
      : ns === 'ripening' ? { ripeningStartDate: today() }
      : ns === 'collecting virgins' ? { vcs: makeVcs(cross.overnightAt18 !== false, 2, VCS_DEFAULTS[vcsKey(cross.overnightAt18 !== false, 2)]) }
      : {};
    setCrosses(p => p.map(c => c.id === cross.id ? { ...c, status: ns, ...extra } : c));
    toast.add(`→ ${ns}`);
  }

  function quickLog(n) {
    markEdited(cross.id);
    setCrosses(p => p.map(c => c.id !== cross.id ? c : { ...c, collected: [...(c.collected || []), { date: today(), count: n }] }));
    toast.add(`+${n} logged`);
  }

  function logVirgin(n) {
    markEdited(cross.id);
    const newCount = vCollected + n;
    if (newCount >= vTarget) {
      setCrosses(p => p.map(c => c.id === cross.id ? { ...c, virginsCollected: newCount, status: 'waiting for progeny', waitStartDate: today(), vcs: null } : c));
      toast.add(`${vTarget} virgins collected → waiting for progeny`);
    } else {
      setCrosses(p => p.map(c => c.id === cross.id ? { ...c, virginsCollected: newCount } : c));
      toast.add(`+${n} virgin${n > 1 ? 's' : ''}`);
    }
  }

  function revial() {
    const clone = {
      ...cross,
      id: uid(),
      setupDate: today(),
      status: 'waiting for progeny',
      waitStartDate: today(),
      collected: [],
      vials: [],
      vcs: null,
      notes: `Re-vial of ${cl(cross, stocks)}`,
    };
    markEdited(clone.id);
    setCrosses(p => [...p, clone]);
    toast.add('Re-vialed - new cross created');
  }

  function exportCal() {
    const lb = cl(cross, stocks);
    const ev = [
      { date: tl.virginStart, title: `Virgins start: ${lb}`, desc: 'Start collecting virgins' },
      { date: tl.virginEnd, title: `Virgins end: ${lb}`, desc: 'Last day for virgins' },
      { date: tl.progenyStart, title: `Progeny start: ${lb}`, desc: 'Start collecting progeny' },
      { date: tl.progenyEnd, title: `Progeny end: ${lb}`, desc: 'Last day for progeny' },
    ];
    if (cross.experimentDate) ev.push({ date: cross.experimentDate, title: `Experiment: ${lb}`, desc: cross.experimentType || '' });
    dlICS(ev, `cross-${cross.id.slice(0, 6)}.ics`);
    toast.add('Calendar exported');
  }

  function doDelete() {
    const backup = { ...cross };
    markDeleted(cross.id);
    supabaseDeleteNow('crosses', cross.id);
    setCrosses(p => p.filter(c => c.id !== cross.id));
    setDeleting(false);
    setDetailOpen(false);
    toast.add('Cross deleted', () => { unmarkDeleted(backup.id); setCrosses(p => [...p, backup]); });
  }

  function setStatus(st) {
    markEdited(cross.id);
    const extra = st === 'waiting for progeny' ? { waitStartDate: today(), vcs: null }
      : st === 'collecting virgins' && !cross.vcs ? { vcs: makeVcs(cross.overnightAt18 !== false, 2, VCS_DEFAULTS[vcsKey(cross.overnightAt18 !== false, 2)]) }
      : {};
    setCrosses(p => p.map(c => c.id === cross.id ? { ...c, status: st, ...extra } : c));
    toast.add(`Set to: ${st}`);
  }

  /* --- Compact card (tap to open detail) --- */
  return (
    <>
      <div className={`card anim-in cursor-pointer transition-all active:scale-[0.98] ${isDone ? 'opacity-50' : ''}`}
        style={['collecting virgins', 'collecting progeny', 'ripening'].includes(cross.status)
          ? { borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', boxShadow: '0 0 20px rgba(239,68,68,0.08)' }
          : (cross.status === 'waiting for virgins' && -dFromNow(cross.setupDate) >= 7) || (cross.status === 'waiting for progeny' && cross.waitStartDate && -dFromNow(cross.waitStartDate) >= 7)
            ? { borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.06)', boxShadow: '0 0 20px rgba(245,158,11,0.08)' }
            : {}}
        onClick={() => setDetailOpen(true)}>
        <div className="p-4 flex items-center gap-4">
          {/* Circular progress - hide during waiting statuses */}
          {hasTarget && !['waiting for virgins', 'waiting for progeny'].includes(cross.status) ? (
            <CircleProgress value={isVirginPhase ? vCollected : tot} max={isVirginPhase ? vTarget : cross.targetCount} countUp={['collecting virgins', 'collecting progeny'].includes(cross.status)} />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: isDone ? 'rgba(34,197,94,0.1)' : 'var(--accent-glow-2)', border: `1px solid ${isDone ? 'rgba(34,197,94,0.15)' : 'rgba(139,92,246,0.15)'}` }}>
              <span className="text-xs font-bold" style={{ color: isDone ? '#86efac' : 'var(--accent-2)' }}>
                {isDone ? '✓'
                  : cross.status === 'waiting for progeny' && cross.waitStartDate ? Math.max(0, 9 - (-dFromNow(cross.waitStartDate))) + 'd'
                  : cross.status === 'waiting for virgins' ? Math.max(0, 9 - (-dFromNow(cross.setupDate))) + 'd'
                  : STATUS_SHORT[stIdx(cross.status)]}
              </span>
            </div>
          )}

          {/* Names + info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="text-[14px] font-bold leading-snug truncate" style={{ color: 'var(--text-1)' }}>
                <span style={{ color: '#f9a8d4' }}>♀</span> {sn(stocks, cross.parentA)} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>×</span> <span style={{ color: '#93c5fd' }}>♂</span> {sn(stocks, cross.parentB)}
              </div>
              <span className="badge shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>{tempLabel(cross.temperature)}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {cd.o && <span className="badge" style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5' }}>opto</span>}
              {cd.c && <span className="badge" style={{ background: 'rgba(34,197,94,0.1)', color: '#86efac' }}>imaging</span>}
              {cross.experimentType && <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>{cross.experimentType}</span>}
            </div>
          </div>

          {/* Next action indicator */}
          {nextAction && (
            <div className="shrink-0 text-right">
              {nextAction.urgent && <div className="w-2 h-2 rounded-full ml-auto mb-1" style={{ background: 'var(--red)', boxShadow: '0 0 6px rgba(239,68,68,0.4)' }} />}
              {nextAction.date && <span className="text-[11px] font-medium" style={{ color: nextAction.urgent ? '#fca5a5' : 'var(--text-3)' }}>{fmt(nextAction.date)}</span>}
            </div>
          )}
        </div>
      </div>

      {/* ===== DETAIL POPUP ===== */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={<div className="flex items-center gap-2">{cl(cross, stocks)} <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', fontWeight: 500, fontSize: '11px' }}>{tempLabel(cross.temperature)}</span>{setPrintListCrosses && <button onClick={() => { const inList = (printListCrosses || []).includes(cross.id); setPrintListCrosses(p => inList ? p.filter(x => x !== cross.id) : [...p, cross.id]); toast.add(inList ? 'Removed from print list' : 'Added to print list'); }} className="touch p-1.5 rounded-lg transition-all active:scale-90" style={{ color: (printListCrosses || []).includes(cross.id) ? '#5eead4' : 'var(--text-3)' }} title={(printListCrosses || []).includes(cross.id) ? 'In print list' : 'Add to print list'}><svg width="16" height="16" viewBox="0 0 24 24" fill={(printListCrosses || []).includes(cross.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>}</div>}>
        {/* Parents with genotypes */}
        <div className="grid gap-3 mb-5">
          <div className="card-inner p-4">
            <span className="text-sm font-bold" style={{ color: '#f9a8d4' }}>♀ Virgin</span>
            <p className="text-[15px] font-bold" style={{ color: 'var(--text-1)' }}>{sn(stocks, cross.parentA)}</p>
            {sg(stocks, cross.parentA) && sg(stocks, cross.parentA) !== '+' && (
              <p className="text-xs mono mt-1 break-all" style={{ color: 'rgba(167,139,250,0.5)' }}>{sg(stocks, cross.parentA)}</p>
            )}
          </div>
          <div className="card-inner p-4">
            <span className="text-sm font-bold" style={{ color: '#93c5fd' }}>♂ Male</span>
            <p className="text-[15px] font-bold" style={{ color: 'var(--text-1)' }}>{sn(stocks, cross.parentB)}</p>
            {sg(stocks, cross.parentB) && sg(stocks, cross.parentB) !== '+' && (
              <p className="text-xs mono mt-1 break-all" style={{ color: 'rgba(167,139,250,0.5)' }}>{sg(stocks, cross.parentB)}</p>
            )}
          </div>
        </div>

        {/* Timeline */}
        <p className="section-header">Timeline</p>
        <CrossTimeline cross={cross} />

        {/* Dates - hide range for current collecting phase */}
        {(() => {
          const showVirgin = cross.status === 'waiting for virgins';
          const showProgeny = cross.status === 'waiting for progeny';
          if (!showVirgin && !showProgeny) return null;
          return (
            <div className={`grid gap-3 mt-3 mb-5 ${showVirgin && showProgeny ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {showVirgin && (
                <div className="card-inner p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Virgins</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{fmt(tl.virginStart)} – {fmt(tl.virginEnd)}</p>
                </div>
              )}
              {showProgeny && (
                <div className="card-inner p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Progeny</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{fmt(tl.progenyStart)} – {fmt(tl.progenyEnd)}</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Next action */}
        {nextAction && (
          <div className="flex items-center gap-2 mb-5 p-3 rounded-xl" style={{ background: nextAction.urgent ? 'rgba(239,68,68,0.06)' : 'var(--accent-glow-2)', border: `1px solid ${nextAction.urgent ? 'rgba(239,68,68,0.1)' : 'rgba(139,92,246,0.1)'}` }}>
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: nextAction.urgent ? 'var(--red)' : 'var(--accent)' }} />
            <span className="text-sm font-medium flex-1" style={{ color: nextAction.urgent ? '#fca5a5' : 'var(--text-2)' }}>{nextAction.text}</span>
            {nextAction.date && <span className="text-xs" style={{ color: 'var(--text-3)' }}>{fmt(nextAction.date)}</span>}
          </div>
        )}

        {/* Ripening progress (retinal/GCaMP timing shown during ripening) */}
        {(cd.o || cd.c) && cross.ripeningStartDate && cross.status === 'ripening' && (
          <div className="text-xs mb-5" style={{ color: 'rgba(252,165,165,0.5)' }}>
            {cd.o ? 'Retinal uptake' : 'GCaMP expression'} - {-dFromNow(cross.ripeningStartDate)}d / {cd.o ? 3 : 5}d {-dFromNow(cross.ripeningStartDate) >= (cd.o ? 3 : 5) ? '- ready' : ''}
          </div>
        )}

        {/* Virgin collection progress - only during collecting */}
        {cross.status === 'collecting virgins' && (
          <div className="mb-5">
            <div className="flex items-center justify-between">
              <p className="section-header">Virgin Collection</p>
              {cross.overnightAt18 !== undefined && (
                <span className="text-[10px] px-2 py-0.5 rounded-md" style={{ background: cross.overnightAt18 ? 'rgba(139,92,246,0.1)' : 'rgba(148,163,184,0.1)', color: cross.overnightAt18 ? '#a78bfa' : 'var(--text-3)' }}>
                  {cross.overnightAt18 ? '18°C overnight' : 'Room temp'}
                </span>
              )}
            </div>
            {(() => {
              const parentStock = stocks.find(s => s.id === cross.parentA);
              if (!parentStock?.vcs?.enabled) return null;
              const nextActs = computeNextActions(parentStock.vcs, new Date());
              const nextA = nextActs[0];
              return (
                <p className="text-[10px] mb-2 px-2 py-1 rounded-lg inline-block" style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa' }}>
                  VCS from {parentStock.name}{nextA ? ` - Next: ${fmtTime(nextA.suggestedTime)}` : ''}
                </p>
              );
            })()}
            <div className="flex items-center gap-4 mb-3">
              <CircleProgress value={vCollected} max={vTarget} size={56} stroke={4} countUp />
              <div>
                <p className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{vCollected} <span className="text-sm font-normal" style={{ color: 'var(--text-3)' }}>/ {vTarget}</span></p>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>{Math.round((vCollected / vTarget) * 100)}% collected</p>
              </div>
            </div>
            <div className="flex gap-2">
              {[1, 3, 5].map(n => (
                <button key={n} onClick={() => logVirgin(n)} className="qlog-btn flex-1">+{n}</button>
              ))}
            </div>
          </div>
        )}

        {/* Progeny collection progress - hide during waiting statuses */}
        {!isVirginPhase && !['waiting for progeny'].includes(cross.status) && hasTarget && (
          <div className="mb-5">
            <p className="section-header">Collection Progress</p>
            <div className="flex items-center gap-4 mb-3">
              <CircleProgress value={tot} max={cross.targetCount} size={56} stroke={4} countUp />
              <div>
                <p className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{tot} <span className="text-sm font-normal" style={{ color: 'var(--text-3)' }}>/ {cross.targetCount}</span></p>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>{Math.round((tot / cross.targetCount) * 100)}% collected</p>
              </div>
            </div>
            {isCollecting && !isDone && (
              <div className="flex gap-2">
                {[1, 5, 10].map(n => (
                  <button key={n} onClick={() => quickLog(n)} className="qlog-btn flex-1">+{n}</button>
                ))}
              </div>
            )}
            {(cross.collected || []).length > 0 && (
              <div className="text-xs mt-3" style={{ color: 'var(--text-3)' }}>
                Recent: {(cross.collected || []).slice(-5).map((e, i) => <span key={i}>{i > 0 ? ', ' : ''}{fmt(e.date)} +{e.count}</span>)}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {cross.notes && (
          <div className="mb-5">
            <p className="section-header">Notes</p>
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>{cross.notes}</p>
          </div>
        )}

        {cross.status === 'screening' && expBank && setExpBank && (() => {
          const entry = expBank[cross.id] || { m: 0, f: 0 };
          return (
            <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(94,234,212,0.04)', border: '1px solid rgba(94,234,212,0.1)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold" style={{ color: '#5eead4' }}>Exp Bank</p>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>{entry.m || 0}♂ {entry.f || 0}♀</p>
              </div>
              <div className="mb-2">
                <p className="text-[10px] mb-1" style={{ color: '#93c5fd' }}>♂</p>
                <div className="flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); setExpBank(prev => { const cur = prev[cross.id] || { m: 0, f: 0, source: 'cross' }; return { ...prev, [cross.id]: { ...cur, m: Math.max(0, cur.m - 1) } }; }); }} className="qlog-btn flex-1" disabled={(entry.m || 0) <= 0} style={(entry.m || 0) <= 0 ? { opacity: 0.3 } : {}}>-1</button>
                  {[1, 3, 5].map(n => <button key={n} onClick={(e) => { e.stopPropagation(); setExpBank(prev => { const cur = prev[cross.id] || { m: 0, f: 0, source: 'cross' }; return { ...prev, [cross.id]: { ...cur, m: (cur.m || 0) + n } }; }); }} className="qlog-btn flex-1">+{n}</button>)}
                </div>
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: '#f9a8d4' }}>♀</p>
                <div className="flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); setExpBank(prev => { const cur = prev[cross.id] || { m: 0, f: 0, source: 'cross' }; return { ...prev, [cross.id]: { ...cur, f: Math.max(0, cur.f - 1) } }; }); }} className="qlog-btn flex-1" disabled={(entry.f || 0) <= 0} style={(entry.f || 0) <= 0 ? { opacity: 0.3 } : {}}>-1</button>
                  {[1, 3, 5].map(n => <button key={n} onClick={(e) => { e.stopPropagation(); setExpBank(prev => { const cur = prev[cross.id] || { m: 0, f: 0, source: 'cross' }; return { ...prev, [cross.id]: { ...cur, f: (cur.f || 0) + n } }; }); }} className="qlog-btn flex-1">+{n}</button>)}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Screening Guide */}
        {['collecting progeny', 'screening'].includes(cross.status) && (() => {
          const guide = getScreeningGuide(cross, stocks);
          if (guide.length === 0) return null;
          return (
            <div className="mb-5">
              <p className="section-header">What to look for</p>
              <div className="grid gap-2">
                {guide.map((m, i) => (
                  <div key={i} className="card-inner p-3 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold" style={{ color: 'var(--text-1)' }}>{m.name}</span>
                      {m.chromosome && <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>{m.chromosome}</span>}
                      <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>{m.source}</span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>{m.phenotype}</p>
                    <p className="text-xs font-semibold mt-1" style={{ color: '#86efac' }}>Select: {m.select}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Actions */}
        <div className="grid gap-2">
          {!isDone ? (
            <Btn v="advance" onClick={advance} className="w-full">Advance → {(() => { let ns = nextSt(cross.status); if (ns === 'ripening' && !cd.o && !cd.c) ns = nextSt(ns); return ns; })()}</Btn>
          ) : (
            <Btn v="s" onClick={() => {
              const newId = uid();
              markEdited(newId);
              setCrosses(p => [...p, {
                ...cross, id: newId, status: 'set up', setupDate: today(),
                collected: [], vials: [], retinalStartDate: '', notes: cross.notes ? `Repeat: ${cross.notes}` : 'Repeat',
                manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
              }]);
              toast.add('Cross repeated');
              setDetailOpen(false);
            }} className="w-full">Repeat Cross</Btn>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Btn v="s" onClick={() => { setEditing(true); setDetailOpen(false); }}>Edit</Btn>
            <Btn v="s" onClick={exportCal}>Calendar</Btn>
            {cross.status === 'waiting for progeny' ? (
              <Btn v="s" onClick={revial}>Re-vial</Btn>
            ) : isDone ? (
              <Btn v="d" onClick={() => { setDeleting(true); setDetailOpen(false); }}>Delete</Btn>
            ) : <Btn v="s" disabled style={{ opacity: 0.3 }}>Re-vial</Btn>}
          </div>
          {!isDone && (
            <>
              <p className="text-[10px] uppercase tracking-wider font-semibold mt-2" style={{ color: 'var(--text-3)' }}>Jump to status</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.filter(s => s !== cross.status).map(s => (
                  <button key={s} onClick={() => setStatus(s)}
                    className="px-3 py-1.5 text-xs rounded-lg transition-all active:scale-95 cursor-pointer"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>{s}</button>
                ))}
              </div>
              <Btn v="d" onClick={() => { setDeleting(true); setDetailOpen(false); }} className="w-full mt-2">Delete Cross</Btn>
            </>
          )}
          {onTransfer && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-3)' }}>Transfer ownership</p>
              <div className="flex flex-wrap gap-1.5">
                {USERS.filter(u => u !== currentUser).map(u => (
                  <button key={u} onClick={() => { onTransfer({ type: 'cross', itemId: cross.id, name: cl(cross, stocks), to: u }); setDetailOpen(false); }}
                    className="px-3 py-1.5 text-xs rounded-lg transition-all active:scale-95 cursor-pointer"
                    style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.15)' }}>{u}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      <EditCrossModal open={editing} onClose={() => setEditing(false)} cross={cross} stocks={stocks} setCrosses={setCrosses} toast={toast} allCrosses={[]} />
      <Confirm open={deleting} onOk={doDelete} onNo={() => setDeleting(false)} title="Delete cross?" msg="This cross and all collection data will be permanently removed." />
    </>
  );
}

/* ========== EDIT CROSS MODAL ========== */
export default CrossCard;
