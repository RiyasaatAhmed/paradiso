/**
 * The bar across the top, which belongs to no screen.
 *
 * It used to live inside the home screen, which meant it vanished the moment
 * you opened a folder or a title -- the app lost its name exactly when you were
 * deepest in it and most likely to want out. It is now a peer of the screens,
 * and the only thing that hides it is the player, where anything laid over the
 * film is an intrusion.
 */

import { api } from '../core/api.ts';
import { byId } from '../core/dom.ts';
import type { Store } from '../core/store.ts';

export interface Header {
  readonly element: HTMLElement;
  /** Redraw the toggle's label after the store changes underneath it. */
  sync(): void;
  setHidden(hidden: boolean): void;
  /**
   * On the home screen the bar is transparent until the billboard scrolls away.
   * Over any other screen it is always filled, because there is no billboard
   * behind it to be transparent against.
   */
  setAlwaysFilled(filled: boolean): void;
}

export interface HeaderOptions {
  store: Store;
  /** The wordmark is a way home from anywhere. */
  onHome: () => void;
  /** The library changed, so whatever is on screen needs redrawing. */
  onLibraryChanged: () => void;
  onFailure: (message: string) => void;
}

export function createHeader({
  store,
  onHome,
  onLibraryChanged,
  onFailure,
}: HeaderOptions): Header {
  const root = byId('topbar');
  const brand = byId<HTMLButtonElement>('brandHome');
  const toggleButton = byId<HTMLButtonElement>('toggleAll');
  const rescanButton = byId<HTMLButtonElement>('rescan');

  let alwaysFilled = false;

  function paint(): void {
    const filled = alwaysFilled || window.pageYOffset > 40;
    root.className = filled ? 'topbar solid' : 'topbar';
  }

  function sync(): void {
    toggleButton.textContent = store.showAll ? 'Hide small files' : 'Show everything';
    toggleButton.className = store.showAll ? 'chip on' : 'chip';
  }

  brand.addEventListener('click', onHome);

  toggleButton.addEventListener('click', () => {
    store.toggleShowAll();
    sync();
    onLibraryChanged();
  });

  rescanButton.addEventListener('click', () => {
    rescanButton.textContent = 'Scanning…';
    void api
      .rescan()
      .then(() => store.refresh())
      .then(onLibraryChanged)
      .catch(() => onFailure('Rescan failed.'))
      .finally(() => {
        rescanButton.textContent = 'Rescan';
      });
  });

  window.addEventListener('scroll', paint);

  return {
    element: root,
    sync,

    setHidden(hidden) {
      root.hidden = hidden;
    },

    setAlwaysFilled(filled) {
      alwaysFilled = filled;
      paint();
    },
  };
}
