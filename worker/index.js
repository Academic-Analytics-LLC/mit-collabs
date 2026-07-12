/**
 * collab-mit natural-language agent — Cloudflare Worker proxy.
 *
 * Holds the Anthropic API key as a Worker secret (never exposed to the browser). The static
 * site's chat widget POSTs {question} here; this Worker fetches the site's own small grounding
 * dataset (data/agent/summary.json, rebuilt by build_agent_summary.py whenever the underlying
 * numbers change) and asks Claude to answer using ONLY that data, so responses stay grounded in
 * the site's real, validated counts instead of the model guessing.
 *
 * Deploy: see the runbook. Required secret: ANTHROPIC_API_KEY (wrangler secret put).
 * Optional var: SUMMARY_URL (defaults to the live GitHub Pages summary.json below).
 */

const DEFAULT_SUMMARY_URL = "https://academic-analytics-llc.github.io/mit-collabs/data/agent/summary.json";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"; // fast/cheap; swap to claude-sonnet-5 for harder questions
const ALLOWED_ORIGIN = "https://academic-analytics-llc.github.io";
// Local preview via serve.bat (py/python -m http.server 8765) needs its own origin allowed too,
// since the browser enforces CORS based on the page's actual origin, not whether it's "really"
// the live site. Add more localhost ports here if you preview on a different one.
const ALLOWED_ORIGINS = [ALLOWED_ORIGIN, "http://localhost:8765", "http://127.0.0.1:8765"];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function getSummary(env) {
  const url = env.SUMMARY_URL || DEFAULT_SUMMARY_URL;
  const cache = caches.default;
  const cacheKey = new Request(url, { cf: { cacheTtl: 300 } });
  let res = await cache.match(cacheKey);
  if (!res) {
    res = await fetch(url, { cf: { cacheTtl: 300 } });
    if (res.ok) {
      const clone = res.clone();
      // 5 min edge cache — summary.json only changes when someone reruns the build script.
      const cached = new Response(clone.body, clone);
      cached.headers.set("Cache-Control", "public, max-age=300");
      await cache.put(cacheKey, cached);
    }
  }
  if (!res.ok) throw new Error(`summary fetch failed: ${res.status}`);
  return res.text();
}

async function askClaude(question, summaryJson, env) {
  const system = `You answer natural-language questions about the MIT Collaboration Network \
(Academic Analytics, AAD2024-2904) using ONLY the JSON data below. It contains, per MIT \
department/college/institution and per Unit Type (Department vs Program, never mix the two \
in one answer unless asked to compare them), distinct-works and collaboration-instance counts \
for within/across/inter/intra/all scopes, each unit's top partner units, and a glossary \
explaining exact definitions and known caveats (read the glossary before answering anything \
about methodology or why a number looks a certain way).

Rules:
- If the data doesn't contain what's asked, say so plainly — do not guess or estimate a number.
- Always state whether a number is "works" (distinct papers/grants/etc) or "collabs" \
(co-authorship instances with multiplicity) since they answer different questions.
- Never print the raw MIT institution ID (123); just say "MIT".
- Keep answers short and direct — a sentence or two plus the number(s), not a report.
- Never use the word "Clinical" as a unit-type label (say "Medical"); "Clinical Trial" as a \
work type is fine.

DATA:
${summaryJson}`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      system,
      messages: [{ role: "user", content: question }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Anthropic API error ${r.status}: ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  return (data.content || []).map((b) => b.text || "").join("").trim() || "(no answer text returned)";
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (req.method !== "POST") {
      return new Response("POST only", { status: 405, headers: cors });
    }

    let question;
    try {
      const body = await req.json();
      question = (body.question || "").toString().trim();
    } catch {
      return new Response(JSON.stringify({ error: "bad json body" }), {
        status: 400,
        headers: { "content-type": "application/json", ...cors },
      });
    }
    if (!question) {
      return new Response(JSON.stringify({ error: "missing 'question'" }), {
        status: 400,
        headers: { "content-type": "application/json", ...cors },
      });
    }
    if (question.length > 500) {
      return new Response(JSON.stringify({ error: "question too long (max 500 chars)" }), {
        status: 400,
        headers: { "content-type": "application/json", ...cors },
      });
    }

    try {
      const summaryJson = await getSummary(env);
      const answer = await askClaude(question, summaryJson, env);
      return new Response(JSON.stringify({ answer }), {
        headers: { "content-type": "application/json", ...cors },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err.message || err) }), {
        status: 500,
        headers: { "content-type": "application/json", ...cors },
      });
    }
  },
};
