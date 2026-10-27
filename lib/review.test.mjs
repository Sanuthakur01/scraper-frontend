// Tests for lib/review.ts (the Review board's numbers). Run: npm test (in client/).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { byCourse, byFinder, byGiver, byStudent, commonNotes, groupRows, matchesReview, NO_REVIEW_FILTERS, perDay, retryCalls, statsOf, summaryOf } from './review.ts';

const NOW = Date.parse('2026-10-27T12:00:00+05:30');
const at = (hoursAgo) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
const asha = { email: 'asha@example.com', name: 'Asha' };
const vanshika = { email: 'vanshika@example.com', name: 'Vanshika' };
const purnima = { email: 'purnima@example.com', name: '' };
// One row of GET /review: a number with one student (by default the one it was given to, else the one on its
// follow-up now; '' : none).
const row = (n, { course = 'data-analyst', found = { source: 'team', by: asha }, added = null, given, feedback, now, student, withStudents } = {}) => ({
  id: `j${n}|phone|${n}|${(student ?? given?.student ?? now?.student ?? '').toLowerCase()}`,
  contact: `j${n}|phone|${n}`,
  student: student ?? given?.student ?? now?.student ?? '',
  withStudents: withStudents ?? (given || now?.student ? 1 : 0),
  job: { id: `j${n}`, set: 'filtered', title: `Job ${n}`, company: `Company ${n}`, course },
  field: 'phone',
  value: `9000000${n}`,
  key: `9000000${n}`,
  found,
  added,
  given: given ?? null,
  feedback: feedback ?? null,
  now: now ?? null,
});
const give = (student, hoursAgo, by = vanshika, inPeriod = true) => ({ at: at(hoursAgo), by, student, inPeriod });
const said = (status, hoursAgo, note = '', hours = 1, by = vanshika) => ({ at: at(hoursAgo), by, label: status, status, note, hours });

const ROWS = [
  row(1, { added: { at: at(3), by: asha }, given: give('Riya', 2), feedback: said('cv-shared', 1, '', 1), now: { student: 'Riya', status: 'cv-shared', note: '' } }),
  row(2, { given: give('Riya', 30), now: { student: 'Riya', status: '', note: '' } }), // waiting over a day
  row(3, { given: give('Aman', 3, purnima), feedback: said('dnp', 2, '', 1), now: { student: 'Aman', status: 'dnp', note: '' } }),
  row(4, { course: 'data-science', found: { source: 'post', by: null }, given: give('aman', 4), feedback: said('wrong', 1, '', 3), now: { student: 'aman', status: 'wrong', note: '' } }),
  row(5, { found: { source: 'earlier', by: null }, given: give('Kiran', 80, vanshika, false), feedback: said('no-openings', 5, '', 75) }), // given before the period
  row(6, { feedback: said('other', 6, 'MAIL SENT', null), now: { student: '', status: 'other', note: 'MAIL SENT' } }),
  row(7, { course: 'data-science', given: give('Neha', 1), feedback: said('other', 0.5, 'mail sent.', 0.5), now: { student: 'Neha', status: 'other', note: 'mail sent.' } }),
  row(8, { given: give('Neha', 5), feedback: said('not-person', 4, '', 1), now: { student: 'Neha', status: 'not-person', note: '' } }),
  row(9, { given: give('Neha', 6) }), // no follow-up at all yet
  row(12, { added: { at: at(3), by: asha } }), // added today, not given out
  row(13, { added: { at: at(2), by: asha }, now: { student: '', status: 'dnp', note: '' } }), // a remark, but no student: not given out
];

test('the totals: given out, feedback, each remark, reached / wrong, the share that reached the right person, awaiting', () => {
  const s = statsOf(ROWS);
  assert.equal(s.given, 7, 'given in the period (not the one given before it, nor the one never given)');
  assert.equal(s.feedback, 7);
  assert.deepEqual(s.byRemark, { dnp: 1, busy: 0, 'switched-off': 0, wrong: 1, 'not-person': 1, 'cv-shared': 1, 'no-openings': 1, other: 2 });
  assert.deepEqual([s.cvShared, s.reached, s.wrong, s.notReached, s.other], [1, 2, 2, 1, 2]);
  const calls = ['dnp', 'busy', 'switched-off', 'wrong'].map((status, i) => row(20 + i, { feedback: said(status, 1) }));
  assert.deepEqual([statsOf(calls).notReached, statsOf(calls).wrong], [3, 1], 'not reached: DNP, Busy and Switched off');
  assert.equal(s.accuracy, 0.5, 'reached 2 of the 4 calls that got through');
  assert.equal(s.awaiting, 2, 'given in the period and no remark now (rows 2 and 9)');
  assert.deepEqual([s.added, s.notGiven], [3, 2], 'added in the period: 3; not given to a student: rows 12 and 13');
  assert.equal(statsOf([]).accuracy, null, 'no call got through: no share');
});

test('the summary: students and people giving numbers out, waiting over a day, median hours, the most common feedback', () => {
  const s = summaryOf(ROWS, NOW);
  assert.equal(s.students, 3, 'Riya, Aman (any case), Neha; not Kiran (before the period)');
  assert.equal(s.givers, 2);
  assert.equal(s.waitingOverDay, 1, 'row 2, given 30 hours ago');
  assert.equal(s.medianHours, 1, 'of 1, 1, 3, 75, 0.5, 1 (row 6 has none)');
  assert.deepEqual(s.mostCommon, { status: 'other', count: 2 });
  assert.deepEqual(summaryOf(ROWS.slice(0, 4), NOW).mostCommon, { status: 'dnp', count: 1 }, 'a tie goes to the first in the list (DNP before Wrong number…)');
  assert.equal(summaryOf([], NOW).mostCommon, null);
});

test('groups: per student, per person who found the numbers (or the job post), per person who gave them out, per course (a number only added is in none)', () => {
  const students = groupRows(ROWS, byStudent);
  assert.deepEqual(students.map((g) => [g.label, g.given, g.feedback]), [
    ['Neha', 3, 2],
    ['Aman', 2, 2],
    ['Riya', 2, 1],
    ['Kiran', 0, 1],
  ], 'students only: a number with feedback but no student (row 6) and the ones only added are in none');
  assert.equal(students[0].accuracy, 0, "Neha's call that got through reached the wrong person");
  const finders = groupRows(ROWS, byFinder);
  assert.deepEqual(finders.map((g) => [g.key, g.label]), [
    ['asha@example.com', 'Asha'],
    ['post', 'Found in the job post'],
    ['earlier', 'Added before the record began'],
  ]);
  assert.deepEqual([finders[0].reached, finders[0].wrong, finders[1].wrong, finders[2].reached], [1, 1, 1, 1]);
  assert.deepEqual(groupRows(ROWS, byGiver).map((g) => [g.label, g.given]), [
    ['Vanshika', 6],
    ['purnima@example.com', 1],
  ], 'only numbers given out in the period; a person without a name by their email');
  assert.deepEqual(groupRows(ROWS, byCourse).map((g) => [g.key, g.given + g.feedback]), [
    ['data-analyst', 10],
    ['data-science', 4],
  ]);
});

test('"Others" in the callers\' words: the same words counted together however written', () => {
  assert.deepEqual(commonNotes(ROWS), [{ text: 'Mail sent', count: 2 }]);
  const more = [...ROWS, row(10, { feedback: said('other', 1, 'OUT OF SERVICE') }), row(11, { feedback: said('other', 1, '5+ REQUIRED') })];
  assert.deepEqual(commonNotes(more), [
    { text: 'Mail sent', count: 2 },
    { text: '5+ required', count: 1 },
    { text: 'Out of service', count: 1 },
  ]);
});

test('day by day: each IST day of the period, what was given out and the feedback on it', () => {
  const days = perDay(ROWS, '2026-10-26', '2026-10-27');
  assert.deepEqual(days.map((d) => d.day), ['2026-10-26', '2026-10-27']);
  assert.deepEqual(days[1], { day: '2026-10-27', given: 6, feedback: 7, cvShared: 1, wrong: 2 });
  assert.deepEqual(days[0], { day: '2026-10-26', given: 1, feedback: 0, cvShared: 0, wrong: 0 }, 'row 2, given 30 hours before noon on the 27th');
});

test("the list's filters", () => {
  const ids = (f) => ROWS.filter((r) => matchesReview(r, { ...NO_REVIEW_FILTERS, ...f })).map((r) => r.job.id);
  assert.deepEqual(ids({}), ROWS.map((r) => r.job.id));
  assert.deepEqual(ids({ remark: 'given' }), ['j1', 'j2', 'j3', 'j4', 'j7', 'j8', 'j9'], 'given in the period');
  assert.deepEqual(ids({ remark: 'feedback' }), ['j1', 'j3', 'j4', 'j5', 'j6', 'j7', 'j8'], 'with feedback in the period');
  assert.deepEqual(ids({ remark: 'not-given' }), ['j12', 'j13'], 'added, not given to anyone');
  assert.deepEqual(ids({ remark: 'awaiting' }), ['j2', 'j9']);
  assert.deepEqual(ids({ remark: 'reached' }), ['j1', 'j5']);
  assert.deepEqual(ids({ remark: 'wrong-any' }), ['j4', 'j8']);
  assert.deepEqual(ids({ remark: 'other' }), ['j6', 'j7']);
  assert.deepEqual(ids({ student: 'aman' }), ['j3', 'j4']);
  assert.deepEqual(ids({ course: 'data-science' }), ['j4', 'j7']);
  assert.deepEqual(ids({ finder: 'post' }), ['j4']);
  assert.equal(ids({ finder: 'asha@example.com' }).length, 9, "every number Asha found, the ones not given out too (rows 12 and 13)");
  assert.deepEqual(ids({ giver: 'purnima@example.com' }), ['j3']);
  assert.deepEqual(ids({ q: 'company 8' }), ['j8']);
  assert.deepEqual(ids({ q: 'mail' }), ['j6', 'j7'], 'the words of a remark too');
});

test('a number given to two students: each call counted, the number itself once', () => {
  const both = { added: { at: at(4), by: asha }, withStudents: 2 };
  const shared = [
    row(14, { ...both, given: give('Sam', 3), feedback: said('busy', 2), now: { student: 'Sam', status: 'busy', note: '' } }),
    row(14, { ...both, given: give('Dev', 2), now: { student: 'Dev', status: '', note: '' } }),
    // A remark made before anyone had it, on a number a student has now: not "not given out".
    row(15, { added: { at: at(5), by: asha }, student: '', withStudents: 1, feedback: said('wrong', 4) }),
  ];
  const s = statsOf(shared);
  assert.deepEqual([s.given, s.givenNumbers, s.feedback, s.awaiting, s.added, s.notGiven], [2, 1, 2, 1, 2, 0]);
  assert.deepEqual(groupRows(shared, byStudent).map((g) => [g.label, g.given, g.feedback]), [
    ['Sam', 1, 1],
    ['Dev', 1, 0],
  ]);
  assert.deepEqual(shared.filter((r) => matchesReview(r, { ...NO_REVIEW_FILTERS, student: 'dev' })).map((r) => r.student), ['Dev']);
  assert.equal(summaryOf(shared, NOW).students, 2);
});

test("call again today: yesterday's DNP, Busy and Switched off calls, nothing older, none tried again since", () => {
  // NOW is noon on 27 Oct (IST): 20 hours ago is 26 Oct, 40 hours ago 25 Oct, 1 hour ago today.
  const now = (status) => ({ student: 'x', status, note: '' });
  const rows = [
    row(30, { given: give('Riya', 30), feedback: said('dnp', 22), now: now('dnp') }), // yesterday, still DNP: listed
    row(31, { given: give('Aman', 30), feedback: said('switched-off', 20), now: now('switched-off') }), // listed (the latest)
    row(32, { given: give('Neha', 30), feedback: said('busy', 26), now: now('busy') }), // listed
    row(33, { given: give('Kiran', 30), feedback: said('wrong', 21), now: now('wrong') }), // a wrong number: not a retry
    row(34, { given: give('Sam', 60), feedback: said('dnp', 40), now: now('dnp') }), // the day before yesterday: no
    row(35, { given: give('Dev', 30), feedback: said('busy', 1), now: now('cv-shared') }), // its last remark is today's
    // Riya's call on 36 was DNP yesterday, but Dev reached the number today: not listed.
    row(36, { given: give('Riya', 30), feedback: said('dnp', 21), now: now('dnp') }),
    row(36, { given: give('Dev', 2), feedback: said('cv-shared', 1), now: now('cv-shared') }),
    row(37, { given: give('Asha', 30), feedback: said('dnp', 23), now: now('') }), // the remark is gone now: no
    row(38, { student: '', feedback: said('dnp', 21.5), now: { student: '', status: 'dnp', note: '' } }), // no student: listed
  ];
  assert.deepEqual(retryCalls(rows, '2026-10-26').map((r) => r.job.id), ['j31', 'j38', 'j30', 'j32']);
  assert.deepEqual(retryCalls([], '2026-10-26'), []);
});
