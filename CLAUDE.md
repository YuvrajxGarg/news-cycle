# Press Cycle

Parody "write the scandal statement" game. Read `README.md`.

Mechanic (Yuvraj, v3): 5 real questions, no timer (removed by Yuvraj 2026-11-16), 5 written answers per question (1 neutral, 1 diplomatic, 1 charismatic, 2 risky jokes: edgy + unhinged), no free typing. 4 audience groups per question; each card shows a plain "wants" line. The five style categories are dev-only: never show style labels, colors or taste numbers to players (Yuvraj, 2026-11-16).

- Plain ES modules + three.js (CDN importmap), no build step. One serverless function, `api/react.js` (Claude audience reactions, needs `ANTHROPIC_API_KEY`); the page must keep working without it.
- Content is data: one JSON pack per scandal in `packs/`. Keep the game engine subject-agnostic.
- Packs follow the real news cycle (facts in `context`, links in `sources`). Real people are parody only: no sexual or romantic jokes, no new allegations, no invented quotes presented as real, parody label stays
  in the footer and masthead. Consequence headlines are jokes about news coverage, not claims of fact.
- Look: newsprint paper, ink black, red `#e8352b`, yellow `#ffc93c`; Unbounded / Geist / Geist Mono.
  Playful editorial, no AI-kitsch. Characters are caricatures with several expressions.
- Own GitHub repo (`YuvrajxGarg/news-cycle`) and own Vercel project (`news-cycle`). Production deploys from `main` only; batch changes.
