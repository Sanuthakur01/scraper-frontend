// The performance report (components/PerformanceReport.tsx): the HR phone numbers and emails people
// added (GET /api/performance, one row each), grouped person → course → company → job, each level
// with its own counts. The rows under a job are the final grain: each number and email, and when.
import type { Period } from './format';
import type { ContactOutcome, CourseId, CvSharedEvent, PerformanceRow, RemarkEntry, RemarkStatus } from './types';

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

// ---------- Points ----------

// What each activity scores (the rule chosen on 26 Nov 2026; the server's src/points.js says the same): finding a
// phone number, finding an email, and a CV shared on a contact the person found (to the finder, not the caller;
// counted on the day the CV was shared, once per student's call). The report and the daily leaderboard rank by
// points, not by how many contacts someone found.
export const POINTS = { phone: 1.5, email: 1, cvShared: 5 } as const;
export const pointsOf = (c: { phones: number; emails: number; cvShared: number }) => c.phones * POINTS.phone + c.emails * POINTS.email + c.cvShared * POINTS.cvShared;
const pointsFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
// "12", "12.5"
export const formatPoints = (n: number) => pointsFormat.format(n);

// The CVs shared that are someone's points: on contacts the team found (not the job post's, copied or earlier ones).
export type TeamCvShared = CvSharedEvent & { finder: NonNullable<CvSharedEvent['finder']> };
export const teamCvShared = (events: CvSharedEvent[] | undefined): TeamCvShared[] => (events ?? []).filter((e): e is TeamCvShared => Boolean(e.finder));
// Of some CVs shared, the ones on one number or email (its rows share them).
export const cvSharedOn = (events: TeamCvShared[], row: Pick<PerformanceRow, 'job' | 'field' | 'key'>) =>
  events.filter((e) => String(e.job.id) === String(row.job.id) && e.field === row.field && e.key === row.key);

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
// CVs shared on a number: its students whose call ended in "CV shared".
export const cvSharedOf = (row: Pick<PerformanceRow, 'outcomes'>) => followUpsOf(row).filter((o) => o.status === 'cv-shared').length;

// A call's remarks, oldest first: the list the server keeps, or from a server older than 23 Nov 2026 (or a record
// saved before then that nothing changed since), its one remark.
export const remarkHistory = (o: Pick<ContactOutcome, 'status' | 'note' | 'history' | 'updatedAt' | 'updatedBy'>): RemarkEntry[] =>
  o.history?.length ? o.history : o.status ? [{ status: o.status, note: o.note, at: o.updatedAt, by: o.updatedBy }] : [];

// One change to a number's follow-ups: give it to a student, take it back, or a remark on a student's call, added
// to the ones before (student '': the number's own remark while no student has it; status '': clear them all).
export type FollowUpOp = { add: string } | { remove: string } | { student: string; status: RemarkStatus | ''; note?: string };

// What PUT /outcomes takes for it.
export function followUpBody(op: FollowUpOp) {
  if ('add' in op) return { student: op.add, add: true };
  if ('remove' in op) return { student: op.remove, remove: true };
  return { student: op.student, status: op.status, note: op.status === 'other' ? (op.note ?? '') : '' };
}

// The follow-ups after a change, as the server makes them (shown at once, before it answers): a student given it
// twice (in any case) has it once; the first student given it takes over a remark made before anyone was; a
// remark for a student who doesn't have it gives it to them, and is added after their earlier ones (when and by
// whom: not known until the server answers); taken back, their remarks go too.
export function applyFollowUp(outcomes: ContactOutcome[], op: FollowUpOp): ContactOutcome[] {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if ('remove' in op) return outcomes.filter((o) => !(o.student && same(o.student, op.remove)));
  const student = 'add' in op ? op.add : op.student;
  const remark = 'add' in op ? null : { status: op.status, note: op.status === 'other' ? (op.note ?? '') : '' };
  const withRemark = (o: ContactOutcome): ContactOutcome =>
    !remark
      ? o
      : remark.status
        ? { ...o, status: remark.status, note: remark.note, history: [...remarkHistory(o), { status: remark.status, note: remark.note, at: null, by: null }] }
        : { ...o, status: '', note: '', history: [] };
  const named = outcomes.filter((o) => o.student);
  const loose = outcomes.find((o) => !o.student);
  const mine = student ? named.find((o) => same(o.student, student)) : loose;
  const blank = (name: string): ContactOutcome => ({ student: name, status: '', note: '', history: [], updatedAt: null, updatedBy: null });
  if (mine) {
    if (!remark) return outcomes;
    if (!student && !remark.status) return outcomes.filter((o) => o !== mine); // the number's own remarks, cleared
    return outcomes.map((o) => (o === mine ? withRemark(o) : o));
  }
  if (!student) return remark?.status ? [...outcomes, withRemark(blank(''))] : outcomes;
  if (!named.length && loose) return outcomes.map((o) => (o === loose ? withRemark({ ...o, student }) : o));
  return [...outcomes, withRemark(blank(student))];
}

// The numbers and emails of some rows, for the clipboard: each once (however it was written: "+91 98100 00001"
// and "98100 00001" are one number), in the rows' order, separated by commas. A row given a company is copied
// as "number ---> company"; a row without one is the number alone.
export function contactsText(rows: (Pick<PerformanceRow, 'field' | 'key' | 'value'> & { company?: string })[]) {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const row of rows) {
    const id = `${row.field}|${row.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const company = row.company?.trim();
    values.push(company ? `${row.value.trim()} ---> ${company}` : row.value.trim());
  }
  return { text: values.join(', '), count: values.length, repeats: rows.length - values.length };
}

// A remark in words: "DNP", "Wrong email" (for an email), "Others: call after 5 pm".
export const remarkWords = (r: Pick<RemarkEntry, 'status' | 'note'>, field: 'phone' | 'email') =>
  r.status === 'other' ? `Others: ${r.note}` : remarkName(r.status, field);

// "Kavya Rao: DNP → CV shared; Aman Gupta: Busy" (each call's remarks, oldest first; one follow-up: just its
// remarks), for lists and spreadsheets.
export const remarksText = (row: Pick<PerformanceRow, 'field' | 'outcomes'>) => {
  const all = followUpsOf(row);
  return all
    .filter((o) => o.status)
    .map((o) => {
      const remarks = remarkHistory(o)
        .map((r) => remarkWords(r, row.field))
        .join(' → ');
      return all.length > 1 && o.student ? `${o.student}: ${remarks}` : remarks;
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
  cvShared: number; // the CVs shared in the period on contacts under it (teamCvShared), each student's call once
  points: number; // POINTS: 1.5 a phone number + 1 an email + 5 a CV shared
  sources: { source: string; count: number }[]; // where they were found (Found by), most first
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
  events: TeamCvShared[]; // the CVs shared in the period under it (some on numbers added before it), newest first
}

export function countsOf(rows: PerformanceRow[], cvShared: TeamCvShared[] = []): Counts {
  const phones = rows.filter((r) => r.field === 'phone').length;
  const emails = rows.length - phones;
  return {
    phones,
    emails,
    total: rows.length,
    jobs: new Set(rows.map((r) => String(r.job.id))).size,
    assigned: rows.filter(hasStudent).length,
    remarked: rows.filter((r) => followUpsOf(r).some((o) => o.status)).length,
    cvShared: cvShared.length,
    points: pointsOf({ phones, emails, cvShared: cvShared.length }),
    sources: sourcesOf(rows),
  };
}

// Where numbers and emails were found (Found by), most first, then A–Z. Those added before Found by was asked
// for (none recorded) aren't listed.
export function sourcesOf(rows: Pick<PerformanceRow, 'foundBy'>[]) {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.foundBy) counts.set(r.foundBy, (counts.get(r.foundBy) ?? 0) + 1);
  return [...counts].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

// What the tree is built from: a number or email added (a row), or a CV shared on one the person found (an event,
// under its finder). Each knows its person and its job.
type Item = { row: PerformanceRow; event?: undefined } | { event: TeamCvShared; row?: undefined };
const actorOf = (item: Item) => (item.row ? item.row.actor : item.event.finder);
const jobOf = (item: Item) => (item.row ? item.row.job : item.event.job);

// What an item is grouped by at each level. Companies ignore letter case and spaces around the name.
function keyOf(item: Item, level: Level) {
  if (level === 'person') return actorOf(item).email.toLowerCase();
  const job = jobOf(item);
  if (level === 'course') return job.course ?? '';
  if (level === 'company') return (job.company ?? '').trim().toLowerCase();
  return String(job.id);
}

function labelOf(items: Item[], level: Level, courseName: (id: string) => string) {
  const first = items[0];
  if (level === 'person') return items.map(actorOf).find((a) => a.name?.trim())?.name?.trim() || actorOf(first).email; // their newest name
  const job = jobOf(first);
  if (level === 'course') return job.course ? courseName(job.course) : 'Course not known';
  if (level === 'company') return job.company?.trim() || 'Company not shown';
  return job.title || 'A job';
}

// The tree, most points first at every level (then most contact details, then by name). cvShared: the period's CVs
// shared (teamCvShared), each under whoever found the number, on its job: a job none of whose numbers were added in
// the period is still there, with the CV shared alone.
export function buildTree(rows: PerformanceRow[], courseName: (id: string) => string = (id) => id, cvShared: TeamCvShared[] = []): PerfNode[] {
  const group = (list: Item[], depth: number, parent: string): PerfNode[] => {
    const level = LEVELS[depth];
    const groups = new Map<string, Item[]>();
    for (const item of list) {
      const key = keyOf(item, level);
      const itemsOf = groups.get(key);
      if (itemsOf) itemsOf.push(item);
      else groups.set(key, [item]);
    }
    const nodes = [...groups].map(([key, items]): PerfNode => {
      const id = `${parent}${parent ? '/' : ''}${level === 'company' ? 'o' : level[0]}:${key}`;
      const rowsOf = items.flatMap((item) => (item.row ? [item.row] : []));
      const eventsOf = items.flatMap((item) => (item.event ? [item.event] : []));
      const actor = actorOf(items[0]);
      const label = labelOf(items, level, courseName);
      return {
        id,
        level,
        depth,
        label,
        ...countsOf(rowsOf, eventsOf),
        ...(level === 'person' ? { person: { email: actor.email.toLowerCase(), name: label, role: actor.role ?? null } } : {}),
        ...(level === 'course' ? { course: jobOf(items[0]).course } : {}),
        ...(level === 'job' ? { job: jobOf(items[0]) } : {}),
        children: depth < LEVELS.length - 1 ? group(items, depth + 1, id) : [],
        rows: rowsOf,
        events: eventsOf,
      };
    });
    return nodes.sort((a, b) => b.points - a.points || b.total - a.total || a.label.localeCompare(b.label));
  };
  return group([...rows.map((row): Item => ({ row })), ...cvShared.map((event): Item => ({ event }))], 0, '');
}

// "Riya Sharma" -> "RS"; "riya@ijf.in" -> "R"
export const initials = (name: string, email: string) =>
  (name.trim() && name !== email ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]) : [email[0] ?? '?']).join('').toUpperCase();

// One person's place on the daily leaderboard: their points (POINTS), from the contact details (phone numbers +
// emails) they added and the CVs shared on contacts they found.
export interface Standing {
  email: string;
  name: string;
  role: string | null;
  phones: number;
  emails: number;
  total: number; // phones + emails
  cvShared: number;
  points: number;
  jobs: number;
  rank: number; // 1 = the most points; the same points share a place (1, 2, 2, 4)
}

// The leaderboard: the most points first (then the most contact details, then A–Z). cvShared: the day's CVs shared
// (teamCvShared); someone with one and nothing added is on the board with its points.
export function standings(rows: PerformanceRow[], cvShared: TeamCvShared[] = []): Standing[] {
  const people = buildTree(rows, undefined, cvShared).map((node) => ({
    email: node.person?.email ?? node.label,
    name: node.label,
    role: node.person?.role ?? null,
    phones: node.phones,
    emails: node.emails,
    total: node.total,
    cvShared: node.cvShared,
    points: node.points,
    jobs: node.jobs,
  }));
  return people.map((person) => ({ ...person, rank: 1 + people.filter((other) => other.points > person.points).length }));
}

// Every node's id (for "Expand all").
export const allIds = (nodes: PerfNode[]): string[] => nodes.flatMap((n) => [n.id, ...allIds(n.children)]);

// "2026-10-21 16:28" (IST), for the CSV.
export const istStamp = (value: string) => new Date(Date.parse(value) + 330 * 60_000).toISOString().slice(0, 16).replace('T', ' ');
export const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// One line per number or email added, and one per CV shared on a contact the person found (the final grain), each
// with its points; the newest first. For a spreadsheet: the Points column adds up to the report's.
export function performanceCsv(rows: PerformanceRow[], courseName: (id: string) => string = (id) => id, cvShared: TeamCvShared[] = []) {
  const header = ['When (IST)', 'Person', 'Email', 'Role', 'Course', 'Company', 'Job', 'Filtered / Non-filtered', 'Detail', 'Value', 'Found by', 'Assigned to', 'Remark', 'Points'];
  const jobCells = (job: PerformanceRow['job']) => [job.course ? courseName(job.course) : '', job.company ?? '', job.title ?? '', job.set === 'nonfiltered' ? 'Non-filtered' : 'Filtered'];
  const lines = [
    ...rows.map((r) => ({
      at: r.at,
      cells: [
        istStamp(r.at),
        r.actor.name ?? '',
        r.actor.email,
        r.actor.role ?? '',
        ...jobCells(r.job),
        r.field === 'phone' ? 'Phone' : 'Email',
        r.value,
        r.foundBy ?? '',
        followUpsOf(r).map((o) => o.student).filter(Boolean).join('; '),
        remarksText(r),
        POINTS[r.field],
      ],
    })),
    ...cvShared.map((e) => ({
      at: e.at,
      cells: [istStamp(e.at), e.finder.name ?? '', e.finder.email, e.finder.role ?? '', ...jobCells(e.job), 'CV shared', e.value, '', e.student, 'CV shared', POINTS.cvShared],
    })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map((line) => line.cells.map(csvCell).join(','));
  return `﻿${[header.join(','), ...lines].join('\r\n')}`;
}
