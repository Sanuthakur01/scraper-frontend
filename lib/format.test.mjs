// Tests for the period helpers in lib/format.ts (Latest day / Last 7 / Last 30 days / Custom). Run: npm test (in client/).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, changeOf, changeWords, customPeriod, dayCount, isDay, PERIODS, periodFrom, periodParams, periodQuery, rangeLabel, shareText, shownCities } from './format.ts';

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

test('the change from the period before: up, down, the same, from none, or nothing to compare with', () => {
  const pick = (c) => c && [c.direction, c.badge, c.signed];
  assert.deepEqual(pick(changeOf(359, 321, true)), ['up', '12%', '+38']);
  assert.deepEqual(pick(changeOf(80, 100, true)), ['down', '20%', '−20']);
  assert.deepEqual(pick(changeOf(1240, 1240, true)), ['flat', '0%', '0']);
  assert.deepEqual(pick(changeOf(13, 0, true)), ['up', 'new', '+13'], 'none the day before (a real 0)');
  assert.deepEqual(pick(changeOf(0, 0, true)), ['flat', '0%', '0']);
  assert.equal(changeOf(13, 0, false), null, 'the day before was not collected: nothing to compare with');
  assert.deepEqual(pick(changeOf(1500, 1000)), ['up', '50%', '+500'], 'counts sent: they can be compared');
  assert.equal(changeWords(changeOf(359, 321, true), 'yesterday'), 'up 12%, 38 more than yesterday');
  assert.equal(changeWords(changeOf(80, 100, true), 'yesterday'), 'down 20%, 20 fewer than yesterday');
  assert.equal(changeWords(changeOf(13, 0, true), 'yesterday'), 'up from none, 13 more than yesterday');
  assert.equal(changeWords(changeOf(5, 5, true), 'yesterday'), 'the same as yesterday');
  assert.equal(changeWords(null, 'yesterday'), '');
  assert.equal(PERIODS.find((p) => p.days === 1).previous, 'yesterday');
});

test('"Remote" is never shown as a city; the other cities are, in order', () => {
  assert.deepEqual(shownCities(['Pune', 'Remote', 'Mumbai']), ['Pune', 'Mumbai']);
  assert.deepEqual(shownCities(['Remote']), []);
  assert.deepEqual(shownCities(undefined), []);
  assert.deepEqual(shownCities(['India (city not stated)']), ['India (city not stated)']);
});

test('a small share keeps a decimal (6.6%, not 7%; 0.4%, not 0%); big ones are whole; a few among many say so', () => {
  assert.equal(shareText(916, 13909), '6.6%');
  assert.equal(shareText(4, 1000), '0.4%');
  assert.equal(shareText(77, 358), '22%');
  assert.equal(shareText(1, 5000), '<0.1%');
  assert.equal(shareText(0, 50), '0%', 'none: no decimal');
  assert.equal(shareText(258, 2870), '9.0%', 'one decimal under 10%, like the shares beside it');
  assert.equal(shareText(3, 0), '—');
});
