import type { LibraryItem, MediaResponse, ResumePosition } from '../../shared/contracts.ts';
import { api } from './api.ts';

// Anything shorter than this counts as "not really started".
const MIN_RESUME_SECONDS = 30;

export interface Store {
  readonly items: LibraryItem[];
  readonly continueWatching: LibraryItem[];
  readonly byFolder: Map<string, LibraryItem[]>;
  refresh(): Promise<void>;
  find(id: string): LibraryItem | null;
  progressFor(id: string): ResumePosition | null;
  describe(id: string): Promise<MediaResponse>;
}

/**
 * Everything the UI knows about the library, in one place.
 *
 * Views read from here and never from each other, so there is a single answer
 * to "what is on screen and how far through it are we".
 */
export function createStore(): Store {
  let items: LibraryItem[] = [];
  let progress: Record<string, ResumePosition> = {};
  const metaCache = new Map<string, MediaResponse>();

  const store: Store = {
    /**
     * Everything the scan found.
     *
     * There was once a size filter here, hiding anything below a configured
     * number of megabytes so that screen recordings stayed out of the way. It
     * cost more than it saved: a folder of short episodes is indistinguishable
     * from clutter by size alone, so the filter hid whole collections and the
     * button that undid it had to be found first. Folders you genuinely never
     * want are better named in `exclude`, which says what it means.
     */
    get items() {
      return items;
    },

    /** Titles worth returning to, most recently watched first. */
    get continueWatching() {
      return store.items
        .filter((item) => store.progressFor(item.id))
        .sort((a, b) => (progress[b.id]?.at ?? 0) - (progress[a.id]?.at ?? 0));
    },

    /**
     * Items grouped by folder.
     *
     * Newest-first within a folder, except where the folder holds episodes --
     * a series has an order of its own, and showing it in download order makes
     * a season unreadable. Mixed folders fall back to newest-first, since a
     * partial episode ordering would be more confusing than none.
     */
    get byFolder() {
      const groups = new Map<string, LibraryItem[]>();
      for (const item of store.items) {
        const group = groups.get(item.folder);
        if (group) group.push(item);
        else groups.set(item.folder, [item]);
      }

      // Checked as a number rather than against null, so a response that
      // predates the field -- an older server still running -- falls back to
      // newest-first instead of sorting everything by zero and appearing to do
      // nothing at all.
      for (const group of groups.values()) {
        if (group.every((item) => typeof item.episode === 'number')) {
          group.sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
        }
      }
      return groups;
    },

    async refresh() {
      const data = await api.fetchLibrary();
      items = data.items;
      progress = data.progress ?? {};
    },

    find(id) {
      return items.find((item) => item.id === id) ?? null;
    },

    progressFor(id) {
      const saved = progress[id];
      return saved && saved.seconds > MIN_RESUME_SECONDS ? saved : null;
    },

    /** Probe results are immutable for a given file, so they are cached forever. */
    async describe(id) {
      const cached = metaCache.get(id);
      if (cached) return cached;
      const loaded = await api.fetchMedia(id);
      metaCache.set(id, loaded);
      return loaded;
    },
  };

  return store;
}
