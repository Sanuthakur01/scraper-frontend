'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Which jobs the whole dashboard shows: the kept ones ('filtered', the default) or the ones the keep
// rules leave out ('nonfiltered': large IT services firms, under the minimum experience, experience not
// stated, or from the extra searches). Every API call adds ?view=nonfiltered for the second (see
// useApi), so every page switches.
export type DataView = 'filtered' | 'nonfiltered';

interface DataViewState {
  view: DataView;
  ready: boolean; // false until the remembered choice is read, so nothing loads the wrong data first
  setView: (view: DataView) => void;
}

const DataViewContext = createContext<DataViewState>({ view: 'filtered', ready: true, setView: () => {} });

const STORAGE_KEY = 'dataView';

export function DataViewProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<DataView>('filtered');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'nonfiltered') setViewState('nonfiltered');
    } catch {
      // storage blocked (private window): Filtered
    }
    setReady(true);
  }, []);

  const setView = (next: DataView) => {
    setViewState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // not remembered, but switched for this visit
    }
  };

  return <DataViewContext.Provider value={{ view, ready, setView }}>{children}</DataViewContext.Provider>;
}

export const useDataView = () => useContext(DataViewContext);

// The API's view parameter: nothing for Filtered, so those requests are exactly as before.
export const viewParam = (view: DataView) => (view === 'nonfiltered' ? { view } : {});
