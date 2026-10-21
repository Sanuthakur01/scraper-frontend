// Tests for the period helpers in lib/format.ts (Latest day / Last 7 / Last 30 days / Custom). Run: npm test (in client/).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, customPeriod, dayCount, isDay, PERIODS, periodFrom, periodParams, periodQuery, rangeLabel } from './format.ts';

const address = (query) => new URLSearchParams(query);

test('the page address picks the period: days, chosen dates, or Latest day', () => {
  assert.equal(periodFrom(address('')).key, '1');
  assert.equal(periodFrom(address('days=7')).key, '7');
  assert.equal(periodFrom(address('days=5')).key, '1', 'not a tab: Latest day');
  const range = periodFrom(address('from=2026-10-12&to=2026-10-15'));
  assert.deepEqual([range.key, range.from, range.to, range.days], ['custom', '2026-10-12', '2026-10-15', 4]);
  assert.equal(periodFrom(address('from=2026-10-12')).days, 1, 'from alone: that day');
  assert.deepEqual([periodFrom(address('from=2026-10-15&to=2026-10-12')).from, periodFrom(address('from=2026-10-15&to=2026-10-12')).to], ['2026-10-12', '2026-10-15'], 'either order');
  assert.equal(periodFrom(address('from=2026-02-31&to=2026-03-01')).key, '1', 'not a real date: Latest day');
  assert.equal(periodFrom(address('from=12-10-2026')).key, '1');
});

test('a chosen period goes to the API and the page address as from/to; a tab as days', () => {
  const range = customPeriod('2026-10-12', '2026-10-15');
  assert.deepEqual(periodParams(range), { from: '2026-10-12', to: '2026-10-15' });
  assert.equal(periodQuery(range), 'from=2026-10-12&to=2026-10-15');
  assert.deepEqual(periodParams(PERIODS[1]), { days: 7 });
  assert.equal(periodQuery(PERIODS[2]), 'days=30');
  assert.equal(periodFrom(address(periodQuery(range))).label, range.label, 'survives the trip through the address');
});

test('chosen dates read naturally', () => {
  assert.equal(rangeLabel('2026-10-15', '2026-10-15'), '15 Oct');
  assert.equal(rangeLabel('2026-10-12', '2026-10-15'), '12–15 Oct');
  assert.match(rangeLabel('2026-09-28', '2026-10-03'), /^28 Sept? – 3 Oct$/); // "Sep" or "Sept", by ICU version
  assert.match(rangeLabel('2025-12-28', '2026-01-03'), /2025 – .*2026/);
  const day = customPeriod('2026-10-15', '2026-10-15');
  assert.deepEqual([day.title, day.previous], ['New jobs found on 15 Oct', 'the day before']);
  const four = customPeriod('2026-10-12', '2026-10-15');
  assert.deepEqual([four.title, four.previous], ['New jobs found 12–15 Oct', 'the 4 days before']);
});

test('days are counted with both ends included, across months and leap years', () => {
  assert.equal(dayCount('2026-10-12', '2026-10-12'), 1);
  assert.equal(dayCount('2026-09-28', '2026-10-03'), 6);
  assert.equal(dayCount('2028-02-28', '2028-03-01'), 3);
  assert.equal(addDays('2026-10-01', -1), '2026-09-30');
  assert.ok(isDay('2028-02-29') && !isDay('2026-02-29') && !isDay('2026-13-01') && !isDay(null));
});
