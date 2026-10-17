import Link from 'next/link';
import { useApi } from '@/lib/api';
import { COURSE_COLORS, formatMonth, formatNumber } from '@/lib/format';
import type { PlacementCounts, PlacementsResponse } from '@/lib/types';

const COLUMNS: { key: keyof PlacementCounts; label: string }[] = [
  { key: 'contacted', label: 'Contacted' },
  { key: 'cvsSent', label: 'CVs sent' },
  { key: 'interview', label: 'Interview' },
];

// Placement progress per course, from the statuses the team sets in each course page's job list.
export default function Placements({ days }: { days: number }) {
  const state = useApi<PlacementsResponse>('placements');
  const data = state.data;

  return (
    <section className={`card ${state.loading ? 'is-loading' : ''}`}>
      <div>
        <h2>Placements</h2>
        <p className="card-note">
          Jobs the team is working on now, and students placed. Set a job&apos;s status with Edit in the job list on
          its course page.
        </p>
      </div>
      {state.error && <p className="empty">Could not load: {state.error.message}</p>}
      {data && (
        <div className="table-wrap">
          <table className="data-table numeric">
            <thead>
              <tr>
                <th scope="col">Course</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} scope="col">
                    {c.label}
                  </th>
                ))}
                <th scope="col">Placed in {formatMonth(data.thisMonth)}</th>
                <th scope="col">Placed in {formatMonth(data.lastMonth)}</th>
              </tr>
            </thead>
            <tbody>
              {data.courses.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <Link className="course-link" href={`/course/${row.id}?days=${days}`}>
                      <span className="swatch" style={{ background: COURSE_COLORS[row.id] }} aria-hidden="true" />
                      {row.name}
                    </Link>
                  </th>
                  {COLUMNS.map((c) => (
                    <td key={c.key}>{formatNumber(row[c.key])}</td>
                  ))}
                  <td className="strong">{formatNumber(row.placedThisMonth)}</td>
                  <td>{formatNumber(row.placedLastMonth)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">All courses</th>
                {COLUMNS.map((c) => (
                  <td key={c.key}>{formatNumber(data.total[c.key])}</td>
                ))}
                <td>{formatNumber(data.total.placedThisMonth)}</td>
                <td>{formatNumber(data.total.placedLastMonth)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
