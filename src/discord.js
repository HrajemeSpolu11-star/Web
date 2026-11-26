// Oznámení nových článků na Discord přes webhook (Secret DISCORD_WEBHOOK_URL). Bez něj nedělá nic.
export async function oznamClanek(env, { id, nadpis, perex }) {
  const hook = String(env.DISCORD_WEBHOOK_URL || "");
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(hook)) return;
  const web = String(env.SITE_URL || "").replace(/\/+$/, "");
  try {
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Herní puls",
        allowed_mentions: { parse: [] },
        embeds: [{ title: String(nadpis).slice(0, 250), description: String(perex || "").slice(0, 500), url: web ? `${web}/clanek/${id}` : undefined, color: 0xff4d6d }],
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) { console.warn("discord:", e); }
}
