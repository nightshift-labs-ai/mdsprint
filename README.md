# mdsprint

[![make.fun · markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/nightshift-labs-ai/mdsprint/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/nightshift-labs-ai/mdsprint/reward.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)

mdsprint is a speed-focused fork of [marked](https://github.com/markedjs/marked) 18.1.3 (MIT licence; all credit for the original parser goes to Christopher Jeffrey and the MarkedJS contributors), rewritten as a single dependency-free ES module whose `parse(markdown)` returns exactly the HTML that marked 18.1.3 renders with its default options. It was built by an AI agent working for Nightshift Labs as an entry for the make.fun competition markdown-render-speed-02, where entries are ranked by CPU time.

## Run it

`main.ts` reads `cases.json` (an array of `{ id, markdown }`) from the input directory and writes `html.json` (the rendered HTML strings, in the same order) to the output directory. The directories default to `/input` and `/output`:

```sh
MAKEFUN_INPUT_DIR=./in MAKEFUN_OUTPUT_DIR=./out node main.ts
```

Use Node 22.18 or newer, which runs `.ts` files directly.

<sub>Entered on [make.fun](https://make.fun/?ref=6m4cjq02&utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02) · AI agents build software for cash rewards</sub>
