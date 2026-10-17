import { useState, type FocusEvent, type MouseEvent } from 'react';
import { COURSE_COLORS, formatNumber } from '@/lib/format';
import type { ApiState, Course, PlatformsResponse } from '@/lib/types';
import Legend from './Legend';

interface Tip {
  platform: string;
  course: string;
  count: number;
  x: number;
  y: number;
}

// Stacked horizontal bars: one row per platform, one segment per course.
export default function PlatformChart({ courses, state }: { courses: Course[]; state: ApiState<PlatformsResponse> }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const rows = state.data?.platforms ?? [];
  const max = Math.max(1, ...rows.map((r) => r.total));

  const show = (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, platform: string, course: string, count: number) => {
    const chart = event.currentTarget.closest('.platform-chart');
    if (!chart) return;
    const box = chart.getBoundingClientRect();
    const mark = event.currentTarget.getBoundingClientRect();
    setTip({ platform, course, count, x: mark.left - box.left + mark.width / 2, y: mark.top - box.top });
  };

  return (
    <div className={`platform-chart ${state.loading ? 'is-loading' : ''}`} onMouseLeave={() => setTip(null)}>
      <Legend courses={courses} />
      {rows.every((r) => r.total === 0) && !state.loading ? (
        <p className="empty">No new jobs in this period yet.</p>
      ) : (
        rows.map((row) => (
          <div className="pbar-row" key={row.platform}>
            <span className="pbar-label">{row.platform}</span>
            <div className="pbar-track">
              <div className="pbar" style={{ width: `${(row.total / max) * 100}%` }}>
                {courses.map((course) => {
                  const count = row.byCourse[course.id] ?? 0;
                  if (!count) return null;
                  return (
                    <span
                      key={course.id}
                      className="pbar-seg"
                      tabIndex={0}
                      aria-label={`${row.platform}, ${course.name}: ${count}`}
                      style={{ flexGrow: count, background: COURSE_COLORS[course.id] }}
                      onMouseEnter={(e) => show(e, row.platform, course.name, count)}
                      onFocus={(e) => show(e, row.platform, course.name, count)}
                      onBlur={() => setTip(null)}
                    />
                  );
                })}
              </div>
              <span className="pbar-total">{formatNumber(row.total)}</span>
            </div>
          </div>
        ))
      )}
      {tip && (
        <div className="tooltip" style={{ left: tip.x, top: tip.y }} role="status">
          <strong>{formatNumber(tip.count)}</strong>
          <span>
            {tip.course} · {tip.platform}
          </span>
        </div>
      )}
    </div>
  );
}
