// POST /api/react: the audience panel reacts to the statement the player picked.
// Base points come from each group's visible taste chart (client side). Claude adds a small bonus
// (-5..+5 per group) for how the exact wording lands with that group, a one-line reaction in the
// group's voice, and the news ticker. Needs ANTHROPIC_API_KEY; without it this returns 503 and the
// page uses the pack's canned lines with no bonus, so the game still works.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.JUDGE_MODEL || "claude-haiku-5-5";
const FACES = ["neutral", "smug", "nervous", "shocked", "angry", "sad", "triumphant"];
const STYLES = ["neutral", "diplomatic", "charismatic", "edgy", "unhinged"];

const SYSTEM = `You voice the audience in PRESS CYCLE, a parody party game about the real news cycle.
A public figure is in a real, ongoing scandal. A reporter asks a real question; the player picks one of five prepared statements for the figure. Each statement has a style (neutral, diplomatic, charismatic, edgy joke, unhinged joke). Four audience groups judge it. Each group already gives base points from its fixed taste for that style; you do NOT change those.

For each group return:
- "bonus": an integer from -5 to 5 for how this exact wording lands with this group beyond its style (a sharp, well-aimed line earns more, a line that misreads the group loses some). Most bonuses are -2..3.
- "line": that group's reaction in its own voice, at most 14 words, funny and specific to the statement and the question. Match the sign of base+bonus: delighted if high, furious if low.

Also return 3 consequence "headlines", each at most 8 words, punchy satirical ticker style ("Boardroom offended", "Stock down 4%", "Washington is also looking for you"). The first is the biggest. They follow from what was said and how the groups took it. And "face": the figure's reaction.

Rules: stay consistent with the scandal context; never invent new allegations or new facts about real people; never joke about anyone's private or romantic life, never sexual, never hateful. Headlines are jokes about coverage, not claims of fact.`;

const SCHEMA = {
  type: "object",
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, bonus: { type: "integer" }, line: { type: "string" } },
        required: ["id", "bonus", "line"],
        additionalProperties: false,
      },
    },
    headlines: { type: "array", items: { type: "string" } },
    face: { type: "string", enum: FACES },
  },
  required: ["groups", "headlines", "face"],
  additionalProperties: false,
};

const cut = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export default async function handler(req, res) {
  if (req.method === "GET" && req.query?.health === "1") return health(res);
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("react: ANTHROPIC_API_KEY missing in this deployment");
    return res.status(503).json({ error: "ANTHROPIC_API_KEY is not set" });
  }

  const body = typeof req.body === "string" ? safeJSON(req.body) : req.body || {};
  const groups = (Array.isArray(body.groups) ? body.groups : []).slice(0, 6).map((g) => ({
    id: cut(g.id, 24),
    name: cut(g.name, 40),
    kind: cut(g.kind, 24),
    persona: cut(g.persona, 200),
    base: Math.max(-30, Math.min(30, Math.round(Number(g.base) || 0))),
  }));
  const style = STYLES.includes(body.style) ? body.style : "neutral";
  const statement = cut(body.statement, 240);
  if (!groups.length || statement.length < 2) return res.status(400).json({ error: "Missing statement or groups" });

  const prompt = [
    `Figure: ${cut(body.subject, 60)} (${cut(body.role, 80)})`,
    `Scandal context: ${cut(body.context, 1400)}`,
    `Reporter (${cut(body.asker, 80)}) asks: ${cut(body.question, 240)}`,
    `Statement style: ${style}`,
    `Statement: "${statement}"`,
    `Audience groups (base points already given for this style):`,
    ...groups.map((g) => `- id ${g.id}: ${g.name} (${g.kind}), ${g.persona}. Base ${g.base >= 0 ? "+" : ""}${g.base}.`),
  ].join("\n");

  try {
    const client = new Anthropic();
    const msg = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 2000,
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      },
      { timeout: 15000, maxRetries: 1 },
    );
    if (msg.stop_reason === "refusal") return res.status(422).json({ error: "refused" });
    const out = JSON.parse(msg.content.find((b) => b.type === "text")?.text || "{}");
    const byId = new Map((out.groups || []).map((g) => [g.id, g]));
    return res.status(200).json({
      groups: groups.map((g) => {
        const r = byId.get(g.id) || {};
        return { id: g.id, bonus: Math.max(-5, Math.min(5, Math.round(Number(r.bonus) || 0))), line: cut(r.line, 110) };
      }),
      headlines: (out.headlines || []).slice(0, 3).map((h) => cut(h, 70)).filter(Boolean),
      face: FACES.includes(out.face) ? out.face : "neutral",
      judge: "claude",
    });
  } catch (err) {
    console.error("react failed:", err?.status, err?.message);
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "busy" });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `react failed (${err.status})` });
    return res.status(502).json({ error: "react failed" });
  }
}

// GET /api/react?health=1: one tiny judge call, reports whether the judges work (no secrets returned).
async function health(res) {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ ok: false, reason: "no ANTHROPIC_API_KEY in this deployment" });
  try {
    const msg = await new Anthropic().messages.create(
      {
        model: MODEL,
        max_tokens: 200,
        output_config: { effort: "low", format: { type: "json_schema", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } } },
        messages: [{ role: "user", content: "Reply ok true." }],
      },
      { timeout: 15000, maxRetries: 0 },
    );
    return res.status(200).json({ ok: true, model: MODEL, stop: msg.stop_reason });
  } catch (err) {
    return res.status(200).json({ ok: false, model: MODEL, status: err?.status ?? null, error: String(err?.message || err).slice(0, 300) });
  }
}

function safeJSON(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
