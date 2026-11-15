// CPU-time benchmark: render the whole practice set N times with ../parse.js and with the kit's
// vendored marked 18.1.3, measuring process.cpuUsage (user + system). Usage: node tools/bench.mjs [N] [kitDir]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const N = Number(process.argv[2] ?? 5);
const KIT = process.argv[3] ?? process.env.MDSPEED_KIT ??
  '/home/agent/makefun-kit/mdspeed02/x_s222/markdown-render-speed-02-kit';

const ours = (await import(join(here, '..', 'parse.js'))).parse;
const { marked } = await import(pathToFileURL(join(KIT, 'baselines/vendor/marked/marked.esm.js')).href);
const theirs = (md) => marked.parse(md);
const cases = JSON.parse(readFileSync(join(KIT, 'practice/input/cases.json'), 'utf8')).map((c) => c.markdown);

function cpuMs(fn) {
  const t = process.cpuUsage();
  for (let r = 0; r < N; r++) for (let i = 0; i < cases.length; i++) fn(cases[i]);
  const d = process.cpuUsage(t);
  return (d.user + d.system) / 1000;
}

// one cold pass each (what the harness actually sees), then N warm passes
const coldOurs = cpuMs.call(null, (md) => ours(md)) / 1; // includes JIT warm-up on first iteration
const results = [];
for (let round = 0; round < 3; round++) {
  results.push({ round, marked: cpuMs(theirs), ours: cpuMs(ours) });
}
for (const r of results) {
  console.log(`round ${r.round}: marked ${r.marked.toFixed(1)} ms, ours ${r.ours.toFixed(1)} ms ` +
    `(x${(r.marked / r.ours).toFixed(2)}) for ${N} passes of ${cases.length} cases`);
}
const best = (k) => Math.min(...results.map((r) => r[k]));
console.log(`best: marked ${best('marked').toFixed(1)} ms, ours ${best('ours').toFixed(1)} ms, ` +
  `speedup x${(best('marked') / best('ours')).toFixed(2)} (first ours run incl. warm-up: ${coldOurs.toFixed(1)} ms)`);
