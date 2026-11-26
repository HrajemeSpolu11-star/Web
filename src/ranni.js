// Ranní AI přehled: každé ráno 5 nejdůležitějších herních zpráv za posledních 24 h, česky a krátce.
// Vzniká jen ze zpráv, které web sám nasbíral (tabulka clanky). Každý bod odkazuje na konkrétní zprávu.
// Pojistky proti vymýšlení: bod musí odkazovat na existující zprávu a čísla v textu se musí objevit v té zprávě.
// Běží v Cronu psaní („7 * * * *“) od 6:00 pražského času, jednou denně (při chybě to zkusí znovu další hodinu).
import { zeptejSe } from "./ai.js";
import { denPraha, hodinaPraha } from "./psani.js";
import { ZDROJE } from "./zdroje.js";

const NAZEV_ZDROJE = new Map(ZDROJE.map((z) => [z.id, z.nazev]));

const SCHEMA = "CREATE TABLE IF NOT EXISTS ranni (den TEXT PRIMARY KEY, data TEXT NOT NULL, cas INTEGER NOT NULL)";
const BODU = 5;
const cisla = (t) => (String(t).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(",", "."));

export async function generujRanni(env, vynutit = false) {
  const db = env.DB;
  await db.prepare(SCHEMA).run();
  const ted = Date.now();
  const den = denPraha(ted);
  if (!vynutit && hodinaPraha(ted) < 6) return { stav: "ještě není ráno" };
  if (await db.prepare("SELECT 1 AS x FROM ranni WHERE den = ?").bind(den).first()) return { stav: "dnes už hotovo" };

  const { results } = await db.prepare(`SELECT id, nadpis, perex, jazyk, datum, zdroj_id FROM clanky
    WHERE datum > ? ORDER BY datum DESC LIMIT 60`).bind(ted - 24 * 3600e3).all();
  if (results.length < 6) return { stav: "málo zpráv za 24 h" };
  const zpravy = results.map((r, i) => ({ ...r, zdroj: NAZEV_ZDROJE.get(r.zdroj_id) || "", k: `z${i + 1}` }));
  const podleK = new Map(zpravy.map((z) => [z.k, z]));
  const seznam = zpravy.map((z) => `[${z.k}] (${z.zdroj || "web"}, ${z.jazyk === "cs" ? "česky" : "anglicky"}) ${z.nadpis} — ${String(z.perex || "").slice(0, 260)}`).join("\n");

  const { data, model } = await zeptejSe(env, [
    { role: "system", content: "Jsi editor českého herního webu. Píšeš věcně, česky, bez reklamy a bez domýšlení. Odpovídáš jen JSON." },
    { role: "user", content: `Z těchto herních zpráv za posledních 24 hodin vyber ${BODU} nejdůležitějších pro české hráče
(velká oznámení, vydání, odklady, slevy a hry zdarma, důležité aktualizace). Stejné téma z více zdrojů ber jako jednu zprávu.
Ke každé napiš krátký nadpis (max 70 znaků) a 1–2 věty shrnutí (max 220 znaků). Používej JEN informace ze zprávy,
žádná čísla ani jména, která tam nejsou. Názvy her nepřekládej.
Vrať JSON: {"body":[{"zprava":"z1","nadpis":"...","text":"..."}]}

ZPRÁVY:
${seznam}` },
  ]);

  const body = [];
  const pouzite = new Set();
  for (const b of Array.isArray(data?.body) ? data.body : []) {
    const z = podleK.get(String(b?.zprava || "").trim());
    const nadpis = String(b?.nadpis || "").replace(/\s+/g, " ").trim().slice(0, 90);
    const text = String(b?.text || "").replace(/\s+/g, " ").trim().slice(0, 280);
    if (!z || pouzite.has(z.id) || nadpis.length < 8 || text.length < 20) continue;
    // Každé číslo z AI textu musí být i ve zdrojové zprávě (ochrana proti vymyšleným datům, cenám, procentům).
    const zdroj = new Set(cisla(`${z.nadpis} ${z.perex || ""}`));
    if (cisla(`${nadpis} ${text}`).some((c) => !zdroj.has(c))) continue;
    pouzite.add(z.id);
    body.push({ nadpis, text, clanek: z.id, zdroj: z.zdroj || "", jazyk: z.jazyk || "" });
    if (body.length >= BODU) break;
  }
  if (body.length < 3) throw new Error(`AI vrátila jen ${body.length} použitelné body`);
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO ranni (den, data, cas) VALUES (?, ?, ?)").bind(den, JSON.stringify({ body, model, zprav: zpravy.length }), ted),
    db.prepare("DELETE FROM ranni WHERE cas < ?").bind(ted - 60 * 86400e3),
  ]);
  return { bodu: body.length };
}

// /api/ranni – dnešní (nebo nejnovější) přehled + seznam posledních dnů.
export async function apiRanni(env, den) {
  const db = env.DB;
  await db.prepare(SCHEMA).run();
  const r = /^\d{4}-\d{2}-\d{2}$/.test(den || "")
    ? await db.prepare("SELECT den, data, cas FROM ranni WHERE den = ?").bind(den).first()
    : await db.prepare("SELECT den, data, cas FROM ranni ORDER BY den DESC LIMIT 1").first();
  const { results } = await db.prepare("SELECT den FROM ranni ORDER BY den DESC LIMIT 14").all();
  if (!r) return { den: null, body: [], dny: [] };
  let d = {};
  try { d = JSON.parse(r.data); } catch { /* nic */ }
  return { den: r.den, cas: new Date(r.cas).toISOString(), body: d.body || [], zprav: d.zprav || 0, dny: results.map((x) => x.den) };
}
