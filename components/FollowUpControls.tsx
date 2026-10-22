'use client';

import { useEffect, useRef, useState } from 'react';
import { REMARKS, remarkName } from '@/lib/performance';
import type { ContactOutcome, RemarkStatus } from '@/lib/types';
import { AlertIcon, CheckIcon } from './Icons';

// The follow-up of one HR number or email in the performance report (who it was given to, how it went),
// edited in place: each choice saves at once, with no Save button. Used in the drill-down and the
// "All contacts" list.

export type SaveState = { state: 'saving' | 'saved' | 'error'; message?: string };
export type OutcomePatch = { student: string } | { status: RemarkStatus | ''; note?: string };

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

// Who it was given to. Picking a suggested name saves it straight away; a name typed in full saves on
// Enter or on leaving the box. Esc puts the saved name back.
export function StudentField({
  value,
  label,
  listId,
  onSave,
}: {
  value: string;
  label: string; // the number or email, for screen readers
  listId: string; // the <datalist> of students to suggest
  onSave: (student: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = (raw: string) => {
    const next = clean(raw);
    if (next !== value) onSave(next);
    setText(next);
  };
  return (
    <input
      className={`followup-input student-input ${value ? 'has-value' : ''}`}
      list={listId}
      value={text}
      placeholder="Assign a student"
      aria-label={`Student for ${label}`}
      maxLength={60}
      autoComplete="off"
      onChange={(e) => {
        setText(e.target.value);
        // A name picked from the suggestions (not typed letter by letter): saved at once.
        const how = (e.nativeEvent as InputEvent).inputType;
        if (!how || how === 'insertReplacementText') commit(e.target.value);
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit(e.currentTarget.value);
        } else if (e.key === 'Escape') {
          setText(value);
        }
      }}
    />
  );
}

// How it went: one of the remarks, saved as soon as it is picked. "Others" opens a box for their own
// words, saved on Enter or on leaving it (empty: back to the remark before).
export function RemarkField({
  field,
  status,
  note,
  label,
  onSave,
}: {
  field: 'phone' | 'email';
  status: RemarkStatus | '';
  note: string;
  label: string;
  onSave: (patch: { status: RemarkStatus | ''; note?: string }) => void;
}) {
  const [writing, setWriting] = useState(false); // "Others" picked, words not saved yet
  const [text, setText] = useState(note);
  const noteBox = useRef<HTMLInputElement>(null);
  useEffect(() => setText(note), [note]);
  useEffect(() => {
    if (writing) noteBox.current?.focus();
  }, [writing]);

  const shown = writing ? 'other' : status;
  const tone = REMARKS.find((r) => r.id === shown)?.tone ?? 'none';
  const commitNote = (raw: string) => {
    const words = clean(raw);
    setWriting(false);
    if (!words) {
      setText(note); // nothing typed: the remark stays as it was
      return;
    }
    if (status !== 'other' || words !== note) onSave({ status: 'other', note: words });
  };

  return (
    <span className="remark-field">
      <select
        className={`remark-select tone-${tone}`}
        value={shown}
        aria-label={`Remark for ${label}`}
        onChange={(e) => {
          const next = e.target.value as RemarkStatus | '';
          if (next === 'other') {
            setText(status === 'other' ? note : '');
            setWriting(true);
            return;
          }
          setWriting(false);
          onSave({ status: next });
        }}
      >
        <option value="">{status ? 'No remark' : 'Add remark…'}</option>
        {REMARKS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.id === 'other' ? (shown === 'other' ? 'Others' : 'Others…') : remarkName(r.id, field)}
          </option>
        ))}
      </select>
      {(writing || status === 'other') && (
        <input
          ref={noteBox}
          className="followup-input remark-note"
          value={text}
          placeholder="What happened? Enter to save"
          aria-label={`Others: what happened with ${label}`}
          maxLength={300}
          title={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commitNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              setText(note);
              setWriting(false);
            }
          }}
        />
      )}
    </span>
  );
}

// Saving… / Saved ✓ / what went wrong, beside a contact's follow-up.
export function SaveMark({ save }: { save?: SaveState }) {
  if (!save) return <span className="save-mark" aria-hidden="true" />;
  if (save.state === 'saving')
    return (
      <span className="save-mark saving" role="status">
        <span className="spinner small" aria-hidden="true" /> Saving…
      </span>
    );
  if (save.state === 'saved')
    return (
      <span className="save-mark saved" role="status">
        <CheckIcon size={12} /> Saved
      </span>
    );
  return (
    <span className="save-mark failed" role="alert" title={save.message}>
      <AlertIcon size={12} /> {save.message}
    </span>
  );
}

// What a follow-up says, for someone whose role can't change it.
export function OutcomeText({ outcome, field }: { outcome: ContactOutcome | null; field: 'phone' | 'email' }) {
  if (!outcome) return <span className="muted">—</span>;
  const remark = outcome.status ? (outcome.status === 'other' ? `Others: ${outcome.note}` : remarkName(outcome.status, field)) : '';
  return (
    <span>
      {outcome.student || '—'}
      {remark && <span className="muted"> · {remark}</span>}
    </span>
  );
}
