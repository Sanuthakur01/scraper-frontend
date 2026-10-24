'use client';

import { useState } from 'react';
import { useApi } from '@/lib/api';
import { useDataView } from '@/lib/dataView';
import { formatExperience, formatNumber, formatPosted, LEFT_OUT_LABELS, listingOrder, periodParams, type Period } from '@/lib/format';
import type { Course, Job, RoleJobsResponse } from '@/lib/types';
import { contactSummary, ContactIcons } from './ContactForm';
import { ExternalIcon, PulseIcon } from './Icons';
import JobDetailsModal from './JobDetailsModal';
import { CardHeader } from './PageParts';

const PAGE_SIZE = 25;

interface Props {
  role: string; // a role box's id on the server (config/roleBoxes.js), e.g. 'sre'
  title: string; // the box's heading
  noun: string; // what it lists, in messages ("No SRE openings in this period")
  description: string;
  period: Period;
  courses: Course[];
}

// A box with one role's openings in a period (the "SRE Openings" page: every Site Reliability Engineer
// job), newest first, in the Filtered or Non-filtered jobs as the switch at the top says (each Non-filtered
// one tagged with why); it says how many the other set has, and one click shows them. A job opens its
// details window, where its HR details are added as anywhere else.
export default function RoleOpenings({ role, title, noun, description, period, courses }: Props) {
  const [page, setPage] = useState(1);
  const { view, setView } = useDataView();
  const params = { role, ...periodParams(period), page, limit: PAGE_SIZE };
  const state = useApi<RoleJobsResponse>('role-jobs', params, { auth: true });
  const data = state.data;
  // Jobs saved in their details window since this list loaded, and the job whose window is open.
  const [saved, setSaved] = useState<Record<string, Job>>({});
  const [detail, setDetail] = useState<Job | null>(null);
  // A new period, or the other set, starts again on page 1.
  const listKey = `${period.key}${period.from ?? ''}|${view}`;
  const [shownKey, setShownKey] = useState(listKey);
  if (shownKey !== listKey) {
    setShownKey(listKey);
    setPage(1);
  }
  const nonfiltered = view === 'nonfiltered';
  const other = data ? (nonfiltered ? data.filtered : data.nonFiltered) : 0;

  const items = (data?.items ?? []).map((job) => saved[job._id] ?? job);
  const first = data ? (data.page - 1) * data.pageSize + 1 : 0;

  return (
    <section className="card card-flush role-openings" aria-labelledby={`role-${role}`}>
      <CardHeader
        icon={<PulseIcon />}
        title={
          <span id={`role-${role}`}>
            {title} {data && <span className="count-badge">{formatNumber(data.total)}</span>}
          </span>
        }
        description={description}
        actions={
          data && other > 0 ? (
            <button type="button" className="role-other" onClick={() => setView(nonfiltered ? 'filtered' : 'nonfiltered')}>
              +{formatNumber(other)} in {nonfiltered ? 'Filtered' : 'Non-filtered'} →
            </button>
          ) : null
        }
      />

      {state.error && <p className="empty">Could not load the {noun}: {state.error.message}</p>}
      {!data && !state.error && (
        <div className="company-jobs-loading role-loading" aria-busy="true" aria-label={`Loading the ${noun}`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="skeleton" />
          ))}
        </div>
      )}
      {data && data.total === 0 && (
        <p className="empty">
          No {nonfiltered ? 'Non-filtered' : 'Filtered'} {noun} in this period.
          {other > 0 ? ` ${formatNumber(other)} in ${nonfiltered ? 'Filtered' : 'Non-filtered'}: use the button above.` : ' Try Last 7 days or Last 30 days.'}
        </p>
      )}

      {data && data.total > 0 && (
        <>
          <div className={`table-wrap ${state.loading ? 'is-loading' : ''}`}>
            <table className="data-table company-jobs-table role-table">
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Experience</th>
                  <th scope="col">Posted</th>
                  <th scope="col">Found on</th>
                  <th scope="col">HR details</th>
                </tr>
              </thead>
              <tbody>
                {items.map((job) => {
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
          {data.pages > 1 && (
            <div className="pager">
              <span>
                Showing {formatNumber(first)}–{formatNumber(first + items.length - 1)} of {formatNumber(data.total)}
              </span>
              <button type="button" className="btn btn-sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || state.loading}>
                Previous
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setPage((p) => p + 1)} disabled={page >= data.pages || state.loading}>
                Next
              </button>
            </div>
          )}
        </>
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
    </section>
  );
}
