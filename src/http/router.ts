import type { IncomingMessage, ServerResponse } from 'node:http';

/** Everything a route handler needs. `params` holds the pattern's capture groups. */
export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: string[];
}

export type RouteHandler = (context: RouteContext) => void | Promise<void>;

interface Route {
  allowed: ReadonlySet<string>;
  pattern: RegExp;
  handler: RouteHandler;
}

export interface ResolvedRoute {
  handler: RouteHandler;
  params: string[];
}

/**
 * A router small enough to read in one sitting.
 *
 * Routes are matched in registration order against a regex, and capture groups
 * arrive as `params`. That is all this server needs -- a dependency would cost
 * more to justify than it saves.
 */
export class Router {
  readonly #routes: Route[] = [];

  add(methods: string | string[], pattern: RegExp, handler: RouteHandler): this {
    this.#routes.push({ allowed: new Set([methods].flat()), pattern, handler });
    return this;
  }

  /** GET implies HEAD, so range probes and link checkers work. */
  get(pattern: RegExp, handler: RouteHandler): this {
    return this.add(['GET', 'HEAD'], pattern, handler);
  }

  post(pattern: RegExp, handler: RouteHandler): this {
    return this.add('POST', pattern, handler);
  }

  resolve(method: string, pathname: string): ResolvedRoute | null {
    for (const route of this.#routes) {
      const match = route.pattern.exec(pathname);
      if (match && route.allowed.has(method)) {
        return { handler: route.handler, params: match.slice(1) };
      }
    }
    return null;
  }
}
