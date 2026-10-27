'use client';

import { useDataView } from '@/lib/dataView';
import { AlertIcon } from './Icons';

// The Filtered / Non-filtered switch in the top bar: a segmented control of two. Each half chooses its
// own side, so choosing the side already shown changes nothing (Apple's Segmented controls: a control
// that shows a selection never acts like a button). Left = Filtered (the jobs the dashboard counts),
// right = Non-filtered (the jobs our filters leave out); the knob slides to the side shown.
export default function DataViewToggle() {
  const { view, ready, setView } = useDataView();
  const nonFiltered = view === 'nonfiltered';

  return (
    <div className={`view-switch ${nonFiltered ? 'on' : ''}`} role="group" aria-label="Jobs to show">
      <span className="view-switch-knob" aria-hidden="true" />
      <button
        type="button"
        aria-pressed={!nonFiltered}
        disabled={!ready}
        onClick={() => setView('filtered')}
        title="Filtered: the jobs the dashboard counts"
      >
        Filtered
      </button>
      <button
        type="button"
        aria-pressed={nonFiltered}
        disabled={!ready}
        onClick={() => setView('nonfiltered')}
        title="Non-filtered: the jobs our filters leave out"
      >
        {nonFiltered && <AlertIcon size={13} />}
        Non-filtered
      </button>
    </div>
  );
}
