import type { Meta } from '@/lib/types';

// States the rules every job on the page passed (set in server/src/config/filters.js).
export default function FilterNote({ filters }: { filters: Meta['filters'] }) {
  const { min, max } = filters.experience;
  const companies = filters.excludedCompanies;
  return (
    <p className="filter-note">
      Only jobs asking for {min}–{max} years of experience · Excluding large IT services firms (
      <span title={companies.join(', ')}>{companies.slice(0, 4).join(', ')} and {companies.length - 4} more</span>)
    </p>
  );
}
