import { formatNumber } from '@/lib/format';
import type { JobFilters, ShowJobs } from '@/lib/jobFilters';
import type { ApiState, Course, PlatformsResponse } from '@/lib/types';

// A count that shows its jobs when clicked (plain text when there are none).
function CountButton({ count, label, filters, onSelect }: { count: number; label: string; filters: Partial<JobFilters>; onSelect: ShowJobs }) {
  if (!count) return <>{formatNumber(count)}</>;
  return (
    <button type="button" className="cell-btn" onClick={() => onSelect(filters, label)} aria-label={`${label}: ${formatNumber(count)}. Show them`}>
      {formatNumber(count)}
    </button>
  );
}

// The chart's numbers as a table. Every number is clickable and shows the jobs it counts.
export default function PlatformTable({ courses, state, onSelect }: { courses: Course[]; state: ApiState<PlatformsResponse>; onSelect: ShowJobs }) {
  const rows = state.data?.platforms ?? [];
  const courseTotal = (id: Course['id']) => rows.reduce((sum, r) => sum + (r.byCourse[id] ?? 0), 0);
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <div className={`table-wrap ${state.loading ? 'is-loading' : ''}`}>
      <table className="data-table numeric">
        <thead>
          <tr>
            <th scope="col">Platform</th>
            {courses.map((c) => (
              <th scope="col" key={c.id}>
                {c.name}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.platform}>
              <th scope="row">{row.platform}</th>
              {courses.map((c) => (
                <td key={c.id}>
                  <CountButton
                    count={row.byCourse[c.id] ?? 0}
                    label={`${c.name} jobs first posted on ${row.platform}`}
                    filters={{ primary: row.platform, course: c.id }}
                    onSelect={onSelect}
                  />
                </td>
              ))}
              <td className="strong">
                <CountButton count={row.total} label={`Jobs first posted on ${row.platform}`} filters={{ primary: row.platform }} onSelect={onSelect} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">All platforms</th>
            {courses.map((c) => (
              <td key={c.id}>
                <CountButton count={courseTotal(c.id)} label={`All new ${c.name} jobs`} filters={{ course: c.id }} onSelect={onSelect} />
              </td>
            ))}
            <td>
              <CountButton count={grandTotal} label="All new jobs" filters={{}} onSelect={onSelect} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
