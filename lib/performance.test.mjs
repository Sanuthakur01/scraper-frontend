// Tests for lib/performance.ts (the performance report's drill-down). Run: npm test (in client/).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allIds,
  applyFollowUp,
  buildTree,
  contactsText,
  countsOf,
  cvSharedOf,
  followUpBody,
  formatPoints,
  hasStudent,
  initials,
  needsRemark,
  outcomeKey,
  performanceCsv,
  pointsOf,
  remarkHistory,
  remarkName,
  remarksText,
  standings,
  teamCvShared,
} from './performance.ts';

const fu = (student, status = '', note = '') => ({ student, status, note, updatedAt: null, updatedBy: null });

const job = (id, course, company, title = `Job ${id}`) => ({ id, set: 'filtered', title, company, course });
const row = (n, email, name, field, j, at = `2026-10-21T10:${String(60 - n).padStart(2, '0')}:00Z`) => ({
  record: `r${n}`,
  at,
  actor: { email, name, role: 'PLACEMENT_STAFF' },
  job: j,
  field,
  value: field === 'phone' ? `93456 700${n}` : `hr${n}@x.in`,
});
const acme1 = job('a1', 'data-analyst', 'Acme Analytics');
const acme2 = job('a2', 'data-analyst', 'acme analytics ', 'Second Acme job');
const zeta = job('z1', 'data-science', 'Zeta');
const rows = [
  row(1, 'riya@ijf.in', 'Riya Sharma', 'phone', acme1),
  row(2, 'riya@ijf.in', 'Riya Sharma', 'email', acme1),
  row(3, 'riya@ijf.in', 'Riya Sharma', 'phone', acme2),
  row(4, 'RIYA@ijf.in', '', 'phone', zeta),
  row(5, 'aman@ijf.in', 'Aman', 'email', zeta),
];
const names = { 'data-analyst': 'Data Analyst', 'data-science': 'Data Science' };
// A CV shared in the period, as GET /performance sends it: on a number `finder` found (null: nobody on the team).
const cv = (n, finder, j, value, student = 'Kavya', at = `2026-10-21T11:${String(n).padStart(2, '0')}:00Z`) => ({
  at,
  by: { email: 'caller@ijf.in', name: 'Neha' },
  student,
  job: j,
  field: value.includes('@') ? 'email' : 'phone',
  value,
  key: value,
  finder: finder && { email: finder, name: '', role: 'RESEARCH_TEAM' },
  addedAt: '2026-10-20T09:00:00Z',
});

test('person → course → company → job, most first, with counts that add up at every level', () => {
  const tree = buildTree(rows, (id) => names[id]);
  assert.deepEqual(tree.map((p) => [p.label, p.phones, p.emails, p.total, p.jobs]), [
    ['Riya Sharma', 3, 1, 4, 3],
    ['Aman', 0, 1, 1, 1],
  ]);
  const riya = tree[0];
  assert.equal(riya.person.email, 'riya@ijf.in', 'one person whatever the letter case of the email');
  assert.deepEqual(riya.children.map((c) => [c.label, c.total]), [['Data Analyst', 3], ['Data Science', 1]]);
  const [company] = riya.children[0].children;
  assert.deepEqual([company.label, company.total, company.jobs], ['Acme Analytics', 3, 2], 'one company whatever its spacing or case');
  assert.deepEqual(company.children.map((j) => [j.label, j.total]), [['Job a1', 2], ['Second Acme job', 1]]);
  const [leafJob] = company.children;
  assert.deepEqual([leafJob.level, leafJob.children.length, leafJob.rows.map((r) => r.value)], ['job', 0, ['93456 7001', 'hr2@x.in']], 'the final grain: each number and email');
  for (const node of [riya, ...riya.children, company]) {
    assert.equal(node.children.reduce((n, c) => n + c.total, 0), node.total, `${node.label}: children add up`);
  }
});

test('ids are unique paths; Expand all opens every level', () => {
  const ids = allIds(buildTree(rows));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('p:riya@ijf.in/c:data-analyst/o:acme analytics/j:a1'));
  assert.equal(ids.length, 2 + 3 + 3 + 4, 'people + courses + companies + jobs');
});

test('the CSV has one line per number or email, and per CV shared, with who, where, when (IST) and the points', () => {
  const lines = performanceCsv(rows.slice(0, 2), (id) => names[id]).replace(/^﻿/, '').split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0].split(',').at(-1), 'Points');
  assert.equal(lines[1], '2026-10-21 16:29,Riya Sharma,riya@ijf.in,PLACEMENT_STAFF,Data Analyst,Acme Analytics,Job a1,Filtered,Phone,93456 7001,,,,1.5', 'no source recorded, not given to anyone, no remark yet; a phone number: 1.5');
  assert.match(lines[2], /,Email,hr2@x\.in,,,,1$/, 'an email: 1');
  assert.match(performanceCsv([{ ...rows[0], foundBy: 'Apollo' }]).split('\r\n')[1], /,93456 7001,Apollo,,,1\.5$/, 'where it was found');
  const followed = [{ ...rows[0], outcomes: [{ student: 'Kavya Rao', status: 'other', note: 'Call after 5 pm, ask for Anil', updatedAt: null, updatedBy: null }] }];
  assert.match(performanceCsv(followed).split('\r\n')[1], /,Kavya Rao,"Others: Call after 5 pm, ask for Anil",1\.5$/);
  const two = [{ ...rows[0], outcomes: [fu('Kavya Rao', 'dnp'), fu('Aman Gupta', 'cv-shared')] }];
  assert.match(performanceCsv(two).split('\r\n')[1], /,Kavya Rao; Aman Gupta,Kavya Rao: DNP; Aman Gupta: CV shared,1\.5$/, 'several students: each with their remark');
  // A CV shared: its own line, under whoever found the number, at the time it was shared (newest first).
  const withCv = performanceCsv(rows.slice(0, 1), (id) => names[id], teamCvShared([cv(5, 'riya@ijf.in', acme1, '93456 7001', 'Aman Gupta')])).replace(/^﻿/, '').split('\r\n');
  assert.equal(withCv[1], '2026-10-21 16:35,,riya@ijf.in,RESEARCH_TEAM,Data Analyst,Acme Analytics,Job a1,Filtered,CV shared,93456 7001,,Aman Gupta,CV shared,5');
  assert.match(withCv[2], /^2026-10-21 16:29,Riya Sharma/);
});

test('where they were found (Found by) at every level: most first, then A–Z; none recorded not listed', () => {
  const sourced = rows.map((r, i) => ({ ...r, foundBy: ['Apollo', 'LinkedIn', 'Apollo', ''][i] ?? 'SignalHire' }));
  const tree = buildTree(sourced);
  const all = countsOf(sourced);
  assert.deepEqual(all.sources[0], { source: 'Apollo', count: 2 });
  assert.equal(all.sources.reduce((n, s) => n + s.count, 0), sourced.filter((r) => r.foundBy).length, 'every recorded one, once');
  assert.ok(!all.sources.some((s) => s.source === ''), 'none recorded: not a source');
  for (const node of tree) assert.equal(node.sources.reduce((n, s) => n + s.count, 0), node.rows.filter((r) => r.foundBy).length, node.label);
  assert.deepEqual(countsOf([{ ...rows[0], foundBy: 'LinkedIn' }, { ...rows[1], foundBy: 'Apollo' }]).sources.map((s) => s.source), ['Apollo', 'LinkedIn'], 'a tie: A–Z');
  assert.deepEqual(countsOf(rows).sources, [], 'nothing recorded');
});

test('nothing added: an empty tree', () => {
  assert.deepEqual(buildTree([]), []);
});

test('follow-up counts at every level: given to a student, with a remark; the CVs shared on a number now', () => {
  const withOutcome = rows.map((r, i) => ({ ...r, key: r.value, outcomes: i < 2 ? [fu('Kavya', i === 0 ? 'dnp' : '')] : i === 2 ? [fu('', '')] : [] }));
  const [riya] = buildTree(withOutcome);
  assert.deepEqual([riya.total, riya.assigned, riya.remarked, riya.cvShared, riya.points], [4, 2, 1, 0, 5.5]);
  // The CVs shared on a number now (its students whose call ended in "CV shared": the All contacts list), apart
  // from the period's CVs shared, which the tree counts for the points (the points test).
  const shared = { ...rows[0], key: rows[0].value, outcomes: [fu('Kavya', 'cv-shared'), fu('Aman', 'cv-shared'), fu('Neha', 'dnp')] };
  assert.equal(cvSharedOf(shared), 2);
  assert.equal(buildTree([shared])[0].cvShared, 0, 'none shared in the period');
  assert.equal(outcomeKey(withOutcome[0]), 'a1|phone|93456 7001');
  assert.deepEqual([remarkName('wrong', 'phone'), remarkName('wrong', 'email'), remarkName('cv-shared', 'email')], ['Wrong number', 'Wrong email', 'CV shared']);
});

test('points: 1.5 a phone number, 1 an email, 5 a CV shared on a contact the person found, counted at every level', () => {
  assert.equal(pointsOf({ phones: 2, emails: 3, cvShared: 1 }), 11);
  assert.deepEqual([formatPoints(11), formatPoints(1.5), formatPoints(12.5), formatPoints(0), formatPoints(123456.5)], ['11', '1.5', '12.5', '0', '1,23,456.5']);
  // Riya: 3 phones + 1 email = 5.5, a CV shared on her Acme number (+5) and one on a Zeta number she found before
  // the period (+5: on a job none of her period's numbers are on) = 15.5. Aman: 1 email = 1. A CV shared on a number
  // nobody on the team found is nobody's.
  const zeta2 = job('z2', 'data-science', 'Zeta', 'Older Zeta job');
  const events = teamCvShared([cv(1, 'riya@ijf.in', acme1, '93456 7001'), cv(2, 'RIYA@ijf.in', zeta2, 'hr@zeta.in', 'Dev'), cv(3, null, acme1, '080-1111')]);
  assert.equal(events.length, 2, "the job post's number: nobody's points");
  const tree = buildTree(rows, (id) => names[id], events);
  assert.deepEqual(tree.map((p) => [p.label, p.total, p.cvShared, p.points]), [['Riya Sharma', 4, 2, 15.5], ['Aman', 1, 0, 1]]);
  const [riya] = tree;
  assert.deepEqual(riya.children.map((c) => [c.label, c.points]), [['Data Analyst', 9], ['Data Science', 6.5]], 'most points first');
  for (const node of [riya, ...riya.children, ...riya.children.flatMap((c) => c.children)]) {
    assert.equal(node.children.reduce((n, c) => n + c.points, 0), node.points, `${node.label}: the points add up`);
    assert.equal(node.children.reduce((n, c) => n + c.cvShared, 0), node.cvShared, `${node.label}: the CVs add up`);
  }
  const older = riya.children[1].children[0].children.find((j) => j.label === 'Older Zeta job');
  assert.deepEqual([older.total, older.cvShared, older.points, older.rows.length, older.events.length], [0, 1, 5, 0, 1], 'a job with only a CV shared');
  assert.deepEqual([countsOf(rows, events).points, countsOf(rows, events).cvShared, countsOf([]).points], [16.5, 2, 0]);
});

test('the daily leaderboard: the most points first; the same points share a place; a CV shared counts for whoever found the number', () => {
  const day = [
    ...rows, // Riya 3 phones + 1 email = 5.5, Aman 1 email = 1
    row(6, 'neha@ijf.in', 'Neha', 'phone', zeta),
    row(7, 'neha@ijf.in', 'Neha', 'email', zeta),
    row(8, 'neha@ijf.in', 'Neha', 'email', acme1),
    row(9, 'neha@ijf.in', 'Neha', 'phone', acme1),
    row(10, 'dev@ijf.in', 'Dev', 'phone', acme2),
  ];
  assert.deepEqual(standings(day).map((p) => [p.name, p.points, p.total, p.rank]), [
    ['Riya Sharma', 5.5, 4, 1],
    ['Neha', 5, 4, 2],
    ['Dev', 1.5, 1, 3],
    ['Aman', 1, 1, 4],
  ]);
  // A CV shared today on a number Neha found earlier: +5, and she leads with the same number of contacts as Riya.
  // Tanvi found nothing today, but a CV was shared on her number: on the board with 5.
  const events = teamCvShared([cv(1, 'neha@ijf.in', zeta, '93456 7006'), cv(2, 'tanvi@ijf.in', acme1, 'hr@acme.in', 'Dev')]);
  assert.deepEqual(standings(day, events).map((p) => [p.name, p.points, p.total, p.cvShared, p.rank]), [
    ['Neha', 10, 4, 1, 1],
    ['Riya Sharma', 5.5, 4, 0, 2],
    ['tanvi@ijf.in', 5, 0, 1, 3],
    ['Dev', 1.5, 1, 0, 4],
    ['Aman', 1, 1, 0, 5],
  ]);
  // The same points share a place (then the most contacts first).
  const tied = standings([
    row(11, 'a@ijf.in', 'A', 'phone', zeta),
    row(12, 'a@ijf.in', 'A', 'phone', zeta),
    row(13, 'b@ijf.in', 'B', 'email', zeta),
    row(14, 'b@ijf.in', 'B', 'email', zeta),
    row(15, 'b@ijf.in', 'B', 'email', zeta),
    row(16, 'c@ijf.in', 'C', 'email', zeta),
  ]);
  assert.deepEqual(tied.map((p) => [p.name, p.points, p.rank]), [['B', 3, 1], ['A', 3, 1], ['C', 1, 3]]);
  const [riya] = standings(day);
  assert.equal(riya.email, 'riya@ijf.in', 'one person whatever the letter case of the email');
  assert.equal(riya.points, buildTree(day).find((p) => p.label === 'Riya Sharma').points, 'the same number as the report');
  assert.deepEqual(standings([]), []);
  assert.deepEqual([initials('Riya Sharma', 'riya@ijf.in'), initials('', 'aman@ijf.in'), initials('neha', 'neha')], ['RS', 'A', 'N']);
});

test('a number with several students: given, taken back, each call with its own remark, as the server does it', () => {
  const names = (list) => list.map((o) => [o.student, o.status, o.note]);
  let list = applyFollowUp([], { add: 'Kavya Rao' });
  list = applyFollowUp(list, { add: 'Aman Gupta' });
  assert.deepEqual(names(applyFollowUp(list, { add: 'kavya RAO' })), names(list), 'the same student, any case: once');
  list = applyFollowUp(list, { student: 'aman gupta', status: 'cv-shared' });
  list = applyFollowUp(list, { student: 'Kavya Rao', status: 'other', note: 'Call after 5 pm' });
  assert.deepEqual(names(list), [['Kavya Rao', 'other', 'Call after 5 pm'], ['Aman Gupta', 'cv-shared', '']]);
  assert.deepEqual(names(applyFollowUp(list, { student: 'Neha', status: 'busy' })).at(-1), ['Neha', 'busy', ''], 'a remark gives it to the student first');
  assert.deepEqual(names(applyFollowUp(list, { remove: 'KAVYA rao' })), [['Aman Gupta', 'cv-shared', '']], 'taken back: their remark goes too');
  // The number's own remark (no student has it); the first student given it takes it over.
  let loose = applyFollowUp([], { student: '', status: 'wrong' });
  assert.deepEqual(names(loose), [['', 'wrong', '']]);
  assert.deepEqual(names(applyFollowUp(loose, { add: 'Riya' })), [['Riya', 'wrong', '']]);
  assert.deepEqual(applyFollowUp(loose, { student: '', status: '' }), [], 'cleared: nothing left');
  // What the server is sent.
  assert.deepEqual(followUpBody({ add: 'Riya' }), { student: 'Riya', add: true });
  assert.deepEqual(followUpBody({ remove: 'Riya' }), { student: 'Riya', remove: true });
  assert.deepEqual(followUpBody({ student: 'Riya', status: 'dnp', note: 'x' }), { student: 'Riya', status: 'dnp', note: '' });
  // Given to anyone; no remark yet = none at all, or one of its students hasn't one.
  assert.deepEqual([hasStudent({ outcomes: list }), hasStudent({ outcomes: loose }), hasStudent({ outcomes: [] })], [true, false, false]);
  assert.deepEqual(
    [needsRemark({ outcomes: list }), needsRemark({ outcomes: [fu('A', 'dnp'), fu('B')] }), needsRemark({ outcomes: [] }), needsRemark({ outcomes: loose })],
    [false, true, true, false],
  );
});

test("a new remark is added after the call's earlier ones (they stay); the latest counts", () => {
  const remarks = (o) => remarkHistory(o).map((r) => [r.status, r.note, r.at]);
  // A follow-up from a server older than remark lists (or saved before them): its one remark.
  const old = { student: 'Kavya', status: 'dnp', note: '', updatedAt: '2026-11-20T05:00:00Z', updatedBy: { email: 'a@ijf.in' } };
  assert.deepEqual(remarks(old), [['dnp', '', '2026-11-20T05:00:00Z']]);
  assert.deepEqual(remarks({ ...old, status: '' }), [], 'no remark: none');
  // Each remark added (when: not known until the server answers); the same one again too.
  let list = applyFollowUp([old], { student: 'kavya', status: 'busy' });
  list = applyFollowUp(list, { student: 'Kavya', status: 'other', note: 'Call after 5 pm' });
  list = applyFollowUp(list, { student: 'Kavya', status: 'other', note: 'Call after 5 pm' });
  assert.deepEqual([list[0].status, list[0].note], ['other', 'Call after 5 pm'], 'the latest');
  assert.deepEqual(remarks(list[0]), [
    ['dnp', '', '2026-11-20T05:00:00Z'],
    ['busy', '', null],
    ['other', 'Call after 5 pm', null],
    ['other', 'Call after 5 pm', null],
  ]);
  // A student's first remark, a number's own remarks going to the first student given it, and clearing.
  assert.deepEqual(remarks(applyFollowUp([], { student: 'Neha', status: 'cv-shared' })[0]), [['cv-shared', '', null]]);
  let loose = applyFollowUp([], { student: '', status: 'wrong' });
  loose = applyFollowUp(loose, { student: '', status: 'dnp' });
  const riya = applyFollowUp(loose, { add: 'Riya' })[0];
  assert.deepEqual([riya.student, remarks(riya).map((r) => r[0])], ['Riya', ['wrong', 'dnp']]);
  assert.deepEqual(remarks(applyFollowUp(list, { student: 'Kavya', status: '' })[0]), [], 'cleared: none left');
  // In lists and spreadsheets: every remark, oldest first.
  assert.equal(remarksText({ field: 'email', outcomes: [{ ...list[0], history: [...list[0].history.slice(0, 2), { status: 'wrong', note: '', at: null, by: null }] }] }), 'DNP → Busy → Wrong email');
  assert.equal(remarksText({ field: 'phone', outcomes: [list[0], { ...old, student: 'Aman', status: 'cv-shared' }] }), 'Kavya: DNP → Busy → Others: Call after 5 pm → Others: Call after 5 pm; Aman: CV shared');
});

test('copying numbers and emails: the contacts alone, each once, in order, separated by commas', () => {
  const r = (field, value, key = value.trim().toLowerCase()) => ({ field, value, key, job: { company: 'Not copied' }, actor: { name: 'Not copied' } }); // key: as the server makes it
  const rows = [
    r('phone', '98100 00001', '9810000001'),
    r('email', ' HR@Acme.example '),
    r('phone', '+91 98100 00001', '9810000001'), // the same number written differently
    r('email', 'hr@acme.example'), // the same email in another case
    r('email', 'jobs@beta.example'),
  ];
  assert.deepEqual(contactsText(rows), { text: '98100 00001, HR@Acme.example, jobs@beta.example', count: 3, repeats: 2 });
  assert.deepEqual(contactsText([]), { text: '', count: 0, repeats: 0 });
});
