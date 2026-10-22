'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, sendJson } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import type { Job } from '@/lib/types';
import { draftFrom, errorFromServer, LISTS, profileLabel, REMARKS_LIMIT, splitList, validateDraft, type FieldKey } from './ContactForm';
import { CheckIcon, CloseIcon, PlusIcon } from './Icons';

// One HR detail of a job, as a column of the job list: HR names, profile links, phone numbers, emails,
// students or notes. It looks like an input box showing what the job has; clicking it opens a bigger box
// right there (one value per line) with ✓ Save and ✕ Cancel. Only ✓ saves; Esc, ✕ or a click outside
// the cell puts it back as it was. The server checks it like the details window does (PUT follow-up).

export const CONTACT_COLUMNS: { field: FieldKey; label: string; add: string }[] = [
  { field: 'hrName', label: 'HR name', add: 'Add HR name' },
  { field: 'hrProfile', label: 'HR profile', add: 'Add profile link' },
  { field: 'phone', label: 'Phone', add: 'Add phone' },
  { field: 'email', label: 'Email', add: 'Add email' },
  { field: 'assignedTo', label: 'Assigned to', add: 'Assign students' },
  { field: 'remarks', label: 'Notes', add: 'Add a note' },
];

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

const shown = (field: FieldKey, value: string) => (field === 'hrProfile' ? profileLabel(value) : field === 'remarks' ? value.split('\n')[0] : value);

interface Props {
  job: Job;
  field: FieldKey;
  mayEdit: boolean;
  editing: boolean;
  onEdit: () => void; // open this cell (closes any other)
  onClose: () => void;
  onSaved: (job: Job) => void;
}

export default function ContactCell({ job, field, mayEdit, editing, onEdit, onClose, onSaved }: Props) {
  const column = CONTACT_COLUMNS.find((c) => c.field === field)!;
  const values = valuesOf(job, field);
  const original = field === 'remarks' ? job.contact.remarks : values.join('\n');
  const [text, setText] = useState(original);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const cell = useRef<HTMLTableCellElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
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

  // A click anywhere outside the cell puts it back as it was (not while saving). A click on another HR
  // cell opens that one instead (closing this one only then: closing it on the press would shrink this
  // cell, so the other would move away from under the pointer before the click).
  useEffect(() => {
    if (!editing) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element;
      if (saving || cell.current?.contains(target) || target.closest?.('.cell-box')) return;
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
    requestAnimationFrame(() => opener.current?.focus());
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
      requestAnimationFrame(() => opener.current?.focus());
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

  if (!mayEdit) {
    return (
      <td className={`hr-col hr-${field}`}>
        {values.length ? <span className="cell-text" title={values.join('\n')}>{values.map((v) => shown(field, v)).join(', ')}</span> : <span className="muted">—</span>}
      </td>
    );
  }

  return (
    <td ref={cell} className={`hr-col hr-${field} ${editing ? 'is-editing' : ''}`}>
      {editing ? (
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
      ) : (
        <button
          ref={opener}
          type="button"
          className={`cell-box ${values.length ? 'has-value' : 'empty'} ${justSaved ? 'just-saved' : ''}`}
          onClick={onEdit}
          title={values.length ? `${values.join('\n')}\n\nClick to edit` : column.add}
          aria-label={`${column.label} for ${job.title}: ${values.length ? values.join(', ') : 'none'}. Edit`}
        >
          {values.length ? (
            <>
              <span className="cell-value">{shown(field, values[0])}</span>
              {values.length > 1 && <span className="cell-more">+{values.length - 1}</span>}
              {fromPost && <span className="cell-source">post</span>}
            </>
          ) : (
            <span className="cell-placeholder">
              <PlusIcon size={12} /> {column.add}
            </span>
          )}
          {justSaved && (
            <span className="cell-saved" role="status">
              <CheckIcon size={12} />
              <span className="sr-only">Saved</span>
            </span>
          )}
        </button>
      )}
    </td>
  );
}
