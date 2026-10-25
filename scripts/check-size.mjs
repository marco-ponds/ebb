// Fails the build if the statically imported JS from the entry exceeds the gzip budget.
// Lazy chunks (dynamicImports, e.g. the PDF library) are deliberately not counted.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET = 120 * 1024;
const dist = 'dist';
const manifest = JSON.parse(readFileSync(join(dist, '.vite', 'manifest.json'), 'utf8'));

const seen = new Set();
const stack = ['index.html'];
while (stack.length > 0) {
  const key = stack.pop();
  if (seen.has(key)) continue;
  seen.add(key);
  const chunk = manifest[key];
  if (!chunk) throw new Error(`check-size: ${key} missing from manifest`);
  for (const dep of chunk.imports ?? []) stack.push(dep);
}

let total = 0;
for (const key of seen) {
  const file = manifest[key].file;
  if (!file.endsWith('.js')) continue;
  const size = gzipSync(readFileSync(join(dist, file))).length;
  total += size;
  console.log(`  ${file}: ${(size / 1024).toFixed(1)} kB gzip`);
}
console.log(`Initial JS: ${(total / 1024).toFixed(1)} kB gzip (budget ${BUDGET / 1024} kB)`);
if (total > BUDGET) {
  console.error('check-size: over budget');
  process.exit(1);
}
