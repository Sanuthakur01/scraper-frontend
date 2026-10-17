import { useEffect, useState, type ChangeEvent } from 'react';
import JobRow from '@/components/JobRow';
import { apiUrl, useApi } from '@/lib/api';
import { experienceBands, formatNumber, PLACEMENT_STATUSES } from '@/lib/format';
import type { Course, Job, JobsResponse, Meta } from '@/lib/types';

interface Filters {
  status: string; // placement status, 'any', or '' for all jobs
  course: string;
  platform: string;
  city: string;
  exp: string;
  q: string;
}

const EMPTY_FILTERS: Filters = { status: '', course: '', platform: '', city: '', exp: '', q: '' };

interface Props {
  courses: Course[];
  meta: Meta;
  days: number;
  lockedCourse?: Course['id']; // on a course page: only that course, no course filter
  title?: string;
}

export default function JobsTable({ courses, meta, days, lockedCourse, title = 'Latest postings' }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // Rows as saved since this list loaded (HR contact typed in), shown instead of the loaded copy.
  const [savedRows, setSavedRows] = useState<Record<string, Job>>({});
  const onSaved = (job: Job) => setSavedRows((rows) => ({ ...rows, [job._id]: job }));

  // Wait until typing pauses before searching.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => setPage(1), [filters, days]);

  const params = { ...filters, ...(lockedCourse ? { course: lockedCourse } : {}), days };
  const jobs = useApi<JobsResponse>('jobs', { ...params, page, limit: 25 });
  const data = jobs.data;
  const courseName = Object.fromEntries(courses.map((c) => [c.id, c.name]));
  const setFilter = (key: keyof Filters) => (event: ChangeEvent<HTMLSelectElement>) =>
    setFilters((f) => ({ ...f, [key]: event.target.value }));
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <p className="card-note">
          Duplicates across platforms are merged into one row · Click Add to save an HR contact or placement progress
        </p>
      </div>

      <div className="filters">
        {!lockedCourse && (
          <select value={filters.course} onChange={setFilter('course')} aria-label="Course">
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <select value={filters.status} onChange={setFilter('status')} aria-label="Placement status">
          <option value="">All jobs</option>
          <option value="any">Being worked on</option>
          {PLACEMENT_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={filters.platform} onChange={setFilter('platform')} aria-label="Platform">
          <option value="">All platforms</option>
          {meta.platforms.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select value={filters.city} onChange={setFilter('city')} aria-label="City">
          <option value="">All cities</option>
          {meta.cities.map((city) => (
            <option key={city}>{city}</option>
          ))}
        </select>
        <select value={filters.exp} onChange={setFilter('exp')} aria-label="Experience">
          <option value="">Any experience</option>
          {experienceBands(meta.filters.experience).map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search title or company"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search title or company"
        />
        {hasFilters && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setSearch('');
            }}
          >
            Clear filters
          </button>
        )}
        <a className="button" href={apiUrl('jobs.csv', params)}>
          Download CSV
        </a>
      </div>

      {filters.status && <p className="card-note">Showing jobs with this placement status from all dates, not only the period above.</p>}
      {jobs.error && <p className="empty">Could not load jobs: {jobs.error.message}</p>}

      <div className={`table-wrap ${jobs.loading ? 'is-loading' : ''}`}>
        <table className="data-table jobs-table">
          <thead>
            <tr>
              <th scope="col">Posted</th>
              <th scope="col">Role</th>
              <th scope="col">Company</th>
              <th scope="col">City</th>
              <th scope="col">Experience</th>
              <th scope="col">Listed on</th>
              <th scope="col">Phone number</th>
              <th scope="col">Email ID</th>
              <th scope="col">Remarks</th>
              <th scope="col">Placement</th>
              <th scope="col">
                <span className="sr-only">Add or edit HR contact and placement</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((loaded) => {
              const job = savedRows[loaded._id] ?? loaded;
              return <JobRow key={job._id} job={job} courseName={courseName[job.course]} onSaved={onSaved} />;
            })}
          </tbody>
        </table>
        {data && data.total === 0 && <p className="empty">No jobs match these filters.</p>}
      </div>

      {data && data.total > 0 && (
        <div className="pager">
          <span>
            Showing {formatNumber((data.page - 1) * data.pageSize + 1)}–{formatNumber(Math.min(data.page * data.pageSize, data.total))} of{' '}
            {formatNumber(data.total)}
          </span>
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <button type="button" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </section>
  );
}
