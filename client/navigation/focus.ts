/**
 * Spatial focus.
 *
 * A TV remote sends four directions and nothing else, so focus cannot follow DOM
 * order -- pressing Right must land on whatever is physically to the right. Every
 * move is therefore resolved geometrically against the elements currently on
 * screen, which also means the UI can be rearranged without rewiring navigation.
 */

const FOCUS_CLASS = 'tv-focus';

// Drift across the axis of travel is penalised heavily, so a grid behaves like a
// grid instead of skipping diagonally into the next row.
const CROSS_AXIS_PENALTY = 3;
const MIN_TRAVEL_PX = 4;

export type Direction = 'left' | 'right' | 'up' | 'down';

export interface FocusManager {
  readonly current: HTMLElement | null;
  set(node: HTMLElement): void;
  clear(): void;
  first(): void;
  firstMatching(selector: string): void;
  move(direction: Direction): void;
}

interface Point {
  x: number;
  y: number;
}

const centreOf = (node: HTMLElement): Point => {
  const rect = node.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

const travelIn = (direction: Direction, dx: number, dy: number): number =>
  ({ left: -dx, right: dx, up: -dy, down: dy })[direction];

const driftIn = (direction: Direction, dx: number, dy: number): number =>
  direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);

/**
 * @param activeLayer returns the element currently accepting focus -- the player
 *   when it is open, otherwise the detail screen or the home screen. Keeps focus
 *   from escaping into a layer hidden behind the current one.
 */
export function createFocusManager({
  activeLayer,
}: {
  activeLayer: () => HTMLElement | null;
}): FocusManager {
  let current: HTMLElement | null = null;

  function candidates(): HTMLElement[] {
    const layer = activeLayer();
    if (!layer) return [];
    return Array.from(layer.querySelectorAll<HTMLElement>('[data-focus]')).filter(
      (node) => !node.hidden && node.offsetParent !== null
    );
  }

  function removeMarkers(): void {
    for (const node of document.querySelectorAll<HTMLElement>(`.${FOCUS_CLASS}`)) {
      node.classList.remove(FOCUS_CLASS);
    }
  }

  const manager: FocusManager = {
    get current() {
      return current;
    },

    set(node) {
      removeMarkers();
      node.classList.add(FOCUS_CLASS);
      current = node;

      try {
        node.focus({ preventScroll: true });
      } catch {
        node.focus();
      }
      // 'nearest' scrolls the row horizontally and the page vertically by the
      // smallest amount that reveals the element, which reads as far calmer
      // than snapping the focused item to an edge.
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },

    clear() {
      removeMarkers();
      current = null;
    },

    first() {
      const [firstNode] = candidates();
      if (firstNode) manager.set(firstNode);
    },

    /** Prefer a specific element, falling back to whatever is available. */
    firstMatching(selector) {
      const preferred = activeLayer()?.querySelector<HTMLElement>(selector);
      if (preferred) manager.set(preferred);
      else manager.first();
    },

    move(direction) {
      const options = candidates();
      if (options.length === 0) return;

      const anchor = current;
      if (!anchor || !options.includes(anchor)) {
        const [fallback] = options;
        if (fallback) manager.set(fallback);
        return;
      }

      const from = centreOf(anchor);
      let best: HTMLElement | null = null;
      let bestScore = Infinity;

      for (const option of options) {
        if (option === anchor) continue;
        const to = centreOf(option);
        const dx = to.x - from.x;
        const dy = to.y - from.y;

        const travel = travelIn(direction, dx, dy);
        if (travel <= MIN_TRAVEL_PX) continue; // behind us, or level with us

        const score = travel + driftIn(direction, dx, dy) * CROSS_AXIS_PENALTY;
        if (score < bestScore) {
          bestScore = score;
          best = option;
        }
      }

      if (best) manager.set(best);
    },
  };

  return manager;
}
