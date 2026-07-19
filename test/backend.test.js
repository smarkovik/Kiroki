'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeBarcode,
  barcodesMatch,
  coerceQty,
  validateAdjust,
  validateCreate,
  applyDelta,
  actionForDelta,
  buildAuditRow,
  parseBody,
  MAX_ABS_DELTA,
  MAX_START_QTY,
} = require('../apps-script/Code.js');

test('barcode normalization trims and preserves leading zeros', () => {
  assert.equal(normalizeBarcode('  042100005264 '), '042100005264');
  assert.equal(normalizeBarcode(42), '42');
  assert.equal(normalizeBarcode(null), '');
  assert.equal(normalizeBarcode(undefined), '');
});

test('numeric sheet cell matches the string scan of the same digits', () => {
  assert.equal(barcodesMatch(12345678, '12345678'), true);
  assert.equal(barcodesMatch('ABC-001', ' ABC-001 '), true);
});

test('leading-zero codes never cross-match their unpadded twin', () => {
  assert.equal(barcodesMatch('042100005264', '42100005264'), false);
  assert.equal(barcodesMatch(42, '042'), false);
  assert.equal(barcodesMatch('', ''), false);
});

test('quantity coercion: blank and garbage read as 0, numbers truncate', () => {
  assert.equal(coerceQty(''), 0);
  assert.equal(coerceQty('n/a'), 0);
  assert.equal(coerceQty(undefined), 0);
  assert.equal(coerceQty(7), 7);
  assert.equal(coerceQty('12'), 12);
  assert.equal(coerceQty(3.9), 3);
  assert.equal(coerceQty(-1.2), -1);
});

test('adjust validation enforces the delta contract', () => {
  const ok = validateAdjust({ barcode: 'A1', delta: MAX_ABS_DELTA });
  assert.equal(ok.ok, true);
  assert.equal(ok.delta, MAX_ABS_DELTA);
  assert.equal(validateAdjust({ barcode: 'A1', delta: -MAX_ABS_DELTA }).ok, true);
  for (const delta of [0, MAX_ABS_DELTA + 1, -(MAX_ABS_DELTA + 1), 1.5, '1', undefined]) {
    const r = validateAdjust({ barcode: 'A1', delta });
    assert.equal(r.ok, false, `delta ${JSON.stringify(delta)} must be rejected`);
    assert.equal(r.error, 'bad_request');
  }
});

test('adjust validation requires a usable barcode', () => {
  assert.equal(validateAdjust({ delta: 1 }).error, 'bad_request');
  assert.equal(validateAdjust({ barcode: '   ', delta: 1 }).error, 'bad_request');
  assert.equal(validateAdjust({ barcode: 'x'.repeat(129), delta: 1 }).error, 'bad_request');
  assert.equal(validateAdjust({ barcode: 'x'.repeat(128), delta: 1 }).ok, true);
});

test('delta application rejects going below zero', () => {
  assert.deepEqual(applyDelta(5, -5), { ok: true, qty: 0 });
  assert.deepEqual(applyDelta(0, 1), { ok: true, qty: 1 });
  const rejected = applyDelta(0, -1);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, 'below_zero');
  assert.equal(rejected.qty, 0);
  assert.equal(applyDelta(2, -3).error, 'below_zero');
});

test('action is explicit: add for positive, remove for negative', () => {
  assert.equal(actionForDelta(1), 'add');
  assert.equal(actionForDelta(5), 'add');
  assert.equal(actionForDelta(-1), 'remove');
});

test('create validation applies defaults and trimming', () => {
  const v = validateCreate({ barcode: ' B1 ', name: '  Oil filter ' });
  assert.equal(v.ok, true);
  assert.equal(v.barcode, 'B1');
  assert.equal(v.name, 'Oil filter');
  assert.equal(v.startQty, 1);
});

test('create validation rejects bad input', () => {
  assert.equal(validateCreate({ barcode: 'B1' }).error, 'bad_request');
  assert.equal(validateCreate({ barcode: 'B1', name: '   ' }).error, 'bad_request');
  assert.equal(validateCreate({ barcode: 'B1', name: 'x'.repeat(201) }).error, 'bad_request');
  assert.equal(validateCreate({ barcode: 'B1', name: 'x'.repeat(200) }).ok, true);
  assert.equal(validateCreate({ name: 'Bolt' }).error, 'bad_request');
  assert.equal(validateCreate({ barcode: 'B1', name: 'Bolt', startQty: -1 }).error, 'bad_request');
  assert.equal(validateCreate({ barcode: 'B1', name: 'Bolt', startQty: MAX_START_QTY + 1 }).error, 'bad_request');
  assert.equal(validateCreate({ barcode: 'B1', name: 'Bolt', startQty: 2.5 }).error, 'bad_request');
  assert.equal(validateCreate({ barcode: 'B1', name: 'Bolt', startQty: MAX_START_QTY }).ok, true);
});

test('creating with starting quantity 0 is allowed and still logs an add', () => {
  const v = validateCreate({ barcode: 'B2', name: 'Gasket', startQty: 0 });
  assert.equal(v.ok, true);
  assert.equal(v.startQty, 0);
  const ts = new Date('2026-07-19T12:00:00Z');
  const row = buildAuditRow(ts, 'B2', 'Gasket', 'add', 0, 0);
  assert.equal(row[3], 'add');
  assert.equal(row[4], 0);
  assert.equal(row[5], 0);
});

test('audit rows have the exact column order', () => {
  const ts = new Date('2026-07-19T12:00:00Z');
  assert.deepEqual(
    buildAuditRow(ts, '0421', 'Brake pad', 'remove', -1, 4),
    [ts, '0421', 'Brake pad', 'remove', -1, 4]
  );
});

test('POST body parsing accepts only a JSON object', () => {
  const parsed = parseBody('{"action":"adjust","barcode":"1","delta":1}');
  assert.equal(parsed.action, 'adjust');
  for (const bad of ['not json', '"hi"', '[1,2]', '', 'null', '42', undefined]) {
    assert.equal(parseBody(bad), null, `body ${JSON.stringify(bad)} must be rejected`);
  }
});
