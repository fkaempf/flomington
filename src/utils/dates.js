/* ========== DATE HELPERS ========== */

export const today = () => new Date().toISOString().slice(0, 10);

export const normDate = d => {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const p = new Date(d);
  return isNaN(p) ? '' : p.toISOString().slice(0, 10);
};

export const toDate = d => new Date(normDate(d) + 'T12:00:00');

export const addDays = (d, n) => {
  const x = toDate(d);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};

export const fmt = d => {
  if (!d) return '-';
  return toDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const fmtFull = d => {
  if (!d) return '-';
  return toDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export const isPast = d => normDate(d) < today();
export const isToday = d => normDate(d) === today();

export const dFromNow = d => {
  if (!d) return 0;
  const ms = toDate(d) - toDate(today());
  return isNaN(ms) ? 0 : Math.round(ms / 864e5);
};

export const isTouchDevice = () => window.matchMedia?.('(pointer: coarse)')?.matches ?? false;

// Parse "HH:MM" to minutes since midnight
export function parseHHMM(s) {
  if (!s) return null;
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

export function fmtHHMM(mins) {
  const h = Math.floor(((mins % 1440) + 1440) % 1440 / 60);
  const m = ((mins % 1440) + 1440) % 1440 % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// Format ms duration as "1h 20m" or "35m"
export function fmtDur(ms) {
  const neg = ms < 0;
  const a = Math.abs(ms);
  const m = Math.round(a / 60000);
  if (m < 60) return (neg ? '-' : '') + m + 'm';
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return (neg ? '-' : '') + h + 'h' + (rm ? ' ' + rm + 'm' : '');
}

// Format time as "HH:MM" with date context
export function fmtTime(iso) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  const now = new Date();
  const time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const todayDate = new Date(now); todayDate.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const diff = (target - todayDate) / 86400000;
  if (diff === 0) return 'Today ' + time;
  if (diff === -1) return 'Yesterday ' + time;
  if (diff === 1) return 'Tomorrow ' + time;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getDay()] + ' ' + time;
}
