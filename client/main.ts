/**
 * Client composition root.
 *
 * Builds the three screens, wires them to each other through callbacks, and owns
 * the single keydown listener. Screens never import one another -- navigation
 * flows through here, so there is one place that describes how the app moves.
 */

import { createStore } from './core/store.ts';
import { createFocusManager } from './navigation/focus.ts';
import { Action, actionFor, asDirection } from './navigation/remote.ts';
import { createDetailScreen } from './views/detail.ts';
import { createHomeScreen } from './views/home.ts';
import { createPlayerScreen } from './views/player.ts';

const SEEK_STEP_SECONDS = 10;
const MEDIA_KEY_SEEK_SECONDS = 30;

const store = createStore();

// Focus must never escape into a screen hidden behind the current one.
const focus = createFocusManager({
  activeLayer: () => {
    if (player.isOpen) return player.controlsOpen() ? player.element : null;
    if (detail.isOpen) return detail.element;
    return home.element;
  },
});

const home = createHomeScreen({
  store,
  focus,
  onSelect: (item) => detail.open(item),
  onPlay: (item, seconds) => detail.open(item, seconds),
});

const detail = createDetailScreen({
  store,
  focus,
  onPlay: (request) => player.start(request),
  onBack: (lastId) => home.focusItem(lastId),
});

const player = createPlayerScreen({
  focus,
  onExit: (lastId) => {
    // Re-read the library so Continue Watching reflects what just happened.
    void store.refresh().then(() => {
      home.render();
      home.focusItem(lastId);
    });
  },
});

// ---------------------------------------------------------------- remote input

document.addEventListener('keydown', (event) => {
  const action = actionFor(event);
  if (!action) return;

  if (player.isOpen) {
    if (handleInPlayer(action)) event.preventDefault();
    return;
  }

  event.preventDefault();
  const direction = asDirection(action);
  if (direction) focus.move(direction);
  else if (action === Action.SELECT) focus.current?.click();
  else if (action === Action.BACK && detail.isOpen) detail.close();
});

/** @returns whether the key was consumed. */
function handleInPlayer(action: Action): boolean {
  switch (action) {
    case Action.PLAY_PAUSE:
      player.togglePlay();
      return true;

    case Action.REWIND:
      player.nudge(-MEDIA_KEY_SEEK_SECONDS);
      return true;

    case Action.FORWARD:
      player.nudge(MEDIA_KEY_SEEK_SECONDS);
      return true;

    case Action.STOP:
      player.exit();
      return true;

    case Action.FULLSCREEN:
      player.toggleFullscreen();
      return true;

    case Action.BACK:
      // First Back tucks the overlay away, a second one leaves the film.
      if (player.controlsOpen()) player.hideControls();
      else player.exit();
      return true;

    case Action.SELECT:
      if (player.controlsOpen()) focus.current?.click();
      else player.togglePlay();
      return true;

    default:
      return handleDirectionInPlayer(action);
  }
}

function handleDirectionInPlayer(action: Action): boolean {
  const direction = asDirection(action);
  if (!direction) return false;

  // With the overlay hidden, left and right scrub -- the thing you actually
  // want from a remote while watching something.
  if (!player.controlsOpen()) {
    if (direction === 'left') player.nudge(-SEEK_STEP_SECONDS);
    else if (direction === 'right') player.nudge(SEEK_STEP_SECONDS);
    else {
      player.showControls();
      focus.first();
    }
    return true;
  }

  if (direction === 'down' && !focus.current) {
    player.hideControls();
    return true;
  }

  focus.move(direction);
  if (!focus.current) focus.first();
  player.showControls();
  return true;
}

// ---------------------------------------------------------------- start

void store
  .refresh()
  .then(() => {
    home.render();
    focus.firstMatching('.card');
  })
  .catch(() => {
    home.showFailure('Could not reach the server. Is it still running on the laptop?');
  });
