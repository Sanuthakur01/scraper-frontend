// The Review board's numbers (components/ReviewBoard.tsx), from GET /review's rows: each HR number or email
// with each student it was given to (or whose call got feedback) in the period, and the numbers the team added in
// it that no student has yet. A number can go to several students: its calls are counted one by one, the numbers
// themselves once. How good the contacts are is read from the
// feedback: "reached" = the call got through to the right person (CV shared, No openings); "wrong" = a wrong
// number or email, or not the correct person; "not reached" = DNP, Busy or Switched off (call again); Others = in
// the caller's own words.

// Only types are imported, so the tests can run this file as it is (lib/review.test.mjs).
import type { RemarkStatus, ReviewRow } from './types';

// The remarks in the order the report lists them (performance.ts REMARKS): it breaks ties.
export const REMARK_IDS: RemarkStatus[] = ['dnp', 'busy', 'switched-off', 'wrong', 'not-person', 'cv-shared', 'no-openings', 'other'];
const istDay = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);

const REACHED: RemarkStatus[] = ['cv-shared', 'no-openings'];
const WRONG: RemarkStatus[] = ['wrong', 'not-person'];
const NOT_REACHED: RemarkStatus[] = ['dnp', 'busy', 'switched-off'];

export interface ReviewStats {
  given: number; // given to a student in the period (a number given to two students: twice)
  givenNumbers: number; // the numbers and emails those were (each once)
  feedback: number; // with feedback recorded in the period
  byRemark: Record<RemarkStatus, number>; // that feedback, per remark
  cvShared: number;
  reached: number; // CV shared + No openings
  wrong: number; // wrong number or email + not the correct person
  notReached: number; // DNP + Busy + Switched off
  other: number;
  // Of the calls that got through (reached + wrong), the share that reached the right person; null: none got through.
  accuracy: number | null;
  awaiting: number; // given in the period, and no feedback on it yet (its follow-up now)
  added: number; // numbers and emails added to jobs by the team in the period (each once)
  notGiven: number; // of those, not given to any student (now): still to give out
}

export function statsOf(rows: ReviewRow[]): ReviewStats {
  const byRemark = Object.fromEntries(REMARK_IDS.map((id) => [id, 0])) as Record<RemarkStatus, number>;
  let given = 0;
  let feedback = 0;
  let awaiting = 0;
  const givenNumbers = new Set<string>();
  const added = new Set<string>();
  const notGiven = new Set<string>();
  for (const row of rows) {
    if (row.added) {
      added.add(row.contact);
      if (isNotGiven(row)) notGiven.add(row.contact);
    }
    if (row.given?.inPeriod) {
      given++;
      givenNumbers.add(row.contact);
      if (!row.now?.status) awaiting++;
    }
    if (row.feedback) {
      feedback++;
      byRemark[row.feedback.status] = (byRemark[row.feedback.status] ?? 0) + 1;
    }
  }
  const sum = (ids: RemarkStatus[]) => ids.reduce((n, id) => n + byRemark[id], 0);
  const reached = sum(REACHED);
  const wrong = sum(WRONG);
  return {
    given,
    givenNumbers: givenNumbers.size,
    feedback,
    byRemark,
    cvShared: byRemark['cv-shared'],
    reached,
    wrong,
    notReached: sum(NOT_REACHED),
    other: byRemark.other,
    accuracy: reached + wrong ? reached / (reached + wrong) : null,
    awaiting,
    added: added.size,
    notGiven: notGiven.size,
  };
}

// Added by the team in the period and not given to any student (now).
export const isNotGiven = (row: ReviewRow) => Boolean(row.added) && !row.student && !row.withStudents;
// Given out or called: what the per-student, per-person and per-course tables count (a number only added
// has no call to count; the "Not given out yet" tile has those).
const handledOut = (row: ReviewRow) => Boolean(row.given || row.feedback);

export interface ReviewSummary extends ReviewStats {
  students: number; // given numbers in the period
  givers: number; // people who gave numbers out in the period
  waitingOverDay: number; // of awaiting: given out more than 24 hours ago
  medianHours: number | null; // from given out to feedback
  mostCommon: { status: RemarkStatus; count: number } | null; // the feedback recorded most often (ties: list order)
}

export function summaryOf(rows: ReviewRow[], now = Date.now()): ReviewSummary {
  const stats = statsOf(rows);
  const given = rows.filter((row) => row.given?.inPeriod);
  const hours = rows
    .map((row) => row.feedback?.hours)
    .filter((h): h is number => h != null)
    .sort((a, b) => a - b);
  const middle = Math.floor(hours.length / 2);
  const top = REMARK_IDS.reduce<{ status: RemarkStatus; count: number } | null>(
    (best, id) => (stats.byRemark[id] > (best?.count ?? 0) ? { status: id, count: stats.byRemark[id] } : best),
    null,
  );
  return {
    ...stats,
    students: new Set(given.map((row) => row.given!.student.toLowerCase())).size,
    givers: new Set(given.map((row) => row.given!.by.email)).size,
    waitingOverDay: given.filter((row) => !row.now?.status && now - Date.parse(row.given!.at) > 86_400_000).length,
    medianHours: hours.length ? (hours.length % 2 ? hours[middle] : (hours[middle - 1] + hours[middle]) / 2) : null,
    mostCommon: top,
  };
}

// ---------- Groups (per student, per person who found the numbers, per course…) ----------

export interface ReviewGroup extends ReviewStats {
  key: string;
  label: string;
  email?: string; // a person's (for their photo)
}
type GroupOf = (row: ReviewRow) => { key: string; label: string; email?: string } | null;

// Rows grouped by `groupOf` (null: left out), each group's numbers, the busiest first (then A–Z).
export function groupRows(rows: ReviewRow[], groupOf: GroupOf): ReviewGroup[] {
  const groups = new Map<string, { key: string; label: string; email?: string; rows: ReviewRow[] }>();
  for (const row of rows) {
    const g = groupOf(row);
    if (!g) continue;
    const group = groups.get(g.key) ?? { ...g, rows: [] };
    group.rows.push(row);
    groups.set(g.key, group);
  }
  return [...groups.values()]
    .map(({ rows: groupRows, ...g }) => ({ ...g, ...statsOf(groupRows) }))
    .sort((a, b) => b.given + b.feedback - (a.given + a.feedback) || a.label.localeCompare(b.label));
}

const personLabel = (p: { email: string; name: string }) => p.name.trim() || p.email;

// The student whose call the row is ('' : none).
export const studentOf = (row: ReviewRow) => row.student;
export const byStudent: GroupOf = (row) => {
  const student = studentOf(row);
  return student ? { key: student.toLowerCase(), label: student } : null;
};

export const FOUND_POST = 'post';
export const FOUND_EARLIER = 'earlier';
// Who found a number: the person who added it, the job post, or before the record began.
export const finderOf = (row: ReviewRow) =>
  row.found.source === 'team' && row.found.by
    ? { key: row.found.by.email, label: personLabel(row.found.by), email: row.found.by.email }
    : row.found.source === 'post'
      ? { key: FOUND_POST, label: 'Found in the job post' }
      : { key: FOUND_EARLIER, label: 'Added before the record began' };
export const byFinder: GroupOf = (row) => (handledOut(row) ? finderOf(row) : null);

// Only the numbers given out in the period: who gave them.
export const byGiver: GroupOf = (row) => (row.given?.inPeriod ? { key: row.given.by.email, label: personLabel(row.given.by), email: row.given.by.email } : null);

export const byCourse: GroupOf = (row) => (row.job.course && handledOut(row) ? { key: row.job.course, label: row.job.course } : null);

// ---------- "Others" in the callers' words ----------

// The words typed with "Others", the same words counted together however they were written ("MAIL SENT",
// "mail sent."), the most common first: they show what the fixed remarks miss (e.g. "out of service" is a
// wrong number).
export function commonNotes(rows: ReviewRow[], limit = 8): { text: string; count: number }[] {
  const notes = new Map<string, { text: string; count: number }>();
  for (const row of rows) {
    const note = row.feedback?.status === 'other' ? row.feedback.note.trim() : '';
    const key = note.toLowerCase().replace(/[^\p{L}\p{N}+]+/gu, ' ').trim();
    if (!key) continue;
    const text = note.toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase());
    const entry = notes.get(key) ?? { text, count: 0 };
    entry.count++;
    notes.set(key, entry);
  }
  return [...notes.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text)).slice(0, limit);
}

// ---------- Day by day ----------

export interface ReviewDay {
  day: string; // IST, 2026-10-27
  given: number;
  feedback: number;
  cvShared: number;
  wrong: number;
}

// Each IST day of the period (from–to, both included), with what happened on it.
export function perDay(rows: ReviewRow[], from: string, to: string): ReviewDay[] {
  const days: ReviewDay[] = [];
  for (let t = Date.parse(`${from}T12:00:00+05:30`); t <= Date.parse(`${to}T12:00:00+05:30`); t += 86_400_000) {
    days.push({ day: istDay(new Date(t).toISOString()), given: 0, feedback: 0, cvShared: 0, wrong: 0 });
  }
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const row of rows) {
    const given = row.given?.inPeriod ? byDay.get(istDay(row.given.at)) : undefined;
    if (given) given.given++;
    const fed = row.feedback ? byDay.get(istDay(row.feedback.at)) : undefined;
    if (fed && row.feedback) {
      fed.feedback++;
      if (row.feedback.status === 'cv-shared') fed.cvShared++;
      if (WRONG.includes(row.feedback.status)) fed.wrong++;
    }
  }
  return days;
}

// ---------- Call again today ----------

// The calls to try again today (the Assign numbers page): those whose last remark yesterday (an IST day) was DNP,
// Busy or Switched off, with the same remark on them now and nothing recorded on the number since by anyone
// (tried again today, or reached by another student: not listed). Nothing from before yesterday. rows: GET
// /review for yesterday and today. The latest call first.
export function retryCalls(rows: ReviewRow[], yesterday: string): ReviewRow[] {
  const triedToday = new Set(rows.filter((row) => row.feedback && istDay(row.feedback.at) > yesterday).map((row) => row.contact));
  return rows
    .filter(
      (row) =>
        row.feedback &&
        istDay(row.feedback.at) === yesterday &&
        NOT_REACHED.includes(row.feedback.status) &&
        row.now?.status === row.feedback.status &&
        !triedToday.has(row.contact),
    )
    .sort((a, b) => Date.parse(b.feedback!.at) - Date.parse(a.feedback!.at));
}

// ---------- The list's filters ----------

export type RemarkFilter = '' | 'given' | 'not-given' | 'feedback' | 'awaiting' | 'reached' | 'wrong-any' | RemarkStatus;
export interface ReviewFilters {
  remark: RemarkFilter;
  student: string; // a student's key (lower case), or '' for all
  course: string;
  finder: string; // byFinder's key
  giver: string; // the email of who gave it out
  q: string;
}
export const NO_REVIEW_FILTERS: ReviewFilters = { remark: '', student: '', course: '', finder: '', giver: '', q: '' };

const GROUP_FILTERS: Record<string, (row: ReviewRow) => boolean> = {
  given: (row) => Boolean(row.given?.inPeriod),
  'not-given': isNotGiven,
  feedback: (row) => Boolean(row.feedback),
  awaiting: (row) => Boolean(row.given?.inPeriod && !row.now?.status),
  reached: (row) => Boolean(row.feedback && REACHED.includes(row.feedback.status)),
  'wrong-any': (row) => Boolean(row.feedback && WRONG.includes(row.feedback.status)),
};

export function matchesReview(row: ReviewRow, f: ReviewFilters) {
  if (f.remark && !(GROUP_FILTERS[f.remark] ?? ((r: ReviewRow) => r.feedback?.status === f.remark))(row)) return false;
  if (f.student && studentOf(row).toLowerCase() !== f.student) return false;
  if (f.course && row.job.course !== f.course) return false;
  if (f.finder && finderOf(row).key !== f.finder) return false;
  if (f.giver && !(row.given?.inPeriod && row.given.by.email === f.giver)) return false;
  const q = f.q.trim().toLowerCase();
  if (q) {
    const text = [row.value, row.job.company, row.job.title, studentOf(row), row.feedback?.note, row.given?.by.name, row.found.by?.name, row.found.by?.email]
      .join(' ')
      .toLowerCase();
    if (!text.includes(q)) return false;
  }
  return true;
}
