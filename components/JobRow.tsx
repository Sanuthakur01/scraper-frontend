import { useEffect, useState, type KeyboardEvent } from 'react';
import { ApiError, sendJson } from '@/lib/api';
import { COURSE_COLORS, formatDateTime, formatExperience, formatPosted, PLACEMENT_STATUSES, statusLabel } from '@/lib/format';
import type { ContactSource, FollowUpInput, Job } from '@/lib/types';

// Every platform the job is listed on, the one it is counted under first.
const listingOrder = (job: Job) =>
  [job.primaryPlatform, ...job.platforms.filter((p) => p !== job.primaryPlatform)].filter((p) => job.links[p]);

const splitList = (value: string) => value.split(/\s*,\s*/).filter(Boolean);

function SourceNote({ source }: { source: ContactSource }) {
  return source === 'posting' ? <span className="contact-source">from the job post</span> : null;
}

interface Props {
  job: Job;
  courseName: string;
  onSaved: (job: Job) => void;
}

// One job in the postings table. The team's follow-up (HR phone, email, remarks; placement status,
// students, number placed) is typed in with one Edit and saved to the database with one Submit.
export default function JobRow({ job, courseName, onSaved }: Props) {
  const { contact, placement } = job;
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
    setDraft({
      phone: contact.phone,
      email: contact.email,
      remarks: contact.remarks,
      status: placement.status,
      students: placement.students,
      placedCount: placement.placedCount || 1,
    });
    setError(null);
    setJustSaved(false);
  };
  const cancel = () => {
    setDraft(null);
    setError(null);
  };
  const change = (key: keyof FollowUpInput) => (event: { target: { value: string } }) =>
    setDraft((d) => (d ? { ...d, [key]: key === 'placedCount' ? Number(event.target.value) : event.target.value } : d));
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

  const hasDetails = Boolean(contact.phone || contact.email || contact.remarks || placement.status || placement.students);

  return (
    <tr className={draft ? 'is-editing' : undefined}>
      <td className="nowrap muted">{formatPosted(job.postedAt ?? job.firstSeenAt)}</td>
      <td>
        <span className="job-title">{job.title}</span>
        <span className="job-course">
          <span className="swatch" style={{ background: COURSE_COLORS[job.course] }} aria-hidden="true" />
          {courseName}
        </span>
      </td>
      <td>{job.company || '—'}</td>
      <td>{job.cities?.length ? job.cities.join(', ') : '—'}</td>
      <td className="nowrap">{formatExperience(job)}</td>
      <td>
        <ul className="listings">
          {listingOrder(job).map((platform) => (
            <li key={platform}>
              <a href={job.links[platform]} target="_blank" rel="noopener noreferrer">
                {platform}
              </a>
            </li>
          ))}
        </ul>
      </td>

      <td className="contact-cell">
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
              <a key={phone} className="contact-value" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
                {phone}
              </a>
            ))}
            <SourceNote source={contact.phoneSource} />
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="contact-cell email">
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
              <a key={email} className="contact-value" href={`mailto:${email}`}>
                {email}
              </a>
            ))}
            <SourceNote source={contact.emailSource} />
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="contact-cell remarks">
        {draft ? (
          <textarea
            className="contact-input"
            form={formId}
            rows={2}
            value={draft.remarks}
            onChange={change('remarks')}
            onKeyDown={escapeCancels}
            placeholder="e.g. Called HR, send CVs by Friday"
            aria-label={`Remarks for ${job.title}`}
          />
        ) : (
          contact.remarks || <span className="muted">—</span>
        )}
      </td>
      <td className="placement-cell">
        {draft ? (
          <div className="placement-edit">
            <select
              className="contact-input"
              form={formId}
              value={draft.status}
              onChange={change('status')}
              onKeyDown={escapeCancels}
              aria-label={`Placement status for ${job.title}`}
            >
              <option value="">Not started</option>
              {PLACEMENT_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <input
              className="contact-input"
              type="text"
              form={formId}
              value={draft.students}
              onChange={change('students')}
              onKeyDown={escapeCancels}
              placeholder="Students, e.g. Asha, Ravi"
              aria-label={`Students for ${job.title}`}
            />
            {draft.status === 'placed' && (
              <label className="placed-count">
                Placed
                <input
                  className="contact-input"
                  type="number"
                  min={1}
                  max={50}
                  form={formId}
                  value={draft.placedCount}
                  onChange={change('placedCount')}
                  onKeyDown={escapeCancels}
                />
              </label>
            )}
          </div>
        ) : placement.status ? (
          <>
            <span className={`status-badge status-${placement.status}`}>{statusLabel(placement.status)}</span>
            {placement.status === 'placed' && <span className="contact-source">{placement.placedCount} placed</span>}
            {placement.students && <span className="placement-students">{placement.students}</span>}
          </>
        ) : (
          <span className="muted">—</span>
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
            <button type="submit" className="small-button primary" disabled={saving}>
              {saving ? 'Saving…' : 'Submit'}
            </button>
            <button type="button" className="small-button" onClick={cancel} disabled={saving}>
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
            <button
              type="button"
              className="small-button"
              onClick={startEditing}
              title={contact.updatedAt ? `Last saved ${formatDateTime(contact.updatedAt)}` : undefined}
              aria-label={`${hasDetails ? 'Edit' : 'Add'} HR contact and placement for ${job.title}`}
            >
              {hasDetails ? 'Edit' : 'Add'}
            </button>
            {justSaved && (
              <span className="saved-note" role="status">
                Saved
              </span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
