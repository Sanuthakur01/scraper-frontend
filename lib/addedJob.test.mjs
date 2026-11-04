// Tests for lib/addedJob.ts (the Add a job form's checks). Run: npm test (in client/).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ADDED_JOB_FIELDS,
  addedJobBody,
  addedJobError,
  adderFirstName,
  adderName,
  blankAddedJob,
  blankContact,
  checkParams,
  contactCounts,
  hasHrValues,
  jobLink,
  linkHost,
  mayRemoveAddedJob,
  phoneKey,
  validateAddedJob,
  webUrl,
} from './addedJob.ts';

const COURSES = ['data-analyst', 'data-science', 'data-engineering', 'production-support'];
const job = (fields = {}) => ({ ...blankAddedJob('data-analyst'), company: 'Acme Analytics', title: 'Data Analyst', url: 'https://acme.com/careers/12', ...fields });

test('a web link: https:// added when it has no scheme; never another kind of link', () => {
  assert.equal(webUrl('linkedin.com/in/riya'), 'https://linkedin.com/in/riya');
  assert.equal(webUrl('http://acme.com/jobs'), 'http://acme.com/jobs');
  for (const bad of ['javascript:alert(1)', 'ftp://acme.com/x', 'localhost/jobs', 'https://user:pass@acme.com/x', 'not a link']) {
    assert.equal(webUrl(bad), null, bad);
  }
});

test('a job link is stored without its #part, and too long a link is refused', () => {
  assert.equal(jobLink('  www.naukri.com/job-listings-data-analyst-031126021521#apply '), 'https://www.naukri.com/job-listings-data-analyst-031126021521');
  assert.equal(jobLink('https://www.linkedin.com/jobs/view/4487004709/?ref=x'), 'https://www.linkedin.com/jobs/view/4487004709/?ref=x');
  assert.equal(jobLink('careers.hashy.in/#/job/101'), 'https://careers.hashy.in/#/job/101');
  assert.equal(jobLink(''), null);
  assert.equal(jobLink(`https://acme.com/${'a'.repeat(1000)}`), null);
  assert.equal(linkHost('https://www.naukri.com/job-listings-x'), 'naukri.com');
});

test('the company, title, link and course are needed; location and experience are not', () => {
  assert.deepEqual(validateAddedJob(job(), COURSES), {});
  const empty = validateAddedJob(blankAddedJob(), COURSES);
  assert.deepEqual(Object.keys(empty).sort(), ['company', 'course', 'title', 'url']);
  assert.match(validateAddedJob(job({ url: 'javascript:alert(1)' }), COURSES).url, /Not a web link/);
  assert.match(validateAddedJob(job({ course: 'cooking' }), COURSES).course, /course/);
  assert.match(validateAddedJob(job({ company: '***' }), COURSES).company, /not a company name/);
});

test('the server limits: company 120, title 200, link 1000, location 120, experience 60 characters', () => {
  assert.deepEqual(validateAddedJob(job({ company: 'a'.repeat(120), title: 't'.repeat(200), location: 'l'.repeat(120), experience: 'e'.repeat(60) }), COURSES), {});
  const long = validateAddedJob(job({ company: 'a'.repeat(121), title: 't'.repeat(201), url: `acme.com/${'a'.repeat(992)}`, location: 'l'.repeat(121), experience: 'e'.repeat(61) }), COURSES);
  assert.deepEqual(Object.keys(long).sort(), ['company', 'experience', 'location', 'title', 'url']);
  // Extra spaces don't count.
  assert.deepEqual(validateAddedJob(job({ company: `  Acme   ${' '.repeat(200)} Analytics ` }), COURSES), {});
});

test("a server refusal goes to the box its message names; others to none (HR boxes: ContactForm's errorFromServer)", () => {
  assert.deepEqual(addedJobError('Company: "Pvt Ltd" is not a company name.'), { company: '"Pvt Ltd" is not a company name.' });
  assert.deepEqual(addedJobError('Job title: too long (at most 200 characters).'), { title: 'Too long (at most 200 characters).' });
  assert.deepEqual(addedJobError('Job link: not a web link.'), { url: 'Not a web link.' });
  assert.deepEqual(addedJobError('Course: choose one of the courses.'), { course: 'Choose one of the courses.' });
  assert.deepEqual(addedJobError('Location: too long.'), { location: 'Too long.' });
  assert.deepEqual(addedJobError('Experience: write it like 2-5 years or 3+ years.'), { experience: 'Write it like 2-5 years or 3+ years.' });
  for (const other of ['Phone: "12" is not a phone number.', 'Found by: choose where the HR contact was found.', 'This number already exists.', 'Could not reach the server.']) {
    assert.deepEqual(addedJobError(other), {}, other);
  }
  assert.deepEqual(ADDED_JOB_FIELDS, ['company', 'title', 'url', 'course', 'location', 'experience']);
});

test('the live check is asked only about the boxes filled in', () => {
  assert.deepEqual(checkParams(blankAddedJob('data-analyst')), {});
  assert.deepEqual(checkParams({ ...blankAddedJob(), company: ' Acme  Analytics ', url: ' acme.com/jobs/1 ' }), { company: 'Acme Analytics', url: 'acme.com/jobs/1' });
});

test('Save sends the HR contact (with Found by) only when some is typed', () => {
  const contact = blankContact();
  assert.equal(hasHrValues(contact), false);
  assert.deepEqual(addedJobBody(job({ location: ' Pune ', experience: '' }), { ...contact, foundBy: 'apollo' }), {
    company: 'Acme Analytics',
    title: 'Data Analyst',
    url: 'https://acme.com/careers/12',
    course: 'data-analyst',
    location: 'Pune',
  });
  const typed = { ...contact, phone: [' 98765 43210 ', ''], email: [''], foundBy: 'apollo' };
  assert.equal(hasHrValues(typed), true);
  const body = addedJobBody(job(), typed);
  assert.deepEqual([body.hrName, body.hrProfile, body.phone, body.email, body.foundBy], [[], [], ['98765 43210'], [], 'apollo']);
});

test('who added a job: the name, else the email; the person who added it, or an admin, may remove it', () => {
  const asha = { email: 'Asha@example.com', name: 'Asha Rao', at: '2026-11-04T10:00:00Z' };
  const noName = { email: 'vanshika@example.com', name: '', at: '2026-11-04T10:00:00Z' };
  assert.equal(adderName(asha), 'Asha Rao');
  assert.equal(adderFirstName(asha), 'Asha');
  assert.equal(adderName(noName), 'vanshika@example.com');
  assert.equal(adderFirstName(noName), 'vanshika');
  assert.equal(mayRemoveAddedJob(asha, { email: 'asha@example.com', role: 'RESEARCH_TEAM' }), true);
  assert.equal(mayRemoveAddedJob(asha, { email: 'other@example.com', role: 'PLACEMENT_STAFF' }), false);
  assert.equal(mayRemoveAddedJob(asha, { email: 'other@example.com', role: 'ADMIN' }), true);
  assert.equal(mayRemoveAddedJob(asha, { email: 'other@example.com', role: 'SUPER_ADMIN' }), true);
  assert.equal(mayRemoveAddedJob(undefined, { email: 'asha@example.com', role: 'ADMIN' }), false, 'a scraped job');
  assert.equal(mayRemoveAddedJob(asha, null), false);
});

test('the job lists send who added a job without the email: the name, else "Team member"; only an admin may remove it', () => {
  const asha = { name: 'Asha Rao', at: '2026-11-04T10:00:00Z' };
  const noName = { name: ' ', at: '2026-11-04T10:00:00Z' };
  assert.equal(adderName(asha), 'Asha Rao');
  assert.equal(adderFirstName(asha), 'Asha');
  assert.equal(adderName(noName), 'Team member');
  assert.equal(adderFirstName(noName), 'the team');
  assert.equal(mayRemoveAddedJob(asha, { email: 'asha@example.com', role: 'RESEARCH_TEAM' }), false);
  assert.equal(mayRemoveAddedJob(asha, { email: 'asha@example.com', role: 'ADMIN' }), true);
});

test("a phone number's key, as the server matches it: Indian numbers without +91 or 0, others with all their digits", () => {
  for (const same of ['+91 98450-12345', '098450 12345', '9845012345', '0091 98450 12345', '91 9845012345']) assert.equal(phoneKey(same), '9845012345', same);
  assert.equal(phoneKey('+44 20 7946 0958'), '442079460958');
});

test("the numbers and emails saved with a job: the ones the company's other jobs already had don't count again", () => {
  const phones = ['+91 91111 22222', '+91 98450 55555'];
  const emails = ['hr@acme.in'];
  // None known (or an older server that doesn't say): all count.
  assert.deepEqual(contactCounts(phones, emails), { phones: 2, emails: 1, known: { phones: 0, emails: 0 } });
  assert.deepEqual(contactCounts(phones, emails, { phone: [], email: [] }), { phones: 2, emails: 1, known: { phones: 0, emails: 0 } });
  // Matched by the digits and in any case, however they were written.
  assert.deepEqual(contactCounts(phones, emails, { phone: ['091111-22222'], email: ['HR@Acme.in'] }), { phones: 1, emails: 0, known: { phones: 1, emails: 1 } });
  // All known.
  assert.deepEqual(contactCounts(phones, emails, { phone: ['9111122222', '9845055555'], email: ['hr@acme.in'] }), { phones: 0, emails: 0, known: { phones: 2, emails: 1 } });
  // None typed.
  assert.deepEqual(contactCounts([], [], { phone: [], email: [] }), { phones: 0, emails: 0, known: { phones: 0, emails: 0 } });
});
