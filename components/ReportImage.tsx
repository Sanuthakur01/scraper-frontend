import { formatDay, formatNumber } from '@/lib/format';
import type { ReportResponse } from '@/lib/types';

// The weekly report as one 1080 x 1350 picture (portrait, fits Instagram and LinkedIn). Plain SVG with
// fixed light colours, so the downloaded PNG looks the same whatever the viewer's theme.
export const REPORT_WIDTH = 1080;
export const REPORT_HEIGHT = 1350;

const FONT = 'Segoe UI, Helvetica, Arial, sans-serif';
const INK = '#111111';
const SOFT = '#55544f';
const MUTED = '#8a8983';
const PANEL = '#f3f3ef';
const UP = '#0a7a0a';
const DOWN = '#c43c3c';
// Course colours, light theme (as on the dashboard).
const COLORS: Record<string, string> = {
  'data-analyst': '#2a78d6',
  'data-science': '#eb6834',
  'data-engineering': '#1baf7a',
  'production-support': '#eda100',
};

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export const reportRange = (r: ReportResponse) => `${formatDay(r.from)} – ${formatDay(r.to)} ${r.to.slice(0, 4)}`;

// "+12%" / "-5%" vs the week before, or null when there is nothing fair to compare with.
export function weekChange(count: number, previous: number | null) {
  if (previous == null || previous === 0) return null;
  return Math.round(((count - previous) / previous) * 100);
}

export default function ReportImage({ report }: { report: ReportResponse }) {
  const m = 72; // side margin
  const boxW = (REPORT_WIDTH - 2 * m - 24) / 2;
  const boxH = 250;
  const updated = report.lastRefreshed
    ? new Date(report.lastRefreshed).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${REPORT_WIDTH} ${REPORT_HEIGHT}`}
      width={REPORT_WIDTH}
      height={REPORT_HEIGHT}
      role="img"
      aria-label={`Job market report ${reportRange(report)}: ${report.total} new openings`}
      fontFamily={FONT}
    >
      <rect width={REPORT_WIDTH} height={REPORT_HEIGHT} fill="#ffffff" />
      <text x={m} y={112} fontSize={26} fill={MUTED} letterSpacing={3}>
        INDIA JOB MARKET · DATA ROLES
      </text>
      <text x={REPORT_WIDTH - m} y={112} fontSize={30} fontWeight={700} fill={INK} textAnchor="end">
        {report.brand}
      </text>
      <text x={m} y={182} fontSize={54} fontWeight={700} fill={INK}>
        New job openings, last 7 days
      </text>
      <text x={m} y={236} fontSize={30} fill={SOFT}>
        {reportRange(report)}
      </text>

      <text x={m} y={386} fontSize={124} fontWeight={700} fill={INK}>
        {formatNumber(report.total)}
      </text>
      <text x={m} y={450} fontSize={30} fill={SOFT}>
        new openings for {report.experience.min}–{report.experience.max} years&apos; experience
      </text>

      {report.courses.map((course, i) => {
        const x = m + (i % 2) * (boxW + 24);
        const y = 480 + Math.floor(i / 2) * (boxH + 24);
        const change = weekChange(course.count, course.previous);
        return (
          <g key={course.id}>
            <rect x={x} y={y} width={boxW} height={boxH} rx={18} fill={PANEL} />
            <rect x={x} y={y} width={10} height={boxH} rx={5} fill={COLORS[course.id] ?? MUTED} />
            <text x={x + 36} y={y + 56} fontSize={30} fontWeight={700} fill={INK}>
              {course.name}
            </text>
            <text x={x + 36} y={y + 132} fontSize={66} fontWeight={700} fill={INK}>
              {formatNumber(course.count)}
            </text>
            {change != null && (
              <text x={x + 36} y={y + 168} fontSize={24} fontWeight={600} fill={change >= 0 ? UP : DOWN}>
                {change >= 0 ? '▲' : '▼'} {Math.abs(change)}% vs the week before
              </text>
            )}
            <text x={x + 36} y={y + 202} fontSize={19} fill={MUTED} letterSpacing={1}>
              TOP SKILLS ASKED
            </text>
            <text x={x + 36} y={y + 234} fontSize={26} fill={SOFT}>
              {clip(course.skills.join(' · ') || '—', 32)}
            </text>
          </g>
        );
      })}

      {[
        { title: 'Top hiring companies', rows: report.companies },
        { title: 'Top cities', rows: report.cities },
      ].map((list, col) => {
        const x = m + col * (boxW + 24);
        return (
          <g key={list.title}>
            <text x={x} y={1056} fontSize={28} fontWeight={700} fill={INK}>
              {list.title}
            </text>
            {list.rows.map((row, i) => (
              <g key={row.name}>
                <text x={x} y={1100 + i * 36} fontSize={25} fill={SOFT}>
                  {clip(row.name, 26)}
                </text>
                <text x={x + boxW - 8} y={1100 + i * 36} fontSize={25} fontWeight={600} fill={INK} textAnchor="end">
                  {formatNumber(row.count)}
                </text>
              </g>
            ))}
          </g>
        );
      })}

      <line x1={m} x2={REPORT_WIDTH - m} y1={1268} y2={1268} stroke="#e1e0d9" strokeWidth={2} />
      <text x={m} y={1300} fontSize={19} fill={MUTED}>
        {clip(`Source: ${formatNumber(report.total)} job postings from ${report.platforms.join(', ')}, collected by ${report.brand}.`, 100)}
      </text>
      <text x={m} y={1328} fontSize={19} fill={MUTED}>
        India only · large IT services firms excluded{updated ? ` · updated ${updated}` : ''}
      </text>
    </svg>
  );
}
