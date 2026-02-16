// ===========================================================================
// Flomington — Google Apps Script for Sheets Sync
// ===========================================================================
// HOW TO SET UP:
// 1. Open your Google Sheet
// 2. Go to Extensions > Apps Script
// 3. Delete any existing code and paste this entire file
// 4. Click Deploy > New deployment
// 5. Type: Web app
// 6. Execute as: Me
// 7. Who has access: Anyone
// 8. Click Deploy and copy the URL
// 9. Paste the URL into Flomington Settings > Google Sheets Sync
// ===========================================================================

const HEADERS = [
  'id', 'name', 'genotype', 'variant', 'category', 'location',
  'source', 'sourceId', 'flybaseId', 'maintainer', 'notes',
  'isGift', 'giftFrom', 'createdAt', 'lastFlipped'
];

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Stocks');
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName('Stocks');
  }
  // Ensure headers exist
  if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() !== 'id') {
    sheet.clear();
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function doGet(e) {
  try {
    const sheet = getOrCreateSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const stocks = data.slice(1).filter(row => row[0]).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        if (h === 'isGift') obj[h] = row[i] === true || row[i] === 'true';
        else if (row[i] !== '' && row[i] !== null && row[i] !== undefined) obj[h] = String(row[i]);
      });
      return obj;
    });
    return ContentService.createTextOutput(JSON.stringify({ stocks }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const stocks = payload.stocks || [];
    const sheet = getOrCreateSheet();

    // Clear data rows (keep header)
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).clear();
    }

    // Write all stocks
    if (stocks.length > 0) {
      const rows = stocks.map(s => HEADERS.map(h => {
        if (h === 'isGift') return s[h] ? 'true' : 'false';
        return s[h] || '';
      }));
      sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, count: stocks.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
