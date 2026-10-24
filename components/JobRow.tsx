import { useState } from 'react';
import { COURSE_COLORS, formatDate, formatExperience, formatPosted, LEFT_OUT_LABELS, listingOrder } from '@/lib/format';
import type { Job } from '@/lib/types';
import ContactCell, { CONTACT_COLUMNS, EXTRA_COLUMNS, type ContactColumn } from './ContactCell';
import { contactSummary, ContactIcons } from './ContactForm';
import { ExternalIcon } from './Icons';

const SKILLS_SHOWN = 3;

// A job's skills (Expand): the first few and "+7"; clicking them shows every skill as a tag, and
// "Show less" folds them again.
function Skills({ skills, jobTitle }: { skills: string[]; jobTitle: string }) {
  const [open, setOpen] = useState(false);
  if (!skills.length) return <span className="muted">—</span>;
  const more = skills.length - SKILLS_SHOWN;
  if (more <= 0) return <>{skills.join(', ')}</>;
  if (!open) {
    return (
      <button
        type="button"
        className="skills-toggle"
        onClick={() => setOpen(true)}
        aria-expanded="false"
        aria-label={`Show all ${skills.length} skills for ${jobTitle}`}
        title="Show all skills"
      >
        {skills.slice(0, SKILLS_SHOWN).join(', ')} <span className="skills-more">+{more}</span>
      </button>
    );
  }
  return (
    <div className="skills-all">
      <ul className="skill-tags" aria-label={`Skills for ${jobTitle}`}>
        {skills.map((skill) => (
          <li key={skill}>{skill}</li>
        ))}
      </ul>
      <button type="button" className="btn-link skills-less" onClick={() => setOpen(false)} aria-expanded="true">
        Show less
      </button>
    </div>
  );
}

interface Props {
  job: Job;
  courseName?: string; // shown under the title when the list has several courses
  expanded: boolean; // also show salary, skills, work mode, when we found it, notes and HR profile links
  onOpen: (job: Job) => void; // the company name was clicked: open the job's details window
  mayEdit: boolean; // the signed-in person's role may edit HR details
  editing: string | null; // the key of the HR column being edited in this row, if any
  onEdit: (column: string | null) => void; // open one of this row's HR cells (null: close it)
  onSaved: (job: Job) => void;
}

// One job in the job list: what the job is, then its HR details in columns that are edited right
// there (ContactCell). The company name opens the job's details window with everything about it; small
// icons under the name say which HR details the job already has. On phones each row is a card, and
// data-label names each cell.
export default function JobRow({ job, courseName, expanded, onOpen, mayEdit, editing, onEdit, onSaved }: Props) {
  const summary = contactSummary(job.contact);
  const company = job.company || 'Company not shown';
  const cell = (column: ContactColumn) => (
    <ContactCell
      key={column.key}
      job={job}
      column={column}
      mayEdit={mayEdit}
      editing={editing === column.key}
      onEdit={() => onEdit(column.key)}
      onClose={() => onEdit(null)}
      onSaved={onSaved}
    />
  );

  return (
    <tr>
      <td className="job-cell">
        <span className="job-title">{job.title}</span>
        <span className="job-sub">
          {courseName && (
            <span className="job-course">
              <span className="dot" style={{ background: COURSE_COLORS[job.course] }} aria-hidden="true" />
              {courseName}
              <span aria-hidden="true"> · </span>
            </span>
          )}
          <button
            type="button"
            className="company-link"
            onClick={() => onOpen(job)}
            aria-haspopup="dialog"
            title="Open: HR contact, students, notes and job details"
          >
            {company}
          </button>
          {job.cities?.length ? ` · ${job.cities.join(', ')}` : ''}
        </span>
        {(job.leftOutBy || summary.any) && (
          <span className="job-tags">
            {job.leftOutBy && <span className="reason-pill">{LEFT_OUT_LABELS[job.leftOutBy]}</span>}
            {summary.any && (
              <button
                type="button"
                className="contact-icons-btn"
                onClick={() => onOpen(job)}
                aria-haspopup="dialog"
                aria-label={`${summary.text}. Open ${company}`}
              >
                <ContactIcons contact={job.contact} />
              </button>
            )}
          </span>
        )}
      </td>
      <td className="nowrap" data-label="Experience">
        {formatExperience(job)}
      </td>
      <td data-label="Found on">
        <ul className="listings">
          {listingOrder(job).map((platform) => (
            <li key={platform}>
              <a className="site-chip" href={job.links[platform]} target="_blank" rel="noopener noreferrer" title={`Open on ${platform}`}>
                {platform}
                <ExternalIcon size={12} />
              </a>
            </li>
          ))}
        </ul>
      </td>
      <td className="nowrap muted" data-label="Posted">
        {formatPosted(job.postedAt ?? job.firstSeenAt)}
      </td>

      {CONTACT_COLUMNS.map(cell)}

      {expanded && (
        <>
          <td className="extra-cell" data-label="Salary">
            {job.salaryText || <span className="muted">Not shown</span>}
          </td>
          <td className="extra-cell skills-cell" data-label="Skills">
            <Skills skills={job.skills ?? []} jobTitle={job.title} />
          </td>
          <td className="nowrap" data-label="Work mode">
            {job.isRemote ? 'Remote' : 'On-site'}
          </td>
          <td className="nowrap muted" data-label="Found by us">
            {formatDate(job.firstSeenAt)}
          </td>
          {EXTRA_COLUMNS.map(cell)}
        </>
      )}
    </tr>
  );
}
