import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { USERS, DEFAULT_CATS } from './utils/constants.js';
import { today, dFromNow } from './utils/dates.js';
import { fmtDur } from './utils/dates.js';
import { uid, sn, cl, stockTags } from './utils/helpers.js';
import useLS from './hooks/useLS.js';
import {
  getSb, resetSb, SUPABASE_URL, SUPABASE_KEY,
  STOCK_FIELD_MAP, CROSS_FIELD_MAP, toCamel,
  supabasePull, supabasePush, supabaseSyncDeletes,
  supabasePullVirginBank, supabasePushVirginBank,
  supabasePullExpBank, supabasePushExpBank,
  supabasePullTransfers, supabasePushTransfers,
  mergeStocks, mergeCrosses,
  markEdited, markDeleted, isDeletedLocally, isEditedLocally,
  supabaseDeleteNow,
} from './utils/supabase.js';
import { computeNextActions, makeVcs, vcsKey } from './utils/vcs.js';
import { fetchBDSCInfo } from './utils/helpers.js';
import { makeDemoData } from './utils/demo.js';

import { Toasts, useToast, Modal, Btn, ErrorBoundary } from './components/ui';
import PinLock from './components/PinLock.jsx';
import BackgroundCanvas from './components/BackgroundCanvas.jsx';
import AmbientFly from './components/AmbientFly.jsx';
import NewCrossWizard from './components/NewCrossWizard.jsx';
import PrintLabelsModal from './components/PrintLabelsModal.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import StocksScreen from './screens/StocksScreen.jsx';
import VirginsScreen from './screens/VirginsScreen.jsx';
import ExpScreen from './screens/ExpScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';

function useSupabaseRealtime(setStocks, setCrosses, setPinVersion, setVirginBank, setExpBank, setTransfers) {
  const subRef = React.useRef(null);
  React.useEffect(() => {
    const sb = getSb();
    if (!sb) return;
    const channel = sb.channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stocks' }, payload => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (isDeletedLocally(payload.new.id) || isEditedLocally(payload.new.id)) return;
          const item = toCamel(payload.new, STOCK_FIELD_MAP);
          if (item.isGift === false) delete item.isGift;
          if (typeof item.vcs === 'string') try { item.vcs = JSON.parse(item.vcs); } catch { item.vcs = null; }
          setStocks(prev => {
            const idx = prev.findIndex(s => s.id === item.id);
            if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], ...item }; return next; }
            return [...prev, item];
          });
        } else if (payload.eventType === 'DELETE' && payload.old?.id) {
          setStocks(prev => prev.filter(s => s.id !== payload.old.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crosses' }, payload => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (isDeletedLocally(payload.new.id) || isEditedLocally(payload.new.id)) return;
          const item = toCamel(payload.new, CROSS_FIELD_MAP);
          if (!item.collected) item.collected = [];
          if (!item.vials) item.vials = [];
          setCrosses(prev => {
            const idx = prev.findIndex(c => c.id === item.id);
            if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], ...item }; return next; }
            return [...prev, item];
          });
        } else if (payload.eventType === 'DELETE' && payload.old?.id) {
          setCrosses(prev => prev.filter(c => c.id !== payload.old.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pins' }, payload => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const p = payload.new;
          if (p.user_name && p.hash) {
            localStorage.setItem('flo-pin-' + p.user_name, p.hash);
            setPinVersion(v => v + 1);
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'virgin_banks' }, payload => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const row = payload.new;
          if (setVirginBank) setVirginBank(prev => {
            if (row.count > 0) return { ...prev, [row.stock_id]: row.count };
            const next = { ...prev }; delete next[row.stock_id]; return next;
          });
        } else if (payload.eventType === 'DELETE' && payload.old?.stock_id) {
          if (setVirginBank) setVirginBank(prev => { const next = { ...prev }; delete next[payload.old.stock_id]; return next; });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exp_banks' }, payload => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const row = payload.new;
          if (setExpBank) setExpBank(prev => {
            if ((row.male_count || 0) + (row.female_count || 0) > 0) {
              return { ...prev, [row.source_id]: { m: row.male_count || 0, f: row.female_count || 0, source: row.source_type || 'cross' } };
            }
            const next = { ...prev }; delete next[row.source_id]; return next;
          });
        } else if (payload.eventType === 'DELETE' && payload.old?.source_id) {
          if (setExpBank) setExpBank(prev => { const next = { ...prev }; delete next[payload.old.source_id]; return next; });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, payload => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const row = payload.new;
          const item = {
            id: row.id, from: row.from_user, to: row.to_user,
            type: row.transfer_type, itemId: row.item_id,
            collection: row.collection_name, name: row.display_name,
            status: row.status, seen: row.seen || false, createdAt: row.created_at,
          };
          if (setTransfers) setTransfers(prev => {
            const idx = prev.findIndex(t => t.id === item.id);
            if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], ...item }; return next; }
            return [...prev, item];
          });
        } else if (payload.eventType === 'DELETE' && payload.old?.id) {
          if (setTransfers) setTransfers(prev => prev.filter(t => t.id !== payload.old.id));
        }
      })
      .subscribe();
    subRef.current = channel;
    return () => {
      if (subRef.current) { sb.removeChannel(subRef.current); subRef.current = null; }
    };
  }, []);
}


const IconHome = (active) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#a78bfa' : '#52525b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const IconStocks = (active) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#a78bfa' : '#52525b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);
const IconSettings = (active) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#a78bfa' : '#52525b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

/* ========== LABEL PRINTING ========== */


function App() {
  const [currentUser, setCurrentUser] = useLS('flo-user', 'Flo');
  const [locked, setLocked] = useState(() => {
    if (!localStorage.getItem(`flo-pin-${currentUser}`)) return true;
    return false;
  });
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const [pendingUser, setPendingUser] = useState(null);
  const [tab, setTab] = useState('home');
  const [stocks, setStocks] = useLS('flo-stocks', []);
  const [crosses, setCrosses] = useLS('flo-crosses', []);
  const [bgEffect, setBgEffect] = useLS('flo-bg', 'grainient');
  useEffect(() => { if (localStorage.getItem('flo-bg') === '"none"') { setBgEffect('grainient'); } }, []);
  const [virginBank, setVirginBank] = useLS(`flo-virgins-${currentUser}`, {});
  const [expBank, setExpBank] = useLS(`flo-exp-${currentUser}`, {});
  const [virginsPerCross, setVirginsPerCross] = useLS('flo-vpc', 5);
  const [transfers, setTransfers] = useLS('flo-transfers', []);
  const [collections, setCollections] = useLS('flo-collections', DEFAULT_CATS);
  // Derive collections from stock categories - add missing, remove empty
  useEffect(() => {
    const stockCats = new Set(stocks.map(s => s.category).filter(Boolean));
    const missing = [...stockCats].filter(c => !collections.includes(c));
    const stale = collections.filter(c => c !== 'No Collection' && !stockCats.has(c));
    if (missing.length > 0 || stale.length > 0) {
      let next = collections.filter(c => !stale.includes(c));
      const idx = next.indexOf('No Collection');
      missing.forEach(c => { if (idx >= 0) next.splice(idx, 0, c); else next.push(c); });
      if (!next.includes('No Collection')) next.push('No Collection');
      setCollections(next);
    }
  }, [stocks]);
  // Backfill flybaseId for Bloomington stocks that have a sourceId but no flybaseId
  useEffect(() => {
    const need = stocks.filter(s => s.source === 'Bloomington' && s.sourceId && !s.flybaseId);
    if (need.length > 0) setStocks(p => p.map(s => s.source === 'Bloomington' && s.sourceId && !s.flybaseId ? { ...s, flybaseId: `FBst${s.sourceId.replace(/\D/g, '').padStart(7, '0')}` } : s));
  }, []);
  const STOCK_CATS = collections;
  const [printList, setPrintList] = useState([]);
  const [printListCrosses, setPrintListCrosses] = useState([]);
  const [printListVirgins, setPrintListVirgins] = useState([]);
  const [printListExps, setPrintListExps] = useState([]);
  const [printOpen, setPrintOpen] = useState(false);
  const [bulkBarActive, setBulkBarActive] = useState(false);
  const [sbUrl, setSbUrl] = useLS('flo-sb-url', '');
  const [sbKey, setSbKey] = useLS('flo-sb-key', '');
  const sbConfigured = !!(sbUrl || SUPABASE_URL) && !!(sbKey || SUPABASE_KEY);
  const [syncStatus, setSyncStatus] = useState('');
  const syncTimer = useRef(null);
  const realtimeUpdateRef = useRef(false);

  const [pinVersion, setPinVersion] = useState(0);
  const initialPushBlocked = useRef(true);
  const demoMode = useRef(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Pull from Supabase FIRST on load - blocks UI until done
  const hasPulled = useRef(false);
  useEffect(() => {
    if (!sbConfigured || hasPulled.current) return;
    hasPulled.current = true;
    setSyncStatus('Syncing...');
    supabasePull().then(remote => {
      let vcsBackfilled = false;
      if (remote.stocks) setStocks(prev => {
        const localMap = new Map(prev.map(s => [s.id, s]));
        const merged = remote.stocks.map(rs => {
          const local = localMap.get(rs.id);
          if (local?.vcs && !rs.vcs) { vcsBackfilled = true; return { ...rs, vcs: local.vcs }; }
          return rs;
        });
        return merged;
      });
      if (remote.crosses) setCrosses(remote.crosses);
      if (remote.pins && remote.pins.length > 0) {
        let pinSynced = false;
        remote.pins.forEach(p => {
          if (p.user && p.hash && !localStorage.getItem(`flo-pin-${p.user}`)) {
            localStorage.setItem(`flo-pin-${p.user}`, p.hash);
            pinSynced = true;
          }
        });
        if (pinSynced && localStorage.getItem(`flo-pin-${currentUser}`)) {
          setLocked(false);
        }
      }
      // Pull virgin bank and merge with local
      supabasePullVirginBank(currentUser).then(remoteVB => {
        setVirginBank(prev => {
          const merged = { ...remoteVB };
          Object.entries(prev).forEach(([k, v]) => {
            if (v > 0) merged[k] = Math.max(merged[k] || 0, v);
          });
          return merged;
        });
      });
      // Pull exp bank and merge with local
      supabasePullExpBank(currentUser).then(remoteEB => {
        setExpBank(prev => {
          const merged = { ...remoteEB };
          Object.entries(prev).forEach(([k, v]) => {
            if ((v.m || 0) + (v.f || 0) > 0) {
              merged[k] = {
                m: Math.max((merged[k]?.m || 0), v.m || 0),
                f: Math.max((merged[k]?.f || 0), v.f || 0),
                source: v.source || merged[k]?.source || 'cross',
              };
            }
          });
          return merged;
        });
      });
      // Pull transfers and merge with local (local wins for status)
      supabasePullTransfers().then(remoteTransfers => {
        setTransfers(prev => {
          const localMap = new Map(prev.map(t => [t.id, t]));
          const merged = [...prev];
          remoteTransfers.forEach(rt => {
            const local = localMap.get(rt.id);
            if (!local) {
              merged.push(rt);
            } else if (local.status === 'pending' && rt.status !== 'pending') {
              // Remote has been resolved but local hasn't - take remote
              const idx = merged.findIndex(t => t.id === rt.id);
              if (idx >= 0) merged[idx] = { ...rt, seen: local.seen };
            }
          });
          // Auto-cleanup: remove resolved+seen transfers older than 7 days
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const staleIds = [];
          const cleaned = merged.filter(t => {
            const isStale = t.status !== 'pending' && t.seen && new Date(t.createdAt).getTime() < sevenDaysAgo;
            if (isStale) staleIds.push(t.id);
            return !isStale;
          });
          // Delete stale transfers from Supabase
          if (staleIds.length > 0) {
            const sb = getSb();
            if (sb) sb.from('transfers').delete().in('id', staleIds).then(() => {});
          }
          return cleaned;
        });
      });
      setSyncStatus('Synced ' + new Date().toLocaleTimeString());
      setTimeout(() => {
        initialPushBlocked.current = false;
        if (vcsBackfilled) {
          try {
            const st = JSON.parse(localStorage.getItem('flo-stocks') || '[]');
            supabasePush(st, null, null).catch(() => {});
          } catch {}
        }
      }, 2000);
      // Backfill Janelia lines for existing Bloomington stocks
      const toCheck = (remote.stocks || []).filter(s => s.source === 'Bloomington' && s.sourceId && !s.janeliaLine);
      if (toCheck.length > 0) {
        (async () => {
          let updated = false;
          for (const s of toCheck) {
            const info = await fetchBDSCInfo(s.sourceId);
            if (info?.janeliaLine) {
              s.janeliaLine = info.janeliaLine;
              updated = true;
            }
          }
          if (updated) setStocks(prev => prev.map(s => {
            const match = toCheck.find(t => t.id === s.id && t.janeliaLine);
            return match ? { ...s, janeliaLine: match.janeliaLine } : s;
          }));
        })();
      }
    }).catch(() => {
      setSyncStatus('Pull failed');
      initialPushBlocked.current = false;
    });
  }, [sbConfigured]);

  // Auto-push to Supabase on changes (debounced)
  const pendingPush = useRef(false);
  const pushNow = useRef(() => {});
  useEffect(() => {
    if (!sbConfigured || initialPushBlocked.current || demoMode.current) return;
    if (realtimeUpdateRef.current) { realtimeUpdateRef.current = false; if (!pendingPush.current) return; }
    pendingPush.current = true;
    clearTimeout(syncTimer.current);
    const doPush = () => {
      pendingPush.current = false;
      const pins = USERS.map(u => {
        const h = localStorage.getItem(`flo-pin-${u}`);
        return h ? { user: u, hash: h } : null;
      }).filter(Boolean);
      supabasePush(stocks, crosses, pins).then(() => {
        supabaseSyncDeletes('stocks', new Set(stocks.map(s => s.id)));
        supabaseSyncDeletes('crosses', new Set(crosses.map(c => c.id)));
        setSyncStatus('Synced ' + new Date().toLocaleTimeString());
      }).catch(() => {
        setSyncStatus('Push failed – retrying...');
        setTimeout(doPush, 5000);
      });
      supabasePushVirginBank(currentUser, virginBank).catch(e => console.error('Virgin bank push error:', e));
      supabasePushExpBank(currentUser, expBank).catch(e => console.error('Exp bank push error:', e));
      supabasePushTransfers(transfers).catch(e => console.error('Transfers push error:', e));
    };
    pushNow.current = doPush;
    syncTimer.current = setTimeout(doPush, 3000);
  }, [stocks, crosses, sbConfigured, pinVersion, virginBank, expBank, transfers, currentUser]);

  // Flush pending push on page close/hide
  useEffect(() => {
    const flush = () => { if (pendingPush.current) pushNow.current(); };
    const onVisChange = () => { if (document.hidden) flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisChange);
    return () => { window.removeEventListener('beforeunload', flush); document.removeEventListener('visibilitychange', onVisChange); };
  }, []);

  // Real-time subscriptions for cross-device sync
  useSupabaseRealtime(
    (updater) => { realtimeUpdateRef.current = true; setStocks(updater); },
    (updater) => { realtimeUpdateRef.current = true; setCrosses(updater); },
    setPinVersion,
    (updater) => { realtimeUpdateRef.current = true; setVirginBank(updater); },
    (updater) => { realtimeUpdateRef.current = true; setExpBank(updater); },
    (updater) => { realtimeUpdateRef.current = true; setTransfers(updater); }
  );

  const [newCrossOpen, setNewCrossOpen] = useState(false);
  const [virginCrossStock, setVirginCrossStock] = useState(null);
  const toast = useToast();

  // Deep link: ?stock=<id> or ?s=<id> opens that stock (supports short ID prefixes from QR codes)
  const [deepLinkStock, setDeepLinkStock] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const stockId = params.get('stock') || params.get('s');
    if (stockId) {
      history.replaceState(null, '', window.location.pathname);
      return stockId;
    }
    return null;
  });
  const [deepLinkCross, setDeepLinkCross] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const crossId = params.get('cross') || params.get('c');
    if (crossId) {
      history.replaceState(null, '', window.location.pathname);
      return crossId;
    }
    return null;
  });
  const [crossAccessDenied, setCrossAccessDenied] = useState(null);
  useEffect(() => {
    if (deepLinkStock && stocks.length > 0) {
      setTab('stocks');
    }
  }, [deepLinkStock]);
  useEffect(() => {
    if (deepLinkCross && crosses.length > 0) {
      const c = crosses.find(x => x.id === deepLinkCross || x.id.startsWith(deepLinkCross));
      if (c && c.owner && c.owner !== currentUser) {
        setCrossAccessDenied(cl(c, stocks));
      } else if (c) {
        setTab('home');
      }
      setDeepLinkCross(null);
    }
  }, [deepLinkCross, crosses]);

  // Virgin collection notifications - VCS schedule-based
  const [vcsNotify, setVcsNotify] = useLS('flo-vcs-notify', true);
  const [vcsRemindMin, setVcsRemindMin] = useLS('flo-vcs-remind-min', 15);
  const [vcsOverdueMin, setVcsOverdueMin] = useLS('flo-vcs-overdue-min', 30);

  useEffect(() => {
    if (!vcsNotify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const fired = new Set();

    function checkAll() {
      const now = new Date();

      // ── VCS stocks ──
      const vcsStocks = stocks.filter(s => s.vcs?.enabled && s.maintainer === currentUser && !stockTags(s).includes('Dead'));
      vcsStocks.forEach(s => {
        const actions = computeNextActions(s.vcs, now);
        const next = actions[0];
        if (!next) return;
        const prefix = `vcs-${s.id}-${next.key}-${today()}`;
        if (next.timeUntilMs > 0 && next.timeUntilMs <= vcsRemindMin * 60000) {
          const k = prefix + '-remind';
          if (!fired.has(k)) { fired.add(k); new Notification(`${s.name}`, { body: `${next.label} in ${fmtDur(next.timeUntilMs)}`, tag: k }); }
        }
        if (next.timeUntilMs <= 0 && next.timeUntilMs > -60000) {
          const k = prefix + '-now';
          if (!fired.has(k)) { fired.add(k); new Notification(`${s.name}`, { body: `${next.label} NOW`, tag: k }); }
        }
        if (next.timeUntilMs < -(vcsOverdueMin * 60000)) {
          const k = prefix + '-overdue';
          if (!fired.has(k)) { fired.add(k); new Notification(`⚠️ ${s.name}`, { body: `${next.label} OVERDUE by ${fmtDur(Math.abs(next.timeUntilMs))}`, tag: k }); }
        }
        if (next.deadlineMs) {
          const untilDeadline = next.deadlineMs - now.getTime();
          if (untilDeadline > 0 && untilDeadline <= 30 * 60000) {
            const k = `vcs-${s.id}-deadline-${today()}`;
            if (!fired.has(k)) { fired.add(k); new Notification(`⚠️ ${s.name}`, { body: `Virgin deadline in ${fmtDur(untilDeadline)}!`, tag: k }); }
          }
        }
      });

      // ── Collecting-virgins crosses with VCS ──
      const vcsCrosses = crosses.filter(c => c.vcs?.enabled && c.status === 'collecting virgins' && (!c.owner || c.owner === currentUser));
      vcsCrosses.forEach(c => {
        const actions = computeNextActions(c.vcs, now);
        const next = actions[0];
        if (!next) return;
        const cName = cl(c, stocks);
        const prefix = `cvcs-${c.id}-${next.key}-${today()}`;
        if (next.timeUntilMs > 0 && next.timeUntilMs <= vcsRemindMin * 60000) {
          const k = prefix + '-remind';
          if (!fired.has(k)) { fired.add(k); new Notification(`${cName}`, { body: `${next.label} in ${fmtDur(next.timeUntilMs)}`, tag: k }); }
        }
        if (next.timeUntilMs <= 0 && next.timeUntilMs > -60000) {
          const k = prefix + '-now';
          if (!fired.has(k)) { fired.add(k); new Notification(`${cName}`, { body: `${next.label} NOW`, tag: k }); }
        }
        if (next.timeUntilMs < -(vcsOverdueMin * 60000)) {
          const k = prefix + '-overdue';
          if (!fired.has(k)) { fired.add(k); new Notification(`${cName}`, { body: `${next.label} OVERDUE by ${fmtDur(Math.abs(next.timeUntilMs))}`, tag: k }); }
        }
        if (next.deadlineMs) {
          const untilDeadline = next.deadlineMs - now.getTime();
          if (untilDeadline > 0 && untilDeadline <= 30 * 60000) {
            const k = `cvcs-${c.id}-deadline-${today()}`;
            if (!fired.has(k)) { fired.add(k); new Notification(`${cName}`, { body: `Virgin deadline in ${fmtDur(untilDeadline)}!`, tag: k }); }
          }
        }
      });

    }

    const iv = setInterval(checkAll, 60000);
    checkAll();
    return () => clearInterval(iv);
  }, [vcsNotify, stocks, crosses, currentUser, vcsRemindMin, vcsOverdueMin]);

  const myTransfers = transfers.filter(t => t.to === currentUser && t.status === 'pending');
  const sentResolved = transfers.filter(t => t.from === currentUser && (t.status === 'accepted' || t.status === 'declined') && !t.seen);

  function handleUserSwitch(newUser) {
    if (newUser === currentUser) return;
    setPendingUser(newUser);
  }

  function createTransfer(t) {
    const transfer = { id: uid(), from: currentUser, status: 'pending', createdAt: today(), ...t };
    setTransfers(p => [...p, transfer]);
    // Push immediately for instant cross-device visibility
    supabasePushTransfers([transfer]).catch(e => console.error('Transfer immediate push error:', e));
    toast.add(`Transfer request sent to ${t.to}`);
  }

  if (locked) return <PinLock user={currentUser} onSelectUser={setCurrentUser} onUnlock={() => setLocked(false)} onPinSet={() => setPinVersion(v => v + 1)} />;
  if (pendingUser) return <PinLock user={pendingUser} onSelectUser={u => setPendingUser(u)} onUnlock={() => { setCurrentUser(pendingUser); setPendingUser(null); }} onPinSet={() => setPinVersion(v => v + 1)} />;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <BackgroundCanvas type={bgEffect} />
      <AmbientFly />

      {/* Header */}
      <header className="px-4 py-3 sticky top-0 z-20" style={{ background: 'rgba(9,9,11,0.8)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold tracking-tight cursor-pointer" onClick={() => setTab('home')} style={{ color: 'var(--text-1)' }}>Flomington</h1>
          <div className="flex items-center gap-2">
            <select value={currentUser} onChange={e => handleUserSwitch(e.target.value)}
              className="px-4 py-1.5 text-sm font-semibold rounded-xl" style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)', outline: 'none', textAlign: 'center' }}>
              {USERS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <span className="text-xs hidden md:inline" style={{ color: 'var(--text-3)', cursor: 'default', userSelect: 'none' }} onDoubleClick={() => window.__spawnFly && window.__spawnFly()}>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            {!isOnline && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)' }}>Offline</span>
            )}
            {syncStatus && (
              <div className="flex items-center gap-1" title={syncStatus}>
                <div className="w-1.5 h-1.5 rounded-full" style={{
                  background: syncStatus.startsWith('Synced') ? '#22c55e' :
                              syncStatus.includes('failed') || syncStatus.includes('error') ? '#ef4444' :
                              syncStatus.includes('Sync') ? '#eab308' : 'var(--text-3)',
                  animation: syncStatus.includes('Sync') && !syncStatus.startsWith('Synced') ? 'pulse 1s infinite' : 'none'
                }} />
              </div>
            )}
            <button onClick={() => setTab('settings')} className="touch"
              style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={tab === 'settings' ? 'var(--accent-2)' : 'var(--text-3)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
          </div>
          <div className="md:hidden text-center mt-1">
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
      </header>

      {isDemoMode && (
        <div className="sticky top-[49px] z-[19] px-4 py-2 text-center text-xs font-semibold"
          style={{ background: 'rgba(217,119,6,0.15)', color: '#fbbf24', borderBottom: '1px solid rgba(217,119,6,0.25)', backdropFilter: 'blur(8px)' }}>
          Demo mode - changes not synced. Reload to exit.
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-28" style={{ position: 'relative', zIndex: 1 }}>
        <div className="max-w-6xl mx-auto px-6 py-6">
          {tab === 'home' && <ErrorBoundary><HomeScreen stocks={stocks} setStocks={setStocks} crosses={crosses} setCrosses={setCrosses} toast={toast} onNewCross={() => setNewCrossOpen(true)} virginBank={virginBank} setVirginBank={setVirginBank} virginsPerCross={virginsPerCross} currentUser={currentUser} onTransfer={createTransfer} transfers={myTransfers} onAcceptTransfer={(t) => {
            if (t.type === 'stock') { markEdited(t.itemId); setStocks(p => p.map(s => s.id === t.itemId ? { ...s, maintainer: currentUser } : s)); }
            else if (t.type === 'cross') { markEdited(t.itemId); setCrosses(p => p.map(c => c.id === t.itemId ? { ...c, owner: currentUser } : c)); }
            else if (t.type === 'collection') { stocks.filter(s => (s.category || 'No Collection') === t.collection && s.maintainer === t.from).forEach(s => markEdited(s.id)); setStocks(p => p.map(s => (s.category || 'No Collection') === t.collection && s.maintainer === t.from ? { ...s, maintainer: currentUser } : s)); }
            setTransfers(p => p.map(x => x.id === t.id ? { ...x, status: 'accepted' } : x));
            toast.add(`Accepted transfer from ${t.from}`);
          }} onDeclineTransfer={(t) => {
            setTransfers(p => p.map(x => x.id === t.id ? { ...x, status: 'declined' } : x));
            toast.add('Transfer declined');
          }} STOCK_CATS={STOCK_CATS} sentTransfers={sentResolved} onDismissTransfer={(t) => {
            setTransfers(p => p.map(x => x.id === t.id ? { ...x, seen: true } : x));
          }} printListCrosses={printListCrosses} setPrintListCrosses={setPrintListCrosses} printListVirgins={printListVirgins} setPrintListVirgins={setPrintListVirgins} initialCrossId={deepLinkCross} expBank={expBank} setExpBank={setExpBank} /></ErrorBoundary>}
          {tab === 'stocks' && <ErrorBoundary><StocksScreen stocks={stocks} setStocks={setStocks} crosses={crosses} toast={toast} currentUser={currentUser} onTransfer={createTransfer} STOCK_CATS={STOCK_CATS} setCollections={setCollections} virginBank={virginBank} setVirginBank={setVirginBank} initialStockId={deepLinkStock} printList={printList} setPrintList={setPrintList} printListCrosses={printListCrosses} printListVirgins={printListVirgins} printListExps={printListExps} onOpenPrint={() => setPrintOpen(true)} onBulkActive={setBulkBarActive} expBank={expBank} setExpBank={setExpBank} /></ErrorBoundary>}
          {tab === 'virgins' && <ErrorBoundary><VirginsScreen stocks={stocks} virginBank={virginBank} setVirginBank={setVirginBank} toast={toast} onStartCross={(stockId) => { setVirginCrossStock(stockId); setNewCrossOpen(true); }} printListVirgins={printListVirgins} setPrintListVirgins={setPrintListVirgins} /></ErrorBoundary>}
          {tab === 'exp' && <ErrorBoundary><ExpScreen stocks={stocks} crosses={crosses} expBank={expBank} setExpBank={setExpBank} toast={toast} printListExps={printListExps} setPrintListExps={setPrintListExps} /></ErrorBoundary>}
          {tab === 'settings' && <ErrorBoundary><SettingsScreen stocks={stocks} crosses={crosses} setStocks={setStocks} setCrosses={setCrosses} toast={toast} bgEffect={bgEffect} setBgEffect={setBgEffect} virginsPerCross={virginsPerCross} setVirginsPerCross={setVirginsPerCross} setVirginBank={setVirginBank} setExpBank={setExpBank} setTransfers={setTransfers} setCollections={setCollections} sbUrl={sbUrl} setSbUrl={setSbUrl} sbKey={sbKey} setSbKey={setSbKey} sbConfigured={sbConfigured} syncStatus={syncStatus} setSyncStatus={setSyncStatus} currentUser={currentUser} demoMode={demoMode} setIsDemoMode={setIsDemoMode} /></ErrorBoundary>}
        </div>
      </main>

      {/* Floating pill navigation */}
      <nav className="bottom-nav" style={bulkBarActive ? { display: 'none' } : {}}>
        <div onClick={() => setTab('home')} className={`nav-item ${tab === 'home' ? 'active' : ''}`}>
          {IconHome(tab === 'home')}
          <span style={{ color: tab === 'home' ? 'var(--accent-2)' : 'var(--text-3)' }}>Home</span>
        </div>
        <div onClick={() => setTab('stocks')} className={`nav-item ${tab === 'stocks' ? 'active' : ''}`}>
          {IconStocks(tab === 'stocks')}
          <span style={{ color: tab === 'stocks' ? 'var(--accent-2)' : 'var(--text-3)' }}>Stocks</span>
        </div>
        <div onClick={() => setNewCrossOpen(true)} className="nav-item">
          <div className="flex items-center justify-center w-7 h-7 rounded-full" style={{
            background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            boxShadow: '0 2px 8px var(--accent-glow)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <span style={{ color: 'var(--accent-2)' }}>Cross</span>
        </div>
        <div onClick={() => setTab('virgins')} className={`nav-item ${tab === 'virgins' ? 'active' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={tab === 'virgins' ? '#f9a8d4' : '#52525b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="5" /><path d="M12 13v8" /><path d="M9 18h6" />
          </svg>
          <span style={{ color: tab === 'virgins' ? '#f9a8d4' : 'var(--text-3)' }}>Virgins</span>
        </div>
        <div onClick={() => setTab('exp')} className={`nav-item ${tab === 'exp' ? 'active' : ''}`}>
          {(() => { const c = tab === 'exp' ? '#5eead4' : '#52525b'; return (
          <svg width="20" height="20" viewBox="0 0 725 981" style={{ fillRule: 'evenodd', clipRule: 'evenodd', strokeLinecap: 'round', strokeLinejoin: 'bevel', strokeMiterlimit: 1.5 }}>
            <g transform="matrix(1,0,0,1,-108.976,-84.2265)">
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(1.52343,0,0,1.52343,-10.3138,640.91)"><path d="M17.952,212.883L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '19.69px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(0.706804,0,0,1.52343,389.253,244.71)"><path d="M17.952,212.883L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '25.26px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(0.290761,0.581116,-1.36241,0.68168,547.267,3.62081)"><path d="M17.952,212.883L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '25.62px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(0.290761,0.581116,-1.36241,0.68168,664.557,-55.1136)"><path d="M17.952,212.883L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '25.62px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(0.267864,-0.134136,0.682131,1.36218,112.43,-128.407)"><path d="M17.952,212.883L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '27.33px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(0.267864,-0.134136,0.682131,1.36218,239.746,126.047)"><path d="M17.952,212.883L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '27.33px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(0.267864,-0.134136,0.682131,1.36218,239.746,126.047)"><path d="M17.952,212.883L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '27.33px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(0.267864,-0.134136,0.682131,1.36218,176.088,-1.17972)"><path d="M17.952,212.883L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '27.33px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(0.164533,-0.0823921,0.682131,1.36218,300.246,184.101)"><path d="M17.952,212.883L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '27.65px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(0.0807321,0.161218,-1.36218,0.682131,701.599,253.852)"><path d="M17.952,212.883L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '27.66px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(0.0807321,0.161218,-1.36218,0.682131,773.644,218.555)"><path d="M17.952,212.883L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '27.66px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(-0.153549,0.0768918,-0.682131,-1.36218,454.645,302.996)"><path d="M17.952,212.883L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '27.67px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(-0.104265,-0.208213,1.36218,-0.682131,67.8481,254.513)"><path d="M17.952,212.883L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '27.53px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(-0.101577,-0.202845,1.36218,-0.682131,-4.24449,285.734)"><path d="M17.952,212.883L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '27.55px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(1.12292,0,0,1.52343,84.5614,509.057)"><path d="M17.952,212.883L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '22.42px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(0.731767,0.0143386,-0.0194527,0.992763,93.6242,615.503)"><path d="M452.648,93.455L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '34.39px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(0.731767,0.0143386,-0.0194527,0.992763,-37.8861,615.503)"><path d="M452.648,93.455L455.823,212.883" style={{ fill: 'none', stroke: c, strokeWidth: '34.39px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(1.06782,0.518921,-0.745566,1.53421,50.1193,-482.422)"><path d="M804.932,417.178C804.932,498.016 709.84,563.549 592.538,563.549C475.315,563.549 380.144,497.962 380.144,417.178C380.144,380.931 399.659,345.973 434.912,319.073" style={{ fill: 'none', stroke: c, strokeWidth: '20.41px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(1.52343,0,0,1.52343,-10.3138,640.91)"><path d="M17.952,212.883L75.51,126.333" style={{ fill: 'none', stroke: c, strokeWidth: '19.69px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(-1.52343,0,0,1.52343,711.45,640.91)"><path d="M17.952,212.883L75.51,126.333" style={{ fill: 'none', stroke: c, strokeWidth: '19.69px' }}/></g>
              </g>
              <g transform="matrix(1,0,0,1,106.942,84.836)">
                <g transform="matrix(0.701221,0.5786,-0.661708,0.801941,394.827,-239.608)"><path d="M649.229,547.647C649.229,629.921 572.575,696.617 478.018,696.617C383.525,696.617 306.808,629.865 306.808,547.647C306.808,520.752 323.842,472.437 339.69,449.346" style={{ fill: 'none', stroke: c, strokeWidth: '30.72px' }}/></g>
              </g>
            </g>
          </svg>); })()}
          <span style={{ color: tab === 'exp' ? '#5eead4' : 'var(--text-3)' }}>Exp</span>
        </div>
      </nav>

      <NewCrossWizard open={newCrossOpen} onClose={() => { setNewCrossOpen(false); setVirginCrossStock(null); }} stocks={stocks} setCrosses={setCrosses} toast={toast} virginBank={virginBank} setVirginBank={setVirginBank} preselectedVirgin={virginCrossStock} virginsPerCross={virginsPerCross} currentUser={currentUser} />
      <PrintLabelsModal open={printOpen} onClose={() => setPrintOpen(false)} printList={printList} setPrintList={setPrintList} printListCrosses={printListCrosses} setPrintListCrosses={setPrintListCrosses} printListVirgins={printListVirgins} setPrintListVirgins={setPrintListVirgins} printListExps={printListExps} setPrintListExps={setPrintListExps} stocks={stocks} crosses={crosses} expBank={expBank} toast={toast} />
      <Modal open={!!crossAccessDenied} onClose={() => setCrossAccessDenied(null)} title="Access Denied">
        <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>The cross "{crossAccessDenied}" belongs to another user. Switch to the correct account to view it.</p>
        <Btn v="s" onClick={() => setCrossAccessDenied(null)} className="w-full">Close</Btn>
      </Modal>
      <Toasts items={toast.items} remove={toast.rm} />
    </div>
  );
}


export default App;
