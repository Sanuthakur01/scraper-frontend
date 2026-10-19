import { experienceBands, formatNumber, percent, type ExperienceRange } from '@/lib/format';
import type { ApiState, InsightsResponse, NamedCount } from '@/lib/types';
import { BriefcaseIcon, BuildingIcon, MapPinIcon } from './Icons';
import { CardHeader } from './PageParts';

// A single-series ranked list: name, bar, value. The value is always printed, so nothing depends on hover.
// The default colour is the brand colour, which stands for "all courses" (a course's own list uses its colour).
export function RankList({ items, color = 'var(--accent)', empty = 'No data yet.' }: { items: NamedCount[]; color?: string; empty?: string }) {
  if (!items.length || items.every((i) => !i.count)) return <p className="empty">{empty}</p>;
  const max = Math.max(...items.map((i) => i.count));
  return (
    <ul className="rank-list">
      {items.map((item) => (
        <li key={item.name}>
          <span className="rank-name" title={item.name}>
            {item.name}
          </span>
          <span className="rank-value">{formatNumber(item.count)}</span>
          <span className="rank-track" aria-hidden="true">
            {item.count > 0 && <span className="rank-bar" style={{ width: `${(item.count / max) * 100}%`, background: color }} />}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Experience levels in order (2, 3, 4, 5 years) as columns, each with its count printed above it; the
// most common level is called out in a sentence first.
export function ExperienceColumns({ items, color = 'var(--accent)' }: { items: NamedCount[]; color?: string }) {
  const total = items.reduce((n, i) => n + i.count, 0);
  if (!total) return <p className="empty">No data yet.</p>;
  const max = Math.max(...items.map((i) => i.count));
  const top = items.find((i) => i.count === max);
  return (
    <div className="exp-chart">
      <p className="exp-insight">
        Most jobs ask for <strong>{top?.name}</strong> <span className="muted">· {percent(max, total)} of them</span>
      </p>
      <ul className="exp-columns">
        {items.map((item) => (
          <li key={item.name} title={`${item.name}: ${formatNumber(item.count)} jobs (${percent(item.count, total)})`}>
            <span className="sr-only">
              {item.name}: {formatNumber(item.count)} jobs
            </span>
            <span className="exp-track" aria-hidden="true">
              <span className="exp-value">{formatNumber(item.count)}</span>
              {/* The tallest column fills 82% of the space, leaving room for its count above it. */}
              {item.count > 0 && <span className="exp-bar" style={{ height: `${(item.count / max) * 82}%`, background: color }} />}
            </span>
            <span className="exp-label" aria-hidden="true">
              {item.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Who is hiring, where, and for how much experience, in the selected period.
export default function Insights({ state, experienceRange }: { state: ApiState<InsightsResponse>; experienceRange: ExperienceRange }) {
  const data = state.data;
  const experience = experienceBands(experienceRange).map((band) => ({ name: band.label, count: data?.experience[band.id] ?? 0 }));

  return (
    <div className={`grid-3 ${state.loading ? 'is-loading' : ''}`}>
      <section className="card">
        <CardHeader level={3} icon={<BuildingIcon />} title="Top hiring companies" description="Most new openings in this period" />
        <RankList items={data?.companies ?? []} />
      </section>
      <section className="card">
        <CardHeader level={3} icon={<MapPinIcon />} title="Top cities" description="Where the openings are" />
        <RankList items={data?.cities ?? []} />
      </section>
      <section className="card card-grow">
        <CardHeader level={3} icon={<BriefcaseIcon />} title="Experience asked for" description="Minimum years in the job post" />
        <ExperienceColumns items={data?.total ? experience : []} />
      </section>
    </div>
  );
}
