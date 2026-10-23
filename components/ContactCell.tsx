'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ApiError, sendJson } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import type { Job } from '@/lib/types';
import { draftFrom, errorFromServer, LISTS, profileLabel, REMARKS_LIMIT, splitList, validateDraft, type FieldKey } from './ContactForm';
import { CheckIcon, CloseIcon, ExternalIcon, LinkIcon, MailIcon, NoteIcon, PencilIcon, PhoneIcon, UserIcon, UsersIcon } from './Icons';

// One HR detail of a job, as a column of the job list: phone numbers, emails, HR names, students, notes,
// HR profile links. It shows what the job has (one value per line, divided; phone numbers and emails can
// be clicked to call or write). Only the pencil beside them opens the editor, a bigger box right there
// (one value per line) with ✓ Save and ✕ Cancel: only ✓ saves; Esc, ✕ or a click outside the cell puts it
// back as it was. The server checks it like the details window does (PUT follow-up).

export interface ContactColumn {
  field: FieldKey;
  label: string;
  add: string;
  icon: ReactNode;
}

// The columns after "Posted", in order. The HR profile column comes last, with Expand's columns.
export const CONTACT_COLUMNS: ContactColumn[] = [
  { field: 'phone', label: 'Phone', add: 'Add phone', icon: <PhoneIcon size={13} /> },
  { field: 'email', label: 'Email', add: 'Add email', icon: <MailIcon size={13} /> },
  { field: 'hrName', label: 'HR name', add: 'Add HR name', icon: <UserIcon size={13} /> },
  { field: 'assignedTo', label: 'Assigned to', add: 'Assign students', icon: <UsersIcon size={13} /> },
  { field: 'remarks', label: 'Notes', add: 'Add a note', icon: <NoteIcon size={13} /> },
];
export const PROFILE_COLUMN: ContactColumn = { field: 'hrProfile', label: 'HR profile', add: 'Add profile link', icon: <LinkIcon size={13} /> };
const columnOf = (field: FieldKey) => (field === 'hrProfile' ? PROFILE_COLUMN : CONTACT_COLUMNS.find((c) => c.field === field)!);

const SHOWN = 3; // values shown before "+2 more"

// What the job has in this field, one value per item.
function valuesOf(job: Job, field: FieldKey): string[] {
  const c = job.contact;
  if (field === 'hrName') return c.hrNames ?? [];
  if (field === 'hrProfile') return c.hrProfiles ?? [];
  if (field === 'phone') return splitList(c.phone);
  if (field === 'email') return splitList(c.email);
  if (field === 'assignedTo') return c.assignedTo;
  return c.remarks ? [c.remarks] : [];
}

// One value as shown: a number to call, an address to write to, a profile to open, or text.
function Value({ field, value }: { field: FieldKey; value: string }) {
  if (field === 'phone')
    return (
      <a href={`tel:${value.replace(/[^\d+]/g, '')}`} title={`Call ${value}`}>
        {value}
      </a>
    );
  if (field === 'email')
    return (
      <a href={`mailto:${value}`} title={`Write to ${value}`}>
        {value}
      </a>
    );
  if (field === 'hrProfile')
    return /^https?:\/\//i.test(value) ? (
      <a href={value} target="_blank" rel="noopener noreferrer" title={value}>
        {profileLabel(value)} <ExternalIcon size={11} />
      </a>
    ) : (
      <span>{value}</span>
    );
  if (field === 'remarks')
    return (
      <span className="cell-note" title={value}>
        {value}
      </span>
    );
  return <span>{value}</span>;
}

interface Props {
  job: Job;
  field: FieldKey;
  mayEdit: boolean;
  editing: boolean;
  onEdit: () => void; // open this cell's editor (closes any other)
  onClose: () => void;
  onSaved: (job: Job) => void;
}

export default function ContactCell({ job, field, mayEdit, editing, onEdit, onClose, onSaved }: Props) {
  const column = columnOf(field);
  const values = valuesOf(job, field);
  const original = field === 'remarks' ? job.contact.remarks : values.join('\n');
  const [text, setText] = useState(original);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const cell = useRef<HTMLTableCellElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const pencil = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  const hintId = useId();

  // Opened: start from what is saved, cursor at the end, the box in view.
  useEffect(() => {
    if (!editing) return;
    setText(original);
    setError(null);
    const el = box.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens
  }, [editing]);

  // A click anywhere outside the cell puts it back as it was (not while saving). Another cell's pencil
  // opens that one instead (closing this one only then, so the other doesn't move from under the pointer).
  useEffect(() => {
    if (!editing) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element;
      if (saving || cell.current?.contains(target) || target.closest?.('.cell-edit')) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [editing, saving, onClose]);

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const cancel = () => {
    if (saving) return;
    onClose();
    requestAnimationFrame(() => pencil.current?.focus());
  };

  const save = async () => {
    if (saving || text === original) return;
    // Everything else as saved, this field as typed (one value per line).
    const draft = draftFrom(job.contact);
    if (field === 'remarks') draft.remarks = text;
    else draft[field] = text.split('\n');
    const problem = validateDraft(draft)[field];
    if (problem) {
      setError({ message: problem.message, detail: problem.detail });
      box.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await sendJson<Job>(`jobs/${job._id}/follow-up`, 'PUT', draft);
      onSaved(saved);
      onClose();
      setJustSaved(true);
      requestAnimationFrame(() => pencil.current?.focus());
    } catch (err) {
      const message = (err as Error).message;
      const detail = err instanceof ApiError ? err.detail : '';
      const forField = errorFromServer(message, detail, draft)[field];
      setError(forField ? { message: forField.message, detail: forField.detail } : { message, detail });
      box.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  const lines = text.split('\n').length;
  const list = field !== 'remarks';
  const fromPost = (field === 'phone' && job.contact.phoneSource === 'posting') || (field === 'email' && job.contact.emailSource === 'posting');
  const visible = showAll ? values : values.slice(0, SHOWN);

  if (editing) {
    return (
      <td ref={cell} className={`hr-col hr-${field} is-editing`}>
        <div className="cell-editor">
          <textarea
            ref={box}
            className="contact-input cell-textarea"
            value={text}
            rows={Math.min(10, Math.max(field === 'remarks' ? 4 : 3, lines + 1))}
            maxLength={field === 'remarks' ? REMARKS_LIMIT + 200 : undefined}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
            placeholder={list ? `${LISTS[field].first}\n…one per line` : 'e.g. Called HR, send CVs by Friday'}
            aria-label={`${column.label} for ${job.title} at ${job.company || 'company not shown'}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
            disabled={saving}
          />
          <p className="cell-hint" id={hintId}>
            {list ? `One per line · up to ${LISTS[field].max}` : `${formatNumber(text.trim().length)} / ${formatNumber(REMARKS_LIMIT)}`}
            {fromPost && ' · from the job post: saving keeps them as typed in'}
          </p>
          {error && (
            <p className="field-error" id={errorId} role="alert">
              {error.message}
              {error.detail && <span className="field-error-detail">{error.detail}</span>}
            </p>
          )}
          <div className="cell-actions">
            <button type="button" className="btn btn-sm" onClick={cancel} disabled={saving}>
              <CloseIcon size={13} /> Cancel
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={saving || text === original}>
              {saving ? <span className="spinner" aria-hidden="true" /> : <CheckIcon size={13} />} Save
            </button>
          </div>
        </div>
      </td>
    );
  }

  return (
    <td ref={cell} className={`hr-col hr-${field} ${justSaved ? 'just-saved' : ''}`}>
      <div className="cell-view">
        {values.length ? (
          <ul className={`cell-values ${field === 'remarks' ? 'is-note' : ''}`} aria-label={`${column.label} for ${job.title}`}>
            {visible.map((value, i) => (
              <li key={`${i}-${value}`}>
                {(field === 'phone' || field === 'email') && <span className="cell-icon">{column.icon}</span>}
                <Value field={field} value={value} />
              </li>
            ))}
            {values.length > SHOWN && (
              <li className="cell-more-row">
                <button type="button" className="cell-more-btn" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                  {showAll ? 'Show less' : `+${values.length - SHOWN} more`}
                </button>
              </li>
            )}
            {fromPost && (
              <li className="cell-from-post">
                <span className="cell-source">from the post</span>
              </li>
            )}
          </ul>
        ) : (
          <span className="cell-empty" aria-label={`No ${column.label.toLowerCase()} yet`}>
            —
          </span>
        )}
        {justSaved && (
          <span className="cell-saved" role="status">
            <CheckIcon size={12} />
            <span className="sr-only">Saved</span>
          </span>
        )}
        {mayEdit && (
          <button
            ref={pencil}
            type="button"
            className="cell-edit"
            onClick={onEdit}
            title={values.length ? `Edit ${column.label.toLowerCase()}` : column.add}
            aria-label={`${values.length ? `Edit ${column.label.toLowerCase()}` : column.add} for ${job.title}`}
          >
            <PencilIcon size={13} />
          </button>
        )}
      </div>
    </td>
  );
}
