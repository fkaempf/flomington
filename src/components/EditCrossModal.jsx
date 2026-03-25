import React, { useState, useEffect } from 'react';
import { Modal, Btn, Inp, Txt, Field } from './ui';
import { TEMPS } from '../utils/constants.js';
import { sn, tempFull } from '../utils/helpers.js';
import { markEdited } from '../utils/supabase.js';

function EditCrossModal({ open, onClose, cross, stocks, setCrosses, toast, allCrosses }) {
  const [f, setF] = useState({});
  const [showAdv, setShowAdv] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    if (open && cross) {
      setF({ ...cross });
      setShowNotes(!!cross.notes);
      setShowAdv(!!cross.manualFlipDate || !!cross.manualEcloseDate || !!cross.manualVirginDate || cross.crossType === 'sequential');
    }
  }, [open, cross?.id]);

  if (!open) return null;

  function save() {
    markEdited(cross.id);
    setCrosses(p => p.map(c => c.id === cross.id ? { ...c, ...f } : c));
    toast.add('Cross updated');
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Cross">
      <Field label="Virgin parent">
        <div className="card-inner px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{sn(stocks, f.parentA)}</div>
      </Field>
      <Field label="Male parent">
        <div className="card-inner px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{sn(stocks, f.parentB)}</div>
      </Field>
      <Field label="Location">
        <div className="grid grid-cols-2 gap-2">
          {TEMPS.map(t => (
            <div key={t} onClick={() => setF({ ...f, temperature: t })} className={`loc-card ${f.temperature === t ? 'selected' : ''}`}>
              <div className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{tempFull(t)}</div>
            </div>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target count"><Inp type="number" min="0" value={f.targetCount || ''} onChange={e => setF({ ...f, targetCount: parseInt(e.target.value) || 0 })} /></Field>
        <Field label="Experiment type">
          <select value={f.experimentType || ''} onChange={e => setF({ ...f, experimentType: e.target.value })}
            className="w-full px-4 py-3 text-sm rounded-xl">
            <option value="">None</option>
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
      {f.experimentType && <Field label="Experiment date"><Inp type="date" value={f.experimentDate || ''} onChange={e => setF({ ...f, experimentDate: e.target.value })} /></Field>}
      {!showNotes ? (
        <button onClick={() => setShowNotes(true)} className="text-xs mb-4 touch" style={{ color: 'var(--accent-2)' }}>+ add notes</button>
      ) : (
        <Field label="Notes"><Txt value={f.notes || ''} onChange={e => setF({ ...f, notes: e.target.value })} rows={2} /></Field>
      )}
      <button onClick={() => setShowAdv(!showAdv)} className="text-xs mb-3 touch" style={{ color: 'var(--text-3)' }}>{showAdv ? 'Hide' : 'Show'} advanced</button>
      {showAdv && (
        <div className="card-inner p-4 mb-4">
          <p className="text-[11px] mb-3" style={{ color: 'var(--text-3)' }}>Override calculated dates:</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Flip"><Inp type="date" value={f.manualFlipDate || ''} onChange={e => setF({ ...f, manualFlipDate: e.target.value })} /></Field>
            <Field label="Virgin"><Inp type="date" value={f.manualVirginDate || ''} onChange={e => setF({ ...f, manualVirginDate: e.target.value })} /></Field>
            <Field label="Eclose"><Inp type="date" value={f.manualEcloseDate || ''} onChange={e => setF({ ...f, manualEcloseDate: e.target.value })} /></Field>
          </div>
          <Field label="Cross type">
            <select value={f.crossType || 'simple'} onChange={e => setF({ ...f, crossType: e.target.value })}
              className="w-full px-4 py-3 text-sm rounded-xl">
              <option value="simple">Simple</option>
              <option value="sequential">Sequential (F1 cross)</option>
            </select>
          </Field>
          <Field label="Setup date"><Inp type="date" value={f.setupDate || ''} onChange={e => setF({ ...f, setupDate: e.target.value })} /></Field>
        </div>
      )}
      <div className="flex gap-2">
        <Btn onClick={save} className="flex-1">Save</Btn>
        <Btn v="s" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

/* ========== NEW CROSS WIZARD ========== */
export default EditCrossModal;
