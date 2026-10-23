import type { DataView } from './dataView';
import type { CourseId, Job, LeftOutReason } from './types';

// Course colours follow the course everywhere (never re-assigned by rank or filter).
export const COURSE_COLORS: Record<CourseId, string> = {
  'data-analyst': 'var(--series-1)',
  'data-science': 'var(--series-2)',
  'data-engineering': 'var(--series-3)',
  'production-support': 'var(--series-4)',
};

// The minimum experience of the jobs we keep: min years and up (max null = no upper limit).
export interface ExperienceRange {
  min: number;
  max: number | null;
}

// Every experience group there is (the Non-filtered jobs can ask for any experience, or not say).
const ALL_BANDS = [
  { id: 'fresher', label: 'Fresher' },
  { id: '1', label: '1 yr' },
  { id: '2', label: '2 yrs' },
  { id: '3', label: '3 yrs' },
  { id: '4', label: '4 yrs' },
  { id: '5', label: '5 yrs' },
  { id: '5+', label: '5+ yrs' },
  { id: 'unknown', label: 'Not stated' },
];

// The experience groups of the jobs shown: for the kept (Filtered) jobs one per year from the minimum
// (2 by default) up to 5, then "5+ yrs" for jobs asking more than 5 years; for the Non-filtered jobs all
// of them, Fresher and "Not stated" too. Each job is in exactly one group. Ids match the server's
// experienceBand(): 'fresher', '1'…'5', '5+', 'unknown'.
export function experienceBands({ min, max }: ExperienceRange, view: DataView = 'filtered') {
  if (view === 'nonfiltered') return ALL_BANDS;
  const bands: { id: string; label: string }[] = [];
  for (let years = min; years <= 5 && (max == null || years <= max); years++) {
    bands.push(years <= 0 ? { id: 'fresher', label: 'Fresher' } : { id: String(years), label: `${years} yrs` });
  }
  if (max == null || max > 5) bands.push({ id: '5+', label: '5+ yrs' });
  return bands;
}

// "2+" (no upper limit) or "2–5": the experience range in sentences.
export const experienceRangeText = ({ min, max }: ExperienceRange) => (max == null ? `${min}+` : `${min}–${max}`);

export interface Period {
  key: string; // '1', '7', '30', or 'custom'
  days: number; // how many days it covers
  tab: string; // its name on the period tabs
  label: string; // its short name elsewhere ("Last 7 days", "12–15 Oct")
  title: string; // under the big numbers
  previous: string; // what it is compared with ("vs previous 7 days")
  from?: string; // a custom period: its first and last IST day ("2026-10-12"), both included
  to?: string;
}

export const PERIODS: Period[] = [
  { key: '1', days: 1, tab: 'Latest day', label: 'Latest day', title: 'New jobs found today', previous: 'previous day' },
  { key: '7', days: 7, tab: 'Last 7 days', label: 'Last 7 days', title: 'New jobs in the last 7 days', previous: 'previous 7 days' },
  { key: '30', days: 30, tab: 'Last 30 days', label: 'Last 30 days', title: 'New jobs in the last 30 days', previous: 'previous 30 days' },
];

export const MAX_CUSTOM_DAYS = 366; // the server's MAX_RANGE_DAYS

// "2026-10-12": a real calendar day written that way (not "2026-02-31").
export const isDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

// Days from `from` to `to`, both included ("2026-10-12", "2026-10-15" -> 4).
export const dayCount = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

// "2026-10-12" moved by n days.
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// "15 Oct", "12–15 Oct", "28 Sep – 3 Oct", "28 Dec 2025 – 3 Jan 2026"
export function rangeLabel(from: string, to: string) {
  if (from === to) return formatDay(from);
  const [fy, fm] = from.split('-');
  const [ty, tm] = to.split('-');
  if (fy !== ty) return `${formatDate(`${from}T12:00:00+05:30`)} – ${formatDate(`${to}T12:00:00+05:30`)}`;
  if (fm !== tm) return `${formatDay(from)} – ${formatDay(to)}`;
  return `${Number(from.slice(8))}–${formatDay(to)}`;
}

// A period of the days chosen (in either order).
export function customPeriod(a: string, b: string): Period {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const days = dayCount(from, to);
  const label = rangeLabel(from, to);
  return {
    key: 'custom',
    days,
    from,
    to,
    tab: label,
    label,
    title: days === 1 ? `New jobs found on ${label}` : `New jobs found ${label}`,
    previous: days === 1 ? 'the day before' : `the ${days} days before`,
  };
}

// The period from the page address, so it stays the same when moving between pages: ?days=7, or
// ?from=2026-10-12&to=2026-10-15 for chosen dates. Anything else: the first of the presets.
export function periodFrom(params: { get(name: string): string | null }, presets: Period[] = PERIODS): Period {
  const from = params.get('from');
  const to = params.get('to') ?? from;
  if (isDay(from) && isDay(to)) return customPeriod(from, to);
  return presets.find((p) => String(p.days) === params.get('days')) ?? presets[0];
}

// The period for the API (?days= or ?from=&to=) and for page addresses.
export const periodParams = (p: Period) => (p.from ? { from: p.from, to: p.to } : { days: p.days });
export const periodQuery = (p: Period) => (p.from ? `from=${p.from}&to=${p.to}` : `days=${p.days}`);

// Why a Non-filtered job is left out, in words (server: leftOutReason in config/filters.js).
export const LEFT_OUT_LABELS: Record<LeftOutReason, string> = {
  'big-company': 'Large IT services firm',
  experience: 'Too little experience',
  'no-experience': 'Experience not stated',
  'extra-search': 'Extra search',
};

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
// For the activity record: the IST day a time falls on ("2026-10-21", to group by), its heading
// ("Today", "Yesterday", "Sun, 19 Oct") and the time of day ("4:28 pm").
const istWeekday = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
export const istDayOf = (value: string) => istDayKey.format(new Date(value));
export function dayHeading(day: string) {
  if (day === istDayKey.format(new Date())) return 'Today';
  if (day === istDayKey.format(new Date(Date.now() - 86_400_000))) return 'Yesterday';
  return istWeekday.format(new Date(`${day}T12:00:00+05:30`));
}
export const formatTime = (value: string) => istTime.format(new Date(value)).toLowerCase();

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

// Every platform the job is listed on (with a link), the one it is counted under first.
export const listingOrder = (job: Job) =>
  [job.primaryPlatform, ...job.platforms.filter((p) => p !== job.primaryPlatform)].filter((p) => job.links[p]);

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
