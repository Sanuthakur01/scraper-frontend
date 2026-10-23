'use client';

import { useState, type CSSProperties } from 'react';
import { useApi } from '@/lib/api';
import { COURSE_COLORS, formatExperience, formatNumber, formatPosted, LEFT_OUT_LABELS, listingOrder } from '@/lib/format';
import type { CompanyJobsResponse, Course, CourseId, Job } from '@/lib/types';
import { contactSummary, ContactIcons } from './ContactForm';
import { ExternalIcon } from './Icons';
import JobDetailsModal from './JobDetailsModal';

// One company's openings (every spelling of its name), with course pills on top to see one course's
// postings: "All · 12", "Data Analyst · 5", … A job opens its details window (HR details, students,
// notes), where they can be edited as in the job list. Used under a hiring partner's row, and in the
// company panel the search box opens.

interface Props {
  companyKey: string;
  courses: Course[];
  days?: number; // only jobs found in the last N days (Hiring partners); without it, every stored job
  all?: boolean; // kept and left-out jobs together (the search box); else the dashboard's view
  label: string; // the company's name, for screen readers
}

export default function CompanyJobs({ companyKey, courses, days, all = false, label }: Props) {
  const state = useApi<CompanyJobsResponse>('companies/jobs', { key: companyKey, days, all: all ? 1 : undefined }, { auth: true });
  const [course, setCourse] = useState<CourseId | 'all'>('all');
  // Jobs saved in their details window since this list loaded, and the job whose window is open.
  const [saved, setSaved] = useState<Record<string, Job>>({});
  const [detail, setDetail] = useState<Job | null>(null);

  if (state.error) return <p className="company-jobs-empty">Could not load the openings: {state.error.message}</p>;
  if (!state.data)
    return (
      <div className="company-jobs-loading" aria-busy="true" aria-label={`Loading the openings of ${label}`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="skeleton" />
        ))}
      </div>
    );

  const data = state.data;
  const items = data.items.map((job) => saved[job._id] ?? job);
  const counts = new Map<CourseId, number>();
  for (const job of items) counts.set(job.course, (counts.get(job.course) ?? 0) + 1);
  const withJobs = courses.filter((c) => counts.get(c.id));
  // A course with no openings here (e.g. after the view changed) shows them all.
  const picked = course !== 'all' && counts.get(course) ? course : 'all';
  const shown = picked === 'all' ? items : items.filter((job) => job.course === picked);
  const courseName = Object.fromEntries(courses.map((c) => [c.id, c.name]));

  if (!items.length) return <p className="company-jobs-empty">No openings from {label} in this view.</p>;

  return (
    <div className="company-jobs">
      <div className="course-pills" role="group" aria-label={`Show the openings of ${label} for`}>
        <button type="button" className="course-pill" aria-pressed={picked === 'all'} onClick={() => setCourse('all')}>
          All courses <span className="course-pill-count">{formatNumber(items.length)}</span>
        </button>
        {withJobs.map((c) => (
          <button
            key={c.id}
            type="button"
            className="course-pill"
            aria-pressed={picked === c.id}
            onClick={() => setCourse(c.id)}
            style={{ '--course': COURSE_COLORS[c.id] } as CSSProperties}
          >
            <span className="dot" aria-hidden="true" />
            {c.name} <span className="course-pill-count">{formatNumber(counts.get(c.id) ?? 0)}</span>
          </button>
        ))}
      </div>

      <div className="table-wrap company-jobs-wrap">
        <table className="data-table company-jobs-table">
          <thead>
            <tr>
              <th scope="col">Job</th>
              <th scope="col">Course</th>
              <th scope="col">Experience</th>
              <th scope="col">Posted</th>
              <th scope="col">Found on</th>
              <th scope="col">HR details</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((job) => {
              const summary = contactSummary(job.contact);
              return (
                <tr key={job._id}>
                  <td className="job-cell">
                    <button type="button" className="company-job-open" onClick={() => setDetail(job)} aria-haspopup="dialog" title="Open: HR details, students, notes and job details">
                      {job.title}
                    </button>
                    <span className="job-sub">
                      {job.company || 'Company not shown'}
                      {job.cities?.length ? ` · ${job.cities.join(', ')}` : ''}
                    </span>
                    {job.leftOutBy && <span className="reason-pill">{LEFT_OUT_LABELS[job.leftOutBy]}</span>}
                  </td>
                  <td className="nowrap">
                    <span className="job-course">
                      <span className="dot" style={{ background: COURSE_COLORS[job.course] }} aria-hidden="true" />
                      {courseName[job.course] ?? job.course}
                    </span>
                  </td>
                  <td className="nowrap">{formatExperience(job)}</td>
                  <td className="nowrap muted">{formatPosted(job.postedAt ?? job.firstSeenAt)}</td>
                  <td>
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
                  <td>
                    {summary.any ? (
                      <button type="button" className="contact-icons-btn" onClick={() => setDetail(job)} aria-haspopup="dialog" aria-label={`${summary.text}. Open ${job.title}`}>
                        <ContactIcons contact={job.contact} />
                      </button>
                    ) : (
                      <span className="muted">None yet</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.total > data.items.length && (
        <p className="company-jobs-note">
          Showing the newest {formatNumber(data.items.length)} of {formatNumber(data.total)} openings.
        </p>
      )}

      {detail && (
        <JobDetailsModal
          job={saved[detail._id] ?? detail}
          courses={courses}
          saved={saved}
          onClose={() => setDetail(null)}
          onSaved={(job) => setSaved((rows) => ({ ...rows, [job._id]: job }))}
          onOpenJob={(job) => setDetail(saved[job._id] ?? job)}
        />
      )}
    </div>
  );
}
