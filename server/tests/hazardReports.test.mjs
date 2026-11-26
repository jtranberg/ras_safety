import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHazardReport,
  parseHazardStatus,
  parseHazardFilters,
  publicHazardReport,
} from '../src/utils/hazardReports.js';

const siteId = '507f1f77bcf86cd799439013';
const valid = { siteId, type: 'NEAR_MISS', severity: 'HIGH', location: ' Level 2 ', description: ' Unguarded opening ' };

test('valid hazard reports are trimmed', () => {
  assert.deepEqual(parseHazardReport(valid).value, {
    siteId, type: 'NEAR_MISS', severity: 'HIGH', location: 'Level 2', description: 'Unguarded opening',
  });
  assert.equal(parseHazardReport({ ...valid, location: undefined }).value.location, '');
});

test('invalid hazard reports are rejected with a reason', () => {
  assert.equal(parseHazardReport(undefined).error, 'Select a valid site.');
  assert.equal(parseHazardReport({ ...valid, siteId: 'nope' }).error, 'Select a valid site.');
  assert.equal(parseHazardReport({ ...valid, type: 'FIRE' }).error, 'Choose Hazard or Near miss.');
  assert.equal(parseHazardReport({ ...valid, severity: 'EXTREME' }).error, 'Choose a severity: Low, Medium or High.');
  assert.equal(parseHazardReport({ ...valid, location: 'x'.repeat(201) }).error, 'Location must be no more than 200 characters.');
  assert.match(parseHazardReport({ ...valid, description: '   ' }).error, /Describe what happened/);
  assert.match(parseHazardReport({ ...valid, description: 'x'.repeat(2001) }).error, /Describe what happened/);
});

test('status updates accept known statuses and short notes', () => {
  assert.deepEqual(parseHazardStatus({ status: 'RESOLVED', note: ' Guardrail installed ' }).value,
    { status: 'RESOLVED', note: 'Guardrail installed' });
  assert.deepEqual(parseHazardStatus({ status: 'IN_PROGRESS' }).value, { status: 'IN_PROGRESS', note: '' });
  assert.equal(parseHazardStatus({ status: 'CLOSED' }).error, 'Choose Open, In progress or Resolved.');
  assert.equal(parseHazardStatus({ status: 'OPEN', note: 'x'.repeat(1001) }).error, 'Note must be no more than 1,000 characters.');
});

test('list filters validate status and site', () => {
  assert.deepEqual(parseHazardFilters({}).value, {});
  assert.deepEqual(parseHazardFilters({ status: '', siteId: '' }).value, {});
  const { value } = parseHazardFilters({ status: 'OPEN', siteId });
  assert.equal(value.status, 'OPEN');
  assert.equal(String(value.site), siteId);
  assert.equal(parseHazardFilters({ status: 'DONE' }).error, 'Invalid status filter.');
  assert.equal(parseHazardFilters({ siteId: 'bad' }).error, 'Invalid site filter.');
});

test('public reports expose a photo count, never storage keys', () => {
  const report = publicHazardReport({ _id: 'r1', __v: 0, status: 'OPEN',
    photos: [{ objectKey: 'hazards/r1/a.webp' }, { objectKey: 'hazards/r1/b.webp' }] });
  assert.deepEqual(report, { _id: 'r1', status: 'OPEN', photoCount: 2 });
});
