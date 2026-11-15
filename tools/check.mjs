// Correctness check: render every practice case with ../parse.js and compare with the reference HTML
// byte for byte. Usage: node tools/check.mjs [kitDir]   (prints passed/total and the first 3 diffs)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const KIT = process.argv[2] ?? process.env.MDSPEED_KIT ??
  '/home/agent/makefun-kit/mdspeed02/x_s222/markdown-render-speed-02-kit';
const { parse } = await import(join(here, '..', 'parse.js'));

const cases = JSON.parse(readFileSync(join(KIT, 'practice/input/cases.json'), 'utf8'));
const expected = JSON.parse(readFileSync(join(KIT, 'practice/reference/expected.json'), 'utf8')).cases;
const want = new Map(expected.map((c) => [c.id, c.html]));

let passed = 0;
const fails = [];
for (const c of cases) {
  let got;
  try {
    got = parse(c.markdown);
  } catch (e) {
    got = 'THREW: ' + (e && e.stack || e);
  }
  const exp = want.get(c.id);
  if (got === exp) passed++;
  else fails.push({ id: c.id, md: c.markdown, got, exp });
}
console.log(`passed ${passed}/${cases.length}`);
for (const f of fails.slice(0, 3)) {
  let i = 0;
  while (i < f.got.length && f.got[i] === f.exp[i]) i++;
  const from = Math.max(0, i - 60);
  console.log(`\n--- ${f.id} (first diff at char ${i})`);
  console.log('markdown:', JSON.stringify(f.md.length > 400 ? f.md.slice(0, 400) + '…' : f.md));
  console.log('expected:', JSON.stringify(f.exp.slice(from, i + 100)));
  console.log('got     :', JSON.stringify(f.got.slice(from, i + 100)));
}
if (fails.length) console.log('\nfailing ids:', fails.map((f) => f.id).join(' '));
process.exitCode = passed === cases.length ? 0 : 1;
