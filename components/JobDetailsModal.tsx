import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, sendJson, useApi } from '@/lib/api';
import { usePressAction } from '@/lib/pressAction';
import { useAccess } from './AuthGate';
import {
  COURSE_COLORS,
  formatDate,
  formatDateTime,
  formatExperience,
  formatNumber,
  formatPosted,
  formatUpdated,
  LEFT_OUT_LABELS,
  listingOrder,
} from '@/lib/format';
import type { Course, FollowUpInput, Job, JobsResponse } from '@/lib/types';
import {
  ContactIcons,
  draftFrom,
  EntryList,
  errorFromServer,
  FIELD_ORDER,
  LIST_ORDER,
  LISTS,
  profileLabel,
  REMARKS_LIMIT,
  sameDraft,
  splitList,
  validateDraft,
  type FieldErrors,
  type FieldKey,
  type ListKey,
} from './ContactForm';
import {
  AlertIcon,
  BriefcaseIcon,
  BuildingIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  ExternalIcon,
  LinkIcon,
  MailIcon,
  MapPinIcon,
  NoteIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  UserIcon,
  UsersIcon,
} from './Icons';
import { SectionError } from './PageParts';

// The icon beside each list of boxes while editing.
const LIST_ICONS: Record<ListKey, ReactNode> = {
  hrName: <UserIcon size={14} />,
  hrProfile: <LinkIcon size={14} />,
  phone: <PhoneIcon size={14} />,
  email: <MailIcon size={14} />,
  assignedTo: <UsersIcon size={14} />,
};

// Other openings listed under the same company name: how far back, and how many before "Show all".
const COMPANY_DAYS = 90;
const OPENINGS_SHOWN = 5;

// "Tata Elxsi Ltd" -> "TE"
const companyInitials = (name?: string) =>
  (name ?? '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || '?';

// Copies text. While a window is open the rest of the page can't be used, so the fallback (no
// clipboard access, e.g. not https) works inside that window.
async function copyText(text: string, from: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.position = 'fixed';
    box.style.opacity = '0';
    (from.closest('dialog') ?? document.body).appendChild(box);
    box.select();
    const copied = document.execCommand('copy');
    box.remove();
    return copied;
  }
}

export function CopyButton({ value, what }: { value: string; what: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className={`copy-btn ${copied ? 'copied' : ''}`}
      onClick={async (event) => setCopied(await copyText(value, event.currentTarget))}
      aria-label={copied ? `${what} copied` : `Copy ${what} ${value}`}
      title={copied ? 'Copied' : 'Copy'}
    >
      {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
    </button>
  );
}

// An empty field in the view: a dashed button that opens the form at that field ("None yet" for a role
// that may not edit).
function AddButton({ children, onClick, allowed }: { children: ReactNode; onClick: () => void; allowed: boolean }) {
  if (!allowed) return <span className="muted">None yet</span>;
  return (
    <button type="button" className="add-field" onClick={onClick}>
      <PlusIcon size={13} /> {children}
    </button>
  );
}

function SectionHead({ icon, title, note, id, children }: { icon: ReactNode; title: string; note?: string; id: string; children?: ReactNode }) {
  return (
    <div className="modal-section-head">
      <span className="modal-section-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="modal-section-titles">
        <h3 id={id}>{title}</h3>
        {note && <p>{note}</p>}
      </div>
      {children}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// The company's other openings (same name, last 90 days, the dashboard's current view), each opening
// the window on that job, and the HR contacts typed in or found for them.
function CompanyOpenings({
  job,
  courses,
  saved,
  locked,
  onOpenJob,
}: {
  job: Job;
  courses: Course[];
  saved: Record<string, Job>;
  locked: boolean; // editing: another job can't be opened until the changes are saved or cancelled
  onOpenJob: (job: Job) => void;
}) {
  const company = job.company ?? '';
  const state = useApi<JobsResponse>('jobs', { company, days: COMPANY_DAYS, limit: 50 }, { skip: !company });
  const [all, setAll] = useState(false);
  const headingId = useId();
  const courseName = Object.fromEntries(courses.map((c) => [c.id, c.name]));

  const others = (state.data?.items ?? []).filter((o) => o._id !== job._id).map((o) => saved[o._id] ?? o);
  const total = state.data ? state.data.total - (state.data.items.some((o) => o._id === job._id) ? 1 : 0) : 0;
  const shown = all ? others : others.slice(0, OPENINGS_SHOWN);
  const phones = [...new Set(others.flatMap((o) => splitList(o.contact.phone)))];
  const emails = [...new Set(others.flatMap((o) => splitList(o.contact.email)))];

  let content: ReactNode;
  if (!company) content = <p className="modal-empty">The job post doesn&apos;t name the company.</p>;
  else if (state.error) content = <SectionError what="the company's other openings" error={state.error} onRetry={state.reload} />;
  else if (!state.data)
    content = (
      <div className="opening-skeleton" aria-busy="true" aria-label="Loading other openings">
        {[0, 1, 2].map((i) => (
          <span key={i} className="skeleton" />
        ))}
      </div>
    );
  else if (!others.length) content = <p className="modal-empty">No other openings from {company} in the last {COMPANY_DAYS} days.</p>;
  else
    content = (
      <>
        {(phones.length > 0 || emails.length > 0) && (
          <div className="known-contacts">
            <p className="known-contacts-title">HR contacts from its other openings</p>
            <ul>
              {phones.map((p) => (
                <li key={p}>
                  <PhoneIcon size={12} />
                  <a href={`tel:${p.replace(/[^\d+]/g, '')}`}>{p}</a>
                  <CopyButton value={p} what="phone number" />
                </li>
              ))}
              {emails.map((e) => (
                <li key={e}>
                  <MailIcon size={12} />
                  <a href={`mailto:${e}`}>{e}</a>
                  <CopyButton value={e} what="email" />
                </li>
              ))}
            </ul>
          </div>
        )}
        {locked && <p className="modal-hint">Save or cancel your changes to open another job.</p>}
        <ul className="opening-list">
          {shown.map((o) => (
            <li key={o._id}>
              <button type="button" className="opening" onClick={() => onOpenJob(o)} disabled={locked}>
                <span className="opening-main">
                  <span className="opening-title">{o.title}</span>
                  <span className="job-sub">
                    <span className="job-course">
                      <span className="dot" style={{ background: COURSE_COLORS[o.course] }} aria-hidden="true" />
                      {courseName[o.course]}
                    </span>
                    {o.cities?.length ? ` · ${o.cities.join(', ')}` : ''} · {formatPosted(o.postedAt ?? o.firstSeenAt)}
                  </span>
                </span>
                <ContactIcons contact={o.contact} />
                <ChevronRightIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
        {others.length > OPENINGS_SHOWN && (
          <button type="button" className="btn-link" onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer' : `Show all ${formatNumber(others.length)}`}
          </button>
        )}
        {total > others.length && <p className="modal-hint">Showing {formatNumber(others.length)} of {formatNumber(total)}.</p>}
      </>
    );

  return (
    <section className="modal-section" aria-labelledby={headingId}>
      <SectionHead
        icon={<BuildingIcon size={16} />}
        id={headingId}
        title={company ? `More from ${company}` : 'More from this company'}
        note={
          state.data && company && total > 0
            ? `${formatNumber(total)} other ${total === 1 ? 'opening' : 'openings'} under this name in the last ${COMPANY_DAYS} days`
            : `Other openings under this name in the last ${COMPANY_DAYS} days`
        }
      />
      {content}
    </section>
  );
}

interface Props {
  job: Job;
  courses: Course[];
  saved?: Record<string, Job>; // jobs saved since their list loaded: newer than the loaded copies
  onClose: () => void;
  onSaved: (job: Job) => void;
  onOpenJob: (job: Job) => void; // another opening of the same company was clicked
}

// The window a company name opens: the company and the job, the HR phone numbers, emails, students and
// notes (shown, and edited with "Edit details"), the job's details and the company's other openings.
// Only Save saves. Cancel, Escape (while editing), Close, Escape again or a click outside the window
// discards the changes. The details are saved per job, as in the job list.
function Modal({ job, courses, saved = {}, onClose, onSaved, onOpenJob }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pressedOnBackdrop = useRef(false);
  const titleId = useId();
  const contactId = useId();
  const factsId = useId();
  const labelIds = { hrName: useId(), hrProfile: useId(), phone: useId(), email: useId(), assignedTo: useId(), remarks: useId() };
  const notesErrorId = useId();

  const [draft, setDraft] = useState<FollowUpInput | null>(null); // null = not editing
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<{ message: string; detail: string } | null>(null); // not about one field
  const [saving, setSaving] = useState(false);
  const savingNow = useRef(false); // set at once (state shows on the next render): never two saves at a time
  const [justSaved, setJustSaved] = useState(false);
  const [focusOn, setFocusOn] = useState<string | null>(null); // the box (data-entry) to put the cursor in next

  const { contact } = job;
  const mayEdit = useAccess()?.can('edit-hr-details') ?? false; // the signed-in person's role (lib/access.ts)
  const editing = draft !== null;
  const original = useMemo(() => draftFrom(contact), [contact]);
  const changed = draft !== null && !sameDraft(draft, original);
  const course = courses.find((c) => c.id === job.course);
  const hrNames = contact.hrNames ?? [];
  const hrProfiles = (contact.hrProfiles ?? []).filter((url) => /^https?:\/\//i.test(url)); // only web links are ever opened
  const phones = splitList(contact.phone);
  const emails = splitList(contact.email);
  const links = listingOrder(job);

  // A modal window: the page behind can't be used, focus starts on Close and goes back afterwards to
  // the company name that opened it.
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    closeButton.current?.focus();
  }, []);

  // Another of the company's openings was opened: start at its top, not editing.
  useEffect(() => {
    setDraft(null);
    setErrors({});
    setFailure(null);
    setJustSaved(false);
    body.current?.scrollTo({ top: 0 });
  }, [job._id]);

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [justSaved]);

  useEffect(() => {
    if (!focusOn) return;
    dialog.current?.querySelector<HTMLElement>(`[data-entry="${focusOn}"]`)?.focus();
    setFocusOn(null);
  }, [focusOn]);

  const close = () => {
    if (!saving) dialog.current?.close(); // its close event calls onClose
  };

  // field: where to put the cursor. addAnother: a list that already has values gets an empty box for one more.
  const startEditing = (field: FieldKey = 'phone', addAnother = false) => {
    if (editing || !mayEdit) return;
    const next = draftFrom(contact);
    if (field !== 'remarks' && addAnother && next[field].some(Boolean) && next[field].length < LISTS[field].max) next[field].push('');
    setDraft(next);
    setErrors({});
    setFailure(null);
    setJustSaved(false);
    setFocusOn(field === 'remarks' ? 'remarks' : `${field}-${next[field].length - 1}`);
  };
  const stopEditing = () => {
    setDraft(null);
    setErrors({});
    setFailure(null);
    setFocusOn('edit');
  };
  const changeList = (key: ListKey) => (values: string[]) => {
    setDraft((d) => (d ? { ...d, [key]: values } : d));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const addBox = (key: ListKey) => () => {
    if (!draft || draft[key].length >= LISTS[key].max) return;
    setDraft({ ...draft, [key]: [...draft[key], ''] });
    setFocusOn(`${key}-${draft[key].length}`);
  };
  const focusField = (found: FieldErrors) => {
    const field = FIELD_ORDER.find((key) => found[key]);
    if (field) setFocusOn(field === 'remarks' ? 'remarks' : `${field}-${found[field]?.index ?? 0}`);
  };

  const save = async () => {
    if (!draft || savingNow.current || !changed) return;
    const found = validateDraft(draft);
    if (FIELD_ORDER.some((key) => found[key])) {
      setErrors(found);
      setFailure(null);
      focusField(found);
      return;
    }
    savingNow.current = true;
    setSaving(true);
    setErrors({});
    setFailure(null);
    try {
      onSaved(await sendJson<Job>(`jobs/${job._id}/follow-up`, 'PUT', draft));
      setDraft(null);
      setJustSaved(true);
      setFocusOn('edit');
    } catch (err) {
      const message = (err as Error).message;
      const detail = err instanceof ApiError ? err.detail : '';
      const fieldErrors = errorFromServer(message, detail, draft);
      if (FIELD_ORDER.some((key) => fieldErrors[key])) {
        setErrors(fieldErrors);
        focusField(fieldErrors);
      } else {
        setFailure({ message, detail });
      }
    } finally {
      savingNow.current = false;
      setSaving(false);
    }
  };
  // Saves on the press, so one click always does it (lib/pressAction.ts).
  const savePress = usePressAction(save);

  const remarksLength = draft ? draft.remarks.replace(/\r\n?/g, '\n').trim().length : 0;

  return (
    <dialog
      ref={dialog}
      className="job-modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape: while saving, nothing; while editing, back to the details (changes discarded); else close.
        if (event.target !== event.currentTarget) return;
        if (saving) event.preventDefault();
        else if (editing) {
          event.preventDefault();
          stopEditing();
        }
      }}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      // A click outside the window closes it, but only when it also started outside: selecting text in a
      // box and letting go of the mouse outside doesn't.
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedOnBackdrop.current) close();
      }}
    >
      <div className="job-modal-panel">
        <header className="job-modal-header">
          <span className="company-avatar" aria-hidden="true">
            {companyInitials(job.company)}
          </span>
          <div className="job-modal-heading">
            <p className="job-modal-eyebrow">Company</p>
            <h2 id={titleId}>{job.company || 'Company not shown'}</h2>
            <p className="job-modal-job">{job.title}</p>
            <div className="job-modal-tags">
              {course && (
                <span className="meta-pill">
                  <span className="dot" style={{ background: COURSE_COLORS[job.course] }} aria-hidden="true" />
                  {course.name}
                </span>
              )}
              <span className="meta-pill">
                <MapPinIcon size={12} /> {job.cities?.length ? job.cities.join(', ') : 'City not shown'}
              </span>
              <span className="meta-pill">
                <BriefcaseIcon size={12} /> {formatExperience(job)}
              </span>
              {job.leftOutBy && <span className="reason-pill">{LEFT_OUT_LABELS[job.leftOutBy]}</span>}
            </div>
          </div>
          <button ref={closeButton} type="button" className="icon-btn job-modal-close" onClick={close} disabled={saving} aria-label="Close" title="Close (Esc)">
            <CloseIcon size={18} />
          </button>
        </header>

        <div className="job-modal-body" ref={body}>
          <div className="job-modal-grid">
            <section className={`modal-section contact-section ${editing ? 'is-editing' : ''}`} aria-labelledby={contactId}>
              <SectionHead
                icon={<PhoneIcon size={16} />}
                id={contactId}
                title="HR contact & follow-up"
                note={editing ? 'Up to 10 of each: HR names, profile links, numbers and emails; up to 20 students' : 'Typed in by your team, or found in the job post'}
              >
                {justSaved && (
                  <span className="saved-pill" role="status">
                    <CheckIcon size={13} /> Saved
                  </span>
                )}
              </SectionHead>

              {editing ? (
                <fieldset className="edit-form" disabled={saving}>
                  <legend className="sr-only">HR contact, students and notes for {job.title}</legend>
                  {failure && (
                    <div className="form-alert" role="alert">
                      <AlertIcon size={16} />
                      <div>
                        <strong>{failure.message}</strong>
                        {failure.detail && <span>{failure.detail}</span>}
                      </div>
                    </div>
                  )}
                  {LIST_ORDER.map((key) => (
                    <div className="edit-field" key={key}>
                      <span className="edit-label" id={labelIds[key]}>
                        {LIST_ICONS[key]}
                        {LISTS[key].label}
                      </span>
                      <EntryList
                        kind={key}
                        values={draft[key]}
                        jobTitle={job.title}
                        error={errors[key]}
                        labelledBy={labelIds[key]}
                        onChange={changeList(key)}
                        onAdd={addBox(key)}
                      />
                    </div>
                  ))}
                  <div className="edit-field">
                    <label className="edit-label" id={labelIds.remarks} htmlFor={`${labelIds.remarks}-box`}>
                      <NoteIcon size={14} /> Notes
                    </label>
                    <textarea
                      id={`${labelIds.remarks}-box`}
                      className="contact-input notes-input"
                      data-entry="remarks"
                      rows={4}
                      value={draft.remarks}
                      onChange={(e) => {
                        const remarks = e.target.value;
                        setDraft((d) => (d ? { ...d, remarks } : d));
                        setErrors((errs) => ({ ...errs, remarks: undefined }));
                      }}
                      placeholder="e.g. Called HR, send CVs by Friday"
                      aria-label={`Notes for ${job.title}`}
                      aria-invalid={Boolean(errors.remarks) || undefined}
                      aria-describedby={errors.remarks ? notesErrorId : undefined}
                    />
                    <div className="notes-foot">
                      {errors.remarks ? (
                        <p className="field-error" id={notesErrorId} role="alert">
                          {errors.remarks.message}
                        </p>
                      ) : (
                        <span />
                      )}
                      <span className={`char-count ${remarksLength > REMARKS_LIMIT ? 'over' : ''}`}>
                        {formatNumber(remarksLength)} / {formatNumber(REMARKS_LIMIT)}
                      </span>
                    </div>
                  </div>
                </fieldset>
              ) : (
                <dl className="contact-details">
                  <div className="contact-row">
                    <dt>
                      <UserIcon size={14} /> HR name
                    </dt>
                    <dd>
                      {hrNames.length ? (
                        <>
                          <ul className="value-list">
                            {hrNames.map((name) => (
                              <li key={name}>
                                <span className="hr-name">{name}</span>
                                <CopyButton value={name} what="name" />
                              </li>
                            ))}
                          </ul>
                          {mayEdit && hrNames.length < LISTS.hrName.max && (
                            <button type="button" className="btn-link add-another" onClick={() => startEditing('hrName', true)}>
                              Add another HR name
                            </button>
                          )}
                        </>
                      ) : (
                        <AddButton allowed={mayEdit} onClick={() => startEditing('hrName')}>Add HR name</AddButton>
                      )}
                    </dd>
                  </div>
                  <div className="contact-row">
                    <dt>
                      <LinkIcon size={14} /> HR profile
                    </dt>
                    <dd>
                      {hrProfiles.length ? (
                        <>
                          <ul className="value-list">
                            {hrProfiles.map((url) => (
                              <li key={url}>
                                <a href={url} target="_blank" rel="noopener noreferrer" className="profile-link" title={url}>
                                  {profileLabel(url)}
                                  <ExternalIcon size={12} />
                                </a>
                                <CopyButton value={url} what="profile link" />
                              </li>
                            ))}
                          </ul>
                          {mayEdit && hrProfiles.length < LISTS.hrProfile.max && (
                            <button type="button" className="btn-link add-another" onClick={() => startEditing('hrProfile', true)}>
                              Add another profile link
                            </button>
                          )}
                        </>
                      ) : (
                        <AddButton allowed={mayEdit} onClick={() => startEditing('hrProfile')}>Add profile link</AddButton>
                      )}
                    </dd>
                  </div>
                  <div className="contact-row">
                    <dt>
                      <PhoneIcon size={14} /> Phone
                    </dt>
                    <dd>
                      {phones.length ? (
                        <>
                          <ul className="value-list">
                            {phones.map((p) => (
                              <li key={p}>
                                <a href={`tel:${p.replace(/[^\d+]/g, '')}`}>{p}</a>
                                <CopyButton value={p} what="phone number" />
                              </li>
                            ))}
                          </ul>
                          {contact.phoneSource === 'posting' && <span className="contact-source">From the job post</span>}
                          {mayEdit && phones.length < LISTS.phone.max && (
                            <button type="button" className="btn-link add-another" onClick={() => startEditing('phone', true)}>
                              Add another number
                            </button>
                          )}
                        </>
                      ) : (
                        <AddButton allowed={mayEdit} onClick={() => startEditing('phone')}>Add phone number</AddButton>
                      )}
                    </dd>
                  </div>
                  <div className="contact-row">
                    <dt>
                      <MailIcon size={14} /> Email
                    </dt>
                    <dd>
                      {emails.length ? (
                        <>
                          <ul className="value-list">
                            {emails.map((e) => (
                              <li key={e}>
                                <a href={`mailto:${e}`}>{e}</a>
                                <CopyButton value={e} what="email" />
                              </li>
                            ))}
                          </ul>
                          {contact.emailSource === 'posting' && <span className="contact-source">From the job post</span>}
                          {mayEdit && emails.length < LISTS.email.max && (
                            <button type="button" className="btn-link add-another" onClick={() => startEditing('email', true)}>
                              Add another email
                            </button>
                          )}
                        </>
                      ) : (
                        <AddButton allowed={mayEdit} onClick={() => startEditing('email')}>Add email</AddButton>
                      )}
                    </dd>
                  </div>
                  <div className="contact-row">
                    <dt>
                      <UsersIcon size={14} /> Assigned to
                    </dt>
                    <dd>
                      {contact.assignedTo.length ? (
                        <>
                          <ul className="student-list" aria-label="Assigned students">
                            {contact.assignedTo.map((name) => (
                              <li key={name} className="student-tag">
                                {name}
                              </li>
                            ))}
                          </ul>
                          {mayEdit && contact.assignedTo.length < LISTS.assignedTo.max && (
                            <button type="button" className="btn-link add-another" onClick={() => startEditing('assignedTo', true)}>
                              Add another student
                            </button>
                          )}
                        </>
                      ) : (
                        <AddButton allowed={mayEdit} onClick={() => startEditing('assignedTo')}>Assign students</AddButton>
                      )}
                    </dd>
                  </div>
                  <div className="contact-row">
                    <dt>
                      <NoteIcon size={14} /> Notes
                    </dt>
                    <dd>
                      {contact.remarks ? (
                        <>
                          <p className="notes-text">{contact.remarks}</p>
                          {mayEdit && (
                            <button type="button" className="btn-link add-another" onClick={() => startEditing('remarks')}>
                              Edit note
                            </button>
                          )}
                        </>
                      ) : (
                        <AddButton allowed={mayEdit} onClick={() => startEditing('remarks')}>Add a note</AddButton>
                      )}
                    </dd>
                  </div>
                </dl>
              )}
            </section>

            <section className="modal-section" aria-labelledby={factsId}>
              <SectionHead icon={<BriefcaseIcon size={16} />} id={factsId} title="Job details" />
              <dl className="fact-list">
                <Fact label="Salary">{job.salaryText || 'Not shown'}</Fact>
                <Fact label="Work mode">{job.isRemote ? 'Remote' : 'On-site'}</Fact>
                <Fact label="Posted on the site">
                  {job.postedAt ? <span title={formatDateTime(job.postedAt)}>{formatPosted(job.postedAt)}</span> : 'Date not shown'}
                </Fact>
                <Fact label="Found by us">{formatDate(job.firstSeenAt)}</Fact>
                {job.leftOutBy && <Fact label="Left out because">{LEFT_OUT_LABELS[job.leftOutBy]}</Fact>}
                <Fact label="Listed on">
                  {links.length ? (
                    <ul className="listings">
                      {links.map((platform) => (
                        <li key={platform}>
                          <a className="site-chip" href={job.links[platform]} target="_blank" rel="noopener noreferrer" title={`Open on ${platform}`}>
                            {platform}
                            <ExternalIcon size={12} />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    'No link'
                  )}
                </Fact>
                <Fact label="Skills">
                  {job.skills?.length ? (
                    <ul className="skill-tags">
                      {job.skills.map((skill) => (
                        <li key={skill}>{skill}</li>
                      ))}
                    </ul>
                  ) : (
                    'None named in the post'
                  )}
                </Fact>
              </dl>
            </section>
          </div>

          <CompanyOpenings job={job} courses={courses} saved={saved} locked={editing} onOpenJob={onOpenJob} />
        </div>

        <footer className="job-modal-footer">
          {editing ? (
            <>
              <span className={`footer-note ${changed ? 'changed' : ''}`}>{changed ? 'Unsaved changes' : 'No changes yet'}</span>
              <div className="footer-actions">
                <button type="button" className="btn" onClick={stopEditing} disabled={saving}>
                  <CloseIcon size={15} /> Cancel
                </button>
                <button type="button" className="btn btn-primary" {...savePress} disabled={saving || !changed} aria-label={saving ? 'Saving' : 'Save'}>
                  {saving ? <span className="spinner" aria-hidden="true" /> : <CheckIcon size={15} />}
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="footer-note">
                {contact.updatedAt ? `Last updated ${formatUpdated(contact.updatedAt)}` : 'Nothing typed in yet'}
                {!mayEdit && ' · View only for your role'}
              </span>
              <div className="footer-actions">
                <button type="button" className="btn" onClick={close}>
                  Close
                </button>
                {mayEdit && (
                  <button type="button" className="btn btn-primary" data-entry="edit" onClick={() => startEditing()}>
                    <PencilIcon size={15} /> Edit details
                  </button>
                )}
              </div>
            </>
          )}
        </footer>
      </div>
    </dialog>
  );
}

// Rendered at the end of the page (not inside a table or a side panel), so nothing around it can clip it.
export default function JobDetailsModal(props: Props) {
  return createPortal(<Modal {...props} />, document.body);
}
