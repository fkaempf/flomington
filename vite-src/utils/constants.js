/* ========== CONSTANTS ========== */

export const USERS = ['Flo', 'Bella', 'Seba', 'Catherine', 'Tomke', 'Shahar', 'Myrto', 'Greg'];

export const STATUSES = ['set up', 'waiting for virgins', 'collecting virgins', 'waiting for progeny', 'collecting progeny', 'screening', 'ripening', 'done'];
export const STATUS_SHORT = ['set', 'w.vgn', 'vgn', 'w.prg', 'coll', 'scr', 'ripe', 'done'];

export const TEMPS = ['25inc', '25room', '18', 'RT'];
export const DEFAULT_CATS = ['No Collection'];

export const STOCK_SOURCES = ['Bloomington', 'VDRC', 'Kyoto', 'Other'];
export const STOCK_VARIANTS = ['stock', 'expanded'];

export const VCS_DEFAULTS = {
  '18_2': { eveningClear: '17:30', morningCollect: '09:30', middayCollect: null, afternoonCollect: '17:00' },
  '18_3': { eveningClear: '17:30', morningCollect: '09:30', middayCollect: '14:00', afternoonCollect: '17:00' },
  '25_2': { eveningClear: '18:00', morningCollect: '09:00', middayCollect: null, afternoonCollect: '14:30' },
  '25_3': { eveningClear: '18:00', morningCollect: '09:00', middayCollect: '12:00', afternoonCollect: '16:30' },
};

export const LABEL_FORMATS = {
  'L7651': { name: 'Avery J8651 / L7651', cols: 5, rows: 13, labelW: 38.1, labelH: 21.2, marginTop: 10.7, marginLeft: 4.75, gapX: 2.5, gapY: 0, pageW: 210, pageH: 297 },
  'L7161': { name: 'Avery J8161 / L7161', cols: 3, rows: 6, labelW: 63.5, labelH: 46.6, marginTop: 8.7, marginLeft: 7.21, gapX: 2.54, gapY: 0, pageW: 210, pageH: 297 },
  'L4736': { name: 'Avery L4736 [removable]', cols: 4, rows: 12, labelW: 45.7, labelH: 21.2, marginTop: 10.7, marginLeft: 10.05, gapX: 2.5, gapY: 0, pageW: 210, pageH: 297, removable: true },
  'L4737': { name: 'Avery L4737 [removable]', cols: 3, rows: 9, labelW: 63.5, labelH: 29.6, marginTop: 13.15, marginLeft: 5.21, gapX: 2.54, gapY: 0, pageW: 210, pageH: 297, removable: true },
};

export const OPTO = ['cschrimson', 'chrimson', 'chr2', 'reachr', 'chrmine', 'chronos', 'cochr', 'gtacr'];
export const CALC = ['gcamp', 'jgcamp', 'rgeco', 'rcamp'];

export const BALANCER_MARKERS = [
  { pattern: /CyO/i, name: 'CyO', phenotype: 'Curly wings', select: 'non-Curly', chromosome: '2nd' },
  { pattern: /TM3/i, name: 'TM3', phenotype: 'Stubble bristles (short)', select: 'non-Stubble', chromosome: '3rd' },
  { pattern: /TM6B/i, name: 'TM6B', phenotype: 'Tubby (short fat larva/pupa) + Humeral', select: 'non-Tubby', chromosome: '3rd' },
  { pattern: /TM6/i, name: 'TM6', phenotype: 'Tubby', select: 'non-Tubby', chromosome: '3rd' },
  { pattern: /FM7/i, name: 'FM7', phenotype: 'Bar eyes (narrow)', select: 'non-Bar', chromosome: 'X' },
  { pattern: /Tb\b/i, name: 'Tb', phenotype: 'Tubby body', select: 'non-Tubby', chromosome: '' },
  { pattern: /Hu\b/i, name: 'Hu', phenotype: 'Humeral (extra bristles on humeri)', select: 'non-Humeral', chromosome: '' },
  { pattern: /Sb\b/i, name: 'Sb', phenotype: 'Stubble (short bristles)', select: 'non-Stubble', chromosome: '' },
  { pattern: /Ser\b/i, name: 'Ser', phenotype: 'Serrate wings', select: 'non-Serrate', chromosome: '' },
  { pattern: /\bw\[/i, name: 'w-', phenotype: 'White eyes', select: 'white-eyed (no mini-white)', chromosome: 'X' },
  { pattern: /\bw\+/i, name: 'w+', phenotype: 'Red/orange eyes (mini-white)', select: 'red/orange-eyed', chromosome: 'X' },
  { pattern: /GFP/i, name: 'GFP', phenotype: 'Green fluorescence', select: 'GFP-positive', chromosome: '' },
  { pattern: /DsRed|RFP|tdTomato/i, name: 'RFP', phenotype: 'Red fluorescence', select: 'RFP-positive', chromosome: '' },
];

export const TAG_STYLE = {
  Dead: { background: 'rgba(239,68,68,0.25)', color: '#fca5a5' },
  Alive: { background: 'rgba(34,197,94,0.25)', color: '#86efac' },
  Opto: { background: 'rgba(239,68,68,0.1)', color: '#fca5a5' },
  Imaging: { background: 'rgba(34,197,94,0.1)', color: '#86efac' },
  AD: { background: 'rgba(249,168,212,0.1)', color: '#f9a8d4' },
  DBD: { background: 'rgba(147,197,253,0.1)', color: '#93c5fd' },
  'Split-GAL4': { background: 'rgba(139,92,246,0.1)', color: '#a78bfa' },
  UAS: { background: 'rgba(251,191,36,0.1)', color: '#fbbf24' },
  Demo: { background: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
};

export const BG_TYPES = ['none', 'grainient', 'particles', 'squares', 'dots', 'snow'];
export const BG_LABELS = { none: 'None', grainient: 'Grainient', particles: 'Particles', squares: 'Squares', dots: 'Dot Grid', snow: 'Pixel Snow' };
