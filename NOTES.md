# mdsprint — session notes

## Status (end of session 1)
- `node tools/check.mjs` → **passed 720/720** (practice set, byte for byte vs marked 18.1.3).
- `node tools/bench.mjs 5` (5 passes × 720 cases, process.cpuUsage, same process, Node 22):
  marked 1970–2470 ms, ours 1886–1930 ms → **only ×1.04–1.28**. The first run, which includes warm-up, is about 2.4 s for both.
- Per case (`/tmp/percase.mjs`-style loop): ~380 ms per full pass. The time is spread evenly across the ~40 large
  `doc-*` cases (75–110 KB each, ~12–15 ms each); no single pathological case. So the work left is general throughput.

## What exists
- `parse.js`: a single-module rewrite of marked 18.1.3's default (gfm) pipeline. Tokenizer merged into a `Lexer`
  class; renderer = plain functions (`renderBlocks`, `renderInline`, `renderPlain` for image alt). No options,
  extensions, hooks, async or walkTokens. Regexes are built once at module load with marked's own `edit()` splicing
  semantics (carets dropped from inserted parts), so they are identical to marked's gfm regexes. The emStrong/del
  "last possible closer" cache is a stack on the lexer (`closers`) instead of marked's WeakMap.
- `main.ts`: the driver (reads `$MAKEFUN_INPUT_DIR|/input/cases.json`, writes `html.json`).
- `tools/check.mjs [kitDir]`: correctness (passed/total + first 3 diffs + failing ids). Exit code 1 on any failure.
- `tools/bench.mjs [N] [kitDir]`: CPU ms ours vs the kit's vendored marked (imported from the kit path).
- Kit path default: `/home/agent/makefun-kit/mdspeed02/x_s222/markdown-render-speed-02-kit` (override with
  `MDSPEED_KIT`). Node: `/home/agent/tools/node22/bin/node`.

## Rules to keep in mind
- All 720 must match or the entry is unranked. Re-run check.mjs after EVERY change; never commit a failing parse.js.
- At least 30% of counted lines must be authored by the agent in its own writes (not cp/paste from tool output).
- No deps, no WASM, repo ≤ 1 MiB, never commit the practice set. Don't push (the operator pushes).

## Prioritized TODO (next sessions)
1. **Stop re-slicing `src`**: the block and inline loops do `src = src.substring(raw.length)` and run `^`-anchored regexes on
   each new slice. Switch to a position index + sticky (`y`) regexes (`re.lastIndex = pos; re.exec(full)`), and remove the `^`
   from those regexes. Do it rule by rule (paragraph, text, space first: they fire most often), checking after each one.
2. **Inline fast path**: in `inlineLoop`, dispatch on the first char code. `escape` only on `\`, `tag`/`autolink`
   only on `<`, `link`/`reflink` only on `[` or `![`, emStrong only on `*`/`_`, codespan on `` ` ``, del on `~`, br on
   ` `/`\`, url only when the text could start a url (h/H/f/F/w/W, or an email char followed by `@`). Today
   every rule's regex runs at every position.
3. **inlineText**: replace the big `iText` regex with a hand-written scan to the next special char
   (`\\<![`*~_` plus the url/email/www/`  \n` lookaheads). This is the hottest regex. Keep exact semantics: stop before
   `_` preceded by a word boundary, before `protocol://`, before `www.` not preceded by `[^\s*_~(]`, before an email-ish run
   followed by `@`, before 2+ spaces + newline.
4. **mask()/closerInfo** run for every inlineTokens call containing `*`/`_`/`~`, including nested em/strong/link text.
   Compute once for the top-level paragraph and pass offsets down (careful: the nested masked string is different; marked
   recomputes `closerInfo` when the masked string doesn't match the stack top).
5. Replace `[...str]` code-point spreads in emStrong/del with charCode checks (surrogate-aware only where needed).
6. Block level: blank-line/`space` fast path via charCode scan; paragraph continuation check: test the per-line
   interrupt conditions by first char before running the giant `bParagraph` regex.
7. Renderer: build output with array push/join or a single accumulator passed down rather than nested string returns
   (measure first: V8 ropes may already be fine).
8. escapeHtml: hand-written loop instead of test+replace with callback.
9. Later: measure startup (module-load regex compilation); maybe make building the large regexes lazy.
