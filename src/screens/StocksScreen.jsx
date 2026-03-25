import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Btn, Inp, Txt, Field, Confirm, TagBadges } from '../components/ui';
import { TEMPS, USERS } from '../utils/constants.js';
import { today, fmt, dFromNow } from '../utils/dates.js';
import { uid, tempFull, stockTags, getFlipDays, guessSource, isTouchDevice } from '../utils/helpers.js';
import { markEdited, markDeleted, unmarkDeleted, supabaseDeleteNow } from '../utils/supabase.js';
import useLS from '../hooks/useLS.js';
import StockModal from '../components/StockModal.jsx';

function StocksScreen({ stocks, setStocks, crosses, toast, currentUser, onTransfer, STOCK_CATS, setCollections, virginBank, setVirginBank, initialStockId, printList, setPrintList, printListCrosses, printListVirgins, printListExps, onOpenPrint, onBulkActive, expBank, setExpBank }) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState(() => initialStockId ? 'all' : 'all');
  const [showAll, setShowAll] = useState(() => !!initialStockId);
  const [accessDenied, setAccessDenied] = useState(null);
  const [editing, setEditing] = useState(() => {
    if (initialStockId) {
      const s = stocks.find(x => x.id === initialStockId || x.id.startsWith(initialStockId));
      return s ? { ...s } : null;
    }
    return null;
  });
  const [deleting, setDeleting] = useState(null);
  const [flipCat, setFlipCat] = useState(null);
  const [flipDate, setFlipDate] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [collectionDetail, setCollectionDetail] = useState(null);
  const [massAdding, setMassAdding] = useState(false);
  const [massAddText, setMassAddText] = useState('');
  const [massAddCat, setMassAddCat] = useState('No Collection');
  const [massAddLoc, setMassAddLoc] = useState('25inc');
  const [sortBy, setSortBy] = useLS('flo-sort', 'nextFlip');
  const [copyFilter, setCopyFilter] = useState('all');

  const copyNumbers = useMemo(() => [...new Set(stocks.map(s => Number(s.copies) || 1))].sort((a, b) => a - b), [stocks]);
  const hasCopies = copyNumbers.some(n => n > 1);

  const filtered = useMemo(() => {
    let result = stocks;
    if (!showAll) result = result.filter(s => s.maintainer === currentUser);
    if (catFilter === 'expanded') {
      result = result.filter(s => (s.variant || 'stock') === 'expanded');
    } else if (catFilter !== 'all') {
      result = result.filter(s => (s.category || 'No Collection') === catFilter);
    }
    if (copyFilter !== 'all') result = result.filter(s => Number(s.copies || 1) === Number(copyFilter));
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(s => [s.name, s.genotype || '', s.notes || '', s.sourceId || '', s.flybaseId || '', s.janeliaLine || '', s.source || '', s.giftFrom || '', s.category || ''].some(x => x.toLowerCase().includes(q)));
    }
    result = [...result].sort((a, b) => {
      if (sortBy === 'alpha') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'added') return (b.createdAt || '').localeCompare(a.createdAt || '');
      // nextFlip: most urgent first (highest age/flipDays ratio)
      const ra = a.lastFlipped ? -dFromNow(a.lastFlipped) / getFlipDays(a) : 0;
      const rb = b.lastFlipped ? -dFromNow(b.lastFlipped) / getFlipDays(b) : 0;
      return rb - ra;
    });
    return result;
  }, [stocks, search, catFilter, showAll, currentUser, sortBy, copyFilter]);

  function flipStock(id) {
    markEdited(id);
    setStocks(p => p.map(s => s.id === id ? { ...s, lastFlipped: today() } : s));
    toast.add('Flipped');
  }

  function doDelete() {
    const s = stocks.find(x => x.id === deleting);
    markDeleted(deleting);
    supabaseDeleteNow('stocks', deleting);
    setStocks(p => p.filter(x => x.id !== deleting));
    setDeleting(null);
    if (s) toast.add(`Deleted "${s.name}"`, () => { unmarkDeleted(s.id); setStocks(p => [...p, s]); });
  }

  // Multi-select
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkAction, setBulkAction] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkAppendText, setBulkAppendText] = useState('');
  const [bulkFlipDate, setBulkFlipDate] = useState('');

  useEffect(() => { if (!selectMode) setSelected(new Set()); }, [selectMode]);
  useEffect(() => { setSelected(new Set()); }, [catFilter, showAll, search]);
  useEffect(() => () => onBulkActive?.(false), []);

  function toggleSelect(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function selectAll() {
    setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(s => s.id)));
  }
  function exitSelect() { setSelectMode(false); onBulkActive?.(false); }
  function bulkFlip() {
    selected.forEach(id => markEdited(id));
    setStocks(p => p.map(s => selected.has(s.id) ? { ...s, lastFlipped: today() } : s));
    toast.add(`Flipped ${selected.size} stock${selected.size > 1 ? 's' : ''}`);
    exitSelect();
  }
  function bulkSetFlipDate(d) {
    selected.forEach(id => markEdited(id));
    setStocks(p => p.map(s => selected.has(s.id) ? { ...s, lastFlipped: d } : s));
    toast.add(`Set flip date on ${selected.size} stock${selected.size > 1 ? 's' : ''}`);
    setBulkAction(null);
    exitSelect();
  }
  function bulkDeleteConfirmed() {
    const ids = selected;
    const removed = stocks.filter(s => ids.has(s.id));
    ids.forEach(id => { markDeleted(id); supabaseDeleteNow('stocks', id); });
    setStocks(p => p.filter(s => !ids.has(s.id)));
    toast.add(`Deleted ${ids.size} stock${ids.size > 1 ? 's' : ''}`, () => { removed.forEach(s => unmarkDeleted(s.id)); setStocks(p => [...p, ...removed]); });
    setBulkDeleting(false);
    exitSelect();
  }
  function bulkCopy() {
    setStocks(p => {
      const newStocks = [];
      p.forEach(s => {
        if (selected.has(s.id)) {
          const maxCopy = Math.max(...p.filter(x => x.name === s.name && (x.category || 'No Collection') === (s.category || 'No Collection')).map(x => x.copies || 1));
          const newId = uid();
          markEdited(newId);
          newStocks.push({ ...s, id: newId, copies: maxCopy + 1, createdAt: today(), lastFlipped: today() });
        }
      });
      return [...p, ...newStocks];
    });
    toast.add(`Copied ${selected.size} stock${selected.size > 1 ? 's' : ''}`);
    exitSelect();
  }
  function bulkMoveCollection(cat) {
    selected.forEach(id => markEdited(id));
    setStocks(p => p.map(s => selected.has(s.id) ? { ...s, category: cat } : s));
    toast.add(`Moved ${selected.size} to ${cat}`);
    setBulkAction(null);
    exitSelect();
  }
  function bulkChangeMaintainer(user) {
    selected.forEach(id => markEdited(id));
    setStocks(p => p.map(s => selected.has(s.id) ? { ...s, maintainer: user } : s));
    toast.add(`${user} assigned to ${selected.size} stock${selected.size > 1 ? 's' : ''}`);
    setBulkAction(null);
    exitSelect();
  }
  function bulkAppend(text) {
    if (!text.trim()) return;
    selected.forEach(id => markEdited(id));
    setStocks(p => p.map(s => selected.has(s.id) ? { ...s, name: s.name + text } : s));
    toast.add(`Appended text to ${selected.size} stock${selected.size > 1 ? 's' : ''}`);
    setBulkAction(null);
    exitSelect();
  }
  function bulkPrint() {
    const ids = [...selected];
    setPrintList(p => [...new Set([...p, ...ids])]);
    toast.add(`Added ${ids.length} to print list`);
    exitSelect();
  }

  return (
    <div>
      {/* Search bar */}
      <div className="flex gap-2 mb-3">
        <Inp placeholder={catFilter === 'all' ? 'Search all stocks...' : `Search ${catFilter}...`} value={search} onChange={e => setSearch(e.target.value)} className="flex-1" />
      </div>

      {/* Toolbar row */}
      <div className="flex items-center gap-2 mb-3">
        {/* Mine / All segmented control */}
        <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid var(--border)' }}>
          <button onClick={() => setShowAll(false)}
            className="px-3 py-2 text-[12px] font-semibold transition-all active:scale-95"
            style={!showAll
              ? { background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }
              : { background: 'var(--surface-2)', color: 'var(--text-3)' }
            }>Mine</button>
          <button onClick={() => setShowAll(true)}
            className="px-3 py-2 text-[12px] font-semibold transition-all active:scale-95"
            style={{ borderLeft: '1px solid var(--border)',
              ...(showAll
                ? { background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }
                : { background: 'var(--surface-2)', color: 'var(--text-3)' })
            }}>All</button>
        </div>
        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="compact px-2 py-1.5 font-semibold rounded-lg shrink-0"
          style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)', appearance: 'auto', maxWidth: '90px' }}>
          <option value="nextFlip">Flip</option>
          <option value="added">Added</option>
          <option value="alpha">A–Z</option>
        </select>
        {hasCopies && <select value={copyFilter} onChange={e => setCopyFilter(e.target.value)}
          className="compact px-2 py-1.5 font-semibold rounded-lg shrink-0"
          style={{ color: copyFilter !== 'all' ? '#93c5fd' : 'var(--text-3)', border: copyFilter !== 'all' ? '1px solid rgba(59,130,246,0.3)' : '1px solid var(--border)', background: copyFilter !== 'all' ? 'rgba(59,130,246,0.1)' : 'var(--surface-2)', appearance: 'auto', maxWidth: '70px' }}>
          <option value="all">Copy</option>
          {copyNumbers.map(n => <option key={n} value={n}>{n}</option>)}
        </select>}
        <div className="flex-1" />
        {/* Print */}
        {(() => { const totalPrint = printList.length + (printListCrosses || []).length + (printListVirgins || []).length + (printListExps || []).length; return (
        <button onClick={onOpenPrint} title={`Print labels${totalPrint > 0 ? ` (${totalPrint})` : ''}`}
          className="relative flex items-center justify-center w-8 h-8 rounded-lg transition-all active:scale-95 shrink-0"
          style={{ background: totalPrint > 0 ? 'rgba(0,128,128,0.12)' : 'var(--surface-2)', color: totalPrint > 0 ? '#5eead4' : 'var(--text-3)', border: totalPrint > 0 ? '1px solid rgba(0,128,128,0.2)' : '1px solid var(--border)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          {totalPrint > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center" style={{ background: '#5eead4', color: '#09090b' }}>{totalPrint}</span>}
        </button>); })()}
        {/* Select */}
        <button onClick={() => { setSelectMode(m => { const next = !m; onBulkActive?.(next); return next; }); }} title="Multi-select"
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-all active:scale-95 shrink-0"
          style={selectMode
            ? { background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }
            : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }
          }>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>{selectMode && <polyline points="9 11 12 14 22 4"/>}
          </svg>
        </button>
        {/* Add */}
        <button onClick={() => setEditing({ id: null, name: '', genotype: '', category: catFilter === 'all' || catFilter === 'expanded' ? 'No Collection' : catFilter, location: '25inc', notes: '', variant: catFilter === 'expanded' ? 'expanded' : 'stock', lastFlipped: today(), createdAt: today(), maintainer: currentUser, copies: 1 })} title="Add new stock"
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-all active:scale-95 shrink-0"
          style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      {/* Collection filter chips */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-2" style={{ WebkitOverflowScrolling: 'touch', position: 'relative', zIndex: 5 }}>
        {['all', 'expanded', ...STOCK_CATS].map(cat => (
          <button key={cat} onClick={() => setCatFilter(cat)}
            className="px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
            style={catFilter === cat
              ? { background: 'rgba(0,128,128,0.15)', color: '#5eead4', border: '1px solid rgba(0,128,128,0.3)' }
              : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }
            }>{cat === 'all' ? 'All' : cat === 'expanded' ? 'Exp' : cat}</button>
        ))}
        <button onClick={() => { setAddingCat(true); setNewCatName(''); }}
          className="px-3 py-2 text-[12px] font-semibold rounded-lg transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
          style={{ background: 'var(--surface-2)', color: 'var(--accent-2)', border: '1px solid var(--border)' }}>+</button>
      </div>

      {catFilter !== 'all' && catFilter !== 'expanded' && catFilter !== 'No Collection' && filtered.length > 0 && (() => {
        const dueCount = filtered.filter(s => {
          const age = s.lastFlipped || s.createdAt ? -dFromNow(s.lastFlipped || s.createdAt) : null;
          return age !== null && age >= getFlipDays(s);
        }).length;
        const label = catFilter;
        const allStocksInCat = stocks.filter(s => (s.category || 'No Collection') === catFilter);
        const maintainers = [...new Set(allStocksInCat.map(s => s.maintainer).filter(Boolean))];
        const collMaintainer = maintainers.length === 1 ? maintainers[0] : null;
        return (
          <div className="card p-4 mb-5 cursor-pointer" onClick={() => setCollectionDetail(catFilter)}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold" style={{ color: 'var(--text-1)' }}>{label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                  {filtered.length} stock{filtered.length !== 1 ? 's' : ''}{dueCount > 0 ? ` · ${dueCount} due` : ''}
                  {collMaintainer ? ` · ${collMaintainer}` : maintainers.length > 1 ? ` · mixed` : ''}
                </p>
              </div>
              <span className="badge" style={{ background: dueCount > 0 ? 'rgba(239,68,68,0.1)' : 'var(--surface-2)', color: dueCount > 0 ? '#fca5a5' : 'var(--text-3)', border: dueCount > 0 ? '1px solid rgba(239,68,68,0.15)' : '1px solid var(--border)' }}>
                {dueCount > 0 ? `${dueCount} to flip` : 'Flip All'}
              </span>
            </div>
          </div>
        );
      })()}

      {filtered.length === 0 ? (
        <div className="text-center py-16"><p className="text-sm" style={{ color: 'var(--text-3)' }}>{stocks.length ? 'No matches' : 'No stocks yet'}</p></div>
      ) : (
        <>
          {(() => {
            const groups = [];
            const expandedStocks = filtered.filter(s => (s.variant || 'stock') === 'expanded');
            if (expandedStocks.length > 0) groups.push({ label: 'Expanded', items: expandedStocks });
            STOCK_CATS.forEach(cat => {
              const catStocks = filtered.filter(s => (s.variant || 'stock') !== 'expanded' && (s.category || 'No Collection') === cat);
              if (catStocks.length > 0) groups.push({ label: cat, items: catStocks });
            });
            return groups.map(({ label, items }) => (
              <div key={label} className="mb-8">
                <p className="section-header">{label}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {items.map(s => {
                    const isMine = !s.maintainer || s.maintainer === currentUser;
                    const age = s.lastFlipped || s.createdAt ? -dFromNow(s.lastFlipped || s.createdAt) : null;
                    const flipDays = getFlipDays(s);
                    const needsFlip = isMine && age !== null && age >= flipDays;
                    const nearFlip = isMine && age !== null && !needsFlip && age / flipDays >= 0.8;
                    const tags = stockTags(s);
                    return (
                      <div key={s.id} className="card p-4" style={{
                        ...(needsFlip ? { borderColor: 'rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.06)' } : nearFlip ? { borderColor: 'rgba(245,158,11,0.15)', background: 'rgba(245,158,11,0.06)' } : {}),
                        ...(selectMode && selected.has(s.id) ? { borderColor: 'var(--accent)', background: 'var(--accent-glow-2)', boxShadow: '0 0 20px var(--accent-glow-2)' } : {}),
                      }} onClick={() => selectMode ? toggleSelect(s.id) : setEditing({ ...s })}>
                        <div className="flex items-start gap-3">
                          {selectMode && (
                            <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-all"
                              style={selected.has(s.id)
                                ? { background: 'var(--accent)', border: '1px solid var(--accent)' }
                                : { background: 'var(--surface)', border: '1px solid var(--border-2)' }}>
                              {selected.has(s.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-[15px] font-bold" style={{ color: 'var(--text-1)' }}>{s.name}</span>
                              <TagBadges tags={tags} limit={isTouchDevice() ? 2 : undefined} />

                              {((s.copies || 1) > 1 || filtered.some(x => x.id !== s.id && x.name === s.name && (x.category || 'No Collection') === (s.category || 'No Collection'))) && <span className="badge" style={{ background: 'rgba(59,130,246,0.1)', color: '#93c5fd' }}>#{s.copies || 1}</span>}
                            </div>
                            {s.genotype && s.genotype !== '+' && <p className="text-xs mono truncate" style={{ color: 'rgba(167,139,250,0.35)' }}>{s.genotype}</p>}
                            {isMine && age !== null && (
                              <div className="mt-2">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-xs" style={{ color: needsFlip ? '#fca5a5' : nearFlip ? '#fcd34d' : 'var(--text-3)', fontWeight: (needsFlip || nearFlip) ? 500 : 400 }}>
                                    {needsFlip ? `${age}d - needs flip` : `${age}d / ${flipDays}d`}
                                  </p>
                                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>{Math.min(Math.round((age / flipDays) * 100), 100)}%</p>
                                </div>
                                <div className="w-full rounded-full overflow-hidden" style={{ height: '4px', background: 'rgba(255,255,255,0.06)' }}>
                                  <div className="h-full rounded-full transition-all" style={{
                                    width: `${Math.min((age / flipDays) * 100, 100)}%`,
                                    background: needsFlip
                                      ? 'linear-gradient(90deg, #ef4444, #fca5a5)'
                                      : nearFlip
                                        ? 'linear-gradient(90deg, #f59e0b, #fcd34d)'
                                        : 'linear-gradient(90deg, #008080, #8a9a5b)',
                                  }} />
                                </div>
                              </div>
                            )}
                          </div>
                          {!selectMode && isMine && needsFlip && (
                            <button onClick={e => { e.stopPropagation(); flipStock(s.id); }}
                              className="touch px-4 py-2 text-sm font-semibold rounded-xl transition-all active:scale-95 shrink-0"
                              style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)' }}>
                              Flip
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </>
      )}

      <StockModal stock={editing} onClose={() => setEditing(null)} stocks={stocks} setStocks={setStocks} toast={toast} onDelete={id => { setEditing(null); setDeleting(id); }} STOCK_CATS={STOCK_CATS} setCollections={setCollections} currentUser={currentUser} onTransfer={onTransfer} virginBank={virginBank} setVirginBank={setVirginBank} printList={printList} setPrintList={setPrintList} onMassAdd={() => { setEditing(null); setMassAdding(true); setMassAddText(''); setMassAddCat(catFilter === 'all' || catFilter === 'expanded' ? 'No Collection' : catFilter); setMassAddLoc('25inc'); }} expBank={expBank} setExpBank={setExpBank} />
      <Confirm open={!!deleting} onOk={doDelete} onNo={() => setDeleting(null)} title="Delete stock?" msg={(() => {
        const affectedCrosses = (crosses || []).filter(c => c.status !== 'done' && (c.parentA === deleting || c.parentB === deleting));
        if (affectedCrosses.length > 0) return `This stock is used in ${affectedCrosses.length} active cross${affectedCrosses.length > 1 ? 'es' : ''}. Deleting it will leave ${affectedCrosses.length > 1 ? 'those crosses' : 'that cross'} with a missing parent. This stock will be permanently removed.`;
        return 'This stock will be permanently removed.';
      })()} />

      {/* Mass add stocks modal */}
      <Modal open={massAdding} onClose={() => setMassAdding(false)} title="Mass Add Stocks">
        {(() => {
          const lines = massAddText.split('\n').map(l => l.trim()).filter(Boolean);
          const count = lines.length;
          return (
            <div>
              <Field label="Stock names (one per line)">
                <Txt value={massAddText} onChange={e => setMassAddText(e.target.value)} rows={6} placeholder={"BL79039\nOregon-R\nVDRC 110620\nw1118"} autoFocus={!isTouchDevice()} />
              </Field>
              <Field label="Collection">
                <select value={massAddCat} onChange={e => {
                  if (e.target.value === '__new__') {
                    const name = prompt('New collection name:');
                    if (name && name.trim() && !STOCK_CATS.includes(name.trim())) {
                      const n = name.trim();
                      const idx = STOCK_CATS.indexOf('No Collection');
                      const next = [...STOCK_CATS];
                      if (idx >= 0) next.splice(idx, 0, n); else next.push(n);
                      setCollections(next);
                      setMassAddCat(n);
                    }
                  } else { setMassAddCat(e.target.value); }
                }} className="w-full px-4 py-3 text-sm rounded-xl" style={{ background: 'var(--surface)', color: 'var(--text-1)', border: '1px solid var(--border)' }}>
                  {STOCK_CATS.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  <option value="__new__">+ New Collection</option>
                </select>
              </Field>
              <Field label="Location">
                <div className="grid grid-cols-2 gap-2">
                  {TEMPS.map(t => (
                    <div key={t} onClick={() => setMassAddLoc(t)} className={`loc-card ${massAddLoc === t ? 'selected' : ''}`}>
                      <div className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{tempFull(t)}</div>
                    </div>
                  ))}
                </div>
              </Field>
              {count > 0 && (
                <p className="text-xs mb-3" style={{ color: 'var(--accent-2)' }}>{count} stock{count !== 1 ? 's' : ''} will be added</p>
              )}
              <Btn onClick={() => {
                if (count === 0) return;
                const newStocks = lines.map(name => {
                  const s = { id: uid(), name, genotype: '', category: massAddCat, location: massAddLoc, notes: '', variant: 'stock', lastFlipped: today(), createdAt: today(), maintainer: currentUser, copies: 1 };
                  markEdited(s.id);
                  const g = guessSource(name);
                  if (g) {
                    s.source = g.source;
                    s.sourceId = g.sourceId;
                    if (g.source === 'Bloomington' && g.sourceId) s.flybaseId = `FBst${g.sourceId.replace(/\D/g, '').padStart(7, '0')}`;
                  }
                  return s;
                });
                setStocks(p => [...p, ...newStocks]);
                toast.add(`Added ${count} stock${count !== 1 ? 's' : ''}`);
                setMassAdding(false);
              }} className="w-full" disabled={count === 0}>Add {count || ''} Stock{count !== 1 ? 's' : ''}</Btn>
            </div>
          );
        })()}
      </Modal>

      {/* Access denied for deep link */}
      <Modal open={!!accessDenied} onClose={() => setAccessDenied(null)} title="Access Denied">
        <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>The stock "{accessDenied}" is maintained by another user. Switch to the correct account to view it.</p>
        <Btn v="s" onClick={() => setAccessDenied(null)} className="w-full">Close</Btn>
      </Modal>

      {/* Collection detail modal */}
      <Modal open={!!collectionDetail} onClose={() => setCollectionDetail(null)} title={collectionDetail || ''}>
        {collectionDetail && (() => {
          const allInCat = stocks.filter(s => (s.category || 'No Collection') === collectionDetail);
          const mains = [...new Set(allInCat.map(s => s.maintainer).filter(Boolean))];
          const cm = mains.length === 1 ? mains[0] : null;
          const noMaint = allInCat.some(s => !s.maintainer);
          const dueCount = allInCat.filter(s => {
            const age = s.lastFlipped || s.createdAt ? -dFromNow(s.lastFlipped || s.createdAt) : null;
            return age !== null && age >= getFlipDays(s);
          }).length;
          return (
            <div>
              <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
                {allInCat.length} stock{allInCat.length !== 1 ? 's' : ''}{dueCount > 0 ? ` · ${dueCount} due for flipping` : ''}
                {cm ? ` · Maintainer: ${cm}` : mains.length > 1 ? ` · Mixed maintainers` : ' · No maintainer'}
              </p>

              <Btn onClick={() => { setFlipCat(collectionDetail); setFlipDate(today()); setCollectionDetail(null); }} className="w-full mb-4">
                {dueCount > 0 ? `Flip All (${dueCount} due)` : 'Set All Flipped'}
              </Btn>

              {(noMaint || !cm) && (
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-3)' }}>Assign collection maintainer</p>
                  <div className="flex flex-wrap gap-1.5">
                    {USERS.map(u => (
                      <button key={u} onClick={() => {
                        const ids = new Set(allInCat.map(s => s.id));
                        ids.forEach(id => markEdited(id));
                        setStocks(p => p.map(s => ids.has(s.id) ? { ...s, maintainer: u } : s));
                        toast.add(`${u} assigned as maintainer for ${collectionDetail}`);
                        setCollectionDetail(null);
                      }}
                        className="px-3 py-1.5 text-xs rounded-lg transition-all active:scale-95 cursor-pointer"
                        style={{ background: 'rgba(0,128,128,0.08)', color: '#5eead4', border: '1px solid rgba(0,128,128,0.15)' }}>{u}</button>
                    ))}
                  </div>
                </div>
              )}

              {cm === currentUser && onTransfer && (
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-3)' }}>Transfer collection</p>
                  <div className="flex flex-wrap gap-1.5">
                    {USERS.filter(u => u !== currentUser).map(u => (
                      <button key={u} onClick={() => { onTransfer({ type: 'collection', collection: collectionDetail, name: collectionDetail, to: u }); setCollectionDetail(null); }}
                        className="px-3 py-1.5 text-xs rounded-lg transition-all active:scale-95 cursor-pointer"
                        style={{ background: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.15)' }}>{u}</button>
                    ))}
                  </div>
                </div>
              )}

              <Btn v="s" onClick={() => setCollectionDetail(null)} className="w-full">Close</Btn>
            </div>
          );
        })()}
      </Modal>

      {/* Flip all popup */}
      <Modal open={!!flipCat} onClose={() => setFlipCat(null)} title={`${typeof flipCat === 'object' ? flipCat?.cat : flipCat} - Set Last Flipped`}>
        {flipCat && (() => {
          const fc = typeof flipCat === 'object' ? flipCat : { cat: flipCat, copies: null };
          const catStocks = stocks.filter(s => (s.category || 'No Collection') === fc.cat && (fc.copies == null || Number(s.copies || 1) === fc.copies));
          const label = fc.cat + (fc.copies != null && fc.copies > 1 ? ` #${fc.copies}` : '');
          return (
            <div>
              <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>Set the last flipped date for all {catStocks.length} stocks in {label}.</p>
              <Field label="Last flipped date">
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

      {/* Add collection modal */}
      <Modal open={addingCat} onClose={() => setAddingCat(false)} title="New Collection">
        <Field label="Collection name">
          <Inp value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="e.g. Screen Stocks" autoFocus={!isTouchDevice()}
            onKeyDown={e => {
              if (e.key === 'Enter' && newCatName.trim() && !STOCK_CATS.includes(newCatName.trim())) {
                const name = newCatName.trim();
                const idx = STOCK_CATS.indexOf('No Collection');
                const next = [...STOCK_CATS];
                if (idx >= 0) next.splice(idx, 0, name); else next.push(name);
                setCollections(next);
                setCatFilter(name);
                setAddingCat(false);
                toast.add(`Collection "${name}" added`);
              }
            }} />
        </Field>
        {newCatName.trim() && STOCK_CATS.includes(newCatName.trim()) && (
          <p className="text-xs text-red-400 mb-3">Collection already exists</p>
        )}
        <div className="flex gap-2 mt-2">
          <Btn disabled={!newCatName.trim() || STOCK_CATS.includes(newCatName.trim())} onClick={() => {
            const name = newCatName.trim();
            const idx = STOCK_CATS.indexOf('No Collection');
            const next = [...STOCK_CATS];
            if (idx >= 0) next.splice(idx, 0, name); else next.push(name);
            setCollections(next);
            setCatFilter(name);
            setAddingCat(false);
            toast.add(`Collection "${name}" added`);
          }} className="flex-1">Add</Btn>
          <Btn v="s" onClick={() => setAddingCat(false)}>Cancel</Btn>
        </div>
      </Modal>

      {/* Bulk action toolbar - replaces bottom nav */}
      {selectMode && (() => {
        const dis = selected.size === 0;
        const btnCls = "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all active:scale-95 cursor-pointer";
        const disStyle = { opacity: 0.3, pointerEvents: 'none' };
        return (
          <nav className="bottom-nav" style={{ gap: '2px', padding: '4px 6px' }}>
            <span className="text-[10px] font-semibold px-2 whitespace-nowrap" style={{ color: 'var(--text-2)' }}>{selected.size || 'None'}</span>
            <div title="Select all / deselect all" onClick={selectAll} className={btnCls} style={{ color: 'var(--accent-2)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/>{selected.size === filtered.length && <polyline points="9 11 12 14 22 4"/>}</svg>
              <span className="text-[9px]">{selected.size === filtered.length ? 'None' : 'All'}</span>
            </div>
            <div title="Mark selected as flipped today" onClick={dis ? undefined : bulkFlip} className={btnCls} style={dis ? { ...disStyle, color: '#86efac' } : { color: '#86efac' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/></svg>
              <span className="text-[9px]">Flip</span>
            </div>
            <div title="Set last flip date on selected" onClick={dis ? undefined : () => { setBulkFlipDate(today()); setBulkAction('flipdate'); }} className={btnCls} style={dis ? { ...disStyle, color: '#86efac' } : { color: '#86efac' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span className="text-[9px]">Date</span>
            </div>
            <div title="Move selected to a collection" onClick={dis ? undefined : () => setBulkAction('collection')} className={btnCls} style={dis ? { ...disStyle, color: '#5eead4' } : { color: '#5eead4' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <span className="text-[9px]">Move</span>
            </div>
            <div title="Assign a maintainer to selected" onClick={dis ? undefined : () => setBulkAction('maintainer')} className={btnCls} style={dis ? { ...disStyle, color: '#a78bfa' } : { color: '#a78bfa' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span className="text-[9px]">Assign</span>
            </div>
            <div title="Append text to selected stock names" onClick={dis ? undefined : () => { setBulkAppendText(''); setBulkAction('append'); }} className={btnCls} style={dis ? { ...disStyle, color: '#fcd34d' } : { color: '#fcd34d' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span className="text-[9px]">Append</span>
            </div>
            <div title="Add +1 copy to selected stocks" onClick={dis ? undefined : bulkCopy} className={btnCls} style={dis ? { ...disStyle, color: '#93c5fd' } : { color: '#93c5fd' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span className="text-[9px]">+Copy</span>
            </div>
            <div title="Add selected to print queue" onClick={dis ? undefined : bulkPrint} className={btnCls} style={dis ? { ...disStyle, color: '#5eead4' } : { color: '#5eead4' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              <span className="text-[9px]">Print</span>
            </div>
            <div title="Delete selected stocks" onClick={dis ? undefined : () => setBulkDeleting(true)} className={btnCls} style={dis ? { ...disStyle, color: '#fca5a5' } : { color: '#fca5a5' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              <span className="text-[9px]">Delete</span>
            </div>
          </nav>
        );
      })()}

      {/* Bulk action modals */}
      <Confirm open={bulkDeleting} onOk={() => { bulkDeleteConfirmed(); }} onNo={() => setBulkDeleting(false)}
        title={`Delete ${selected.size} stock${selected.size > 1 ? 's' : ''}?`}
        msg="These stocks will be permanently removed." />

      <Modal open={bulkAction === 'collection'} onClose={() => setBulkAction(null)} title="Move to Collection">
        <div className="grid grid-cols-2 gap-2">
          {STOCK_CATS.map(cat => (
            <div key={cat} onClick={() => bulkMoveCollection(cat)} className="loc-card cursor-pointer">
              <div className="text-xs font-bold" style={{ color: 'var(--text-1)' }}>{cat}</div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal open={bulkAction === 'maintainer'} onClose={() => setBulkAction(null)} title="Assign Maintainer">
        <div className="grid grid-cols-2 gap-2">
          {USERS.map(u => (
            <div key={u} onClick={() => bulkChangeMaintainer(u)} className="loc-card cursor-pointer">
              <div className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{u}</div>
            </div>
          ))}
        </div>
      </Modal>


      <Modal open={bulkAction === 'flipdate'} onClose={() => setBulkAction(null)} title="Set Last Flip Date">
        <Field label="Date">
          <Inp type="date" value={bulkFlipDate} onChange={e => setBulkFlipDate(e.target.value)} />
        </Field>
        <Btn onClick={() => bulkSetFlipDate(bulkFlipDate)} className="w-full mt-2" disabled={!bulkFlipDate}>Set Date</Btn>
      </Modal>

      <Modal open={bulkAction === 'append'} onClose={() => setBulkAction(null)} title="Append Text to Name">
        <Field label="Text to append">
          <Inp value={bulkAppendText} onChange={e => setBulkAppendText(e.target.value)} placeholder="e.g.  (2nd gen)" autoFocus={!isTouchDevice()}
            onKeyDown={e => { if (e.key === 'Enter') bulkAppend(bulkAppendText); }} />
        </Field>
        <Btn onClick={() => bulkAppend(bulkAppendText)} className="w-full mt-2" disabled={!bulkAppendText.trim()}>Append</Btn>
      </Modal>
    </div>
  );
}

export default StocksScreen;
