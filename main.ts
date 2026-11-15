// mdsprint driver: read every case from <input>/cases.json, render each one alone with our parse(),
// and write <output>/html.json as a JSON array of HTML strings in the cases' order.
// MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR replace /input and /output when run outside the container.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const inDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inDir, 'cases.json'), 'utf8')) as { id: string; markdown: string }[];
const out: string[] = new Array(cases.length);
for (let i = 0; i < cases.length; i++) out[i] = parse(cases[i].markdown);
writeFileSync(join(outDir, 'html.json'), JSON.stringify(out));
