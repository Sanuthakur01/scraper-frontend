import type { CourseId, Job } from './types';

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

// "Data Analyst" -> "DA": the course badge.
export const courseInitials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

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

const istTime = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
const istDayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }); // 2026-10-19

// "today, 4:28 pm" / "yesterday, 9:05 am" / "17 Oct, 12:48 pm" (IST).
export function formatUpdated(value?: string | null) {
  if (!value) return 'not yet';
  const date = new Date(value);
  const day = istDayKey.format(date);
  const today = istDayKey.format(new Date());
  const yesterday = istDayKey.format(new Date(Date.now() - 86_400_000));
  const time = istTime.format(date).toLowerCase();
  if (day === today) return `today, ${time}`;
  if (day === yesterday) return `yesterday, ${time}`;
  return `${istDay.format(date)}, ${time}`;
}

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
