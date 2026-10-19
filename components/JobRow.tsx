import { useEffect, useState, type KeyboardEvent } from 'react';
import { ApiError, sendJson } from '@/lib/api';
import { COURSE_COLORS, formatDate, formatDateTime, formatExperience, formatPosted } from '@/lib/format';
import type { ContactSource, FollowUpInput, Job } from '@/lib/types';
import { ExternalIcon, PencilIcon } from './Icons';

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

interface Props {
  job: Job;
  courseName?: string; // shown under the title when the list has several courses
  expanded: boolean; // also show salary, skills, work mode and when we found it
  onSaved: (job: Job) => void;
}

// One job in the job list. Phone, email and notes are always shown; clicking one of them (or Edit)
// lets an analyst type them in, and Save stores them in the database.
export default function JobRow({ job, courseName, expanded, onSaved }: Props) {
  const { contact } = job;
  const [draft, setDraft] = useState<FollowUpInput | null>(null); // null = not editing
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; detail: string } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const formId = `contact-${job._id}`;

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const startEditing = () => {
    if (draft) return;
    setDraft({ phone: contact.phone, email: contact.email, remarks: contact.remarks });
    setError(null);
    setJustSaved(false);
  };
  const cancel = () => {
    setDraft(null);
    setError(null);
  };
  const change = (key: keyof FollowUpInput) => (event: { target: { value: string } }) =>
    setDraft((d) => (d ? { ...d, [key]: event.target.value } : d));
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
  const editable = draft ? undefined : { onClick: startEditing, title: 'Click to fill in' };

  return (
    <tr className={draft ? 'is-editing' : undefined}>
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

      <td {...editable} className={`contact-cell contact-col ${editable ? 'editable' : ''}`}>
        {draft ? (
          <input
            className="contact-input"
            type="tel"
            form={formId}
            value={draft.phone}
            onChange={change('phone')}
            onKeyDown={escapeCancels}
            placeholder="98765 43210"
            aria-label={`Phone number for ${job.title}`}
            autoFocus
          />
        ) : contact.phone ? (
          <>
            {splitList(contact.phone).map((phone) => (
              <a key={phone} className="contact-value" href={`tel:${phone.replace(/[^\d+]/g, '')}`} onClick={(e) => e.stopPropagation()}>
                {phone}
              </a>
            ))}
            <SourceNote source={contact.phoneSource} />
          </>
        ) : (
          <Empty hint="Add phone" />
        )}
      </td>
      <td {...editable} className={`contact-cell contact-col email ${editable ? 'editable' : ''}`}>
        {draft ? (
          <input
            className="contact-input"
            type="text"
            inputMode="email"
            form={formId}
            value={draft.email}
            onChange={change('email')}
            onKeyDown={escapeCancels}
            placeholder="hr@company.com"
            aria-label={`Email ID for ${job.title}`}
          />
        ) : contact.email ? (
          <>
            {splitList(contact.email).map((email) => (
              <a key={email} className="contact-value" href={`mailto:${email}`} onClick={(e) => e.stopPropagation()}>
                {email}
              </a>
            ))}
            <SourceNote source={contact.emailSource} />
          </>
        ) : (
          <Empty hint="Add email" />
        )}
      </td>
      <td {...editable} className={`contact-cell contact-col remarks ${editable ? 'editable' : ''}`}>
        {draft ? (
          <textarea
            className="contact-input"
            form={formId}
            rows={2}
            value={draft.remarks}
            onChange={change('remarks')}
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
          <form
            id={formId}
            className="row-actions"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <button type="submit" className="btn btn-sm btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-sm" onClick={cancel} disabled={saving}>
              Cancel
            </button>
            {error && (
              <p className="form-error" role="alert">
                {error.message}
                {error.detail && <span className="form-error-detail">{error.detail}</span>}
              </p>
            )}
          </form>
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
              onClick={startEditing}
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
