'use client';

import { useEffect, useRef, useState } from 'react';
import { REMARKS, remarkName, type FollowUpOp } from '@/lib/performance';
import type { ContactOutcome, PerformanceRow, RemarkStatus } from '@/lib/types';
import type { SaveState } from '@/lib/useFollowUps';
import { AlertIcon, CheckIcon, CloseIcon } from './Icons';

// The follow-up of one HR number or email: the students it was given to (a number can go to several), and how
// each one's call went, edited in place: each choice saves at once, with no Save button. Used in the
// Performance report (its drill-down and "All contacts") and on the Assign numbers page.

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

// A box to give the number to a student. Picking a suggested name gives it at once; a name typed in full, on
// Enter or on leaving the box. Esc empties it. onAdd's stay: given with Enter or a pick, so the focus is still
// here (not moved away by leaving the box).
function StudentAdd({
  first,
  label,
  listId,
  focus = false,
  onFocused,
  onAdd,
}: {
  first: boolean; // nobody has it yet
  label: string; // the number or email, for screen readers
  listId: string; // the <datalist> of students to suggest
  focus?: boolean; // take the focus when shown
  onFocused?: () => void;
  onAdd: (student: string, stay: boolean) => void;
}) {
  const [text, setText] = useState('');
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focus) return;
    box.current?.focus();
    onFocused?.();
  }, [focus, onFocused]);
  const commit = (raw: string, stay: boolean) => {
    const name = clean(raw);
    setText('');
    if (name) onAdd(name, stay);
  };
  return (
    <input
      ref={box}
      className={`followup-input student-input ${first ? '' : 'another'}`}
      list={listId}
      value={text}
      placeholder={first ? 'Assign a student' : '+ Another student'}
      aria-label={first ? `Give ${label} to a student` : `Give ${label} to another student too`}
      maxLength={60}
      autoComplete="off"
      onChange={(e) => {
        setText(e.target.value);
        // A name picked from the suggestions (not typed letter by letter): given at once.
        const how = (e.nativeEvent as InputEvent).inputType;
        if (!how || how === 'insertReplacementText') commit(e.target.value, true);
      }}
      onBlur={(e) => commit(e.target.value, false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit(e.currentTarget.value, true);
        } else if (e.key === 'Escape') {
          setText('');
        }
      }}
    />
  );
}

// How a call went: one of the remarks, saved as soon as it is picked. "Others" opens a box for their own
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

// Saving… / Saved ✓ / what went wrong, beside a contact's follow-up (where there is little room, the drill-down
// shows saving and saved by their icon alone).
export function SaveMark({ save }: { save?: SaveState }) {
  if (!save) return <span className="save-mark" aria-hidden="true" />;
  if (save.state === 'saving')
    return (
      <span className="save-mark saving" role="status" title="Saving…">
        <span className="spinner small" aria-hidden="true" /> <span className="save-text">Saving…</span>
      </span>
    );
  if (save.state === 'saved')
    return (
      <span className="save-mark saved" role="status" title="Saved">
        <CheckIcon size={12} /> <span className="save-text">Saved</span>
      </span>
    );
  return (
    <span className="save-mark failed" role="alert" title={save.message}>
      <AlertIcon size={12} /> <span className="save-text">{save.message}</span>
    </span>
  );
}

const remarkText = (o: ContactOutcome, field: 'phone' | 'email') =>
  o.status ? (o.status === 'other' ? `Others: ${o.note}` : remarkName(o.status, field)) : '';

// One number's follow-ups in two columns, student and remark: each student it was given to, with the remark on
// their call and a × to take it back; then a box to give it to another student too. Before anyone has it: the
// box, and the number's own remark. readOnly (a role that can't change them): what they say.
export function FollowUps({
  row,
  listId,
  save,
  onChange,
  readOnly = false,
  className = '',
}: {
  row: Pick<PerformanceRow, 'field' | 'value' | 'outcomes'>;
  listId: string;
  save?: SaveState;
  onChange: (op: FollowUpOp) => void;
  readOnly?: boolean;
  className?: string;
}) {
  // After the first student is given it with Enter (or picked), the box for another one takes the focus.
  const [focusNext, setFocusNext] = useState(false);
  const outcomes = row.outcomes ?? [];
  const named = outcomes.filter((o) => o.student);
  const loose = outcomes.find((o) => !o.student);

  if (readOnly) {
    return (
      <div className={`followups ${className}`}>
        {outcomes.length ? (
          outcomes.map((o) => (
            <div className="fu-row" key={o.student.toLowerCase() || '-'}>
              <span className="fu-student">{o.student ? <strong className="fu-text">{o.student}</strong> : <span className="muted">No student</span>}</span>
              <span className="fu-remark">{remarkText(o, row.field) || <span className="muted">—</span>}</span>
            </div>
          ))
        ) : (
          <div className="fu-row">
            <span className="fu-student muted">—</span>
            <span className="fu-remark muted">—</span>
          </div>
        )}
      </div>
    );
  }

  const add = (name: string, stay: boolean) => {
    if (named.some((o) => o.student.toLowerCase() === name.toLowerCase())) return; // has it already
    if (stay && !named.length) setFocusNext(true);
    onChange({ add: name });
  };
  const takeBack = (o: ContactOutcome) => {
    const said = remarkText(o, row.field);
    if (said && !window.confirm(`Take ${row.value} back from ${o.student}? The remark on their call ("${said}") goes with it.`)) return;
    onChange({ remove: o.student });
  };
  const remark = (student: string, o?: ContactOutcome) => (
    <RemarkField
      field={row.field}
      status={o?.status ?? ''}
      note={o?.note ?? ''}
      label={student ? `${row.value}, ${student}'s call` : row.value}
      onSave={(patch) => onChange({ student, ...patch })}
    />
  );

  // The first row keeps its place, and its remark box, when the first student is given the number: a remark
  // picked right after typing their name is theirs.
  const rows = named.length
    ? named.map((o, i) => (
        <div className="fu-row" key={i === 0 ? 'first' : o.student.toLowerCase()}>
          <span className="fu-student">
            <span className="fu-chip">
              <span className="fu-text" title={o.student}>
                {o.student}
              </span>
              <button type="button" className="fu-remove" title={`Take it back from ${o.student}`} aria-label={`Take ${row.value} back from ${o.student}`} onClick={() => takeBack(o)}>
                <CloseIcon size={12} />
              </button>
            </span>
          </span>
          <span className="fu-remark">{remark(o.student, o)}</span>
        </div>
      ))
    : [
        <div className="fu-row" key="first">
          <span className="fu-student">
            <StudentAdd first label={row.value} listId={listId} onAdd={add} />
          </span>
          <span className="fu-remark">
            {remark('', loose)}
            <SaveMark save={save} />
          </span>
        </div>,
      ];

  return (
    <div className={`followups ${className}`}>
      {rows}
      {named.length > 0 && loose && (
        // A remark made before anyone was given it (the first student given it normally takes it over).
        <div className="fu-row" key="loose">
          <span className="fu-student muted">Before it was given out</span>
          <span className="fu-remark">{remark('', loose)}</span>
        </div>
      )}
      {named.length > 0 && (
        <div className="fu-row fu-add" key="add">
          <span className="fu-student">
            <StudentAdd first={false} label={row.value} listId={listId} focus={focusNext} onFocused={() => setFocusNext(false)} onAdd={add} />
          </span>
          <span className="fu-remark">
            <SaveMark save={save} />
          </span>
        </div>
      )}
    </div>
  );
}
