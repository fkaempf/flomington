import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { uid } from '../../utils/helpers.js';
import { TAG_STYLE } from '../../utils/constants.js';

/* ========== TOAST SYSTEM ========== */
export function Toasts({ items, remove }) {
  return (
    <div className="fixed bottom-28 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {items.map(t => (
        <div key={t.id} className={`pointer-events-auto px-4 py-3 flex items-center gap-3 max-w-sm w-full rounded-2xl ${t.out ? 'anim-out' : 'anim-in'}`}
          style={{ background: 'rgba(24,24,27,0.9)', backdropFilter: 'blur(20px)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
          <span className="text-sm flex-1" style={{ color: 'var(--text-1)' }}>{t.msg}</span>
          {t.undo && <button onClick={() => { t.undo(); remove(t.id); }} className="text-sm font-bold touch" style={{ color: 'var(--accent-2)' }}>Undo</button>}
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [items, set] = useState([]);
  const add = useCallback((msg, undo) => {
    const id = uid();
    set(p => [...p, { id, msg, undo }]);
    setTimeout(() => set(p => p.map(t => t.id === id ? { ...t, out: true } : t)), 3500);
    setTimeout(() => set(p => p.filter(t => t.id !== id)), 3900);
  }, []);
  const rm = useCallback(id => {
    set(p => p.map(t => t.id === id ? { ...t, out: true } : t));
    setTimeout(() => set(p => p.filter(t => t.id !== id)), 300);
  }, []);
  return { items, add, rm };
}

/* ========== MODAL ========== */
export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const main = document.querySelector('main');
    if (!main) return;
    const prevMain = main.style.overflow;
    const prevBody = document.body.style.overflow;
    main.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => { main.style.overflow = prevMain; document.body.style.overflow = prevBody; };
  }, [open]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" onClick={onClose} onWheel={e => e.stopPropagation()}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', animation: 'backdrop-in 0.2s ease' }} />
      <div className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[75vh] overflow-y-auto`}
        style={{
          borderRadius: '28px',
          padding: '2.5rem',
          backgroundColor: 'rgba(15, 12, 41, 0.3)',
          backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(0,128,128,0.04) 30%, rgba(138,154,91,0.04) 60%, rgba(255,255,255,0.06) 100%)',
          backdropFilter: 'blur(40px) saturate(1.6) brightness(1.1)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.6) brightness(1.1)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset, 0 1px 0 0 rgba(255,255,255,0.1) inset, 0 -1px 0 0 rgba(255,255,255,0.02) inset, 0 8px 40px rgba(0,0,0,0.35), 0 0 120px rgba(0,128,128,0.06), 0 0 60px rgba(204,119,34,0.04)',
          animation: 'modal-in 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={e => e.stopPropagation()}>
        {title && (
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>{title}</h3>
            <button onClick={onClose} className="touch rounded-full w-10 h-10 flex items-center justify-center transition-all active:scale-90 hover:opacity-80" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
            </button>
          </div>
        )}
        <div>{children}</div>
      </div>
    </div>,
    document.body
  );
}

/* ========== CONFIRM ========== */
export function Confirm({ open, onOk, onNo, title, msg, okLabel = 'Delete' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onNo}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} />
      <div className="relative card p-6 max-w-sm w-full anim-in" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold mb-2" style={{ color: 'var(--text-1)' }}>{title}</p>
        <p className="text-xs mb-5" style={{ color: 'var(--text-3)' }}>{msg}</p>
        <div className="flex gap-2">
          <button onClick={onOk} className="touch flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all active:scale-95"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)' }}>{okLabel}</button>
          <button onClick={onNo} className="touch flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all active:scale-95"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ========== BTN ========== */
export function Btn({ children, onClick, v = 'p', className = '', disabled, ...props }) {
  const styles = {
    p: { background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: '#fff', border: 'none', boxShadow: '0 4px 16px var(--accent-glow)' },
    s: { background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' },
    d: { background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.12)' },
    g: { background: 'transparent', color: 'var(--text-3)', border: 'none' },
    ok: { background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', border: 'none', boxShadow: '0 4px 16px rgba(34,197,94,0.2)' },
    advance: { background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', border: 'none', boxShadow: '0 4px 16px var(--accent-glow)' },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`touch px-4 py-2.5 text-sm font-semibold rounded-xl transition-all active:scale-[0.97] ${disabled ? 'opacity-30 pointer-events-none' : ''} ${className}`}
      style={styles[v] || styles.p} {...props}>
      {children}
    </button>
  );
}

/* ========== INP / TXT / FIELD ========== */
export function Inp(props) {
  return <input {...props} className={`w-full px-4 py-3 text-sm rounded-xl ${props.className || ''}`} />;
}

export function Txt(props) {
  return <textarea {...props} className={`w-full px-4 py-3 text-sm rounded-xl resize-y ${props.className || ''}`} />;
}

export function Field({ label, children }) {
  return (
    <label className="block mb-4">
      <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

/* ========== TAG BADGES ========== */
export function TagBadges({ tags, limit }) {
  const show = limit ? tags.slice(0, limit) : tags;
  const more = limit && tags.length > limit ? tags.length - limit : 0;
  return <>{show.map(t => <span key={t} className="badge" style={TAG_STYLE[t] || { background: 'rgba(253,224,71,0.1)', color: '#fde047' }}>{t}</span>)}{more > 0 && <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>+{more}</span>}</>;
}

/* ========== CIRCLE PROGRESS ========== */
export function CircleProgress({ value, max, size = 40, stroke = 3, countUp }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const done = pct >= 1;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={done ? '#22c55e' : '#8b5cf6'} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fill={done ? '#86efac' : 'var(--text-3)'} fontSize="9" fontWeight="700" fontFamily="'SF Mono', monospace">
        {done ? '\u2713' : countUp ? value : Math.max(0, max - value)}
      </text>
    </svg>
  );
}

/* ========== ERROR BOUNDARY ========== */
export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('ErrorBoundary caught:', error, info); }
  render() {
    if (this.state.hasError) {
      return React.createElement('div', { className: 'card p-8 text-center m-6', style: { border: '1px solid rgba(239,68,68,0.2)' } },
        React.createElement('p', { className: 'text-sm font-semibold mb-2', style: { color: '#fca5a5' } }, 'Something went wrong'),
        React.createElement('p', { className: 'text-xs mb-4', style: { color: 'var(--text-3)' } }, this.state.error?.message || 'Unknown error'),
        React.createElement('button', { onClick: () => this.setState({ hasError: false, error: null }), className: 'px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer', style: { background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' } }, 'Try Again')
      );
    }
    return this.props.children;
  }
}
