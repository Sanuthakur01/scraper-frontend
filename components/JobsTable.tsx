import { useEffect, useState, type ChangeEvent } from 'react';
import JobRow from '@/components/JobRow';
import { apiUrl, useApi } from '@/lib/api';
import { experienceBands, formatNumber } from '@/lib/format';
import type { Course, Job, JobsResponse, Meta } from '@/lib/types';
import { CloseIcon, ColumnsIcon, DownloadIcon, ListIcon, MailIcon, NoteIcon, PencilIcon, PhoneIcon, SearchIcon } from './Icons';
import { CardHeader } from './PageParts';

// The same test as the server's count (GET /api/jobs withContact): a phone, email or note.
const hasContact = ({ contact }: Job) => Boolean(contact.phone || contact.email || contact.remarks);

// "HR details for 12 of 2,559 jobs", over a thin bar: how far the team has got with this list.
function ContactProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className="contact-progress" title="Jobs in this list with a phone, email or note (typed in by the team, or found in the job post)">
      <span>
        HR details for <strong>{formatNumber(done)}</strong> of {formatNumber(total)} jobs
      </span>
      <span className="progress-track" aria-hidden="true">
        {done > 0 && <span style={{ width: `${Math.min(100, (done / total) * 100)}%` }} />}
      </span>
    </div>
  );
}

// The job list's filters, sent to GET /api/jobs (and jobs.csv) as they are. '' = not filtered.
export interface JobFilters {
  course: string;
  platform: string;
  city: string;
  exp: string; // experience: '2'…'5'
  sites: string; // '2': only jobs listed on two or more sites
  salary: string; // 'shown': only jobs whose post shows a salary
  q: string; // search text
}

export const NO_FILTERS: JobFilters = { course: '', platform: '', city: '', exp: '', sites: '', salary: '', q: '' };

// The job list's filters, kept by the page that shows the list so other parts of the page can set
// them too (the cards above the list on a course page).
export function useJobFilters() {
  const [filters, setFilters] = useState<JobFilters>(NO_FILTERS);
  const [search, setSearch] = useState(''); // as typed; filters.q follows it once typing pauses

  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Exactly these filters, every other one cleared (and the search box emptied).
  const show = (only: Partial<JobFilters>) => {
    setFilters({ ...NO_FILTERS, ...only });
    setSearch('');
  };
  // True when the list shows exactly these filters and nothing else.
  const showing = (only: Partial<JobFilters>) =>
    (Object.keys(NO_FILTERS) as (keyof JobFilters)[]).every((key) => filters[key] === (only[key] ?? ''));

  return { filters, setFilters, search, setSearch, show, showing };
}

export type JobFilterState = ReturnType<typeof useJobFilters>;

// A filter that has no dropdown (set by a card above the list): its name, and × to remove it.
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="filter-chip">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove filter: ${label}`} title="Remove this filter">
        <CloseIcon size={13} />
      </button>
    </span>
  );
}

interface Props {
  courses: Course[];
  meta: Meta;
  days: number;
  filterState: JobFilterState; // from useJobFilters() in the page
  lockedCourse?: Course['id']; // on a course page: only that course, no course filter
  title?: string;
}

// The job list: search and filters, one row per job (each job once, however many sites list it), with
// the HR phone, email and notes the team fills in. Expand shows more columns.
export default function JobsTable({ courses, meta, days, filterState, lockedCourse, title = 'Jobs' }: Props) {
  const { filters, setFilters, search, setSearch, show } = filterState;
  const [page, setPage] = useState(1);
  // Expand: also show salary, skills, work mode and when we found each job.
  const [expanded, setExpanded] = useState(false);
  // Rows as saved since this list loaded (HR contact typed in), shown instead of the loaded copy.
  const [savedRows, setSavedRows] = useState<Record<string, Job>>({});
  // Saves since the list last loaded that added (+1) or removed (-1) a job's HR details, so the
  // progress line moves at once. A reload's count already includes them, so it counts from zero again.
  const [contactChange, setContactChange] = useState<{ base: JobsResponse | null; n: number }>({ base: null, n: 0 });

  useEffect(() => setPage(1), [filters, days]);

  const params = { ...filters, ...(lockedCourse ? { course: lockedCourse } : {}), days };
  const jobs = useApi<JobsResponse>('jobs', { ...params, page, limit: 25 });
  const data = jobs.data;
  const courseName = Object.fromEntries(courses.map((c) => [c.id, c.name]));
  const withContact = (data?.withContact ?? 0) + (contactChange.base === data ? contactChange.n : 0);

  const onSaved = (job: Job) => {
    const before = savedRows[job._id] ?? data?.items.find((j) => j._id === job._id);
    const change = before ? Number(hasContact(job)) - Number(hasContact(before)) : 0;
    setContactChange((c) => ({ base: data, n: (c.base === data ? c.n : 0) + change }));
    setSavedRows((rows) => ({ ...rows, [job._id]: job }));
  };
  const setFilter = (key: keyof JobFilters) => (event: ChangeEvent<HTMLSelectElement>) =>
    setFilters((f) => ({ ...f, [key]: event.target.value }));
  const clearFilter = (key: keyof JobFilters) => () => setFilters((f) => ({ ...f, [key]: '' }));
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <section className="card card-flush" id="jobs">
      <CardHeader
        icon={<ListIcon />}
        title={
          <>
            {title}
            {data && <span className="count-badge">{formatNumber(data.total)}</span>}
          </>
        }
        description="Each job is shown once, even when several sites list it. Click a Phone, Email or Notes cell to add the HR contact."
        actions={
          <>
            {data && data.total > 0 && <ContactProgress done={withContact} total={data.total} />}
            <a className="btn" href={apiUrl('jobs.csv', params)}>
              <DownloadIcon /> Download CSV
            </a>
          </>
        }
      />

      <div className="toolbar">
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search job title or company"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search job title or company"
          />
        </label>
        {!lockedCourse && (
          <select className="select" value={filters.course} onChange={setFilter('course')} aria-label="Course">
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <select className="select" value={filters.platform} onChange={setFilter('platform')} aria-label="Site">
          <option value="">All sites</option>
          {meta.platforms.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select className="select" value={filters.city} onChange={setFilter('city')} aria-label="City">
          <option value="">All cities</option>
          {meta.cities.map((city) => (
            <option key={city}>{city}</option>
          ))}
        </select>
        <select className="select" value={filters.exp} onChange={setFilter('exp')} aria-label="Experience">
          <option value="">Any experience</option>
          {experienceBands(meta.filters.experience).map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        {filters.sites && <FilterChip label="Listed on 2+ sites" onRemove={clearFilter('sites')} />}
        {filters.salary && <FilterChip label="Salary shown" onRemove={clearFilter('salary')} />}
        {hasFilters && (
          <button type="button" className="btn-link" onClick={() => show({})}>
            Clear filters
          </button>
        )}
        <button type="button" className="btn toolbar-end" aria-pressed={expanded} onClick={() => setExpanded((v) => !v)}>
          <ColumnsIcon /> {expanded ? 'Fewer columns' : 'Expand'}
        </button>
      </div>

      {jobs.error && <p className="empty">Could not load jobs: {jobs.error.message}</p>}

      <div className={`table-wrap ${jobs.loading ? 'is-loading' : ''}`}>
        <table className={`data-table jobs-table ${expanded ? 'expanded' : ''}`}>
          <thead>
            <tr className="group-row">
              <th scope="colgroup" colSpan={expanded ? 8 : 4} className="group-job">
                <span className="sr-only">Job details</span>
              </th>
              <th scope="colgroup" colSpan={3} className="group-contact">
                <span className="group-label">
                  <PencilIcon size={12} /> HR contact · click a cell to fill it in
                </span>
              </th>
              <th className="actions-head" />
            </tr>
            <tr>
              <th scope="col">Job</th>
              <th scope="col">Experience</th>
              <th scope="col">Found on</th>
              <th scope="col">Posted</th>
              {expanded && (
                <>
                  <th scope="col">Salary</th>
                  <th scope="col">Skills</th>
                  <th scope="col">Work mode</th>
                  <th scope="col">Found by us</th>
                </>
              )}
              <th scope="col" className="contact-col">
                <span className="th-icon">
                  <PhoneIcon size={13} /> Phone
                </span>
              </th>
              <th scope="col" className="contact-col">
                <span className="th-icon">
                  <MailIcon size={13} /> Email
                </span>
              </th>
              <th scope="col" className="contact-col">
                <span className="th-icon">
                  <NoteIcon size={13} /> Notes
                </span>
              </th>
              <th scope="col" className="actions-head">
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((loaded) => {
              const job = savedRows[loaded._id] ?? loaded;
              return (
                <JobRow
                  key={job._id}
                  job={job}
                  courseName={lockedCourse ? undefined : courseName[job.course]}
                  expanded={expanded}
                  onSaved={onSaved}
                />
              );
            })}
          </tbody>
        </table>
        {data && data.total === 0 && <p className="empty">No jobs match these filters.</p>}
      </div>

      {data && data.total > 0 && (
        <div className="pager">
          <span>
            {formatNumber((data.page - 1) * data.pageSize + 1)}–{formatNumber(Math.min(data.page * data.pageSize, data.total))} of{' '}
            {formatNumber(data.total)}
          </span>
          <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <button type="button" className="btn btn-sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </section>
  );
}
