'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  ADDED_JOB_FIELDS,
  addedJobBody,
  addedJobError,
  adderName,
  blankAddedJob,
  blankContact,
  checkParams,
  contactCounts,
  EXPERIENCE_HINT,
  validateAddedJob,
  type AddedJobDraft,
  type AddedJobErrors,
} from '@/lib/addedJob';
import { ApiError, apiUrl, fetchJob, JOB_NOT_STORED, OFFLINE, sendJson } from '@/lib/api';
import { formatDay, formatNumber, istDayOf, LEFT_OUT_LABELS, shownCities } from '@/lib/format';
import { signInHeader } from '@/lib/session';
import type { AddedJobCheck, AddedJobMatch, AddedJobSaved, Course, CourseId, FollowUpInput, Job, LeftOutReason, SearchCompany } from '@/lib/types';
import { EntryList, ERROR_ORDER, errorFromServer, FoundByField, LIST_ICONS, LISTS, splitList, validateDraft, type FieldErrors, type ListKey } from './ContactForm';
import { AlertIcon, BriefcaseIcon, BuildingIcon, CheckIcon, ChevronRightIcon, ClockIcon, CloseIcon, LinkIcon, MapPinIcon, PlusIcon, SearchIcon } from './Icons';
import { CompanyProfile, useCompanyJobs, useSearch } from './IncomingCallForm';

const HR_LISTS: ListKey[] = ['hrName', 'hrProfile', 'phone', 'email'];
const DUPLICATE = 'This job is already in the HR database.'; // the server's refusal of the same posting (409)
const CHECK_WAIT = 350; // ms without typing before the check

type JobSet = 'filtered' | 'nonfiltered';
const setName = (set: JobSet) => (set === 'filtered' ? 'Filtered' : 'Non-filtered');
const reasonWords = (reason?: string | null) => (reason ? (LEFT_OUT_LABELS[reason as LeftOutReason] ?? reason) : '');
const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

// Asks the server what it makes of the job so far (GET /api/added-jobs/check). null: no answer (offline, or
// refused).
async function askCheck(params: Record<string, string>): Promise<AddedJobCheck | null> {
  try {
    const res = await fetch(apiUrl('added-jobs/check', params), { headers: await signInHeader() });
    const body = (await res.json().catch(() => null)) as AddedJobCheck | null;
    return res.ok && body ? body : null;
  } catch {
    return null; // offline
  }
}

// Waits until typing pauses, then asks the server what it makes of the job so far (added-jobs/check): its course,
// the job site of the link, whether it will be saved under Non-filtered, and the same posting or title already
// stored. An answer to older text is dropped; a check that gets no answer drops the last one too (offline: no
// check as you type; Save still checks everything). for: the boxes it answers. round: a new form (Add another)
// starts afresh. remember: an answer Save asked for itself.
function useAddedJobCheck(params: Record<string, string>, round: number) {
  const key = `${round}|${JSON.stringify(params)}`;
  const empty = Object.keys(params).length === 0;
  const [latest, setLatest] = useState<{ for: Record<string, string>; check: AddedJobCheck; round: number } | null>(null);
  useEffect(() => {
    if (empty) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const check = await askCheck(params);
      if (!cancelled) setLatest(check ? { for: params, check, round } : null);
    }, CHECK_WAIT);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key holds the boxes and the round
  }, [key]);
  const remember = (asked: Record<string, string>, check: AddedJobCheck | null) => setLatest(check ? { for: asked, check, round } : null);
  return { latest: !empty && latest?.round === round ? latest : null, remember };
}

interface Props {
  courses: Course[];
  defaultCourse?: CourseId; // chosen at first (a course page's course), until the job title says otherwise
  onClose: () => void;
  onSaved: (saved: AddedJobSaved) => void; // the page reloads its lists
  onOpenJob?: (job: Job) => void; // open a job in its window (one already stored, or the one just saved)
}

// The "Add a job" window: a job opening the scraper missed, added by hand. Needed: the company (our HR database is
// searched as it is typed; picking one shows its profile; a new company is added with the job), the job title, the
// link to the opening and the course (picked from the title until chosen by hand). As it is typed the server says
// whether the same posting is stored already (it can't be added twice), what is stored for the company under the
// same title, and whether the job will go under Non-filtered. The HR contact typed with it is saved as on any job,
// under the person's name (new numbers and emails count on the leaderboard; ones the company's other jobs already
// have don't count again). The server checks everything again (POST /api/added-jobs).
export default function AddJobForm({ courses, defaultCourse, onClose, onSaved, onOpenJob }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const companyBox = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const listId = useId();
  const foundById = useId();
  const hrLabelIds: Record<string, string> = { hrName: useId(), hrProfile: useId(), phone: useId(), email: useId() };

  const [round, setRound] = useState(0);
  const [form, setForm] = useState<AddedJobDraft>(() => blankAddedJob());
  const [baseCourse, setBaseCourse] = useState<CourseId | ''>(defaultCourse ?? ''); // until the title picks one
  const [chosenCourse, setChosenCourse] = useState<CourseId | ''>(''); // chosen by hand: the title doesn't change it
  const [contact, setContact] = useState<FollowUpInput>(blankContact);
  const [picked, setPicked] = useState<{ key: string; name: string } | null>(null); // a company from our HR database
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [active, setActive] = useState(-1); // the suggestion the arrow keys are on
  const [errors, setErrors] = useState<AddedJobErrors>({});
  const [hrErrors, setHrErrors] = useState<FieldErrors>({});
  // Save was refused because the same posting is stored (its job, to open); problem: a refusal about no one box.
  const [refused, setRefused] = useState<{ message: string; detail: string; job: { _id: string; set: JobSet } | null } | null>(null);
  const [problem, setProblem] = useState<{ message: string; detail: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingNow = useRef(false); // set at once (state shows on the next render): never two saves at a time
  const [saved, setSaved] = useState<AddedJobSaved | null>(null);
  const [opening, setOpening] = useState<{ id: string; problem: string } | null>(null); // a stored job being opened
  const [focusOn, setFocusOn] = useState<string | null>(null); // the box to put the cursor in next (a selector)

  const params = checkParams(form);
  const { latest, remember } = useAddedJobCheck(params, round);
  const check = latest?.check ?? null;
  const fresh = (box: string) => latest?.for[box] === params[box]; // the check is about the box as it is now
  // The course: chosen by hand, else the job title's (only from a check of the title as it is now), else the
  // starting one. While a changed title is being checked, the box keeps showing the last title's course (shown
  // only: Save asks about the title as it is now).
  const titleCourse = check && fresh('title') ? check.course : null;
  const course: CourseId | '' = chosenCourse || titleCourse || baseCourse;
  const checkingTitle = Boolean(params.title) && !fresh('title');
  const shownCourse: CourseId | '' = chosenCourse || titleCourse || (checkingTitle ? check?.course : null) || baseCourse;
  const draft: AddedJobDraft = { ...form, course };

  const typed = form.company.trim();
  const companySearch = useSearch(typed, typed.length >= 2 && !picked);
  const suggestions: SearchCompany[] = companySearch?.q === typed ? companySearch.companies : [];
  const companyJobs = useCompanyJobs(picked?.key ?? null);

  const duplicate = check && fresh('url') ? check.duplicate : null;
  const similar = check && fresh('company') && fresh('title') ? check.similar : [];
  const experienceError = errors.experience ?? (check?.experienceUnreadable && fresh('experience') ? EXPERIENCE_HINT : undefined);
  // Why it will go under Non-filtered (the company and the experience decide it).
  const leftOut = check && fresh('company') && fresh('experience') && check.set === 'nonfiltered' ? check.leftOutBy : null;
  const blocked = Boolean(duplicate || refused); // the same posting is stored: Save stays off until the link changes

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    companyBox.current?.focus();
  }, []);

  useEffect(() => {
    if (!focusOn) return;
    dialog.current?.querySelector<HTMLElement>(focusOn)?.focus();
    setFocusOn(null);
  }, [focusOn]);

  const close = () => {
    if (!saving) dialog.current?.close(); // its close event calls onClose
  };

  const set = (key: Exclude<keyof AddedJobDraft, 'course'>, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
    if (key === 'url') setRefused(null);
    setProblem(null);
  };
  const changeList = (key: ListKey) => (values: string[]) => {
    setContact((c) => ({ ...c, [key]: values }));
    setHrErrors((e) => ({ ...e, [key]: undefined }));
  };
  const addBox = (key: ListKey) => () => {
    if (contact[key].length >= LISTS[key].max) return;
    setContact((c) => ({ ...c, [key]: [...c[key], ''] }));
    setFocusOn(`[data-entry="${key}-${contact[key].length}"]`);
  };

  const pick = (company: { key: string; name: string }) => {
    setPicked(company);
    setForm((f) => ({ ...f, company: company.name }));
    setErrors((e) => ({ ...e, company: undefined }));
    setSuggestOpen(false);
    setActive(-1);
  };
  const unpick = () => {
    setPicked(null);
    companyBox.current?.focus();
  };
  const onCompanyKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!suggestOpen || !suggestions.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault(); // closes the list, not the window
      setSuggestOpen(false);
    }
  };

  // Opens a stored job (the same posting, or one with the same title) in its window, over this one.
  const openStored = async (match: { _id: string; set: JobSet }) => {
    if (!onOpenJob) return;
    setOpening({ id: match._id, problem: '' });
    try {
      const job = await fetchJob(match._id, match.set);
      if (!job) {
        setOpening({ id: match._id, problem: JOB_NOT_STORED });
        return;
      }
      setOpening(null);
      onOpenJob(job);
    } catch {
      setOpening({ id: match._id, problem: OFFLINE });
    }
  };

  // The first box with a problem gets the cursor: the job's boxes first, then the HR contact's.
  const focusFirst = (found: AddedJobErrors, hrFound: FieldErrors) => {
    const field = ADDED_JOB_FIELDS.find((f) => found[f]);
    if (field) return setFocusOn(`[data-field="${field}"]`);
    const key = ERROR_ORDER.find((k) => hrFound[k]);
    if (key) setFocusOn(`[data-entry="${key}-${hrFound[key]?.index ?? 0}"]`);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (savingNow.current || blocked) return;
    savingNow.current = true;
    setSaving(true);
    setProblem(null);
    try {
      // The course from the title: when no check is about the title as it is now (typed since, or the check got no
      // answer), Save asks now, so a job is never saved under an earlier title's course.
      let toSave = draft;
      if (!chosenCourse && checkingTitle) {
        const asked = params;
        const answer = await askCheck(asked);
        remember(asked, answer);
        toSave = { ...draft, course: answer?.course || baseCourse };
      }
      const found = validateAddedJob(toSave, courses.map((c) => c.id));
      if (!found.experience && experienceError) found.experience = experienceError;
      const hrFound = validateDraft(contact);
      setErrors(found);
      setHrErrors(hrFound);
      if (ADDED_JOB_FIELDS.some((f) => found[f]) || ERROR_ORDER.some((k) => hrFound[k])) {
        focusFirst(found, hrFound);
        return;
      }
      const result = await sendJson<AddedJobSaved>('added-jobs', 'POST', addedJobBody(toSave, contact));
      setSaved(result);
      onSaved(result);
    } catch (err) {
      const message = (err as Error).message;
      const detail = err instanceof ApiError ? err.detail : '';
      const job = (err instanceof ApiError ? err.body?.job : null) as { _id?: string; set?: JobSet } | null | undefined;
      if (message === DUPLICATE) {
        setRefused({ message, detail, job: job?._id ? { _id: job._id, set: job.set === 'nonfiltered' ? 'nonfiltered' : 'filtered' } : null });
        setFocusOn('[data-field="url"]');
        return;
      }
      const jobErrors = addedJobError(message);
      const contactErrors = errorFromServer(message, detail, contact);
      if (ADDED_JOB_FIELDS.some((f) => jobErrors[f])) {
        setErrors(jobErrors);
        focusFirst(jobErrors, {});
      } else if (ERROR_ORDER.some((k) => contactErrors[k])) {
        setHrErrors(contactErrors);
        focusFirst({}, contactErrors);
      } else {
        setProblem({ message, detail });
      }
    } finally {
      savingNow.current = false;
      setSaving(false);
    }
  };

  // Add another: a new empty form in the same course (to start with: the new title can still pick another).
  const again = () => {
    setRound((n) => n + 1);
    setForm(blankAddedJob());
    if (saved) setBaseCourse(saved.job.course);
    setChosenCourse('');
    setContact(blankContact());
    setPicked(null);
    setErrors({});
    setHrErrors({});
    setRefused(null);
    setProblem(null);
    setOpening(null);
    setSaved(null);
    setFocusOn('[data-field="company"]');
  };

  const courseName = (id: string) => courses.find((c) => c.id === id)?.name ?? '';
  const showSuggestions = suggestOpen && !picked && typed.length >= 2 && suggestions.length > 0;
  const autoCourse = !chosenCourse && Boolean(titleCourse); // the course is the job title's, as it is now
  const linkHint = !form.url.trim()
    ? 'The page of the opening: a job site, the company’s careers page or any other link.'
    : check?.site && fresh('url')
      ? `${check.site} job: the scraper will join it if it finds it later.`
      : 'Company site or other link.';
  const companyHint =
    picked || errors.company || typed.length < 2 || !check || !fresh('company')
      ? ''
      : check.knownCompany
        ? suggestions.length
          ? 'In our HR database: pick it from the list to see its profile.'
          : 'In our HR database.'
        : 'New company: it is added to our HR database with this job.';
  const shownDuplicate = refused
    ? { message: refused.message, detail: refused.detail, job: refused.job }
    : duplicate
      ? { message: 'Already in the HR database:', detail: `${duplicate.title} at ${duplicate.company || 'a company not named'} (${setName(duplicate.set)})`, job: duplicate }
      : null;

  const stored = (match: AddedJobMatch) => {
    const cities = shownCities(match.cities);
    return (
      <span className="opening-main">
        <span className="opening-title">{match.title}</span>
        <span className="job-sub">
          {cities.length ? `${cities.join(', ')} · ` : ''}found {formatDay(istDayOf(match.firstSeenAt))}
          {match.set === 'nonfiltered' ? ' · Non-filtered' : ''}
          {match.addedBy ? ` · added by ${adderName(match.addedBy)}` : ''}
        </span>
      </span>
    );
  };

  return (
    <dialog
      ref={dialog}
      className="job-modal call-modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (saving) event.preventDefault();
      }}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form className="job-modal-panel call-panel addjob-panel" onSubmit={submit} noValidate>
        <header className="job-modal-header call-header addjob-header">
          <span className="call-header-icon addjob-header-icon" aria-hidden="true">
            <BriefcaseIcon size={20} />
          </span>
          <div className="job-modal-heading">
            <p className="job-modal-eyebrow">Jobs added by the team</p>
            <h2 id={titleId}>{saved ? 'Job saved' : 'Add a job'}</h2>
            <p className="job-modal-job">
              {saved ? 'It shows in the job lists now, like any other job.' : 'An opening the scraper missed. The company, job title, link and course are needed.'}
            </p>
          </div>
          <button type="button" className="icon-btn job-modal-close" onClick={close} disabled={saving} aria-label="Close" title="Close (Esc)">
            <CloseIcon size={18} />
          </button>
        </header>

        {saved ? (
          <div className="job-modal-body call-body">
            <div className="call-done" role="status">
              <span className="call-done-icon" aria-hidden="true">
                <CheckIcon size={22} />
              </span>
              <div>
                <p className="call-done-title">
                  {saved.job.title}
                  {saved.job.company ? ` at ${saved.job.company}` : ''}
                </p>
                <ul className="call-done-list">
                  <li>
                    <strong>
                      {saved.set === 'filtered' ? `In Filtered · ${courseName(saved.job.course)}` : `In Non-filtered · ${reasonWords(saved.job.leftOutBy) || courseName(saved.job.course)}`}
                    </strong>
                  </li>
                  {saved.set === 'nonfiltered' && <li>Switch the dashboard to Non-filtered (or All) to see it in the job lists.</li>}
                  <SavedContacts job={saved.job} known={saved.known} />
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="job-modal-body call-body">
            <div className="call-grid">
              <div className="edit-field call-wide call-company">
                <label className="edit-label" htmlFor={`${titleId}-company`}>
                  <BuildingIcon size={14} /> Company <span className="required-mark">*</span>
                </label>
                <div className="call-combo">
                  <SearchIcon size={15} />
                  <input
                    ref={companyBox}
                    id={`${titleId}-company`}
                    data-field="company"
                    className="contact-input"
                    role="combobox"
                    aria-expanded={showSuggestions}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={showSuggestions && active >= 0 ? `${listId}-${active}` : undefined}
                    autoComplete="off"
                    placeholder="Type the company: our HR database is searched as you type"
                    value={form.company}
                    onChange={(e) => {
                      set('company', e.target.value);
                      if (picked) setPicked(null);
                      setSuggestOpen(true);
                      setActive(-1);
                    }}
                    onFocus={() => setSuggestOpen(true)}
                    onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                    onKeyDown={onCompanyKey}
                    aria-invalid={Boolean(errors.company)}
                    aria-describedby={errors.company ? `${titleId}-company-error` : undefined}
                  />
                  {showSuggestions && (
                    <ul className="call-suggest" id={listId} role="listbox" aria-label="Companies in our HR database">
                      {suggestions.map((c, i) => (
                        <li
                          key={c.key}
                          id={`${listId}-${i}`}
                          role="option"
                          aria-selected={i === active}
                          className={i === active ? 'is-active' : undefined}
                          onMouseDown={(e) => e.preventDefault()} // keeps the focus in the box
                          onClick={() => pick(c)}
                        >
                          <strong>{c.name}</strong>
                          <span className="muted">
                            {formatNumber(c.openings + c.leftOut)} {c.openings + c.leftOut === 1 ? 'opening' : 'openings'}
                            {c.lastPosted ? ` · last posted ${formatDay(istDayOf(c.lastPosted))}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {errors.company && (
                  <p className="field-error" id={`${titleId}-company-error`}>
                    {errors.company}
                  </p>
                )}
                {picked ? (
                  <div className="call-profile">
                    <div className="call-profile-head">
                      <span className="call-profile-badge">
                        <CheckIcon size={13} /> In our HR database
                      </span>
                      <button type="button" className="btn-link" onClick={unpick}>
                        Change
                      </button>
                    </div>
                    {!companyJobs ? (
                      <span className="skeleton call-profile-skeleton" aria-label="Loading the company's openings" />
                    ) : companyJobs.failed || !companyJobs.data ? (
                      <p className="edit-hint">Couldn&apos;t load its openings. The job can still be saved.</p>
                    ) : (
                      <CompanyProfile jobs={companyJobs.data} courses={courses} />
                    )}
                  </div>
                ) : (
                  companyHint && <p className={`edit-hint ${check?.knownCompany ? '' : 'addjob-new-company'}`}>{companyHint}</p>
                )}
              </div>

              <div className="edit-field call-wide">
                <label className="edit-label" htmlFor={`${titleId}-title`}>
                  <BriefcaseIcon size={14} /> Job title <span className="required-mark">*</span>
                </label>
                <input
                  id={`${titleId}-title`}
                  data-field="title"
                  className="contact-input"
                  autoComplete="off"
                  placeholder="e.g. Data Analyst"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  aria-invalid={Boolean(errors.title)}
                  aria-describedby={errors.title ? `${titleId}-title-error` : undefined}
                />
                {errors.title && (
                  <p className="field-error" id={`${titleId}-title-error`}>
                    {errors.title}
                  </p>
                )}
              </div>

              {similar.length > 0 && (
                <div className="call-wide addjob-similar" role="status">
                  <p className="addjob-similar-title">Already stored for this company:</p>
                  <ul className="opening-list">
                    {similar.map((match) => (
                      <li key={match._id}>
                        {onOpenJob ? (
                          <button type="button" className="opening" onClick={() => openStored(match)} aria-haspopup="dialog" title="Open this job">
                            {stored(match)}
                            {opening?.id === match._id && !opening.problem ? <span className="spinner small" aria-hidden="true" /> : <ChevronRightIcon size={16} />}
                          </button>
                        ) : (
                          <span className="opening">{stored(match)}</span>
                        )}
                        {opening?.id === match._id && opening.problem && <p className="field-error addjob-open-problem">{opening.problem}</p>}
                      </li>
                    ))}
                  </ul>
                  <p className="edit-hint">The same title in the last 30 days. If this is another opening, it can still be saved.</p>
                </div>
              )}

              <div className="edit-field call-wide">
                <label className="edit-label" htmlFor={`${titleId}-url`}>
                  <LinkIcon size={14} /> Job link <span className="required-mark">*</span>
                </label>
                <input
                  id={`${titleId}-url`}
                  data-field="url"
                  type="url"
                  inputMode="url"
                  className="contact-input"
                  autoComplete="off"
                  placeholder="https://www.linkedin.com/jobs/view/…"
                  value={form.url}
                  onChange={(e) => set('url', e.target.value)}
                  aria-invalid={Boolean(errors.url) || Boolean(shownDuplicate)}
                  aria-describedby={`${titleId}-url-note`}
                />
                {errors.url ? (
                  <p className="field-error" id={`${titleId}-url-note`}>
                    {errors.url}
                  </p>
                ) : (
                  <p className="edit-hint" id={`${titleId}-url-note`}>
                    {linkHint}
                  </p>
                )}
                {shownDuplicate && (
                  <div className="form-alert addjob-duplicate" role="alert">
                    <AlertIcon size={16} />
                    <div>
                      <strong>{shownDuplicate.message}</strong>
                      {shownDuplicate.detail && <span>{shownDuplicate.detail}</span>}
                      {opening?.id === shownDuplicate.job?._id && opening?.problem && <span>{opening.problem}</span>}
                    </div>
                    {onOpenJob && shownDuplicate.job && (
                      <button type="button" className="btn btn-sm" onClick={() => shownDuplicate.job && openStored(shownDuplicate.job)} aria-haspopup="dialog">
                        Open it
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="edit-field">
                <label className="edit-label" htmlFor={`${titleId}-course`}>
                  Course <span className="required-mark">*</span>
                </label>
                <select
                  id={`${titleId}-course`}
                  data-field="course"
                  className={`select call-select ${shownCourse ? '' : 'is-empty'}`}
                  value={shownCourse}
                  onChange={(e) => {
                    setChosenCourse(e.target.value as CourseId | '');
                    setErrors((errs) => ({ ...errs, course: undefined }));
                  }}
                  aria-invalid={Boolean(errors.course)}
                >
                  <option value="">Choose the course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {errors.course ? (
                  <p className="field-error">{errors.course}</p>
                ) : (
                  autoCourse && <p className="edit-hint">Picked from the job title. Change it if it&apos;s wrong.</p>
                )}
              </div>

              <div className="edit-field">
                <label className="edit-label" htmlFor={`${titleId}-location`}>
                  <MapPinIcon size={14} /> Location
                </label>
                <input
                  id={`${titleId}-location`}
                  data-field="location"
                  className="contact-input"
                  autoComplete="off"
                  placeholder="e.g. Pune, Bengaluru or Remote"
                  value={form.location}
                  onChange={(e) => set('location', e.target.value)}
                  aria-invalid={Boolean(errors.location)}
                />
                {errors.location && <p className="field-error">{errors.location}</p>}
              </div>

              <div className="edit-field">
                <label className="edit-label" htmlFor={`${titleId}-experience`}>
                  <ClockIcon size={14} /> Experience
                </label>
                <input
                  id={`${titleId}-experience`}
                  data-field="experience"
                  className="contact-input"
                  autoComplete="off"
                  placeholder="e.g. 2-5 years"
                  value={form.experience}
                  onChange={(e) => set('experience', e.target.value)}
                  aria-invalid={Boolean(experienceError)}
                  aria-describedby={`${titleId}-experience-note`}
                />
                {experienceError ? (
                  <p className="field-error" id={`${titleId}-experience-note`}>
                    {experienceError}
                  </p>
                ) : (
                  <p className="edit-hint" id={`${titleId}-experience-note`}>
                    Leave it empty if the post doesn&apos;t say.
                  </p>
                )}
              </div>

              {leftOut && (
                <p className="note-warning call-wide addjob-note" role="status">
                  This job will be saved under Non-filtered: {reasonWords(leftOut)}.
                </p>
              )}

              <fieldset className="edit-field call-wide call-choices addjob-hr">
                <legend className="edit-label">
                  HR contact <span className="muted addjob-optional">(optional)</span>
                </legend>
                <p className="edit-hint">
                  New phone numbers and emails you add here count on the leaderboard under your name (ones this company&apos;s other jobs already have
                  don&apos;t count again).
                </p>
                <div className="call-grid">
                  {HR_LISTS.map((key) => (
                    <div className="edit-field" key={key}>
                      <span className="edit-label" id={hrLabelIds[key]}>
                        {LIST_ICONS[key]}
                        {LISTS[key].label}
                      </span>
                      <EntryList
                        kind={key}
                        values={contact[key]}
                        jobTitle={form.title.trim() || 'the new job'}
                        error={hrErrors[key]}
                        labelledBy={hrLabelIds[key]}
                        onChange={changeList(key)}
                        onAdd={addBox(key)}
                      />
                    </div>
                  ))}
                  <div className="call-wide">
                    <FoundByField
                      id={foundById}
                      value={contact.foundBy}
                      error={hrErrors.foundBy}
                      onChange={(foundBy) => {
                        setContact((c) => ({ ...c, foundBy }));
                        setHrErrors((errs) => ({ ...errs, foundBy: undefined }));
                      }}
                    />
                  </div>
                </div>
              </fieldset>
            </div>
          </div>
        )}

        <footer className="job-modal-footer">
          {saved ? (
            <>
              <span className="footer-note">Saved under your name</span>
              <div className="footer-actions">
                {onOpenJob && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      onOpenJob(saved.job);
                      close();
                    }}
                  >
                    Open the job
                  </button>
                )}
                <button type="button" className="btn" onClick={again}>
                  <PlusIcon size={15} /> Add another
                </button>
                <button type="button" className="btn btn-primary" onClick={close}>
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              {problem ? (
                <p className="field-error" role="alert">
                  {problem.message}
                  {problem.detail && <span className="field-error-detail">{problem.detail}</span>}
                </p>
              ) : (
                <span className="footer-note">
                  <span className="required-mark">*</span> needed
                </span>
              )}
              <div className="footer-actions">
                <button type="button" className="btn" onClick={close} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving || blocked} title={blocked ? 'This job is already in the HR database' : undefined}>
                  {saving ? <span className="spinner" aria-hidden="true" /> : <CheckIcon size={15} />}
                  {saving ? 'Saving…' : 'Save the job'}
                </button>
              </div>
            </>
          )}
        </footer>
      </form>
    </dialog>
  );
}

// After saving: the phone numbers and emails added with the job, under the person's name. Those the company's other
// jobs already had (known) are saved too, but don't count on the leaderboard again.
function SavedContacts({ job, known }: { job: Job; known?: AddedJobSaved['known'] }) {
  const counts = contactCounts(splitList(job.contact.phone), splitList(job.contact.email), known);
  const words = (phones: number, emails: number) =>
    [phones && plural(phones, 'phone number', 'phone numbers'), emails && plural(emails, 'email', 'emails')].filter(Boolean).join(' and ');
  const counted = counts.phones + counts.emails;
  const old = counts.known.phones + counts.known.emails;
  if (counted) {
    const also = old ? ` ${formatNumber(old)} more ${old === 1 ? 'was' : 'were'} already saved on this company’s other jobs, so ${old === 1 ? 'it doesn’t' : 'they don’t'} count again.` : '';
    return (
      <li>
        Added under your name: {words(counts.phones, counts.emails)}. {counted === 1 ? 'It counts' : 'They count'} on the leaderboard.{also}
      </li>
    );
  }
  if (old) {
    return (
      <li>
        Saved with the job: {words(counts.known.phones, counts.known.emails)}.{' '}
        {old === 1 ? 'This company’s other jobs already have it, so it doesn’t' : 'This company’s other jobs already have them, so they don’t'} count on the leaderboard again.
      </li>
    );
  }
  if (job.contact.hrNames?.length || job.contact.hrProfiles?.length) return <li>The HR contact is saved. Add a number or email later in the job&apos;s window.</li>;
  return <li>No HR contact yet: add it later in the job&apos;s window.</li>;
}
