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

// Under the top bar while Non-filtered data is shown, on every page: what it is, and the way back.
export function NonFilteredNote() {
  const { view, setView } = useDataView();
  if (view !== 'nonfiltered') return null;
  return (
    <div className="view-note" role="status">
      <div className="view-note-inner">
        <AlertIcon size={16} />
        <p>
          <strong>Non-filtered data.</strong> Jobs that fit your courses but our filters leave out: large IT services firms, fresher jobs,
          or experience not stated; and the jobs from our extra searches (MIS Executive, Business Analyst, Site Reliability
          Engineer). Every number and list on this page is about these jobs.
        </p>
        <button type="button" className="btn btn-sm" onClick={() => setView('filtered')}>
          Show filtered data
        </button>
      </div>
    </div>
  );
}
