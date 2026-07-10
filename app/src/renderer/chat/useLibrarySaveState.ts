/**
 * Library-save button state for `ResearchProgress`'s reference rows (Task
 * T45, FR-LIB-001). Split out of `ResearchProgress.tsx` (file-size-limit).
 *
 * `savedKeys` holds every paper already in the library (fetched once on
 * mount, so re-opening a finished research result shows correct ✔ marks
 * immediately), and `rowStatus` holds per-row overrides once the user
 * actually clicks a save button (which always wins over `savedKeys` for
 * that row). Uses `createLibraryScreenCallbacks` directly (not a prop) —
 * see `ResearchProgress.tsx`'s doc comment for why.
 */
import { useEffect, useState } from 'react';

import { createLibraryScreenCallbacks } from '../appCallbacks';
import { buildSavedKeySet, paperKey } from '../library/libraryLogic';
import type { ResearchPaperView } from './chatTypes';
import type { SaveStatus } from './researchReferenceRow';

export interface LibrarySaveState {
  statusFor(paper: ResearchPaperView): SaveStatus;
  save(paper: ResearchPaperView): void;
}

export function useLibrarySaveState(): LibrarySaveState {
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [rowStatus, setRowStatus] = useState<Record<string, SaveStatus>>({});

  useEffect(() => {
    let cancelled = false;
    createLibraryScreenCallbacks()
      .listLibrary()
      .then((result) => {
        if (!cancelled) {
          setSavedKeys(buildSavedKeySet(result.papers));
        }
      })
      .catch(() => {
        // Non-critical: the save buttons just fall back to "not yet known to
        // be saved" until the user clicks one, which still round-trips
        // through `library:save` and gets its own duplicate check.
      });
    return () => {
      cancelled = true;
    };
    // Runs once on mount — deliberately not re-run per research result, so a
    // freshly finished run reuses the same "already saved" snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function statusFor(paper: ResearchPaperView): SaveStatus {
    const key = paperKey(paper.metadata.source, paper.metadata.externalId);
    return rowStatus[key] ?? (savedKeys.has(key) ? 'saved' : 'idle');
  }

  async function saveAsync(paper: ResearchPaperView): Promise<void> {
    const key = paperKey(paper.metadata.source, paper.metadata.externalId);
    setRowStatus((prev) => ({ ...prev, [key]: 'saving' }));
    try {
      const result = await createLibraryScreenCallbacks().saveToLibrary(paper.metadata);
      if (result.ok) {
        setRowStatus((prev) => ({ ...prev, [key]: 'saved' }));
      } else if (result.reason === 'duplicate') {
        setRowStatus((prev) => ({ ...prev, [key]: 'duplicate' }));
      } else {
        setRowStatus((prev) => ({ ...prev, [key]: 'error' }));
      }
    } catch {
      setRowStatus((prev) => ({ ...prev, [key]: 'error' }));
    }
  }

  function save(paper: ResearchPaperView): void {
    void saveAsync(paper);
  }

  return { statusFor, save };
}
