'use client';

import { useState } from 'react';
import { useApi } from '@/lib/api';
import { useDataView } from '@/lib/dataView';
import { formatNumber, periodParams, type Period } from '@/lib/format';
import type { Course, Job, RoleJobsResponse } from '@/lib/types';
import { useAccess } from './AuthGate';
import { CONTACT_COLUMNS, hrHead } from './ContactCell';
import { PulseIcon } from './Icons';
import JobDetailsModal from './JobDetailsModal';
import JobRow from './JobRow';
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
// one tagged with why); it says how many the other set has, and one click shows them. Each job is a row
// of the job list (JobRow): its HR contact and students are added and saved right in the row (the
// pencil, then ✓ Save), and the company name opens its details window with everything else.
export default function RoleOpenings({ role, title, noun, description, period, courses }: Props) {
  const [page, setPage] = useState(1);
  const { view, setView } = useDataView();
  const params = { role, ...periodParams(period), page, limit: PAGE_SIZE };
  const state = useApi<RoleJobsResponse>('role-jobs', params, { auth: true });
  const data = state.data;
  // Jobs saved in their details window since this list loaded, and the job whose window is open.
  const [saved, setSaved] = useState<Record<string, Job>>({});
  const [detail, setDetail] = useState<Job | null>(null);
  const onSaved = (job: Job) => setSaved((rows) => ({ ...rows, [job._id]: job }));
  // The HR cell being edited (one at a time), and whether this person may edit HR details.
  const [editingCell, setEditingCell] = useState<{ jobId: string; column: string } | null>(null);
  const mayEdit = useAccess()?.can('edit-hr-details') ?? false;
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
            <table className="data-table jobs-table role-table">
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Experience</th>
                  <th scope="col">Found on</th>
                  <th scope="col">Posted</th>
                  {CONTACT_COLUMNS.map(hrHead)}
                </tr>
              </thead>
              <tbody>
                {items.map((job) => (
                  <JobRow
                    key={job._id}
                    job={job}
                    expanded={false}
                    onOpen={setDetail}
                    mayEdit={mayEdit}
                    editing={editingCell?.jobId === job._id ? editingCell.column : null}
                    onEdit={(column) => setEditingCell(column ? { jobId: job._id, column } : null)}
                    onSaved={onSaved}
                  />
                ))}
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
          onSaved={onSaved}
          onOpenJob={(job) => setDetail(saved[job._id] ?? job)}
        />
      )}
    </section>
  );
}
