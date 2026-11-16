# Press Cycle

A parody news game in the spirit of Quiplash, built on a real, unfolding news story. Each round a reporter
asks a question and you get the first few words of the answer ("Let me be clear:"). Finish the sentence.
It's scored 0-100 on how well it works as PR, and prints instantly as consequence headlines ("Boardroom
offended", "Chinese government is looking for you", "Stock down 4%"). Five rounds, then the front page.

Scoring: `api/judge.js` (Vercel function) asks Claude (`claude-haiku-5-5` by default, override with
`JUDGE_MODEL`) for a score, verdict, 3 headlines, a one-line "why" and a reaction face, as strict JSON.
It needs `ANTHROPIC_API_KEY` in the Vercel project. Without it (or if it's slow) the page scores locally
with `src/classify.js` keyword rules and the pack's `fallback` lines, so the game always works.

## Run it

Plain HTML + ES modules, no build step. three.js comes from jsDelivr (pinned 0.170.0).

```
python3 -m http.server 8000   # then open http://localhost:8000
```

Debug: `?fallback` forces the hand-built bust, `?rot=90` overrides the model's turn (pack `character.rotationY`), `?pack=<id>` picks a pack.

## Files

- `index.html`, `style.css`: page and editorial styling (Unbounded / Geist / Geist Mono).
- `src/main.js`: game flow (intro → 5 questions → front page), meters, stamps, ticker, share text.
- `src/stage.js`: three.js press-scrum close-up: step-and-repeat wall, mics, camera flashes, one GLB per
  expression swapped behind a flash, idle motion and per-expression reactions. Falls back to a hand-built
  caricature bust if no model loads.
- `api/judge.js`: the Claude judge. `src/classify.js`: offline fallback scorer (keyword rules).
- `packs/index.json`: which scandal packs exist and the daily rotation.
- `packs/<id>.json`: one scandal: subject, setup, `context` (the real facts, sent to the judge), 5 rounds
  (asker, outlet, question, starter), offline `fallback` per tone, endings by total score, `sources`
  (real reporting, linked in the footer). Add a new scandal by adding a pack.

## Characters

Each pack's `character.models` maps expressions (`neutral, smug, nervous, shocked, angry, sad, triumphant`)
to GLB URLs. The first character was made with Higgsfield: a caricature image per expression
(GPT Image 2.6), each turned into 3D with Tripo H3.1. The GLBs are served through `/hf/*`, a Vercel
rewrite to Higgsfield's CDN; copy them into `assets/` if those links ever stop working.

## Deploy

Repo `YuvrajxGarg/news-cycle`, own Vercel project `news-cycle`. Production deploys from `main` only (`vercel.json` turns off other
branches).
