import { useLayoutEffect, useRef, type FocusEvent, type MouseEvent, type ReactNode } from 'react';
import { COURSE_COLORS, formatNumber } from '@/lib/format';
import type { Course, CourseCounts, CourseId } from '@/lib/types';

// Where a hovered (or focused) mark is: the middle of its top edge, from the top left of its chart
// (the closest .tip-root, which the tooltip is drawn in), and its height.
export interface TipAt {
  x: number;
  y: number;
  h: number;
}

export function tipAt(event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, mark: Element = event.currentTarget): TipAt | null {
  const root = event.currentTarget.closest('.tip-root');
  if (!root) return null;
  const box = root.getBoundingClientRect();
  const r = mark.getBoundingClientRect();
  return { x: r.left - box.left + r.width / 2, y: r.top - box.top, h: r.height };
}

// Focus from the keyboard (Tab), not a click or focus handed back when a panel closes: only then does
// focusing a bar open its tooltip, so a mouse user is never left with one.
export const byKeyboard = (event: FocusEvent<HTMLElement>) => event.currentTarget.matches(':focus-visible');

// A tooltip above a mark, moved sideways as needed so it stays inside its chart (the card next door
// would otherwise cover it), and under the mark while the sticky header would hide its top.
export function ChartTip({ at, children }: { at: TipAt; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const root = el?.offsetParent;
    if (!el || !(root instanceof HTMLElement)) return;
    const place = () => {
      const half = el.offsetWidth / 2;
      el.style.left = `${Math.max(half, Math.min(at.x, root.clientWidth - half))}px`;
      el.style.top = `${at.y}px`;
      el.classList.remove('is-below');
      const header = document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0;
      if (el.getBoundingClientRect().top < Math.max(header, 0) + 8) {
        el.style.top = `${at.y + at.h}px`;
        el.classList.add('is-below');
      }
    };
    place();
    window.addEventListener('scroll', place, { passive: true });
    return () => window.removeEventListener('scroll', place);
  });
  return (
    <div ref={ref} className="tooltip" role="status">
      {children}
    </div>
  );
}

// What a tooltip says about a bar for all courses: its name and total, then every course's share in
// the legend's order and colours (current = the course under the pointer, marked). One course: the
// total alone.
export function CourseBreakdown({
  title,
  total,
  counts,
  courses,
  current,
  kind = 'rect',
  hint,
}: {
  title: string;
  total: number;
  counts?: CourseCounts;
  courses: Course[];
  current?: CourseId;
  kind?: 'rect' | 'line';
  hint?: string;
}) {
  return (
    <>
      <div className="tip-head">
        <span className="tooltip-title">{title}</span>
        <span className="tip-total">
          <strong>{formatNumber(total)}</strong> {total === 1 ? 'job' : 'jobs'}
        </span>
      </div>
      {counts && courses.length > 1 && (
        <div className="tip-courses">
          {courses.map((c) => {
            const n = counts[c.id] ?? 0;
            return (
              <div key={c.id} className={`tip-course${c.id === current ? ' is-current' : ''}${n ? '' : ' is-zero'}`}>
                <span className={kind === 'line' ? 'key-line' : 'swatch'} style={{ background: COURSE_COLORS[c.id] }} aria-hidden="true" />
                <span className="tip-course-name">{c.name}</span>
                <strong>{formatNumber(n)}</strong>
              </div>
            );
          })}
        </div>
      )}
      {hint && <span className="tooltip-hint">{hint}</span>}
    </>
  );
}
