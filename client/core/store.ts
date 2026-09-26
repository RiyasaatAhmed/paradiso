import type { LibraryItem, MediaResponse, ResumePosition } from '../../shared/contracts.ts';
import { api } from './api.ts';

// Anything shorter than this counts as "not really started".
const MIN_RESUME_SECONDS = 30;

export interface Store {
  readonly minSizeMB: number;
  readonly showAll: boolean;
  readonly totalCount: number;
  readonly visibleItems: LibraryItem[];
  readonly continueWatching: LibraryItem[];
  readonly byFolder: Map<string, LibraryItem[]>;
  toggleShowAll(): void;
  setShowAll(value: boolean): void;
  /** Whether a folder exists at all, filter or no filter. */
  hasFolder(folder: string): boolean;
  refresh(): Promise<void>;
  /** Across everything, not only what is currently visible: a link may name a
   *  file the size filter is hiding. */
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
  let minSizeMB = 0;
  let showAll = false;
  const metaCache = new Map<string, MediaResponse>();

  const store: Store = {
    get minSizeMB() {
      return minSizeMB;
    },

    get showAll() {
      return showAll;
    },

    get totalCount() {
      return items.length;
    },

    /** What the home screen shows: everything, or only the sizeable files. */
    get visibleItems() {
      return showAll ? items : items.filter((item) => !item.small);
    },

    /** Titles worth returning to, most recently watched first. */
    get continueWatching() {
      return store.visibleItems
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
      for (const item of store.visibleItems) {
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

    toggleShowAll() {
      showAll = !showAll;
    },

    setShowAll(value) {
      showAll = value;
    },

    hasFolder(folder) {
      return items.some((item) => item.folder === folder);
    },

    async refresh() {
      const data = await api.fetchLibrary();
      items = data.items;
      progress = data.progress ?? {};
      minSizeMB = data.minSizeMB;
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
