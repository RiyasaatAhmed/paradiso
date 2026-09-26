/**
 * Translates key events into intentions.
 *
 * TV remotes do not agree with each other or with desktop browsers: Samsung's
 * Back key is 10009, some sets send 461, browsers send Escape, and the media
 * keys have their own codes entirely. Mapping that mess once here keeps every
 * screen dealing in actions like BACK and SELECT rather than key codes.
 */

import type { Direction } from './focus.ts';

export const Action = {
  LEFT: 'left',
  RIGHT: 'right',
  UP: 'up',
  DOWN: 'down',
  SELECT: 'select',
  BACK: 'back',
  PLAY_PAUSE: 'playPause',
  REWIND: 'rewind',
  FORWARD: 'forward',
  STOP: 'stop',
  FULLSCREEN: 'fullscreen',
} as const;

export type Action = (typeof Action)[keyof typeof Action];

const BY_KEY_CODE: Record<number, Action> = {
  37: Action.LEFT,
  38: Action.UP,
  39: Action.RIGHT,
  40: Action.DOWN,
  13: Action.SELECT,
  // Back: Tizen's own code, plus the variants other sets and browsers send.
  10009: Action.BACK,
  461: Action.BACK,
  27: Action.BACK,
  8: Action.BACK,
  // Media keys present on most remotes.
  10252: Action.PLAY_PAUSE,
  415: Action.PLAY_PAUSE,
  19: Action.PLAY_PAUSE,
  412: Action.REWIND,
  417: Action.FORWARD,
  413: Action.STOP,
};

const BY_KEY_NAME: Record<string, Action> = {
  ArrowLeft: Action.LEFT,
  ArrowRight: Action.RIGHT,
  ArrowUp: Action.UP,
  ArrowDown: Action.DOWN,
  Enter: Action.SELECT,
  Escape: Action.BACK,
  Backspace: Action.BACK,
  MediaPlayPause: Action.PLAY_PAUSE,
  MediaTrackNext: Action.FORWARD,
  MediaTrackPrevious: Action.REWIND,
  ' ': Action.PLAY_PAUSE,
  f: Action.FULLSCREEN,
  F: Action.FULLSCREEN,
};

export function actionFor(event: KeyboardEvent): Action | null {
  return BY_KEY_NAME[event.key] ?? BY_KEY_CODE[event.keyCode] ?? null;
}

/** Narrows an action to the four directions the focus manager understands. */
export function asDirection(action: Action): Direction | null {
  switch (action) {
    case Action.LEFT:
    case Action.RIGHT:
    case Action.UP:
    case Action.DOWN:
      return action;
    default:
      return null;
  }
}
