import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ApiError, sendJson } from '@/lib/api';
import { COURSE_COLORS, formatDate, formatDateTime, formatExperience, formatPosted, LEFT_OUT_LABELS } from '@/lib/format';
import { MAX_CONTACT_ENTRIES, type ContactSource, type FollowUpInput, type Job } from '@/lib/types';
import { CheckIcon, CloseIcon, ExternalIcon, PencilIcon, PlusIcon } from './Icons';

// Every platform the job is listed on, the one it is counted under first.
const listingOrder = (job: Job) =>
  [job.primaryPlatform, ...job.platforms.filter((p) => p !== job.primaryPlatform)].filter((p) => job.links[p]);

const splitList = (value: string) => value.split(/\s*,\s*/).filter(Boolean);
const SKILLS_SHOWN = 3;

function SourceNote({ source }: { source: ContactSource }) {
  return source === 'posting' ? <span className="contact-source">from the job post</span> : null;
}

// An empty contact cell: a dash, and "Add phone" while the row is pointed at (clicking the cell opens
// the row for typing; keyboard users have the Edit button).
function Empty({ hint }: { hint: string }) {
  return (
    <span className="placeholder">
      <span className="ph-rest">—</span>
      <span className="ph-hover" aria-hidden="true">
        <PencilIcon size={12} /> {hint}
      </span>
    </span>
  );
}

// A filled phone or email cell: a small + on the right while the row is pointed at, saying that clicking
// adds another one.
function AddMoreHint({ what }: { what: string }) {
  return (
    <span className="add-more" aria-hidden="true" title={`Add another ${what}`}>
      <PlusIcon size={12} />
    </span>
  );
}

type ListKey = 'phone' | 'email';

// The boxes for a job's phone numbers or emails while the row is being edited: one per value, × to
// remove one, and "+ Add another" below (up to MAX_CONTACT_ENTRIES).
function EntryList({
  kind,
  values,
  jobTitle,
  onChange,
  onAdd,
  onKeyDown,
}: {
  kind: ListKey;
  values: string[];
  jobTitle: string;
  onChange: (values: string[]) => void;
  onAdd: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
}) {
  const phone = kind === 'phone';
  const name = phone ? 'Phone number' : 'Email ID';
  return (
    <div className="entry-list">
      {values.map((value, i) => (
        <div className="entry" key={i}>
          <input
            className="contact-input"
            data-entry={`${kind}-${i}`}
            type={phone ? 'tel' : 'text'}
            inputMode={phone ? 'tel' : 'email'}
            value={value}
            onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
            onKeyDown={onKeyDown}
            placeholder={i === 0 ? (phone ? '98765 43210' : 'hr@company.com') : phone ? 'Another number' : 'Another email'}
            aria-label={`${name}${i > 0 ? ` ${i + 1}` : ''} for ${jobTitle}`}
          />
          {values.length > 1 && (
            <button
              type="button"
              className="entry-remove"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              aria-label={`Remove ${name.toLowerCase()} ${i + 1}`}
              title="Remove"
            >
              <CloseIcon size={13} />
            </button>
          )}
        </div>
      ))}
      {values.length < MAX_CONTACT_ENTRIES && (
        <button type="button" className="entry-add" onClick={onAdd}>
          <PlusIcon size={13} /> {phone ? 'Add another number' : 'Add another email'}
        </button>
      )}
    </div>
  );
}

// "98765 43210, 080 4123 4567" -> one box each ([''] when there's none).
const boxesFor = (value: string) => {
  const values = splitList(value);
  return values.length ? values : [''];
};

interface Props {
  job: Job;
  courseName?: string; // shown under the title when the list has several courses
  expanded: boolean; // also show salary, skills, work mode and when we found it
  onSaved: (job: Job) => void;
}

// One job in the job list. Phone, email and notes are always shown; clicking one of them (or the
// pencil) lets an analyst type them in. A job can have several phone numbers and emails: clicking a
// cell that already has one opens it with an empty box for another. Only the ✓ button saves them to
// the database; ✕ (or Escape) discards the changes.
export default function JobRow({ job, courseName, expanded, onSaved }: Props) {
  const { contact } = job;
  const [draft, setDraft] = useState<FollowUpInput | null>(null); // null = not editing
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; detail: string } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const row = useRef<HTMLTableRowElement>(null);
  const [focusOn, setFocusOn] = useState<string | null>(null); // the box to put the cursor in next

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [justSaved]);

  useEffect(() => {
    if (!focusOn) return;
    row.current?.querySelector<HTMLElement>(`[data-entry="${focusOn}"]`)?.focus();
    setFocusOn(null);
  }, [focusOn]);

  // field: the cell that was clicked (the pencil: none). A phone or email cell that already has a value
  // opens with an extra empty box, with the cursor in it, ready for another one.
  const startEditing = (field?: ListKey | 'remarks') => {
    if (draft) return;
    const phone = boxesFor(contact.phone);
    const email = boxesFor(contact.email);
    if (field === 'phone' && contact.phone && phone.length < MAX_CONTACT_ENTRIES) phone.push('');
    if (field === 'email' && contact.email && email.length < MAX_CONTACT_ENTRIES) email.push('');
    setDraft({ phone, email, remarks: contact.remarks });
    setError(null);
    setJustSaved(false);
    setFocusOn(field === 'remarks' ? 'remarks' : field === 'email' ? `email-${email.length - 1}` : field === 'phone' ? `phone-${phone.length - 1}` : 'phone-0');
  };
  const cancel = () => {
    setDraft(null);
    setError(null);
  };
  const changeList = (key: ListKey) => (values: string[]) => setDraft((d) => (d ? { ...d, [key]: values } : d));
  const addBox = (key: ListKey) => () => {
    if (!draft || draft[key].length >= MAX_CONTACT_ENTRIES) return;
    setDraft({ ...draft, [key]: [...draft[key], ''] });
    setFocusOn(`${key}-${draft[key].length}`);
  };
  const changeRemarks = (event: { target: { value: string } }) => setDraft((d) => (d ? { ...d, remarks: event.target.value } : d));
  const escapeCancels = (event: KeyboardEvent) => {
    if (event.key === 'Escape') cancel();
  };

  const submit = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await sendJson<Job>(`jobs/${job._id}/follow-up`, 'PUT', draft));
      setDraft(null);
      setJustSaved(true);
    } catch (err) {
      setError({ message: (err as Error).message, detail: err instanceof ApiError ? err.detail : '' });
    } finally {
      setSaving(false);
    }
  };

  // The contact cells open the row for typing when clicked (Edit does the same, for the keyboard).
  const editable = (field: ListKey | 'remarks', filled: boolean) =>
    draft
      ? { className: '' }
      : {
          onClick: () => startEditing(field),
          title: filled ? (field === 'remarks' ? 'Click to edit' : `Click to edit, or add another ${field === 'phone' ? 'number' : 'email'}`) : 'Click to fill in',
          className: `editable${filled && field !== 'remarks' ? ' has-value' : ''}`,
        };
  const phoneCell = editable('phone', Boolean(contact.phone));
  const emailCell = editable('email', Boolean(contact.email));
  const remarksCell = editable('remarks', Boolean(contact.remarks));

  return (
    <tr ref={row} className={draft ? 'is-editing' : undefined}>
      <td className="job-cell">
        <span className="job-title">{job.title}</span>
        <span className="job-sub">
          {courseName && (
            <span className="job-course">
              <span className="dot" style={{ background: COURSE_COLORS[job.course] }} aria-hidden="true" />
              {courseName}
              <span aria-hidden="true"> · </span>
            </span>
          )}
          {job.company || 'Company not shown'}
          {job.cities?.length ? ` · ${job.cities.join(', ')}` : ''}
        </span>
        {job.leftOutBy && <span className="reason-pill">{LEFT_OUT_LABELS[job.leftOutBy]}</span>}
      </td>
      <td className="nowrap">{formatExperience(job)}</td>
      <td>
        <ul className="listings">
          {listingOrder(job).map((platform) => (
            <li key={platform}>
              <a className="site-chip" href={job.links[platform]} target="_blank" rel="noopener noreferrer" title={`Open on ${platform}`}>
                {platform}
                <ExternalIcon size={12} />
              </a>
            </li>
          ))}
        </ul>
      </td>
      <td className="nowrap muted">{formatPosted(job.postedAt ?? job.firstSeenAt)}</td>

      {expanded && (
        <>
          <td className="extra-cell">{job.salaryText || <span className="muted">Not shown</span>}</td>
          <td className="extra-cell skills-cell">
            {job.skills?.length ? (
              <>
                {job.skills.slice(0, SKILLS_SHOWN).join(', ')}
                {job.skills.length > SKILLS_SHOWN && (
                  <span className="muted" title={job.skills.join(', ')}>
                    {' '}
                    +{job.skills.length - SKILLS_SHOWN}
                  </span>
                )}
              </>
            ) : (
              <span className="muted">—</span>
            )}
          </td>
          <td className="nowrap">{job.isRemote ? 'Remote' : 'On-site'}</td>
          <td className="nowrap muted">{formatDate(job.firstSeenAt)}</td>
        </>
      )}

      <td {...phoneCell} className={`contact-cell contact-col ${phoneCell.className}`}>
        {draft ? (
          <EntryList
            kind="phone"
            values={draft.phone}
            jobTitle={job.title}
            onChange={changeList('phone')}
            onAdd={addBox('phone')}
            onKeyDown={escapeCancels}
          />
        ) : contact.phone ? (
          <>
            {splitList(contact.phone).map((phone) => (
              <a key={phone} className="contact-value" href={`tel:${phone.replace(/[^\d+]/g, '')}`} onClick={(e) => e.stopPropagation()}>
                {phone}
              </a>
            ))}
            <SourceNote source={contact.phoneSource} />
            <AddMoreHint what="number" />
          </>
        ) : (
          <Empty hint="Add phone" />
        )}
      </td>
      <td {...emailCell} className={`contact-cell contact-col email ${emailCell.className}`}>
        {draft ? (
          <EntryList
            kind="email"
            values={draft.email}
            jobTitle={job.title}
            onChange={changeList('email')}
            onAdd={addBox('email')}
            onKeyDown={escapeCancels}
          />
        ) : contact.email ? (
          <>
            {splitList(contact.email).map((email) => (
              <a key={email} className="contact-value" href={`mailto:${email}`} onClick={(e) => e.stopPropagation()}>
                {email}
              </a>
            ))}
            <SourceNote source={contact.emailSource} />
            <AddMoreHint what="email" />
          </>
        ) : (
          <Empty hint="Add email" />
        )}
      </td>
      <td {...remarksCell} className={`contact-cell contact-col remarks ${remarksCell.className}`}>
        {draft ? (
          <textarea
            className="contact-input"
            data-entry="remarks"
            rows={2}
            value={draft.remarks}
            onChange={changeRemarks}
            onKeyDown={escapeCancels}
            placeholder="e.g. Called HR, send CVs by Friday"
            aria-label={`Notes for ${job.title}`}
          />
        ) : (
          contact.remarks || <Empty hint="Add note" />
        )}
      </td>

      <td className="row-actions-cell">
        {draft ? (
          <div className="row-actions">
            <button
              type="button"
              className="icon-action confirm"
              onClick={submit}
              disabled={saving}
              aria-label={saving ? 'Saving' : 'Save'}
              title="Save"
            >
              {saving ? <span className="spinner" aria-hidden="true" /> : <CheckIcon size={17} />}
            </button>
            <button type="button" className="icon-action" onClick={cancel} disabled={saving} aria-label="Cancel" title="Cancel (discard changes)">
              <CloseIcon size={17} />
            </button>
            {error && (
              <p className="form-error" role="alert">
                {error.message}
                {error.detail && <span className="form-error-detail">{error.detail}</span>}
              </p>
            )}
          </div>
        ) : (
          <div className="row-actions">
            {justSaved && (
              <span className="saved-note" role="status">
                Saved
              </span>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={() => startEditing()}
              title={contact.updatedAt ? `Edit · last saved ${formatDateTime(contact.updatedAt)}` : 'Edit phone, email and notes'}
              aria-label={`Edit phone, email and notes for ${job.title}`}
            >
              <PencilIcon size={15} />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
