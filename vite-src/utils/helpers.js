/* ========== HELPERS ========== */

import { addDays, isTouchDevice as _isTouchDevice } from './dates.js';
import { STATUSES, OPTO, CALC, BALANCER_MARKERS } from './constants.js';

// Re-export from dates for convenience
export const isTouchDevice = _isTouchDevice;

export const uid = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);

export function sn(stocks, id) { return stocks.find(s => s.id === id)?.name || '??'; }
export function sg(stocks, id) { return stocks.find(s => s.id === id)?.genotype || ''; }
export function cl(c, S) { return `${sn(S, c.parentA)} \u00d7 ${sn(S, c.parentB)}`; }
export function clFull(c, S) { return { virgin: sn(S, c.parentA), male: sn(S, c.parentB) }; }

export const is18 = t => t === '18';
export const tempLabel = t => ({ '25inc': '25\u00b0C Inc', '25room': '25\u00b0C Room', '18': '18\u00b0C', 'RT': 'RT', '25': '25\u00b0C' }[t] || t);
export const tempFull = t => ({ '25inc': '25\u00b0C Incubator', '25room': '25\u00b0C Room', '18': '18\u00b0C Room', 'RT': 'Room Temp' }[t] || t);

export const nextSt = s => { const i = STATUSES.indexOf(s); return i < STATUSES.length - 1 ? STATUSES[i + 1] : s; };
export const stIdx = s => STATUSES.indexOf(s);

export function detect(g, name) {
  const l = (g || '').toLowerCase();
  const n = (name || '').toLowerCase();
  return { o: OPTO.some(k => l.includes(k)), c: CALC.some(k => l.includes(k)) || n.includes('gfp') || l.includes('gfp') };
}

export function stockTags(s) {
  const tags = [];
  const g = (s.genotype || '').toLowerCase();
  const n = (s.notes || '').toLowerCase();
  const all = g + ' ' + n;
  if (/\bdead\b/i.test(s.notes || '')) tags.push('Dead');
  if (/\balive\b/i.test(s.notes || '')) tags.push('Alive');
  if (OPTO.some(k => all.includes(k))) tags.push('Opto');
  if (CALC.some(k => all.includes(k)) || all.includes('gfp')) tags.push('Imaging');
  const hasAD = all.includes('p65.ad') || all.includes('-p65.ad}') || n.includes(' ad ') || n.includes(' ad(') || /\bAD\b/.test(s.notes || '');
  const hasDBD = all.includes('gal4.dbd') || all.includes('-gal4.dbd}') || n.includes(' dbd ') || n.includes(' dbd(') || /\bDBD\b/.test(s.notes || '');
  if (hasAD && hasDBD) { tags.push('Split-GAL4'); }
  else { if (hasAD) tags.push('AD'); if (hasDBD) tags.push('DBD'); }
  if (/lexa/i.test(g) || /\blexa\b/i.test(n)) tags.push('LexA');
  if (/gal4/i.test(g) && !hasAD && !hasDBD) tags.push('GAL4');
  if (/uas/i.test(g) || /\buas\b/i.test(n) || /\buas\b/i.test(s.name || '')) tags.push('UAS');
  if (s.demo) tags.push('Demo');
  return tags;
}

export function crossDetect(c, stocks) {
  const a = detect(stocks.find(s => s.id === c.parentA)?.genotype);
  const b = detect(stocks.find(s => s.id === c.parentB)?.genotype);
  return { o: a.o || b.o, c: a.c || b.c };
}

export function getScreeningGuide(cross, stocks) {
  const gA = stocks.find(s => s.id === cross.parentA)?.genotype || '';
  const gB = stocks.find(s => s.id === cross.parentB)?.genotype || '';
  const combined = gA + ' ; ' + gB;
  const found = [];
  const seen = new Set();
  BALANCER_MARKERS.forEach(m => {
    if (m.pattern.test(combined) && !seen.has(m.name)) {
      seen.add(m.name);
      const inA = m.pattern.test(gA);
      const inB = m.pattern.test(gB);
      found.push({ ...m, source: inA && inB ? 'both' : inA ? 'virgin' : 'male' });
    }
  });
  return found;
}

// PIN hashing
export async function hashPin(pin) {
  const data = new TextEncoder().encode(pin + 'flo-salt');
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Flip schedules: expanded always 25C -> 21d (3wk); stock varies by temp
export function getFlipDays(s) {
  if ((s.variant || 'stock') === 'expanded') return 21;
  if (is18(s.location)) return 42;
  if (s.location === 'RT') return 28;
  return 14; // 25C variants
}

export function calcTL(setup, temp) {
  if (is18(temp)) return { virginStart: addDays(setup, 17), virginEnd: addDays(setup, 19), progenyStart: addDays(setup, 19), progenyEnd: addDays(setup, 23) };
  return { virginStart: addDays(setup, 9), virginEnd: addDays(setup, 11), progenyStart: addDays(setup, 11), progenyEnd: addDays(setup, 15) };
}

export function getTL(c) {
  return calcTL(c.setupDate, c.temperature);
}

export function guessSource(name) {
  if (!name) return null;
  const n = name.trim();
  const m = n.match(/^(BDSC|BL|Bloomington|VDRC|Kyoto|DGRC)\s*[#:]?\s*(\d+)/i);
  if (!m) return null;
  const prefix = m[1].toLowerCase();
  const id = m[2];
  if (['bdsc', 'bl', 'bloomington'].includes(prefix)) return { source: 'Bloomington', sourceId: id };
  if (prefix === 'vdrc') return { source: 'VDRC', sourceId: id };
  if (['kyoto', 'dgrc'].includes(prefix)) return { source: 'Kyoto', sourceId: id };
  return null;
}

export function stockUrl(source, stockId) {
  if (!source || !stockId) return null;
  const id = stockId.replace(/\D/g, '');
  if (source === 'Bloomington') return `https://bdsc.indiana.edu/stocks/${id}`;
  if (source === 'VDRC') return `https://stockcenter.vdrc.at/control/product/~VIEW_INDEX=0/~VIEW_SIZE=100/~product_id=${id}`;
  if (source === 'Kyoto') return `https://kyotofly.kit.jp/cgi-bin/stocks/search_res_det.cgi?DB_NUM=1&DG_NUM=${id}`;
  return null;
}

export function parseJaneliaLine(text) {
  if (!text) return null;
  const m = text.match(/\b(SS|MB|JRC_SS|JRC_MB)\s*(\d{4,6})\b/i);
  if (m) return m[1].replace('JRC_', '').toUpperCase() + m[2];
  return null;
}

export function janeliaUrl(lineId) {
  if (!lineId) return null;
  return `https://splitgal4.janelia.org/cgi-bin/view_splitgal4_imagery.cgi?line=${lineId}`;
}

export async function fetchBDSCInfo(stockNum) {
  const id = String(stockNum).replace(/\D/g, '');
  if (!id) return null;
  try {
    const resp = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(`https://bdsc.indiana.edu/stocks/${id}`)}`);
    if (!resp.ok) return null;
    const html = await resp.text();
    const janelia = parseJaneliaLine(html);
    const genoMatch = html.match(/Genotype[^<]*<[^>]*>([^<]+)/i);
    return { janeliaLine: janelia, genotype: genoMatch ? genoMatch[1].trim() : null };
  } catch { return null; }
}

export function parseFlyBase(input) {
  if (!input) return null;
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/flybase\.org\/reports\/(FB\w+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^FB\w+$/i.test(trimmed)) return trimmed;
  return trimmed;
}

export function flybaseUrl(fbId) {
  if (!fbId) return null;
  const id = parseFlyBase(fbId);
  return id ? `https://flybase.org/reports/${id}` : null;
}

/* ========== ICS EXPORT ========== */
export function dlICS(events, name) {
  const f = d => d.replace(/-/g, '');
  let s = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Flomington//EN\r\nCALSCALE:GREGORIAN\r\n';
  events.forEach(e => {
    s += `BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${f(e.date)}\r\nDTEND;VALUE=DATE:${f(addDays(e.date, 1))}\r\nSUMMARY:${(e.title || '').replace(/[\\;,\n]/g, ' ')}\r\nDESCRIPTION:${(e.desc || '').replace(/[\\;,\n]/g, ' ')}\r\nUID:${uid()}@flomington\r\nEND:VEVENT\r\n`;
  });
  s += 'END:VCALENDAR\r\n';
  const b = new Blob([s], { type: 'text/calendar' });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = u; a.download = name; a.click();
  URL.revokeObjectURL(u);
}
