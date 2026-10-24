import { useEffect, useId, useRef, useState } from 'react';
import { useApi, useApiUrl } from '@/lib/api';
import { COURSE_COLORS, formatExperience, formatNumber, formatPosted, LEFT_OUT_LABELS, listingOrder, periodParams, type Period } from '@/lib/format';
import type { JobFilters } from '@/lib/jobFilters';
import type { Course, Job, JobsResponse } from '@/lib/types';
import { CloseIcon, DownloadIcon, ExternalIcon, MailIcon, PhoneIcon, UserIcon, UsersIcon } from './Icons';
import JobDetailsModal from './JobDetailsModal';
import { SectionError } from './PageParts';

// What was clicked on the dashboard: a heading for the panel, and the job list filters behind it.
export interface JobsView {
  title: string;
  filters: Partial<JobFilters>;
}

const PAGE_SIZE = 20;

function Panel({ view, period, courses, onClose }: { view: JobsView; period: Period; courses: Course[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [page, setPage] = useState(1);
  const apiUrl = useApiUrl();
  const params = { ...view.filters, ...periodParams(period) };
  const jobs = useApi<JobsResponse>('jobs', { ...params, page, limit: PAGE_SIZE });
  const data = jobs.data;
  const courseName = Object.fromEntries(courses.map((c) => [c.id, c.name]));
  // Jobs whose HR details were saved in their details window since this list loaded, and the job whose
  // details window is open (a company name was clicked).
  const [saved, setSaved] = useState<Record<string, Job>>({});
  const [detail, setDetail] = useState<Job | null>(null);

  // A modal dialog: the page behind can't be clicked or tabbed to, Esc closes it, focus starts on
  // Close, and goes back to the bar that opened it afterwards.
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    closeButton.current?.focus();
  }, []);
  // A block body: newer browsers' scrollTo returns a promise, which React would take for a cleanup.
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [page]);

  const close = () => dialog.current?.close(); // the dialog's close event calls onClose

  return (
    <dialog
      ref={dialog}
      className="drawer"
      aria-labelledby={titleId}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose(); // not when the details window closes
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close(); // the dimmed page outside the panel
      }}
    >
      <div className="drawer-panel">
        <header className="drawer-header">
          <div className="drawer-heading">
            <p className="eyebrow">{view.filters.day ? 'One day' : period.label}</p>
            <h2 id={titleId}>{view.title}</h2>
            <p className="drawer-count">{data ? `${formatNumber(data.total)} ${data.total === 1 ? 'job' : 'jobs'}` : 'Loading…'}</p>
          </div>
          <div className="drawer-actions">
            <a className="btn btn-sm" href={apiUrl('jobs.csv', params)}>
              <DownloadIcon size={15} /> CSV
            </a>
            <button ref={closeButton} type="button" className="icon-btn drawer-close" onClick={close} aria-label="Close" title="Close (Esc)">
              <CloseIcon size={18} />
            </button>
          </div>
        </header>

        <div className="drawer-body" ref={body}>
          {jobs.error && <SectionError what="the jobs" error={jobs.error} onRetry={jobs.reload} />}
          {data && data.total === 0 && <p className="empty">No jobs.</p>}
          <ul className={`drawer-list ${jobs.loading ? 'is-loading' : ''}`}>
            {data?.items.map((loaded) => {
              const job = saved[loaded._id] ?? loaded;
              const links = listingOrder(job);
              return (
                <li key={job._id} className="drawer-job">
                  <div className="drawer-job-top">
                    {links.length ? (
                      <a className="drawer-job-title" href={job.links[links[0]]} target="_blank" rel="noopener noreferrer">
                        {job.title}
                        <ExternalIcon size={12} />
                      </a>
                    ) : (
                      <span className="drawer-job-title">{job.title}</span>
                    )}
                    <span className="drawer-job-posted">{formatPosted(job.postedAt ?? job.firstSeenAt)}</span>
                  </div>
                  <span className="job-sub">
                    <span className="job-course">
                      <span className="dot" style={{ background: COURSE_COLORS[job.course] }} aria-hidden="true" />
                      {courseName[job.course]}
                    </span>
                    {' · '}
                    <button
                      type="button"
                      className="company-link"
                      onClick={() => setDetail(job)}
                      aria-haspopup="dialog"
                      title="Open: HR contact, students, notes and job details"
                    >
                      {job.company || 'Company not shown'}
                    </button>
                    {job.cities?.length ? ` · ${job.cities.join(', ')}` : ''}
                  </span>
                  <div className="drawer-job-meta">
                    {job.leftOutBy && <span className="reason-pill">{LEFT_OUT_LABELS[job.leftOutBy]}</span>}
                    <span className="meta-pill">{formatExperience(job)}</span>
                    {job.salaryText && !/not disclosed/i.test(job.salaryText) && <span className="meta-pill">{job.salaryText}</span>}
                    <ul className="listings">
                      {links.map((platform) => (
                        <li key={platform}>
                          <a className="site-chip" href={job.links[platform]} target="_blank" rel="noopener noreferrer" title={`Open on ${platform}`}>
                            {platform}
                            <ExternalIcon size={12} />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {(job.contact.hrNames?.length || job.contact.phone || job.contact.email || job.contact.assignedTo.length > 0) && (
                    <div className="drawer-contact">
                      {job.contact.hrNames?.length ? (
                        <span title="HR">
                          <UserIcon size={12} /> {job.contact.hrNames.join(', ')}
                        </span>
                      ) : null}
                      {job.contact.phone && (
                        <span>
                          <PhoneIcon size={12} /> {job.contact.phone}
                        </span>
                      )}
                      {job.contact.email && (
                        <span>
                          <MailIcon size={12} /> {job.contact.email}
                        </span>
                      )}
                      {job.contact.assignedTo.length > 0 && (
                        <span title="Assigned to">
                          <UsersIcon size={12} /> {job.contact.assignedTo.join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {data && data.total > 0 && (
          <div className="pager drawer-pager">
            <span>
              {formatNumber((data.page - 1) * data.pageSize + 1)}–{formatNumber(Math.min(data.page * data.pageSize, data.total))} of {formatNumber(data.total)}
            </span>
            <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button type="button" className="btn btn-sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        )}
      </div>
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
    </dialog>
  );
}

// The side panel the dashboard opens when a bar, a day or a name in a chart is clicked: the jobs that
// number counts (same count, same filters as the job list), with links to each posting.
export default function JobsDrawer({
  view,
  period,
  courses,
  onClose,
}: {
  view: JobsView | null;
  period: Period;
  courses: Course[];
  onClose: () => void;
}) {
  return view ? <Panel key={`${view.title}|${JSON.stringify(view.filters)}`} view={view} period={period} courses={courses} onClose={onClose} /> : null;
}
