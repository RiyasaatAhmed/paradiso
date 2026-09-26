import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cueTextAt, parseTimestamp, parseVtt } from '../client/player/subtitles.ts';

describe('parseTimestamp', () => {
  it('reads the MM:SS.mmm form', () => {
    assert.equal(parseTimestamp('00:02.000'), 2);
  });

  it('reads the HH:MM:SS.mmm form', () => {
    assert.equal(parseTimestamp('01:23:45.678'), 5025.678);
  });

  it('accepts an SRT-style comma as the decimal separator', () => {
    assert.equal(parseTimestamp('00:11,106'), 11.106);
  });

  it('pads a short fraction rather than misreading it', () => {
    assert.equal(parseTimestamp('00:01.5'), 1.5);
  });

  it('returns null for nonsense', () => {
    assert.equal(parseTimestamp('not a time'), null);
  });
});

describe('parseVtt', () => {
  const sample = [
    'WEBVTT',
    '',
    '00:02.000 --> 00:08.000',
    'Downloaded from EXAMPLE.NET',
    '',
    '00:11.106 --> 00:14.028',
    'Aparna and Naveen',
    'love each other.',
    '',
    '7',
    '00:20.000 --> 00:22.000',
    '<i>Whispering</i>',
  ].join('\n');

  it('parses every cue and drops the header', () => {
    assert.equal(parseVtt(sample).length, 3);
  });

  it('keeps line breaks inside a cue', () => {
    assert.equal(parseVtt(sample)[1]?.text, 'Aparna and Naveen\nlove each other.');
  });

  it('skips a numeric cue identifier without treating it as dialogue', () => {
    assert.equal(parseVtt(sample)[2]?.text, 'Whispering');
  });

  it('strips inline markup and decodes entities', () => {
    const cues = parseVtt('WEBVTT\n\n00:01.000 --> 00:02.000\n<b>Tom &amp; Jerry</b>');
    assert.equal(cues[0]?.text, 'Tom & Jerry');
  });

  it('tolerates CRLF line endings', () => {
    const cues = parseVtt('WEBVTT\r\n\r\n00:01.000 --> 00:02.000\r\nHello');
    assert.equal(cues[0]?.text, 'Hello');
  });

  it('returns cues in time order even if the file is not', () => {
    const cues = parseVtt(
      'WEBVTT\n\n00:30.000 --> 00:31.000\nsecond\n\n00:10.000 --> 00:11.000\nfirst'
    );
    assert.deepEqual(cues.map((c) => c.text), ['first', 'second']);
  });

  it('returns nothing for an empty file rather than throwing', () => {
    assert.deepEqual(parseVtt('WEBVTT\n'), []);
  });
});

describe('cueTextAt', () => {
  const cues = [
    { start: 10, end: 12, text: 'first' },
    { start: 20, end: 24, text: 'second' },
    { start: 30, end: 33, text: 'third' },
  ];

  it('finds the cue covering the moment', () => {
    assert.equal(cueTextAt(cues, 21), 'second');
  });

  it('includes both boundaries', () => {
    assert.equal(cueTextAt(cues, 20), 'second');
    assert.equal(cueTextAt(cues, 24), 'second');
  });

  it('shows nothing in the gap between cues', () => {
    assert.equal(cueTextAt(cues, 15), '');
  });

  it('shows nothing before the first or after the last cue', () => {
    assert.equal(cueTextAt(cues, 0), '');
    assert.equal(cueTextAt(cues, 99), '');
  });

  it('handles an empty cue list', () => {
    assert.equal(cueTextAt([], 5), '');
  });
});
