// Tests for lib/performance.ts (the performance report's drill-down). Run: npm test (in client/).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allIds, applyFollowUp, buildTree, contactsText, followUpBody, hasStudent, initials, needsRemark, outcomeKey, performanceCsv, remarkName, standings } from './performance.ts';

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

test('the CSV has one line per number or email, with who, where and when (IST)', () => {
  const lines = performanceCsv(rows.slice(0, 2), (id) => names[id]).replace(/^﻿/, '').split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], '2026-10-21 16:29,Riya Sharma,riya@ijf.in,PLACEMENT_STAFF,Data Analyst,Acme Analytics,Job a1,Filtered,Phone,93456 7001,,', 'not given to anyone, no remark yet');
  const followed = [{ ...rows[0], outcomes: [{ student: 'Kavya Rao', status: 'other', note: 'Call after 5 pm, ask for Anil', updatedAt: null, updatedBy: null }] }];
  assert.match(performanceCsv(followed).split('\r\n')[1], /,Kavya Rao,"Others: Call after 5 pm, ask for Anil"$/);
  const two = [{ ...rows[0], outcomes: [fu('Kavya Rao', 'dnp'), fu('Aman Gupta', 'cv-shared')] }];
  assert.match(performanceCsv(two).split('\r\n')[1], /,Kavya Rao; Aman Gupta,Kavya Rao: DNP; Aman Gupta: CV shared$/, 'several students: each with their remark');
});

test('nothing added: an empty tree', () => {
  assert.deepEqual(buildTree([]), []);
});

test('follow-up counts at every level: given to a student, with a remark', () => {
  const withOutcome = rows.map((r, i) => ({ ...r, key: r.value, outcomes: i < 2 ? [fu('Kavya', i === 0 ? 'dnp' : '')] : i === 2 ? [fu('', '')] : [] }));
  const [riya] = buildTree(withOutcome);
  assert.deepEqual([riya.total, riya.assigned, riya.remarked], [4, 2, 1]);
  assert.equal(outcomeKey(withOutcome[0]), 'a1|phone|93456 7001');
  assert.deepEqual([remarkName('wrong', 'phone'), remarkName('wrong', 'email'), remarkName('cv-shared', 'email')], ['Wrong number', 'Wrong email', 'CV shared']);
});

test('the daily leaderboard: most contact details first, counted as the Total; the same total shares a place', () => {
  const day = [
    ...rows, // Riya 4, Aman 1
    row(6, 'neha@ijf.in', 'Neha', 'phone', zeta),
    row(7, 'neha@ijf.in', 'Neha', 'email', zeta),
    row(8, 'neha@ijf.in', 'Neha', 'email', acme1),
    row(9, 'neha@ijf.in', 'Neha', 'phone', acme1),
    row(10, 'dev@ijf.in', 'Dev', 'phone', acme2),
  ];
  assert.deepEqual(standings(day).map((p) => [p.name, p.total, p.phones, p.emails, p.rank]), [
    ['Neha', 4, 2, 2, 1],
    ['Riya Sharma', 4, 3, 1, 1],
    ['Aman', 1, 0, 1, 3],
    ['Dev', 1, 1, 0, 3],
  ]);
  const [neha, riya] = standings(day);
  assert.equal(riya.email, 'riya@ijf.in', 'one person whatever the letter case of the email');
  assert.equal(neha.total, buildTree(day).find((p) => p.label === 'Neha').total, 'the same number as the report');
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
