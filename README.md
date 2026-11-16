# Press Cycle

A parody news game built on a real, unfolding news story. The figure has one press statement to read, with
blanks. Each blank answers a real question from this week's news; the player fills it from a dropdown of five
fragments (mixed tones, shuffled). Then the statement is released and judged.

## Scoring

- Styles (neutral, diplomatic, charismatic, edgy, unhinged) are dev-only and never shown to players.
- Each blank lists the audiences listening to that part, each with a plain "wants" line. Behind it each group
  has a taste per style from -3 to +3; every taste point = 10 points, summed over the parts it heard.
- The judges (`api/react.js`, Claude `claude-haiku-5-5` by default, `JUDGE_MODEL` override, strict JSON) read
  the whole statement as each audience and add -5..+5 per group, a one-line reaction and three headlines.
  Needs `ANTHROPIC_API_KEY`; without it the page uses the pack's canned lines and no bonus.
  `GET /api/react?health=1` runs one sample judgement and reports ok/timing (no secrets).
- The total picks the ending (`endings[].min`). Player copy never mentions Claude: say "the judges".

Sound is procedural WebAudio (`src/audio.js`). Mute is in the masthead.

## Run it

Plain HTML + ES modules, no build step. three.js comes from jsDelivr (pinned 0.170.0).

```
python3 -m http.server 8000   # then open http://localhost:8000
```

Debug: `?fallback` forces the hand-built bust, `?rot=90` overrides the model's turn (pack `character.rotationY`), `?pack=<id>` picks a pack.

## Files

- `index.html`, `style.css`: page and editorial styling (Unbounded / Geist / Geist Mono).
- `src/main.js`: game flow (intro → statement editor with blanks → release → judges and front page).
- `src/audio.js`: music and SFX.
- `src/stage.js`: three.js press-scrum close-up: step-and-repeat wall, mics, camera flashes, one GLB per
  expression swapped behind a flash, idle motion and per-expression reactions. Falls back to a hand-built
  caricature bust if no model loads.
- `api/react.js`: Claude audience reactions.
- `packs/index.json`: which scandal packs exist and the daily rotation.
- `packs/<id>.json`: one scandal: subject, setup, `context` (real facts, sent to the judges), `styles`,
  `groups` (name, kind, `wants`, persona, `taste`, fallback `lines`), `statement` (`template` with `{0}`..`{n}`
  blanks; `blanks[]` with asker, outlet, real question, `source`, listening group ids, 5 options with style),
  `faces` (incl. `byStyle`), `headlines` by tier, `endings`, `sources`. Add a new scandal by adding a pack.

## Characters

Each pack's `character.models` maps expressions (`neutral, smug, nervous, shocked, angry, sad, triumphant`)
to GLB URLs. The first character was made with Higgsfield: a caricature image per expression
(GPT Image 2.6), each turned into 3D with Tripo H3.1. The GLBs are served through `/hf/*`, a Vercel
rewrite to Higgsfield's CDN; copy them into `assets/` if those links ever stop working.

## Deploy

Repo `YuvrajxGarg/news-cycle`, own Vercel project `news-cycle`. Production deploys from `main` only (`vercel.json` turns off other
branches).
