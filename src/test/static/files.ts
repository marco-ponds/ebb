import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(process.cwd(), 'src');

export function walk(dir: string = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

export const rel = (file: string) => relative(process.cwd(), file).split('\\').join('/');

export const isTest = (file: string) => /\.test\.(ts|tsx)$/.test(file) || rel(file).startsWith('src/test/');

export function sourceFiles(exts: string[]): Array<{ path: string; text: string }> {
  return walk()
    .filter((f) => exts.some((e) => f.endsWith(e)) && !isTest(f))
    .map((f) => ({ path: rel(f), text: readFileSync(f, 'utf8') }));
}
