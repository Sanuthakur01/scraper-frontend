// Adding a job the scraper missed (components/AddJobForm.tsx, POST /api/added-jobs): the company, job title, link to
// the opening and course, and optionally where, what experience and the HR contact. The server checks everything
// again; the checks here follow its rules, so a mistake shows next to the right box straight away. The HR boxes are
// checked by ContactForm's validateDraft, as in a job's window.

// Only types are imported, so the tests can run this file as it is (lib/addedJob.test.mjs).
import type { AddedBy, AddedJobInput, CourseId, FollowUpInput } from './types';

// "linkedin.com/in/riya" -> "https://linkedin.com/in/riya". A web address (http or https, with a domain, no user
// name or password in it), or null: never another kind of link (the server's profileUrl). HR profile links
// (ContactForm) and job links use it.
export function webUrl(text: string): string | null {
  const value = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

// The server's limits (characters).
export const ADDED_JOB_LIMITS = { company: 120, title: 200, url: 1000, location: 120, experience: 60 };

// The boxes of the form, in its order (the first one with a problem gets the cursor).
export type AddedJobField = 'company' | 'title' | 'url' | 'course' | 'location' | 'experience';
export const ADDED_JOB_FIELDS: AddedJobField[] = ['company', 'title', 'url', 'course', 'location', 'experience'];
export type AddedJobErrors = Partial<Record<AddedJobField, string>>;

export interface AddedJobDraft {
  company: string;
  title: string;
  url: string;
  course: CourseId | '';
  location: string;
  experience: string;
}

export const blankAddedJob = (course: CourseId | '' = ''): AddedJobDraft => ({ company: '', title: '', url: '', course, location: '', experience: '' });

// The HR contact boxes of the form: one empty box each (no students or notes here).
export const blankContact = (): FollowUpInput => ({ hrName: [''], hrProfile: [''], phone: [''], email: [''], foundBy: '', assignedTo: [], remarks: '' });

const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const formatLimit = (n: number) => n.toLocaleString('en-IN');

// A job link as it will be stored (the server's jobLink): "https://" added when it has no scheme, no "#…" part
// unless that names a page of the site ("#/job/101", "#!/jobs/7"). null: not a web link.
export function jobLink(text: string): string | null {
  const value = text.trim();
  if (!value || value.length > ADDED_JOB_LIMITS.url) return null;
  const href = webUrl(value);
  if (!href) return null;
  const url = new URL(href);
  if (!/^#!?\//.test(url.hash)) url.hash = '';
  return url.href;
}

// "https://www.naukri.com/job-listings-…" -> "naukri.com": where a link goes, in short.
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

// Checks the job's boxes the way the server will. Returns the first problem of each box (none: {}). courseIds: the
// courses there are (meta).
export function validateAddedJob(draft: AddedJobDraft, courseIds: readonly string[]): AddedJobErrors {
  const errors: AddedJobErrors = {};
  const company = clean(draft.company);
  if (!company) errors.company = 'Enter the company name.';
  else if (company.length > ADDED_JOB_LIMITS.company) errors.company = `Too long for a company name (at most ${ADDED_JOB_LIMITS.company} characters).`;
  else if (!/[\p{L}\p{N}]/u.test(company)) errors.company = `"${company}" is not a company name.`;

  const title = clean(draft.title);
  if (!title) errors.title = 'Enter the job title.';
  else if (title.length > ADDED_JOB_LIMITS.title) errors.title = `Too long for a job title (at most ${ADDED_JOB_LIMITS.title} characters).`;

  const url = draft.url.trim();
  if (!url) errors.url = 'Paste the link to the job opening.';
  else if (url.length > ADDED_JOB_LIMITS.url) errors.url = `The link is too long (at most ${formatLimit(ADDED_JOB_LIMITS.url)} characters).`;
  else if (!jobLink(url)) errors.url = 'Not a web link. Enter it like https://company.com/careers/1234.';

  if (!draft.course || !courseIds.includes(draft.course)) errors.course = 'Choose the course this job is for.';
  if (clean(draft.location).length > ADDED_JOB_LIMITS.location) errors.location = `Too long (at most ${ADDED_JOB_LIMITS.location} characters).`;
  if (clean(draft.experience).length > ADDED_JOB_LIMITS.experience) errors.experience = `Too long (at most ${ADDED_JOB_LIMITS.experience} characters).`;
  return errors;
}

// The words shown when the experience typed can't be read (the server's own, without "Experience:").
export const EXPERIENCE_HINT = 'Write it like 2-5 years or 3+ years.';

// A refusal from the server, put next to the box it is about ({} when it is about none of the job's boxes: an HR
// box's, or the network). "Job link: …" -> the link box. The server's messages start with the box's name.
const PREFIXES: [string, AddedJobField][] = [
  ['Company:', 'company'],
  ['Job title:', 'title'],
  ['Job link:', 'url'],
  ['Course:', 'course'],
  ['Location:', 'location'],
  ['Experience:', 'experience'],
];
export function addedJobError(message: string): AddedJobErrors {
  for (const [prefix, field] of PREFIXES) {
    if (!message.startsWith(prefix)) continue;
    const text = message.slice(prefix.length).trim();
    return { [field]: text ? text[0].toUpperCase() + text.slice(1) : message };
  }
  return {};
}

const boxes = (values: string[]) => values.map((v) => v.trim()).filter(Boolean);

// Whether any HR contact box has something in it (then Found by is needed).
export const hasHrValues = (contact: FollowUpInput) => [contact.hrName, contact.hrProfile, contact.phone, contact.email].some((list) => boxes(list).length > 0);

// What the live check (GET /api/added-jobs/check) is asked about: the boxes as typed so far (empty ones left out).
export function checkParams(draft: AddedJobDraft): Record<string, string> {
  const params: Record<string, string> = {
    company: clean(draft.company),
    title: clean(draft.title),
    url: draft.url.trim(),
    location: clean(draft.location),
    experience: clean(draft.experience),
  };
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v));
}

// What Save sends: the boxes without extra spaces, the optional ones only when filled; the HR contact (with Found
// by) only when some is typed.
export function addedJobBody(draft: AddedJobDraft, contact: FollowUpInput): AddedJobInput {
  const location = clean(draft.location);
  const experience = clean(draft.experience);
  const hr = { hrName: boxes(contact.hrName), hrProfile: boxes(contact.hrProfile), phone: boxes(contact.phone), email: boxes(contact.email) };
  return {
    company: clean(draft.company),
    title: clean(draft.title),
    url: draft.url.trim(),
    course: draft.course as CourseId,
    ...(location ? { location } : {}),
    ...(experience ? { experience } : {}),
    ...(hasHrValues(contact) ? { ...hr, foundBy: contact.foundBy } : {}),
  };
}

// The same phone number however it is written (the server's phoneKey): "+91 98450-12345", "098450 12345" and
// "9845012345" all give "9845012345". Indian numbers lose their +91 / 0 prefix; other numbers keep all their digits.
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 14 && digits.startsWith('0091')) return digits.slice(4);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

// The phone numbers and emails saved with an added job, split into the new ones (they count on the leaderboard under
// the person's name) and the known ones: those the company's other jobs already had (POST /api/added-jobs's known),
// saved but not counted again. A number is matched by its digits, an email in any case.
export function contactCounts(phones: string[], emails: string[], known?: { phone: string[]; email: string[] }) {
  const knownPhones = new Set((known?.phone ?? []).map(phoneKey).filter(Boolean));
  const knownEmails = new Set((known?.email ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));
  const oldPhones = phones.filter((p) => knownPhones.has(phoneKey(p))).length;
  const oldEmails = emails.filter((e) => knownEmails.has(e.trim().toLowerCase())).length;
  return { phones: phones.length - oldPhones, emails: emails.length - oldEmails, known: { phones: oldPhones, emails: oldEmails } };
}

// Who added a job: their name, else their email when their account has no name (the job lists send no email);
// "Asha" in short.
export const adderName = (by: AddedBy) => by.name.trim() || by.email || 'Team member';
export const adderFirstName = (by: AddedBy) => by.name.trim().split(/\s+/)[0] || by.email?.split('@')[0] || 'the team';

// The person who added a job, or an admin, may remove it (the server checks the same). by: from the Jobs added by
// the team page, which sends the email.
export function mayRemoveAddedJob(by: AddedBy | undefined, person: { email: string; role: string } | null) {
  if (!by || !person) return false;
  return ['ADMIN', 'SUPER_ADMIN'].includes(person.role) || by.email?.toLowerCase() === person.email.toLowerCase();
}
