/**
 * Driving the browser's history.
 *
 * The screens were already a stack -- player over detail over grid over home --
 * so this does not invent navigation, it names what was there. What it buys is
 * a browser Back button that agrees with the remote's Back key, a page that
 * survives a refresh, and an address you can send someone.
 *
 * Deliberately not a router: nothing here decides what a route means or touches
 * a screen. It pushes, replaces, and remembers how deep it is. The single place
 * that turns a route into visible screens is the composition root.
 */

import { routePath, sameRoute, type Route } from './routes.ts';

interface Entry {
  /** How many entries this app has pushed. 0 means we arrived here directly. */
  depth: number;
}

export interface HistoryRouter {
  readonly current: Route;
  /** A new entry, so Back returns to where we were. */
  go(route: Route): void;
  /** Correct the current entry without adding one. */
  replace(route: Route): void;
  /**
   * Step back one screen. Uses real history so the browser's own Back button
   * and the remote's Back key take the same path, and falls back to replacing
   * the entry when there is nothing of ours to go back to -- which is exactly
   * what happens when someone opens a deep link directly.
   */
  back(fallback: Route): void;
}

export function createHistoryRouter(
  parse: (pathname: string) => Route,
  onRoute: (route: Route) => void
): HistoryRouter {
  const depthOf = (): number => (window.history.state as Entry | null)?.depth ?? 0;

  const router: HistoryRouter = {
    get current() {
      return parse(window.location.pathname);
    },

    go(route) {
      if (sameRoute(route, router.current)) return;
      const entry: Entry = { depth: depthOf() + 1 };
      window.history.pushState(entry, '', routePath(route));
    },

    replace(route) {
      const entry: Entry = { depth: depthOf() };
      window.history.replaceState(entry, '', routePath(route));
    },

    back(fallback) {
      if (depthOf() > 0) {
        window.history.back();
        return;
      }
      router.replace(fallback);
      onRoute(fallback);
    },
  };

  window.addEventListener('popstate', () => onRoute(router.current));
  return router;
}
