import type { CourseId, Job, PlacementStatus } from './types';

// Course colours follow the course everywhere (never re-assigned by rank or filter).
export const COURSE_COLORS: Record<CourseId, string> = {
  'data-analyst': 'var(--series-1)',
  'data-science': 'var(--series-2)',
  'data-engineering': 'var(--series-3)',
  'production-support': 'var(--series-4)',
};

export interface ExperienceRange {
  min: number;
  max: number;
}

// The experience groups within the range of jobs we keep (2–5 years by default): one per year.
// Ids match the server's experienceBand(): 'fresher' for 0, '1'…'5', '6+'.
export function experienceBands({ min, max }: ExperienceRange) {
  const bands = new Map<string, string>();
  for (let years = min; years <= max; years++) {
    const id = years <= 0 ? 'fresher' : years >= 6 ? '6+' : String(years);
    bands.set(id, years <= 0 ? 'Fresher' : years >= 6 ? '6+ yrs' : `${years} yrs`);
  }
  return [...bands].map(([id, label]) => ({ id, label }));
}

export interface Period {
  days: number;
  tab: string;
  title: string;
  previous: string;
}

export const PERIODS: Period[] = [
  { days: 1, tab: 'Latest day', title: 'New jobs found today', previous: 'previous day' },
  { days: 7, tab: 'Last 7 days', title: 'New jobs in the last 7 days', previous: 'previous 7 days' },
  { days: 30, tab: 'Last 30 days', title: 'New jobs in the last 30 days', previous: 'previous 30 days' },
];

// The period from the page address (?days=7), so it stays the same when moving between pages.
export const periodFrom = (days: string | null) => PERIODS.find((p) => String(p.days) === days) ?? PERIODS[0];

export const COURSE_IDS = Object.keys(COURSE_COLORS) as CourseId[];

// Placement statuses in the order a placement moves through.
export const PLACEMENT_STATUSES: { id: PlacementStatus; label: string }[] = [
  { id: 'contacted', label: 'Contacted' },
  { id: 'cvs-sent', label: 'CVs sent' },
  { id: 'interview', label: 'Interview' },
  { id: 'placed', label: 'Placed' },
  { id: 'closed', label: 'Closed (no hire)' },
];
export const statusLabel = (status: string) => PLACEMENT_STATUSES.find((s) => s.id === status)?.label ?? '';

// "2026-10" -> "October 2026"
export const formatMonth = (month: string) =>
  new Date(`${month}-15T12:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' });

export const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');

const numberFormat = new Intl.NumberFormat('en-IN');
export const formatNumber = (n: number | null | undefined) => numberFormat.format(n ?? 0);

const istDateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const istDay = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });

export const formatDateTime = (value?: string | null) => (value ? `${istDateTime.format(new Date(value))} IST` : '—');

// "2026-10-16" (an IST calendar day) -> "16 Oct"
export const formatDay = (day: string) => istDay.format(new Date(`${day}T12:00:00+05:30`));

const istDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
export const formatDate = (value?: string | null) => (value ? istDate.format(new Date(value)) : '—');

export function formatPosted(value?: string | null) {
  if (!value) return '—';
  const hours = (Date.now() - new Date(value).getTime()) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
  if (hours < 24) return `${Math.round(hours)} hr ago`;
  if (hours < 48) return 'yesterday';
  return istDay.format(new Date(value));
}

export function formatExperience(job: Job) {
  if (job.experienceMin == null) return job.experienceText || 'Not stated';
  if (job.experienceMax != null) return `${job.experienceMin}–${job.experienceMax} yrs`;
  return job.experienceMin === 0 ? 'Fresher' : `${job.experienceMin}+ yrs`;
}

export function changePercent(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export const sumCounts = (counts: Partial<Record<string, number>>) =>
  Object.values(counts).reduce<number>((total, n) => total + (n ?? 0), 0);
