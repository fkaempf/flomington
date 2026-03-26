import React, { useState, useMemo } from 'react';
import { Inp } from '../components/ui';

function VirginsScreen({ stocks, virginBank, setVirginBank, toast, onStartCross, printListVirgins, setPrintListVirgins }) {
  const [search, setSearch] = useState('');
  const [editingVirginId, setEditingVirginId] = useState(null);
  const stocksWithVirgins = useMemo(() => {
    return stocks.map(s => ({
      ...s,
      count: virginBank[s.id] || 0,
    })).sort((a, b) => b.count - a.count);
  }, [stocks, virginBank]);

  function addVirgins(stockId, n) {
    setVirginBank(prev => ({ ...prev, [stockId]: (prev[stockId] || 0) + n }));
    toast.add(`+${n} virgins logged`);
  }

  function clearStock(stockId) {
    setVirginBank(prev => { const next = { ...prev }; delete next[stockId]; return next; });
    toast.add('Cleared');
  }

  const totalVirgins = Object.values(virginBank).reduce((s, n) => s + n, 0);

  const bankedStocks = useMemo(() => stocksWithVirgins.filter(s => s.count > 0), [stocksWithVirgins]);

  return (
    <div>
      {/* Virgin Bank Overview */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Virgin Bank</p>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>{totalVirgins} total</span>
        </div>
        {bankedStocks.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {bankedStocks.map(s => (
              <div key={s.id} className="flex items-center gap-2 p-3 rounded-xl transition-all" style={{ background: 'rgba(249,168,212,0.06)', border: '1px solid rgba(249,168,212,0.1)' }}>
                {editingVirginId === s.id ? (
                  <input type="number" className="text-xl font-bold w-12 bg-transparent text-center outline-none"
                    style={{ color: '#f9a8d4', border: '1px solid rgba(249,168,212,0.3)', borderRadius: '6px' }}
                    defaultValue={virginBank[s.id]} autoFocus min="0"
                    onFocus={e => e.target.select()}
                    onBlur={e => {
                      const val = Math.max(0, parseInt(e.target.value) || 0);
                      if (val === 0) { setVirginBank(prev => { const next = {...prev}; delete next[s.id]; return next; }); }
                      else setVirginBank(prev => ({...prev, [s.id]: val}));
                      setEditingVirginId(null);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingVirginId(null); }}
                  />
                ) : (
                  <span className="text-xl font-bold" onClick={() => setEditingVirginId(s.id)} style={{ color: '#f9a8d4', cursor: 'pointer' }}>{s.count}</span>
                )}
                <div className="flex-1 min-w-0 cursor-pointer active:scale-95" onClick={() => onStartCross?.(s.id)}>
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-1)' }}>{s.name}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>♀ banked · tap to cross</p>
                </div>
                <button onClick={() => { setPrintListVirgins(p => p.includes(s.id) ? p.filter(x => x !== s.id) : [...p, s.id]); toast.add(printListVirgins.includes(s.id) ? 'Removed virgin label' : 'Added virgin label'); }}
                  className="p-1 rounded-md transition-all active:scale-90 cursor-pointer self-start" title="Print virgin label"
                  style={{ color: printListVirgins.includes(s.id) ? '#5eead4' : 'var(--text-3)', background: 'transparent' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                </button>
                <button onClick={() => clearStock(s.id)} className="p-1 rounded-md transition-all active:scale-90 cursor-pointer self-start" style={{ color: 'var(--text-3)', background: 'transparent' }} title="Remove">✕</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-center py-3" style={{ color: 'var(--text-3)' }}>No virgins banked yet</p>
        )}
      </div>

      {/* Log Virgins */}
      <p className="section-header">Log Virgins</p>
      <Inp placeholder="Search stocks..." value={search} onChange={e => setSearch(e.target.value)} className="mb-4" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        {stocks.filter(s => !search || [s.name, s.genotype || ''].some(x => x.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => (virginBank[b.id] || 0) - (virginBank[a.id] || 0)).map(s => {
          const count = virginBank[s.id] || 0;
          return (
            <div key={s.id} className="card p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <span className="text-[15px] font-bold" style={{ color: 'var(--text-1)' }}>{s.name}</span>
                  {count > 0 && <span className="badge ml-2" style={{ background: 'rgba(249,168,212,0.12)', color: '#f9a8d4', border: '1px solid rgba(249,168,212,0.15)' }}>{count} ♀</span>}
                </div>
                {count > 0 && (
                  <button onClick={() => clearStock(s.id)} className="text-xs cursor-pointer" style={{ color: 'var(--text-3)' }}>clear</button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => addVirgins(s.id, -1)} className="qlog-btn flex-1" disabled={count <= 0} style={count <= 0 ? { opacity: 0.3 } : {}}>-1</button>
                {[1, 3, 5].map(n => (
                  <button key={n} onClick={() => addVirgins(s.id, n)} className="qlog-btn flex-1">+{n}</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {stocks.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>Add stocks first to track virgins</p>
        </div>
      )}
    </div>
  );
}

/* ========== EXP SCREEN ========== */
export default VirginsScreen;
