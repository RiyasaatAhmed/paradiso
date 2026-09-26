/**
 * The four things the app can be showing, as addresses.
 *
 * Pure on purpose: no History API, no DOM. Parsing and formatting a URL is the
 * part with edge cases worth testing -- an id someone hand-edited, a folder
 * name full of slashes and brackets, a truncated escape sequence -- and it can
 * only be tested directly if it does not need a browser. The driving of actual
 * history lives next door in history.ts.
 */

export type Route =
  | { readonly name: 'home' }
  | { readonly name: 'folder'; readonly folder: string }
  | { readonly name: 'title'; readonly id: string }
  | { readonly name: 'watch'; readonly id: string };

export const HOME: Route = { name: 'home' };

/** Ids are the twelve hex characters the scan hashed, so anything else is not one. */
const ID = /^[0-9a-f]{12}$/;

export function routePath(route: Route): string {
  switch (route.name) {
    case 'folder':
      // A folder is a path relative to its library, so it contains slashes and
      // spaces. Encoding it whole keeps it one path segment.
      return `/folder/${encodeURIComponent(route.folder)}`;
    case 'title':
      return `/title/${route.id}`;
    case 'watch':
      return `/watch/${route.id}`;
    default:
      return '/';
  }
}

export function parseRoute(pathname: string): Route {
  const [, kind, ...rest] = pathname.split('/');
  const value = rest.join('/');
  if (!value) return HOME;

  try {
    if (kind === 'folder') return { name: 'folder', folder: decodeURIComponent(value) };
    if (kind === 'title' && ID.test(value)) return { name: 'title', id: value };
    if (kind === 'watch' && ID.test(value)) return { name: 'watch', id: value };
  } catch {
    // A malformed escape sequence is a bad link, not a crash.
  }
  return HOME;
}

export function sameRoute(a: Route, b: Route): boolean {
  return routePath(a) === routePath(b);
}
