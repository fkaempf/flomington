#!/usr/bin/env node

// Migrate Google Sheets data to Supabase
// Usage: node migrate-sheets-to-supabase.mjs

const SHEET_ID = '1FAY6JAkwRAAgqyy-cLqzQogvx6veCK4Y_ncGpl3uYks';
const SUPABASE_URL = 'https://rawkyzzqyvizrglanyzi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_yfVKfIlgBL9OsTW3uDgx8A_zBkjFyys';

// camelCase (Google Sheets) -> snake_case (Supabase)
const STOCK_FIELD_MAP = {
  id:'id', name:'name', genotype:'genotype', variant:'variant',
  category:'category', location:'location', source:'source',
  sourceId:'source_id', flybaseId:'flybase_id', janeliaLine:'janelia_line',
  maintainer:'maintainer', notes:'notes', isGift:'is_gift',
  giftFrom:'gift_from', copies:'copies', createdAt:'created_at',
  lastFlipped:'last_flipped', updatedAt:'updated_at'
};

const CROSS_FIELD_MAP = {
  id:'id', parentA:'parent_a', parentB:'parent_b', owner:'owner',
  crossType:'cross_type', parentCrossId:'parent_cross_id',
  temperature:'temperature', setupDate:'setup_date', status:'status',
  targetCount:'target_count', collected:'collected', vials:'vials',
  virginsCollected:'virgins_collected', manualFlipDate:'manual_flip_date',
  manualEcloseDate:'manual_eclose_date', manualVirginDate:'manual_virgin_date',
  experimentType:'experiment_type', experimentDate:'experiment_date',
  retinalStartDate:'retinal_start_date', waitStartDate:'wait_start_date',
  ripeningStartDate:'ripening_start_date', notes:'notes', updatedAt:'updated_at'
};

const PIN_FIELD_MAP = {
  userName:'user_name', hash:'hash'
};

// ---------------------------------------------------------------------------
// CSV parser (handles quoted fields with commas/newlines)
// ---------------------------------------------------------------------------
function parseCSV(text) {
  const rows = [];
  let i = 0;
  while (i < text.length) {
    const row = [];
    while (i < text.length) {
      if (text[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        let field = '';
        while (i < text.length) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            field += text[i];
            i++;
          }
        }
        row.push(field);
      } else {
        // Unquoted field
        let field = '';
        while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          field += text[i];
          i++;
        }
        row.push(field);
      }
      if (i < text.length && text[i] === ',') {
        i++; // skip comma
      } else {
        break;
      }
    }
    // Skip line ending
    if (i < text.length && text[i] === '\r') i++;
    if (i < text.length && text[i] === '\n') i++;
    if (row.length > 0 && !(row.length === 1 && row[0] === '')) {
      rows.push(row);
    }
  }
  return rows;
}

function csvToObjects(text) {
  const rows = parseCSV(text);
  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = row[i] !== undefined ? row[i] : '';
    });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Map camelCase object to snake_case using field map
// ---------------------------------------------------------------------------
function mapRow(obj, fieldMap) {
  const row = {};
  for (const [camel, snake] of Object.entries(fieldMap)) {
    if (camel in obj) {
      let val = obj[camel];
      // Clean up empty strings -> null
      if (val === '' || val === undefined) {
        val = null;
      }
      // Parse booleans
      else if (val === 'true') val = true;
      else if (val === 'false') val = false;
      // Parse numbers for specific fields
      else if (['copies', 'target_count', 'virgins_collected'].includes(snake) && val !== null) {
        const n = Number(val);
        val = isNaN(n) ? null : n;
      }
      // Parse JSON fields
      else if (['collected', 'vials'].includes(snake) && val !== null) {
        try { val = JSON.parse(val); } catch { /* keep as string */ }
      }
      // Convert timestamps to ISO 8601
      if (['created_at', 'last_flipped', 'updated_at', 'setup_date',
           'manual_flip_date', 'manual_eclose_date', 'manual_virgin_date',
           'experiment_date', 'retinal_start_date', 'wait_start_date',
           'ripening_start_date'].includes(snake) && val !== null && typeof val === 'string') {
        const d = new Date(val);
        val = isNaN(d.getTime()) ? null : d.toISOString();
      }
      row[snake] = val;
    }
  }
  return row;
}

// ---------------------------------------------------------------------------
// Fetch a sheet tab as CSV
// ---------------------------------------------------------------------------
async function fetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  console.log(`  Fetching ${sheetName}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${sheetName}: ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Upsert rows into Supabase
// ---------------------------------------------------------------------------
async function upsertRows(table, rows) {
  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows, skipping`);
    return;
  }
  const batchSize = 50;
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(batch)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to upsert into ${table}: ${res.status} ${err}`);
    }
    total += batch.length;
  }
  console.log(`  ${table}: ${total} rows upserted`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Migrating Google Sheets -> Supabase ===\n');

  // Fetch sheets
  console.log('1. Fetching from Google Sheets...');
  const [stocksCsv, crossesCsv, pinsCsv] = await Promise.all([
    fetchSheet('Stocks'),
    fetchSheet('Crosses'),
    fetchSheet('Pins'),
  ]);

  // Parse and map
  console.log('\n2. Parsing and mapping fields...');
  const stockObjects = csvToObjects(stocksCsv);
  const crossObjects = csvToObjects(crossesCsv);
  const pinObjects = csvToObjects(pinsCsv);

  console.log(`  Stocks: ${stockObjects.length} rows`);
  console.log(`  Crosses: ${crossObjects.length} rows`);
  console.log(`  Pins: ${pinObjects.length} rows`);

  const stockRows = stockObjects
    .filter(o => o.id) // skip empty rows
    .map(o => mapRow(o, STOCK_FIELD_MAP));
  const crossRows = crossObjects
    .filter(o => o.id)
    .map(o => mapRow(o, CROSS_FIELD_MAP));
  const pinRows = pinObjects
    .filter(o => o.userName || o.user_name)
    .map(o => {
      // Handle both possible header names
      return {
        user_name: o.userName || o.user_name,
        hash: o.hash
      };
    });

  // Upsert into Supabase
  console.log('\n3. Upserting into Supabase...');
  await upsertRows('stocks', stockRows);
  await upsertRows('crosses', crossRows);
  await upsertRows('pins', pinRows);

  console.log('\nDone! Check your Supabase Table Editor to verify.');
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
