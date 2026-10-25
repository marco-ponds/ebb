process.env.TZ = 'Europe/London';
import { describe, expect, it } from 'vitest';
import {
  EVENT_LABELS,
  GENTLE_PROMPT,
  THRESHOLD_LETTER,
  TIMELINE_LETTERS,
  WATERS_OPTIONS,
  eventConfirmation,
  eventSentence,
  needsGentlePrompt,
  watersLower,
} from './events';
import { ev } from './__tests__/fixtures';

const at = (h: number, m: number) => new Date(2026, 9, 24, h, m).getTime();

describe('labels', () => {
  it('has the copy', () => {
    expect(EVENT_LABELS).toEqual({
      waters: 'Waters broke',
      bleeding: 'Bleeding',
      'reduced-movement': 'Reduced baby movement',
      'called-midwife': 'Called midwife',
      'went-to-hospital': 'Went to hospital',
      note: 'Note',
    });
    expect(WATERS_OPTIONS).toEqual([
      { value: 'clear', label: 'Clear' },
      { value: 'pink', label: 'Pink' },
      { value: 'green-brown', label: 'Green or brown' },
      { value: 'unsure', label: 'Not sure' },
    ]);
    expect(['clear', 'pink', 'green-brown', 'unsure'].map((d) => watersLower(d as 'clear'))).toEqual([
      'clear', 'pink', 'green or brown', 'not sure',
    ]);
  });
  it('has timeline letters', () => {
    expect(TIMELINE_LETTERS).toEqual({
      waters: 'W', bleeding: 'B', 'reduced-movement': 'R', 'called-midwife': 'M', 'went-to-hospital': 'H', note: 'N',
    });
    expect(THRESHOLD_LETTER).toBe('T');
  });
});

describe('needsGentlePrompt', () => {
  it('applies to bleeding, reduced movement and green or brown waters', () => {
    expect(needsGentlePrompt('bleeding', null)).toBe(true);
    expect(needsGentlePrompt('reduced-movement', null)).toBe(true);
    expect(needsGentlePrompt('waters', 'green-brown')).toBe(true);
    expect(needsGentlePrompt('waters', 'clear')).toBe(false);
    expect(needsGentlePrompt('waters', null)).toBe(false);
    expect(needsGentlePrompt('note', null)).toBe(false);
    expect(needsGentlePrompt('called-midwife', null)).toBe(false);
  });
  it('has the verbatim prompt', () => {
    expect(GENTLE_PROMPT).toBe("If you haven't already, contact your midwife or maternity unit.");
  });
});

describe('eventConfirmation', () => {
  it('describes what was saved', () => {
    expect(eventConfirmation(ev('1', at(23, 30), 'waters', 'green-brown'))).toBe('Saved · Waters broke, green or brown, 23:30');
    expect(eventConfirmation(ev('2', at(23, 36), 'called-midwife'))).toBe('Saved · Called midwife, 23:36');
  });
});

describe('eventSentence', () => {
  it('writes one sentence per event', () => {
    expect(eventSentence(ev('1', at(23, 30), 'waters', 'clear'))).toBe('Waters broke 23:30, clear.');
    expect(eventSentence(ev('2', at(23, 36), 'called-midwife'))).toBe('Called midwife 23:36.');
    expect(eventSentence(ev('3', at(23, 10), 'note', null, 'had a bath'))).toBe('Note 23:10: had a bath.');
  });
  it('does not double the final punctuation of a note', () => {
    expect(eventSentence(ev('4', at(23, 10), 'note', null, 'felt sick.'))).toBe('Note 23:10: felt sick.');
    expect(eventSentence(ev('5', at(23, 10), 'note', null, 'felt sick?'))).toBe('Note 23:10: felt sick?');
  });
  it('combines details and a note', () => {
    expect(eventSentence(ev('6', at(23, 30), 'waters', 'pink', 'a little'))).toBe('Waters broke 23:30, pink: a little.');
  });
  it('ignores a blank note', () => {
    expect(eventSentence(ev('7', at(23, 30), 'bleeding', null, '  '))).toBe('Bleeding 23:30.');
  });
});
