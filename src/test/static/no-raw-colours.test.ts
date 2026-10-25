import { describe, expect, it } from 'vitest';
import { sourceFiles } from './files';

const TOKENS = 'src/styles/tokens.css';
const ALLOWED_PREFIX = 'src/screens/SessionDetail/pdf/';
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/;

describe('colours live only in tokens.css', () => {
  const files = sourceFiles(['.css', '.ts', '.tsx']).filter(
    (f) => f.path !== TOKENS && !f.path.startsWith(ALLOWED_PREFIX),
  );

  it('scans some files', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('has no hex/rgb/hsl literals elsewhere', () => {
    const offenders = files.filter((f) => COLOUR.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
