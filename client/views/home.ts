import type { LibraryItem } from '../../shared/contracts.ts';
import { api } from '../core/api.ts';
import { appendAll, byId, clear, el, focusableButton } from '../core/dom.ts';
import { formatDuration } from '../core/format.ts';
import type { FocusManager } from '../navigation/focus.ts';
import type { Store } from '../core/store.ts';

export interface HomeScreen {
  readonly element: HTMLElement;
  render(): void;
  showFailure(message: string): void;
  focusItem(id: string | null): void;
}

export interface HomeOptions {
  store: Store;
  focus: FocusManager;
  onSelect: (item: LibraryItem) => void;
  onPlay: (item: LibraryItem, seconds: number) => void;
}

/**
 * The home screen: a billboard over horizontal rows.
 *
 * The billboard follows whatever the remote is resting on, so moving along a row
 * continuously previews titles -- the behaviour that makes a Netflix home screen
 * feel alive rather than like a file listing.
 */
export function createHomeScreen({ store, focus, onSelect, onPlay }: HomeOptions): HomeScreen {
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
    for (const [folder, group] of store.byFolder) rows.appendChild(buildRow(folder, group));
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

  function buildRow(title: string, items: readonly LibraryItem[]): HTMLElement {
    const row = el('div', 'row');
    row.appendChild(el('h2', 'row-title', title));
    const track = el('div', 'row-track');
    for (const item of items) track.appendChild(buildCard(item));
    row.appendChild(track);
    return row;
  }

  function buildCard(item: LibraryItem): HTMLElement {
    const card = focusableButton('card', null, () => onSelect(item));
    card.setAttribute('data-id', item.id);
    card.appendChild(buildThumb(item));
    card.appendChild(el('div', 'card-title', item.title));
    card.appendChild(el('div', 'card-sub', item.folder));

    card.addEventListener('focus', () => {
      if (featured !== item) renderBillboard(item);
    });
    return card;
  }

  function buildThumb(item: LibraryItem): HTMLElement {
    const thumb = el('div', 'thumb');

    const image = el('img');
    image.alt = '';
    image.loading = 'lazy';
    image.src = api.posterUrl(item.id);
    image.addEventListener('error', () => {
      image.remove();
      thumb.appendChild(el('div', 'fallback', '▶'));
    });
    thumb.appendChild(image);
    thumb.appendChild(el('span', 'badge', item.sizeLabel));

    const saved = store.progressFor(item.id);
    if (saved && saved.duration) {
      const bar = el('div', 'resume-bar');
      const fill = el('span');
      fill.style.width = `${Math.min(100, (saved.seconds / saved.duration) * 100)}%`;
      bar.appendChild(fill);
      thumb.appendChild(bar);
    }

    return thumb;
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
      const card = id ? rows.querySelector<HTMLElement>(`[data-id="${id}"]`) : null;
      if (card) focus.set(card);
      else focus.firstMatching('.card');
    },
  };
}
