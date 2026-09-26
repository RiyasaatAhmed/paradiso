/**
 * One folder, as a grid.
 *
 * A horizontal row is a browsing device: it shows a handful of things and
 * invites you to glance along them. Past roughly twenty items it stops being
 * that and becomes a corridor -- reaching episode 300 means three hundred
 * presses of Right, with no sense of where you are. This screen is what a row
 * hands off to.
 *
 * Two things make a grid of hundreds workable rather than merely different:
 * it wraps, so the eye scans in two dimensions instead of one, and it can be
 * crossed in a couple of presses through the jump rail. The spatial focus
 * engine needs no help here -- it already resolves moves geometrically, so a
 * wrapped grid behaves like a grid for free.
 */

import type { LibraryItem } from '../../shared/contracts.ts';
import { byId, clear, focusableButton } from '../core/dom.ts';
import type { Store } from '../core/store.ts';
import type { FocusManager } from '../navigation/focus.ts';
import { buildCard } from './card.ts';

/** Below this, the rail costs more attention than the scrolling it saves. */
const RAIL_THRESHOLD = 60;
const RAIL_STEP = 50;

export interface BrowseScreen {
  readonly element: HTMLElement;
  readonly isOpen: boolean;
  open(folder: string): void;
  close(): void;
  /** Redraw in place, so a resume bar appears after watching something. */
  refresh(): void;
  focusItem(id: string | null): void;
}

export interface BrowseOptions {
  store: Store;
  focus: FocusManager;
  onSelect: (item: LibraryItem) => void;
  /** Hands focus back to the row the grid was opened from. */
  onBack: (folder: string) => void;
}

export function createBrowseScreen({
  store,
  focus,
  onSelect,
  onBack,
}: BrowseOptions): BrowseScreen {
  const root = byId('browse');
  const titleNode = byId('browseTitle');
  const countNode = byId('browseCount');
  const rail = byId('browseRail');
  const grid = byId('browseGrid');

  let open = false;
  let current = '';

  function render(folder: string): void {
    const items = store.byFolder.get(folder) ?? [];

    titleNode.textContent = folder;
    countNode.textContent = `${items.length} videos`;

    clear(grid);
    items.forEach((item, index) => {
      const card = buildCard({
        store,
        item,
        onSelect,
        // Inside one folder the folder name is on every card and says nothing.
        subtitle: item.sizeLabel,
      });
      card.setAttribute('data-index', String(index));
      grid.appendChild(card);
    });

    renderRail(items.length);
  }

  /**
   * Ranges rather than letters. These filenames all share a prefix, so an
   * alphabetical index would be one bucket holding everything; the episode
   * number is the axis that actually spreads them out.
   */
  function renderRail(total: number): void {
    clear(rail);
    rail.hidden = total <= RAIL_THRESHOLD;
    if (rail.hidden) return;

    for (let start = 0; start < total; start += RAIL_STEP) {
      const end = Math.min(start + RAIL_STEP, total);
      const chip = focusableButton('chip', `${start + 1}–${end}`, () => jumpTo(start));
      rail.appendChild(chip);
    }
  }

  /** Move focus into the grid at a position, which scrolls it into view. */
  function jumpTo(index: number): void {
    const card = grid.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (card) focus.set(card);
  }

  return {
    element: root,

    get isOpen() {
      return open;
    },

    open(folder) {
      current = folder;
      render(folder);
      root.hidden = false;
      open = true;
      root.scrollTop = 0;
      focus.firstMatching('.card');
    },

    close() {
      root.hidden = true;
      open = false;
      clear(grid);
      onBack(current);
    },

    refresh() {
      if (open) render(current);
    },

    focusItem(id) {
      const card = id ? grid.querySelector<HTMLElement>(`[data-id="${id}"]`) : null;
      if (card) focus.set(card);
      else focus.firstMatching('.card');
    },
  };
}
