import type { Contraction } from './types';

/** A rule of the data model was broken by the caller (second active session, second open contraction...). Never retried. */
export class InvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvariantError';
  }
}

/** An edited or added contraction overlaps another finished one. Never retried. */
export class OverlapError extends Error {
  readonly other: Contraction;
  constructor(other: Contraction) {
    super('This contraction overlaps another one');
    this.name = 'OverlapError';
    this.other = other;
  }
}

/** Errors caused by the request itself rather than by storage: the write queue never retries these. */
export function isDomainError(e: unknown): boolean {
  return e instanceof InvariantError || e instanceof OverlapError || e instanceof RangeError;
}
