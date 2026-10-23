'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { apiUrl } from '@/lib/api';
import { COURSE_COLORS, formatNumber, LEFT_OUT_LABELS } from '@/lib/format';
import { signInHeader } from '@/lib/session';
import type { Course, Job, SearchCompany, SearchContact, SearchField, SearchResponse } from '@/lib/types';
import CompanyJobs from './CompanyJobs';
import { BuildingIcon, CloseIcon, MailIcon, PhoneIcon, SearchIcon, UserIcon } from './Icons';
import JobDetailsModal from './JobDetailsModal';

// The search box on the dashboard, for quick work: type a company, an HR person's name, a phone number
// (any part, written any way) or an email, and pick a result. A company opens its openings in a side
// panel (with a pill per course); a contact opens its job's details window, where it can be edited.
// Kept and left-out jobs alike (GET search). ↑ ↓ move, Enter opens, Esc closes; "/" jumps here (Ctrl+K is IJF AI's).

const WAIT_MS = 200; // after the last key, before asking the server

const isPhone = (q: string) => /^[\d\s+().-]+$/.test(q);
const digitsOf = (q: string) => q.replace(/\D/g, '');
// As the server reads it (search.js): 3+ digits, or 2+ letters.
const enough = (q: string) => (isPhone(q) ? digitsOf(q).length >= 3 : q.length >= 2);

// The part of a value that matched, marked: digits across spaces and dashes for a number (+91 or 0 in
// front ignored, as the server does), else the words, any case.
function phoneCore(digits: string) {
  if (digits.length === 14 && digits.startsWith('0091')) return digits.slice(4);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}
function Marked({ text, q }: { text: string; q: string }) {
  const pattern = isPhone(q)
    ? phoneCore(digitsOf(q)).split('').join('[\\s().+-]*')
    : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = pattern ? new RegExp(pattern, 'i').exec(text) : null;
  if (!match) return <>{text}</>;
  return (
    <>
      {text.slice(0, match.index)}
      <mark>{match[0]}</mark>
      {text.slice(match.index + match[0].length)}
    </>
  );
}

const FIELD_ICON: Record<SearchField, ReactNode> = {
  phone: <PhoneIcon size={15} />,
  email: <MailIcon size={15} />,
  hrName: <UserIcon size={15} />,
};
const FIELD_NAME: Record<SearchField, string> = { phone: 'Phone', email: 'Email', hrName: 'HR name' };

type Option = { type: 'company'; company: SearchCompany } | { type: 'contact'; hit: SearchContact };

// A company's openings, in a side panel over the page (opened from a search result).
function CompanyPanel({ company, courses, onClose }: { company: SearchCompany; courses: Course[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const total = company.openings + company.leftOut;

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    closeButton.current?.focus();
  }, []);
  const close = () => dialog.current?.close(); // the dialog's close event calls onClose

  return (
    <dialog
      ref={dialog}
      className="drawer company-drawer"
      aria-labelledby={titleId}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose(); // not when a job's details window closes
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close(); // the dimmed page outside the panel
      }}
    >
      <div className="drawer-panel">
        <header className="drawer-header">
          <div className="drawer-heading">
            <p className="eyebrow">Company</p>
            <h2 id={titleId}>{company.name}</h2>
            <p className="drawer-count">
              {formatNumber(total)} {total === 1 ? 'opening' : 'openings'}
              {company.leftOut ? ` · ${formatNumber(company.leftOut)} left out by the filters` : ''}
            </p>
          </div>
          <div className="drawer-actions">
            <button ref={closeButton} type="button" className="icon-btn drawer-close" onClick={close} aria-label="Close" title="Close (Esc)">
              <CloseIcon size={18} />
            </button>
          </div>
        </header>
        <div className="drawer-body">
          <CompanyJobs companyKey={company.key} courses={courses} all label={company.name} />
        </div>
      </div>
    </dialog>
  );
}

export default function GlobalSearch({ courses }: { courses: Course[] }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [company, setCompany] = useState<SearchCompany | null>(null);
  const [detail, setDetail] = useState<Job | null>(null);
  const [saved, setSaved] = useState<Record<string, Job>>({}); // jobs saved since they were found
  const cache = useRef(new Map<string, SearchResponse>());
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-${i}`;
  const courseName = Object.fromEntries(courses.map((c) => [c.id, c.name]));
  const q = text.replace(/\s+/g, ' ').trim();

  // Ask the server a moment after the last key; a newer question cancels the older one.
  useEffect(() => {
    if (!enough(q)) {
      setResult(null);
      setLoading(false);
      setError('');
      return;
    }
    const known = cache.current.get(q);
    if (known) {
      setResult(known);
      setActive(0);
      setLoading(false);
      setError('');
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl('search', { q }), { headers: await signInHeader(), signal: controller.signal });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `Search failed (error ${res.status}).`);
        cache.current.set(q, data);
        setResult(data);
        setActive(0);
        setError('');
      } catch (err) {
        if (controller.signal.aborted) return;
        setError((err as Error).name === 'TypeError' ? 'Could not reach the server. Check your connection and try again.' : (err as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, WAIT_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  // "/" anywhere on the page (not while typing somewhere else, or in a window) jumps here.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest?.('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
      setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // A click outside the box closes the results.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const shown = enough(q) ? result : null; // the last answer stays while the next one loads
  const options: Option[] = shown
    ? [...shown.companies.map((c) => ({ type: 'company' as const, company: c })), ...shown.contacts.map((hit) => ({ type: 'contact' as const, hit }))]
    : [];
  const current = Math.min(active, options.length - 1);

  const choose = (option: Option) => {
    setOpen(false);
    if (option.type === 'company') setCompany(option.company);
    else setDetail(saved[option.hit.job._id] ?? option.hit.job);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (!options.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current < 0 ? 0 : current + step + options.length) % options.length);
    } else if (event.key === 'Enter') {
      if (open && options[current]) {
        event.preventDefault();
        choose(options[current]);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (open && q) setOpen(false);
      else setText('');
    }
  };

  useEffect(() => {
    if (open && current >= 0) document.getElementById(optionId(current))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the highlighted result changes
  }, [current, open]);

  const companies = shown?.companies ?? [];
  const contacts = shown?.contacts ?? [];
  const moreCompanies = shown?.moreCompanies ?? 0;
  const moreContacts = shown?.moreContacts ?? false;
  const expanded = open && Boolean(q);

  const companyOption = (c: SearchCompany, i: number) => {
    const total = c.openings + c.leftOut;
    return (
      <li
        key={`c-${c.key}`}
        id={optionId(i)}
        role="option"
        aria-selected={i === current}
        className="gs-option"
        onPointerDown={(e) => e.preventDefault()} // keeps the focus in the box
        onClick={() => choose({ type: 'company', company: c })}
        onMouseMove={() => i !== current && setActive(i)}
      >
        <span className="gs-icon is-company" aria-hidden="true">
          <BuildingIcon size={15} />
        </span>
        <span className="gs-main">
          <span className="gs-primary">
            <Marked text={c.name} q={q} />
          </span>
          <span className="gs-secondary">
            {formatNumber(total)} {total === 1 ? 'opening' : 'openings'}
            {c.leftOut ? ` · ${formatNumber(c.leftOut)} left out` : ''}
            <span className="gs-courses">
              {courses
                .filter((course) => c.courses[course.id])
                .map((course) => (
                  <span key={course.id} className="gs-course" title={`${course.name}: ${c.courses[course.id]}`}>
                    <span className="dot" style={{ background: COURSE_COLORS[course.id] }} aria-hidden="true" />
                    {course.name} {c.courses[course.id]}
                  </span>
                ))}
            </span>
          </span>
        </span>
        <span className="gs-go" aria-hidden="true">
          See openings
        </span>
      </li>
    );
  };

  const contactOption = (hit: SearchContact, i: number) => {
    const job = saved[hit.job._id] ?? hit.job;
    const field = hit.matches[0].field;
    const hrNames = job.contact.hrNames ?? [];
    return (
      <li
        key={`j-${hit.job._id}`}
        id={optionId(i)}
        role="option"
        aria-selected={i === current}
        className="gs-option"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => choose({ type: 'contact', hit })}
        onMouseMove={() => i !== current && setActive(i)}
      >
        <span className={`gs-icon is-${field}`} aria-hidden="true">
          {FIELD_ICON[field]}
        </span>
        <span className="gs-main">
          <span className="gs-primary">
            {hit.matches.map((m, k) => (
              <span key={`${m.field}-${m.value}`} className="gs-match">
                {k > 0 && <span className="gs-sep" aria-hidden="true" />}
                <span className="sr-only">{FIELD_NAME[m.field]}: </span>
                <Marked text={m.value} q={q} />
              </span>
            ))}
          </span>
          <span className="gs-secondary">
            {field !== 'hrName' && hrNames.length > 0 && <span className="gs-hr">HR: {hrNames.join(', ')} · </span>}
            <span>
              {job.title} at <strong>{job.company || 'company not shown'}</strong>
            </span>
            <span className="gs-course">
              <span className="dot" style={{ background: COURSE_COLORS[job.course] }} aria-hidden="true" />
              {courseName[job.course] ?? job.course}
            </span>
            {hit.set === 'nonfiltered' && <span className="reason-pill">{job.leftOutBy ? LEFT_OUT_LABELS[job.leftOutBy] : 'Left out'}</span>}
          </span>
        </span>
        <span className="gs-go" aria-hidden="true">
          Open job
        </span>
      </li>
    );
  };

  let note: ReactNode = null;
  if (!enough(q)) {
    note = <p className="gs-note">{isPhone(q) ? 'Type at least 3 digits of the number.' : 'Type at least 2 letters.'}</p>;
  } else if (error && !options.length) {
    note = (
      <p className="gs-note is-error" role="alert">
        {error}
      </p>
    );
  } else if (!shown || (!options.length && loading)) {
    note = <p className="gs-note">Searching…</p>;
  } else if (!options.length) {
    note = (
      <p className="gs-note" role="status">
        Nothing matches “{shown.q}”. Try part of a company name, an HR name, a phone number or an email.
      </p>
    );
  }

  return (
    <section className="global-search" aria-label="Search">
      <div ref={box} className={`gs-box ${expanded ? 'is-open' : ''}`}>
        <label className="gs-field">
          <span className="gs-field-icon" aria-hidden="true">
            {loading ? <span className="spinner" /> : <SearchIcon size={18} />}
          </span>
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={expanded && options[current] ? optionId(current) : undefined}
            aria-label="Search a company, HR name, phone number or email"
            placeholder="Company, HR name, phone or email"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {text ? (
            <button
              type="button"
              className="gs-clear"
              onClick={() => {
                setText('');
                input.current?.focus();
              }}
              aria-label="Clear the search"
              title="Clear"
            >
              <CloseIcon size={15} />
            </button>
          ) : (
            <kbd className="gs-kbd" title="Press / to search from anywhere on this page">
              /
            </kbd>
          )}
        </label>
        <div className="gs-pop" hidden={!expanded}>
          {note}
          {/* Grouped like the WAI-ARIA listbox example: each group's name is its first, unselectable item */}
          <div id={listId} role="listbox" aria-label="Search results">
            {companies.length > 0 && (
              <ul role="group" aria-labelledby={`${listId}-companies`} className="gs-list">
                <li role="presentation" className="gs-group" id={`${listId}-companies`}>
                  Companies
                </li>
                {companies.map((c, i) => companyOption(c, i))}
                {moreCompanies > 0 && (
                  <li role="presentation" className="gs-more">
                    +{formatNumber(moreCompanies)} more: type more of the name
                  </li>
                )}
              </ul>
            )}
            {contacts.length > 0 && (
              <ul role="group" aria-labelledby={`${listId}-contacts`} className="gs-list">
                <li role="presentation" className="gs-group" id={`${listId}-contacts`}>
                  {shown?.kind === 'phone' ? 'Phone numbers' : 'HR names and emails'}
                </li>
                {contacts.map((hit, i) => contactOption(hit, companies.length + i))}
                {moreContacts && (
                  <li role="presentation" className="gs-more">
                    The {formatNumber(contacts.length)} most recent jobs: type more to narrow it down
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

      {company && <CompanyPanel company={company} courses={courses} onClose={() => setCompany(null)} />}
      {detail && (
        <JobDetailsModal
          job={saved[detail._id] ?? detail}
          courses={courses}
          saved={saved}
          onClose={() => setDetail(null)}
          onSaved={(job) => {
            setSaved((rows) => ({ ...rows, [job._id]: job }));
            cache.current.clear(); // the next search sees the change
          }}
          onOpenJob={(job) => setDetail(saved[job._id] ?? job)}
        />
      )}
    </section>
  );
}
