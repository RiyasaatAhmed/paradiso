/**
 * Client composition root.
 *
 * Builds the header and the three screens, wires them to each other through
 * callbacks, and owns the single keydown listener. Screens never import one
 * another -- navigation flows through here, so there is one place that
 * describes how the app moves.
 *
 * Since routing arrived there is a second rule as well: screens never decide
 * what a Back means and never open each other. They report what the viewer did,
 * `navigate` records it in history, and `applyRoute` is the only function that
 * opens or closes anything. That way the browser's Back button, the remote's
 * Back key, and a pasted URL all arrive at the same code by the same path.
 */

import { createStore } from './core/store.ts';
import { createFocusManager } from './navigation/focus.ts';
import { createHistoryRouter } from './navigation/history.ts';
import { HOME, parseRoute, sameRoute, type Route } from './navigation/routes.ts';
import { Action, actionFor, asDirection } from './navigation/remote.ts';
import { createBrowseScreen } from './views/browse.ts';
import { createDetailScreen } from './views/detail.ts';
import { createHeader } from './views/header.ts';
import { createHomeScreen } from './views/home.ts';
import { createPlayerScreen } from './views/player.ts';

const SEEK_STEP_SECONDS = 10;
const MEDIA_KEY_SEEK_SECONDS = 30;

const store = createStore();

/**
 * Where focus may live: the screen on top, then the header, which outlives all
 * of them. The header is hidden during playback and drops out on its own.
 */
const focus = createFocusManager({
  roots: () => [topScreen(), header.element],
});

function topScreen(): HTMLElement | null {
  if (player.isOpen) return player.controlsOpen() ? player.element : null;
  if (detail.isOpen) return detail.element;
  if (browse.isOpen) return browse.element;
  return home.element;
}

const header = createHeader({
  store,
  onHome: () => navigate(HOME),
  onLibraryChanged: () => {
    home.render();
    browse.refresh();
    // The filter may have emptied the folder we were looking at.
    const route = router.current;
    if (route.name === 'folder' && !store.byFolder.has(route.folder)) navigate(HOME);
    else focus.firstMatching('.card');
  },
  onFailure: (message) => home.showFailure(message),
});

const home = createHomeScreen({
  store,
  focus,
  onSelect: (item) => navigate({ name: 'title', id: item.id }),
  onPlay: (item, seconds) => {
    resumeAt = seconds;
    navigate({ name: 'title', id: item.id });
  },
  onBrowse: (folder) => navigate({ name: 'folder', folder }),
});

const browse = createBrowseScreen({
  store,
  focus,
  onSelect: (item) => navigate({ name: 'title', id: item.id }),
  onBack: (folder) => home.focusFolder(folder),
});

const detail = createDetailScreen({
  store,
  focus,
  onPlay: (request) => {
    player.start(request);
    navigate({ name: 'watch', id: request.item.id });
  },
  onBack: (lastId) => returnTo(lastId),
  onDismiss: () => goBack(),
});

const player = createPlayerScreen({
  focus,
  onExit: (lastId) => {
    // Re-read the library so Continue Watching reflects what just happened.
    void store.refresh().then(() => {
      home.render();
      browse.refresh();
      returnTo(lastId);
    });
  },
  onDismiss: () => goBack(),
});

const router = createHistoryRouter(parseRoute, applyRoute);

/**
 * Seconds to start at when the billboard's Play button skipped the detail
 * screen. Held here rather than in the URL because it is a detail of one press,
 * not something worth putting in a link someone might share.
 */
let resumeAt: number | undefined;

// ---------------------------------------------------------------- navigation

/** Record where we are going, then go there. The only way forward. */
function navigate(route: Route): void {
  router.go(route);
  applyRoute(route);
}

/** One screen back, through real history so the browser's own Back agrees. */
function goBack(): void {
  router.back(parentOf(router.current));
}

function parentOf(route: Route): Route {
  if (route.name === 'watch') return { name: 'title', id: route.id };
  if (route.name === 'title') {
    const folder = store.find(route.id)?.folder;
    // Back out to the folder the title lives in, but only when that folder is
    // actually on screen -- otherwise home is the honest answer.
    if (folder && browse.isOpen) return { name: 'folder', folder };
  }
  return HOME;
}

/**
 * Make the screens match the route. Called by `navigate`, by the browser's
 * Back and Forward buttons, and once on load. It opens and closes; it never
 * navigates, which is what keeps it from looping back on itself.
 */
function applyRoute(route: Route): void {
  if (route.name !== 'watch' && player.isOpen) player.exit();

  const wantsTitle = route.name === 'title' || route.name === 'watch';
  if (!wantsTitle && detail.isOpen) detail.close();

  if (route.name === 'folder') {
    // A folder can exist and still be invisible, because every file in it is
    // under the size filter -- which is true of any folder of short episodes.
    // Someone who followed a link to it has asked for it plainly enough, so
    // lift the filter rather than pretending the folder is not there.
    if (!store.byFolder.has(route.folder) && store.hasFolder(route.folder)) {
      store.setShowAll(true);
      header.sync();
      home.render();
    }
    if (!store.byFolder.has(route.folder)) {
      router.replace(HOME);
      applyRoute(HOME);
      return;
    }
    browse.open(route.folder);
  } else if (route.name === 'home' && browse.isOpen) {
    browse.close();
  }

  if (wantsTitle) {
    const item = store.find(route.id);
    if (!item) {
      router.replace(HOME);
      applyRoute(HOME);
      return;
    }
    // A /watch link cannot restart playback on its own -- browsers refuse to
    // play video nobody has interacted with yet -- so it opens the title and
    // leaves the viewer one press away from where they meant to be.
    if (!detail.isOpen) detail.open(item, resumeAt);
    resumeAt = undefined;
  }

  header.setAlwaysFilled(route.name !== 'home');
  header.setHidden(player.isOpen);
  if (route.name === 'home') home.focusItem(null);
}

/** Hand focus back to the grid when it is open behind us, otherwise the rows. */
function returnTo(lastId: string | null): void {
  header.setHidden(false);
  if (browse.isOpen) browse.focusItem(lastId);
  else home.focusItem(lastId);
}

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
  else if (action === Action.BACK) goBack();
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
      goBack();
      return true;

    case Action.FULLSCREEN:
      player.toggleFullscreen();
      return true;

    case Action.BACK:
      // First Back tucks the overlay away, a second one leaves the film.
      if (player.controlsOpen()) player.hideControls();
      else goBack();
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
    header.sync();
    home.render();

    // Whatever the address bar says, including a link someone was sent.
    const opening = router.current;
    router.replace(opening);
    applyRoute(opening);
    if (sameRoute(opening, HOME)) focus.firstMatching('.card');
  })
  .catch(() => {
    home.showFailure('Could not reach the server. Is it still running on the laptop?');
  });
