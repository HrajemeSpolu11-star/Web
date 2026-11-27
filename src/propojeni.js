// Jedno ID hry: propojení všech částí webu přes IGDB (slug = trvalý identifikátor hry v databázi her).
//  • Kategorie Twitche → IGDB: oficiální vazba z Twitch Helix /games (pole igdb_id) – žádné hádání podle názvu.
//  • Steam → IGDB: oficiální vazba z IGDB external_games (zdroj Steam).
// Výsledek se ukládá do `hry.igdb_slug` a `steam_hry.igdb_slug`; stránky pak odkazují na profil hry v databázi
// (hry streamerů, novinky, stránka hry, slevy, kalendář). Běží každou hodinu v Cronu psaní (úloha „databaze“).
// Požadavky: max. 2 na Twitch + 4 na IGDB za běh. Zápisy: jen nově propojené hry (první dny stovky, pak jednotky).
import { token } from "./twitch.js";
import { igdb } from "./igdb-hra.js";
import { zajistiSchemaHlidac } from "./hlidac.js";

let hotovo = false;
export async function zajistiSchemaPropojeni(db) {
  if (hotovo) return;
  await zajistiSchemaHlidac(db);
  const [h, s] = await db.batch([db.prepare("PRAGMA table_info(hry)"), db.prepare("PRAGMA table_info(steam_hry)")]);
  const sh = new Set(h.results.map((c) => c.name)), ss = new Set(s.results.map((c) => c.name));
  const p = [];
  if (!sh.has("igdb_id")) p.push(db.prepare("ALTER TABLE hry ADD COLUMN igdb_id INTEGER"));
  if (!sh.has("igdb_slug")) p.push(db.prepare("ALTER TABLE hry ADD COLUMN igdb_slug TEXT"));
  if (!ss.has("igdb_slug")) p.push(db.prepare("ALTER TABLE steam_hry ADD COLUMN igdb_slug TEXT"));
  if (!ss.has("igdb_cas")) p.push(db.prepare("ALTER TABLE steam_hry ADD COLUMN igdb_cas INTEGER"));
  if (p.length) await db.batch(p);
  await db.batch([
    db.prepare("CREATE INDEX IF NOT EXISTS idx_hry_igdb ON hry(igdb_slug)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_steam_hry_igdb ON steam_hry(igdb_slug)"),
  ]);
  hotovo = true;
}

async function slugyPodleId(env, stav, ids) {
  const m = new Map();
  for (let i = 0; i < ids.length; i += 250) {
    const d = await igdb(env, stav, "games", [`fields id,slug; where id = (${ids.slice(i, i + 250).join(",")}); limit 250;`]);
    for (const g of d || []) if (Number.isInteger(g.id) && g.slug) m.set(g.id, g.slug);
  }
  return m;
}

export async function propojHry(env) {
  const db = env.DB, ted = Date.now();
  await zajistiSchemaPropojeni(db);
  const stav = { tok: await token(env), obnoveno: false };
  const zapisy = [];
  let twitch = 0, steam = 0;

  // 1) Kategorie Twitche (100 naposledy hraných bez vazby).
  const { results: tw } = await db.prepare("SELECT slug, twitch_id FROM hry WHERE twitch_id IS NOT NULL AND igdb_id IS NULL ORDER BY posledni DESC LIMIT 100").all();
  if (tw.length) {
    const r = await fetch(`https://api.twitch.tv/helix/games?${tw.map((x) => `id=${encodeURIComponent(x.twitch_id)}`).join("&")}`, {
      headers: { "Client-ID": env.TWITCH_CLIENT_ID, Authorization: `Bearer ${stav.tok}` }, signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const d = await r.json();
      const igdbId = new Map((d.data || []).map((g) => [String(g.id), parseInt(g.igdb_id, 10) || 0]));
      const slugy = await slugyPodleId(env, stav, [...new Set([...igdbId.values()].filter((x) => x > 0))]);
      for (const x of tw) {
        const id = igdbId.get(String(x.twitch_id)) ?? 0; // 0 = Twitch vazbu nemá (např. Just Chatting) → už se neptat
        zapisy.push(db.prepare("UPDATE hry SET igdb_id = ?, igdb_slug = ? WHERE slug = ?").bind(id, slugy.get(id) || null, x.slug));
        if (slugy.get(id)) twitch++;
      }
    }
  }

  // 2) Hry ze Steamu (400 nejoblíbenějších bez ověřené vazby; nenalezené se zkusí znovu po 30 dnech).
  const { results: st } = await db.prepare(`SELECT id FROM steam_hry WHERE igdb_cas IS NULL OR (igdb_slug IS NULL AND igdb_cas < ?)
    ORDER BY COALESCE(doporuceni, 0) DESC LIMIT 400`).bind(ted - 30 * 86400e3).all();
  if (st.length) {
    const ext = await igdb(env, stav, "external_games", [
      `fields game,uid; where uid = (${st.map((x) => `"${String(x.id).replace(/\D/g, "")}"`).join(",")}) & external_game_source = 1; limit 500;`,
      `fields game,uid; where uid = (${st.map((x) => `"${String(x.id).replace(/\D/g, "")}"`).join(",")}) & category = 1; limit 500;`,
    ]);
    const hra = new Map();
    for (const e of ext || []) if (e?.uid && Number.isInteger(e.game) && !hra.has(String(e.uid))) hra.set(String(e.uid), e.game);
    const slugy = await slugyPodleId(env, stav, [...new Set(hra.values())]);
    for (const x of st) {
      const slug = slugy.get(hra.get(String(x.id))) || null;
      zapisy.push(db.prepare("UPDATE steam_hry SET igdb_slug = ?, igdb_cas = ? WHERE id = ?").bind(slug, ted, x.id));
      if (slug) steam++;
    }
  }
  for (let i = 0; i < zapisy.length; i += 100) await db.batch(zapisy.slice(i, i + 100));
  return { twitch, steam, zkontrolovano: tw.length + st.length };
}

// Hry zmíněné v textu (novinky): známé názvy z propojených her. Jen celé názvy, aspoň 4 znaky, nejdelší první.
let cacheNazvu = null;
export async function hryVTextu(db, text) {
  if (!text) return [];
  if (!cacheNazvu || Date.now() - cacheNazvu.cas > 3600e3) {
    await zajistiSchemaPropojeni(db);
    const [a, b] = await db.batch([
      db.prepare("SELECT nazev, igdb_slug AS slug FROM hry WHERE igdb_slug IS NOT NULL ORDER BY posledni DESC LIMIT 600"),
      db.prepare("SELECT data FROM katalog WHERE klic = 'igdb_popularni'"),
    ]);
    let pop = [];
    try { pop = b.results[0] ? JSON.parse(b.results[0].data) : []; } catch { /* nic */ }
    const m = new Map();
    for (const x of [...a.results, ...pop]) if (x?.nazev && x?.slug && String(x.nazev).length >= 4 && !m.has(x.nazev.toLowerCase())) m.set(x.nazev.toLowerCase(), { nazev: x.nazev, slug: x.slug });
    cacheNazvu = { cas: Date.now(), list: [...m.values()].sort((x, y) => y.nazev.length - x.nazev.length) };
  }
  const t = ` ${String(text).toLowerCase()} `;
  const nalez = [];
  for (const h of cacheNazvu.list) {
    const n = h.nazev.toLowerCase();
    const i = t.indexOf(n);
    if (i < 0) continue;
    const pred = t[i - 1], po = t[i + n.length];
    if (/[\p{L}\p{N}]/u.test(pred || "") || /[\p{L}\p{N}]/u.test(po || "")) continue; // jen celé slovo/fráze
    if (nalez.some((x) => x.nazev.toLowerCase().includes(n))) continue; // „GTA V“ uvnitř delšího názvu
    nalez.push(h);
    if (nalez.length >= 5) break;
  }
  return nalez;
}
