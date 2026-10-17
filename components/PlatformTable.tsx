import { formatNumber } from '@/lib/format';
import type { ApiState, Course, PlatformsResponse } from '@/lib/types';

export default function PlatformTable({ courses, state }: { courses: Course[]; state: ApiState<PlatformsResponse> }) {
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
                <td key={c.id}>{formatNumber(row.byCourse[c.id])}</td>
              ))}
              <td className="strong">{formatNumber(row.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">All platforms</th>
            {courses.map((c) => (
              <td key={c.id}>{formatNumber(courseTotal(c.id))}</td>
            ))}
            <td>{formatNumber(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
