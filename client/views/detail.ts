import {
  isProbeFailure,
  type AudioTrack,
  type LibraryItem,
  type MediaInfo,
  type MediaResponse,
  type SubtitleTrack,
} from '../../shared/contracts.ts';
import { MODE_DESCRIPTIONS, MODE_LABELS, MODE_LADDER, type PlaybackMode } from '../../shared/playback.ts';
import { appendAll, byId, clear, el, focusableButton } from '../core/dom.ts';
import { formatClock, formatDuration } from '../core/format.ts';
import type { Store } from '../core/store.ts';
import type { FocusManager } from '../navigation/focus.ts';

/** What the detail screen hands the player when the viewer presses Play. */
export interface PlaybackRequest {
  item: LibraryItem;
  info: MediaInfo;
  startSeconds: number;
  mode: PlaybackMode;
  audioOrder: number;
  /** -1 means subtitles off. */
  subtitleOrder: number;
}

interface Choice {
  mode: PlaybackMode;
  audioOrder: number;
  subtitleOrder: number;
}

export interface DetailScreen {
  readonly element: HTMLElement;
  readonly isOpen: boolean;
  open(item: LibraryItem, autoPlayAt?: number): void;
  close(): void;
}

export interface DetailOptions {
  store: Store;
  focus: FocusManager;
  onPlay: (request: PlaybackRequest) => void;
  onBack: (lastId: string | null) => void;
}

/**
 * The title detail screen: what this file is, and how to play it.
 *
 * Also where the awkward choices live -- subtitle track, audio track, playback
 * mode. They are all defaulted sensibly, so the screen reads as "press Play"
 * unless someone goes looking.
 */
export function createDetailScreen({ store, focus, onPlay, onBack }: DetailOptions): DetailScreen {
  const root = byId('sheet');

  let item: LibraryItem | null = null;
  let info: MediaInfo | null = null;
  let detail: MediaResponse | null = null;
  let choice: Choice = { mode: 'direct', audioOrder: 0, subtitleOrder: -1 };

  function open(target: LibraryItem, autoPlayAt?: number): void {
    item = target;
    info = null;
    root.hidden = false;
    root.scrollTop = 0;

    byId('detailArt').style.backgroundImage = `url("/poster/${target.id}")`;
    byId('sheetTitle').textContent = target.title;
    byId('sheetSpecs').textContent = 'Reading file…';
    clear(byId('sheetActions'));
    clear(byId('sheetOptions'));
    byId('sheetHint').textContent = '';

    void store.describe(target.id).then(
      (loaded) => {
        if (isProbeFailure(loaded.meta)) {
          byId('sheetSpecs').textContent = `Could not read this file: ${loaded.meta.error}`;
          return;
        }
        detail = loaded;
        info = loaded.meta;
        choice = {
          mode: info.mode,
          audioOrder: 0,
          // These files are subtitled for a reason, and hunting for the setting
          // with a remote is no fun -- default to the first usable track.
          subtitleOrder: info.subs.findIndex((track) => track.text),
        };
        render();

        // Arrived straight from the billboard's Play button: skip this screen.
        if (typeof autoPlayAt === 'number') start(autoPlayAt);
      },
      () => {
        byId('sheetSpecs').textContent = 'Could not read this file.';
      }
    );
  }

  function close(): void {
    const lastId = item?.id ?? null;
    root.hidden = true;
    item = null;
    onBack(lastId);
  }

  function start(seconds: number): void {
    if (!item || !info) return;
    onPlay({ item, info, startSeconds: seconds, ...choice });
  }

  function render(): void {
    if (!info || !item || !detail) return;
    renderFacts(info, item);
    renderActions(detail);
    renderOptions(info);
    byId('sheetHint').textContent = MODE_DESCRIPTIONS[choice.mode];
    focus.first();
  }

  function renderFacts(media: MediaInfo, current: LibraryItem): void {
    const meta = clear(byId('sheetSpecs'));
    const facts: string[] = [];
    if (media.duration) facts.push(formatDuration(media.duration));
    facts.push(current.folder, current.sizeLabel);

    facts.forEach((fact, index) => {
      if (index > 0) meta.appendChild(el('span', 'dot', '•'));
      meta.appendChild(el('span', '', fact));
    });

    if (media.video) {
      meta.appendChild(el('span', 'tag', `${media.video.height}p`));
      meta.appendChild(el('span', 'tag', media.video.codec.toUpperCase()));
    }
    meta.appendChild(el('span', 'tag', media.container.toUpperCase()));
  }

  function renderActions(current: MediaResponse): void {
    const actions = clear(byId('sheetActions'));
    const resume = current.resume;

    if (resume && resume.seconds > 30) {
      actions.appendChild(
        focusableButton('btn primary', `▶  Resume from ${formatClock(resume.seconds)}`, () =>
          start(resume.seconds)
        )
      );
      actions.appendChild(focusableButton('btn', 'Start over', () => start(0)));
    } else {
      actions.appendChild(focusableButton('btn primary', '▶  Play', () => start(0)));
    }

    actions.appendChild(focusableButton('btn', 'Back', close));
  }

  function renderOptions(media: MediaInfo): void {
    const options = clear(byId('sheetOptions'));

    const textTracks = media.subs.filter((track) => track.text);
    if (textTracks.length > 0) {
      options.appendChild(
        buildGroup('Subtitles', [
          option('Off', choice.subtitleOrder === -1, () => pick({ subtitleOrder: -1 })),
          ...textTracks.map((track) =>
            option(subtitleLabel(track), choice.subtitleOrder === track.order, () =>
              pick({ subtitleOrder: track.order })
            )
          ),
        ])
      );
    }

    if (media.audio.length > 1) {
      options.appendChild(
        buildGroup(
          'Audio',
          media.audio.map((track) =>
            option(`${trackName(track)} · ${track.codec}`, choice.audioOrder === track.order, () =>
              pick({ audioOrder: track.order })
            )
          )
        )
      );
    }

    options.appendChild(
      buildGroup(
        'Playback',
        MODE_LADDER.map((mode) =>
          option(MODE_LABELS[mode] + (mode === media.mode ? ' (auto)' : ''), choice.mode === mode, () =>
            pick({ mode })
          )
        )
      )
    );
  }

  function pick(change: Partial<Choice>): void {
    choice = { ...choice, ...change };
    render();
  }

  const option = (label: string, selected: boolean, onActivate: () => void): HTMLButtonElement =>
    focusableButton(selected ? 'btn small on' : 'btn small', label, onActivate);

  const trackName = (track: AudioTrack | SubtitleTrack): string =>
    track.lang ? track.lang.toUpperCase() : `Track ${track.order + 1}`;

  const subtitleLabel = (track: SubtitleTrack): string =>
    track.title ? `${trackName(track)} — ${track.title}` : trackName(track);

  function buildGroup(label: string, buttons: readonly HTMLElement[]): HTMLElement {
    const group = el('div', 'opt-group');
    group.appendChild(el('div', 'opt-label', label));
    group.appendChild(appendAll(el('div', 'opt-row'), buttons));
    return group;
  }

  return {
    element: root,
    get isOpen() {
      return !root.hidden;
    },
    open,
    close,
  };
}
