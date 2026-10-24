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
  filters: { experience: { min: number; max: number | null }; excludedCompanies: string[] }; // max null: no upper limit
  lastRun: LastRun | null;
  aiEnabled?: boolean; // IJF AI is set up on the server
  dataDays: { first: string | null; last: string }; // the oldest and newest IST day with stored jobs
  demo: boolean;
}

export interface Summary {
  days: number;
  anchor: string;
  from: string; // the period's first and last IST day (both included)
  to: string;
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
  backfilledBefore: string | null; // days before this came from a one-off backfill (may be incomplete)
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

// Adding skills one after another (server/src/skillGaps.js skillPlan).
export interface SkillPlan {
  ladder: { skill: string; added: number; total: number }[]; // total: postings newly matched so far
  maxAdd: number; // jobs missing more untaught skills than this are out of reach
  jobs: PlanJob[]; // the jobs within reach, with the skills each one is missing
}

export interface PlanJob {
  id: string;
  title: string;
  company: string;
  cities: string[];
  platform: string;
  url: string;
  missing: string[];
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
  plan: SkillPlan;
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
  leftOutBy?: LeftOutReason; // Non-filtered jobs only: why our filters leave it out
}

// extra-search: passes the keep rules, but it came from the extra searches (server config/courses.js).
export type LeftOutReason = 'big-company' | 'experience' | 'no-experience' | 'extra-search';

// GET /api/partners: employers with several openings in the last 90 days.
export interface Partner {
  key: string; // which jobs are this company's (companies/jobs?key=)
  name: string;
  openings: number;
  courses: Partial<Record<CourseId, number>>;
  cities: string[];
  lastPosted: string;
  phones: string[];
  emails: string[];
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

// One company's openings (companies/jobs): every spelling of its name, newest first. days: only those
// found in the last N days (null: every stored job). total can be more than the items sent.
export interface CompanyJobsResponse {
  key: string;
  name: string;
  days: number | null;
  total: number;
  items: Job[];
}

// The search box (search?q=): companies whose name matches, and jobs with a matching HR name, email or
// phone number, kept and left-out alike. kind: 'phone' (digits were typed), 'text', or 'short' (too little).
export type SearchField = 'phone' | 'email' | 'hrName';

export interface SearchCompany {
  key: string;
  name: string;
  openings: number; // kept jobs
  leftOut: number; // jobs the keep rules leave out
  courses: Partial<Record<CourseId, number>>;
  lastPosted: string | null;
}

export interface SearchContact {
  job: Job;
  set: 'filtered' | 'nonfiltered';
  matches: { field: SearchField; value: string }[];
}

export interface SearchResponse {
  q: string;
  kind: 'short' | 'phone' | 'text';
  companies: SearchCompany[];
  moreCompanies: number;
  contacts: SearchContact[];
  moreContacts: boolean;
}

// Where a phone or email shown for a job came from: typed in on the dashboard, or written in the
// job posting (found by the collector). null = none.
export type ContactSource = 'manual' | 'posting' | null;

export interface JobContact {
  hrNames?: string[]; // the HR people's names (typed in; missing from a server older than this dashboard)
  hrProfiles?: string[]; // links to their profiles, e.g. LinkedIn (always http/https)
  phone: string;
  phoneSource: ContactSource;
  email: string;
  emailSource: ContactSource;
  remarks: string;
  assignedTo: string[]; // students this job is assigned to (typed in on the dashboard)
  updatedAt: string | null; // when the typed-in details were last saved
}

// What PUT /api/jobs/:id/follow-up accepts: one box per phone number and per email (up to
// MAX_CONTACT_ENTRIES each; empty boxes are ignored). Nothing entered clears a field.
export interface FollowUpInput {
  hrName: string[]; // one box per HR person
  hrProfile: string[]; // one box per profile link
  phone: string[];
  email: string[];
  remarks: string;
  assignedTo: string[]; // one box per student
}

export const MAX_CONTACT_ENTRIES = 10; // the server's MAX_ENTRIES (api/followUp.js): numbers, emails, HR names, profile links
export const MAX_STUDENTS = 20; // the server's MAX_STUDENTS

export interface JobsResponse {
  days: number;
  anchor: string;
  page: number;
  pageSize: number;
  total: number;
  withContact: number; // of `total`, jobs with an HR phone, email or note
  pages: number;
  items: Job[];
}

export interface ApiState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload?: () => void; // fetch again (Try again after an error); from useApi
}

// GET /api/activity: who changed which job's HR details, and what changed (server/src/activity.js).
export type ActivityAction = 'added' | 'edited' | 'removed';

export interface ActivityChange {
  // contactStudent / contactRemark: the performance report's follow-up of one number or email (contact)
  field: 'hrName' | 'hrProfile' | 'phone' | 'email' | 'assignedTo' | 'remarks' | 'contactStudent' | 'contactRemark';
  change: ActivityAction;
  before: string[]; // the values before (notes: one value)
  after: string[];
  added: string[]; // lists: values that are new...
  removed: string[]; // ...and values that are gone
  contact?: { field: 'phone' | 'email'; value: string }; // which number or email (contactStudent / contactRemark)
}

export interface ActivityEntry {
  _id: string;
  at: string;
  actor: { userId: string; email: string; name?: string; role?: string | null };
  action: ActivityAction;
  via?: 'ai'; // made with IJF AI (confirmed by the person)
  job: { id: string; set?: 'filtered' | 'nonfiltered'; title?: string; company?: string; course?: CourseId };
  changes: ActivityChange[];
}

export interface ActivityResponse {
  items: ActivityEntry[];
  next: string | null; // pass as ?before= for the next page
  total?: number; // first page only: records matching the filters
  people?: { email: string; name: string; count: number }[]; // first page only: everyone who made changes
}

// GET /api/performance: one row per HR phone number or email a person added (server routes.js).
export interface PerformanceRow {
  record: string; // the activity record it came from
  at: string;
  actor: { email: string; name?: string; role?: string | null };
  job: ActivityEntry['job'];
  field: 'phone' | 'email';
  value: string;
  key: string; // what the number/email is matched by (bare digits / lower case): rows of the same one share it
  outcome: ContactOutcome | null; // its follow-up, if any
}

// The follow-up of one number or email (PUT /api/outcomes): the student it was given to, and how it went.
export type RemarkStatus = 'dnp' | 'wrong' | 'not-person' | 'cv-shared' | 'no-openings' | 'other';
export interface ContactOutcome {
  student: string; // '' = not given to anyone yet
  status: RemarkStatus | '';
  note: string; // the words of an "Others" remark
  updatedAt: string | null;
  updatedBy: { email: string; name?: string } | null;
}

export interface PerformanceResponse {
  days: number;
  from: string; // IST days, both included
  to: string;
  since: string | null; // when the activity record began
  rows: PerformanceRow[]; // newest first
  truncated: boolean;
  students: string[]; // every student name used so far, to suggest
}

// ---------- IJF AI (/api/chat…) ----------

export type ChatPeriod = { days?: number; from?: string; to?: string };

// Cards shown beside an answer, with the real data (contacts included: they never go to the AI).
export interface ChatJobsCard {
  type: 'jobs';
  total: number;
  withHrDetails: number;
  period: ChatPeriod;
  view: 'filtered' | 'nonfiltered';
  items: { id: string; title: string; company: string; course: CourseId; cities: string[]; set: 'filtered' | 'nonfiltered' }[];
  links: { label: string; href: string; view: 'filtered' | 'nonfiltered' }[];
}
export interface ChatContactsCard {
  type: 'contacts';
  jobs: {
    id: string;
    title: string;
    company: string;
    course: CourseId;
    set: 'filtered' | 'nonfiltered';
    hrNames: string[];
    hrProfiles: string[];
    phones: string[];
    emails: string[];
    fromPost: { phone: boolean; email: boolean };
    students: string[];
  }[];
}
export interface ChatFollowUpsCard {
  type: 'followups';
  total: number;
  items: { jobId: string; job: string; company: string; course: CourseId; field: 'phone' | 'email'; contact: string; student: string; remark: string; addedBy: string; addedAt: string }[];
}
export type ChatCard = ChatJobsCard | ChatContactsCard | ChatFollowUpsCard;

// A change IJF AI proposed, done only when the person clicks Confirm.
export interface ChatAction {
  id?: string; // set once the answer is saved
  type: 'add-hr-details' | 'set-follow-up';
  summary: string;
  status: 'pending' | 'done' | 'failed' | 'cancelled';
  error?: string;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  at?: string;
  cards: ChatCard[];
  actions: ChatAction[];
  feedback?: 'up' | 'down' | '';
  error?: string;
  pending?: boolean; // still being answered
  status?: string; // what it is looking up now
  retry?: string; // the question, when it can be asked again (the answer was cut off)
}

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ChatReminder {
  id: string;
  text: string;
  href?: string;
  ask: string;
}

export interface ChatUsage {
  since: string;
  model: string;
  people: { email: string; questions: number; promptTokens: number; completionTokens: number; activeDays: number; up: number; down: number }[];
  briefings: { count: number; promptTokens: number; completionTokens: number };
}
