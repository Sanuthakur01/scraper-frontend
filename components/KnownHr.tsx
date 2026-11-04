'use client';

import { useState } from 'react';
import { ApiError, sendJson } from '@/lib/api';
import { formatDate, formatNumber, formatPosted } from '@/lib/format';
import type { Job, SameCompany } from '@/lib/types';
import { foundByLabel, profileLabel, splitList } from './ContactForm';
import { ExternalIcon, LinkIcon, MailIcon, PhoneIcon, RepeatIcon, UserIcon } from './Icons';

// What the same company's other jobs say about a job (GET /jobs `sameCompany`; the company however its name is
// spelled, kept and left-out jobs alike): "Hiring again", and the HR contact the team saved on another of its jobs,
// which "Use this HR" copies to this one (POST /jobs/:id/copy-hr). A copied number is not a new contact in the
// Performance report, and it may be on several of the company's jobs (never on another company's).

// The company had jobs first found on earlier days.
export function HiringAgain({ same }: { same?: SameCompany }) {
  if (!same?.earlier) return null;
  const what = `${formatNumber(same.earlier)} earlier ${same.earlier === 1 ? 'job' : 'jobs'} from this company${same.firstAt ? `, the first found ${formatDate(same.firstAt)}` : ''}`;
  return (
    <span className="again-pill" title={what}>
      <RepeatIcon size={11} /> Hiring again
      <span className="sr-only">: {what}</span>
    </span>
  );
}

const COMPACT_SHOWN = 3; // values shown in the job list's cell before "+2 more"

interface Props {
  job: Job;
  mayEdit: boolean; // the signed-in person's role may edit HR details
  onSaved: (job: Job) => void;
  compact?: boolean; // in the job list's HR contact cell (else the details window)
}

// On a job without HR contact typed in: the one saved on another of the company's jobs, and "Use this HR".
export function KnownHr({ job, mayEdit, onSaved, compact = false }: Props) {
  const hr = job.sameCompany?.hr;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [all, setAll] = useState(false);
  if (!hr) return null;

  const values = [
    ...hr.hrNames.map((value) => ({ kind: 'name', value })),
    ...splitList(hr.phone).map((value) => ({ kind: 'phone', value })),
    ...splitList(hr.email).map((value) => ({ kind: 'email', value })),
    ...hr.hrProfiles.filter((url) => /^https?:\/\//i.test(url)).map((value) => ({ kind: 'profile', value })),
  ];
  const shown = compact && !all ? values.slice(0, COMPACT_SHOWN) : values;
  const source = foundByLabel(hr.foundBy) || hr.foundBy;

  const use = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      onSaved(await sendJson<Job>(`jobs/${job._id}/copy-hr`, 'POST', { from: hr.id }));
    } catch (err) {
      setError([(err as Error).message, err instanceof ApiError ? err.detail : ''].filter(Boolean).join(' '));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`known-hr ${compact ? 'is-compact' : ''}`}>
      <p className="known-hr-title">HR known from this company</p>
      <ul className="known-hr-values" aria-label={`HR contact saved on another ${job.company ?? ''} job`}>
        {shown.map(({ kind, value }) => (
          <li key={`${kind}-${value}`}>
            {kind === 'name' && (
              <>
                <UserIcon size={12} />
                <span className="known-hr-name">{value}</span>
              </>
            )}
            {kind === 'phone' && (
              <>
                <PhoneIcon size={12} />
                <a href={`tel:${value.replace(/[^\d+]/g, '')}`} title={`Call ${value}`}>
                  {value}
                </a>
              </>
            )}
            {kind === 'email' && (
              <>
                <MailIcon size={12} />
                <a href={`mailto:${value}`} title={`Write to ${value}`}>
                  {value}
                </a>
              </>
            )}
            {kind === 'profile' && (
              <>
                <LinkIcon size={12} />
                <a href={value} target="_blank" rel="noopener noreferrer" title={value}>
                  {profileLabel(value)} <ExternalIcon size={11} />
                </a>
              </>
            )}
          </li>
        ))}
        {compact && values.length > COMPACT_SHOWN && (
          <li>
            <button type="button" className="cell-more-btn" onClick={() => setAll((v) => !v)} aria-expanded={all}>
              {all ? 'Show less' : `+${values.length - COMPACT_SHOWN} more`}
            </button>
          </li>
        )}
      </ul>
      <p className="known-hr-from">
        Saved on &ldquo;{hr.title}&rdquo; · found {formatPosted(hr.firstSeenAt)}
        {source ? ` · ${source}` : ''}
      </p>
      {mayEdit && (
        <button type="button" className="btn btn-sm btn-known" onClick={use} disabled={busy} title="Copy this HR contact to this job">
          {busy ? <span className="spinner" aria-hidden="true" /> : <RepeatIcon size={13} />}
          {busy ? 'Copying…' : 'Use this HR'}
          <span className="sr-only"> for {job.title}</span>
        </button>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
