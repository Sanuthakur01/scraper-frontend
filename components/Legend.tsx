import { COURSE_COLORS } from '@/lib/format';
import type { Course } from '@/lib/types';

// kind "rect" for bars, "line" for line charts: the key mirrors the mark.
export default function Legend({ courses, kind = 'rect' }: { courses: Course[]; kind?: 'rect' | 'line' }) {
  return (
    <ul className="legend">
      {courses.map((c) => (
        <li key={c.id}>
          <span className={kind === 'line' ? 'key-line' : 'swatch'} style={{ background: COURSE_COLORS[c.id] }} aria-hidden="true" />
          {c.name}
        </li>
      ))}
    </ul>
  );
}
