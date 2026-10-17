import type { Period } from '@/lib/format';

export default function PeriodTabs({ periods, days, onChange }: { periods: Period[]; days: number; onChange: (days: number) => void }) {
  return (
    <nav className="period-tabs" aria-label="Time period">
      {periods.map((p) => (
        <button key={p.days} type="button" aria-pressed={p.days === days} onClick={() => onChange(p.days)}>
          {p.tab}
        </button>
      ))}
    </nav>
  );
}
