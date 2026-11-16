# Press Cycle

A parody news game built on a real, unfolding news story. Each round a real reporter asks a real question
from the news cycle. You have 20 seconds to pick one of five answers, each in a style: Neutral, Diplomatic,
Charismatic, Edgy joke, Unhinged joke. Four audience groups are listening (Washington, Beijing, Wall Street,
the board, staff, the internet, philosophers, ethicists, the press, gamers; a different four each round).
Five rounds, then the front page.

## Scoring (shown to the player)

- Styles are internal (dev-only), never shown to players. Each audience card shows a plain "wants" line; behind it
  each group has a taste per style from -3 to +3, and each taste point = 10 points.
- Claude reads the exact line as each audience and adds -5..+5 per group, plus a one-line reaction in
  that group's voice and three consequence headlines (`api/react.js`, `claude-haiku-5-5` by default,
  override with `JUDGE_MODEL`, strict JSON). Needs `ANTHROPIC_API_KEY` in the Vercel project. Without it
  the page uses the pack's canned group lines and headlines with no line bonus, so the game still works.
- Speed: +1 per second left. Timeout = "No comment." scored as Neutral, no speed bonus.
- Total picks the ending (`endings[].min` in the pack).

Sound is procedural WebAudio (`src/audio.js`): a quiet lo-fi loop plus ticks, shutter, stamp, crowd and
buzzer effects. Mute is in the masthead and remembered per browser.

## Run it

Plain HTML + ES modules, no build step. three.js comes from jsDelivr (pinned 0.170.0).

```
python3 -m http.server 8000   # then open http://localhost:8000
```

Debug: `?fallback` forces the hand-built bust, `?rot=90` overrides the model's turn (pack `character.rotationY`), `?pack=<id>` picks a pack.

## Files

- `index.html`, `style.css`: page and editorial styling (Unbounded / Geist / Geist Mono).
- `src/main.js`: game flow (intro → 5 timed questions → front page), audience cards, scoring board, stamps, ticker, share text.
- `src/audio.js`: music and SFX.
- `src/stage.js`: three.js press-scrum close-up: step-and-repeat wall, mics, camera flashes, one GLB per
  expression swapped behind a flash, idle motion and per-expression reactions. Falls back to a hand-built
  caricature bust if no model loads.
- `api/react.js`: Claude audience reactions.
- `packs/index.json`: which scandal packs exist and the daily rotation.
- `packs/<id>.json`: one scandal: subject, setup, `context` (the real facts, sent to the judge), `styles`,
  `groups` (name, kind, `wants` shown to players, persona, `taste` per style, fallback `lines`), 5 `rounds` (asker, outlet, real
  question, `source` note, 4 group ids, 5 options with style), `faces` and `headlines` by round tier,
  endings by total score, `sources`
  (real reporting, linked in the footer). Add a new scandal by adding a pack.

## Characters

Each pack's `character.models` maps expressions (`neutral, smug, nervous, shocked, angry, sad, triumphant`)
to GLB URLs. The first character was made with Higgsfield: a caricature image per expression
(GPT Image 2.6), each turned into 3D with Tripo H3.1. The GLBs are served through `/hf/*`, a Vercel
rewrite to Higgsfield's CDN; copy them into `assets/` if those links ever stop working.

## Deploy

Repo `YuvrajxGarg/news-cycle`, own Vercel project `news-cycle`. Production deploys from `main` only (`vercel.json` turns off other
branches).
