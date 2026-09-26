import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { VirtualTimeline } from '../client/player/timeline.ts';

describe('VirtualTimeline', () => {
  it('reports position as offset plus the element clock', () => {
    // The element restarts at zero on every remux, so the offset carries the
    // real position. This is the core of the whole mechanism.
    const timeline = new VirtualTimeline({ onRestart: () => {} });
    timeline.reset(1200);
    assert.equal(timeline.position(45), 1245);
  });

  it('starts at zero for a direct stream', () => {
    const timeline = new VirtualTimeline({ onRestart: () => {} });
    timeline.reset(0);
    assert.equal(timeline.position(300), 300);
  });

  it('shows a requested seek immediately, before the stream catches up', () => {
    const timeline = new VirtualTimeline({ onRestart: () => {}, debounceMs: 50 });
    timeline.reset(100);
    timeline.requestSeek(900);
    // The video element is still playing at the old spot; the scrubber must not
    // snap back to it.
    assert.equal(timeline.position(5), 900);
    assert.equal(timeline.isSeeking, true);
    timeline.cancel();
  });

  it('restarts only once when seeks arrive in a burst', async () => {
    // Holding an arrow key must not spawn an ffmpeg process per key repeat.
    const restarts: number[] = [];
    const timeline = new VirtualTimeline({ onRestart: (s) => restarts.push(s), debounceMs: 30 });
    timeline.reset(0);

    timeline.requestSeek(10);
    timeline.requestSeek(20);
    timeline.requestSeek(30);
    await delay(60);

    assert.deepEqual(restarts, [30], 'only the final position should be acted on');
  });

  it('clears the pending seek once the stream restarts', async () => {
    const timeline = new VirtualTimeline({
      onRestart: (s) => timeline.reset(s),
      debounceMs: 20,
    });
    timeline.reset(0);
    timeline.requestSeek(500);
    await delay(50);

    assert.equal(timeline.isSeeking, false);
    assert.equal(timeline.position(3), 503);
  });

  it('abandons a pending seek when cancelled', async () => {
    let restarted = false;
    const timeline = new VirtualTimeline({ onRestart: () => (restarted = true), debounceMs: 20 });
    timeline.requestSeek(400);
    timeline.cancel();
    await delay(50);

    assert.equal(restarted, false, 'leaving the player must not trigger a restart');
    assert.equal(timeline.isSeeking, false);
  });

  it('treats a missing element clock as zero', () => {
    const timeline = new VirtualTimeline({ onRestart: () => {} });
    timeline.reset(60);
    assert.equal(timeline.position(NaN || 0), 60);
    assert.equal(timeline.position(undefined), 60);
  });
});

describe('VirtualTimeline.clamp', () => {
  it('refuses to seek before the start', () => {
    assert.equal(VirtualTimeline.clamp(-30, 1000), 0);
  });

  it('stops short of the end so the stream has something left to play', () => {
    assert.equal(VirtualTimeline.clamp(1000, 1000), 998);
  });

  it('leaves a position inside the film alone', () => {
    assert.equal(VirtualTimeline.clamp(500, 1000), 500);
  });

  it('allows any position when the duration is unknown', () => {
    assert.equal(VirtualTimeline.clamp(5000, 0), 5000);
  });

  it('never returns a negative position for a very short file', () => {
    assert.equal(VirtualTimeline.clamp(10, 1), 0);
  });
});
