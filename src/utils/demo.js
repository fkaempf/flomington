import { today, addDays } from './dates.js';
import { VCS_DEFAULTS, DEFAULT_CATS } from './constants.js';

function makeDemoData() {
  const t = today();

  // ════════════════════════════════════════════════════════════════════
  // STOCKS - 24 entries
  // Coverage matrix:
  //   Temps:        25inc (8), 25room (4), 18 (7), RT (5)
  //   Variants:     expanded (7), stock (17)
  //   Collections:  Lab Stocks (7), Flo Stocks 1 (6), Flo Stocks 2 (5), No Collection (4), Opto Tools (2)
  //   Sources:      Bloomington (5), VDRC (3), Kyoto (2), Other (1), gift-only (3), none (10)
  //   Maintainers:  Flo (4), Bella (3), Seba (3), Catherine (3), Tomke (3), Shahar (3), Myrto (3), none (2)
  //   Flip status:  overdue 100%+ (4), near 80-99% (4), mid 40-79% (6), fresh <40% (8), exact threshold (2)
  //   Opto:         CsChrimson (2), Chrimson (1), ReaChR (1), GtACR (1)
  //   Imaging:      GCaMP/jGCaMP (3), RCaMP (1)
  //   FlyBase IDs:  6 stocks with, 18 without
  // ════════════════════════════════════════════════════════════════════
  const stocks = [
    // ── EXPANDED VARIANTS (7) ──────────────────────────────────────────
    // s1: Expanded, 25inc, Lab Stocks, OVERDUE (10d of 7d → 143%)
    //     Flo, Bloomington + FlyBase
    { id: 's1', name: 'Oregon-R', genotype: '+', location: '25inc',
      createdAt: addDays(t, -60), lastFlipped: addDays(t, -10),
      notes: 'Wild type reference strain - expanded, overdue for flip',
      variant: 'expanded', category: 'Lab Stocks', maintainer: 'Flo',
      source: 'Bloomington', sourceId: '25211', flybaseId: 'FBst0025211',
      vcs: { enabled: true, overnightAt18: true, collectionsPerDay: 2,
        schedule: { eveningClear: '17:30', morningCollect: '09:30', middayCollect: null, afternoonCollect: '17:00' },
        lastClearTime: new Date(new Date().setHours(17, 30, 0, 0) - 86400000).toISOString(),
        lastClearTemp: '18', virginDeadline: null, todayActions: [], createdAt: addDays(t, -14) } },
    // s2: Expanded, 25room, No Collection, recently flipped (3d of 7d → 43%)
    //     Bella, no source
    { id: 's2', name: 'w1118', genotype: 'w[1118]', location: '25room',
      createdAt: addDays(t, -45), lastFlipped: addDays(t, -3),
      notes: 'White-eyed host - expanded, recently flipped',
      variant: 'expanded', category: 'No Collection', maintainer: 'Bella',
      vcs: { enabled: true, overnightAt18: false, collectionsPerDay: 3,
        schedule: { eveningClear: '18:00', morningCollect: '09:00', middayCollect: '12:00', afternoonCollect: '16:30' },
        lastClearTime: new Date(new Date().setHours(18, 0, 0, 0) - 86400000).toISOString(),
        lastClearTemp: '25', virginDeadline: null, todayActions: [], createdAt: addDays(t, -7) } },
    // s3: Expanded, RT, Flo Stocks 2, near flip (6d of 7d → 86%)
    //     Shahar, Kyoto source, VCS 25°C 2×
    { id: 's3', name: 'Canton-S', genotype: '+', location: 'RT',
      createdAt: addDays(t, -120), lastFlipped: addDays(t, -6),
      notes: 'Wild type, good for behaviour - expanded at RT',
      variant: 'expanded', category: 'Flo Stocks 2', maintainer: 'Shahar',
      source: 'Kyoto', sourceId: '105666',
      vcs: { enabled: true, overnightAt18: false, collectionsPerDay: 2,
        schedule: { eveningClear: '18:00', morningCollect: '09:00', middayCollect: null, afternoonCollect: '14:30' },
        lastClearTime: new Date(new Date().setHours(18, 0, 0, 0) - 86400000).toISOString(),
        lastClearTemp: '25', virginDeadline: null,
        todayActions: [{ type: 'collect', key: 'morning', time: new Date(new Date().setHours(9, 15, 0, 0)).toISOString(), scheduled: '09:00' }],
        createdAt: addDays(t, -10) } },
    // s4e: Expanded, 18C, Lab Stocks, fresh (1d of 7d → 14%)
    //     Flo, Bloomington + FlyBase, VCS 18°C 3×
    { id: 's4e', name: 'yw (expanded)', genotype: 'y[1] w[1]', location: '18',
      createdAt: addDays(t, -30), lastFlipped: addDays(t, -1),
      notes: 'Yellow-white host line - expanded backup at 18C, just flipped',
      variant: 'expanded', category: 'Lab Stocks', maintainer: 'Flo',
      source: 'Bloomington', sourceId: '1495', flybaseId: 'FBst0001495',
      vcs: { enabled: true, overnightAt18: true, collectionsPerDay: 3,
        schedule: { eveningClear: '17:30', morningCollect: '09:30', middayCollect: '14:00', afternoonCollect: '17:00' },
        lastClearTime: new Date(new Date().setHours(17, 45, 0, 0) - 86400000).toISOString(),
        lastClearTemp: '18', virginDeadline: null, todayActions: [], createdAt: addDays(t, -5) } },
    // s24: Expanded, 25inc, Flo Stocks 1, mid (4d of 7d → 57%)
    //     Flo, no source, VCS 25°C 3×
    { id: 's24', name: 'w[*] (expanded)', genotype: 'w[*]', location: '25inc',
      createdAt: addDays(t, -80), lastFlipped: addDays(t, -4),
      notes: 'White-star host for injections - expanded',
      variant: 'expanded', category: 'Flo Stocks 1', maintainer: 'Flo',
      vcs: { enabled: true, overnightAt18: false, collectionsPerDay: 3,
        schedule: { eveningClear: '18:00', morningCollect: '09:00', middayCollect: '12:00', afternoonCollect: '16:30' },
        lastClearTime: new Date(new Date().setHours(9, 30, 0, 0)).toISOString(),
        lastClearTemp: '25', virginDeadline: null,
        todayActions: [{ type: 'collect', key: 'morning', time: new Date(new Date().setHours(9, 30, 0, 0)).toISOString(), scheduled: '09:00' }],
        createdAt: addDays(t, -21) } },
    // s25: Expanded, RT, No Collection, OVERDUE (9d of 7d → 129%)
    //     Myrto, no source
    { id: 's25', name: 'Berlin-K', genotype: '+', location: 'RT',
      createdAt: addDays(t, -90), lastFlipped: addDays(t, -9),
      notes: 'Wild type Berlin strain - expanded at RT, overdue',
      variant: 'expanded', category: 'No Collection', maintainer: 'Myrto' },
    // s26: Expanded, 25room, Flo Stocks 2, exact threshold (7d of 7d → 100%)
    //     Shahar, gift from Dickson Lab
    { id: 's26', name: 'Iso31 (expanded)', genotype: 'w[1118] iso31', location: '25room',
      createdAt: addDays(t, -40), lastFlipped: addDays(t, -7),
      notes: 'Isogenic w1118 - expanded, exactly at flip threshold',
      variant: 'expanded', category: 'Flo Stocks 2', maintainer: 'Shahar',
      isGift: true, giftFrom: 'Dickson Lab' },

    // ── OPTO STOCKS (5) ────────────────────────────────────────────────
    // s4: Stock, 18C, Lab Stocks, OVERDUE (50d of 42d → 119%)
    //     Flo, Bloomington + FlyBase, CsChrimson
    { id: 's4', name: 'UAS-CsChrimson', genotype: 'w[*]; P{20XUAS-IVS-CsChrimson.mVenus}attP18',
      location: '18', createdAt: addDays(t, -90), lastFlipped: addDays(t, -50),
      notes: 'Channelrhodopsin for optogenetics - overdue at 18C',
      variant: 'stock', category: 'Lab Stocks', maintainer: 'Flo',
      source: 'Bloomington', sourceId: '79039', flybaseId: 'FBst0079039' },
    // s5: Stock, 25inc, Lab Stocks, fresh (2d of 14d → 14%)
    //     Seba, no source, CsChrimson split-GAL4
    { id: 's5', name: 'R58E02-AD; R40F04-DBD > CsChrimson',
      genotype: 'w[*]; P{R58E02-p65.AD}attP40/CyO; P{R40F04-GAL4.DBD}attP2/P{20XUAS-CsChrimson.mVenus}attP18',
      location: '25inc', createdAt: addDays(t, -20), lastFlipped: addDays(t, -2),
      notes: 'Split-GAL4 CsChrimson line for optogenetics',
      variant: 'stock', category: 'Lab Stocks', maintainer: 'Flo' },
    // s6: Stock, 25inc, Flo Stocks 2, near flip (13d of 14d → 93%)
    //     Tomke, no source, CsChrimson MBON split
    { id: 's6', name: 'MB298B > CsChrimson',
      genotype: 'w[*]; P{R19F09-p65.AD}attP40/P{20XUAS-CsChrimson.mVenus}su(Hw)attP5; P{R25D01-GAL4.DBD}attP2',
      location: '25inc', createdAt: addDays(t, -15), lastFlipped: addDays(t, -13),
      notes: 'MBON split for opto, near flip threshold',
      variant: 'stock', category: 'Flo Stocks 2', maintainer: 'Shahar' },
    // s7: Stock, 25inc, Lab Stocks, mid (8d of 14d → 57%), gift from Bhatt Lab
    //     Shahar, GtACR1 (OPTO detect)
    { id: 's7', name: 'UAS-GtACR1',
      genotype: 'w[*]; P{20XUAS-GtACR1-EYFP}attP2',
      location: '25inc', createdAt: addDays(t, -25), lastFlipped: addDays(t, -8),
      notes: 'Anion channelrhodopsin for silencing - gift from Bhatt Lab',
      variant: 'stock', category: 'Lab Stocks', maintainer: 'Flo',
      isGift: true, giftFrom: 'Bhatt Lab', flybaseId: 'FBtp0131990' },
    // s17: Stock, 18C, Opto Tools, fresh (5d of 42d → 12%)
    //     Bella, Bloomington, ReaChR (OPTO detect)
    { id: 's17', name: 'UAS-ReaChR',
      genotype: 'w[*]; P{20XUAS-IVS-ReaChR}attP2',
      location: '18', createdAt: addDays(t, -60), lastFlipped: addDays(t, -5),
      notes: 'Red-shifted channelrhodopsin for deep-tissue opto',
      variant: 'stock', category: 'Opto Tools', maintainer: 'Bella',
      source: 'Bloomington', sourceId: '53741', flybaseId: 'FBst0053741' },
    // s18: Stock, RT, Opto Tools, near (24d of 28d → 86%)
    //     Catherine, gift from Jayaraman Lab, Chrimson (OPTO detect - distinct from CsChrimson)
    { id: 's18', name: 'UAS-Chrimson',
      genotype: 'w[*]; P{20XUAS-IVS-Chrimson.mVenus}attP18',
      location: 'RT', createdAt: addDays(t, -70), lastFlipped: addDays(t, -24),
      notes: 'Chrimson (non-Cs variant) for opto - gift from Jayaraman Lab',
      variant: 'stock', category: 'Opto Tools', maintainer: 'Bella',
      isGift: true, giftFrom: 'Jayaraman Lab' },

    // ── CALCIUM / IMAGING STOCKS (4) ───────────────────────────────────
    // s8: Stock, 18C, Lab Stocks, near (38d of 42d → 90%), gift from Jefferis Lab
    //     Flo, jGCaMP7f (CALC detect)
    { id: 's8', name: 'UAS-jGCaMP7f',
      genotype: 'w[*]; P{20XUAS-jGCaMP7f}VK5',
      location: '18', createdAt: addDays(t, -30), lastFlipped: addDays(t, -38),
      notes: 'Fast calcium indicator - gift from Jefferis Lab',
      variant: 'stock', category: 'Lab Stocks', maintainer: 'Flo',
      isGift: true, giftFrom: 'Jefferis Lab' },
    // s9: Stock, 25inc, Flo Stocks 1, mid (5d of 14d → 36%)
    //     Myrto, no source, jGCaMP8m MBON split (CALC detect)
    { id: 's9', name: 'MBON-a1 > GCaMP8m',
      genotype: 'w[*]; P{R12G04-p65.AD}attP40/P{20XUAS-jGCaMP8m}attP40; P{VT060727-GAL4.DBD}attP2',
      location: '25inc', createdAt: addDays(t, -35), lastFlipped: addDays(t, -5),
      notes: 'MBON split-GAL4 with GCaMP8m for 2P imaging',
      variant: 'stock', category: 'Flo Stocks 1', maintainer: 'Flo' },
    // s10: Stock, 18C, Flo Stocks 1, mid (14d of 42d → 33%)
    //     Flo, VDRC, RCaMP (CALC detect)
    { id: 's10', name: 'UAS-RCaMP1.07',
      genotype: 'w[*]; P{UAS-RCaMP1.07}2',
      location: '18', createdAt: addDays(t, -55), lastFlipped: addDays(t, -14),
      notes: 'Red calcium indicator for dual-color imaging - from VDRC',
      variant: 'stock', category: 'Flo Stocks 1', maintainer: 'Flo',
      source: 'VDRC', sourceId: '330328' },
    // s19: Stock, 25room, Flo Stocks 1, fresh (2d of 14d → 14%)
    //     Myrto, no source, GCaMP6s (CALC detect)
    { id: 's19', name: 'UAS-GCaMP6s',
      genotype: 'w[*]; P{20XUAS-IVS-GCaMP6s}attP40',
      location: '25room', createdAt: addDays(t, -50), lastFlipped: addDays(t, -2),
      notes: 'Slow GCaMP6s for sustained calcium signals',
      variant: 'stock', category: 'Flo Stocks 1', maintainer: 'Flo' },

    // ── DRIVER & REPORTER STOCKS (8) ───────────────────────────────────
    // s11: Stock, 25inc, Flo Stocks 1, near (11d of 14d → 79%)
    //     Flo, Bloomington + FlyBase, balanced 2nd
    { id: 's11', name: 'elav-GAL4',
      genotype: 'P{GAL4-elav.L}2/CyO',
      location: '25inc', createdAt: addDays(t, -90), lastFlipped: addDays(t, -11),
      notes: 'Pan-neuronal driver - near flip threshold',
      variant: 'stock', category: 'Flo Stocks 1', maintainer: 'Flo',
      source: 'Bloomington', sourceId: '8765', flybaseId: 'FBst0008765' },
    // s12: Stock, 25room, No Collection, mid (10d of 14d → 71%)
    //     Catherine, no source
    { id: 's12', name: 'GMR-GAL4',
      genotype: 'P{GAL4-ninaE.GMR}12',
      location: '25room', createdAt: addDays(t, -90), lastFlipped: addDays(t, -10),
      notes: 'Eye-specific driver - No Collection category',
      variant: 'stock', category: 'No Collection', maintainer: 'Catherine' },
    // s13: Stock, 18C, Lab Stocks, fresh (4d of 42d → 10%)
    //     Seba, Bloomington + FlyBase, balanced 3rd (TM3/TM6B)
    { id: 's13', name: 'UAS-mCD8::GFP',
      genotype: 'w[*]; P{UAS-mCD8.GFP}LL5; TM3,Sb[1]/TM6B,Tb[1]',
      location: '18', createdAt: addDays(t, -50), lastFlipped: addDays(t, -4),
      notes: 'Membrane GFP, balanced 3rd - from Bloomington',
      variant: 'stock', category: 'Lab Stocks', maintainer: 'Flo',
      source: 'Bloomington', sourceId: '5130', flybaseId: 'FBst0005130' },
    // s14: Stock, 25inc, Flo Stocks 1, mid (7d of 14d → 50%)
    //     Tomke, VDRC
    { id: 's14', name: 'TH-GAL4 (VDRC)',
      genotype: 'P{GAL4-TH.D}D',
      location: '25inc', createdAt: addDays(t, -40), lastFlipped: addDays(t, -7),
      notes: 'Dopaminergic driver - from VDRC',
      variant: 'stock', category: 'Flo Stocks 1', maintainer: 'Flo',
      source: 'VDRC', sourceId: '108170' },
    // s15: Stock, RT, Flo Stocks 2, OVERDUE (30d of 28d → 107%)
    //     Shahar, Other source, gift from Rubin Lab
    { id: 's15', name: 'MB247-DsRed',
      genotype: 'w[*]; P{MB247-DsRed}1',
      location: 'RT', createdAt: addDays(t, -100), lastFlipped: addDays(t, -30),
      notes: 'Mushroom body reporter - gift from Rubin Lab, overdue at RT',
      variant: 'stock', category: 'Flo Stocks 2', maintainer: 'Shahar',
      source: 'Other', sourceId: '', isGift: true, giftFrom: 'Rubin Lab' },
    // s16: Stock, 25inc, Lab Stocks, exact threshold (14d of 14d → 100%)
    //     NO MAINTAINER, Kyoto + FlyBase
    { id: 's16', name: 'nSyb-GAL4',
      genotype: 'w[*]; P{nSyb-GAL4.S}3',
      location: '25inc', createdAt: addDays(t, -70), lastFlipped: addDays(t, -14),
      notes: 'Pan-neuronal driver (nSynaptobrevin) - exactly at flip day, unclaimed',
      variant: 'stock', category: 'Lab Stocks', maintainer: 'Flo',
      source: 'Kyoto', sourceId: '200228', flybaseId: 'FBst0500064' },
    // s20: Stock, RT, Flo Stocks 2, mid (15d of 28d → 54%)
    //     Tomke, VDRC, mushroom body driver
    { id: 's20', name: 'VT30559-GAL4',
      genotype: 'w[1118]; P{VT030559-GAL4.DBD}attP2',
      location: 'RT', createdAt: addDays(t, -65), lastFlipped: addDays(t, -15),
      notes: 'KC driver for mushroom body experiments',
      variant: 'stock', category: 'Flo Stocks 2', maintainer: 'Shahar',
      source: 'VDRC', sourceId: '200228' },
    // s21: Stock, 25room, No Collection, fresh (1d of 14d → 7%)
    //     NO MAINTAINER, no source - new arrival, not yet assigned
    { id: 's21', name: 'Repo-GAL4',
      genotype: 'w[*]; P{GAL4-repo}1/TM3,Sb[1]',
      location: '25room', createdAt: addDays(t, -1), lastFlipped: addDays(t, -1),
      notes: 'Glial driver - just arrived, needs assignment',
      variant: 'stock', category: 'No Collection' },
    // s22: Stock, 18C, Flo Stocks 2, OVERDUE (48d of 42d → 114%)
    //     Shahar, no source
    { id: 's22', name: 'OR-R (stock)',
      genotype: '+',
      location: '18', createdAt: addDays(t, -110), lastFlipped: addDays(t, -48),
      notes: 'Oregon-R stock backup at 18C - overdue',
      variant: 'stock', category: 'Flo Stocks 2', maintainer: 'Shahar' },
    // s23: Stock, RT, Flo Stocks 1, mid (12d of 28d → 43%)
    //     Seba, Kyoto source
    { id: 's23', name: 'fruP1-GAL4',
      genotype: 'w[*]; P{fruP1-GAL4}1',
      location: 'RT', createdAt: addDays(t, -45), lastFlipped: addDays(t, -12),
      notes: 'Fruitless driver for courtship circuits',
      variant: 'stock', category: 'Flo Stocks 1', maintainer: 'Flo',
      source: 'Kyoto', sourceId: '108522' },
  ];

  // ════════════════════════════════════════════════════════════════════
  // CROSSES - 20 entries
  // Coverage matrix:
  //   Statuses:     set up (2), waiting for virgins (2), collecting virgins (3),
  //                 waiting for progeny (2), collecting progeny (2), ripening (3),
  //                 screening (2), done (4)
  //   Temps:        25inc (12), 25room (3), 18 (4), RT (1)
  //   Opto ripening (3d): c6 (ripening), c13 (ripening, near done)
  //   GCaMP ripening (5d): c14 (ripening, mid)
  //   Skip ripening (no opto/calc): c4 (waiting for progeny), c8 (done), c15 (collecting progeny)
  //   Experiment types: optogenetics (5), 2p (4), 2p+vr (2), behavior (3),
  //                     flydisco (2), vr (1), dissection (1), other (1), none (1)
  //   Cross types:  simple (18), sequential (2)
  //   Owners:       Flo (3), Bella (3), Seba (3), Catherine (3), Tomke (2),
  //                 Shahar (3), Myrto (3)
  // ════════════════════════════════════════════════════════════════════
  const crosses = [
    // ── STATUS: 'set up' (2) ───────────────────────────────────────────
    // c1: set up, opto, 25inc, Flo
    //     elav-GAL4 (s11) x UAS-CsChrimson (s4)
    { id: 'c1', parentA: 's11', parentB: 's4', temperature: '25inc',
      setupDate: addDays(t, -3), status: 'set up', owner: 'Flo',
      notes: 'elav > CsChrimson for optogenetics behavior assay',
      targetCount: 30, collected: [], vials: [],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: 'optogenetics', experimentDate: addDays(t, 15),
      retinalStartDate: '' },
    // c9: set up, 2p+vr, 18C, Myrto
    //     MBON GCaMP (s9) x UAS-mCD8::GFP (s13), slow timeline
    { id: 'c9', parentA: 's9', parentB: 's13', temperature: '18',
      setupDate: addDays(t, -5), status: 'set up', owner: 'Myrto',
      notes: 'GCaMP imaging with VR at 18C - slow timeline',
      targetCount: 15, collected: [], vials: [],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: '2p+vr', experimentDate: '',
      retinalStartDate: '' },

    // ── STATUS: 'waiting for virgins' (2) ──────────────────────────────
    // c2: waiting for virgins, opto, 25inc, Seba, near auto-promote (8d of 9d)
    //     R58E02 CsChrimson (s5) x Canton-S (s3)
    { id: 'c2', parentA: 's5', parentB: 's3', temperature: '25inc',
      setupDate: addDays(t, -8), status: 'waiting for virgins', owner: 'Seba',
      notes: 'Opto cross - near auto-promote threshold',
      targetCount: 25, collected: [], vials: [],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: 'optogenetics', experimentDate: addDays(t, 10),
      retinalStartDate: addDays(t, -3) },
    // c13w: waiting for virgins, dissection, 18C, Bella, early (3d of 17d)
    //       TH-GAL4 (s14) x UAS-mCD8::GFP (s13)
    { id: 'c13w', parentA: 's14', parentB: 's13', temperature: '18',
      setupDate: addDays(t, -3), status: 'waiting for virgins', owner: 'Bella',
      notes: 'TH-GAL4 x GFP for dopaminergic neuron dissection at 18C',
      targetCount: 10, collected: [], vials: [],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: 'dissection', experimentDate: addDays(t, 30),
      retinalStartDate: '' },

    // ── STATUS: 'collecting virgins' (3) ───────────────────────────────
    // c3: collecting virgins, 2p, 25inc, Myrto, partial (5 of 5)
    //     MBON GCaMP (s9) x UAS-jGCaMP7f (s8)
    { id: 'c3', parentA: 's9', parentB: 's8', temperature: '25inc',
      setupDate: addDays(t, -10), status: 'collecting virgins', owner: 'Myrto',
      notes: 'GCaMP imaging cross - collecting virgins now',
      targetCount: 20, collected: [], vials: [],
      virginsCollected: 5, overnightAt18: true,
      vcs: { enabled: true, overnightAt18: true, collectionsPerDay: 2,
        schedule: { ...VCS_DEFAULTS['18_2'] },
        lastClearTime: new Date(new Date().setHours(17, 30, 0, 0) - 86400000).toISOString(),
        lastClearTemp: '18', virginDeadline: null,
        todayActions: [{ type: 'collect', key: 'morning', time: new Date(new Date().setHours(9, 30, 0, 0)).toISOString() }],
        createdAt: addDays(t, -1) },
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: '2p', experimentDate: addDays(t, 5),
      retinalStartDate: '' },
    // c10: collecting virgins, opto, 25inc, Seba, partial (3 of 5)
    //      UAS-CsChrimson (s4) x TH-GAL4 (s14)
    { id: 'c10', parentA: 's4', parentB: 's14', temperature: '25inc',
      setupDate: addDays(t, -10), status: 'collecting virgins', owner: 'Seba',
      notes: 'CsChrimson x TH - partially collected virgins',
      targetCount: 20, collected: [], vials: [],
      virginsCollected: 3, overnightAt18: false,
      vcs: { enabled: true, overnightAt18: false, collectionsPerDay: 2,
        schedule: { ...VCS_DEFAULTS['25_2'] },
        lastClearTime: new Date(new Date().setHours(18, 0, 0, 0) - 86400000).toISOString(),
        lastClearTemp: '25', virginDeadline: null,
        todayActions: [],
        createdAt: addDays(t, -1) },
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: 'optogenetics', experimentDate: addDays(t, 8),
      retinalStartDate: addDays(t, -5) },
    // c16: collecting virgins, flydisco, 25room, Catherine, just started (0 of 5)
    //      VT30559-GAL4 (s20) x UAS-CsChrimson (s4)
    { id: 'c16', parentA: 's20', parentB: 's4', temperature: '25room',
      setupDate: addDays(t, -10), status: 'collecting virgins', owner: 'Catherine',
      notes: 'FlyDisco arena cross - just started collecting',
      targetCount: 20, collected: [], vials: [],
      virginsCollected: 0, overnightAt18: true,
      vcs: { enabled: true, overnightAt18: true, collectionsPerDay: 3,
        schedule: { ...VCS_DEFAULTS['18_3'] },
        lastClearTime: null, lastClearTemp: '18', virginDeadline: null,
        todayActions: [],
        createdAt: addDays(t, -1) },
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: 'flydisco', experimentDate: addDays(t, 12),
      retinalStartDate: '' },

    // ── STATUS: 'waiting for progeny' (2) ──────────────────────────────
    // c4: waiting for progeny, no experiment type, 25inc, Catherine
    //     GMR-GAL4 (s12) x UAS-mCD8::GFP (s13) - skip-ripening (no opto/calc)
    { id: 'c4', parentA: 's12', parentB: 's13', temperature: '25inc',
      setupDate: addDays(t, -14), status: 'waiting for progeny', owner: 'Catherine',
      waitStartDate: addDays(t, -4),
      notes: 'Eye expression test - waiting for progeny to emerge (will skip ripening)',
      targetCount: 40, collected: [], vials: [],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: '', experimentDate: '', retinalStartDate: '' },
    // c11: waiting for progeny, 2p, 18C, Flo, slow timeline
    //      UAS-jGCaMP7f (s8) x UAS-CsChrimson (s4) - dual opto+calc
    { id: 'c11', parentA: 's8', parentB: 's4', temperature: '18',
      setupDate: addDays(t, -22), status: 'waiting for progeny', owner: 'Flo',
      waitStartDate: addDays(t, -3),
      notes: 'GCaMP x CsChrimson at 18C - slow progeny timeline',
      targetCount: 25, collected: [], vials: [],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: '2p', experimentDate: addDays(t, 14),
      retinalStartDate: '' },

    // ── STATUS: 'collecting progeny' (2) ───────────────────────────────
    // c5: collecting progeny, 2p, 25inc, Flo, with collected + vials
    //     elav-GAL4 (s11) x UAS-jGCaMP7f (s8)
    { id: 'c5', parentA: 's11', parentB: 's8', temperature: '25inc',
      setupDate: addDays(t, -18), status: 'collecting progeny', owner: 'Flo',
      waitStartDate: addDays(t, -9),
      notes: 'Neuronal GCaMP cross - collecting progeny now',
      targetCount: 50,
      collected: [
        { date: addDays(t, -3), count: 8 },
        { date: addDays(t, -2), count: 12 },
        { date: addDays(t, -1), count: 6 }
      ],
      vials: [
        { id: 'v1', setupDate: addDays(t, -16), notes: 'Re-vial 1' },
        { id: 'v2', setupDate: addDays(t, -13), notes: 'Re-vial 2' }
      ],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: '2p', experimentDate: addDays(t, 3),
      retinalStartDate: '' },
    // c15: collecting progeny, behavior (no opto/calc → will skip ripening), 25room, Shahar
    //      Canton-S (s3) x w1118 (s2) - control cross, recently started collecting
    { id: 'c15', parentA: 's3', parentB: 's2', temperature: '25room',
      setupDate: addDays(t, -16), status: 'collecting progeny', owner: 'Shahar',
      waitStartDate: addDays(t, -7),
      notes: 'Wild type control for behaviour - no opto/calc, will skip ripening',
      targetCount: 30,
      collected: [
        { date: addDays(t, -1), count: 5 },
        { date: addDays(t, 0), count: 7 }
      ],
      vials: [],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: 'behavior', experimentDate: addDays(t, 5),
      retinalStartDate: '' },

    // ── STATUS: 'ripening' (3) - opto 3d, imaging 5d, and dual ────────
    // c6: ripening, opto (CsChrimson → 3d), 25inc, Tomke
    //     TH-GAL4 (s14) x MB298B > CsChrimson (s6), 2d in → 1d remaining
    { id: 'c6', parentA: 's14', parentB: 's6', temperature: '25inc',
      setupDate: addDays(t, -22), status: 'ripening', owner: 'Tomke',
      waitStartDate: addDays(t, -12),
      ripeningStartDate: addDays(t, -2),
      notes: 'TH > CsChrimson - ripening before opto experiment (3d retinal)',
      targetCount: 30,
      collected: [
        { date: addDays(t, -5), count: 10 },
        { date: addDays(t, -4), count: 9 },
        { date: addDays(t, -3), count: 11 }
      ],
      vials: [],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: 'optogenetics', experimentDate: addDays(t, 2),
      retinalStartDate: addDays(t, -8) },
    // c13: ripening, opto (ReaChR → 3d), 25inc, Shahar, exactly at 3d → ready
    //      UAS-ReaChR (s17) x nSyb-GAL4 (s16)
    { id: 'c13', parentA: 's17', parentB: 's16', temperature: '25inc',
      setupDate: addDays(t, -24), status: 'ripening', owner: 'Shahar',
      waitStartDate: addDays(t, -14),
      ripeningStartDate: addDays(t, -3),
      notes: 'nSyb > ReaChR - ripening complete, ready to screen',
      targetCount: 25,
      collected: [
        { date: addDays(t, -7), count: 8 },
        { date: addDays(t, -6), count: 10 },
        { date: addDays(t, -5), count: 7 }
      ],
      vials: [{ id: 'v4', setupDate: addDays(t, -22), notes: 'Re-vial 1' }],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: 'optogenetics', experimentDate: addDays(t, 1),
      retinalStartDate: addDays(t, -10) },
    // c14: ripening, imaging (GCaMP → 5d), 18C, Myrto, 2d in → 3d remaining
    //      UAS-GCaMP6s (s19) x elav-GAL4 (s11)
    { id: 'c14', parentA: 's19', parentB: 's11', temperature: '18',
      setupDate: addDays(t, -30), status: 'ripening', owner: 'Myrto',
      waitStartDate: addDays(t, -10),
      ripeningStartDate: addDays(t, -2),
      notes: 'GCaMP6s pan-neuronal - ripening for GCaMP expression (5d)',
      targetCount: 15,
      collected: [
        { date: addDays(t, -4), count: 5 },
        { date: addDays(t, -3), count: 4 },
        { date: addDays(t, -2), count: 6 }
      ],
      vials: [],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: '2p', experimentDate: addDays(t, 5),
      retinalStartDate: '' },

    // ── STATUS: 'screening' (2) ────────────────────────────────────────
    // c7: screening, opto, 25inc, Bella
    //     UAS-GtACR1 (s7) x nSyb-GAL4 (s16) - GtACR inhibition
    { id: 'c7', parentA: 's7', parentB: 's16', temperature: '25inc',
      setupDate: addDays(t, -25), status: 'screening', owner: 'Bella',
      waitStartDate: addDays(t, -15),
      notes: 'nSyb > GtACR1 silencing - screening for correct genotype',
      targetCount: 30,
      collected: [
        { date: addDays(t, -6), count: 10 },
        { date: addDays(t, -5), count: 8 },
        { date: addDays(t, -4), count: 7 }
      ],
      vials: [],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: 'optogenetics', experimentDate: addDays(t, 1),
      retinalStartDate: addDays(t, -10) },
    // c17: screening, flydisco (no opto/calc), 25room, Tomke
    //      fruP1-GAL4 (s23) x MB247-DsRed (s15), sequential cross from c8
    { id: 'c17', parentA: 's23', parentB: 's15', temperature: '25room',
      setupDate: addDays(t, -28), status: 'screening', owner: 'Tomke',
      waitStartDate: addDays(t, -18),
      notes: 'F1 courtship screen from initial cross - screening DsRed+ / GAL4+',
      targetCount: 20,
      collected: [
        { date: addDays(t, -9), count: 7 },
        { date: addDays(t, -8), count: 6 },
        { date: addDays(t, -7), count: 7 }
      ],
      vials: [{ id: 'v5', setupDate: addDays(t, -26), notes: 'Re-vial 1' }],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'sequential', parentCrossId: 'c8',
      experimentType: 'flydisco', experimentDate: addDays(t, 3),
      retinalStartDate: '' },

    // ── STATUS: 'done' (4) ─────────────────────────────────────────────
    // c8: done, behavior, 25inc, Bella, control cross
    //     Canton-S (s3) x Oregon-R (s1)
    { id: 'c8', parentA: 's3', parentB: 's1', temperature: '25inc',
      setupDate: addDays(t, -35), status: 'done', owner: 'Bella',
      waitStartDate: addDays(t, -25),
      notes: 'Control cross for behaviour - completed',
      targetCount: 50,
      collected: [
        { date: addDays(t, -20), count: 15 },
        { date: addDays(t, -19), count: 20 },
        { date: addDays(t, -18), count: 15 }
      ],
      vials: [],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: 'behavior', experimentDate: addDays(t, -15),
      retinalStartDate: '' },
    // c12: done, 2p, 25room, Catherine, with re-vial
    //      UAS-RCaMP (s10) x elav-GAL4 (s11)
    { id: 'c12', parentA: 's10', parentB: 's11', temperature: '25room',
      setupDate: addDays(t, -40), status: 'done', owner: 'Catherine',
      waitStartDate: addDays(t, -30),
      notes: 'RCaMP pan-neuronal imaging - completed',
      targetCount: 35,
      collected: [
        { date: addDays(t, -25), count: 12 },
        { date: addDays(t, -24), count: 14 },
        { date: addDays(t, -23), count: 9 }
      ],
      vials: [{ id: 'v3', setupDate: addDays(t, -38), notes: 'Re-vial 1' }],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: '2p', experimentDate: addDays(t, -20),
      retinalStartDate: '' },
    // c18: done, vr, 25inc, Seba, completed VR experiment
    //      UAS-Chrimson (s18) x elav-GAL4 (s11)
    { id: 'c18', parentA: 's18', parentB: 's11', temperature: '25inc',
      setupDate: addDays(t, -32), status: 'done', owner: 'Seba',
      waitStartDate: addDays(t, -22),
      notes: 'Chrimson pan-neuronal for VR closed-loop - completed',
      targetCount: 15,
      collected: [
        { date: addDays(t, -15), count: 5 },
        { date: addDays(t, -14), count: 6 },
        { date: addDays(t, -13), count: 4 }
      ],
      vials: [],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: 'vr', experimentDate: addDays(t, -10),
      retinalStartDate: addDays(t, -18) },
    // c19: done, other, 18C, Catherine, completed custom experiment (sequential)
    //      UAS-mCD8::GFP (s13) x GMR-GAL4 (s12)
    { id: 'c19', parentA: 's13', parentB: 's12', temperature: '18',
      setupDate: addDays(t, -50), status: 'done', owner: 'Catherine',
      waitStartDate: addDays(t, -35),
      notes: 'F1 balanced cross for eye-specific GFP - completed',
      targetCount: 20,
      collected: [
        { date: addDays(t, -28), count: 8 },
        { date: addDays(t, -27), count: 7 },
        { date: addDays(t, -26), count: 5 }
      ],
      vials: [{ id: 'v6', setupDate: addDays(t, -48), notes: 'Re-vial 1' }],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'sequential', parentCrossId: '',
      experimentType: 'other', experimentDate: addDays(t, -22),
      retinalStartDate: '' },

    // ── ADDITIONAL CROSSES for coverage gaps ────────────────────────────
    // c20: waiting for progeny, behavior (no opto/calc), RT, Shahar
    //      Berlin-K (s25) x Canton-S (s3) - wild type cross at RT
    { id: 'c20', parentA: 's25', parentB: 's3', temperature: 'RT',
      setupDate: addDays(t, -12), status: 'waiting for progeny', owner: 'Shahar',
      waitStartDate: addDays(t, -2),
      notes: 'Wild type cross at RT - slow development, no opto/calc',
      targetCount: 20, collected: [], vials: [],
      manualFlipDate: '', manualEcloseDate: '', manualVirginDate: '',
      crossType: 'simple', parentCrossId: '',
      experimentType: 'behavior', experimentDate: addDays(t, 18),
      retinalStartDate: '' },
  ];

  // ════════════════════════════════════════════════════════════════════
  // VIRGIN BANK - entries for various stocks
  // ════════════════════════════════════════════════════════════════════
  const virginBank = {
    's4': 8,   // UAS-CsChrimson - enough banked virgins to auto-skip collecting
    's5': 3,   // R58E02 CsChrimson split - partial bank
    's11': 12, // elav-GAL4 - well stocked
    's9': 5,   // MBON GCaMP - moderate bank
    's8': 2,   // UAS-jGCaMP7f - very low bank
    's17': 6,  // UAS-ReaChR - decent bank
    's3': 4,   // Canton-S - some virgins
    's14': 1,  // TH-GAL4 - minimal bank
  };

  // ════════════════════════════════════════════════════════════════════
  // EXP BANK - experimental animals collected from crosses/stocks
  // ════════════════════════════════════════════════════════════════════
  const expBank = {
    'c5': { m: 8, f: 12, source: 'cross' },   // elav-GAL4 x UAS-jGCaMP7f - collecting progeny
    'c15': { m: 3, f: 5, source: 'cross' },    // Canton-S x w1118 - collecting progeny
    's3': { m: 2, f: 4, source: 'stock' },      // Canton-S - direct from stock
  };

  // ════════════════════════════════════════════════════════════════════
  // TRANSFERS - pending requests between users
  // Types: stock (maintainership), cross (ownership), collection (all stocks in cat)
  // ════════════════════════════════════════════════════════════════════
  const transfers = [
    // Flo wants to transfer s16 (nSyb-GAL4, unclaimed) maintainership to Tomke
    { id: 'tx1', from: 'Flo', to: 'Tomke', type: 'stock', itemId: 's16',
      name: 'nSyb-GAL4', status: 'pending', createdAt: addDays(t, -1) },
    // Seba wants to transfer cross c10 ownership to Catherine
    { id: 'tx2', from: 'Seba', to: 'Catherine', type: 'cross', itemId: 'c10',
      name: 'UAS-CsChrimson x TH-GAL4 (VDRC)', status: 'pending', createdAt: addDays(t, -2) },
    // Shahar wants to transfer "Opto Tools" collection to Bella
    { id: 'tx3', from: 'Shahar', to: 'Bella', type: 'collection', collection: 'Opto Tools',
      name: 'Opto Tools', status: 'pending', createdAt: addDays(t, 0) },
    // Myrto accepted Bella's stock transfer (resolved, for testing sentTransfers banner)
    { id: 'tx4', from: 'Bella', to: 'Myrto', type: 'stock', itemId: 's10',
      name: 'UAS-RCaMP1.07', status: 'accepted', createdAt: addDays(t, -3) },
    // Catherine declined Flo's collection transfer (resolved)
    { id: 'tx5', from: 'Flo', to: 'Catherine', type: 'collection', collection: 'Flo Stocks 1',
      name: 'Flo Stocks 1', status: 'declined', createdAt: addDays(t, -4) },
  ];

  // Derive collections from stock categories
  stocks.forEach(s => s.demo = true);
  crosses.forEach(c => c.demo = true);
  const cats = [...new Set(stocks.map(s => s.category).filter(Boolean))];
  const collections = [...cats.filter(c => c !== 'No Collection'), 'No Collection'];

  return { stocks, crosses, virginBank, expBank, transfers, collections };
}

/* ========== PIN LOCK ========== */
export { makeDemoData };
