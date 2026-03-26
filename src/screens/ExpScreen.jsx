import React, { useState, useMemo } from 'react';
import { Inp } from '../components/ui';

function ExpScreen({ stocks, crosses, expBank, setExpBank, toast, printListExps, setPrintListExps, deleteExpEntry }) {
  const [search, setSearch] = useState('');
  const [logMode, setLogMode] = useState('cross');
  const [editingExp, setEditingExp] = useState(null);

  const totalM = Object.values(expBank).reduce((s, e) => s + (e.m || 0), 0);
  const totalF = Object.values(expBank).reduce((s, e) => s + (e.f || 0), 0);

  const bankedEntries = useMemo(() => {
    return Object.entries(expBank)
      .filter(([, v]) => (v.m || 0) + (v.f || 0) > 0)
      .map(([id, v]) => {
        const src = v.source === 'cross'
          ? crosses.find(c => c.id === id)
          : stocks.find(s => s.id === id);
        const name = v.source === 'cross'
          ? (src ? `${(stocks.find(s => s.id === src.parentA)?.name || '?')} × ${(stocks.find(s => s.id === src.parentB)?.name || '?')}` : id)
          : (src?.name || id);
        return { id, ...v, name, srcObj: src };
      })
      .sort((a, b) => ((b.m || 0) + (b.f || 0)) - ((a.m || 0) + (a.f || 0)));
  }, [expBank, stocks, crosses]);

  function addExp(sourceId, sex, n, source) {
    setExpBank(prev => {
      const cur = prev[sourceId] || { m: 0, f: 0, source };
      return { ...prev, [sourceId]: { ...cur, [sex]: Math.max(0, (cur[sex] || 0) + n) } };
    });
    toast.add(`${n > 0 ? '+' : ''}${n} ${sex === 'm' ? '♂' : '♀'} logged`);
  }

  function clearEntry(sourceId) {
    deleteExpEntry(sourceId);
    toast.add('Cleared');
  }

  const eligibleCrosses = crosses.filter(c =>
    ['collecting progeny', 'screening', 'ripening', 'done'].includes(c.status)
  );

  return (
    <div>
      {/* Overview Card */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Experimental Animals</p>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>{totalM}♂ {totalF}♀ total</span>
        </div>
        {bankedEntries.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {bankedEntries.map(e => (
              <div key={e.id} className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(94,234,212,0.06)', border: '1px solid rgba(94,234,212,0.1)' }}>
                <div className="text-center">
                  <span className="text-lg font-bold" style={{ color: '#5eead4' }}>{(e.m || 0) + (e.f || 0)}</span>
                  <p className="text-[9px]" style={{ color: 'var(--text-3)' }}>
                    {editingExp?.id === e.id && editingExp?.sex === 'm' ? (
                      <input type="number" className="w-8 bg-transparent text-center text-[9px] outline-none font-bold"
                        style={{ color: '#93c5fd', border: '1px solid rgba(147,197,253,0.3)', borderRadius: '4px' }}
                        defaultValue={e.m || 0} autoFocus min="0"
                        onFocus={ev => ev.target.select()}
                        onBlur={ev => {
                          const val = Math.max(0, parseInt(ev.target.value) || 0);
                          setExpBank(prev => {
                            const cur = prev[e.id] || { m: 0, f: 0, source: e.source };
                            const next = { ...prev, [e.id]: { ...cur, m: val } };
                            if (val === 0 && (cur.f || 0) === 0) delete next[e.id];
                            return next;
                          });
                          setEditingExp(null);
                        }}
                        onKeyDown={ev => { if (ev.key === 'Enter') ev.target.blur(); if (ev.key === 'Escape') setEditingExp(null); }}
                      />
                    ) : (
                      <span onClick={() => setEditingExp({ id: e.id, sex: 'm' })} style={{ cursor: 'pointer' }}>{e.m || 0}</span>
                    )}♂{' '}
                    {editingExp?.id === e.id && editingExp?.sex === 'f' ? (
                      <input type="number" className="w-8 bg-transparent text-center text-[9px] outline-none font-bold"
                        style={{ color: '#f9a8d4', border: '1px solid rgba(249,168,212,0.3)', borderRadius: '4px' }}
                        defaultValue={e.f || 0} autoFocus min="0"
                        onFocus={ev => ev.target.select()}
                        onBlur={ev => {
                          const val = Math.max(0, parseInt(ev.target.value) || 0);
                          setExpBank(prev => {
                            const cur = prev[e.id] || { m: 0, f: 0, source: e.source };
                            const next = { ...prev, [e.id]: { ...cur, f: val } };
                            if (val === 0 && (cur.m || 0) === 0) delete next[e.id];
                            return next;
                          });
                          setEditingExp(null);
                        }}
                        onKeyDown={ev => { if (ev.key === 'Enter') ev.target.blur(); if (ev.key === 'Escape') setEditingExp(null); }}
                      />
                    ) : (
                      <span onClick={() => setEditingExp({ id: e.id, sex: 'f' })} style={{ cursor: 'pointer' }}>{e.f || 0}</span>
                    )}♀
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-1)' }}>{e.name}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{e.source === 'cross' ? '✕ cross' : '▪ stock'}</p>
                </div>
                <button onClick={() => { setPrintListExps(p => p.includes(e.id) ? p.filter(x => x !== e.id) : [...p, e.id]); toast.add(printListExps.includes(e.id) ? 'Removed exp label' : 'Added exp label'); }}
                  className="p-1 rounded-md transition-all active:scale-90 cursor-pointer self-start" title="Print exp label"
                  style={{ color: printListExps.includes(e.id) ? '#5eead4' : 'var(--text-3)', background: 'transparent' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                </button>
                <button onClick={() => clearEntry(e.id)} className="p-1 rounded-md transition-all active:scale-90 cursor-pointer self-start" style={{ color: 'var(--text-3)', background: 'transparent' }} title="Remove">✕</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-center py-3" style={{ color: 'var(--text-3)' }}>No experimental animals logged yet</p>
        )}
      </div>

      {/* Log Section */}
      <div className="flex items-center gap-2 mb-4">
        <p className="section-header flex-1" style={{ margin: 0 }}>Log Animals</p>
        <div className="flex gap-1">
          <button onClick={() => setLogMode('cross')} className="px-3 py-1 text-xs font-semibold rounded-lg cursor-pointer"
            style={logMode === 'cross' ? { background: 'rgba(94,234,212,0.15)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.2)' } : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>Crosses</button>
          <button onClick={() => setLogMode('stock')} className="px-3 py-1 text-xs font-semibold rounded-lg cursor-pointer"
            style={logMode === 'stock' ? { background: 'rgba(94,234,212,0.15)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.2)' } : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>Stocks</button>
        </div>
      </div>
      <Inp placeholder={logMode === 'cross' ? 'Search crosses...' : 'Search stocks...'} value={search} onChange={e => setSearch(e.target.value)} className="mb-4" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        {logMode === 'cross' ? (
          eligibleCrosses.filter(c => {
            if (!search) return true;
            const q = search.toLowerCase();
            const pA = stocks.find(s => s.id === c.parentA);
            const pB = stocks.find(s => s.id === c.parentB);
            return [pA?.name, pB?.name, c.notes || ''].some(x => (x || '').toLowerCase().includes(q));
          }).sort((a, b) => {
            const ta = (expBank[a.id]?.m || 0) + (expBank[a.id]?.f || 0);
            const tb = (expBank[b.id]?.m || 0) + (expBank[b.id]?.f || 0);
            return tb - ta;
          }).map(c => {
            const pA = stocks.find(s => s.id === c.parentA);
            const pB = stocks.find(s => s.id === c.parentB);
            const label = `${pA?.name || '?'} × ${pB?.name || '?'}`;
            const entry = expBank[c.id] || { m: 0, f: 0 };
            return (
              <div key={c.id} className="card p-4">
                <div className="flex items-center gap-3 mb-1">
                  <div className="flex-1 min-w-0">
                    <span className="text-[15px] font-bold" style={{ color: 'var(--text-1)' }}>{label}</span>
                    {((entry.m || 0) + (entry.f || 0)) > 0 && (
                      <span className="badge ml-2" style={{ background: 'rgba(94,234,212,0.12)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.15)' }}>{entry.m || 0}♂ {entry.f || 0}♀</span>
                    )}
                  </div>
                  {((entry.m || 0) + (entry.f || 0)) > 0 && (
                    <button onClick={() => clearEntry(c.id)} className="text-xs cursor-pointer" style={{ color: 'var(--text-3)' }}>clear</button>
                  )}
                </div>
                <p className="text-[10px] mb-3" style={{ color: 'var(--text-3)' }}>{c.status}</p>
                <div className="mb-2">
                  <p className="text-[10px] mb-1" style={{ color: '#93c5fd' }}>♂ Males</p>
                  <div className="flex gap-2">
                    <button onClick={() => addExp(c.id, 'm', -1, 'cross')} className="qlog-btn flex-1" disabled={(entry.m || 0) <= 0} style={(entry.m || 0) <= 0 ? { opacity: 0.3 } : {}}>-1</button>
                    {[1, 3, 5].map(n => <button key={n} onClick={() => addExp(c.id, 'm', n, 'cross')} className="qlog-btn flex-1">+{n}</button>)}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] mb-1" style={{ color: '#f9a8d4' }}>♀ Females</p>
                  <div className="flex gap-2">
                    <button onClick={() => addExp(c.id, 'f', -1, 'cross')} className="qlog-btn flex-1" disabled={(entry.f || 0) <= 0} style={(entry.f || 0) <= 0 ? { opacity: 0.3 } : {}}>-1</button>
                    {[1, 3, 5].map(n => <button key={n} onClick={() => addExp(c.id, 'f', n, 'cross')} className="qlog-btn flex-1">+{n}</button>)}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          stocks.filter(s => !search || [s.name, s.genotype || ''].some(x => x.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => {
            const ta = (expBank[a.id]?.m || 0) + (expBank[a.id]?.f || 0);
            const tb = (expBank[b.id]?.m || 0) + (expBank[b.id]?.f || 0);
            return tb - ta;
          }).map(s => {
            const entry = expBank[s.id] || { m: 0, f: 0 };
            return (
              <div key={s.id} className="card p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[15px] font-bold" style={{ color: 'var(--text-1)' }}>{s.name}</span>
                    {((entry.m || 0) + (entry.f || 0)) > 0 && (
                      <span className="badge ml-2" style={{ background: 'rgba(94,234,212,0.12)', color: '#5eead4', border: '1px solid rgba(94,234,212,0.15)' }}>{entry.m || 0}♂ {entry.f || 0}♀</span>
                    )}
                  </div>
                  {((entry.m || 0) + (entry.f || 0)) > 0 && (
                    <button onClick={() => clearEntry(s.id)} className="text-xs cursor-pointer" style={{ color: 'var(--text-3)' }}>clear</button>
                  )}
                </div>
                <div className="mb-2">
                  <p className="text-[10px] mb-1" style={{ color: '#93c5fd' }}>♂ Males</p>
                  <div className="flex gap-2">
                    <button onClick={() => addExp(s.id, 'm', -1, 'stock')} className="qlog-btn flex-1" disabled={(entry.m || 0) <= 0} style={(entry.m || 0) <= 0 ? { opacity: 0.3 } : {}}>-1</button>
                    {[1, 3, 5].map(n => <button key={n} onClick={() => addExp(s.id, 'm', n, 'stock')} className="qlog-btn flex-1">+{n}</button>)}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] mb-1" style={{ color: '#f9a8d4' }}>♀ Females</p>
                  <div className="flex gap-2">
                    <button onClick={() => addExp(s.id, 'f', -1, 'stock')} className="qlog-btn flex-1" disabled={(entry.f || 0) <= 0} style={(entry.f || 0) <= 0 ? { opacity: 0.3 } : {}}>-1</button>
                    {[1, 3, 5].map(n => <button key={n} onClick={() => addExp(s.id, 'f', n, 'stock')} className="qlog-btn flex-1">+{n}</button>)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {(logMode === 'cross' ? eligibleCrosses.length : stocks.length) === 0 && (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>{logMode === 'cross' ? 'No crosses in screening/collecting stage yet' : 'Add stocks first'}</p>
        </div>
      )}
    </div>
  );
}

export default ExpScreen;
