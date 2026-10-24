'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ApiError, sendJson } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { usePressAction } from '@/lib/pressAction';
import type { Job } from '@/lib/types';
import { draftFrom, errorFromServer, LISTS, profileLabel, REMARKS_LIMIT, splitList, validateDraft, type FieldError, type FieldKey } from './ContactForm';
import { CheckIcon, CloseIcon, ExternalIcon, LinkIcon, MailIcon, NoteIcon, PencilIcon, PhoneIcon, UserIcon, UsersIcon } from './Icons';

// One column of the job list's HR details. "HR contact" holds three fields (HR names, phone numbers,
// emails) so the list fits the window; the others hold one (students, notes, HR profile links). It shows
// what the job has, one value per line (phone numbers and emails can be clicked to call or write). Only
// the pencil beside them opens the editor, right there: a box per field (one value per line) with ✓ Save
// and ✕ Cancel. Only ✓ (or Ctrl+Enter) saves, on the press itself (usePressAction), so one click always
// does it; Esc, ✕ or a click outside the cell puts it back as it was.
// The server checks it like the details window does (PUT follow-up).

export interface ContactColumn {
  key: string;
  label: string;
  fields: FieldKey[];
  add: string;
  icon: ReactNode;
}

// The HR columns after "Posted", in order.
export const CONTACT_COLUMNS: ContactColumn[] = [
  { key: 'contact', label: 'HR contact', fields: ['hrName', 'phone', 'email'], add: 'Add HR contact', icon: <PhoneIcon size={13} /> },
  { key: 'assignedTo', label: 'Assigned to', fields: ['assignedTo'], add: 'Assign students', icon: <UsersIcon size={13} /> },
];

// Expand adds these after its own columns. Notes are here (and in the details window), not in the
// list as it opens, so the list fits the window without scrolling sideways.
export const EXTRA_COLUMNS: ContactColumn[] = [
  { key: 'remarks', label: 'Notes', fields: ['remarks'], add: 'Add a note', icon: <NoteIcon size={13} /> },
  { key: 'hrProfile', label: 'HR profile', fields: ['hrProfile'], add: 'Add profile link', icon: <LinkIcon size={13} /> },
];

// A field's name and icon, over its box in the editor and beside its values in "HR contact".
const FIELD: Record<FieldKey, { label: string; icon: ReactNode }> = {
  hrName: { label: 'HR name', icon: <UserIcon size={13} /> },
  phone: { label: 'Phone', icon: <PhoneIcon size={13} /> },
  email: { label: 'Email', icon: <MailIcon size={13} /> },
  assignedTo: { label: 'Students', icon: <UsersIcon size={13} /> },
  remarks: { label: 'Notes', icon: <NoteIcon size={13} /> },
  hrProfile: { label: 'HR profile', icon: <LinkIcon size={13} /> },
};

// What the job has in a field, one value per item.
function valuesOf(job: Job, field: FieldKey): string[] {
  const c = job.contact;
  if (field === 'hrName') return c.hrNames ?? [];
  if (field === 'hrProfile') return c.hrProfiles ?? [];
  if (field === 'phone') return splitList(c.phone);
  if (field === 'email') return splitList(c.email);
  if (field === 'assignedTo') return c.assignedTo;
  return c.remarks ? [c.remarks] : [];
}

// A field as its editor box holds it: one value per line (notes as written).
const textOf = (job: Job, field: FieldKey) => (field === 'remarks' ? job.contact.remarks : valuesOf(job, field).join('\n'));

// The problems that belong to this column's fields.
function onlyFields(errors: Partial<Record<FieldKey, FieldError>>, fields: FieldKey[]) {
  const mine: Partial<Record<FieldKey, FieldError>> = {};
  for (const field of fields) if (errors[field]) mine[field] = errors[field];
  return mine;
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
  return <span className={field === 'hrName' ? 'cell-name' : undefined}>{value}</span>;
}

interface Props {
  job: Job;
  column: ContactColumn;
  mayEdit: boolean;
  editing: boolean;
  onEdit: () => void; // open this cell's editor (closes any other)
  onClose: () => void;
  onSaved: (job: Job) => void;
}

export default function ContactCell({ job, column, mayEdit, editing, onEdit, onClose, onSaved }: Props) {
  const { fields } = column;
  const grouped = fields.length > 1;
  const originals = Object.fromEntries(fields.map((field) => [field, textOf(job, field)])) as Record<FieldKey, string>;
  const [texts, setTexts] = useState(originals);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, FieldError>>>({});
  const [failure, setFailure] = useState<FieldError | null>(null); // a refusal that isn't about one of these fields
  const [saving, setSaving] = useState(false);
  const savingNow = useRef(false); // set at once (state shows on the next render): never two saves at a time
  const [justSaved, setJustSaved] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const cell = useRef<HTMLTableCellElement>(null);
  const boxes = useRef<Partial<Record<FieldKey, HTMLTextAreaElement | null>>>({});
  const pencil = useRef<HTMLButtonElement>(null);
  const baseId = useId();

  const changed = fields.some((field) => texts[field] !== originals[field]);
  const focusBox = (field: FieldKey | undefined) => {
    const el = field && boxes.current[field];
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  };

  // Opened: start from what is saved, cursor at the end of the first box, the editor in view.
  useEffect(() => {
    if (!editing) return;
    setTexts(originals);
    setErrors({});
    setFailure(null);
    focusBox(fields[0]);
    boxes.current[fields[0]]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
    if (savingNow.current || !changed) return;
    // Everything else as saved, these fields as typed (one value per line).
    const draft = draftFrom(job.contact);
    for (const field of fields) {
      if (field === 'remarks') draft.remarks = texts.remarks;
      else draft[field] = texts[field].split('\n');
    }
    const problems = onlyFields(validateDraft(draft), fields);
    if (Object.keys(problems).length) {
      setErrors(problems);
      setFailure(null);
      focusBox(fields.find((field) => problems[field]));
      return;
    }
    savingNow.current = true;
    setSaving(true);
    setErrors({});
    setFailure(null);
    try {
      const saved = await sendJson<Job>(`jobs/${job._id}/follow-up`, 'PUT', draft);
      onSaved(saved);
      onClose();
      setJustSaved(true);
      requestAnimationFrame(() => pencil.current?.focus());
    } catch (err) {
      const message = (err as Error).message;
      const detail = err instanceof ApiError ? err.detail : '';
      const forFields = onlyFields(errorFromServer(message, detail, draft), fields);
      if (Object.keys(forFields).length) {
        setErrors(forFields);
        focusBox(fields.find((field) => forFields[field]));
      } else {
        setFailure({ message, detail });
        focusBox(fields[0]);
      }
    } finally {
      savingNow.current = false;
      setSaving(false);
    }
  };
  const savePress = usePressAction(save);

  const fromPost = (field: FieldKey) =>
    (field === 'phone' && job.contact.phoneSource === 'posting') || (field === 'email' && job.contact.emailSource === 'posting');
  const anyFromPost = fields.some(fromPost);
  const company = job.company || 'company not shown';

  if (editing) {
    return (
      <td ref={cell} className={`hr-col hr-${column.key} is-editing`} data-label={column.label}>
        <div className="cell-editor">
          {fields.map((field) => {
            const id = `${baseId}-${field}`;
            const error = errors[field];
            const lines = texts[field].split('\n').length;
            const list = field !== 'remarks';
            return (
              <div className="cell-field" key={field}>
                {grouped && (
                  <label className="cell-field-label" htmlFor={id}>
                    {FIELD[field].icon}
                    {FIELD[field].label}
                  </label>
                )}
                <textarea
                  id={id}
                  ref={(el) => {
                    boxes.current[field] = el;
                  }}
                  className="contact-input cell-textarea"
                  value={texts[field]}
                  rows={Math.min(10, Math.max(field === 'remarks' ? 4 : grouped ? 1 : 3, lines + (grouped ? 0 : 1)))}
                  maxLength={field === 'remarks' ? REMARKS_LIMIT + 200 : undefined}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTexts((t) => ({ ...t, [field]: value }));
                    setErrors((errs) => ({ ...errs, [field]: undefined }));
                    setFailure(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancel();
                    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      save();
                    }
                  }}
                  placeholder={list ? `${LISTS[field].first}${grouped ? '' : '\n…one per line'}` : 'e.g. Called HR, send CVs by Friday'}
                  aria-label={`${FIELD[field].label} for ${job.title} at ${company}`}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : `${baseId}-hint`}
                  disabled={saving}
                />
                {error && (
                  <p className="field-error" id={`${id}-error`} role="alert">
                    {error.message}
                    {error.detail && <span className="field-error-detail">{error.detail}</span>}
                  </p>
                )}
              </div>
            );
          })}
          <p className="cell-hint" id={`${baseId}-hint`}>
            {fields.includes('remarks')
              ? `${formatNumber(texts.remarks.trim().length)} / ${formatNumber(REMARKS_LIMIT)}`
              : `One per line · up to ${LISTS[fields[0] as Exclude<FieldKey, 'remarks'>].max} each`}
            {anyFromPost && ' · from the job post: saving keeps them as typed in'}
          </p>
          {failure && (
            <p className="field-error" role="alert">
              {failure.message}
              {failure.detail && <span className="field-error-detail">{failure.detail}</span>}
            </p>
          )}
          <div className="cell-actions">
            <button type="button" className="btn btn-sm" onClick={cancel} disabled={saving}>
              <CloseIcon size={13} /> Cancel
            </button>
            <button type="button" className="btn btn-sm btn-primary" {...savePress} disabled={saving || !changed} title="Save (Ctrl+Enter)">
              {saving ? <span className="spinner" aria-hidden="true" /> : <CheckIcon size={13} />} {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </td>
    );
  }

  const entries = fields.flatMap((field) => valuesOf(job, field).map((value) => ({ field, value })));
  const shownCount = grouped ? 4 : 3; // values shown before "+2 more"
  const visible = showAll ? entries : entries.slice(0, shownCount);
  const action = entries.length ? `Edit ${column.label.toLowerCase()}` : column.add;

  return (
    <td ref={cell} className={`hr-col hr-${column.key} ${justSaved ? 'just-saved' : ''}`} data-label={column.label}>
      <div className="cell-view">
        {entries.length ? (
          <ul className={`cell-values ${fields.includes('remarks') ? 'is-note' : ''}`} aria-label={`${column.label} for ${job.title}`}>
            {visible.map(({ field, value }, i) => (
              <li key={`${field}-${i}-${value}`}>
                {(grouped || field === 'phone' || field === 'email') && (
                  <span className="cell-icon" aria-label={FIELD[field].label} role="img">
                    {FIELD[field].icon}
                  </span>
                )}
                <Value field={field} value={value} />
              </li>
            ))}
            {entries.length > shownCount && (
              <li className="cell-more-row">
                <button type="button" className="cell-more-btn" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                  {showAll ? 'Show less' : `+${entries.length - shownCount} more`}
                </button>
              </li>
            )}
            {anyFromPost && (
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
          <button ref={pencil} type="button" className="cell-edit" onClick={onEdit} title={action} aria-label={`${action} for ${job.title}`}>
            <PencilIcon size={13} />
          </button>
        )}
      </div>
    </td>
  );
}
