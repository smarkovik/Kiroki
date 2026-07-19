/**
 * Inventory Scanner — Google Apps Script backend.
 *
 * This one file is the entire backend. Paste it into the Apps Script editor
 * that is bound to the inventory Google Sheet (Extensions → Apps Script),
 * then deploy it as a Web App with:
 *
 *   Execute as:      Me
 *   Who has access:  Anyone
 *
 * The frontend holds no credentials — the Web App URL is the only thing it
 * knows. Any change to this file requires a NEW deployment version before
 * it is served (the editor code is not what runs at the deployment URL).
 *
 * The same file also runs unmodified under Node for unit tests: the pure
 * helpers are exported behind the `typeof module` guard at the bottom, and
 * nothing outside the entry points touches Google services.
 */

/* ============================== Configuration ============================= */

// Leave '' to use the spreadsheet this script is bound to. To point the
// script at a different spreadsheet, paste that spreadsheet's ID (the long
// token in its URL) between the quotes, save, and create a new deployment
// version.
const SHEET_ID = '';

// Optional shared shop PIN. The PIN lives OUTSIDE this file so the repo
// never contains a credential: in the Apps Script editor open ⚙️ Project
// Settings → Script properties and add a property named APP_PIN with the
// PIN as its value. Absent or empty = no PIN required. It is read at
// request time, so changing or removing it takes effect immediately —
// no new deployment version needed.
const PIN_PROPERTY_KEY = 'APP_PIN';

const APP_ID = 'inventory-scanner';

const INVENTORY_SHEET_NAME = 'Inventory';
const AUDIT_SHEET_NAME = 'Audit';
const INVENTORY_HEADERS = ['Barcode', 'Part Name', 'Quantity', 'Last Updated'];
const AUDIT_HEADERS = ['Timestamp', 'Barcode', 'Part Name', 'Action', 'Qty Change', 'Resulting Quantity'];

const MAX_BARCODE_LENGTH = 128;
const MAX_NAME_LENGTH = 200;
const MAX_ABS_DELTA = 1000;
const MAX_START_QTY = 100000;
const LOCK_WAIT_MS = 10000;

/* ============================ Pure helper logic ===========================
   Everything in this section is side-effect free and unit-tested in Node. */

// Barcodes are compared as normalized strings so a numeric Sheet cell
// (12345678) matches the scan "12345678", while "042…" and "42…" stay
// distinct codes.
function normalizeBarcode(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function barcodesMatch(a, b) {
  const na = normalizeBarcode(a);
  const nb = normalizeBarcode(b);
  return na !== '' && na === nb;
}

// A blank or garbage Quantity cell reads as 0; anything numeric truncates
// to an integer.
function coerceQty(value) {
  const n = Number(value);
  if (!isFinite(n)) return 0;
  return Math.trunc(n);
}

function badRequest(message) {
  return { ok: false, error: 'bad_request', message: message };
}

function validateAdjust(body) {
  const barcode = normalizeBarcode(body && body.barcode);
  if (!barcode) return badRequest('Missing barcode.');
  if (barcode.length > MAX_BARCODE_LENGTH) {
    return badRequest('Barcode is longer than ' + MAX_BARCODE_LENGTH + ' characters.');
  }
  const delta = body.delta;
  if (!Number.isInteger(delta)) return badRequest('delta must be an integer.');
  if (delta === 0) return badRequest('delta must not be zero.');
  if (Math.abs(delta) > MAX_ABS_DELTA) {
    return badRequest('delta must be between -' + MAX_ABS_DELTA + ' and ' + MAX_ABS_DELTA + '.');
  }
  return { ok: true, barcode: barcode, delta: delta };
}

function validateCreate(body) {
  const barcode = normalizeBarcode(body && body.barcode);
  if (!barcode) return badRequest('Missing barcode.');
  if (barcode.length > MAX_BARCODE_LENGTH) {
    return badRequest('Barcode is longer than ' + MAX_BARCODE_LENGTH + ' characters.');
  }
  const name = body && body.name !== null && body.name !== undefined ? String(body.name).trim() : '';
  if (!name) return badRequest('Part name is required.');
  if (name.length > MAX_NAME_LENGTH) {
    return badRequest('Part name is longer than ' + MAX_NAME_LENGTH + ' characters.');
  }
  let startQty = 1;
  if (body.startQty !== undefined && body.startQty !== null) {
    if (!Number.isInteger(body.startQty)) return badRequest('startQty must be a whole number.');
    if (body.startQty < 0 || body.startQty > MAX_START_QTY) {
      return badRequest('startQty must be between 0 and ' + MAX_START_QTY + '.');
    }
    startQty = body.startQty;
  }
  return { ok: true, barcode: barcode, name: name, startQty: startQty };
}

function applyDelta(currentQty, delta) {
  const next = currentQty + delta;
  if (next < 0) return { ok: false, error: 'below_zero', qty: currentQty };
  return { ok: true, qty: next };
}

// The audit Action column is explicit, never derived from the sign of the
// change downstream — a part created with starting qty 0 still logs 'add'.
function actionForDelta(delta) {
  return delta < 0 ? 'remove' : 'add';
}

// Column order: Timestamp, Barcode, Part Name, Action, Qty Change,
// Resulting Quantity.
function buildAuditRow(timestamp, barcode, name, action, qtyChange, resultingQty) {
  return [timestamp, barcode, name, action, qtyChange, resultingQty];
}

// A POST body is only usable if it parses to a plain JSON object.
function parseBody(text) {
  if (typeof text !== 'string' || text === '') return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed;
}

function normalizePin(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

// PIN gate. An unset/blank stored PIN disables authentication entirely;
// otherwise the provided PIN must match exactly (both sides trimmed).
function pinCheck(storedPin, providedPin) {
  const stored = normalizePin(storedPin);
  if (stored === '') return { required: false, ok: true };
  return { required: true, ok: normalizePin(providedPin) === stored };
}

/* ========================= Apps Script entry points ======================= */

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const auth = pinCheck(getStoredPin(), params.pin);
    if (params.action === 'ping') {
      const out = { ok: true, app: APP_ID, pinRequired: auth.required };
      // Only report a verdict when a PIN was actually offered, so ping
      // stays usable for URL verification without leaking anything.
      if (auth.required && params.pin !== undefined) out.pinOk = auth.ok;
      return jsonResponse(out);
    }
    if (params.action === 'lookup') {
      if (!auth.ok) return jsonResponse(unauthorized());
      const barcode = normalizeBarcode(params.barcode);
      if (!barcode) return jsonResponse(badRequest('Missing barcode.'));
      const row = findInventoryRow(getSheets().inventory, barcode);
      if (!row) return jsonResponse({ ok: true, found: false, barcode: barcode });
      return jsonResponse({ ok: true, found: true, barcode: row.barcode, name: row.name, qty: row.qty });
    }
    return jsonResponse(badRequest('Unknown or missing action.'));
  } catch (err) {
    return jsonResponse(serverError(err));
  }
}

function doPost(e) {
  try {
    const body = parseBody(e && e.postData && e.postData.contents);
    if (!body) return jsonResponse(badRequest('Request body must be a JSON object.'));
    if (!pinCheck(getStoredPin(), body.pin).ok) return jsonResponse(unauthorized());
    if (body.action === 'adjust') return jsonResponse(handleAdjust(body));
    if (body.action === 'create') return jsonResponse(handleCreate(body));
    return jsonResponse(badRequest('Unknown or missing action.'));
  } catch (err) {
    return jsonResponse(serverError(err));
  }
}

/* ============================= Write handlers ============================= */

function handleAdjust(body) {
  const v = validateAdjust(body);
  if (!v.ok) return v;
  return withScriptLock(function () {
    const sheets = getSheets();
    const row = findInventoryRow(sheets.inventory, v.barcode);
    if (!row) return { ok: false, error: 'unknown_barcode', barcode: v.barcode };
    const applied = applyDelta(row.qty, v.delta);
    if (!applied.ok) {
      return {
        ok: false,
        error: 'below_zero',
        qty: row.qty,
        name: row.name,
        message: 'Only ' + row.qty + ' in stock — cannot remove ' + Math.abs(v.delta) + '.'
      };
    }
    const now = new Date();
    sheets.inventory.getRange(row.rowIndex, 3, 1, 2).setValues([[applied.qty, now]]);
    const action = actionForDelta(v.delta);
    const result = { ok: true, barcode: row.barcode, name: row.name, qty: applied.qty, action: action };
    appendAuditGuarded(sheets.audit, buildAuditRow(now, row.barcode, row.name, action, v.delta, applied.qty), result);
    SpreadsheetApp.flush();
    return result;
  });
}

function handleCreate(body) {
  const v = validateCreate(body);
  if (!v.ok) return v;
  return withScriptLock(function () {
    const sheets = getSheets();
    const existing = findInventoryRow(sheets.inventory, v.barcode);
    if (existing) {
      return {
        ok: false,
        error: 'exists',
        barcode: existing.barcode,
        name: existing.name,
        qty: existing.qty,
        message: '"' + existing.name + '" already exists with ' + existing.qty + ' in stock.'
      };
    }
    const now = new Date();
    const rowIndex = sheets.inventory.getLastRow() + 1;
    // Force the barcode cell to plain text BEFORE writing so numeric codes
    // keep their leading zeros (e.g. UPC 042100005264).
    sheets.inventory.getRange(rowIndex, 1).setNumberFormat('@');
    sheets.inventory.getRange(rowIndex, 1, 1, 4).setValues([[v.barcode, v.name, v.startQty, now]]);
    const result = { ok: true, created: true, barcode: v.barcode, name: v.name, qty: v.startQty, action: 'add' };
    appendAuditGuarded(sheets.audit, buildAuditRow(now, v.barcode, v.name, 'add', v.startQty, v.startQty), result);
    SpreadsheetApp.flush();
    return result;
  });
}

/* ============================ Sheet access layer ========================== */

function withScriptLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    return { ok: false, error: 'busy', message: 'Another update is in progress — try again in a moment.' };
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function getSpreadsheet() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheets() {
  const ss = getSpreadsheet();
  return {
    inventory: getOrCreateSheet(ss, INVENTORY_SHEET_NAME, INVENTORY_HEADERS),
    audit: getOrCreateSheet(ss, AUDIT_SHEET_NAME, AUDIT_HEADERS)
  };
}

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function findInventoryRow(sheet, barcode) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (let i = 0; i < values.length; i++) {
    if (barcodesMatch(values[i][0], barcode)) {
      return {
        rowIndex: i + 2,
        barcode: normalizeBarcode(values[i][0]),
        name: String(values[i][1]),
        qty: coerceQty(values[i][2])
      };
    }
  }
  return null;
}

// If the stock write succeeded but the audit append fails, the operation
// still reports success — with a warning the UI must surface. The stock
// change is never rolled back invisibly and never fails silently.
function appendAuditGuarded(auditSheet, rowValues, result) {
  try {
    const rowIndex = auditSheet.getLastRow() + 1;
    // Same plain-text rule as Inventory for the barcode column.
    auditSheet.getRange(rowIndex, 2).setNumberFormat('@');
    auditSheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  } catch (err) {
    result.warning = 'audit_failed';
    result.message = 'Stock was updated, but writing the audit log failed (' +
      ((err && err.message) || err) + '). Check the Audit tab.';
  }
}

function getStoredPin() {
  return PropertiesService.getScriptProperties().getProperty(PIN_PROPERTY_KEY) || '';
}

function unauthorized() {
  return { ok: false, error: 'unauthorized', message: 'Wrong or missing PIN.' };
}

function serverError(err) {
  return { ok: false, error: 'server_error', message: String((err && err.message) || err) };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ==================== Node test exports (no-op in GAS) ==================== */

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeBarcode: normalizeBarcode,
    barcodesMatch: barcodesMatch,
    coerceQty: coerceQty,
    validateAdjust: validateAdjust,
    validateCreate: validateCreate,
    applyDelta: applyDelta,
    actionForDelta: actionForDelta,
    buildAuditRow: buildAuditRow,
    parseBody: parseBody,
    normalizePin: normalizePin,
    pinCheck: pinCheck,
    MAX_BARCODE_LENGTH: MAX_BARCODE_LENGTH,
    MAX_NAME_LENGTH: MAX_NAME_LENGTH,
    MAX_ABS_DELTA: MAX_ABS_DELTA,
    MAX_START_QTY: MAX_START_QTY
  };
}
