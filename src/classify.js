// Reads a player-written statement and decides what kind of statement it is.
// No AI call: a small keyword reader, so it works offline and the rules are visible.
// Tones: own, deny, deflect, attack, joke, hype, vague.

const RULES = {
  own: [
    /\bsorry\b/, /apolog/, /\bmistake/, /responsib/, /\bi was wrong\b/, /\bmy fault\b/, /\bi own\b/, /\bown (it|this|that)\b/,
    /accountab/, /cooperat/, /\bhonest/, /\btruth/, /\bregret/, /\btransparen/, /\bfully\b.*\breview\b/, /\byes\b/, /\badmit/,
  ],
  deny: [
    /\bnever\b/, /\bfake\b/, /\bfalse\b/, /\bnot true\b/, /\bdidn'?t\b/, /\bdid not\b/, /\bno idea\b/, /\bdeny\b/, /\blies?\b/,
    /\brumou?rs?\b/, /\bnonsense\b/, /\bbaseless\b/, /\bnothing happened\b/, /\bcompletely untrue\b/,
  ],
  attack: [
    /\bleak(er|ed|s)?\b/, /\btraitors?\b/, /\benem(y|ies)\b/, /\bhaters?\b/, /\bjealous/, /\bsue\b/, /\blawsuit/, /\bfire them\b/,
    /\bbetray/, /\bcoup\b/, /\bidiots?\b/, /\bclowns?\b/, /\bshame on\b/, /\bhow dare\b/, /\bwitch ?hunt\b/,
  ],
  joke: [
    /\blol\b/, /\bhaha/, /\bjacket/, /\bdumpling/, /😂|🤣|😎|💀/, /\bkidding\b/, /\bjoke\b/, /\bmeme/, /\bvibes?\b/,
    /\bsunglasses\b/, /\*[^*]+\*/,
  ],
  hype: [
    /\brecord\b/, /\bbest\b/, /\bgreatest\b/, /\bnumbers\b/, /\bstock\b/, /\bchips?\b/, /\bgpus?\b/, /\bfuture\b/, /\blaunch/,
    /\btrillion/, /\brevenue/, /\bgrowth\b/, /\binnovat/, /\bvision/, /\bunstoppable\b/, /\bgenius\b/, /\bwinning\b/,
  ],
  deflect: [
    /\banyway\b/, /\bnext question\b/, /\bfocus on\b/, /\blet'?s talk about\b/, /\binstead\b/, /\bmoving on\b/,
    /\bwhat about\b/, /\bthe real (issue|story|question)\b/, /\bno comment\b/, /\bnot going to (comment|discuss)\b/,
  ],
  vague: [
    /\bsynerg/, /\bstakeholders?\b/, /\bgoing forward\b/, /\bcommitted to\b/, /\bjourney\b/, /\bvalues\b/, /\bexcellence\b/,
    /\bprocess\b/, /\bremain focused\b/, /\bat this time\b/, /\bin due course\b/,
  ],
};

// When two tones tie, the earlier one in this list wins (the more revealing reading).
const PRIORITY = ["attack", "deny", "own", "joke", "hype", "deflect", "vague"];

export const TONE_LABEL = {
  own: "Owning it",
  deny: "Denial",
  deflect: "Deflection",
  attack: "Attack",
  joke: "Joke",
  hype: "Hype",
  vague: "Corporate fog",
};

export function classify(text) {
  const t = String(text || "").toLowerCase().trim();
  if (t.length < 3) return "vague";
  let best = "vague";
  let bestScore = 0;
  for (const tone of PRIORITY) {
    const score = RULES[tone].reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
    if (score > bestScore) {
      best = tone;
      bestScore = score;
    }
  }
  // Shouting reads as an attack unless something stronger was found.
  if (bestScore === 0 && /[A-Z]{4,}/.test(text) && /!/.test(text)) return "attack";
  return best;
}
