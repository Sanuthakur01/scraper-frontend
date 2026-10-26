import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis, useActiveTooltipLabel } from 'recharts';
import { COURSE_COLORS, formatDay } from '@/lib/format';
import type { ApiState, Course, TrendPoint, TrendsResponse } from '@/lib/types';
import { CourseBreakdown } from './ChartTip';
import Legend from './Legend';
import { SectionError } from './PageParts';

interface TooltipProps {
  active?: boolean;
  point?: TrendPoint;
  courses: Course[];
}

// One readout lists every course for the hovered day (the same card as the dashboard's bars).
function TrendTooltip({ active, point, courses }: TooltipProps) {
  if (!active || !point) return null;
  return (
    <div className="tooltip tooltip-static">
      <CourseBreakdown
        title={formatDay(point.day)}
        total={courses.reduce((n, c) => n + (point[c.id] ?? 0), 0)}
        counts={point}
        courses={courses}
        kind="line"
        hint="Click to see this day's jobs"
      />
    </div>
  );
}

// Keeps the day the tooltip is on (moved with the mouse, or with the arrow keys once the chart has
// focus), so Enter can open it.
function ActiveDay({ target }: { target: RefObject<string | null> }) {
  const label = useActiveTooltipLabel();
  useEffect(() => {
    target.current = typeof label === 'string' ? label : null;
  }, [label, target]);
  return null;
}

// New jobs per day. Clicking a day (or Enter on it) shows that day's jobs.
export default function TrendChart({
  courses,
  state,
  onSelectDay,
}: {
  courses: Course[];
  state: ApiState<TrendsResponse>;
  onSelectDay: (day: string) => void;
}) {
  const activeDay = useRef<string | null>(null);
  const series = state.data?.series ?? [];
  const fewDays = series.length <= 10;
  // Days collected by the one-off backfill (before daily collection began), shaded and explained.
  const backfillEnd = state.data?.backfilledBefore;
  const backfillDays = backfillEnd ? series.filter((p) => p.day < backfillEnd) : [];

  const openWithKeyboard = (event: KeyboardEvent) => {
    if ((event.key === 'Enter' || event.key === ' ') && activeDay.current) {
      event.preventDefault();
      onSelectDay(activeDay.current);
    }
  };

  if (state.error) return <SectionError what="the new jobs per day" error={state.error} onRetry={state.reload} />;

  return (
    <div className={state.loading ? 'is-loading' : ''}>
      {/* One course needs no legend: the heading names it. */}
      {courses.length > 1 && <Legend courses={courses} kind="line" />}
      <div className="trend-chart clickable" onKeyDown={openWithKeyboard}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series}
            margin={{ top: 8, right: 16, bottom: 0, left: -8 }}
            accessibilityLayer
            onClick={(chart) => {
              if (typeof chart?.activeLabel === 'string') onSelectDay(chart.activeLabel);
            }}
          >
            <CartesianGrid stroke="var(--grid)" strokeDasharray="3 5" />
            {backfillDays.length > 0 && (
              <ReferenceArea x1={backfillDays[0].day} x2={backfillDays.at(-1)?.day} fill="var(--grid)" fillOpacity={0.6} ifOverflow="hidden" />
            )}
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
                strokeWidth={2.25}
                className={`trend-line course-${c.id}`}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={fewDays ? { r: 4, fill: COURSE_COLORS[c.id], stroke: 'var(--surface)', strokeWidth: 2 } : false}
                activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
            <ActiveDay target={activeDay} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {backfillDays.length > 0 && backfillEnd && (
        <p className="chart-note">
          Shaded days (before {formatDay(backfillEnd)}) come from a one-off backfill of earlier postings and may be incomplete;
          daily collection started on {formatDay(backfillEnd)}.
        </p>
      )}
    </div>
  );
}
