'use client';

import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useDataView } from '@/lib/dataView';
import { AlertIcon } from './Icons';

const SWIPE_PX = 12; // a press that moves further than this sideways is a swipe, not a click

// The Filtered / Non-filtered switch, right of the light/dark button. Left = Filtered (the jobs the
// dashboard always showed), right = Non-filtered (the jobs our filters leave out). A click, Space or
// Enter flips it; a swipe or the arrow keys choose the side.
export default function DataViewToggle() {
  const { view, ready, setView } = useDataView();
  const nonFiltered = view === 'nonfiltered';
  const press = useRef<{ x: number } | null>(null);
  const swipedAt = useRef(0);

  const onPointerDown = (event: PointerEvent) => {
    press.current = { x: event.clientX };
  };
  const onPointerUp = (event: PointerEvent) => {
    const dx = press.current ? event.clientX - press.current.x : 0;
    press.current = null;
    if (Math.abs(dx) > SWIPE_PX) {
      swipedAt.current = Date.now();
      setView(dx > 0 ? 'nonfiltered' : 'filtered');
    }
  };
  const onClick = () => {
    if (Date.now() - swipedAt.current < 500) return; // the swipe already chose the side
    setView(nonFiltered ? 'filtered' : 'nonfiltered');
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setView(event.key === 'ArrowRight' ? 'nonfiltered' : 'filtered');
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={nonFiltered}
      aria-label="Non-filtered data"
      title={
        nonFiltered
          ? 'Showing Non-filtered data: the jobs our filters leave out. Click or swipe left for Filtered.'
          : 'Showing Filtered data. Click or swipe right for Non-filtered: the jobs our filters leave out.'
      }
      className={`view-switch ${nonFiltered ? 'on' : ''}`}
      disabled={!ready}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (press.current = null)}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <span className="view-switch-knob" aria-hidden="true" />
      <span className="view-switch-option" aria-hidden="true">
        Filtered
      </span>
      <span className="view-switch-option" aria-hidden="true">
        {nonFiltered && <AlertIcon size={13} />}
        Non-filtered
      </span>
    </button>
  );
}

// Under the top bar while Non-filtered data is shown, on every page: what it is, and the way back.
export function NonFilteredNote() {
  const { view, setView } = useDataView();
  if (view !== 'nonfiltered') return null;
  return (
    <div className="view-note" role="status">
      <div className="view-note-inner">
        <AlertIcon size={16} />
        <p>
          <strong>Non-filtered data.</strong> Jobs that fit your courses but our filters leave out: large IT services firms, too little
          experience, or experience not stated; and the jobs from our extra searches (MIS Executive, Business Analyst, Site Reliability
          Engineer). Every number and list on this page is about these jobs.
        </p>
        <button type="button" className="btn btn-sm" onClick={() => setView('filtered')}>
          Show filtered data
        </button>
      </div>
    </div>
  );
}
