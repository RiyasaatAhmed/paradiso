import type { MediaInfo } from '../../shared/contracts.ts';
import { MODE_LABELS, type PlaybackMode } from '../../shared/playback.ts';
import { byId, clear, el } from '../core/dom.ts';
import { formatClock, formatDuration } from '../core/format.ts';
import type { FocusManager } from '../navigation/focus.ts';

/**
 * The control bar.
 *
 * Glyphs are deliberately monochrome characters rather than emoji: emoji
 * codepoints render in full colour on most platforms and break the flat look of
 * a player bar. The closed-caption badge is drawn with a border for the same
 * reason.
 */
const Glyph = {
  PLAY: '▶',
  PAUSE: '❚❚',
  BACK_10: '↺',
  FORWARD_10: '↻',
  CAPTIONS: 'CC',
  AUDIO: '♫',
  SETTINGS: '⚙︎', // FE0E forces text rather than emoji presentation
  CLOSE: '✕',
  FULLSCREEN: '⛶',
} as const;

/** Stable identifiers so focus survives the bar being rebuilt. */
type ControlKey = 'play' | 'back10' | 'forward10' | 'subtitles' | 'audio' | 'mode' | 'exit' | 'fullscreen';

export interface ControlState {
  paused: boolean;
  info: MediaInfo;
  mode: PlaybackMode;
  audioOrder: number;
  /** -1 means subtitles are off. */
  subtitleOrder: number;
  isFullscreen: boolean;
}

export interface ControlHandlers {
  togglePlay: () => void;
  nudge: (delta: number) => void;
  cycleSubtitles: () => void;
  cycleAudio: () => void;
  cycleMode: () => void;
  exit: () => void;
  toggleFullscreen: () => void;
}

export interface ControlBar {
  render(state: ControlState): void;
  renderProgress(position: number, duration: number): void;
  markScrubbing(): void;
}

export function createControlBar({
  focus,
  handlers,
}: {
  focus: FocusManager;
  handlers: ControlHandlers;
}): ControlBar {
  const left = byId('playerButtonsLeft');
  const right = byId('playerButtonsRight');
  const scrub = document.querySelector<HTMLElement>('.scrub');

  let scrubTimer: ReturnType<typeof setTimeout> | null = null;

  function button(
    glyph: string,
    label: string,
    key: ControlKey,
    onActivate: () => void,
    active = false
  ): HTMLButtonElement {
    const node = el('button', active ? 'pbtn on' : 'pbtn');
    node.setAttribute('data-focus', '');
    node.setAttribute('data-key', key);
    node.appendChild(el('span', glyph === Glyph.CAPTIONS ? 'glyph cc' : 'glyph', glyph));
    node.appendChild(el('span', 'label', label));
    node.addEventListener('click', onActivate);
    return node;
  }

  return {
    /**
     * Rebuilt whenever state changes, which would normally drop the remote's
     * focus -- so the focused slot is remembered by key and restored afterwards.
     */
    render(state) {
      const previousKey = focus.current?.getAttribute('data-key') ?? null;
      clear(left);
      clear(right);

      left.appendChild(
        button(
          state.paused ? Glyph.PLAY : Glyph.PAUSE,
          state.paused ? 'Play' : 'Pause',
          'play',
          handlers.togglePlay
        )
      );
      left.appendChild(button(Glyph.BACK_10, '10s', 'back10', () => handlers.nudge(-10)));
      left.appendChild(button(Glyph.FORWARD_10, '10s', 'forward10', () => handlers.nudge(10)));

      if (state.info.subs.some((track) => track.text)) {
        const label = state.subtitleOrder >= 0 ? subtitleName(state.info, state.subtitleOrder) : 'Off';
        right.appendChild(
          button(
            Glyph.CAPTIONS,
            `Subtitles · ${label}`,
            'subtitles',
            handlers.cycleSubtitles,
            state.subtitleOrder >= 0
          )
        );
      }

      if (state.info.audio.length > 1) {
        right.appendChild(
          button(Glyph.AUDIO, `Audio · ${audioName(state.info, state.audioOrder)}`, 'audio', handlers.cycleAudio)
        );
      }

      right.appendChild(button(Glyph.SETTINGS, MODE_LABELS[state.mode], 'mode', handlers.cycleMode));
      right.appendChild(button(Glyph.CLOSE, 'Back', 'exit', handlers.exit));
      right.appendChild(
        button(
          Glyph.FULLSCREEN,
          state.isFullscreen ? 'Exit full screen' : 'Full screen',
          'fullscreen',
          handlers.toggleFullscreen,
          state.isFullscreen
        )
      );

      if (previousKey) {
        const restored = document.querySelector<HTMLElement>(`#controls [data-key="${previousKey}"]`);
        if (restored) focus.set(restored);
      }
    },

    renderProgress(position, duration) {
      byId('timeLeft').textContent = duration
        ? `${formatDuration(Math.max(0, duration - position))} left`
        : formatClock(position);

      const percent = duration ? Math.max(0, Math.min(100, (position / duration) * 100)) : 0;
      byId('played').style.width = `${percent}%`;
      byId('knob').style.left = `${percent}%`;
    },

    /** Thickens the bar while a seek is in flight, then settles back. */
    markScrubbing() {
      if (!scrub) return;
      scrub.className = 'scrub active';
      if (scrubTimer) clearTimeout(scrubTimer);
      scrubTimer = setTimeout(() => {
        scrub.className = 'scrub';
      }, 1200);
    },
  };
}

export const audioName = (info: MediaInfo, order: number): string => {
  const track = info.audio[order];
  if (!track) return '1';
  return track.lang ? track.lang.toUpperCase() : `Track ${order + 1}`;
};

export const subtitleName = (info: MediaInfo, order: number): string => {
  const track = info.subs[order];
  if (!track) return 'Off';
  return track.lang ? track.lang.toUpperCase() : `Track ${order + 1}`;
};
