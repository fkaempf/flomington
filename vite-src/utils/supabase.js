/* ========== SUPABASE SYNC ========== */

import { createClient } from '@supabase/supabase-js';

export const STOCK_FIELD_MAP = {
  id: 'id', name: 'name', genotype: 'genotype', variant: 'variant',
  category: 'category', location: 'location', source: 'source',
  sourceId: 'source_id', flybaseId: 'flybase_id', janeliaLine: 'janelia_line',
  maintainer: 'maintainer', notes: 'notes', isGift: 'is_gift',
  giftFrom: 'gift_from', createdAt: 'created_at', lastFlipped: 'last_flipped',
  copies: 'copies', vcs: 'vcs',
};

export const CROSS_FIELD_MAP = {
  id: 'id', parentA: 'parent_a', parentB: 'parent_b', temperature: 'temperature',
  setupDate: 'setup_date', status: 'status', owner: 'owner', notes: 'notes',
  targetCount: 'target_count', collected: 'collected', vials: 'vials',
  virginsCollected: 'virgins_collected', manualFlipDate: 'manual_flip_date',
  manualEcloseDate: 'manual_eclose_date', manualVirginDate: 'manual_virgin_date',
  crossType: 'cross_type', parentCrossId: 'parent_cross_id',
  experimentType: 'experiment_type', experimentDate: 'experiment_date',
  retinalStartDate: 'retinal_start_date', waitStartDate: 'wait_start_date',
  ripeningStartDate: 'ripening_start_date',
  vcs: 'vcs',
};

export function toSnake(obj, fieldMap) {
  const out = {};
  for (const [camel, snake] of Object.entries(fieldMap)) {
    if (obj[camel] !== undefined) out[snake] = obj[camel];
  }
  return out;
}

export function toCamel(obj, fieldMap) {
  const reverseMap = {};
  for (const [camel, snake] of Object.entries(fieldMap)) reverseMap[snake] = camel;
  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    const camelKey = reverseMap[key] || key;
    out[camelKey] = val;
  }
  return out;
}

export function sanitizeRow(row) {
  for (const k of Object.keys(row)) {
    if (row[k] === '') row[k] = null;
    if (k === 'vcs' && row[k] && typeof row[k] === 'object') row[k] = JSON.stringify(row[k]);
  }
  return row;
}

// Supabase config - hardcoded defaults, localStorage can override
export const SUPABASE_URL = 'https://rawkyzzqyvizrglanyzi.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_yfVKfIlgBL9OsTW3uDgx8A_zBkjFyys';

let _sb = null;
export function getSb() {
  if (_sb) return _sb;
  const rawUrl = localStorage.getItem('flo-sb-url');
  const rawKey = localStorage.getItem('flo-sb-key');
  const url = (rawUrl ? rawUrl.replace(/^"|"$/g, '') : '') || SUPABASE_URL;
  const key = (rawKey ? rawKey.replace(/^"|"$/g, '') : '') || SUPABASE_KEY;
  if (!url || !key) return null;
  try {
    _sb = createClient(url, key);
    return _sb;
  } catch (e) {
    console.error('Supabase init failed:', e);
    return null;
  }
}
export function resetSb() { _sb = null; }

export async function supabasePull() {
  const sb = getSb();
  if (!sb) throw new Error('Supabase not configured');
  const [stocksRes, crossesRes, pinsRes] = await Promise.all([
    sb.from('stocks').select('*'),
    sb.from('crosses').select('*'),
    sb.from('pins').select('*'),
  ]);
  if (stocksRes.error) throw stocksRes.error;
  if (crossesRes.error) throw crossesRes.error;
  if (pinsRes.error) throw pinsRes.error;
  const stocks = (stocksRes.data || []).map(row => {
    const s = toCamel(row, STOCK_FIELD_MAP);
    if (s.isGift === false) delete s.isGift;
    if (typeof s.vcs === 'string') try { s.vcs = JSON.parse(s.vcs); } catch { s.vcs = null; }
    return s;
  });
  const crosses = (crossesRes.data || []).map(row => {
    const c = toCamel(row, CROSS_FIELD_MAP);
    if (!c.collected) c.collected = [];
    if (!c.vials) c.vials = [];
    if (c.targetCount) c.targetCount = parseInt(c.targetCount) || 0;
    if (c.virginsCollected) c.virginsCollected = parseInt(c.virginsCollected) || 0;
    return c;
  });
  const pins = (pinsRes.data || []).map(row => ({ user: row.user_name, hash: row.hash }));
  return { stocks, crosses, pins };
}

export async function supabasePush(stocks, crosses, pins) {
  const sb = getSb();
  if (!sb) throw new Error('Supabase not configured');
  if (stocks && stocks.length > 0) {
    const rows = stocks.map(s => toSnake(s, STOCK_FIELD_MAP));
    const { error } = await sb.from('stocks').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
  if (crosses && crosses.length > 0) {
    const rows = crosses.map(c => toSnake(c, CROSS_FIELD_MAP));
    const { error } = await sb.from('crosses').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
  if (pins && pins.length > 0) {
    const rows = pins.map(p => ({ user_name: p.user, hash: p.hash }));
    const { error } = await sb.from('pins').upsert(rows, { onConflict: 'user_name' });
    if (error) throw error;
  }
  return { stockCount: stocks?.length || 0, crossCount: crosses?.length || 0 };
}

export async function supabaseSyncDeletes(table, localIds) {
  const sb = getSb();
  if (!sb) return;
  const { data } = await sb.from(table).select('id');
  if (!data) return;
  const remoteOnly = data.filter(r => !localIds.has(r.id)).map(r => r.id);
  if (remoteOnly.length > 0) {
    await sb.from(table).delete().in('id', remoteOnly);
  }
}

export async function supabasePushVirginBank(userName, virginBank) {
  const sb = getSb();
  if (!sb) return;
  const rows = Object.entries(virginBank)
    .filter(([, count]) => count > 0)
    .map(([stockId, count]) => ({
      user_name: userName, stock_id: stockId, count,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length > 0) {
    const { error } = await sb.from('virgin_banks').upsert(rows, { onConflict: 'user_name,stock_id' });
    if (error) console.error('Virgin bank push failed:', error);
  }
  const { data: remote } = await sb.from('virgin_banks').select('stock_id').eq('user_name', userName);
  if (remote) {
    const localIds = new Set(Object.keys(virginBank).filter(k => virginBank[k] > 0));
    const toDelete = remote.filter(r => !localIds.has(r.stock_id)).map(r => r.stock_id);
    if (toDelete.length > 0) {
      await sb.from('virgin_banks').delete().eq('user_name', userName).in('stock_id', toDelete);
    }
  }
}

export async function supabasePullVirginBank(userName) {
  const sb = getSb();
  if (!sb) return {};
  const { data, error } = await sb.from('virgin_banks').select('*').eq('user_name', userName);
  if (error || !data) return {};
  const bank = {};
  data.forEach(row => { if (row.count > 0) bank[row.stock_id] = row.count; });
  return bank;
}

export async function supabasePushExpBank(userName, expBank) {
  const sb = getSb();
  if (!sb) return;
  const localIds = new Set(Object.keys(expBank).filter(k => (expBank[k].m || 0) + (expBank[k].f || 0) > 0));
  // Delete orphaned entries FIRST so realtime echo from upsert won't re-add them
  const { data: remote } = await sb.from('exp_banks').select('source_id').eq('user_name', userName);
  if (remote) {
    const toDelete = remote.filter(r => !localIds.has(r.source_id)).map(r => r.source_id);
    if (toDelete.length > 0) {
      await sb.from('exp_banks').delete().eq('user_name', userName).in('source_id', toDelete);
    }
  }
  const rows = Object.entries(expBank)
    .filter(([, v]) => (v.m || 0) + (v.f || 0) > 0)
    .map(([sourceId, v]) => ({
      user_name: userName, source_id: sourceId,
      source_type: v.source || 'cross',
      male_count: v.m || 0, female_count: v.f || 0,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length > 0) {
    const { error } = await sb.from('exp_banks').upsert(rows, { onConflict: 'user_name,source_id' });
    if (error) console.error('Exp bank push failed:', error);
  }
}

export async function supabasePullExpBank(userName) {
  const sb = getSb();
  if (!sb) return {};
  const { data, error } = await sb.from('exp_banks').select('*').eq('user_name', userName);
  if (error || !data) return {};
  const bank = {};
  data.forEach(row => {
    bank[row.source_id] = { m: row.male_count || 0, f: row.female_count || 0, source: row.source_type || 'cross' };
  });
  return bank;
}

export async function supabasePushTransfers(transfers) {
  const sb = getSb();
  if (!sb || !transfers?.length) return;
  const rows = transfers.map(t => ({
    id: t.id, from_user: t.from, to_user: t.to,
    transfer_type: t.type, item_id: t.itemId || null,
    collection_name: t.collection || null,
    display_name: t.name, status: t.status || 'pending',
    seen: t.seen || false, created_at: t.createdAt || new Date().toISOString(),
  }));
  const { error } = await sb.from('transfers').upsert(rows, { onConflict: 'id' });
  if (error) console.error('Transfers push failed:', error);
}

export async function supabasePullTransfers() {
  const sb = getSb();
  if (!sb) return [];
  const { data, error } = await sb.from('transfers').select('*');
  if (error || !data) return [];
  return data.map(row => ({
    id: row.id, from: row.from_user, to: row.to_user,
    type: row.transfer_type, itemId: row.item_id,
    collection: row.collection_name, name: row.display_name,
    status: row.status, seen: row.seen || false, createdAt: row.created_at,
  }));
}

export function mergeStocks(local, remote) {
  const merged = [...local];
  const localIds = new Set(local.map(s => s.id));
  remote.forEach(rs => {
    if (!localIds.has(rs.id)) merged.push(rs);
  });
  return merged;
}

export function mergeCrosses(local, remote) {
  const merged = [...local];
  const localIds = new Set(local.map(c => c.id));
  remote.forEach(rc => {
    if (!localIds.has(rc.id)) merged.push(rc);
  });
  return merged;
}

// Track locally deleted IDs so realtime doesn't re-add them
const _deletedIds = new Set();
export function markDeleted(id) { _deletedIds.add(id); setTimeout(() => _deletedIds.delete(id), 15000); }
export function unmarkDeleted(id) { _deletedIds.delete(id); }
export function isDeletedLocally(id) { return _deletedIds.has(id); }

// Track locally edited IDs so realtime doesn't overwrite pending changes
const _editedIds = new Set();
export function markEdited(id) { _editedIds.add(id); setTimeout(() => _editedIds.delete(id), 10000); }
export function isEditedLocally(id) { return _editedIds.has(id); }

// Immediately delete from Supabase (don't wait for debounced push)
export function supabaseDeleteNow(table, id) {
  const sb = getSb();
  if (!sb) return;
  sb.from(table).delete().eq('id', id).then(() => {});
}
