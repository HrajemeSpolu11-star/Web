// Kalendář vydání her („roadmapa“): co vychází, kdy a jestli bude česky.
//  • Termíny a platformy: IGDB (oficiální API databáze her od Twitche; přihlášení stejným Twitch Client ID a tajným klíčem).
//  • Čeština: ze Steamu (seznam jazyků hry, src/hlidac.js), když ho hra má; jinak z IGDB (language_supports).
// Obnova jednou za 6 h v Cronu katalogu (1–2 požadavky). Výsledek v tabulce katalog pod klíčem „vydani“.
import { token } from "./twitch.js";
import { prikazyPridejHry, zajistiSchemaHlidac } from "./hlidac.js";

const PLATNOST = 6 * 3600e3;
// Pole z IGDB. game.first_release_date = první vydání hry vůbec (kterékoli platformy nebo předběžný přístup) –
// podle něj poznáme, že „vydání“ v kalendáři je jen port starší hry nebo plná verze po Early Access, ne nová hra.
const ZAKLAD = "date,human,platform.abbreviation,game.id,game.name,game.slug,game.hypes,game.cover.image_id,game.first_release_date";
const POLE = [
  `fields ${ZAKLAD},status.name,game.game_type.type,game.websites.url,game.language_supports.language.name,game.language_supports.language_support_type.name;`,
  `fields ${ZAKLAD},game.websites.url,game.language_supports.language.name,game.language_supports.language_support_type.name;`,
  `fields ${ZAKLAD};`,
];
// Typy záznamů, které do kalendáře nepatří (balíčky, aktualizace, módy…).
const NE_TYP = /bundle|update|pack|mod\b|fork|season|episode/i;
const DEN = 86400;

async function igdb(env, tok, telo) {
  const r = await fetch("https://api.igdb.com/v4/release_dates", {
    method: "POST", body: telo, signal: AbortSignal.timeout(12000),
    headers: { "Client-ID": env.TWITCH_CLIENT_ID, Authorization: `Bearer ${tok}`, Accept: "application/json" },
  });
  if (!r.ok) { const e = new Error(`IGDB HTTP ${r.status}`); e.kod = r.status; throw e; }
  return r.json();
}

// Úroveň češtiny z IGDB: 2 = dabing (Audio), 1 = titulky/rozhraní, null = neuvedeno.
function cestinaIgdb(g) {
  const cz = (g.language_supports || []).filter((l) => /czech/i.test(l.language?.name || ""));
  if (!cz.length) return null;
  return cz.some((l) => /audio/i.test(l.language_support_type?.name || "")) ? 2 : 1;
}

export async function sberVydani(env, vynutit = false) {
  const db = env.DB;
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return { stav: "chybí Twitch klíče" };
  const st = await db.prepare("SELECT cas, instr(data, '\"prvni\"') AS nova FROM katalog WHERE klic = 'vydani'").first().catch(() => null);
  // Data ze staré verze (bez data prvního vydání) se obnoví hned.
  if (!vynutit && st && st.nova && Date.now() - st.cas < PLATNOST) return { stav: "aktuální" };
  const ted = Math.floor(Date.now() / 1000);
  const kde = ` where date >= ${ted - DEN} & date < ${ted + 400 * DEN} & game.hypes > 3; sort date asc; limit 400;`;
  let tok = await token(env), data = null, uroven = 0, obnoveno = false;
  while (uroven < POLE.length) {
    try { data = await igdb(env, tok, POLE[uroven] + kde); break; }
    catch (e) {
      if (e.kod === 401 && !obnoveno) { tok = await token(env, true); obnoveno = true; continue; } // prošlý token → jednou nový
      if (e.kod !== 400) throw e;
      uroven++; // 400 = IGDB nezná některé pole → zkusíme jednodušší dotaz
    }
  }
  if (!data) throw new Error("IGDB nevrátila data");
  // Sloučení: jedna hra = jeden řádek s nejbližším nadcházejícím datem a všemi platformami.
  const hry = new Map();
  for (const r of data) {
    const g = r.game;
    if (!g?.id || !g.name || !Number.isFinite(r.date)) continue;
    const typ = g.game_type?.type || "";
    if (NE_TYP.test(typ)) continue;
    if (/cancel|zrušen/i.test(r.status?.name || "")) continue;
    const x = hry.get(g.id) || { id: g.id, nazev: String(g.name).slice(0, 160), slug: g.slug || "", hype: g.hypes || 0, platformy: new Set(),
      obrazek: g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${encodeURIComponent(g.cover.image_id)}.jpg` : "",
      steam: ((g.websites || []).map((w) => /store\.steampowered\.com\/app\/(\d+)/.exec(w.url || "")).find(Boolean) || [])[1] || "",
      cestina_igdb: cestinaIgdb(g), datum: r.date, presne: /^[A-Za-z]{3} \d{1,2}, \d{4}$/.test(String(r.human || "")), human: r.human || "",
      prvni: Number.isFinite(g.first_release_date) ? g.first_release_date : null, typ: String(typ).slice(0, 40), stav: String(r.status?.name || "").slice(0, 40) };
    if (r.platform?.abbreviation) x.platformy.add(r.platform.abbreviation);
    if (r.date < x.datum) {
      x.datum = r.date; x.human = r.human || ""; x.presne = /^[A-Za-z]{3} \d{1,2}, \d{4}$/.test(String(r.human || "")); x.stav = String(r.status?.name || "").slice(0, 40);
    }
    hry.set(g.id, x);
  }
  const seznam = [...hry.values()].map((x) => ({ ...x, platformy: [...x.platformy].slice(0, 6) })).sort((a, b) => a.datum - b.datum);
  const prikazy = [db.prepare("INSERT OR REPLACE INTO katalog (klic, data, cas) VALUES ('vydani', ?, ?)").bind(JSON.stringify(seznam), Date.now())];
  // Hry ze Steamu do databáze her → postupně se ověří čeština i to, jestli už na Steamu vyšly (sberJazyku).
  await zajistiSchemaHlidac(db);
  prikazy.push(...prikazyPridejHry(db, seznam.filter((x) => x.steam).slice(0, 150).map((x) => ({ id: x.steam, nazev: x.nazev })), Date.now()));
  await db.batch(prikazy);
  return { her: seznam.length, se_steamem: seznam.filter((x) => x.steam).length, uroven };
}

// /api/vydani
export async function apiVydani(env) {
  const db = env.DB;
  await db.prepare("CREATE TABLE IF NOT EXISTS katalog (klic TEXT PRIMARY KEY, data TEXT NOT NULL, cas INTEGER NOT NULL)").run();
  const r = await db.prepare("SELECT data, cas FROM katalog WHERE klic = 'vydani'").first();
  if (!r) return { hry: [], cas: null };
  let hry = [];
  try { hry = JSON.parse(r.data); } catch { /* nic */ }
  await zajistiSchemaHlidac(db);
  const ids = [...new Set(hry.map((h) => h.steam).filter(Boolean))];
  const steam = new Map();
  for (let i = 0; i < ids.length; i += 90) {
    const d = ids.slice(i, i + 90);
    const { results } = await db.prepare(`SELECT id, cestina, vychazi, jazyky_cas FROM steam_hry WHERE id IN (${d.map(() => "?").join(",")})`).bind(...d).all();
    for (const x of results) steam.set(x.id, x);
  }
  const ted = Date.now() / 1000;
  return {
    cas: new Date(r.cas).toISOString(),
    hry: hry.filter((h) => Number.isFinite(h.datum) && h.datum >= ted - DEN).map((h) => {
      const st = h.steam ? steam.get(h.steam) : null;
      const zSteamu = st && st.cestina != null ? st.cestina : null;
      // Hra už je hratelná: IGDB zná dřívější první vydání (jiná platforma, předběžný přístup),
      // nebo ji Steam při poslední kontrole vedl jako vydanou (ne „připravujeme“).
      const drive = h.prvni != null && h.prvni < h.datum - DEN;
      const naSteamu = !!(st && st.jazyky_cas && !st.vychazi);
      return { nazev: h.nazev, igdb: h.slug ? `https://www.igdb.com/games/${encodeURIComponent(h.slug)}` : "", steam: h.steam ? `https://store.steampowered.com/app/${h.steam}/` : "",
        steam_id: h.steam || "", obrazek: h.obrazek, platformy: h.platformy, hype: h.hype, datum: new Date(h.datum * 1000).toISOString(), presne: h.presne, human: h.human,
        typ: h.typ || "", stav: h.stav || "",
        uz_vyslo: drive || naSteamu, prvni: drive ? new Date(h.prvni * 1000).toISOString() : null, na_steamu: naSteamu,
        cestina: zSteamu ?? h.cestina_igdb ?? null, cestina_zdroj: zSteamu != null ? "Steam" : h.cestina_igdb != null ? "IGDB" : "" };
    }),
  };
}
