import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

globalThis.fetch = (() => {
  throw new Error('Network access is forbidden in tests');
}) as typeof fetch;
