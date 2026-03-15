import React, { useState, useRef } from 'react';
import { Modal, Btn, Inp, Txt, Field, Confirm } from '../components/ui';
import { USERS, BG_TYPES, BG_LABELS } from '../utils/constants.js';
import { today } from '../utils/dates.js';
import { cl, calcTL, getTL, dlICS, hashPin, uid } from '../utils/helpers.js';
import useLS from '../hooks/useLS.js';
import { supabasePush, supabasePull, mergeStocks, mergeCrosses, resetSb, SUPABASE_URL, SUPABASE_KEY } from '../utils/supabase.js';
import { makeDemoData } from '../utils/demo.js';

function VirginNotifSettings({ toast }) {
  const [vcsNotify, setVcsNotify] = useLS('flo-vcs-notify', true);
  const [vcsRemindMin, setVcsRemindMin] = useLS('flo-vcs-remind-min', 15);
  const [vcsOverdueMin, setVcsOverdueMin] = useLS('flo-vcs-overdue-min', 30);
  const requestPerm = (onGranted) => {
    if (!('Notification' in window)) { toast.add('Notifications not supported'); return; }
    if (Notification.permission === 'denied') { toast.add('Notifications blocked - enable in browser settings'); return; }
    if (Notification.permission === 'default') { Notification.requestPermission().then(p => { if (p === 'granted') onGranted(); else toast.add('Permission denied'); }); }
    else onGranted();
  };
  return (
    <div className="card p-5">
      <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-1)' }}>Virgin Collection Notifications</p>
      <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>Alerts for VCS collection schedules and deadlines.</p>
      <div className="space-y-3">
        <button onClick={() => {
          if (!vcsNotify) requestPerm(() => { setVcsNotify(true); toast.add('Notifications enabled'); });
          else { setVcsNotify(false); toast.add('Notifications disabled'); }
        }}
          className="w-full px-4 py-2.5 text-sm font-semibold rounded-xl transition-all active:scale-[0.97]"
          style={vcsNotify ? { background: 'rgba(34,197,94,0.1)', color: '#86efac', border: '1px solid rgba(34,197,94,0.2)' } : { background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
          {vcsNotify ? 'Notifications Enabled' : 'Enable Notifications'}
        </button>
        {vcsNotify && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Remind before (min)">
              <Inp type="number" min="1" max="60" value={vcsRemindMin} onChange={e => setVcsRemindMin(Math.max(1, parseInt(e.target.value) || 15))} />
            </Field>
            <Field label="Overdue after (min)">
              <Inp type="number" min="5" max="120" value={vcsOverdueMin} onChange={e => setVcsOverdueMin(Math.max(5, parseInt(e.target.value) || 30))} />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}

/* ========== SETTINGS SCREEN ========== */
function SettingsScreen({ stocks, crosses, setStocks, setCrosses, toast, bgEffect, setBgEffect, virginsPerCross, setVirginsPerCross, setVirginBank, setExpBank, setTransfers, setCollections, sbUrl, setSbUrl, sbKey, setSbKey, sbConfigured, syncStatus, setSyncStatus, currentUser, demoMode, setIsDemoMode }) {
  const fileRef = useRef(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmLoadDemo, setConfirmLoadDemo] = useState(false);
  const [confirmResetPin, setConfirmResetPin] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  function adminPinGate(onSuccess) {
    const floHash = localStorage.getItem('flo-pin-Flo');
    if (!floHash) { toast.add('Flo has no PIN set'); return; }
    hashPin(adminPinInput).then(h => {
      if (h === floHash) { setAdminUnlocked(true); setAdminPinInput(''); if (onSuccess) onSuccess(); }
      else { toast.add('Wrong PIN'); setAdminPinInput(''); }
    });
  }

  function exportJSON() {
    const d = JSON.stringify({ stocks, crosses, exportedAt: new Date().toISOString() }, null, 2);
    const b = new Blob([d], { type: 'application/json' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u; a.download = `flomington-${today()}.json`; a.click();
    URL.revokeObjectURL(u);
    toast.add('Backup exported');
  }

  function importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.add('File too large (max 10 MB)'); e.target.value = ''; return; }
    const r = new FileReader();
    r.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if (d.stocks && !Array.isArray(d.stocks)) { toast.add('Invalid file: stocks is not an array'); return; }
        if (d.crosses && !Array.isArray(d.crosses)) { toast.add('Invalid file: crosses is not an array'); return; }
        if (!d.stocks && !d.crosses) { toast.add('Invalid file: no stocks or crosses found'); return; }
        setPendingImport(d);
      } catch { toast.add('Invalid JSON file'); }
    };
    r.readAsText(file);
    e.target.value = '';
  }

  function applyImport() {
    if (!pendingImport) return;
    if (pendingImport.stocks) setStocks(pendingImport.stocks);
    if (pendingImport.crosses) setCrosses(pendingImport.crosses);
    toast.add('Data imported');
    setPendingImport(null);
  }

  function exportAllICS() {
    const ev = [];
    crosses.forEach(c => {
      const tl = getTL(c);
      const lb = cl(c, stocks);
      ev.push(
        { date: tl.virginStart, title: `Virgins start: ${lb}`, desc: '' },
        { date: tl.progenyStart, title: `Progeny start: ${lb}`, desc: '' },
      );
      if (c.experimentDate) ev.push({ date: c.experimentDate, title: `Experiment: ${lb}`, desc: c.experimentType || '' });
      (c.vials || []).forEach((v, i) => {
        const vt = calcTL(v.setupDate, c.temperature);
        ev.push(
          { date: vt.virginStart, title: `Virgins V${i + 2}: ${lb}`, desc: '' },
          { date: vt.progenyStart, title: `Progeny V${i + 2}: ${lb}`, desc: '' },
        );
      });
    });
    if (!ev.length) { toast.add('No events to export'); return; }
    dlICS(ev, `flo-all-${today()}.ics`);
    toast.add('Calendar exported');
  }

  function loadDemo() {
    demoMode.current = true;
    if (setIsDemoMode) setIsDemoMode(true);
    const d = makeDemoData();
    setStocks(d.stocks);
    setCrosses(d.crosses);
    if (d.virginBank && setVirginBank) setVirginBank(d.virginBank);
    if (d.expBank && setExpBank) setExpBank(d.expBank);
    if (d.transfers && setTransfers) setTransfers(d.transfers);
    if (d.collections && setCollections) setCollections(d.collections);
    toast.add('Demo data loaded - sync paused until reload');
  }

  function clearAll() {
    setStocks([]);
    setCrosses([]);
    if (setExpBank) setExpBank({});
    toast.add('All data cleared');
  }

  function changePin() {
    USERS.forEach(u => localStorage.removeItem(`flo-pin-${u}`));
    if (sbConfigured) {
      supabasePush(stocks, crosses, []).then(() => window.location.reload()).catch(() => window.location.reload());
    } else {
      window.location.reload();
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      <div className="card p-5">
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-1)' }}>Virgins Per Cross</p>
        <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>Number of virgins used when starting a cross from the bank.</p>
        <div className="flex items-center gap-3">
          <button onClick={() => setVirginsPerCross(Math.max(1, virginsPerCross - 1))}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold cursor-pointer"
            style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}>-</button>
          <span className="text-2xl font-bold flex-1 text-center" style={{ color: 'var(--text-1)' }}>{virginsPerCross}</span>
          <button onClick={() => setVirginsPerCross(virginsPerCross + 1)}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold cursor-pointer"
            style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}>+</button>
        </div>
      </div>

      {currentUser === 'Flo' && !adminUnlocked && (
      <div className="card p-5">
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-1)' }}>Admin</p>
        <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>Unlock with Flo's PIN to access sync, import/export, and data management.</p>
        <div className="flex gap-2">
          <Inp type="password" inputMode="numeric" maxLength="4" pattern="[0-9]*" value={adminPinInput} onChange={e => setAdminPinInput(e.target.value.replace(/\D/g, ''))} onKeyDown={e => { if (e.key === 'Enter') adminPinGate(); }} placeholder="PIN" style={{ width: 80, textAlign: 'center', letterSpacing: '0.3em' }} />
          <Btn v="s" onClick={() => adminPinGate()}>Unlock</Btn>
        </div>
      </div>
      )}

      <VirginNotifSettings toast={toast} />

      <div className="card p-5">
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-1)' }}>Calendar Export</p>
        <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>All cross milestones as .ics file.</p>
        <Btn v="s" onClick={exportAllICS} className="w-full">Export All (.ics)</Btn>
      </div>

      <div className="card p-5">
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-1)' }}>Background Effect</p>
        <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>Choose an animated background.</p>
        <div className="grid grid-cols-3 gap-2">
          {BG_TYPES.map(t => (
            <button key={t} onClick={() => setBgEffect(t)}
              className="px-3 py-2.5 text-xs font-semibold rounded-xl transition-all active:scale-95 cursor-pointer"
              style={bgEffect === t
                ? { background: 'var(--accent-glow)', color: 'var(--accent-2)', border: '1px solid rgba(139,92,246,0.3)' }
                : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }
              }>{BG_LABELS[t]}</button>
          ))}
        </div>
      </div>

      {currentUser === 'Flo' && adminUnlocked && (
      <>
      <div className="card p-5">
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-1)' }}>Supabase Sync</p>
        <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>Sync stocks, crosses &amp; PINs to Supabase.</p>
        <Inp value={sbUrl || SUPABASE_URL} onChange={e => { setSbUrl(e.target.value); resetSb(); }} placeholder="Supabase project URL" className="mb-2" />
        <Inp value={sbKey || SUPABASE_KEY} onChange={e => { setSbKey(e.target.value); resetSb(); }} placeholder="Supabase anon key" type="password" className="mb-2" />
        {sbConfigured && (
          <div className="flex gap-2 mb-2">
            <Btn v="s" onClick={() => {
              setSyncStatus('Pushing...');
              const pins = USERS.map(u => { const h = localStorage.getItem(`flo-pin-${u}`); return h ? { user: u, hash: h } : null; }).filter(Boolean);
              supabasePush(stocks, crosses, pins).then(r => {
                setSyncStatus('Pushed ' + (r.stockCount || 0) + ' stocks, ' + (r.crossCount || 0) + ' crosses');
                toast.add('Data pushed to Supabase');
              }).catch(e => { setSyncStatus('Push failed'); toast.add('Push failed: ' + e.message); });
            }} className="flex-1">Push</Btn>
            <Btn v="s" onClick={() => {
              setSyncStatus('Pulling...');
              supabasePull().then(remote => {
                if (remote.stocks) setStocks(local => mergeStocks(local, remote.stocks));
                if (remote.crosses) setCrosses(local => mergeCrosses(local, remote.crosses));
                if (remote.pins) remote.pins.forEach(p => { if (p.user && p.hash && !localStorage.getItem(`flo-pin-${p.user}`)) localStorage.setItem(`flo-pin-${p.user}`, p.hash); });
                setSyncStatus('Pulled ' + (remote.stocks || []).length + ' stocks, ' + (remote.crosses || []).length + ' crosses');
                toast.add('Data pulled from Supabase');
              }).catch(e => { setSyncStatus('Pull failed'); toast.add('Pull failed: ' + e.message); });
            }} className="flex-1">Pull</Btn>
          </div>
        )}
        {syncStatus && <p className="text-xs" style={{ color: 'var(--text-3)' }}>{syncStatus}</p>}
      </div>

      <div className="card p-5">
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-1)' }}>Export Backup</p>
        <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>Download all data as JSON.</p>
        <Btn v="s" onClick={exportJSON} className="w-full">Export JSON</Btn>
      </div>

      <div className="card p-5">
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-1)' }}>Import Backup</p>
        <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>Load from a JSON backup. Replaces current data.</p>
        <input type="file" accept=".json" ref={fileRef} onChange={importJSON} className="hidden" />
        <Btn v="s" onClick={() => fileRef.current.click()} className="w-full">Import JSON</Btn>
      </div>

      <div className="card p-5">
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-1)' }}>Demo Data</p>
        <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>Load sample stocks and crosses.</p>
        <Btn v="s" onClick={() => setConfirmLoadDemo(true)} className="w-full">Load Demo Data</Btn>
      </div>

      <div className="card p-5">
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-1)' }}>Clear All Data</p>
        <Btn v="d" onClick={() => setConfirmClearAll(true)} className="w-full mt-2">Clear Everything</Btn>
      </div>
      </>
      )}

      <div className="card p-5">
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-1)' }}>Change PIN</p>
        <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>Reset and set a new PIN.</p>
        <Btn v="s" onClick={() => setConfirmResetPin(true)} className="w-full">Reset PIN</Btn>
      </div>

      <p className="text-[10px] text-center mt-4 mb-2" style={{ color: 'var(--text-3)' }}>Flomington</p>

      <Confirm open={confirmClearAll} onOk={() => { setConfirmClearAll(false); clearAll(); }} onNo={() => setConfirmClearAll(false)}
        title="Clear all data?" msg="This will permanently delete all stocks, crosses, and experiment data." />
      <Confirm open={confirmLoadDemo} onOk={() => { setConfirmLoadDemo(false); loadDemo(); }} onNo={() => setConfirmLoadDemo(false)}
        title="Load demo data?" msg="This will replace all current data. Sync will pause until you reload." okLabel="Load Demo" />
      <Confirm open={confirmResetPin} onOk={() => { setConfirmResetPin(false); changePin(); }} onNo={() => setConfirmResetPin(false)}
        title="Reset all user PINs?" msg="Everyone will need to set new PINs." okLabel="Reset" />
      <Confirm open={!!pendingImport} onOk={() => { applyImport(); }} onNo={() => setPendingImport(null)}
        title="Import data?" msg={`This will replace your current data with ${pendingImport ? (pendingImport.stocks?.length || 0) + ' stocks and ' + (pendingImport.crosses?.length || 0) + ' crosses' : ''} from the backup file.`} okLabel="Import" />

    </div>
  );
}

/* ========== MAIN APP ========== */
/* ========== BACKGROUND EFFECTS ========== */

export default SettingsScreen;
