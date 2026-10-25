import { describe, expect, it } from 'vitest';
import { decideLanding } from './landing';

const session = { id: 's' } as never;
const contraction = { id: 'c' } as never;

describe('decideLanding', () => {
  it('rule 1: no onboardedAt goes to Welcome, whatever else is open', () => {
    expect(decideLanding({ onboardedAt: null, activeSession: session, activeContraction: contraction })).toBe('welcome');
  });
  it('rule 2: an open contraction goes to Live', () => {
    expect(decideLanding({ onboardedAt: 1, activeSession: session, activeContraction: contraction })).toBe('live');
  });
  it('rule 3: an open session goes to Live', () => {
    expect(decideLanding({ onboardedAt: 1, activeSession: session, activeContraction: null })).toBe('live');
  });
  it('rule 4: otherwise Start', () => {
    expect(decideLanding({ onboardedAt: 1, activeSession: null, activeContraction: null })).toBe('start');
  });
});
