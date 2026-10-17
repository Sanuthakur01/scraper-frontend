import { COURSE_COLORS, experienceBands, formatNumber, type ExperienceRange } from '@/lib/format';
import type { ApiState, Course, InsightsResponse, NamedCount } from '@/lib/types';

// A single-series ranked list: name, bar, value. The value is always printed, so nothing depends on hover.
export function RankList({ items, color = 'var(--series-1)' }: { items: NamedCount[]; color?: string }) {
  if (!items.length) return <p className="empty">No data yet.</p>;
  const max = Math.max(...items.map((i) => i.count));
  return (
    <ul className="rank-list">
      {items.map((item) => (
        <li key={item.name}>
          <span className="rank-name" title={item.name}>
            {item.name}
          </span>
          <span className="rank-track">
            <span className="rank-bar" style={{ width: `${(item.count / max) * 100}%`, background: color }} />
          </span>
          <span className="rank-value">{formatNumber(item.count)}</span>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  courses: Course[];
  state: ApiState<InsightsResponse>;
  experienceRange: ExperienceRange;
}

export default function Insights({ courses, state, experienceRange }: Props) {
  const data = state.data;
  const experience = experienceBands(experienceRange).map((band) => ({ name: band.label, count: data?.experience[band.id] ?? 0 }));

  return (
    <div className={`insights ${state.loading ? 'is-loading' : ''}`}>
      <section className="card">
        <h2>Top hiring companies</h2>
        <RankList items={data?.companies ?? []} />
      </section>
      <section className="card">
        <h2>Top cities</h2>
        <RankList items={data?.cities ?? []} />
      </section>
      <section className="card">
        <h2>Experience asked for</h2>
        <RankList items={data?.total ? experience : []} />
      </section>
      <section className="card card-wide">
        <h2>Most-requested skills by course</h2>
        <div className="skills-grid">
          {courses.map((c) => (
            <div key={c.id}>
              <h3>
                <span className="swatch" style={{ background: COURSE_COLORS[c.id] }} aria-hidden="true" />
                {c.name}
              </h3>
              <RankList items={(data?.skills[c.id] ?? []).slice(0, 6)} color={COURSE_COLORS[c.id]} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
