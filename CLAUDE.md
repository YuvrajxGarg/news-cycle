# Press Cycle

Parody "write the scandal statement" game. Read `README.md`.

- Plain ES modules + three.js (CDN importmap), no build step. One serverless function, `api/judge.js` (Claude judge, needs `ANTHROPIC_API_KEY`); the page must keep working without it.
- Content is data: one JSON pack per scandal in `packs/`. Keep the game engine subject-agnostic.
- Packs follow the real news cycle (facts in `context`, links in `sources`). Real people are parody only: no sexual or romantic jokes, no new allegations, no invented quotes presented as real, parody label stays
  in the footer and masthead. Consequence headlines are jokes about news coverage, not claims of fact.
- Look: newsprint paper, ink black, red `#e8352b`, yellow `#ffc93c`; Unbounded / Geist / Geist Mono.
  Playful editorial, no AI-kitsch. Characters are caricatures with several expressions.
- Own GitHub repo (`YuvrajxGarg/news-cycle`) and own Vercel project (`news-cycle`). Production deploys from `main` only; batch changes.
