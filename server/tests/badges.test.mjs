import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBadges, monthlyChampions, monthRange, previousMonth } from '../src/utils/badges.js';

const ana = { _id: '507f1f77bcf86cd799439021', name: 'Ana' };
const ben = { _id: '507f1f77bcf86cd799439022', name: 'Ben' };
const cy = { _id: '507f1f77bcf86cd799439023', name: 'Cy' };
// 7:00 or later BC time, always on the same business date.
const form = (worker, workDate, hour = 15) => ({ worker, workDate, createdAt: `${workDate}T${hour}:00:00Z` });
const days = (month, count) => Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);

test('month helpers handle year boundaries and leap years', () => {
  assert.equal(previousMonth('2026-01-15'), '2025-12');
  assert.equal(previousMonth('2026-03-31'), '2026-02');
  assert.deepEqual(monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(monthRange('2026-11'), { from: '2026-11-01', to: '2026-11-30' });
});

test('monthly champions cover completed months only and share ties', () => {
  const submissions = [
    form(ana, '2026-09-01', 14), form(ben, '2026-09-01', 15),
    form(ana, '2026-10-01', 14), form(ben, '2026-10-01', 15),
    form(ben, '2026-10-02', 14), form(ana, '2026-10-02', 15),
    form(cy, '2026-11-02', 14),
  ];
  const champions = monthlyChampions(submissions, '2026-11');
  assert.deepEqual(champions.map(({ month, winners }) => [month, winners.map((winner) => winner.name)]),
    [['2026-09', ['Ana']], ['2026-10', ['Ana', 'Ben']]]);
});

test('badges are earned from forms, streaks, first places, hazards and titles', () => {
  const submissions = [
    ...days('2026-10', 12).map((date) => form(ana, date, 14)),
    ...days('2026-10', 3).map((date) => form(ben, date, 15)),
  ];
  const result = buildBadges({
    workers: [cy, ben, ana],
    submissions,
    hazardCounts: new Map([[ben._id, 2]]),
    today: '2026-11-20',
  });

  assert.deepEqual(result.monthlyChampion.month, '2026-10');
  assert.deepEqual(result.monthlyChampion.winners.map((winner) => winner.name), ['Ana']);
  assert.deepEqual(result.workers.map((worker) => worker.name), ['Ana', 'Ben', 'Cy']);

  const earned = (name) => result.workers.find((worker) => worker.name === name)
    .badges.filter((badge) => badge.earned).map((badge) => badge.id);
  assert.deepEqual(earned('Ana'), ['first-form', 'forms-10', 'streak-5', 'streak-10', 'first-responder', 'monthly-champion']);
  assert.deepEqual(earned('Ben'), ['first-form', 'hazard-spotter']);
  assert.deepEqual(earned('Cy'), []);

  const ana30 = result.workers[0].badges.find((badge) => badge.id === 'forms-30');
  assert.deepEqual([ana30.progress, ana30.target, ana30.earned], [12, 30, false]);
  assert.deepEqual(result.workers[0].stats, { forms: 12, bestStreak: 12, firstPlace: 12, hazardReports: 0, championships: 1 });
});

test('no champion when last month had no on-time forms', () => {
  const result = buildBadges({ workers: [ana], submissions: [form(ana, '2026-11-02')], today: '2026-11-20' });
  assert.equal(result.monthlyChampion, null);
  assert.equal(result.workers[0].earnedCount, 1);
});
