import React, { useState, useEffect } from 'react';
import { Modal, Btn, Inp, Txt, Field, TagBadges } from './ui';
import { TEMPS, VCS_DEFAULTS } from '../utils/constants.js';
import { today } from '../utils/dates.js';
import { uid, sn, tempLabel, tempFull, stockTags, isTouchDevice } from '../utils/helpers.js';
import { markEdited } from '../utils/supabase.js';
import { makeVcs, vcsKey } from '../utils/vcs.js';

function NewCrossWizard({ open, onClose, stocks, setCrosses, toast, virginBank, setVirginBank, preselectedVirgin, virginsPerCross, currentUser }) {
  const [step, setStep] = useState(1);
  const [parentA, setParentA] = useState(null);
  const [parentB, setParentB] = useState(null);
  const [temperature, setTemperature] = useState('25inc');
  const [targetCount, setTargetCount] = useState('');
  const [experimentType, setExperimentType] = useState('optogenetics');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [search, setSearch] = useState('');
  const [overnightAt18, setOvernightAt18] = useState(true);

  useEffect(() => {
    if (open) {
      setTemperature('25inc');
      setExperimentType(''); setNotes(''); setShowNotes(false); setSearch(''); setOvernightAt18(true);
      if (preselectedVirgin) {
        const stock = stocks.find(s => s.id === preselectedVirgin);
        setParentA(stock || null);
        setParentB(null);
        setStep(stock ? 2 : 1);
        setTargetCount('15');
      } else {
        setStep(1); setParentA(null); setParentB(null); setTargetCount('');
      }
    }
  }, [open]);

  if (!open) return null;

  const filteredStocks = stocks.filter(s =>
    !search || [s.name, s.genotype, s.notes || '', s.sourceId || '', s.flybaseId || '', ...stockTags(s)].some(x => x.toLowerCase().includes(search.toLowerCase()))
  );

  function finish() {
    const needed = virginsPerCross || 5;
    const available = virginBank?.[parentA.id] || 0;
    let initialStatus = 'waiting for virgins';
    let msg = 'Cross created - waiting for virgins';

    if (available >= needed) {
      setVirginBank(prev => ({ ...prev, [parentA.id]: (prev[parentA.id] || 0) - needed }));
      initialStatus = 'waiting for progeny';
      msg = `Cross created - used ${needed} banked virgins`;
    }

    const cross = {
      id: uid(), parentA: parentA.id, parentB: parentB.id, temperature,
      setupDate: today(), status: initialStatus, notes, overnightAt18,
      targetCount: parseInt(targetCount) || 0, collected: [], vials: [],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType, experimentDate: '', retinalStartDate: '',
      owner: currentUser,
      ...(initialStatus === 'waiting for progeny' ? { waitStartDate: today() } : {}),
    };
    markEdited(cross.id);
    setCrosses(p => [...p, cross]);
    toast.add(msg);
    onClose();
  }

  function StockList({ onPick, exclude }) {
    return (
      <div>
        <Inp placeholder="Search stocks..." value={search} onChange={e => setSearch(e.target.value)} className="mb-3" autoFocus={!isTouchDevice()} />
        {filteredStocks.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--text-3)' }}>No stocks found</p>
        ) : (
          <div className="grid gap-1 max-h-[50vh] overflow-y-auto">
            {filteredStocks.filter(s => !exclude || s.id !== exclude).map(s => {
              const tags = stockTags(s);
              return (
                <div key={s.id} onClick={() => { onPick(s); setSearch(''); }} className="stock-pick card-inner">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-bold" style={{ color: 'var(--text-1)' }}>{s.name}</span>
                    <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>{tempLabel(s.location)}</span>
                    <TagBadges tags={tags} limit={isTouchDevice() ? 2 : undefined} />
                  </div>
                  {s.genotype && s.genotype !== '+' && <p className="text-xs mono truncate mt-1" style={{ color: 'rgba(167,139,250,0.4)' }}>{s.genotype}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const DEFAULT_TARGETS = { optogenetics: 30, '2p': 15, '2p+vr': 15, behavior: 20, flydisco: 20, vr: 15, dissection: 10, other: 15, '': 15 };
  function onExpTypeChange(val) {
    setExperimentType(val);
    if (!targetCount || targetCount === String(DEFAULT_TARGETS[experimentType] || 15)) {
      setTargetCount(String(DEFAULT_TARGETS[val] || 15));
    }
  }
  const titles = { 1: 'Pick ♀ virgin parent', 2: 'Pick ♂ male parent', 3: 'Pick location', 4: 'Details (optional)' };

  return (
    <Modal open={open} onClose={onClose} title={titles[step]}>
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mb-5">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className="rounded-full transition-all" style={{
            width: s === step ? 24 : 8,
            height: 8,
            background: s === step ? 'var(--accent)' : s < step ? 'rgba(139,92,246,0.4)' : 'var(--surface-3)',
            boxShadow: s === step ? '0 0 12px var(--accent-glow)' : 'none',
          }} />
        ))}
      </div>

      {step === 1 && (
        <div>
          {stocks.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-3)' }}>Add stocks first</p>
          ) : (
            <StockList onPick={s => { setParentA(s); setStep(2); }} />
          )}
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="card-inner px-4 py-3 mb-4 flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>♀</span>
            <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{parentA?.name}</span>
            <button onClick={() => setStep(1)} className="ml-auto text-xs touch" style={{ color: 'var(--accent-2)' }}>change</button>
          </div>
          <StockList onPick={s => { setParentB(s); setStep(3); }} exclude={parentA?.id} />
        </div>
      )}

      {step === 3 && (
        <div>
          <div className="card-inner px-4 py-3 mb-4">
            <div className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{parentA?.name} <span style={{ color: 'var(--text-3)' }}>×</span> {parentB?.name}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {TEMPS.map(t => (
              <div key={t} onClick={() => setTemperature(t)} className={`loc-card ${temperature === t ? 'selected' : ''}`}>
                <div className="text-base font-bold mb-0.5" style={{ color: 'var(--text-1)' }}>{tempFull(t)}</div>
              </div>
            ))}
          </div>
          <Btn onClick={() => setStep(4)} className="w-full">Next</Btn>
        </div>
      )}

      {step === 4 && (
        <div>
          <div className="card-inner px-4 py-3 mb-4">
            <div className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{parentA?.name} <span style={{ color: 'var(--text-3)' }}>×</span> {parentB?.name}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{tempFull(temperature)} · Setup today</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target count"><Inp type="number" min="0" value={targetCount} onChange={e => setTargetCount(e.target.value)} placeholder="0" /></Field>
            <Field label="Experiment type">
              <select value={experimentType} onChange={e => onExpTypeChange(e.target.value)}
                className="w-full px-4 py-3 text-sm rounded-xl">
                <option value="optogenetics">Optogenetics</option>
                <option value="2p">2P</option>
                <option value="2p+vr">2P + VR</option>
                <option value="behavior">Behaviour</option>
    
                <option value="flydisco">FlyDisco</option>
                <option value="vr">VR</option>
                <option value="dissection">Dissection / Immunostaining</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>
          <div className="mb-3">
            <button onClick={() => setOvernightAt18(!overnightAt18)}
              className="w-full px-4 py-2.5 text-xs font-semibold rounded-xl transition-all active:scale-[0.97] cursor-pointer"
              style={overnightAt18
                ? { background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }
                : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
              {overnightAt18 ? '18°C overnight - virgins in morning' : 'Room temp overnight - discard in morning'}
            </button>
            <p className="text-[10px] mt-1 text-center" style={{ color: 'var(--text-3)' }}>{overnightAt18 ? '16h virgin window' : '8h virgin window'}</p>
          </div>
          {!showNotes ? (
            <button onClick={() => setShowNotes(true)} className="text-xs mb-4 touch" style={{ color: 'var(--accent-2)' }}>+ add notes</button>
          ) : (
            <Field label="Notes"><Txt value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." /></Field>
          )}
          <Btn onClick={finish} className="w-full">Create Cross</Btn>
          <p className="text-[11px] text-center mt-3" style={{ color: 'var(--text-3)' }}>Setup date = today, timeline auto-calculated</p>
        </div>
      )}

      {step > 1 && (
        <button onClick={() => setStep(step - 1)} className="text-xs mt-3 touch block mx-auto" style={{ color: 'var(--text-3)' }}>← Back</button>
      )}
    </Modal>
  );
}

/* ========== ERROR BOUNDARY ========== */
export default NewCrossWizard;
