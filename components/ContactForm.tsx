import { useId } from 'react';
import { MAX_CONTACT_ENTRIES, MAX_STUDENTS, type FollowUpInput, type JobContact } from '@/lib/types';
import { CloseIcon, MailIcon, NoteIcon, PhoneIcon, PlusIcon, UsersIcon } from './Icons';

// The HR details the team types in for a job (phone numbers, emails, the students it is assigned to and
// notes), as edited in the job's details window. The server checks everything again
// (server/src/api/followUp.js); the checks here follow its rules, so a mistake is shown next to the
// right box straight away.

export type ListKey = 'phone' | 'email' | 'assignedTo';
export type FieldKey = ListKey | 'remarks';
export const FIELD_ORDER: FieldKey[] = ['phone', 'email', 'assignedTo', 'remarks'];

export const PHONE_EXISTS = 'This number already exists.'; // the server's PHONE_EXISTS
export const REMARKS_LIMIT = 1000;
const NAME_LIMIT = 60;
const EMAIL_LIMIT = 120;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

// How each list of boxes is labelled, and how many boxes it may have.
export const LISTS: Record<
  ListKey,
  { label: string; name: string; first: string; other: string; add: string; max: number; type: 'tel' | 'text'; mode: 'tel' | 'email' | 'text' }
> = {
  phone: { label: 'Phone numbers', name: 'Phone number', first: '98765 43210', other: 'Another number', add: 'Add another number', max: MAX_CONTACT_ENTRIES, type: 'tel', mode: 'tel' },
  email: { label: 'Email addresses', name: 'Email ID', first: 'hr@company.com', other: 'Another email', add: 'Add another email', max: MAX_CONTACT_ENTRIES, type: 'text', mode: 'email' },
  assignedTo: { label: 'Assigned to', name: 'Student', first: 'Student name', other: 'Another student', add: 'Add another student', max: MAX_STUDENTS, type: 'text', mode: 'text' },
};

// "98765 43210, 080 4123 4567" -> ["98765 43210", "080 4123 4567"]
export const splitList = (value: string) => value.split(/\s*,\s*/).filter(Boolean);

const boxesFor = (values: string[]) => (values.length ? [...values] : ['']);

// A job's saved details as editable boxes: one per value, or one empty box.
export const draftFrom = (contact: JobContact): FollowUpInput => ({
  phone: boxesFor(splitList(contact.phone)),
  email: boxesFor(splitList(contact.email)),
  assignedTo: boxesFor(contact.assignedTo),
  remarks: contact.remarks,
});

const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const cleanRemarks = (value: string) => value.replace(/\r\n?/g, '\n').trim();

// Whether two drafts would save the same thing (empty boxes and extra spaces don't count).
const normalized = (draft: FollowUpInput) =>
  JSON.stringify({
    phone: draft.phone.map(clean).filter(Boolean),
    email: draft.email.map(clean).filter(Boolean),
    assignedTo: draft.assignedTo.map(clean).filter(Boolean),
    remarks: cleanRemarks(draft.remarks),
  });
export const sameDraft = (a: FollowUpInput, b: FollowUpInput) => normalized(a) === normalized(b);

// A field's problem: the message, sometimes a second line, and which box (if one is to blame).
export interface FieldError {
  message: string;
  detail?: string;
  index?: number;
}
export type FieldErrors = Partial<Record<FieldKey, FieldError>>;

const quote = (text: string) => `"${text.length > 40 ? `${text.slice(0, 40)}…` : text}"`;
const unique = (values: string[], key: (v: string) => string) => new Set(values.map(key)).size;

// Checks a draft the way the server will. Returns the first problem of each field (none: {}).
export function validateDraft(draft: FollowUpInput): FieldErrors {
  const errors: FieldErrors = {};
  const digits = (p: string) => p.replace(/\D/g, '').length;

  const phones: string[] = [];
  draft.phone.forEach((box, index) => {
    for (const part of box.split(/[,;/]/).map(clean).filter(Boolean)) {
      if (!errors.phone && (!/^\+?[\d\s().-]+$/.test(part) || digits(part) < 7 || digits(part) > 15)) {
        errors.phone = { message: `${quote(part)} is not a phone number. Enter it like 98765 43210.`, index };
      }
      phones.push(part);
    }
  });
  if (!errors.phone && unique(phones, (p) => p.replace(/\D/g, '').slice(-10)) > MAX_CONTACT_ENTRIES) {
    errors.phone = { message: `At most ${MAX_CONTACT_ENTRIES} numbers per job.` };
  }

  const emails: string[] = [];
  draft.email.forEach((box, index) => {
    for (const part of box.split(/[,;]/).map(clean).filter(Boolean)) {
      const addresses = part.split(' ').every((e) => EMAIL.test(e)) ? part.split(' ') : [part];
      for (const address of addresses) {
        if (!errors.email && (!EMAIL.test(address) || address.length > EMAIL_LIMIT)) {
          errors.email = { message: `${quote(address)} is not an email address. Enter it like hr@company.com.`, index };
        }
        emails.push(address);
      }
    }
  });
  if (!errors.email && unique(emails, (e) => e.toLowerCase()) > MAX_CONTACT_ENTRIES) {
    errors.email = { message: `At most ${MAX_CONTACT_ENTRIES} addresses per job.` };
  }

  const names: string[] = [];
  draft.assignedTo.forEach((box, index) => {
    for (const name of box.split(/[,;\n]/).map(clean).filter(Boolean)) {
      if (!errors.assignedTo && name.length > NAME_LIMIT) {
        errors.assignedTo = { message: `${quote(name)} is too long for a name (at most ${NAME_LIMIT} characters).`, index };
      }
      names.push(name);
    }
  });
  if (!errors.assignedTo && unique(names, (n) => n.toLowerCase()) > MAX_STUDENTS) {
    errors.assignedTo = { message: `At most ${MAX_STUDENTS} students per job.` };
  }

  if (cleanRemarks(draft.remarks).length > REMARKS_LIMIT) {
    errors.remarks = { message: `Notes are too long (at most ${formatLimit(REMARKS_LIMIT)} characters).` };
  }
  return errors;
}

const formatLimit = (n: number) => n.toLocaleString('en-IN');

// A refusal from the server, put next to the field it is about ({} when it is about none, e.g. the
// network). "Phone: "12345" is not a phone number…" -> the phone box holding 12345.
export function errorFromServer(message: string, detail: string, draft: FollowUpInput): FieldErrors {
  const boxWith = (key: ListKey, text?: string) => {
    if (!text) return undefined;
    const index = draft[key].findIndex((box) => box.includes(text.replace(/…$/, '')));
    return index >= 0 ? index : undefined;
  };
  if (message === PHONE_EXISTS) {
    return { phone: { message, detail, index: boxWith('phone', detail.split(' is already')[0]) } };
  }
  const quoted = message.match(/"([^"]+)"/)?.[1];
  const prefixes: [string, FieldKey][] = [
    ['Phone:', 'phone'],
    ['Email:', 'email'],
    ['Assign to:', 'assignedTo'],
    ['Remarks', 'remarks'],
  ];
  for (const [prefix, key] of prefixes) {
    if (!message.startsWith(prefix)) continue;
    const text = key === 'remarks' ? message.replace(/^Remarks/, 'Notes') : message.slice(prefix.length).trim();
    return { [key]: { message: text, detail, index: key === 'remarks' ? undefined : boxWith(key, quoted) } };
  }
  return {};
}

// The boxes for a job's phone numbers, emails or assigned students: one per value, × to remove one,
// and "+ Add another" below (up to the list's max). A problem shows under the boxes and marks its box.
export function EntryList({
  kind,
  values,
  jobTitle,
  error,
  labelledBy,
  onChange,
  onAdd,
}: {
  kind: ListKey;
  values: string[];
  jobTitle: string;
  error?: FieldError;
  labelledBy: string;
  onChange: (values: string[]) => void;
  onAdd: () => void;
}) {
  const list = LISTS[kind];
  const errorId = useId();
  return (
    <div className="entry-list" role="group" aria-labelledby={labelledBy}>
      {values.map((value, i) => {
        const invalid = Boolean(error) && (error?.index === undefined || error.index === i);
        return (
          <div className="entry" key={i}>
            <input
              className="contact-input"
              data-entry={`${kind}-${i}`}
              type={list.type}
              inputMode={list.mode}
              autoComplete="off"
              value={value}
              onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
              placeholder={i === 0 ? list.first : list.other}
              aria-label={`${list.name}${i > 0 ? ` ${i + 1}` : ''} for ${jobTitle}`}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
            />
            {values.length > 1 && (
              <button
                type="button"
                className="entry-remove"
                onClick={() => onChange(values.filter((_, j) => j !== i))}
                aria-label={`Remove ${list.name.toLowerCase()} ${i + 1}`}
                title="Remove"
              >
                <CloseIcon size={13} />
              </button>
            )}
          </div>
        );
      })}
      {error && (
        <p className="field-error" id={errorId} role="alert">
          {error.message}
          {error.detail && <span className="field-error-detail">{error.detail}</span>}
        </p>
      )}
      {values.length < list.max && (
        <button type="button" className="entry-add" onClick={onAdd}>
          <PlusIcon size={13} /> {list.add}
        </button>
      )}
    </div>
  );
}

// What a job's HR details hold, in numbers: "2 phone numbers, 1 email, 3 students, a note".
export function contactSummary(contact: JobContact) {
  const counts = {
    phones: splitList(contact.phone).length,
    emails: splitList(contact.email).length,
    students: contact.assignedTo.length,
    note: Boolean(contact.remarks),
  };
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    counts.phones && plural(counts.phones, 'phone number', 'phone numbers'),
    counts.emails && plural(counts.emails, 'email', 'emails'),
    counts.students && plural(counts.students, 'student', 'students'),
    counts.note && 'a note',
  ].filter(Boolean) as string[];
  return { ...counts, any: parts.length > 0, text: parts.join(', ') };
}

// The same as small icons with counts (job list rows, other openings). Nothing when there are none.
export function ContactIcons({ contact }: { contact: JobContact }) {
  const c = contactSummary(contact);
  if (!c.any) return null;
  return (
    <span className="contact-icons" title={c.text}>
      {c.phones > 0 && (
        <span>
          <PhoneIcon size={12} /> {c.phones}
        </span>
      )}
      {c.emails > 0 && (
        <span>
          <MailIcon size={12} /> {c.emails}
        </span>
      )}
      {c.students > 0 && (
        <span>
          <UsersIcon size={12} /> {c.students}
        </span>
      )}
      {c.note && (
        <span>
          <NoteIcon size={12} />
        </span>
      )}
    </span>
  );
}
