import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import JobDetailsModal from '@/components/JobDetailsModal';
import JobRow from '@/components/JobRow';
import { useApi, useApiUrl } from '@/lib/api';
import { useDataView } from '@/lib/dataView';
import { experienceBands, formatNumber, periodParams, periodQuery, type Period } from '@/lib/format';
import { filterChips, type JobFilters, type JobFilterState } from '@/lib/jobFilters';
import type { Course, Job, JobsResponse, Meta } from '@/lib/types';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ColumnsIcon,
  DownloadIcon,
  ListIcon,
  SearchIcon,
} from './Icons';
import { CardHeader } from './PageParts';

// The same test as the server's count (GET /api/jobs withContact): a phone, email or note.
const hasContact = ({ contact }: Job) => Boolean(contact.phone || contact.email || contact.remarks);

// A dropdown's choices, plus the current value when a chart set one that isn't among them.
const withValue = (options: string[], value: string) => (value && !options.includes(value) ? [...options, value] : options);

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

// A filter that has no dropdown (set by a card or a chart): its name, and × to remove it.
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

// The ← → buttons: whether the table can scroll each way, and scrolling it by most of its width.
function useSideScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const update = () => setEdges({ left: box.scrollLeft > 1, right: box.scrollLeft + box.clientWidth < box.scrollWidth - 1 });
    update();
    box.addEventListener('scroll', update, { passive: true });
    // The table gets wider on Expand and when rows load; the box narrower when the window does.
    const observer = new ResizeObserver(update);
    observer.observe(box);
    const table = box.querySelector('table');
    if (table) observer.observe(table);
    return () => {
      box.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

  const scroll = (direction: 1 | -1) => {
    const box = ref.current;
    if (!box) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.scrollBy({ left: direction * Math.max(240, box.clientWidth * 0.6), behavior: still ? 'auto' : 'smooth' });
  };

  return { ref, ...edges, scroll };
}

interface Props {
  courses: Course[];
  meta: Meta;
  period: Period;
  filterState: JobFilterState; // from useJobFilters() in the page
  lockedCourse?: Course['id']; // on a course page: only that course, no course filter
  title?: string;
}

// The job list: search and filters, one row per job (each job once, however many sites list it).
// Clicking a company name opens the job's details window, where the team sees and fills in the HR phone
// numbers, emails, students and notes. Expand shows more columns; ← → scroll them.
export default function JobsTable({ courses, meta, period, filterState, lockedCourse, title = 'Jobs' }: Props) {
  const { filters, setFilters, search, setSearch, show } = filterState;
  const [page, setPage] = useState(1);
  // Expand: also show salary, skills, work mode and when we found each job.
  const [expanded, setExpanded] = useState(false);
  // Rows as saved since this list loaded (HR contact typed in), shown instead of the loaded copy.
  const [savedRows, setSavedRows] = useState<Record<string, Job>>({});
  // The job whose details window is open (its newest copy is in savedRows).
  const [detail, setDetail] = useState<Job | null>(null);
  // Saves since the list last loaded that added (+1) or removed (-1) a job's HR details, so the
  // progress line moves at once. A reload's count already includes them, so it counts from zero again.
  const [contactChange, setContactChange] = useState<{ base: JobsResponse | null; n: number }>({ base: null, n: 0 });
  const side = useSideScroll();
  const section = useRef<HTMLElement>(null);

  // Previous / Next: show the new page from its first job. The buttons are at the bottom of the list,
  // so without this the next page would open scrolled to its end. Only when the list's top is out of
  // view (its scroll-margin-top keeps it clear of the sticky top bar).
  const goToPage = (next: number) => {
    setPage(next);
    const box = section.current;
    if (!box || box.getBoundingClientRect().top >= 0) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  };
  const { view } = useDataView();
  const apiUrl = useApiUrl();

  const periodKey = periodQuery(period);
  useEffect(() => {
    setPage(1);
  }, [filters, periodKey]);

  const params = { ...filters, ...(lockedCourse ? { course: lockedCourse } : {}), ...periodParams(period) };
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
    <section ref={section} className="card card-flush" id="jobs">
      <CardHeader
        icon={<ListIcon />}
        title={
          <>
            {title}
            {data && <span className="count-badge">{formatNumber(data.total)}</span>}
          </>
        }
        description="Each job is shown once, even when several sites list it. Click a company name to see and edit its HR contact, students and notes."
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
            placeholder="Search job, company or student"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search job title, company or assigned student"
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
          {withValue(meta.platforms, filters.platform).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select className="select" value={filters.city} onChange={setFilter('city')} aria-label="City">
          <option value="">All cities</option>
          {withValue(meta.cities, filters.city).map((city) => (
            <option key={city}>{city}</option>
          ))}
        </select>
        <select className="select" value={filters.exp} onChange={setFilter('exp')} aria-label="Experience">
          <option value="">Any experience</option>
          {experienceBands(meta.filters.experience, view).map((b) => (
            <option key={b.id} value={b.id}>
              {b.id === '5+' ? '5+ yrs (more than 5)' : b.label}
            </option>
          ))}
        </select>
        {filterChips(filters).map((chip) => (
          <FilterChip key={chip.key} label={chip.label} onRemove={clearFilter(chip.key)} />
        ))}
        {hasFilters && (
          <button type="button" className="btn-link" onClick={() => show({})}>
            Clear filters
          </button>
        )}
        <div className="toolbar-end">
          <button type="button" className="btn" aria-pressed={expanded} onClick={() => setExpanded((v) => !v)}>
            <ColumnsIcon /> {expanded ? 'Fewer columns' : 'Expand'}
          </button>
          <div className="scroll-arrows" role="group" aria-label="Scroll the table sideways">
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => side.scroll(-1)}
              disabled={!side.left}
              aria-label="Scroll the table left"
              title="Scroll left"
            >
              <ChevronLeftIcon size={18} />
            </button>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => side.scroll(1)}
              disabled={!side.right}
              aria-label="Scroll the table right"
              title="Scroll right"
            >
              <ChevronRightIcon size={18} />
            </button>
          </div>
        </div>
      </div>

      {jobs.error && <p className="empty">Could not load jobs: {jobs.error.message}</p>}

      <div ref={side.ref} className={`table-wrap ${side.left ? 'scrolled' : ''} ${jobs.loading ? 'is-loading' : ''}`}>
        <table className={`data-table jobs-table ${expanded ? 'expanded' : ''}`}>
          <thead>
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
                  onOpen={setDetail}
                />
              );
            })}
          </tbody>
        </table>
        {data && data.total === 0 && <p className="empty">No jobs match these filters.</p>}
      </div>

      {detail && (
        <JobDetailsModal
          job={savedRows[detail._id] ?? detail}
          courses={courses}
          saved={savedRows}
          onClose={() => setDetail(null)}
          onSaved={onSaved}
          onOpenJob={(job) => setDetail(savedRows[job._id] ?? job)}
        />
      )}

      {data && data.total > 0 && (
        <div className="pager">
          <span>
            {formatNumber((data.page - 1) * data.pageSize + 1)}–{formatNumber(Math.min(data.page * data.pageSize, data.total))} of{' '}
            {formatNumber(data.total)}
          </span>
          <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
            Previous
          </button>
          <button type="button" className="btn btn-sm" disabled={page >= data.pages} onClick={() => goToPage(page + 1)}>
            Next
          </button>
        </div>
      )}
    </section>
  );
}
