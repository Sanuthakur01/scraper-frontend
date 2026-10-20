import { useEffect, useState } from 'react';
import { formatDay } from './format';

// The job list's filters, sent to GET /api/jobs (and jobs.csv) as they are. '' = not filtered. Each one
// is counted on the server the same way as the number it was clicked from (a card, a bar, a day), so
// the list holds exactly the jobs that number counts.
export interface JobFilters {
  course: string;
  platform: string; // listed on this site
  primary: string; // counted under this site: posted there first
  company: string;
  city: string;
  skill: string;
  exp: string; // experience: '2'…'5'
  age: string; // how old the post was when found (POSTING_AGES)
  day: string; // one IST day ('2026-10-17') instead of the period
  sites: string; // '2': listed on two or more sites
  salary: string; // 'shown': the post shows a salary
  q: string; // search text
}

export const NO_FILTERS: JobFilters = {
  course: '',
  platform: '',
  primary: '',
  company: '',
  city: '',
  skill: '',
  exp: '',
  age: '',
  day: '',
  sites: '',
  salary: '',
  q: '',
};

// Shows the jobs behind a number: on a course page in its job list, on the dashboard in a side panel
// (title says what was clicked).
export type ShowJobs = (filters: Partial<JobFilters>, title: string) => void;

// How old a post was when we found it (server: POSTING_AGE in routes.js).
export const POSTING_AGES: { id: string; label: string }[] = [
  { id: 'day', label: 'Under 1 day' },
  { id: '3days', label: '1–3 days' },
  { id: 'week', label: '4–7 days' },
  { id: 'month', label: '1–4 weeks' },
  { id: 'older', label: 'Over a month' },
  { id: 'unknown', label: 'Date not shown' },
];

// The filters that have no dropdown in the job list, as chip labels ("Company: EY").
export function filterChips(f: JobFilters): { key: keyof JobFilters; label: string }[] {
  const chips: { key: keyof JobFilters; label: string }[] = [];
  if (f.day) chips.push({ key: 'day', label: `Found on ${formatDay(f.day)}` });
  if (f.primary) chips.push({ key: 'primary', label: `First posted on ${f.primary}` });
  if (f.company) chips.push({ key: 'company', label: `Company: ${f.company}` });
  if (f.skill) chips.push({ key: 'skill', label: `Skill: ${f.skill}` });
  if (f.age) chips.push({ key: 'age', label: `Post age: ${POSTING_AGES.find((a) => a.id === f.age)?.label ?? f.age}` });
  if (f.sites) chips.push({ key: 'sites', label: 'Listed on 2+ sites' });
  if (f.salary) chips.push({ key: 'salary', label: 'Salary shown' });
  return chips;
}

// The job list's filters, kept by the page that shows the list so other parts of the page (cards,
// charts) can set them too.
export function useJobFilters() {
  const [filters, setFilters] = useState<JobFilters>(NO_FILTERS);
  const [search, setSearch] = useState(''); // as typed; filters.q follows it once typing pauses

  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Exactly these filters, every other one cleared (and the search box emptied).
  const show = (only: Partial<JobFilters>) => {
    setFilters({ ...NO_FILTERS, ...only });
    setSearch('');
  };
  // True when the list shows exactly these filters and nothing else.
  const showing = (only: Partial<JobFilters>) =>
    (Object.keys(NO_FILTERS) as (keyof JobFilters)[]).every((key) => filters[key] === (only[key] ?? ''));

  return { filters, setFilters, search, setSearch, show, showing };
}

export type JobFilterState = ReturnType<typeof useJobFilters>;
