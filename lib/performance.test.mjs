// Tests for lib/performance.ts (the performance report's drill-down). Run: npm test (in client/).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allIds, buildTree, outcomeKey, performanceCsv, remarkName } from './performance.ts';

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
  const followed = [{ ...rows[0], outcome: { student: 'Kavya Rao', status: 'other', note: 'Call after 5 pm, ask for Anil', updatedAt: null, updatedBy: null } }];
  assert.match(performanceCsv(followed).split('\r\n')[1], /,Kavya Rao,"Others: Call after 5 pm, ask for Anil"$/);
});

test('nothing added: an empty tree', () => {
  assert.deepEqual(buildTree([]), []);
});

test('follow-up counts at every level: given to a student, with a remark', () => {
  const withOutcome = rows.map((r, i) => ({ ...r, key: r.value, outcome: i < 3 ? { student: i < 2 ? 'Kavya' : '', status: i === 0 ? 'dnp' : '', note: '', updatedAt: null, updatedBy: null } : null }));
  const [riya] = buildTree(withOutcome);
  assert.deepEqual([riya.total, riya.assigned, riya.remarked], [4, 2, 1]);
  assert.equal(outcomeKey(withOutcome[0]), 'a1|phone|93456 7001');
  assert.deepEqual([remarkName('wrong', 'phone'), remarkName('wrong', 'email'), remarkName('cv-shared', 'email')], ['Wrong number', 'Wrong email', 'CV shared']);
});
