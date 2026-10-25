import { describe, expect, it } from 'vitest';
import { LIMIT_HINT, canCompare, toggleSelection } from './select';

describe('toggleSelection', () => {
  it('adds an id in the order it was picked', () => {
    expect(toggleSelection(['a'], 'b')).toEqual({ selected: ['a', 'b'], blocked: false });
  });

  it('removes an id that is already selected', () => {
    expect(toggleSelection(['a', 'b'], 'a')).toEqual({ selected: ['b'], blocked: false });
  });

  it('allows a third selection', () => {
    expect(toggleSelection(['a', 'b'], 'c')).toEqual({ selected: ['a', 'b', 'c'], blocked: false });
  });

  it('blocks a fourth selection and leaves the selection unchanged', () => {
    expect(toggleSelection(['a', 'b', 'c'], 'd')).toEqual({ selected: ['a', 'b', 'c'], blocked: true });
  });

  it('still lets a selected id be removed when three are picked', () => {
    expect(toggleSelection(['a', 'b', 'c'], 'b')).toEqual({ selected: ['a', 'c'], blocked: false });
  });
});

describe('canCompare', () => {
  it('is true for two or three selections only', () => {
    expect([0, 1, 2, 3, 4].map(canCompare)).toEqual([false, false, true, true, false]);
  });
});

it('uses the spec hint', () => {
  expect(LIMIT_HINT).toBe('Up to three at a time');
});
