import React, { useState, useEffect } from 'react';
import { USERS } from '../utils/constants.js';
import { hashPin } from '../utils/helpers.js';

export default function PinLock({ onUnlock, user, onSelectUser, onPinSet }) {
  const [mode, setMode] = useState(() => {
    if (!user) return 'select';
    if (!localStorage.getItem(`flo-pin-${user}`)) return 'setup';
    return 'enter';
  });
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);

  function shake() { setShaking(true); setTimeout(() => setShaking(false), 500); }

  useEffect(() => {
    if (mode === 'select') return;
    function onKeyDown(e) {
      if (e.key >= '0' && e.key <= '9') handleKey(e.key);
      else if (e.key === 'Backspace') handleDel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function handleKey(n) {
    if (mode === 'setup') {
      if (confirm.length > 0 || pin.length === 4) {
        const next = confirm + n;
        setConfirm(next);
        if (next.length === 4) {
          if (next === pin) { hashPin(pin).then(h => { localStorage.setItem(`flo-pin-${user}`, h); if (onPinSet) onPinSet(); onUnlock(); }); }
          else { setError("PINs didn't match"); shake(); setPin(''); setConfirm(''); }
        }
      } else {
        const next = pin + n;
        setPin(next);
        if (next.length === 4) { setConfirm(''); setError(''); }
      }
    } else {
      const next = pin + n;
      setPin(next);
      if (next.length === 4) {
        hashPin(next).then(h => {
          if (h === localStorage.getItem(`flo-pin-${user}`)) onUnlock();
          else { setError('Wrong PIN'); shake(); setPin(''); }
        });
      }
    }
  }
  function handleDel() {
    if (mode === 'setup' && pin.length === 4) setConfirm(confirm.slice(0, -1));
    else setPin(pin.slice(0, -1));
    setError('');
  }

  function pickUser(u) {
    onSelectUser(u);
    if (localStorage.getItem(`flo-pin-${u}`)) setMode('enter');
    else setMode('setup');
    setPin(''); setConfirm(''); setError('');
  }

  const current = mode === 'setup' && pin.length === 4 ? confirm : pin;
  const label = mode === 'select' ? 'Who are you?'
    : mode === 'setup' ? (pin.length < 4 ? `${user}, set a 4-digit PIN` : 'Confirm your PIN')
    : `Welcome back, ${user}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
      <div className="mb-10 text-center">
        <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--accent-glow)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>Flomington</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>fly stock manager</p>
      </div>
      <p className="text-sm mb-6" style={{ color: 'var(--text-2)' }}>{label}</p>
      {mode === 'select' ? (
        <div className="grid grid-cols-2 gap-3 w-72">
          {USERS.map(u => (
            <button key={u} onClick={() => pickUser(u)}
              className="px-4 py-4 text-sm font-semibold rounded-xl transition-all active:scale-95"
              style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}>
              {u}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className={`flex gap-5 mb-4 ${shaking ? 'shake' : ''}`}>
            {[0, 1, 2, 3].map(i => <div key={i} className={`pin-dot ${i < current.length ? 'filled' : ''}`} />)}
          </div>
          {error && <p className="text-xs text-red-400 mb-4 font-medium">{error}</p>}
          <div className="grid grid-cols-3 gap-3 mt-6" style={{ maxWidth: 260 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
              <button key={n} onClick={() => handleKey(String(n))}
                className="touch w-20 h-14 rounded-2xl text-lg font-semibold transition-all active:scale-95"
                style={{ color: 'var(--text-1)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                {n}
              </button>
            ))}
            <button onClick={handleDel}
              className="touch w-20 h-14 rounded-2xl text-sm transition-all active:scale-95"
              style={{ color: 'var(--text-3)', background: 'var(--surface)' }}>Del</button>
            <button onClick={() => handleKey('0')}
              className="touch w-20 h-14 rounded-2xl text-lg font-semibold transition-all active:scale-95"
              style={{ color: 'var(--text-1)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>0</button>
          </div>
          {(mode === 'setup' || mode === 'enter') && (
            <button onClick={() => { setMode('select'); setPin(''); setConfirm(''); setError(''); }}
              className="text-xs mt-8 touch" style={{ color: 'var(--text-3)' }}>Not {user}? Switch user</button>
          )}
          {mode === 'setup' && <p className="text-[10px] mt-4 max-w-xs text-center" style={{ color: 'var(--text-3)' }}>Your PIN is personal - only you need it to switch back.</p>}
        </>
      )}
    </div>
  );
}
