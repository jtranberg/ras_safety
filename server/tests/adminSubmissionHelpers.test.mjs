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

// Independent CSV reader used to check what a spreadsheet actually receives.
function readCsvRecord(record) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < record.length; index += 1) {
    const character = record[index];
    if (character === '"') {
      if (quoted && record[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }
  assert.equal(quoted, false, 'CSV record must have balanced quotes');
  fields.push(field);
  return fields;
}

function exportedRecord(submission) {
  const headers = readCsvRecord(csvHeader());
  const values = readCsvRecord(csvSubmission(submission));
  assert.equal(values.length, headers.length, 'Every value must align with a header');
  assert.equal(new Set(headers).size, headers.length, 'Headers must be unique');
  return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
}

test('BC work date remains the same through the repeated autumn hour', () => {
  // These represent the two different occurrences of 1:30 a.m. in Vancouver.
  assert.equal(businessDate(new Date('2026-11-01T08:30:00Z')), '2026-11-01');
  assert.equal(businessDate(new Date('2026-11-01T09:30:00Z')), '2026-11-01');
});

test('filters preserve valid IDs, same-day ranges and open-ended dates', () => {
  const input = {
    siteId: '0123456789abcdef01234567', workerId: 'ABCDEF0123456789ABCDEF01',
    from: '2026-10-04', to: '2026-10-04', status: 'AUTHORIZED',
  };
  assert.deepEqual(parseAdminFilters(input), input);
  assert.equal(parseAdminFilters({from:'2026-10-04'}).to, '');
  assert.equal(parseAdminFilters({to:'2026-10-04'}).from, '');
  assert.equal(parseAdminFilters({status:''}).status, 'ALL');
});

test('every recognized query filter rejects arrays and object values', () => {
  for (const key of ['siteId', 'workerId', 'from', 'to', 'status']) {
    for (const value of [[], ['ALL'], {$ne:null}, 123, true, null]) {
      assert.throws(() => parseAdminFilters({[key]:value}),
        (error) => error.status === 400, `${key} must reject ${JSON.stringify(value)}`);
    }
  }
});

test('calendar validation rejects non-leap February and nonexistent month days', () => {
  for (const date of ['2025-02-29', '2026-04-31', '2026-00-10', '2026-10-00',
    '2026-1-04', '2026-10-04T00:00:00Z']) {
    assert.throws(() => parseAdminFilters({from:date}), (error) => error.status === 400);
    assert.throws(() => parseAdminFilters({to:date}), (error) => error.status === 400);
  }
  assert.equal(parseAdminFilters({from:'2028-02-29'}).from, '2028-02-29');
});

test('full CSV export preserves notes, UTC audit times and photo counts without secret metadata', () => {
  const notes = 'José checked Cedar, "North".\r\nKeep exit clear.';
  const record = exportedRecord({
    _id:'submission-123', worker:{name:'José Tranberg',passwordHash:'DO_NOT_EXPORT_HASH'},
    site:{name:'Cedar, "North"'}, workDate:'2026-10-04', status:'REVIEWED',
    createdAt:'2026-10-04T14:00:00-07:00',
    authorizedBy:{name:'First Admin'}, authorizedAt:new Date('2026-10-04T22:00:00Z'),
    revokedBy:{name:'Second Admin'}, revokedAt:'2026-10-04T16:00:00-07:00', notes,
    photos:[{objectKey:'DO_NOT_EXPORT_OBJECT_KEY'},{}],
    checklist:{ppe:true,fallProtection:false},
  });
  assert.equal(record['Submission ID'], 'submission-123');
  assert.equal(record.Worker, 'José Tranberg');
  assert.equal(record.Site, 'Cedar, "North"');
  assert.equal(record['Hazards and notes'], notes);
  assert.equal(record['Submitted at (UTC)'], '2026-10-04T21:00:00.000Z');
  assert.equal(record['Authorized by'], 'First Admin');
  assert.equal(record['Authorized at (UTC)'], '2026-10-04T22:00:00.000Z');
  assert.equal(record['Revoked by'], 'Second Admin');
  assert.equal(record['Revoked at (UTC)'], '2026-10-04T23:00:00.000Z');
  assert.equal(record['Photo count'], '2');
  assert.equal(record['Required PPE worn'], 'Yes');
  assert.equal(record['Fall protection in place'], 'No');
  assert.equal(record['Site orientation and daily instructions reviewed'], 'Not recorded');
  assert.ok(!Object.values(record).includes('DO_NOT_EXPORT_HASH'));
  assert.ok(!Object.values(record).includes('DO_NOT_EXPORT_OBJECT_KEY'));
});

test('CSV submission protects formula-like worker names, sites and notes', () => {
  const record = exportedRecord({
    worker:{name:'=HYPERLINK("https://example.com")'},
    site:{name:'  +SUM(A1:A2)'}, notes:'\t@SUM(A1:A2)',
    status:'SUBMITTED', workDate:'2026-10-04', checklist:{},
  });
  assert.equal(record.Worker, '\'=HYPERLINK("https://example.com")');
  assert.equal(record.Site, "'  +SUM(A1:A2)");
  assert.equal(record['Hazards and notes'], "'\t@SUM(A1:A2)");
  assert.equal(record['Authorized at (UTC)'], '');
  assert.equal(record['Photo count'], '0');
});
