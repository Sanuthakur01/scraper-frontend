// The performance report (components/PerformanceReport.tsx): the HR phone numbers and emails people
// added (GET /api/performance, one row each), grouped person → course → company → job, each level
// with its own counts. The rows under a job are the final grain: each number and email, and when.
import type { Period } from './format';
import type { ContactOutcome, CourseId, PerformanceRow, RemarkStatus } from './types';

// The remarks the calling team chooses from (the server's REMARKS), in the order shown, and the colour
// each shows in: good (CV shared), warn (try again), bad (dead end), neutral.
export const REMARKS: { id: RemarkStatus; label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' | 'accent' }[] = [
  { id: 'dnp', label: 'DNP', tone: 'warn' },
  { id: 'busy', label: 'Busy', tone: 'warn' },
  { id: 'switched-off', label: 'Switched off', tone: 'warn' },
  { id: 'wrong', label: 'Wrong number', tone: 'bad' },
  { id: 'not-person', label: 'Not the correct person', tone: 'bad' },
  { id: 'cv-shared', label: 'CV shared', tone: 'good' },
  { id: 'no-openings', label: 'No openings', tone: 'neutral' },
  { id: 'other', label: 'Others', tone: 'accent' },
];

// A remark's name for a number or an email ("Wrong number" reads "Wrong email" for an email).
export const remarkName = (status: RemarkStatus, field: 'phone' | 'email') =>
  status === 'wrong' && field === 'email' ? 'Wrong email' : (REMARKS.find((r) => r.id === status)?.label ?? status);

// The same number or email of the same job: one follow-up, whichever row it is shown on.
export const outcomeKey = (row: Pick<PerformanceRow, 'job' | 'field' | 'key'>) => `${row.job.id}|${row.field}|${row.key}`;

// ---------- Follow-ups: a number can go to several students, each call with its own remark ----------

const followUpsOf = (row: Pick<PerformanceRow, 'outcomes'>) => row.outcomes ?? [];
// Given to at least one student.
export const hasStudent = (row: Pick<PerformanceRow, 'outcomes'>) => followUpsOf(row).some((o) => o.student);
// "No remark yet": no remark at all, or one of its students hasn't said how their call went (the server's too:
// ai/tools.js needsRemark).
export const needsRemark = (row: Pick<PerformanceRow, 'outcomes'>) =>
  !followUpsOf(row).some((o) => o.status) || followUpsOf(row).some((o) => o.student && !o.status);
export const hasRemark = (row: Pick<PerformanceRow, 'outcomes'>, status: RemarkStatus) => followUpsOf(row).some((o) => o.status === status);

// One change to a number's follow-ups: give it to a student, take it back, or the remark of a student's call
// (student '': the number's own remark while no student has it).
export type FollowUpOp = { add: string } | { remove: string } | { student: string; status: RemarkStatus | ''; note?: string };

// What PUT /outcomes takes for it.
export function followUpBody(op: FollowUpOp) {
  if ('add' in op) return { student: op.add, add: true };
  if ('remove' in op) return { student: op.remove, remove: true };
  return { student: op.student, status: op.status, note: op.status === 'other' ? (op.note ?? '') : '' };
}

// The follow-ups after a change, as the server makes them (shown at once, before it answers): a student given it
// twice (in any case) has it once; the first student given it takes over a remark made before anyone was; a
// remark for a student who doesn't have it gives it to them; taken back, their remark goes too.
export function applyFollowUp(outcomes: ContactOutcome[], op: FollowUpOp): ContactOutcome[] {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if ('remove' in op) return outcomes.filter((o) => !(o.student && same(o.student, op.remove)));
  const student = 'add' in op ? op.add : op.student;
  const remark = 'add' in op ? null : { status: op.status, note: op.status === 'other' ? (op.note ?? '') : '' };
  const named = outcomes.filter((o) => o.student);
  const loose = outcomes.find((o) => !o.student);
  const mine = student ? named.find((o) => same(o.student, student)) : loose;
  if (mine) {
    if (!remark) return outcomes;
    if (!student && !remark.status) return outcomes.filter((o) => o !== mine); // the number's own remark, cleared
    return outcomes.map((o) => (o === mine ? { ...o, ...remark } : o));
  }
  if (!student) return remark?.status ? [...outcomes, { student: '', ...remark, updatedAt: null, updatedBy: null }] : outcomes;
  if (!named.length && loose) return outcomes.map((o) => (o === loose ? { ...o, student, ...(remark ?? {}) } : o));
  return [...outcomes, { student, status: '', note: '', ...(remark ?? {}), updatedAt: null, updatedBy: null }];
}

// The numbers and emails of some rows, for the clipboard: nothing else from the rows, each once (however it was
// written: "+91 98100 00001" and "98100 00001" are one number), in the rows' order, separated by commas.
export function contactsText(rows: Pick<PerformanceRow, 'field' | 'key' | 'value'>[]) {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const row of rows) {
    const id = `${row.field}|${row.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    values.push(row.value.trim());
  }
  return { text: values.join(', '), count: values.length, repeats: rows.length - values.length };
}

// "Kavya Rao: DNP; Aman Gupta: CV shared" (one follow-up: just its remark), for lists and spreadsheets.
export const remarksText = (row: Pick<PerformanceRow, 'field' | 'outcomes'>) => {
  const all = followUpsOf(row);
  return all
    .filter((o) => o.status)
    .map((o) => {
      const remark = o.status === 'other' ? `Others: ${o.note}` : remarkName(o.status as RemarkStatus, row.field);
      return all.length > 1 && o.student ? `${o.student}: ${remark}` : remark;
    })
    .join('; ');
};

// Today / Last 7 days / Last 30 days of people's work (the days end today, not on a collection day).
export const ACTIVITY_PERIODS: Period[] = [
  { key: '1', days: 1, tab: 'Today', label: 'Today', title: 'Added today', previous: 'yesterday' },
  { key: '7', days: 7, tab: 'Last 7 days', label: 'Last 7 days', title: 'Added in the last 7 days', previous: 'previous 7 days' },
  { key: '30', days: 30, tab: 'Last 30 days', label: 'Last 30 days', title: 'Added in the last 30 days', previous: 'previous 30 days' },
];

export type Level = 'person' | 'course' | 'company' | 'job';
export const LEVELS: Level[] = ['person', 'course', 'company', 'job'];

export interface Counts {
  phones: number;
  emails: number;
  total: number; // phones + emails
  jobs: number; // different jobs they were added to
  assigned: number; // of total: given to a student
  remarked: number; // of total: with a remark
}

export interface PerfNode extends Counts {
  id: string; // its path, unique in the tree: "p:riya@ijf.in/c:data-analyst/o:acme/j:6523…"
  level: Level;
  label: string;
  depth: number; // 0 for a person
  person?: { email: string; name: string; role: string | null };
  course?: CourseId;
  job?: PerformanceRow['job'];
  children: PerfNode[]; // none under a job: its rows are the final grain
  rows: PerformanceRow[]; // every number and email under it, newest first
}

export function countsOf(rows: PerformanceRow[]): Counts {
  const phones = rows.filter((r) => r.field === 'phone').length;
  return {
    phones,
    emails: rows.length - phones,
    total: rows.length,
    jobs: new Set(rows.map((r) => String(r.job.id))).size,
    assigned: rows.filter(hasStudent).length,
    remarked: rows.filter((r) => followUpsOf(r).some((o) => o.status)).length,
  };
}

// What a row is grouped by at each level. Companies ignore letter case and spaces around the name.
function keyOf(row: PerformanceRow, level: Level) {
  if (level === 'person') return row.actor.email.toLowerCase();
  if (level === 'course') return row.job.course ?? '';
  if (level === 'company') return (row.job.company ?? '').trim().toLowerCase();
  return String(row.job.id);
}

function labelOf(rows: PerformanceRow[], level: Level, courseName: (id: string) => string) {
  const row = rows[0];
  if (level === 'person') return rows.find((r) => r.actor.name?.trim())?.actor.name?.trim() || row.actor.email; // their newest name
  if (level === 'course') return row.job.course ? courseName(row.job.course) : 'Course not known';
  if (level === 'company') return row.job.company?.trim() || 'Company not shown';
  return row.job.title || 'A job';
}

// The tree, most contact details first at every level (then by name).
export function buildTree(rows: PerformanceRow[], courseName: (id: string) => string = (id) => id): PerfNode[] {
  const group = (list: PerformanceRow[], depth: number, parent: string): PerfNode[] => {
    const level = LEVELS[depth];
    const groups = new Map<string, PerformanceRow[]>();
    for (const row of list) {
      const key = keyOf(row, level);
      const rowsOf = groups.get(key);
      if (rowsOf) rowsOf.push(row);
      else groups.set(key, [row]);
    }
    const nodes = [...groups].map(([key, rowsOf]): PerfNode => {
      const id = `${parent}${parent ? '/' : ''}${level === 'company' ? 'o' : level[0]}:${key}`;
      const first = rowsOf[0];
      return {
        id,
        level,
        depth,
        label: labelOf(rowsOf, level, courseName),
        ...countsOf(rowsOf),
        ...(level === 'person' ? { person: { email: first.actor.email.toLowerCase(), name: labelOf(rowsOf, level, courseName), role: first.actor.role ?? null } } : {}),
        ...(level === 'course' ? { course: first.job.course } : {}),
        ...(level === 'job' ? { job: first.job } : {}),
        children: depth < LEVELS.length - 1 ? group(rowsOf, depth + 1, id) : [],
        rows: rowsOf,
      };
    });
    return nodes.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  };
  return group(rows, 0, '');
}

// "Riya Sharma" -> "RS"; "riya@ijf.in" -> "R"
export const initials = (name: string, email: string) =>
  (name.trim() && name !== email ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]) : [email[0] ?? '?']).join('').toUpperCase();

// One person's place on the daily leaderboard: the contact details (phone numbers + emails) they added.
export interface Standing {
  email: string;
  name: string;
  role: string | null;
  phones: number;
  emails: number;
  total: number;
  jobs: number;
  rank: number; // 1 = the most; the same total shares a place (1, 2, 2, 4)
}

// The leaderboard: whoever added the most contact details first (counted as in the report's Total), then A–Z.
export function standings(rows: PerformanceRow[]): Standing[] {
  const people = buildTree(rows).map((node) => ({
    email: node.person?.email ?? node.label,
    name: node.label,
    role: node.person?.role ?? null,
    phones: node.phones,
    emails: node.emails,
    total: node.total,
    jobs: node.jobs,
  }));
  return people.map((person) => ({ ...person, rank: 1 + people.filter((other) => other.total > person.total).length }));
}

// Every node's id (for "Expand all").
export const allIds = (nodes: PerfNode[]): string[] => nodes.flatMap((n) => [n.id, ...allIds(n.children)]);

// "2026-10-21 16:28" (IST), for the CSV.
export const istStamp = (value: string) => new Date(Date.parse(value) + 330 * 60_000).toISOString().slice(0, 16).replace('T', ' ');
export const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// One line per number or email added (the final grain), for a spreadsheet.
export function performanceCsv(rows: PerformanceRow[], courseName: (id: string) => string = (id) => id) {
  const header = ['Added (IST)', 'Person', 'Email', 'Role', 'Course', 'Company', 'Job', 'Filtered / Non-filtered', 'Detail', 'Value', 'Assigned to', 'Remark'];
  const lines = rows.map((r) =>
    [
      istStamp(r.at),
      r.actor.name ?? '',
      r.actor.email,
      r.actor.role ?? '',
      r.job.course ? courseName(r.job.course) : '',
      r.job.company ?? '',
      r.job.title ?? '',
      r.job.set === 'nonfiltered' ? 'Non-filtered' : 'Filtered',
      r.field === 'phone' ? 'Phone' : 'Email',
      r.value,
      followUpsOf(r).map((o) => o.student).filter(Boolean).join('; '),
      remarksText(r),
    ]
      .map(csvCell)
      .join(','),
  );
  return `﻿${[header.join(','), ...lines].join('\r\n')}`;
}
