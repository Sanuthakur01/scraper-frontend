'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { apiUrl } from '@/lib/api';
import { COURSE_COLORS, formatDateTime, formatNumber, formatUpdated } from '@/lib/format';
import { contactsText, outcomeKey } from '@/lib/performance';
import { signInHeader } from '@/lib/session';
import type { Course, Job, JobsResponse, PerformanceRow } from '@/lib/types';
import { CheckIcon, CloseIcon, CopyIcon, MailIcon, PhoneIcon } from './Icons';
import JobDetailsModal, { copyText, CopyButton } from './JobDetailsModal';

// A job being opened from a row (id: the row's), or why it couldn't be.
export interface Opening {
  id: string;
  problem: string;
}

// Opens a number's job (in the set it was in) in the job's window, if it is still stored. onSaved: something was
// saved in the window (the page's numbers may change).
export function useJobWindow(courses: Course[] | undefined, onSaved: () => void) {
  const [detail, setDetail] = useState<Job | null>(null);
  const [saved, setSaved] = useState<Record<string, Job>>({});
  const [opening, setOpening] = useState<Opening | null>(null);

  const openJob = async (id: string, ref: PerformanceRow['job']) => {
    setOpening({ id, problem: '' });
    try {
      const params = { id: ref.id, days: 1, view: ref.set === 'nonfiltered' ? 'nonfiltered' : undefined };
      const res = await fetch(apiUrl('jobs', params), { headers: await signInHeader() });
      const body = (await res.json().catch(() => null)) as JobsResponse | null;
      const job = body?.items?.[0];
      if (!res.ok || !job) {
        setOpening({ id, problem: 'This job is no longer stored (jobs are kept for 90 days after they were last seen).' });
        return;
      }
      setOpening(null);
      setDetail(saved[job._id] ?? job);
    } catch {
      setOpening({ id, problem: 'Could not reach the server. Check your connection and try again.' });
    }
  };

  const modal =
    detail && courses ? (
      <JobDetailsModal
        job={saved[detail._id] ?? detail}
        courses={courses}
        saved={saved}
        onClose={() => setDetail(null)}
        onSaved={(job) => {
          setSaved((jobs) => ({ ...jobs, [job._id]: job }));
          onSaved();
        }}
        onOpenJob={(job) => setDetail(saved[job._id] ?? job)}
      />
    ) : null;

  return { opening, openJob, modal };
}

// A tick box; mixed: some of what it stands for are ticked (the header's "all shown").
function TickBox({ checked, mixed = false, label, onTick }: { checked: boolean; mixed?: boolean; label: string; onTick: (range: boolean) => void }) {
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (box.current) box.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={box}
      type="checkbox"
      className="ci-check"
      checked={checked}
      aria-label={label}
      onChange={() => {}} // the click does it, to know about Shift
      onClick={(e) => onTick(e.shiftKey)}
    />
  );
}

// HR numbers and emails as rows of a grid (stacked on phones): the number or email (with a copy button), its
// company and job (opens the job), who added it and when, and its follow-ups (students and remarks, in the last
// two columns). Used by the Performance report's "All contacts" and the Assign numbers page. With `selected` and
// `onSelect`, each row has a tick box (Shift-click ticks every row between it and the one clicked before) and
// the header's ticks all the rows shown.
export default function ContactList({
  rows,
  courses,
  opening,
  onOpenJob,
  followUps,
  selected,
  onSelect,
}: {
  rows: PerformanceRow[];
  courses: Course[];
  opening: Opening | null;
  onOpenJob: (id: string, job: PerformanceRow['job']) => void;
  followUps: (row: PerformanceRow) => ReactNode; // spans "Assigned to" and "Remark"
  selected?: Set<string>; // outcomeKey of the rows ticked
  onSelect?: (keys: string[], on: boolean) => void;
}) {
  const lastClicked = useRef<number | null>(null);
  const selectable = Boolean(selected && onSelect);
  const keys = rows.map(outcomeKey);
  const ticked = selected ? keys.filter((k) => selected.has(k)).length : 0;
  const tick = (i: number, on: boolean, range: boolean) => {
    const from = range && lastClicked.current != null ? Math.min(lastClicked.current, i) : i;
    const to = range && lastClicked.current != null ? Math.max(lastClicked.current, i) : i;
    onSelect?.(keys.slice(from, to + 1), on);
    lastClicked.current = i;
  };
  return (
    <ul className={`contact-list ${selectable ? 'selectable' : ''}`}>
      <li className="contact-item contact-head" aria-hidden={selectable ? undefined : true}>
        <span className="ci-contact">
          {selectable && (
            <TickBox
              checked={keys.length > 0 && ticked === keys.length}
              mixed={ticked > 0 && ticked < keys.length}
              label={`Select all ${formatNumber(keys.length)} shown`}
              onTick={() => onSelect?.(keys, ticked !== keys.length)}
            />
          )}
          <span aria-hidden="true">Number / email</span>
        </span>
        <span aria-hidden="true">Company and job</span>
        <span aria-hidden="true">Added</span>
        <span aria-hidden="true">Assigned to</span>
        <span aria-hidden="true">Remark</span>
      </li>
      {rows.map((row, i) => {
        const key = keys[i];
        const course = courses.find((c) => c.id === row.job.course);
        const on = Boolean(selected?.has(key));
        return (
          <li key={key} className={`contact-item ${on ? 'is-selected' : ''}`}>
            <span className="ci-contact">
              {selectable && <TickBox checked={on} label={`Select ${row.value}`} onTick={(range) => tick(i, !on, range)} />}
              <span className={`perf-kind ${row.field}`}>
                {row.field === 'phone' ? <PhoneIcon size={13} /> : <MailIcon size={13} />}
                <span className="sr-only">{row.field === 'phone' ? 'Phone' : 'Email'}</span>
              </span>
              <span className="perf-value">{row.value}</span>
              <CopyButton value={row.value} what={row.field === 'phone' ? 'phone number' : 'email'} />
            </span>
            <span className="ci-job">
              <button type="button" className="ci-job-open" onClick={() => onOpenJob(key, row.job)} aria-haspopup="dialog" title="Open this job">
                <strong>{row.job.company || 'Company not shown'}</strong>
                <span>{row.job.title}</span>
              </button>
              <span className="ci-tags">
                {course && (
                  <span className="ci-course">
                    <span className="dot" style={{ background: COURSE_COLORS[course.id] }} aria-hidden="true" />
                    {course.name}
                  </span>
                )}
                {row.job.set === 'nonfiltered' && <span className="badge-muted">Non-filtered</span>}
              </span>
              {opening?.id === key && opening.problem && (
                <span className="field-error" role="status">
                  {opening.problem}
                </span>
              )}
            </span>
            <span className="ci-added muted">
              by {row.actor.name || row.actor.email}
              <br />
              <time dateTime={row.at} title={formatDateTime(row.at)}>
                {formatUpdated(row.at)}
              </time>
            </span>
            {followUps(row)}
          </li>
        );
      })}
    </ul>
  );
}

// While numbers are ticked: a bar at the bottom of the screen saying how many, with buttons to copy them (the
// numbers and emails alone, each once, separated by commas), to tick every one in the list (`total`: the ones not
// shown yet too) and to untick them all.
export function SelectionBar({ picked, total, onAll, onClear }: { picked: PerformanceRow[]; total: number; onAll: () => void; onClear: () => void }) {
  // What the last copy did, and for which ticks (ticking another one makes it out of date).
  const [copied, setCopied] = useState<{ count: number; repeats: number; failed: boolean; ticks: string } | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 4000);
    return () => clearTimeout(timer);
  }, [copied]);
  if (!picked.length) return null;

  const ticks = picked.map(outcomeKey).join(',');
  const result = copied?.ticks === ticks ? copied : null;
  const phones = picked.filter((row) => row.field === 'phone').length;
  const emails = picked.length - phones;
  const contacts = contactsText(picked);
  const what = (n: number) => `${formatNumber(n)} ${n === 1 ? 'contact' : 'contacts'}`;
  const copy = async (from: HTMLElement) => {
    const ok = await copyText(contacts.text, from);
    setCopied({ count: contacts.count, repeats: contacts.repeats, failed: !ok, ticks });
  };
  const done = result && !result.failed;

  return (
    <div className="selection-bar" role="region" aria-label="Ticked numbers and emails">
      <span className="selection-count" aria-live="polite">
        <strong>{formatNumber(picked.length)} selected</strong>
        <span className="muted">
          {[phones && `${formatNumber(phones)} ${phones === 1 ? 'phone' : 'phones'}`, emails && `${formatNumber(emails)} ${emails === 1 ? 'email' : 'emails'}`]
            .filter(Boolean)
            .join(', ')}
        </span>
      </span>
      {picked.length < total && (
        <button type="button" className="btn btn-sm" onClick={onAll}>
          Select all {formatNumber(total)}
        </button>
      )}
      <button type="button" className={`btn btn-sm btn-primary selection-copy ${done ? 'is-done' : ''}`} onClick={(e) => copy(e.currentTarget)}>
        {done ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        {done ? `Copied ${what(result.count)}` : `Copy ${what(contacts.count)}`}
      </button>
      <button type="button" className="icon-btn selection-clear" onClick={onClear} aria-label="Untick all" title="Untick all">
        <CloseIcon size={14} />
      </button>
      <span className={`selection-note ${result?.failed ? 'failed' : ''}`} role="status">
        {result?.failed
          ? 'Could not copy: the browser blocked it. Try again.'
          : result
            ? `Copied, separated by commas${result.repeats ? ` (${formatNumber(result.repeats)} ${result.repeats === 1 ? 'repeat' : 'repeats'} left out)` : ''}.`
            : ''}
      </span>
    </div>
  );
}
