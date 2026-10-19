import type { Period } from '@/lib/format';
import { Segmented } from './PageParts';

export default function PeriodTabs({ periods, days, onChange }: { periods: Period[]; days: number; onChange: (days: number) => void }) {
  return <Segmented label="Time period" value={days} onChange={onChange} options={periods.map((p) => ({ value: p.days, label: p.tab }))} />;
}
