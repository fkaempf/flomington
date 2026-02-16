// ===========================================================================
// Flomington — Google Apps Script for Sheets Sync
// ===========================================================================
// HOW TO SET UP:
// 1. Open your Google Sheet
// 2. Go to Extensions > Apps Script
// 3. Delete any existing code and paste this entire file
// 4. Click Deploy > Manage deployments > Edit > New version > Deploy
//    (or Deploy > New deployment if first time)
// 5. Type: Web app
// 6. Execute as: Me
// 7. Who has access: Anyone
// 8. Click Deploy and copy the URL
// 9. Paste the URL into Flomington Settings > Google Sheets Sync
// ===========================================================================

const STOCK_HEADERS = [
  'id', 'name', 'genotype', 'variant', 'category', 'location',
  'source', 'sourceId', 'flybaseId', 'maintainer', 'notes',
  'isGift', 'giftFrom', 'createdAt', 'lastFlipped', 'copies'
];

const CROSS_HEADERS = [
  'id', 'parentA', 'parentB', 'temperature', 'setupDate', 'status', 'owner', 'notes',
  'targetCount', 'collected', 'vials', 'virginsCollected',
  'manualFlipDate', 'manualEcloseDate', 'manualVirginDate',
  'crossType', 'parentCrossId',
  'experimentType', 'experimentDate', 'retinalStartDate',
  'waitStartDate', 'ripeningStartDate'
];

const PIN_HEADERS = ['user', 'hash'];

function getSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    if (name === 'Stocks') {
      // Rename first sheet for backward compatibility
      sheet = ss.getSheets()[0];
      sheet.setName('Stocks');
    } else {
      sheet = ss.insertSheet(name);
    }
  }
  if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() !== headers[0]) {
    sheet.clear();
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function readSheet(name, headers) {
  const sheet = getSheet(name, headers);
  const data = sheet.getDataRange().getValues();
  const h = data[0];
  return data.slice(1).filter(row => row[0]).map(row => {
    const obj = {};
    h.forEach((k, i) => {
      if (row[i] !== '' && row[i] !== null && row[i] !== undefined) obj[k] = String(row[i]);
    });
    return obj;
  });
}

function writeSheet(name, headers, items) {
  const sheet = getSheet(name, headers);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clear();
  }
  if (items.length > 0) {
    const rows = items.map(s => headers.map(h => s[h] || ''));
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

function doGet(e) {
  try {
    const stocks = readSheet('Stocks', STOCK_HEADERS);
    stocks.forEach(s => {
      if (s.isGift === 'true') s.isGift = true;
      else delete s.isGift;
    });
    const crosses = readSheet('Crosses', CROSS_HEADERS);
    const pins = readSheet('Pins', PIN_HEADERS);

    return ContentService.createTextOutput(JSON.stringify({ stocks, crosses, pins }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.stocks) {
      const stocks = payload.stocks.map(s => {
        const o = {};
        STOCK_HEADERS.forEach(h => {
          if (h === 'isGift') o[h] = s[h] ? 'true' : 'false';
          else o[h] = s[h] || '';
        });
        return o;
      });
      writeSheet('Stocks', STOCK_HEADERS, stocks);
    }

    if (payload.crosses) writeSheet('Crosses', CROSS_HEADERS, payload.crosses);
    if (payload.pins) writeSheet('Pins', PIN_HEADERS, payload.pins);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      stockCount: (payload.stocks || []).length,
      crossCount: (payload.crosses || []).length,
      pinCount: (payload.pins || []).length
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
