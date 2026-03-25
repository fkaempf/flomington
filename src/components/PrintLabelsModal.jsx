import React, { useState, useEffect } from 'react';
import { Modal, Btn } from './ui';
import { LABEL_FORMATS } from '../utils/constants.js';
import { sn, getTL } from '../utils/helpers.js';

function crossLabelText(c, stocks) {
  const name = `♀ ${sn(stocks, c.parentA)}<br>x<br>♂ ${sn(stocks, c.parentB)}`;
  const tl = getTL(c);
  const nw = d => d ? `<span style="white-space:nowrap">${d}</span>` : '';
  let action = '';
  if (c.status === 'waiting for virgins' || c.status === 'collecting virgins') {
    action = `Collect virgins from ${nw(tl.virginStart)}`;
  } else if (c.status === 'waiting for progeny' || c.status === 'collecting progeny') {
    action = `Collect progeny from ${nw(tl.progenyStart)}`;
  } else if (c.status === 'screening') {
    action = 'Screening';
  } else if (c.status === 'ripening') {
    action = 'Ripening';
  } else if (c.status === 'set up') {
    action = `Set up ${nw(c.setupDate || '')}`;
  } else if (c.status === 'done') {
    action = 'Done';
  }
  return { name, action, temp: '' };
}

function PrintLabelsModal({ open, onClose, printList, setPrintList, printListCrosses, setPrintListCrosses, printListVirgins, setPrintListVirgins, printListExps, setPrintListExps, stocks, crosses, expBank, toast }) {
  const [format, setFormat] = useState('L4737');
  const [showGrid, setShowGrid] = useState(false);
  const [showQR, setShowQR] = useState(true);
  const [vertical, setVertical] = useState(false);
  const [skipLabels, setSkipLabels] = useState(0);
  const [bufferTop, setBufferTop] = useState(0);
  const [bufferRight, setBufferRight] = useState(0);
  const [bufferBottom, setBufferBottom] = useState(0);
  const [bufferLeft, setBufferLeft] = useState(15);
  useEffect(() => {
    if (vertical) { setBufferLeft(0); setBufferTop(15); }
    else { setBufferTop(0); setBufferLeft(15); }
  }, [vertical]);

  if (!open) return null;
  const stockItems = printList.map(id => stocks.find(s => s.id === id)).filter(Boolean);
  const crossItems = (printListCrosses || []).map(id => (crosses || []).find(c => c.id === id)).filter(Boolean);
  const virginItems = (printListVirgins || []).map(id => stocks.find(s => s.id === id)).filter(Boolean);
  const expItems = (printListExps || []).map(id => {
    const entry = expBank?.[id];
    if (!entry) return null;
    const src = entry.source === 'cross' ? crosses.find(c => c.id === id) : stocks.find(s => s.id === id);
    const name = entry.source === 'cross' ? (src ? `${stocks.find(s => s.id === src.parentA)?.name || '?'} x ${stocks.find(s => s.id === src.parentB)?.name || '?'}` : id) : (src?.name || id);
    const genotype = entry.source === 'cross' ? '' : (src?.genotype || '');
    return { id, name, genotype, source: entry.source };
  }).filter(Boolean);
  const totalCount = stockItems.length + crossItems.length + virginItems.length + expItems.length;
  const spec = LABEL_FORMATS[format];

  function doPrint() {
    if (totalCount === 0) return;
    const w = window.open('', '_blank');
    if (!w) { toast.add('Pop-up blocked - allow pop-ups for this site'); return; }

    const qrBase = (window.location.origin + window.location.pathname).replace('https://', '');

    // Build unified label data
    const esc = t => t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const allLabels = [];
    stockItems.forEach(s => {
      const hasSibling = stocks.some(x => x.id !== s.id && x.name === s.name && (x.category || 'No Collection') === (s.category || 'No Collection'));
      allLabels.push({ id: 's-' + s.id, name: esc(s.name + (s.vcs?.enabled ? ' [VCS]' : '')), copies: hasSibling ? (s.copies || 1) : 0, line2: esc(s.genotype || ''), line3: '', qrUrl: showQR ? qrBase + '?s=' + s.id.slice(0, 8) : null });
    });
    crossItems.forEach(c => {
      const info = crossLabelText(c, stocks);
      allLabels.push({ id: 'c-' + c.id, name: info.name, line2: info.action, line3: info.temp, qrUrl: showQR ? qrBase + '?c=' + c.id.slice(0, 8) : null, isCross: true });
    });
    virginItems.forEach(s => {
      const vHasSibling = stocks.some(x => x.id !== s.id && x.name === s.name && (x.category || 'No Collection') === (s.category || 'No Collection'));
      allLabels.push({ id: 'v-' + s.id, name: esc(s.name + (s.vcs?.enabled ? ' [VCS]' : '')), copies: vHasSibling ? (s.copies || 1) : 0, line2: esc(s.genotype || ''), line3: '\u24CB', qrUrl: showQR ? qrBase + '?s=' + s.id.slice(0, 8) : null });
    });
    expItems.forEach(e => {
      const eqr = showQR ? qrBase + (e.source === 'cross' ? '?c=' : '?s=') + e.id.slice(0, 8) : null;
      allLabels.push({ id: 'e-' + e.id, name: esc(e.name), line2: esc(e.genotype), line3: '\u24BA', qrUrl: eqr });
    });

    const perPage = spec.cols * spec.rows;
    const skip = Math.max(0, Math.min(skipLabels, perPage - 1));
    const pages = [];
    // Add empty placeholders for skipped labels on first page
    const padded = [...Array(skip).fill(null), ...allLabels];
    for (let i = 0; i < padded.length; i += perPage) {
      pages.push(padded.slice(i, i + perPage));
    }

    const pagesHtml = pages.map((pageItems) => {
      const cells = pageItems.map((lb) => {
        if (!lb) return '<div class="label"></div>';
        return `<div class="label">
          <div class="label-inner">
            ${lb.qrUrl ? '<div class="label-qr" id="qr-' + lb.id + '"></div>' : ''}
            <div class="label-text">
              <div class="label-name">${lb.name}${lb.copies ? ' <span class="label-copy">#' + lb.copies + '</span>' : ''}</div>
              ${lb.line2 ? '<div class="label-geno">' + lb.line2 + '</div>' : ''}
              ${lb.line3 ? '<div class="label-info">' + lb.line3 + '</div>' : ''}
            </div>
          </div>
        </div>`;
      }).join('\n');
      return `<div class="page">${cells}</div>`;
    }).join('\n');

    const qrData = JSON.stringify(allLabels.filter(lb => lb.qrUrl).map(lb => ({ id: lb.id, url: lb.qrUrl })));

    // Scale sizes based on label dimensions
    const isLarge = spec.labelH > 35;
    const isMedium = !isLarge && (spec.labelH > 25 || spec.labelW > 40);
    const qrSize = format === 'L4737' ? 14 : isLarge ? 16 : isMedium ? 10 : 8;
    const basePad = isLarge ? [2, 5, 3.5, 3] : isMedium ? [1.5, 3, 3, 2] : [0.8, 2, 2.8, 1];
    const pad = `${Math.max(basePad[0], bufferTop)}mm ${Math.max(basePad[1], bufferRight)}mm ${Math.max(basePad[2], bufferBottom)}mm ${Math.max(basePad[3], bufferLeft)}mm`;
    const gap = isLarge ? '2mm' : isMedium ? '2mm' : '1mm';
    const nameSize = isLarge ? '9pt' : isMedium ? '8.5pt' : '6.5pt';
    const genoSize = isLarge ? '6pt' : isMedium ? '5.5pt' : '4.5pt';
    const genoClamp = isLarge ? 10 : isMedium ? 5 : 3;
    const infoSize = isLarge ? '6pt' : isMedium ? '5.5pt' : '4.5pt';

    w.document.write(`<!DOCTYPE html><html><head><title>Flomington Labels</title>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
<style>
@page { size: A4; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${spec.pageW}mm; }
body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page {
  width: ${spec.pageW}mm; height: ${spec.pageH}mm;
  padding-top: ${spec.marginTop}mm;
  padding-left: ${spec.marginLeft}mm;
  display: grid;
  grid-template-columns: repeat(${spec.cols}, ${spec.labelW}mm);
  grid-template-rows: repeat(${spec.rows}, ${spec.labelH}mm);
  column-gap: ${spec.gapX}mm;
  row-gap: ${spec.gapY}mm;
  page-break-after: always;
  overflow: hidden;
}
.page:last-child { page-break-after: auto; }
.label {
  width: ${spec.labelW}mm; height: ${spec.labelH}mm;
  overflow: hidden;
  position: relative;
  border: ${showGrid ? '0.3pt dashed #ccc' : 'none'};
}
.label-inner {
  display: flex; flex-direction: ${vertical ? 'column' : 'row'}; align-items: center; justify-content: center; gap: ${gap};
  padding: ${pad};
  width: ${spec.labelW}mm; height: ${spec.labelH}mm;
  box-sizing: border-box;
  overflow: hidden;
}
${vertical ? `.label-inner {
  transform: rotate(-90deg) translateX(-100%);
  transform-origin: top left;
  width: ${spec.labelH}mm; height: ${spec.labelW}mm;
}
.label-text { text-align: center; flex: 0 1 auto !important; min-width: 0; }` : ''}
.label-qr { flex-shrink: 0; width: ${qrSize}mm; height: ${qrSize}mm; }
.label-qr svg { display: block; width: ${qrSize}mm; height: ${qrSize}mm; }
.label-text { flex: 1; min-width: 0; overflow: hidden; }
.label-name { font-size: ${nameSize}; font-weight: bold; line-height: 1.2; word-break: break-word; }
.label-copy { font-weight: normal; color: #aaa; }
.label-geno { font-size: ${genoSize}; font-family: 'Courier New', monospace; line-height: 1.2; word-break: break-all; color: #444; margin-top: 0.5mm; }
.label-info { font-size: ${infoSize}; color: #666; line-height: 1.2; margin-top: 0.3mm; }
@media print {
  body { margin: 0; }
  .page { break-after: page; }
  .page:last-child { break-after: auto; }
}
</style></head><body>${pagesHtml}
<script>
var items = ${qrData};
var qrSz = '${qrSize}mm';
items.forEach(function(s) {
  var el = document.getElementById('qr-' + s.id);
  if (!el) return;
  try {
    var qr = qrcode(0, 'H');
    qr.addData(s.url);
    qr.make();
    el.innerHTML = qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
    var svg = el.querySelector('svg');
    if (svg) { svg.setAttribute('width', qrSz); svg.setAttribute('height', qrSz); svg.style.display = 'block'; }
  } catch(e) { el.textContent = ''; }
});
setTimeout(function(){ window.print(); }, 500);
<\/script></body></html>`);
    w.document.close();
  }

  return (
    <Modal open={open} onClose={onClose} title="Print Labels" wide>
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>{totalCount} label{totalCount !== 1 ? 's' : ''}</p>
          <div className="flex-1" />
          <select value={format} onChange={e => setFormat(e.target.value)}
            className="compact px-2 py-1.5 font-semibold rounded-lg"
            style={{ color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.1)', appearance: 'auto' }}>
            {Object.entries(LABEL_FORMATS).map(([k, v]) => (
              <option key={k} value={k}>{v.name} ({v.cols * v.rows}/page)</option>
            ))}
          </select>
          <div onClick={() => setShowQR(!showQR)} className="compact font-semibold rounded-lg cursor-pointer select-none flex items-center justify-center"
            style={{ fontSize: '11px', height: '29px', padding: '0 8px', boxSizing: 'border-box', color: showQR ? '#5eead4' : 'var(--text-3)', border: showQR ? '1px solid rgba(0,128,128,0.3)' : '1px solid var(--border)', background: showQR ? 'rgba(0,128,128,0.1)' : 'var(--surface-2)' }}>
            {showQR ? '✓ QR' : 'QR'}
          </div>
          <div onClick={() => setShowGrid(!showGrid)} className="compact font-semibold rounded-lg cursor-pointer select-none flex items-center justify-center"
            style={{ fontSize: '11px', height: '29px', padding: '0 8px', boxSizing: 'border-box', color: showGrid ? '#5eead4' : 'var(--text-3)', border: showGrid ? '1px solid rgba(0,128,128,0.3)' : '1px solid var(--border)', background: showGrid ? 'rgba(0,128,128,0.1)' : 'var(--surface-2)' }}>
            {showGrid ? '✓ Grid' : 'Grid'}
          </div>
          <div onClick={() => setVertical(!vertical)} className="compact font-semibold rounded-lg cursor-pointer select-none flex items-center justify-center"
            style={{ fontSize: '11px', height: '29px', padding: '0 8px', boxSizing: 'border-box', color: vertical ? '#5eead4' : 'var(--text-3)', border: vertical ? '1px solid rgba(0,128,128,0.3)' : '1px solid var(--border)', background: vertical ? 'rgba(0,128,128,0.1)' : 'var(--surface-2)' }}>
            {vertical ? '✓ Vertical' : 'Vertical'}
          </div>
          <div className="compact flex items-center gap-1 font-semibold rounded-lg"
            style={{ fontSize: '11px', height: '29px', padding: '0 8px', boxSizing: 'border-box', border: skipLabels > 0 ? '1px solid rgba(251,191,36,0.3)' : '1px solid var(--border)', background: skipLabels > 0 ? 'rgba(251,191,36,0.1)' : 'var(--surface-2)', color: skipLabels > 0 ? '#fbbf24' : 'var(--text-3)' }}>
            <span>Skip</span>
            <input type="number" min="0" max={spec.cols * spec.rows - 1} value={skipLabels} onChange={e => setSkipLabels(Math.max(0, parseInt(e.target.value) || 0))}
              className="compact" style={{ width: '20px', textAlign: 'center', outline: 'none', fontWeight: 600, padding: 0, margin: 0, lineHeight: '1' }} />
          </div>
        </div>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="flex-1" />
          <div className="compact flex items-center gap-1 font-semibold rounded-lg"
            style={{ fontSize: '11px', height: '29px', padding: '0 8px', boxSizing: 'border-box', border: bufferTop > 0 ? '1px solid rgba(251,191,36,0.3)' : '1px solid var(--border)', background: bufferTop > 0 ? 'rgba(251,191,36,0.1)' : 'var(--surface-2)', color: bufferTop > 0 ? '#fbbf24' : 'var(--text-3)' }}>
            <span>Fold top</span>
            <input type="number" min="0" step="0.5" value={bufferTop} onChange={e => setBufferTop(Math.max(0, parseFloat(e.target.value) || 0))}
              className="compact" style={{ width: '26px', textAlign: 'center', outline: 'none', fontWeight: 600, padding: 0, margin: 0, lineHeight: '1' }} />
            <span>mm</span>
          </div>
          <div className="compact flex items-center gap-1 font-semibold rounded-lg"
            style={{ fontSize: '11px', height: '29px', padding: '0 8px', boxSizing: 'border-box', border: bufferRight > 0 ? '1px solid rgba(251,191,36,0.3)' : '1px solid var(--border)', background: bufferRight > 0 ? 'rgba(251,191,36,0.1)' : 'var(--surface-2)', color: bufferRight > 0 ? '#fbbf24' : 'var(--text-3)' }}>
            <span>Fold right</span>
            <input type="number" min="0" step="0.5" value={bufferRight} onChange={e => setBufferRight(Math.max(0, parseFloat(e.target.value) || 0))}
              className="compact" style={{ width: '26px', textAlign: 'center', outline: 'none', fontWeight: 600, padding: 0, margin: 0, lineHeight: '1' }} />
            <span>mm</span>
          </div>
          <div className="compact flex items-center gap-1 font-semibold rounded-lg"
            style={{ fontSize: '11px', height: '29px', padding: '0 8px', boxSizing: 'border-box', border: bufferBottom > 0 ? '1px solid rgba(251,191,36,0.3)' : '1px solid var(--border)', background: bufferBottom > 0 ? 'rgba(251,191,36,0.1)' : 'var(--surface-2)', color: bufferBottom > 0 ? '#fbbf24' : 'var(--text-3)' }}>
            <span>Fold bottom</span>
            <input type="number" min="0" step="0.5" value={bufferBottom} onChange={e => setBufferBottom(Math.max(0, parseFloat(e.target.value) || 0))}
              className="compact" style={{ width: '26px', textAlign: 'center', outline: 'none', fontWeight: 600, padding: 0, margin: 0, lineHeight: '1' }} />
            <span>mm</span>
          </div>
          <div className="compact flex items-center gap-1 font-semibold rounded-lg"
            style={{ fontSize: '11px', height: '29px', padding: '0 8px', boxSizing: 'border-box', border: bufferLeft > 0 ? '1px solid rgba(251,191,36,0.3)' : '1px solid var(--border)', background: bufferLeft > 0 ? 'rgba(251,191,36,0.1)' : 'var(--surface-2)', color: bufferLeft > 0 ? '#fbbf24' : 'var(--text-3)' }}>
            <span>Fold left</span>
            <input type="number" min="0" step="0.5" value={bufferLeft} onChange={e => setBufferLeft(Math.max(0, parseFloat(e.target.value) || 0))}
              className="compact" style={{ width: '26px', textAlign: 'center', outline: 'none', fontWeight: 600, padding: 0, margin: 0, lineHeight: '1' }} />
            <span>mm</span>
          </div>
        </div>

        {totalCount === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>No labels queued</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>Tap the printer icon in stock, cross, virgin, or exp entries to add them</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[40vh] overflow-y-auto mb-4">
            {stockItems.length > 0 && <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Stocks</p>}
            {stockItems.map(s => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>{s.name}</p>
                  {s.genotype && <p className="text-xs mono truncate" style={{ color: 'var(--text-3)' }}>{s.genotype}</p>}
                </div>
                <button onClick={() => setPrintList(p => p.filter(x => x !== s.id))} className="touch shrink-0 p-1.5 rounded-lg transition-all active:scale-90"
                  style={{ color: 'var(--text-3)' }} title="Remove">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
                </button>
              </div>
            ))}
            {crossItems.length > 0 && <p className="text-[10px] uppercase tracking-wider font-semibold mt-2" style={{ color: 'var(--text-3)' }}>Crosses</p>}
            {crossItems.map(c => {
              const info = crossLabelText(c, stocks);
              return (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>{info.name}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{info.action}</p>
                  </div>
                  <button onClick={() => setPrintListCrosses(p => p.filter(x => x !== c.id))} className="touch shrink-0 p-1.5 rounded-lg transition-all active:scale-90"
                    style={{ color: 'var(--text-3)' }} title="Remove">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
                  </button>
                </div>
              );
            })}
            {virginItems.length > 0 && <p className="text-[10px] uppercase tracking-wider font-semibold mt-2" style={{ color: 'var(--text-3)' }}>Virgins {'\u24CB'}</p>}
            {virginItems.map(s => (
              <div key={'v-'+s.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>{s.name}</p>
                  {s.genotype && <p className="text-xs mono truncate" style={{ color: 'var(--text-3)' }}>{s.genotype}</p>}
                </div>
                <button onClick={() => setPrintListVirgins(p => p.filter(x => x !== s.id))} className="touch shrink-0 p-1.5 rounded-lg transition-all active:scale-90"
                  style={{ color: 'var(--text-3)' }} title="Remove">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
                </button>
              </div>
            ))}
            {expItems.length > 0 && <p className="text-[10px] uppercase tracking-wider font-semibold mt-2" style={{ color: 'var(--text-3)' }}>Experiments {'\u24BA'}</p>}
            {expItems.map(e => (
              <div key={'e-'+e.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>{e.name}</p>
                  {e.genotype && <p className="text-xs mono truncate" style={{ color: 'var(--text-3)' }}>{e.genotype}</p>}
                </div>
                <button onClick={() => setPrintListExps(p => p.filter(x => x !== e.id))} className="touch shrink-0 p-1.5 rounded-lg transition-all active:scale-90"
                  style={{ color: 'var(--text-3)' }} title="Remove">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Btn onClick={doPrint} disabled={totalCount === 0} className="flex-1">Print {totalCount > 0 ? `(${totalCount})` : ''}</Btn>
        {totalCount > 0 && <Btn v="d" onClick={() => { setPrintList([]); setPrintListCrosses([]); setPrintListVirgins([]); setPrintListExps([]); toast.add('Print list cleared'); }}>Clear All</Btn>}
        <Btn v="s" onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
}

/* ========== AMBIENT FLY - desktop only, flies in the margins ========== */
// Double-click the page background to force-spawn a fly
export { crossLabelText };
export default PrintLabelsModal;
