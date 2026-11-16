# Press Cycle

A parody news game. Someone is in a scandal; you write what they say next. Five questions, five
statements, and every answer prints instantly as consequence headlines ("Boardroom offended",
"Chinese government is looking for you", "AI partners pulled out"). After five you get the front page.

Underneath it's a media-literacy game: each statement is read as a tone (owning it, denial, deflection,
attack, joke, hype, corporate fog) and the result says why it landed the way it did.

## Run it

Plain HTML + ES modules, no build step. three.js comes from jsDelivr (pinned 0.170.0).

```
python3 -m http.server 8000   # then open http://localhost:8000
```

Debug: `?fallback` forces the hand-built bust, `?rot=180` rotates a generated model, `?pack=<id>` picks a pack.

## Files

- `index.html`, `style.css`: page and editorial styling (Unbounded / Geist / Geist Mono).
- `src/main.js`: game flow (intro → 5 questions → front page), meters, stamps, ticker, share text.
- `src/stage.js`: three.js press-scrum close-up: step-and-repeat wall, mics, camera flashes, one GLB per
  expression swapped behind a flash, idle motion and per-expression reactions. Falls back to a hand-built
  caricature bust if no model loads.
- `src/classify.js`: reads a typed statement into a tone with visible keyword rules (no AI call).
- `packs/index.json`: which scandal packs exist and the daily rotation.
- `packs/<id>.json`: one scandal: subject, setup, meters, 5 rounds × 4 options (tone, face, effects,
  headlines, why), free-text reactions per tone, endings, lessons. Add a new scandal by adding a pack.

## Characters

Each pack's `character.models` maps expressions (`neutral, smug, nervous, shocked, angry, sad, triumphant`)
to GLB URLs. The first character was made with Higgsfield: a caricature image per expression
(GPT Image 2.6), each turned into 3D with Tripo H3.1. The GLBs are served through `/hf/*`, a Vercel
rewrite to Higgsfield's CDN; copy them into `assets/` if those links ever stop working.

## Deploy

Repo `YuvrajxGarg/news-cycle`, own Vercel project `news-cycle`. Production deploys from `main` only (`vercel.json` turns off other
branches).
