'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ApiError, apiUrl, sendJson } from '@/lib/api';
import { COURSE_COLORS, formatDay, formatNumber, istDayOf, shownCities } from '@/lib/format';
import { signInHeader } from '@/lib/session';
import type {
  CallOutcome,
  CallSource,
  CompanyJobsResponse,
  Course,
  CourseId,
  IncomingCall,
  IncomingCallInput,
  Job,
  SearchCompany,
  SearchContact,
  SearchResponse,
} from '@/lib/types';
import { BuildingIcon, CheckIcon, CloseIcon, FlameIcon, MailIcon, NoteIcon, PhoneIcon, PhoneIncomingIcon, SearchIcon, UserIcon, UsersIcon } from './Icons';

// Where the HR found the student (the server's CALL_SOURCES) and what came of the call (CALL_OUTCOMES).
export const CALL_SOURCES: { id: CallSource; label: string }[] = [
  { id: 'naukri', label: 'Naukri' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'indeed', label: 'Indeed' },
  { id: 'glassdoor', label: 'Glassdoor' },
  { id: 'referral', label: 'Referral' },
  { id: 'other', label: 'Other' },
];
export const CALL_OUTCOMES: { id: CallOutcome; label: string }[] = [
  { id: 'interview', label: 'Interview scheduled' },
  { id: 'cv-shared', label: 'CV shared' },
  { id: 'call-back', label: 'Call back later' },
  { id: 'not-interested', label: 'Not interested' },
  { id: 'not-eligible', label: 'Not eligible' },
  { id: 'other', label: 'Other' },
];
export const sourceLabel = (id: string) => CALL_SOURCES.find((s) => s.id === id)?.label ?? '';
export const outcomeLabel = (id: string) => CALL_OUTCOMES.find((o) => o.id === id)?.label ?? '';

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;
const LATE_DAYS = 7; // the server's: a call can be logged up to a week later
const IST_MS = 330 * 60_000;
// "2026-11-02T16:05": a time in IST, as the When box shows it (whatever the computer's time zone).
const istInput = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 16);
const digitsOf = (text: string) => text.replace(/\D/g, '');

type Field = 'phone' | 'email' | 'company' | 'course' | 'at';
const FIELD_ORDER: Field[] = ['phone', 'at', 'email', 'company', 'course'];

// Waits until the text stops changing for a moment, then searches our HR database (search?q=): companies by
// name, or jobs that already have a phone number.
function useSearch(text: string, ready: boolean) {
  const [result, setResult] = useState<SearchResponse | null>(null);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl('search', { q: text }), { headers: await signInHeader() });
        const body = (await res.json().catch(() => null)) as SearchResponse | null;
        if (!cancelled && res.ok && body) setResult(body);
      } catch {
        // Offline: no suggestions; the call can still be logged with the name as typed.
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, ready]);
  return ready ? result : null;
}

// What we know of a company chosen from our HR database: its openings (kept and left out), newest first.
function useCompanyJobs(key: string | null) {
  const [state, setState] = useState<{ key: string; data: CompanyJobsResponse | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl('companies/jobs', { key, all: 1 }), { headers: await signInHeader() });
        const body = (await res.json().catch(() => null)) as CompanyJobsResponse | null;
        if (!cancelled) setState({ key, data: res.ok ? body : null, failed: !res.ok || !body });
      } catch {
        if (!cancelled) setState({ key, data: null, failed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);
  return key && state?.key === key ? state : null;
}

// The company's profile once chosen: openings by course, where, when it last posted, HR contacts we hold.
function CompanyProfile({ jobs, courses }: { jobs: CompanyJobsResponse; courses: Course[] }) {
  const byCourse = courses.map((c) => ({ c, n: jobs.items.filter((j) => j.course === c.id).length })).filter((x) => x.n > 0);
  const cities = [...new Set(jobs.items.flatMap((j) => shownCities(j.cities)))].slice(0, 3);
  const withHr = jobs.items.filter((j) => j.contact.phone || j.contact.email).length;
  const latest = jobs.items[0]?.firstSeenAt;
  return (
    <div className="call-profile-facts">
      <span>
        <strong>{formatNumber(jobs.total)}</strong> {jobs.total === 1 ? 'opening' : 'openings'} stored
      </span>
      {byCourse.map(({ c, n }) => (
        <span key={c.id} className="call-profile-course">
          <span className="dot" style={{ background: COURSE_COLORS[c.id] }} aria-hidden="true" />
          {c.name} {formatNumber(n)}
        </span>
      ))}
      {cities.length > 0 && <span>{cities.join(', ')}</span>}
      {latest && <span>Last posted {formatDay(istDayOf(latest))}</span>}
      <span>{withHr ? `HR details on ${formatNumber(withHr)} of them` : 'No HR details yet'}</span>
    </div>
  );
}

// The "Log an incoming call" window: an HR person called one of our students. Needed: the HR's number, the company
// and the course. Typing the company searches our HR database; choosing one shows what we know of it and its
// openings, and the one the call was about (the newest in the course, unless another is chosen) gets the HR number,
// so other students can be given it on Assign numbers, marked as a company that called. A number already in our
// HR database says so as it is typed, and its company can be taken from there. The server checks everything again
// (server/src/incomingCalls.js). onSaved: a call was logged (the page reloads its lists).
export default function IncomingCallForm({
  courses,
  students = [],
  onClose,
  onSaved,
}: {
  courses: Course[];
  students?: string[];
  onClose: () => void;
  onSaved: (call: IncomingCall) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const firstBox = useRef<HTMLInputElement>(null);
  const companyBox = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const listId = useId();
  const studentsId = useId();
  const [openedAt] = useState(() => Date.now());

  const blank = {
    phone: '',
    hrName: '',
    email: '',
    company: '',
    course: '' as CourseId | '',
    student: '',
    source: 'naukri' as CallSource,
    outcome: '' as CallOutcome | '',
    note: '',
    at: istInput(openedAt),
  };
  const [form, setForm] = useState(blank);
  const [atChanged, setAtChanged] = useState(false); // untouched: the server takes the time it gets the call
  const [picked, setPicked] = useState<{ key: string; name: string } | null>(null); // a company from our HR database
  const [jobId, setJobId] = useState(''); // the opening the call was about
  const [jobChosen, setJobChosen] = useState(false); // chosen by hand: a course change doesn't move it
  const [addToJob, setAddToJob] = useState(true);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [active, setActive] = useState(-1); // the suggestion the arrow keys are on
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');
  const [saved, setSaved] = useState<IncomingCall | null>(null);

  const set = <K extends keyof typeof blank>(key: K, value: (typeof blank)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const typed = form.company.trim();
  const companySearch = useSearch(typed, typed.length >= 2 && !picked);
  const suggestions: SearchCompany[] = companySearch?.q === typed ? companySearch.companies : [];
  const phoneDigits = digitsOf(form.phone);
  const numberSearch = useSearch(form.phone.trim(), phoneDigits.length >= 10);
  const known: SearchContact | null = numberSearch?.kind === 'phone' && numberSearch.q === form.phone.trim() ? (numberSearch.contacts[0] ?? null) : null;
  const companyJobs = useCompanyJobs(picked?.key ?? null);
  const openings: Job[] = companyJobs?.data?.items ?? [];
  const opening = openings.find((j) => j._id === jobId) ?? null;

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    firstBox.current?.focus();
  }, []);

  // Once the company's openings are in: the one the call was most likely about (the newest in the course, else the
  // newest), unless one was chosen; and its course, when none is chosen yet.
  useEffect(() => {
    if (!openings.length || jobChosen) return;
    const best = openings.find((j) => j.course === form.course) ?? openings[0];
    if (best._id !== jobId) setJobId(best._id);
    if (!form.course) set('course', best.course);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the openings, the course or a hand choice change
  }, [openings, form.course, jobChosen]);

  const close = () => {
    if (!saving) dialog.current?.close(); // its close event calls onClose
  };

  const pick = (company: { key: string; name: string }) => {
    setPicked(company);
    setForm((f) => ({ ...f, company: company.name }));
    setErrors((e) => ({ ...e, company: undefined }));
    setSuggestOpen(false);
    setActive(-1);
    setJobId('');
    setJobChosen(false);
  };
  const unpick = () => {
    setPicked(null);
    setJobId('');
    setJobChosen(false);
    companyBox.current?.focus();
  };
  // The number is on a job already: take its company, that job and its HR's name.
  const takeKnown = (hit: SearchContact) => {
    if (!hit.companyKey || !hit.job.company) return;
    pick({ key: hit.companyKey, name: hit.job.company });
    setJobId(hit.job._id);
    setJobChosen(true);
    setForm((f) => ({ ...f, company: hit.job.company ?? f.company, course: f.course || hit.job.course, hrName: f.hrName || hit.job.contact.hrNames?.[0] || '' }));
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

  // The same checks as the server's, so a mistake shows next to its box straight away.
  const check = () => {
    const found: Partial<Record<Field, string>> = {};
    if (!form.phone.trim()) found.phone = 'Enter the number the HR called from.';
    else if (!/^\+?[\d\s().-]+$/.test(form.phone.trim()) || phoneDigits.length < 7 || phoneDigits.length > 15) found.phone = 'Not a phone number. Enter it like 98765 43210.';
    if (form.email.trim() && !EMAIL.test(form.email.trim())) found.email = 'Not an email address. Enter it like hr@company.com.';
    if (!typed) found.company = 'Enter the company that called.';
    if (!form.course) found.course = 'Choose the course of the student who got the call.';
    const at = Date.parse(`${form.at}:00+05:30`);
    if (atChanged && (Number.isNaN(at) || at > Date.now() + 5 * 60_000)) found.at = "The call can't be in the future.";
    else if (atChanged && at < Date.now() - LATE_DAYS * 86_400_000) found.at = `Calls can be logged up to ${LATE_DAYS} days later.`;
    return found;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const found = check();
    setErrors(found);
    const first = FIELD_ORDER.find((f) => found[f]);
    if (first) {
      dialog.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return;
    }
    const body: IncomingCallInput = {
      ...(atChanged ? { at: new Date(`${form.at}:00+05:30`).toISOString() } : {}),
      phone: form.phone.trim(),
      hrName: form.hrName.trim(),
      email: form.email.trim(),
      company: typed,
      jobId: picked ? jobId : '',
      course: form.course,
      student: form.student.trim(),
      source: form.source,
      outcome: form.outcome,
      note: form.note.trim(),
      addToJob,
    };
    setSaving(true);
    setProblem('');
    try {
      const call = await sendJson<IncomingCall>('incoming-calls', 'POST', body);
      setSaved(call);
      onSaved(call);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save the call. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const again = () => {
    setForm({ ...blank, at: istInput(Date.now()), course: form.course, source: form.source });
    setAtChanged(false);
    setPicked(null);
    setJobId('');
    setJobChosen(false);
    setAddToJob(true);
    setSaved(null);
    setProblem('');
    setTimeout(() => firstBox.current?.focus());
  };

  const courseName = (id: string) => courses.find((c) => c.id === id)?.name ?? '';
  const showSuggestions = suggestOpen && !picked && typed.length >= 2 && suggestions.length > 0;

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
      <form className="job-modal-panel call-panel" onSubmit={submit} noValidate>
        <header className="job-modal-header call-header">
          <span className="call-header-icon" aria-hidden="true">
            <PhoneIncomingIcon size={20} />
          </span>
          <div className="job-modal-heading">
            <p className="job-modal-eyebrow">Incoming call</p>
            <h2 id={titleId}>{saved ? 'Call logged' : 'Log an incoming call'}</h2>
            <p className="job-modal-job">
              {saved ? 'Counted in today’s incoming calls.' : 'An HR called one of our students. The HR number, company and course are needed.'}
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
                  {saved.company} called {saved.student || 'a student'} · {courseName(saved.course)}
                </p>
                <ul className="call-done-list">
                  {saved.number?.added && saved.number.job ? (
                    <li>
                      <FlameIcon size={14} className="hot-flame" /> The number was added to the opening <strong>{saved.number.job.title}</strong>. It&apos;s first on Assign
                      numbers now, so other students can call it too.
                    </li>
                  ) : saved.number?.job ? (
                    <li>
                      This number is already saved on <strong>{saved.number.job.title}</strong>
                      {saved.number.job.company ? ` at ${saved.number.job.company}` : ''}: nothing was added twice.
                    </li>
                  ) : saved.number?.problem ? (
                    <li>The number couldn&apos;t be added to the opening: {saved.number.problem}</li>
                  ) : null}
                  {saved.inPortal ? (
                    <li>{saved.company} is in our HR database: its numbers come first on Assign numbers for the next 7 days.</li>
                  ) : (
                    <li>{saved.company} isn&apos;t in our HR database yet: it&apos;s counted under &ldquo;Not in our database&rdquo;, for the research team to add.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="job-modal-body call-body">
            <div className="call-grid">
              <div className="edit-field">
                <label className="edit-label" htmlFor={`${titleId}-phone`}>
                  <PhoneIcon size={14} /> HR number <span className="required-mark">*</span>
                </label>
                <input
                  ref={firstBox}
                  id={`${titleId}-phone`}
                  data-field="phone"
                  className="contact-input"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="98765 43210"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? `${titleId}-phone-error` : undefined}
                />
                {errors.phone && (
                  <p className="field-error" id={`${titleId}-phone-error`}>
                    {errors.phone}
                  </p>
                )}
                {known && !(picked && known.job._id === jobId) && (
                  <div className="call-known" role="status">
                    <span>
                      Already in our HR database: {known.job.contact.hrNames?.[0] ? `${known.job.contact.hrNames[0]}, ` : ''}
                      <strong>{known.job.company || 'company not shown'}</strong> · {known.job.title}
                    </span>
                    {known.companyKey && known.job.company && (
                      <button type="button" className="btn btn-sm" onClick={() => takeKnown(known)}>
                        Use these details
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="edit-field">
                <label className="edit-label" htmlFor={`${titleId}-at`}>
                  When the call came (IST)
                </label>
                <input
                  id={`${titleId}-at`}
                  data-field="at"
                  type="datetime-local"
                  className="contact-input"
                  value={form.at}
                  min={istInput(Date.now() - LATE_DAYS * 86_400_000)}
                  max={istInput(Date.now() + 60_000)}
                  onChange={(e) => {
                    setAtChanged(true);
                    set('at', e.target.value);
                  }}
                  aria-invalid={Boolean(errors.at)}
                />
                {errors.at ? <p className="field-error">{errors.at}</p> : <p className="edit-hint">Now, unless changed. Up to {LATE_DAYS} days back.</p>}
              </div>

              <div className="edit-field">
                <label className="edit-label" htmlFor={`${titleId}-hr`}>
                  <UserIcon size={14} /> HR name
                </label>
                <input id={`${titleId}-hr`} className="contact-input" autoComplete="off" placeholder="Riya Sharma" value={form.hrName} onChange={(e) => set('hrName', e.target.value)} maxLength={80} />
              </div>

              <div className="edit-field">
                <label className="edit-label" htmlFor={`${titleId}-email`}>
                  <MailIcon size={14} /> HR email
                </label>
                <input
                  id={`${titleId}-email`}
                  data-field="email"
                  type="email"
                  className="contact-input"
                  autoComplete="off"
                  placeholder="hr@company.com"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  aria-invalid={Boolean(errors.email)}
                />
                {errors.email && <p className="field-error">{errors.email}</p>}
              </div>

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
                      if (picked) {
                        setPicked(null);
                        setJobId('');
                        setJobChosen(false);
                      }
                      setSuggestOpen(true);
                      setActive(-1);
                    }}
                    onFocus={() => setSuggestOpen(true)}
                    onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                    onKeyDown={onCompanyKey}
                    aria-invalid={Boolean(errors.company)}
                    maxLength={120}
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
                {errors.company && <p className="field-error">{errors.company}</p>}

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
                      <p className="edit-hint">Couldn&apos;t load its openings. The call can still be logged.</p>
                    ) : (
                      <>
                        <CompanyProfile jobs={companyJobs.data} courses={courses} />
                        {openings.length > 0 && (
                          <div className="edit-field">
                            <label className="edit-label" htmlFor={`${titleId}-job`}>
                              The opening the call was about
                            </label>
                            <select
                              id={`${titleId}-job`}
                              className="select call-select"
                              value={jobId}
                              onChange={(e) => {
                                setJobId(e.target.value);
                                setJobChosen(true);
                                const job = openings.find((j) => j._id === e.target.value);
                                if (job) set('course', job.course);
                              }}
                            >
                              <option value="">None of these</option>
                              {openings.slice(0, 150).map((j) => (
                                <option key={j._id} value={j._id}>
                                  {j.title} · {courseName(j.course)} · {formatDay(istDayOf(j.firstSeenAt))}
                                  {j.leftOutBy ? ' · non-filtered' : ''}
                                </option>
                              ))}
                            </select>
                            {opening && (
                              <label className="call-check">
                                <input type="checkbox" checked={addToJob} onChange={(e) => setAddToJob(e.target.checked)} />
                                <span>
                                  Add this HR number{form.hrName.trim() ? ' and name' : ''} to the opening&apos;s HR details, so other students can be given it on Assign
                                  numbers
                                </span>
                              </label>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : typed.length >= 2 && companySearch?.q === typed && !suggestions.length ? (
                  <p className="edit-hint call-new-company">
                    Not in our HR database: the call is kept with the name as typed and counted under &ldquo;Not in our database&rdquo;.
                  </p>
                ) : (
                  !picked &&
                  suggestions.length > 0 &&
                  !suggestOpen && <p className="edit-hint">Pick it from the list if it&apos;s there, so its profile and openings are used.</p>
                )}
              </div>

              <div className="edit-field">
                <label className="edit-label" htmlFor={`${titleId}-course`}>
                  Course <span className="required-mark">*</span>
                </label>
                <select
                  id={`${titleId}-course`}
                  data-field="course"
                  className={`select call-select ${form.course ? '' : 'is-empty'}`}
                  value={form.course}
                  onChange={(e) => set('course', e.target.value as CourseId)}
                  aria-invalid={Boolean(errors.course)}
                >
                  <option value="">Choose the student&apos;s course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {errors.course && <p className="field-error">{errors.course}</p>}
              </div>

              <div className="edit-field">
                <label className="edit-label" htmlFor={`${titleId}-student`}>
                  <UsersIcon size={14} /> Student who got the call
                </label>
                <input
                  id={`${titleId}-student`}
                  className="contact-input"
                  list={studentsId}
                  autoComplete="off"
                  placeholder="Student's name"
                  value={form.student}
                  onChange={(e) => set('student', e.target.value)}
                  maxLength={60}
                />
                <datalist id={studentsId}>
                  {students.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              <fieldset className="edit-field call-wide call-choices">
                <legend className="edit-label">Where the HR found the student</legend>
                <div className="filter-chips">
                  {CALL_SOURCES.map((s) => (
                    <button key={s.id} type="button" className="filter-chip" aria-pressed={form.source === s.id} onClick={() => set('source', s.id)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="edit-field call-wide call-choices">
                <legend className="edit-label">What came of the call</legend>
                <div className="filter-chips">
                  {CALL_OUTCOMES.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className="filter-chip"
                      aria-pressed={form.outcome === o.id}
                      onClick={() => set('outcome', form.outcome === o.id ? '' : o.id)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="edit-hint">Optional, and it can be set later on the Incoming calls page.</p>
              </fieldset>

              <div className="edit-field call-wide">
                <label className="edit-label" htmlFor={`${titleId}-note`}>
                  <NoteIcon size={14} /> Note
                </label>
                <textarea
                  id={`${titleId}-note`}
                  className="contact-input call-note"
                  placeholder="The role, salary or interview date they mentioned…"
                  value={form.note}
                  onChange={(e) => set('note', e.target.value)}
                  maxLength={500}
                />
              </div>
            </div>
          </div>
        )}

        <footer className="job-modal-footer">
          {saved ? (
            <>
              <span className="footer-note">Logged {saved.student ? `for ${saved.student}` : ''}</span>
              <div className="footer-actions">
                <button type="button" className="btn" onClick={again}>
                  <PhoneIncomingIcon size={15} /> Log another call
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
                  {problem}
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
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" aria-hidden="true" /> : <CheckIcon size={15} />}
                  {saving ? 'Saving…' : 'Log the call'}
                </button>
              </div>
            </>
          )}
        </footer>
      </form>
    </dialog>
  );
}
