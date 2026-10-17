// Shapes of the Express API responses (server/src/api/routes.js).

export type CourseId = 'data-analyst' | 'data-science' | 'data-engineering' | 'production-support';

export interface Course {
  id: CourseId;
  name: string;
}

export type CourseCounts = Partial<Record<CourseId, number>>;

export interface LastRun {
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'success' | 'partial' | 'failed';
  totals?: Record<string, number>;
  failedSearches: string[];
}

export interface Meta {
  courses: Course[];
  platforms: string[];
  cities: string[];
  scheduleLabel: string;
  filters: { experience: { min: number; max: number }; excludedCompanies: string[] };
  lastRun: LastRun | null;
  demo: boolean;
}

export interface Summary {
  days: number;
  anchor: string;
  current: CourseCounts;
  previous: CourseCounts;
}

export interface PlatformRow {
  platform: string;
  byCourse: CourseCounts;
  total: number;
}

export interface PlatformsResponse {
  days: number;
  anchor: string;
  multiPlatform: number; // jobs listed on two or more platforms (each counted once)
  platforms: PlatformRow[];
}

export type TrendPoint = { day: string } & Record<CourseId, number>;

export interface TrendsResponse {
  days: number;
  anchor: string;
  series: TrendPoint[];
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface InsightsResponse {
  days: number;
  anchor: string;
  total: number;
  companies: NamedCount[];
  cities: NamedCount[];
  experience: Record<string, number>;
  skills: Partial<Record<CourseId, NamedCount[]>>;
}

export type PostingAgeBucket = 'day' | '3days' | 'week' | 'month' | 'older' | 'unknown';

// GET /api/course/:id — everything about one course's new jobs in the period.
export interface CourseDetailResponse {
  course: Course;
  days: number;
  anchor: string;
  total: number;
  previous: number;
  platforms: { platform: string; counted: number; listed: number }[];
  multiPlatform: number;
  postingAge: Partial<Record<PostingAgeBucket, number>>;
  experience: Record<string, number>;
  salaryShown: number;
  remote: number;
  companies: NamedCount[];
  cities: NamedCount[];
  skills: NamedCount[];
  freshness: {
    lastRefreshed: string | null;
    firstFoundInView: string | null;
    lastFoundInView: string | null;
    oldestKept: string | null;
    storedTotal: number;
    retentionDays: number;
  };
}

// One skill the course doesn't teach yet (counts are of `named` postings, see server/src/skillGaps.js).
export interface SkillGap {
  skill: string;
  asking: number; // postings that name it
  gained: number; // postings where it is the only named skill not taught: teaching it covers them
  coveredAfter: number; // coveredNow + gained
}

// GET /api/skill-gaps?course=&days=
export interface SkillGapsResponse {
  course: Course;
  days: number;
  anchor: string;
  teaches: string[]; // the course's skills (server/src/config/courses.js)
  postings: number; // the course's new postings in the period (same as its tile)
  named: number; // of those, postings naming at least one tracked skill
  coveredNow: number; // named postings whose every named skill is taught
  skills: SkillGap[];
  trackedSkillCount: number;
  source: { platforms: string[]; firstSeenFrom: string | null; firstSeenTo: string | null; lastRefreshed: string | null };
}

export interface Job {
  _id: string;
  title: string;
  company?: string;
  course: CourseId;
  cities?: string[];
  isRemote?: boolean;
  experienceMin?: number | null;
  experienceMax?: number | null;
  experienceText?: string;
  experienceBand?: string;
  salaryText?: string;
  skills?: string[];
  postedAt?: string | null;
  firstSeenAt: string;
  primaryPlatform: string;
  platforms: string[];
  links: Record<string, string>;
  contact: JobContact;
  placement: JobPlacement;
}

// How far the team got with a job opening ('' = not started).
export type PlacementStatus = 'contacted' | 'cvs-sent' | 'interview' | 'placed' | 'closed';

export interface JobPlacement {
  status: PlacementStatus | '';
  students: string;
  placedCount: number; // only when placed
  placedAt: string | null; // the day it was first marked placed
}

// GET /api/placements: per course, jobs at each status now and students placed by month (IST).
export interface PlacementCounts {
  contacted: number;
  cvsSent: number;
  interview: number;
  closed: number;
  placedThisMonth: number;
  placedLastMonth: number;
  placedTotal: number;
}

export interface PlacementsResponse {
  thisMonth: string; // "2026-10"
  lastMonth: string;
  courses: (PlacementCounts & Course)[];
  total: PlacementCounts;
}

// GET /api/report: the last 7 days, to share.
export interface ReportResponse {
  from: string; // "2026-10-11" (IST days)
  to: string;
  total: number;
  comparable: boolean; // false: no full earlier week to compare with
  courses: (Course & { count: number; previous: number | null; skills: string[] })[];
  companies: NamedCount[];
  cities: NamedCount[];
  platforms: string[];
  experience: { min: number; max: number };
  brand: string;
  lastRefreshed: string | null;
}

// GET /api/partners: employers with several openings in the last 90 days.
export interface Partner {
  name: string;
  openings: number;
  courses: Partial<Record<CourseId, number>>;
  cities: string[];
  lastPosted: string;
  phones: string[];
  emails: string[];
  placed: number;
  inProgress: number;
}

export interface PartnersResponse {
  days: number;
  minOpenings: number;
  from: string | null;
  to: string;
  jobs: number;
  partners: Partner[];
  lastRefreshed: string | null;
}

// Where a phone or email shown for a job came from: typed in on the dashboard, or written in the
// job posting (found by the collector). null = none.
export type ContactSource = 'manual' | 'posting' | null;

export interface JobContact {
  phone: string;
  phoneSource: ContactSource;
  email: string;
  emailSource: ContactSource;
  remarks: string;
  updatedAt: string | null; // when the typed-in details were last saved
}

// What PUT /api/jobs/:id/follow-up accepts. Empty strings clear a field.
export interface FollowUpInput {
  phone: string;
  email: string;
  remarks: string;
  status: PlacementStatus | '';
  students: string;
  placedCount: number;
}

export interface JobsResponse {
  days: number;
  anchor: string;
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  items: Job[];
}

export interface ApiState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}
