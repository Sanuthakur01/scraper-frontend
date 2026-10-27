'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useDataView, type DataView } from '@/lib/dataView';

// The Filtered / Non-filtered / All switch in the top bar: a segmented control of three. Each segment
// chooses its own set, so choosing the one already shown changes nothing (Apple's Segmented controls: a
// control that shows a selection never acts like a button). Filtered = the jobs the dashboard counts,
// Non-filtered = the jobs our filters leave out (its knob amber), All = both together. Each segment is as
// wide as its label (the top bar has little room), so the knob is placed under the chosen one by measuring it.
const SEGMENTS: { view: DataView; label: string; title: string }[] = [
  { view: 'filtered', label: 'Filtered', title: 'Filtered: the jobs the dashboard counts' },
  { view: 'nonfiltered', label: 'Non-filtered', title: 'Non-filtered: the jobs our filters leave out' },
  { view: 'all', label: 'All', title: 'All: the Filtered and Non-filtered jobs together' },
];

export default function DataViewToggle() {
  const { view, ready, setView } = useDataView();
  const box = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<{ left: number; width: number } | null>(null);

  // Before the first paint and whenever the switch changes size (a font loading, a phone turning).
  useLayoutEffect(() => {
    const segments = box.current;
    if (!segments) return;
    const place = () => {
      const chosen = segments.querySelector<HTMLElement>('button[aria-pressed="true"]');
      if (chosen) setKnob({ left: chosen.offsetLeft, width: chosen.offsetWidth });
    };
    place();
    const resized = new ResizeObserver(place);
    resized.observe(segments);
    return () => resized.disconnect();
  }, [view]);

  return (
    <div ref={box} className={`view-switch is-${view}`} role="group" aria-label="Jobs to show">
      <span
        className="view-switch-knob"
        aria-hidden="true"
        style={knob ? { width: knob.width, transform: `translateX(${knob.left}px)` } : undefined}
      />
      {SEGMENTS.map((segment) => (
        <button
          key={segment.view}
          type="button"
          aria-pressed={view === segment.view}
          disabled={!ready}
          onClick={() => setView(segment.view)}
          title={segment.title}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}
