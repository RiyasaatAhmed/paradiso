import type { MediaInfo } from '../../shared/contracts.ts';
import { MODE_LABELS, MODE_LADDER, nextModeAfter, PlaybackMode, seeksNatively, type PlaybackMode as Mode } from '../../shared/playback.ts';
import { api } from '../core/api.ts';
import { byId, clear, focusableButton } from '../core/dom.ts';
import type { FocusManager } from '../navigation/focus.ts';
import { createControlBar, subtitleName } from '../player/controls.ts';
import { cueTextAt, parseVtt, type Cue } from '../player/subtitles.ts';
import { VirtualTimeline } from '../player/timeline.ts';
import type { PlaybackRequest } from './detail.ts';

const TICK_MS = 120; // scrubber and subtitle refresh; cheap enough for a TV
const SAVE_PROGRESS_MS = 10_000;
const CONTROLS_TIMEOUT_MS = 5000;
const NEAR_END_SECONDS = 15;

interface Session {
  item: PlaybackRequest['item'];
  info: MediaInfo;
  mode: Mode;
  audioOrder: number;
  subtitleOrder: number;
  cues: Cue[];
  attemptedModes: Mode[];
}

export interface PlayerScreen {
  readonly element: HTMLElement;
  readonly isOpen: boolean;
  start(request: PlaybackRequest): void;
  exit(): void;
  controlsOpen(): boolean;
  showControls(): void;
  hideControls(): void;
  togglePlay(): void;
  nudge(delta: number): void;
  toggleFullscreen(): void;
}

/**
 * The player.
 *
 * Owns playback state and coordinates the pieces that do the actual work: the
 * virtual timeline decides *where we are*, the subtitle module decides *what to
 * show*, and the control bar decides *how it looks*.
 */
export function createPlayerScreen({
  focus,
  onExit,
  onDismiss,
}: {
  focus: FocusManager;
  onExit: (lastId: string) => void;
  /** The viewer asked to leave; history decides what that means. */
  onDismiss: () => void;
}): PlayerScreen {
  const root = byId('player');
  const video = byId<HTMLVideoElement>('video');
  const subtitleLayer = byId('subtitles');

  let session: Session | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let saveTimer: ReturnType<typeof setInterval> | null = null;
  let controlsTimer: ReturnType<typeof setTimeout> | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  const timeline = new VirtualTimeline({ onRestart: (seconds) => loadStream(seconds) });

  const controls = createControlBar({
    focus,
    handlers: { togglePlay, nudge, cycleSubtitles, cycleAudio, cycleMode, exit, toggleFullscreen },
  });

  // ---------------------------------------------------------------- lifecycle

  function start(request: PlaybackRequest): void {
    session = {
      item: request.item,
      info: request.info,
      mode: request.mode,
      audioOrder: request.audioOrder,
      subtitleOrder: request.subtitleOrder,
      cues: [],
      attemptedModes: [],
    };

    root.hidden = false;
    byId('playerError').hidden = true;
    byId('nowPlaying').textContent = request.item.title;

    refreshControls();
    void loadSubtitles(request.subtitleOrder);
    loadStream(request.startSeconds);
    showControls();

    tickTimer = setInterval(tick, TICK_MS);
    saveTimer = setInterval(saveProgress, SAVE_PROGRESS_MS);
  }

  function exit(): void {
    if (!session) return;
    saveProgress();

    if (tickTimer) clearInterval(tickTimer);
    if (saveTimer) clearInterval(saveTimer);
    if (controlsTimer) clearTimeout(controlsTimer);
    timeline.cancel();
    leaveFullscreen();

    // Dropping the source is what actually kills ffmpeg on the server.
    video.pause();
    video.removeAttribute('src');
    video.load();

    const lastId = session.item.id;
    session = null;
    subtitleLayer.textContent = '';
    root.hidden = true;
    root.classList.remove('controls-open');

    onExit(lastId);
  }

  function loadStream(startSeconds: number): void {
    if (!session) return;
    const nativeSeek = seeksNatively(session.mode);

    // A direct stream is served whole and seeks itself, so its offset is always
    // zero. Anything else begins at the requested point.
    timeline.reset(nativeSeek ? 0 : startSeconds);
    setSpinner(true);

    video.src = api.streamUrl({
      id: session.item.id,
      mode: session.mode,
      audioOrder: session.audioOrder,
      startSeconds: nativeSeek ? 0 : startSeconds,
    });

    if (nativeSeek && startSeconds > 0) {
      video.addEventListener(
        'loadedmetadata',
        () => {
          try {
            video.currentTime = startSeconds;
          } catch {
            // Some browsers refuse until buffered further; harmless.
          }
        },
        { once: true }
      );
    }

    video.play().catch(() => {
      // Autoplay refusal: the viewer can press Play. Not worth surfacing.
    });
  }

  // ---------------------------------------------------------------- position

  const position = (): number => timeline.position(video.currentTime);
  const duration = (): number => session?.info.duration ?? 0;

  function seekTo(target: number): void {
    if (!session) return;
    const clamped = VirtualTimeline.clamp(target, duration());

    if (seeksNatively(session.mode)) {
      try {
        video.currentTime = clamped;
      } catch {
        // ignore; the element will settle on its own
      }
    } else {
      timeline.requestSeek(clamped);
    }
    controls.renderProgress(position(), duration());
  }

  function nudge(delta: number): void {
    controls.markScrubbing();
    seekTo(position() + delta);
    toast(`${delta > 0 ? '↻' : '↺'} ${Math.abs(delta)}s   ${formatPosition()}`);
    showControls();
  }

  function formatPosition(): string {
    const seconds = Math.floor(position());
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${remainder < 10 ? '0' : ''}${remainder}`;
  }

  function tick(): void {
    controls.renderProgress(position(), duration());
    renderSubtitleAt(position());
  }

  // ---------------------------------------------------------------- subtitles

  async function loadSubtitles(order: number): Promise<void> {
    if (!session) return;
    session.subtitleOrder = order;
    session.cues = [];
    subtitleLayer.textContent = '';
    if (order < 0) return;

    const id = session.item.id;
    const vtt = await api.fetchSubtitles(id, order);
    if (!session || session.item.id !== id) return; // player closed or moved on

    if (vtt === null) {
      session.subtitleOrder = -1;
      refreshControls();
      toast('No usable subtitles in this file');
      return;
    }

    session.cues = parseVtt(vtt);
    if (session.cues.length === 0) toast('Subtitle track looks empty');
  }

  function renderSubtitleAt(time: number): void {
    const text = session && session.cues.length > 0 ? cueTextAt(session.cues, time) : '';
    if (subtitleLayer.textContent !== text) subtitleLayer.textContent = text;
  }

  // ---------------------------------------------------------------- controls

  function refreshControls(): void {
    if (!session) return;
    controls.render({
      paused: video.paused,
      info: session.info,
      mode: session.mode,
      audioOrder: session.audioOrder,
      subtitleOrder: session.subtitleOrder,
      isFullscreen: isFullscreen(),
    });
  }

  function togglePlay(): void {
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
    refreshControls();
    showControls();
  }

  function cycleSubtitles(): void {
    if (!session) return;
    const available = [-1, ...session.info.subs.filter((t) => t.text).map((t) => t.order)];
    const next = available[(available.indexOf(session.subtitleOrder) + 1) % available.length] ?? -1;
    void loadSubtitles(next);
    refreshControls();
    showControls();
    toast(`Subtitles: ${next >= 0 ? subtitleName(session.info, next) : 'Off'}`);
  }

  function cycleAudio(): void {
    if (!session) return;
    session.audioOrder = (session.audioOrder + 1) % session.info.audio.length;

    // Track selection happens inside ffmpeg, so a direct stream has to become a
    // remux for the change to take effect at all.
    if (session.mode === PlaybackMode.DIRECT) {
      session.mode = PlaybackMode.REMUX;
      toast('Switched to Remux to change audio track');
    }

    refreshControls();
    loadStream(position());
    showControls();
  }

  function cycleMode(): void {
    if (!session) return;
    const resumeAt = position();
    const nextIndex = (MODE_LADDER.indexOf(session.mode) + 1) % MODE_LADDER.length;
    session.mode = MODE_LADDER[nextIndex] ?? PlaybackMode.REMUX;
    toast(`Mode: ${MODE_LABELS[session.mode]}`);
    refreshControls();
    loadStream(resumeAt);
    showControls();
  }

  function showControls(): void {
    root.classList.add('controls-open');
    if (controlsTimer) clearTimeout(controlsTimer);
    controlsTimer = setTimeout(hideControls, CONTROLS_TIMEOUT_MS);
  }

  function hideControls(): void {
    root.classList.remove('controls-open');
    focus.clear();
  }

  const controlsOpen = (): boolean => root.classList.contains('controls-open');

  // ---------------------------------------------------------------- full screen

  interface LegacyFullscreen {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => void;
  }
  interface LegacyFullscreenTarget {
    webkitRequestFullscreen?: () => void;
  }

  const fullscreenDoc = document as Document & LegacyFullscreen;
  const fullscreenTarget = root as HTMLElement & LegacyFullscreenTarget;

  const isFullscreen = (): boolean =>
    Boolean(document.fullscreenElement ?? fullscreenDoc.webkitFullscreenElement);

  function leaveFullscreen(): void {
    if (!isFullscreen()) return;
    try {
      if (document.exitFullscreen) void document.exitFullscreen();
      else fullscreenDoc.webkitExitFullscreen?.();
    } catch {
      // nothing useful to do
    }
  }

  function toggleFullscreen(): void {
    if (isFullscreen()) {
      leaveFullscreen();
    } else {
      try {
        if (fullscreenTarget.requestFullscreen) {
          void fullscreenTarget.requestFullscreen().catch(() => toast('Full screen was blocked'));
        } else if (fullscreenTarget.webkitRequestFullscreen) {
          fullscreenTarget.webkitRequestFullscreen();
        } else {
          toast('Full screen is not available in this browser');
        }
      } catch {
        toast('Full screen was blocked');
      }
    }
    showControls();
  }

  // ---------------------------------------------------------------- feedback

  function setSpinner(visible: boolean): void {
    byId('spinner').hidden = !visible;
  }

  function toast(message: string): void {
    const node = byId('seekToast');
    node.textContent = message;
    node.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 1200);
  }

  function saveProgress(): void {
    if (!session) return;
    const seconds = position();
    if (Number.isFinite(seconds)) api.saveProgress(session.item.id, seconds, duration());
  }

  /**
   * A TV can reject a file the probe expected it to play. Rather than blame the
   * viewer, walk down the mode ladder and try the next, more compatible option.
   */
  function handlePlaybackError(): void {
    if (!session) return;
    setSpinner(false);
    session.attemptedModes.push(session.mode);

    const fallback = nextModeAfter(session.attemptedModes);
    if (fallback) {
      const resumeAt = position();
      session.mode = fallback;
      toast(`Retrying as ${MODE_LABELS[fallback]}…`);
      refreshControls();
      loadStream(resumeAt);
      return;
    }
    showUnplayable();
  }

  function showUnplayable(): void {
    const box = byId('playerError');
    byId('peBody').textContent =
      'Your TV refused this file in all three playback modes. It is most likely an unusual codec. You can still play it on your laptop browser.';

    const actions = clear(byId('peActions'));
    actions.appendChild(
      focusableButton('btn primary', 'Try Convert again', () => {
        if (!session) return;
        box.hidden = true;
        session.attemptedModes = [];
        session.mode = PlaybackMode.TRANSCODE;
        loadStream(position());
      })
    );
    actions.appendChild(focusableButton('btn', 'Back to list', onDismiss));

    box.hidden = false;
    showControls();
    focus.first();
  }

  // ---------------------------------------------------------------- wiring

  video.addEventListener('waiting', () => setSpinner(true));
  video.addEventListener('canplay', () => setSpinner(false));
  video.addEventListener('playing', () => {
    setSpinner(false);
    refreshControls();
  });
  video.addEventListener('pause', () => refreshControls());
  video.addEventListener('error', handlePlaybackError);

  video.addEventListener('ended', () => {
    // On a remuxed stream 'ended' can mean the fragment ran dry rather than the
    // film finishing, so only leave if we are genuinely near the end.
    if (!duration() || position() > duration() - NEAR_END_SECONDS) onDismiss();
    else setSpinner(true);
  });

  video.addEventListener('click', () => (controlsOpen() ? togglePlay() : showControls()));
  root.addEventListener('mousemove', () => {
    if (session) showControls();
  });

  byId('track').addEventListener('click', (event) => {
    if (!session || !duration()) return;
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    controls.markScrubbing();
    seekTo(((event.clientX - bounds.left) / bounds.width) * duration());
  });

  for (const eventName of ['fullscreenchange', 'webkitfullscreenchange']) {
    document.addEventListener(eventName, () => refreshControls());
  }

  return {
    element: root,
    get isOpen() {
      return !root.hidden;
    },
    start,
    exit,
    controlsOpen,
    showControls,
    hideControls,
    togglePlay,
    nudge,
    toggleFullscreen,
  };
}
