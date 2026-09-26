import type { LibraryItem } from '../../shared/contracts.ts';
import { api } from '../core/api.ts';
import { appendAll, byId, clear, el, focusableButton } from '../core/dom.ts';
import { folderName, formatDuration } from '../core/format.ts';
import type { FocusManager } from '../navigation/focus.ts';
import type { Store } from '../core/store.ts';
import { buildCard, buildSeeAllCard } from './card.ts';

/**
 * How many cards a row carries before it hands off to the grid.
 *
 * A row is for glancing along, and that stops working long before the items run
 * out -- twenty is already more than fits on screen at once. Everything past it
 * is reachable in two presses through the See all card, which is better than
 * being reachable in three hundred.
 */
const ROW_LIMIT = 20;

export interface HomeScreen {
  readonly element: HTMLElement;
  render(): void;
  showFailure(message: string): void;
  focusItem(id: string | null): void;
  focusFolder(folder: string): void;
}

export interface HomeOptions {
  store: Store;
  focus: FocusManager;
  onSelect: (item: LibraryItem) => void;
  onPlay: (item: LibraryItem, seconds: number) => void;
  onBrowse: (folder: string) => void;
}

/**
 * The home screen: a billboard over horizontal rows.
 *
 * The billboard follows whatever the remote is resting on, so moving along a row
 * continuously previews titles -- the behaviour that makes a Netflix home screen
 * feel alive rather than like a file listing.
 */
export function createHomeScreen({
  store,
  focus,
  onSelect,
  onPlay,
  onBrowse,
}: HomeOptions): HomeScreen {
  const root = byId('library');
  const rows = byId('rows');
  const billboard = byId('billboard');
  const emptyMessage = byId('empty');
  const toggleButton = byId<HTMLButtonElement>('toggleAll');
  const rescanButton = byId<HTMLButtonElement>('rescan');

  let featured: LibraryItem | null = null;

  function render(): void {
    const items = store.visibleItems;

    toggleButton.textContent = store.showAll ? 'Hide small files' : 'Show everything';
    toggleButton.className = store.showAll ? 'chip on' : 'chip';
    clear(rows);

    const first = items[0];
    if (!first) {
      showEmpty();
      return;
    }

    emptyMessage.hidden = true;
    rows.className = '';

    const resuming = store.continueWatching;
    renderBillboard(resuming[0] ?? first);

    if (resuming.length > 0) rows.appendChild(buildRow('Continue Watching', resuming));
    for (const [folder, group] of store.byFolder) {
      const row = buildRow(folderName(folder), group, () => onBrowse(folder));
      // The key, not the label: the label is shortened for reading and two
      // folders can share one.
      row.dataset['folder'] = folder;
      rows.appendChild(row);
    }
  }

  function showEmpty(): void {
    billboard.hidden = true;
    emptyMessage.hidden = false;
    emptyMessage.innerHTML =
      store.totalCount > 0 && !store.showAll
        ? `Nothing over ${store.minSizeMB} MB in your folders. Press <b>Show everything</b> to see the smaller files too.`
        : 'No videos found. Add folders to <code>config.json</code> and press <b>Rescan</b>.';
  }

  function renderBillboard(item: LibraryItem): void {
    featured = item;
    billboard.hidden = false;
    byId('billboardArt').style.backgroundImage = `url("${api.posterUrl(item.id)}")`;
    byId('billboardTitle').textContent = item.title;

    const saved = store.progressFor(item.id);
    const facts = [item.folder, item.sizeLabel];
    if (saved && saved.duration) facts.push(`${formatDuration(saved.duration - saved.seconds)} left`);

    const meta = clear(byId('billboardMeta'));
    facts.forEach((fact, index) => {
      if (index > 0) meta.appendChild(el('span', 'dot', '•'));
      meta.appendChild(el('span', '', fact));
    });

    appendAll(clear(byId('billboardActions')), [
      focusableButton('btn primary', saved ? '▶  Resume' : '▶  Play', () =>
        onPlay(item, saved ? saved.seconds : 0)
      ),
      focusableButton('btn', 'ⓘ  More Info', () => onSelect(item)),
    ]);
  }

  function buildRow(
    title: string,
    items: readonly LibraryItem[],
    onSeeAll?: () => void
  ): HTMLElement {
    const row = el('div', 'row');

    const heading = el('h2', 'row-title', title);
    if (items.length > ROW_LIMIT) {
      heading.appendChild(el('span', 'row-count', `${items.length}`));
    }
    row.appendChild(heading);

    const track = el('div', 'row-track');
    for (const item of items.slice(0, ROW_LIMIT)) track.appendChild(card(item));
    if (onSeeAll && items.length > ROW_LIMIT) {
      track.appendChild(buildSeeAllCard(items.length, onSeeAll));
    }

    row.appendChild(track);
    return row;
  }

  function card(item: LibraryItem): HTMLElement {
    return buildCard({
      store,
      item,
      onSelect,
      onFocus: (focused) => {
        if (featured !== focused) renderBillboard(focused);
      },
    });
  }

  function showFailure(message: string): void {
    billboard.hidden = true;
    clear(rows);
    rows.className = 'no-billboard';
    emptyMessage.hidden = false;
    emptyMessage.textContent = message;
  }

  toggleButton.addEventListener('click', () => {
    store.toggleShowAll();
    render();
    focus.firstMatching('.card');
  });

  rescanButton.addEventListener('click', () => {
    rescanButton.textContent = 'Scanning…';
    void api
      .rescan()
      .then(() => store.refresh())
      .then(() => {
        render();
        focus.firstMatching('.card');
      })
      .catch(() => showFailure('Rescan failed.'))
      .finally(() => {
        rescanButton.textContent = 'Rescan';
      });
  });

  // Transparent over the billboard, solid once the artwork has scrolled away.
  window.addEventListener('scroll', () => {
    byId('topbar').className = window.pageYOffset > 40 ? 'topbar solid' : 'topbar';
  });

  return {
    element: root,
    render,
    showFailure,

    /** Return focus to a specific title -- used when coming back from playback. */
    focusItem(id) {
      const target = id ? rows.querySelector<HTMLElement>(`[data-id="${id}"]`) : null;
      if (target) focus.set(target);
      else focus.firstMatching('.card');
    },

    /**
     * Coming back from the grid: land on the See all card that opened it, so
     * Back returns you to where you were rather than to the top of the screen.
     */
    focusFolder(folder) {
      const row = rows.querySelector<HTMLElement>(`.row[data-folder="${CSS.escape(folder)}"]`);
      const target =
        row?.querySelector<HTMLElement>('.see-all') ?? row?.querySelector<HTMLElement>('.card');
      if (target) focus.set(target);
      else focus.firstMatching('.card');
    },
  };
}
