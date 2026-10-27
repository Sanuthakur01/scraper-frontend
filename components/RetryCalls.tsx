'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useApi } from '@/lib/api';
import { addDays, COURSE_COLORS, formatDate, formatNumber, formatTime, istDayOf } from '@/lib/format';
import { contactsText, REMARKS, remarkName } from '@/lib/performance';
import { retryCalls } from '@/lib/review';
import type { Course, RemarkStatus, ReviewResponse, ReviewRow } from '@/lib/types';
import type { Opening } from './ContactList';
import { CheckIcon, CopyIcon, MailIcon, PhoneIcon } from './Icons';
import { copyText, CopyButton } from './JobDetailsModal';

const SHOWN = 5; // calls listed before "Show all"
const RETRY: RemarkStatus[] = ['dnp', 'busy', 'switched-off'];

// "Yesterday's unanswered calls", above the Assign numbers list: the calls made yesterday that ended in DNP, Busy
// or Switched off, with nothing recorded on the number since (lib/review.ts retryCalls), to try again today: they
// may pick up now. Only yesterday's (IST), whatever period the list below shows. Each with its job (opens it), the
// student whose call it was, the remark and when; a copy button per number and one for all of them (the numbers
// and emails alone, separated by commas). The remark chips narrow the list (and what is copied).
export default function RetryCalls({
  courses,
  opening,
  onOpenJob,
}: {
  courses: Course[];
  opening: Opening | null;
  onOpenJob: (id: string, job: ReviewRow['job']) => void;
}) {
  const today = istDayOf(new Date().toISOString());
  const yesterday = addDays(today, -1);
  // Yesterday and today: a call tried again today is left out.
  const review = useApi<ReviewResponse>('review', { from: yesterday, to: today }, { auth: true });
  const [remark, setRemark] = useState<RemarkStatus | ''>('');
  const [all, setAll] = useState(false);
  const [copied, setCopied] = useState<{ count: number; failed: boolean } | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  const calls = useMemo(() => retryCalls(review.data?.rows ?? [], yesterday), [review.data, yesterday]);

  const day = formatDate(`${yesterday}T12:00:00+05:30`);
  if (review.error) {
    return (
      <section className="card retry-card is-quiet" aria-label="Yesterday's unanswered calls">
        <span className="muted">Could not load yesterday&apos;s unanswered calls: {review.error.message}</span>
        <button type="button" className="btn btn-sm" onClick={review.reload}>
          Try again
        </button>
      </section>
    );
  }
  if (!review.data) {
    return (
      <section className="card retry-card is-quiet" aria-busy="true" aria-label="Loading yesterday's unanswered calls">
        <span className="skeleton retry-skeleton" />
      </section>
    );
  }
  if (!calls.length) {
    return (
      <section className="card retry-card is-quiet" aria-label="Yesterday's unanswered calls">
        <CheckIcon size={14} />
        <span>
          <strong>No unanswered calls from yesterday.</strong> <span className="muted">No call on {day} is left with DNP, Busy or Switched off.</span>
        </span>
      </section>
    );
  }

  const count = (id: RemarkStatus) => calls.filter((row) => row.feedback!.status === id).length;
  const shown = remark ? calls.filter((row) => row.feedback!.status === remark) : calls;
  const listed = all ? shown : shown.slice(0, SHOWN);
  const contacts = contactsText(shown);
  const contactsWord = (n: number) => `${formatNumber(n)} ${n === 1 ? 'contact' : 'contacts'}`;
  const copyAll = async (from: HTMLElement) => setCopied({ count: contacts.count, failed: !(await copyText(contacts.text, from)) });

  return (
    <section className="card retry-card" aria-labelledby="retry-title">
      <div className="retry-head">
        <span className="retry-icon" aria-hidden="true">
          <PhoneIcon size={16} />
        </span>
        <div className="retry-titles">
          <h2 id="retry-title">
            Yesterday&apos;s unanswered calls <span className="count-badge">{formatNumber(calls.length)}</span>
          </h2>
          <p>
            Called yesterday ({day}) and ended in DNP, Busy or Switched off, with nothing new on the number since. Try them again today: they may pick
            up now.
          </p>
        </div>
        <button type="button" className={`btn btn-sm retry-copy ${copied && !copied.failed ? 'is-done' : ''}`} onClick={(e) => copyAll(e.currentTarget)}>
          {copied && !copied.failed ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          {copied && !copied.failed ? `Copied ${contactsWord(copied.count)}` : `Copy ${contactsWord(contacts.count)}`}
        </button>
        <span className="sr-only" role="status">
          {copied ? (copied.failed ? 'Could not copy: the browser blocked it.' : `Copied ${contactsWord(copied.count)}, separated by commas.`) : ''}
        </span>
      </div>
      <div className="filter-chips retry-chips" role="group" aria-label="Show calls">
        <button type="button" className="filter-chip" aria-pressed={!remark} onClick={() => setRemark('')}>
          All <span className="chip-count">{formatNumber(calls.length)}</span>
        </button>
        {RETRY.filter((id) => count(id) > 0).map((id) => (
          <button key={id} type="button" className="filter-chip" aria-pressed={remark === id} onClick={() => setRemark(remark === id ? '' : id)}>
            {REMARKS.find((r) => r.id === id)?.label} <span className="chip-count">{formatNumber(count(id))}</span>
          </button>
        ))}
      </div>
      <ul className="retry-list">
        {listed.map((row) => {
          const course = courses.find((c) => c.id === row.job.course);
          return (
            <li key={row.id} className="retry-item">
              <span className="retry-contact">
                <span className={`perf-kind ${row.field}`}>
                  {row.field === 'phone' ? <PhoneIcon size={13} /> : <MailIcon size={13} />}
                  <span className="sr-only">{row.field === 'phone' ? 'Phone' : 'Email'}</span>
                </span>
                <span className="perf-value">{row.value}</span>
                <CopyButton value={row.value} what={row.field === 'phone' ? 'phone number' : 'email'} />
              </span>
              <span className="retry-job">
                <button type="button" className="ci-job-open" onClick={() => onOpenJob(row.id, row.job)} aria-haspopup="dialog" title="Open this job">
                  <strong>{row.job.company || 'Company not shown'}</strong>
                  <span>
                    {row.job.title}
                    {course && (
                      <span className="retry-course" style={{ '--course': COURSE_COLORS[course.id] } as CSSProperties}>
                        <span className="dot" aria-hidden="true" />
                        {course.name}
                      </span>
                    )}
                  </span>
                </button>
                {opening?.id === row.id && opening.problem && (
                  <span className="field-error" role="status">
                    {opening.problem}
                  </span>
                )}
              </span>
              <span className="retry-who">{row.student ? <strong>{row.student}</strong> : <span className="muted">No student</span>}</span>
              <span className="retry-remark">
                <span className="remark-chip tone-warn">{remarkName(row.feedback!.status, row.field)}</span>
                <time className="muted" dateTime={row.feedback!.at}>
                  {formatTime(row.feedback!.at)}
                </time>
              </span>
            </li>
          );
        })}
      </ul>
      {shown.length > SHOWN && (
        <button type="button" className="btn-link retry-more" onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `Show all ${formatNumber(shown.length)}`}
        </button>
      )}
    </section>
  );
}
