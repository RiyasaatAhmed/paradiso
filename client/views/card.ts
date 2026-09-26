/**
 * One title, as a focusable card.
 *
 * Both the home rows and the browse grid are made of these, so the markup lives
 * here rather than in either screen -- a card looks the same wherever it is, and
 * only its container decides how it is arranged.
 */

import type { LibraryItem } from '../../shared/contracts.ts';
import { api } from '../core/api.ts';
import { el, focusableButton } from '../core/dom.ts';
import { folderName, formatDuration } from '../core/format.ts';
import type { Store } from '../core/store.ts';

export interface CardOptions {
  store: Store;
  item: LibraryItem;
  onSelect: (item: LibraryItem) => void;
  /** The home screen previews the focused title in its billboard; the grid does not. */
  onFocus?: (item: LibraryItem) => void;
  /** What to print under the title. The grid is already inside one folder. */
  subtitle?: string;
}

export function buildCard({ store, item, onSelect, onFocus, subtitle }: CardOptions): HTMLElement {
  const card = focusableButton('card', null, () => onSelect(item));
  card.setAttribute('data-id', item.id);
  card.appendChild(buildThumb(store, item));
  card.appendChild(el('div', 'card-title', item.title));
  // The folder's name, never its path: a card is too narrow to spend half its
  // width on the route to the file.
  card.appendChild(el('div', 'card-sub', subtitle ?? folderName(item.folder)));

  if (onFocus) card.addEventListener('focus', () => onFocus(item));
  return card;
}

function buildThumb(store: Store, item: LibraryItem): HTMLElement {
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
  // How long it runs, which is what you weigh before starting something. Size
  // only stands in when the file could not be read at all.
  thumb.appendChild(
    el('span', 'badge', item.duration ? formatDuration(item.duration) : item.sizeLabel)
  );

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

/**
 * The card that ends a shortened row. It is a card rather than a link so the
 * remote reaches it by simply carrying on to the right, which is exactly where
 * someone who has run out of row is already heading.
 */
export function buildSeeAllCard(total: number, onOpen: () => void): HTMLElement {
  const card = focusableButton('card see-all', null, onOpen);
  const face = el('div', 'thumb see-all-face');
  face.appendChild(el('div', 'see-all-count', String(total)));
  face.appendChild(el('div', 'see-all-label', 'See all'));
  card.appendChild(face);
  card.appendChild(el('div', 'card-title', 'See all'));
  card.appendChild(el('div', 'card-sub', `${total} videos`));
  return card;
}
