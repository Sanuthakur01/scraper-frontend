import { experienceBands, formatNumber, percent, type ExperienceRange } from '@/lib/format';
import { useDataView } from '@/lib/dataView';
import type { ShowJobs } from '@/lib/jobFilters';
import type { ApiState, InsightsResponse, NamedCount } from '@/lib/types';
import { BriefcaseIcon, BuildingIcon, MapPinIcon } from './Icons';
import { CardHeader, SectionError } from './PageParts';

// A bar's name and count; id when the filter value differs from the name (e.g. experience '5' = "5 yrs").
export type ChartItem = NamedCount & { id?: string };

const itemKey = (item: ChartItem) => item.id ?? item.name;
// aria-pressed only where a row stays selected (a course page's list); the dashboard's panel opens instead.
const pressed = (selected: string | undefined, item: ChartItem) => (selected === undefined ? undefined : selected === itemKey(item));

// A single-series ranked list: name, bar, value. The value is always printed, so nothing depends on hover.
// The default colour is the brand colour, which stands for "all courses" (a course's own list uses its colour).
// With onSelect, each row is a button that shows the jobs it counts; selected is the row shown now.
export function RankList({
  items,
  color = 'var(--accent)',
  empty = 'No data yet.',
  onSelect,
  selected,
}: {
  items: ChartItem[];
  color?: string;
  empty?: string;
  onSelect?: (item: ChartItem) => void;
  selected?: string;
}) {
  if (!items.length || items.every((i) => !i.count)) return <p className="empty">{empty}</p>;
  const max = Math.max(...items.map((i) => i.count));
  return (
    <ul className="rank-list">
      {items.map((item) => {
        const content = (
          <>
            <span className="rank-name" title={item.name}>
              {item.name}
            </span>
            <span className="rank-value">{formatNumber(item.count)}</span>
            <span className="rank-track" aria-hidden="true">
              {item.count > 0 && <span className="rank-bar" style={{ width: `${(item.count / max) * 100}%`, background: color }} />}
            </span>
          </>
        );
        return (
          <li key={itemKey(item)}>
            {onSelect ? (
              <button
                type="button"
                className="rank-row"
                aria-pressed={pressed(selected, item)}
                disabled={!item.count}
                onClick={() => onSelect(item)}
              >
                {content}
              </button>
            ) : (
              <div className="rank-row">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Experience levels in order (2, 3, 4, 5 years) as columns, each with its count printed above it; the
// most common level is called out in a sentence first. With onSelect, each column is a button.
export function ExperienceColumns({
  items,
  color = 'var(--accent)',
  onSelect,
  selected,
}: {
  items: ChartItem[];
  color?: string;
  onSelect?: (item: ChartItem) => void;
  selected?: string;
}) {
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
        {items.map((item) => {
          const content = (
            <>
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
            </>
          );
          return (
            <li key={itemKey(item)} title={`${item.name}: ${formatNumber(item.count)} jobs (${percent(item.count, total)})`}>
              {onSelect ? (
                <button
                  type="button"
                  className="exp-col"
                  aria-pressed={pressed(selected, item)}
                  disabled={!item.count}
                  onClick={() => onSelect(item)}
                >
                  {content}
                </button>
              ) : (
                <div className="exp-col">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Who is hiring, where, and for how much experience, in the selected period. Clicking a bar shows its jobs.
export default function Insights({
  state,
  experienceRange,
  onSelect,
}: {
  state: ApiState<InsightsResponse>;
  experienceRange: ExperienceRange;
  onSelect: ShowJobs;
}) {
  const data = state.data;
  const { view } = useDataView();
  const experience = experienceBands(experienceRange, view).map((band) => ({ id: band.id, name: band.label, count: data?.experience[band.id] ?? 0 }));

  if (state.error) return <SectionError what="who is hiring" error={state.error} onRetry={state.reload} />;

  return (
    <div className={`grid-3 ${state.loading ? 'is-loading' : ''}`}>
      <section className="card">
        <CardHeader level={3} icon={<BuildingIcon />} title="Top hiring companies" description="Most new openings in this period" />
        <RankList items={data?.companies ?? []} onSelect={(item) => onSelect({ company: item.name }, `Jobs at ${item.name}`)} />
      </section>
      <section className="card">
        <CardHeader level={3} icon={<MapPinIcon />} title="Top cities" description="Where the new openings are" />
        <RankList
          items={data?.cities ?? []}
          onSelect={(item) => onSelect({ city: item.name }, item.name === 'Remote' ? 'Remote jobs' : `Jobs in ${item.name}`)}
        />
      </section>
      <section className="card card-grow">
        <CardHeader level={3} icon={<BriefcaseIcon />} title="Experience asked for" description="Minimum years in the job post" />
        <ExperienceColumns
          items={data?.total ? experience : []}
          onSelect={(item) => onSelect({ exp: item.id }, `Jobs asking for ${item.name} of experience`)}
        />
      </section>
    </div>
  );
}
