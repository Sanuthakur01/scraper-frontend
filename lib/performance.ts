// The performance report (components/PerformanceReport.tsx): the HR phone numbers and emails people
// added (GET /api/performance, one row each), grouped person → course → company → job, each level
// with its own counts. The rows under a job are the final grain: each number and email, and when.
import type { Period } from './format';
import type { CourseId, PerformanceRow } from './types';

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
  return { phones, emails: rows.length - phones, total: rows.length, jobs: new Set(rows.map((r) => String(r.job.id))).size };
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

// Every node's id (for "Expand all").
export const allIds = (nodes: PerfNode[]): string[] => nodes.flatMap((n) => [n.id, ...allIds(n.children)]);

// "2026-10-21 16:28" (IST), for the CSV.
const istStamp = (value: string) => new Date(Date.parse(value) + 330 * 60_000).toISOString().slice(0, 16).replace('T', ' ');
const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// One line per number or email added (the final grain), for a spreadsheet.
export function performanceCsv(rows: PerformanceRow[], courseName: (id: string) => string = (id) => id) {
  const header = ['Added (IST)', 'Person', 'Email', 'Role', 'Course', 'Company', 'Job', 'Filtered / Non-filtered', 'Detail', 'Value'];
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
    ]
      .map(csvCell)
      .join(','),
  );
  return `﻿${[header.join(','), ...lines].join('\r\n')}`;
}
