import test from 'node:test';
import assert from 'node:assert/strict';
import { businessDate, parseAdminFilters, csvCell, csvHeader, csvSubmission, EXPORT_CHECKS } from '../src/utils/adminSubmissionHelpers.js';

test('BC work date follows local midnight and daylight saving time', () => {
  assert.equal(businessDate(new Date('2026-10-05T06:59:00Z')), '2026-10-04');
  assert.equal(businessDate(new Date('2026-10-05T07:00:00Z')), '2026-10-05');
  assert.equal(businessDate(new Date('2026-01-05T07:59:00Z')), '2026-01-04');
  assert.equal(businessDate(new Date('2026-01-05T08:00:00Z')), '2026-01-05');
});

test('filters reject malformed IDs, dates, query objects and reversed ranges', () => {
  for (const query of [{workerId:'bad'}, {siteId:{$ne:null}}, {from:'2026-02-30'},
    {to:'2026-13-01'}, {from:'2026-10-05',to:'2026-10-04'}, {status:'DESTROY'},
    {status:['ALL','AUTHORIZED']}]) {
    assert.throws(() => parseAdminFilters(query), (error) => error.status === 400);
  }
  assert.equal(parseAdminFilters({}).status, 'ALL');
  assert.equal(parseAdminFilters({from:'2024-02-29',status:'AWAITING'}).from, '2024-02-29');
});

test('CSV escapes commas, quotes and line breaks and preserves Unicode', () => {
  assert.equal(csvCell('Cedar, "North"\nCrew'), '"Cedar, ""North""\nCrew"');
  assert.equal(csvCell('José'), '"José"');
  assert.equal(csvCell(null), '""');
});

test('CSV treats spreadsheet formulas as text, including leading whitespace', () => {
  for (const value of ['=1+1', '+SUM(A1:A2)', '-1+1', '@SUM(A1:A2)', '  =1+1', '\t=1+1', '\n=1+1']) {
    assert.ok(csvCell(value).startsWith('"\''));
  }
  assert.equal(csvCell('Normal hazard note'), '"Normal hazard note"');
});

test('CSV keeps absent older checklist answers distinct from No', () => {
  const row = csvSubmission({_id:'abc', worker:null, site:null, workDate:'2026-10-04',
    status:'REVIEWED',checklist:{ppe:true,fallProtection:false},photos:[{},{}]});
  assert.ok(row.includes('"Unavailable worker","Unavailable site"'));
  assert.ok(row.includes('"2","Yes","No","Not recorded"'));
  assert.equal(EXPORT_CHECKS.length,18);
  assert.ok(csvHeader().includes('"Authorized at (UTC)"'));
});
