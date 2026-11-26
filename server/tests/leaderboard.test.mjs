import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeaderboard, localMinutes, pointsForPosition } from '../src/utils/leaderboard.js';

const ana = { _id: '507f1f77bcf86cd799439021', name: 'Ana' };
const ben = { _id: '507f1f77bcf86cd799439022', name: 'Ben' };
const cy = { _id: '507f1f77bcf86cd799439023', name: 'Cy' };
const at = (worker, workDate, createdAt) => ({ worker, workDate, createdAt });

test('points reward the first three responders and participation', () => {
  assert.deepEqual([1, 2, 3, 4, 9].map(pointsForPosition), [5, 3, 2, 1, 1]);
});

test('local response time uses BC time, including daylight saving', () => {
  assert.equal(localMinutes('2026-07-06T13:30:00Z'), 6 * 60 + 30);
  assert.equal(localMinutes('2026-01-05T14:30:00Z'), 6 * 60 + 30);
});

test('ranks workers by who responded first each day', () => {
  const result = buildLeaderboard([
    at(ben, '2026-10-05', '2026-10-05T14:10:00Z'),
    at(ana, '2026-10-05', '2026-10-05T14:00:00Z'),
    at(cy, '2026-10-05', '2026-10-05T15:00:00Z'),
    // A second form on the same day does not improve Ben's position.
    at(ben, '2026-10-05', '2026-10-05T16:00:00Z'),
    at(ana, '2026-10-06', '2026-10-06T14:20:00Z'),
    at(ben, '2026-10-06', '2026-10-06T14:05:00Z'),
    at(ana, '2026-10-07', '2026-10-07T13:55:00Z'),
  ]);
  assert.deepEqual(result.leaderboard.map(({ name, rank, points }) => [name, rank, points]),
    [['Ana', 1, 13], ['Ben', 2, 8], ['Cy', 3, 2]]);
  const [first, second] = result.leaderboard;
  assert.equal(first.firstPlace, 2);
  assert.equal(first.secondPlace, 1);
  assert.equal(first.participationRate, 100);
  assert.equal(first.currentStreak, 3);
  assert.equal(first.averagePosition, 1.3);
  assert.equal(first.fastestResponseMinutes, 6 * 60 + 55);
  assert.equal(second.currentStreak, 0);
  assert.equal(second.bestStreak, 2);
  assert.equal(second.participationRate, 66.7);
  assert.deepEqual(result.metrics, {
    daysTracked: 3, totalResponses: 6, respondents: 3, averageResponsesPerDay: 2,
    averageFirstResponseMinutes: Math.round((420 + 425 + 415) / 3),
    earliestResponse: { name: 'Ana', workerId: ana._id, date: '2026-10-07', minutes: 415 },
  });
  assert.equal(result.latestDay.date, '2026-10-07');
  assert.equal(result.latestDay.responses[0].name, 'Ana');
});

test('equal records share a rank and deleted workers are skipped', () => {
  const result = buildLeaderboard([
    at(ana, '2026-10-05', '2026-10-05T14:00:00Z'),
    at(ben, '2026-10-06', '2026-10-06T14:00:00Z'),
    at(null, '2026-10-06', '2026-10-06T13:00:00Z'),
  ]);
  assert.deepEqual(result.leaderboard.map((entry) => entry.rank), [1, 1]);
  assert.equal(result.metrics.totalResponses, 2);
});

test('empty periods return empty metrics', () => {
  const result = buildLeaderboard([]);
  assert.deepEqual(result.leaderboard, []);
  assert.equal(result.metrics.earliestResponse, null);
  assert.equal(result.latestDay, null);
});
