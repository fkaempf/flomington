import React, { useState, useEffect, useRef } from 'react';
import { Modal, Btn, Inp, Txt, Field } from './ui';
import { TEMPS, STOCK_SOURCES, STOCK_VARIANTS, VCS_DEFAULTS, USERS } from '../utils/constants.js';
import { today, normDate, dFromNow } from '../utils/dates.js';
import { uid, tempFull, guessSource, stockUrl, parseJaneliaLine, janeliaUrl, fetchBDSCInfo, parseFlyBase, flybaseUrl, stockTags, getFlipDays, isTouchDevice } from '../utils/helpers.js';
import { markEdited } from '../utils/supabase.js';
import { makeVcs, vcsKey } from '../utils/vcs.js';

function VcsSetup({ f, setF, toast }) {
  const vcsActive = f.vcs?.enabled;
  const [vcsStep, setVcsStep] = React.useState(0);
  const [vcsO18, setVcsO18] = React.useState(true);
  const [vcsCpd, setVcsCpd] = React.useState(2);
  const [vcsSched, setVcsSched] = React.useState(null);
  const [confirmDisable, setConfirmDisable] = React.useState(false);

  React.useEffect(() => { if (vcsStep === 3) { setVcsSched({ ...VCS_DEFAULTS[vcsKey(vcsO18, vcsCpd)] }); } }, [vcsStep, vcsO18, vcsCpd]);

  if (confirmDisable) return (
    <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
      <p className="text-sm font-semibold mb-2" style={{ color: '#fca5a5' }}>Disable Virgin Collection?</p>
      <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>Stock will remain expanded with normal flip schedule.</p>
      <div className="flex gap-2">
        <button onClick={() => { setF({ ...f, vcs: null }); setConfirmDisable(false); toast.add('VCS disabled'); }}
          className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg" style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>Yes, disable</button>
        <button onClick={() => setConfirmDisable(false)}
          className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>Cancel</button>
      </div>
    </div>
  );

  if (vcsActive && vcsStep === 0) return (
    <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: '#a78bfa' }}>♀</span>
          <p className="text-xs font-semibold" style={{ color: '#a78bfa' }}>VCS Active</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{f.vcs.overnightAt18 ? '18°C' : '25°C'} · {f.vcs.collectionsPerDay}×/day</span>
          <button onClick={() => setConfirmDisable(true)} className="px-2 py-1 text-[10px] rounded-lg" style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.1)' }}>Stop</button>
        </div>
      </div>
    </div>
  );

  if (vcsStep === 0) return (
    <button onClick={() => setVcsStep(1)} className="w-full mb-4 px-4 py-3 text-sm font-semibold rounded-xl transition-all active:scale-[0.98] cursor-pointer"
      style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.15)' }}>
      Enable Virgin Collection
    </button>
  );

  return (
    <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
      <p className="text-xs font-semibold mb-3" style={{ color: '#a78bfa' }}>VCS Setup - Step {vcsStep}/3</p>
      {vcsStep >= 1 && (
        <div className="mb-3">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Overnight temperature?</p>
          <div className="grid grid-cols-2 gap-2 mb-1">
            <div onClick={() => setVcsO18(true)} className={`loc-card cursor-pointer ${vcsO18 ? 'selected' : ''}`}>
              <p className="text-xs font-bold" style={{ color: 'var(--text-1)' }}>18°C overnight</p>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>16h virgin window</p>
            </div>
            <div onClick={() => setVcsO18(false)} className={`loc-card cursor-pointer ${!vcsO18 ? 'selected' : ''}`}>
              <p className="text-xs font-bold" style={{ color: 'var(--text-1)' }}>25°C (no move)</p>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>8h virgin window</p>
            </div>
          </div>
          <p className="text-[10px] mb-2" style={{ color: 'var(--text-3)' }}>{vcsO18 ? '18°C extends the virgin window to ~16h and captures the dawn eclosion peak.' : 'Morning eclosers will have mated - must clear & discard first.'}</p>
          {vcsStep === 1 && <button onClick={() => setVcsStep(2)} className="w-full px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>Next →</button>}
        </div>
      )}
      {vcsStep >= 2 && (
        <div className="mb-3">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Collections per day?</p>
          <div className="grid grid-cols-2 gap-2 mb-1">
            <div onClick={() => setVcsCpd(2)} className={`loc-card cursor-pointer ${vcsCpd === 2 ? 'selected' : ''}`}>
              <p className="text-xs font-bold" style={{ color: 'var(--text-1)' }}>2× daily</p>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>Recommended</p>
            </div>
            <div onClick={() => setVcsCpd(3)} className={`loc-card cursor-pointer ${vcsCpd === 3 ? 'selected' : ''}`}>
              <p className="text-xs font-bold" style={{ color: 'var(--text-1)' }}>3× daily</p>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>Rare genotypes</p>
            </div>
          </div>
          {vcsStep === 2 && <button onClick={() => setVcsStep(3)} className="w-full px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>Next →</button>}
        </div>
      )}
      {vcsStep === 3 && vcsSched && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Schedule</p>
          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-2)' }}>Evening clear{vcsO18 ? ' → 18°C' : ''}</span>
              <input type="time" value={vcsSched.eveningClear} onChange={e => setVcsSched({ ...vcsSched, eveningClear: e.target.value })}
                className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: vcsO18 ? '#5eead4' : '#fca5a5' }}>{vcsO18 ? 'Morning collect' : 'Morning clear + discard ⚠️'}</span>
              <input type="time" value={vcsSched.morningCollect} onChange={e => setVcsSched({ ...vcsSched, morningCollect: e.target.value })}
                className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
            </div>
            {vcsCpd === 3 && (
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#5eead4' }}>Midday collect</span>
                <input type="time" value={vcsSched.middayCollect || ''} onChange={e => setVcsSched({ ...vcsSched, middayCollect: e.target.value })}
                  className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: '#5eead4' }}>Afternoon collect + clear</span>
              <input type="time" value={vcsSched.afternoonCollect} onChange={e => setVcsSched({ ...vcsSched, afternoonCollect: e.target.value })}
                className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--text-1)', border: '1px solid var(--border)' }} />
            </div>
          </div>
          {!vcsO18 && <p className="text-[10px] mb-3 p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)', color: '#fca5a5' }}>⚠️ Without 18°C overnight, morning flies must be discarded - they are NOT reliable virgins.</p>}
          <div className="flex gap-2">
            <button onClick={() => {
              const newVcs = makeVcs(vcsO18, vcsCpd, vcsSched);
              setF({ ...f, vcs: newVcs });
              setVcsStep(0);
              toast.add('VCS enabled');
              if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
            }} className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' }}>Start Virgin Collection</button>
            <button onClick={() => setVcsStep(0)} className="px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StockModal({ stock, onClose, stocks, setStocks, toast, onDelete, STOCK_CATS, setCollections, currentUser, onTransfer, virginBank, setVirginBank, printList, setPrintList, onMassAdd, expBank, setExpBank }) {
  const [f, setF] = useState({});
  const [showNotes, setShowNotes] = useState(false);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (stock) {
      setF({ ...stock });
      setShowNotes(!!stock.notes);
      setNameError('');
    }
  }, [stock?.id, stock !== null]);

  const saveRef = useRef(null);
  useEffect(() => {
    if (!stock) return;
    const h = e => {
      if (e.key !== 'Enter') return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'textarea' || tag === 'select') return;
      e.preventDefault();
      saveRef.current?.();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [!!stock]);

  if (!stock) return null;
  const isNew = !stock.id;

  function save() {
    if (!f.name?.trim()) { setNameError('Name is required'); return; }
    const saving = { ...f };
    // Auto-disable VCS if stock is dead or no longer expanded
    if (saving.vcs?.enabled && (stockTags(saving).includes('Dead') || (saving.variant || 'stock') !== 'expanded')) {
      saving.vcs = null;
    }
    // Auto-inherit collection maintainer when stock has no maintainer
    if (saving.category && saving.category !== 'No Collection') {
      const catStocks = stocks.filter(s => s.id !== saving.id && (s.category || 'No Collection') === saving.category);
      const maintainers = [...new Set(catStocks.map(s => s.maintainer).filter(Boolean))];
      if (maintainers.length === 1 && !saving.maintainer) saving.maintainer = maintainers[0];
    }
    if (isNew) {
      const newId = uid();
      markEdited(newId);
      setStocks(p => [...p, { ...saving, id: newId, createdAt: today(), lastFlipped: today() }]);
      toast.add('Stock added');
    } else {
      markEdited(saving.id);
      setStocks(p => p.map(s => s.id === saving.id ? { ...s, ...saving } : s));
      toast.add('Stock updated');
    }
    onClose();
  }
  saveRef.current = save;

  return (
    <Modal open={!!stock} onClose={onClose} title={isNew ? 'New Stock' : <div className="flex items-center gap-2">{f.name || 'Edit Stock'}<button onClick={() => { const inList = printList && printList.includes(f.id); setPrintList(p => inList ? p.filter(x => x !== f.id) : [...p, f.id]); toast.add(inList ? 'Removed from print list' : 'Added to print list'); }} className="touch p-1.5 rounded-lg transition-all active:scale-90" style={{ color: printList && printList.includes(f.id) ? '#5eead4' : 'var(--text-3)' }} title={printList && printList.includes(f.id) ? 'In print list' : 'Add to print list'}><svg width="16" height="16" viewBox="0 0 24 24" fill={printList && printList.includes(f.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button></div>}>
      <Field label="Name *">
        <Inp value={f.name || ''} onChange={e => { const v = e.target.value; const upd = { ...f, name: v }; if (!f.source && !f.sourceId) { const g = guessSource(v); if (g) { upd.source = g.source; upd.sourceId = g.sourceId; if (g.source === 'Bloomington' && g.sourceId) upd.flybaseId = `FBst${g.sourceId.replace(/\D/g, '').padStart(7, '0')}`; } } setF(upd); setNameError(''); }} placeholder="e.g. Oregon-R" autoFocus={!isTouchDevice()} />
        {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
      </Field>
      <Field label="Copy">
        <Inp type="number" min="1" value={f.copies || 1} onChange={e => setF({ ...f, copies: Math.max(1, parseInt(e.target.value) || 1) })} />
      </Field>
      <Field label="Variant">
        <div className="grid grid-cols-2 gap-2">
          {STOCK_VARIANTS.map(v => (
            <div key={v} onClick={() => {
              const upd = { ...f, variant: v };
              if (v === 'expanded') { upd.location = '25inc'; }
              setF(upd);
            }} className={`loc-card ${(f.variant || 'stock') === v ? 'selected' : ''}`}>
              <div className="text-sm font-bold capitalize" style={{ color: 'var(--text-1)' }}>{v}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{v === 'expanded' ? '3wk flip @ 25°C' : 'Variable flip'}</div>
            </div>
          ))}
        </div>
      </Field>
      <Field label="Collection">
        <select value={f.category || 'No Collection'} onChange={e => {
          if (e.target.value === '__new__') {
            const name = prompt('New collection name:');
            if (name && name.trim() && !STOCK_CATS.includes(name.trim())) {
              const n = name.trim();
              const idx = STOCK_CATS.indexOf('No Collection');
              const next = [...STOCK_CATS];
              if (idx >= 0) next.splice(idx, 0, n); else next.push(n);
              setCollections(next);
              setF({ ...f, category: n });
            }
          } else { setF({ ...f, category: e.target.value }); }
        }} className="w-full px-4 py-3 text-sm rounded-xl" style={{ background: 'var(--surface)', color: 'var(--text-1)', border: '1px solid var(--border)' }}>
          {STOCK_CATS.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          <option value="__new__">+ New Collection</option>
        </select>
      </Field>
      <Field label="Genotype">
        <Inp value={f.genotype || ''} onChange={e => setF({ ...f, genotype: e.target.value })} placeholder="e.g. w[1118]; UAS-CsChrimson/CyO" />
      </Field>
      <div className="flex items-center gap-3 mb-3">
        <div onClick={() => setF({ ...f, isGift: !f.isGift, source: f.isGift ? f.source : '', sourceId: f.isGift ? f.sourceId : '' })}
          className="loc-card flex items-center gap-2 px-4 py-2 cursor-pointer" style={f.isGift ? { borderColor: 'rgba(0,128,128,0.3)', background: 'rgba(0,128,128,0.08)' } : {}}>
          <span className="text-sm">{f.isGift ? '✓' : ''}</span>
          <span className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Gift</span>
        </div>
      </div>
      {f.isGift ? (
        <Field label="From lab">
          <Inp value={f.giftFrom || ''} onChange={e => setF({ ...f, giftFrom: e.target.value })} placeholder="e.g. Jefferis Lab" />
        </Field>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source">
              <select value={f.source || ''} onChange={e => setF({ ...f, source: e.target.value })}
                className="w-full px-4 py-3 text-sm rounded-xl">
                <option value="">-</option>
                {STOCK_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Stock #">
              <Inp value={f.sourceId || ''} onChange={e => {
                const v = e.target.value;
                const upd = { ...f, sourceId: v };
                const numId = v.replace(/\D/g, '');
                if (f.source === 'Bloomington' && numId) {
                  if (!f.flybaseId) upd.flybaseId = `FBst${numId.padStart(7, '0')}`;
                  if (numId.length >= 4) fetchBDSCInfo(numId).then(info => {
                    if (!info) return;
                    setF(prev => {
                      const next = { ...prev };
                      if (info.janeliaLine) next.janeliaLine = info.janeliaLine;
                      if (info.genotype && !prev.genotype) next.genotype = info.genotype;
                      return next;
                    });
                  });
                }
                setF(upd);
              }} placeholder="79039" />
            </Field>
          </div>
          {f.source && f.sourceId && stockUrl(f.source, f.sourceId) && (
            <div className="flex flex-wrap gap-3 mb-3">
              <a href={stockUrl(f.source, f.sourceId)} target="_blank" rel="noopener" className="text-xs inline-block touch" style={{ color: 'var(--accent-2)' }}>
                View on {f.source} ↗
              </a>
              {f.source === 'Bloomington' && (
                <a href={`https://flybase.org/reports/FBst${f.sourceId.replace(/\D/g, '').padStart(7, '0')}`} target="_blank" rel="noopener" className="text-xs inline-block touch" style={{ color: 'var(--accent-2)' }}>
                  View on FlyBase ↗
                </a>
              )}
              {(f.janeliaLine || parseJaneliaLine(f.notes)) && (
                <a href={janeliaUrl(f.janeliaLine || parseJaneliaLine(f.notes))} target="_blank" rel="noopener" className="text-xs inline-block touch" style={{ color: 'var(--accent-2)' }}>
                  FlyLight ({f.janeliaLine || parseJaneliaLine(f.notes)}) ↗
                </a>
              )}
            </div>
          )}
          {!(f.source && f.sourceId && stockUrl(f.source, f.sourceId)) && (f.janeliaLine || parseJaneliaLine(f.notes)) && (
            <div className="flex gap-3 mb-3">
              <a href={janeliaUrl(f.janeliaLine || parseJaneliaLine(f.notes))} target="_blank" rel="noopener" className="text-xs inline-block touch" style={{ color: 'var(--accent-2)' }}>
                FlyLight ({f.janeliaLine || parseJaneliaLine(f.notes)}) ↗
              </a>
            </div>
          )}
          {f.source && !stockUrl(f.source, f.sourceId) && f.source !== 'Other' && (
            <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>Source: {f.source}{f.sourceId ? ` #${f.sourceId}` : ''}</p>
          )}
        </>
      )}
      <Field label="FlyBase">
        <Inp value={f.flybaseId || ''} onChange={e => {
          const v = e.target.value;
          const parsed = parseFlyBase(v);
          setF({ ...f, flybaseId: parsed || v });
        }} placeholder="FBst0079039 or flybase.org/reports/..." />
      </Field>
      {f.flybaseId && flybaseUrl(f.flybaseId) && (
        <a href={flybaseUrl(f.flybaseId)} target="_blank" rel="noopener" className="text-xs mb-3 inline-block touch" style={{ color: 'var(--accent-2)' }}>
          View on FlyBase ↗
        </a>
      )}
      {(f.variant || 'stock') !== 'expanded' && (
        <Field label="Location">
          <div className="grid grid-cols-2 gap-2">
            {TEMPS.map(t => (
              <div key={t} onClick={() => setF({ ...f, location: t })} className={`loc-card ${f.location === t ? 'selected' : ''}`}>
                <div className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{tempFull(t)}</div>
              </div>
            ))}
          </div>
        </Field>
      )}
      {!isNew && (
        <Field label="Last Flipped">
          <Inp type="date" value={normDate(f.lastFlipped)} onChange={e => setF({ ...f, lastFlipped: e.target.value })} />
          {f.lastFlipped && <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{-dFromNow(f.lastFlipped)}d ago, next flip in {Math.max(0, getFlipDays(f) - (-dFromNow(f.lastFlipped)))}d</p>}
        </Field>
      )}
      {!f.maintainer ? (
        <Field label="Maintainer">
          <select value={f.maintainer || ''} onChange={e => setF({ ...f, maintainer: e.target.value })}
            className="w-full px-4 py-3 text-sm rounded-xl">
            <option value="">-</option>
            {USERS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
      ) : (
        <Field label="Maintainer">
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-1)' }}>{f.maintainer}</p>
          {onTransfer && f.maintainer === currentUser && !isNew && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-3)' }}>Transfer maintainership</p>
              <div className="flex flex-wrap gap-1.5">
                {USERS.filter(u => u !== currentUser).map(u => (
                  <button key={u} onClick={() => { onTransfer({ type: 'stock', itemId: f.id, name: f.name, to: u }); onClose(); }}
                    className="px-3 py-1.5 text-xs rounded-lg transition-all active:scale-95 cursor-pointer"
                    style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.15)' }}>{u}</button>
                ))}
              </div>
            </div>
          )}
        </Field>
      )}
      {!showNotes ? (
        <button onClick={() => setShowNotes(true)} className="text-xs mb-4 touch" style={{ color: 'var(--accent-2)' }}>+ add notes</button>
      ) : (
        <Field label="Notes"><Txt value={f.notes || ''} onChange={e => setF({ ...f, notes: e.target.value })} rows={2} /></Field>
      )}
      {/* VCS Setup */}
      {!isNew && (f.variant || 'stock') === 'expanded' && <VcsSetup f={f} setF={setF} toast={toast} />}

      {!isNew && virginBank && setVirginBank && (
        <div className="mb-4 p-3 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Virgin Bank</p>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>{virginBank[f.id] || 0} banked</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { if ((virginBank[f.id] || 0) > 0) { setVirginBank(prev => ({ ...prev, [f.id]: Math.max(0, (prev[f.id] || 0) - 1) })); toast.add('-1 virgin'); } }}
              disabled={(virginBank[f.id] || 0) <= 0}
              className="flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
              style={(virginBank[f.id] || 0) > 0 ? { background: 'rgba(239,68,68,0.08)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)' } : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)', opacity: 0.4 }}>-1</button>
            {[1, 3, 5].map(n => (
              <button key={n} onClick={() => { setVirginBank(prev => ({ ...prev, [f.id]: (prev[f.id] || 0) + n })); toast.add(`+${n} virgins banked`); }}
                className="flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                style={{ background: 'rgba(0,128,128,0.08)', color: '#5eead4', border: '1px solid rgba(0,128,128,0.15)' }}>+{n}</button>
            ))}
            {(virginBank[f.id] || 0) > 0 && (
              <button onClick={() => { setVirginBank(prev => { const next = { ...prev }; delete next[f.id]; return next; }); toast.add('Cleared'); }}
                className="px-2 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)' }}>Clear</button>
            )}
          </div>
        </div>
      )}
      {!isNew && expBank && setExpBank && (
        <div className="mb-4 p-3 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold" style={{ color: '#5eead4' }}>Exp Bank</p>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>{(expBank[f.id]?.m || 0)}♂ {(expBank[f.id]?.f || 0)}♀</p>
          </div>
          <div className="mb-2">
            <p className="text-[10px] mb-1" style={{ color: '#93c5fd' }}>♂ Males</p>
            <div className="flex gap-2">
              <button onClick={() => { if ((expBank[f.id]?.m || 0) > 0) { setExpBank(prev => ({ ...prev, [f.id]: { ...(prev[f.id] || { m: 0, f: 0, source: 'stock' }), m: Math.max(0, (prev[f.id]?.m || 0) - 1) } })); toast.add('-1 ♂'); } }}
                disabled={(expBank[f.id]?.m || 0) <= 0}
                className="flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                style={(expBank[f.id]?.m || 0) > 0 ? { background: 'rgba(239,68,68,0.08)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)' } : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)', opacity: 0.4 }}>-1</button>
              {[1, 3, 5].map(n => (
                <button key={n} onClick={() => { setExpBank(prev => ({ ...prev, [f.id]: { ...(prev[f.id] || { m: 0, f: 0, source: 'stock' }), m: (prev[f.id]?.m || 0) + n } })); toast.add(`+${n} ♂ logged`); }}
                  className="flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                  style={{ background: 'rgba(94,234,212,0.08)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.15)' }}>+{n}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] mb-1" style={{ color: '#f9a8d4' }}>♀ Females</p>
            <div className="flex gap-2">
              <button onClick={() => { if ((expBank[f.id]?.f || 0) > 0) { setExpBank(prev => ({ ...prev, [f.id]: { ...(prev[f.id] || { m: 0, f: 0, source: 'stock' }), f: Math.max(0, (prev[f.id]?.f || 0) - 1) } })); toast.add('-1 ♀'); } }}
                disabled={(expBank[f.id]?.f || 0) <= 0}
                className="flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                style={(expBank[f.id]?.f || 0) > 0 ? { background: 'rgba(239,68,68,0.08)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)' } : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)', opacity: 0.4 }}>-1</button>
              {[1, 3, 5].map(n => (
                <button key={n} onClick={() => { setExpBank(prev => ({ ...prev, [f.id]: { ...(prev[f.id] || { m: 0, f: 0, source: 'stock' }), f: (prev[f.id]?.f || 0) + n } })); toast.add(`+${n} ♀ logged`); }}
                  className="flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer"
                  style={{ background: 'rgba(94,234,212,0.08)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.15)' }}>+{n}</button>
              ))}
            </div>
          </div>
        </div>
      )}
      {!isNew && (
        <button onClick={() => {
          const url = window.location.origin + window.location.pathname + '?stock=' + f.id;
          navigator.clipboard.writeText(url).then(() => toast.add('Link copied'));
        }}
          className="w-full text-xs mb-3 touch" style={{ color: 'var(--accent-2)' }}>
          Copy share link
        </button>
      )}
      {isNew && onMassAdd && <button onClick={onMassAdd} className="w-full text-xs mb-3 touch" style={{ color: 'var(--accent-2)' }}>Add multiple stocks at once</button>}
      <div className="flex gap-2">
        <Btn onClick={save} className="flex-1">Save</Btn>
        {!isNew && <Btn v="s" onClick={() => {
          const split = { ...f, id: uid(), name: f.name + ' (split)', maintainer: currentUser, createdAt: today(), lastFlipped: today() };
          delete split.notes;
          markEdited(split.id);
          setStocks(p => [...p, split]);
          toast.add(`Split off "${split.name}"`);
          onClose();
        }}>Split</Btn>}
        {!isNew && <Btn v="d" onClick={() => onDelete(f.id)}>Delete</Btn>}
        <Btn v="s" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

/* ========== VIRGINS SCREEN ========== */
export { VcsSetup };
export default StockModal;
