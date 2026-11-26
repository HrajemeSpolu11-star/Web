// Volání AI modelů. Hlavní: Groq (bezplatný tier). Záloha: Cloudflare Workers AI.
// Model se dá vyměnit v wrangler.jsonc (GROQ_MODEL, CF_MODEL) bez úprav kódu.

async function groq(env, messages) {
  const model = env.GROQ_MODEL || "openai/gpt-oss-120b";
  const telo = { model, messages, temperature: 0.4, max_completion_tokens: 3000, response_format: { type: "json_object" } };
  if (model.includes("gpt-oss")) telo.reasoning_effort = "low";
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(telo),
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) throw new Error(`Groq HTTP ${r.status}`);
  const d = await r.json();
  return { text: d.choices?.[0]?.message?.content || "", model: `groq:${model}` };
}

async function workersAi(env, messages) {
  const model = env.CF_MODEL || "@cf/google/gemma-3-12b-it";
  const r = await env.AI.run(model, { messages, max_tokens: 3000, temperature: 0.4 });
  const text = typeof r?.response === "string" ? r.response : JSON.stringify(r?.response ?? "");
  return { text, model: `cf:${model}` };
}

export function vytahniJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI nevrátila JSON");
  return JSON.parse(m[0]);
}

// Zkusí Groq, při chybě Workers AI. Vrací { data (objekt z JSON), model }.
export async function zeptejSe(env, messages) {
  const chyby = [];
  if (env.GROQ_API_KEY) {
    try { const r = await groq(env, messages); return { data: vytahniJson(r.text), model: r.model }; }
    catch (e) { chyby.push(String(e.message || e)); }
  }
  if (env.AI) {
    try { const r = await workersAi(env, messages); return { data: vytahniJson(r.text), model: r.model }; }
    catch (e) { chyby.push(String(e.message || e)); }
  }
  throw new Error("Žádný AI model nefungoval: " + (chyby.join("; ") || "není nastaven"));
}
