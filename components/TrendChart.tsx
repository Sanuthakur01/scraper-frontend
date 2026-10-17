import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COURSE_COLORS, formatDay, formatNumber } from '@/lib/format';
import type { ApiState, Course, TrendPoint, TrendsResponse } from '@/lib/types';
import Legend from './Legend';

interface TooltipProps {
  active?: boolean;
  point?: TrendPoint;
  courses: Course[];
}

// One readout lists every course for the hovered day.
function TrendTooltip({ active, point, courses }: TooltipProps) {
  if (!active || !point) return null;
  return (
    <div className="tooltip tooltip-static">
      <span className="tooltip-title">{formatDay(point.day)}</span>
      {courses.map((c) => (
        <div className="tooltip-row" key={c.id}>
          <span className="key-line" style={{ background: COURSE_COLORS[c.id] }} aria-hidden="true" />
          <strong>{formatNumber(point[c.id])}</strong>
          <span>{c.name}</span>
        </div>
      ))}
    </div>
  );
}

export default function TrendChart({ courses, state }: { courses: Course[]; state: ApiState<TrendsResponse> }) {
  const series = state.data?.series ?? [];
  return (
    <div className={state.loading ? 'is-loading' : ''}>
      {/* One course needs no legend: the heading names it. */}
      {courses.length > 1 && <Legend courses={courses} kind="line" />}
      <div className="trend-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="day"
              tickFormatter={formatDay}
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--axis)' }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
              content={({ active, payload }) => (
                <TrendTooltip active={active} point={payload?.[0]?.payload as TrendPoint | undefined} courses={courses} />
              )}
            />
            {courses.map((c) => (
              <Line
                key={c.id}
                type="monotone"
                dataKey={c.id}
                name={c.name}
                stroke={COURSE_COLORS[c.id]}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
