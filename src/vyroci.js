// „Dnes před X lety vyšlo“: slavné hry, které vyšly v tento den v minulých letech. Zdroj: IGDB (games.first_release_date).
// Jednou denně v Cronu katalogu („25“): 1 dotaz na IGDB (+ případně obnova tokenu). Výsledek v tabulce katalog pod klíčem „vyroci“.
import { token } from "./twitch.js";
import { denPraha } from "./psani.js";

const DEN = 86400;
const POLE = [
  "fields name,slug,first_release_date,total_rating_count,cover.image_id,platforms.abbreviation,websites.url;",
  "fields name,slug,first_release_date,total_rating_count,cover.image_id;",
];

async function dotaz(env, tok, telo) {
  const r = await fetch("https://api.igdb.com/v4/games", {
    method: "POST", body: telo, signal: AbortSignal.timeout(12000),
    headers: { "Client-ID": env.TWITCH_CLIENT_ID, Authorization: `Bearer ${tok}`, Accept: "application/json" },
  });
  if (!r.ok) { const e = new Error(`IGDB HTTP ${r.status}`); e.kod = r.status; throw e; }
  return r.json();
}

export async function sberVyroci(env) {
  const db = env.DB;
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return { stav: "chybí Twitch klíče" };
  const den = denPraha();
  const st = await db.prepare("SELECT data FROM katalog WHERE klic = 'vyroci'").first().catch(() => null);
  try { if (st && JSON.parse(st.data).den === den) return { stav: "aktuální" }; } catch { /* přepočítat */ }
  const [r, m, d] = den.split("-").map(Number);
  // IGDB ukládá datum vydání jako půlnoc UTC daného dne → okno přesně jeden den pro každý rok 1980 až loni.
  const okna = [];
  for (let y = 1980; y < r; y++) {
    if (m === 2 && d === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) continue;
    const od = Date.UTC(y, m - 1, d) / 1000;
    okna.push(`(first_release_date >= ${od} & first_release_date < ${od + DEN})`);
  }
  const kde = ` where (${okna.join(" | ")}) & total_rating_count > 40 & game_type = (0,8,9,10); sort total_rating_count desc; limit 12;`;
  const kdeBezTypu = ` where (${okna.join(" | ")}) & total_rating_count > 40; sort total_rating_count desc; limit 12;`;
  let tok = await token(env), data = null, obnoveno = false;
  const pokusy = [POLE[0] + kde, POLE[0] + kdeBezTypu, POLE[1] + kdeBezTypu];
  for (let i = 0; i < pokusy.length && !data;) {
    try { data = await dotaz(env, tok, pokusy[i]); }
    catch (e) {
      if (e.kod === 401 && !obnoveno) { tok = await token(env, true); obnoveno = true; continue; }
      if (e.kod !== 400) throw e;
      i++;
    }
  }
  const hry = (data || []).filter((g) => g?.name && Number.isFinite(g.first_release_date)).slice(0, 8).map((g) => ({
    nazev: String(g.name).slice(0, 120),
    rok: new Date(g.first_release_date * 1000).getUTCFullYear(),
    hodnoceni: g.total_rating_count || 0,
    obrazek: g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${encodeURIComponent(g.cover.image_id)}.jpg` : "",
    platformy: (g.platforms || []).map((p) => p.abbreviation).filter(Boolean).slice(0, 5),
    steam: ((g.websites || []).map((w) => /store\.steampowered\.com\/app\/(\d+)/.exec(w.url || "")).find(Boolean) || [])[1] || "",
    igdb: g.slug ? `https://www.igdb.com/games/${encodeURIComponent(g.slug)}` : "",
  }));
  await db.prepare("INSERT OR REPLACE INTO katalog (klic, data, cas) VALUES ('vyroci', ?, ?)").bind(JSON.stringify({ den, hry }), Date.now()).run();
  return { her: hry.length };
}

// /api/vyroci
export async function apiVyroci(env) {
  const r = await env.DB.prepare("SELECT data FROM katalog WHERE klic = 'vyroci'").first().catch(() => null);
  let d = { den: null, hry: [] };
  try { if (r) d = JSON.parse(r.data); } catch { /* nic */ }
  const rok = Number(denPraha().slice(0, 4));
  // Data ze včerejška se nezobrazí – ukazovala by špatné výročí.
  if (d.den !== denPraha()) return { den: null, hry: [] };
  return { den: d.den, hry: (d.hry || []).map((h) => ({ ...h, pred: rok - h.rok })) };
}
