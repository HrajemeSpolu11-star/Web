// Aktualizace her srozumitelně: oficiální oznámení vývojářů na Steamu → česká AI shrnutí.
//
// 1) Seznam sledovaných her (tabulka „sledovane“, ~1 000–1 200 her), sestavuje se 1× denně v Cronu katalogu:
//    • 1 000 nejpopulárnějších her na Steamu podle IGDB (popularity_primitives „Steam 24hr Peak Players“ → external_games = Steam ID),
//    • 100 nejhranějších her na Steamu (žebříček katalogu), hry, které se nejvíc streamují v Česku,
//    • hry hlídané v Hlídači cen a hry z importovaných seznamů přání (zdroj „wishlist“).
// 2) Kontrola (Cron novinek „*/15“): 15 her za běh, které jsou nejdéle nezkontrolované (= 60 her/h, celý seznam ~1× za 17 h),
//    ISteamNews/GetNewsForApp jen kanál steam_community_announcements (píše sám vývojář). Nová aktualizace se ukáže HNED
//    (nadpis, hra, datum, odkaz) a shrnutí se doplní později.
// 3) Shrnutí (Cron psaní „7“): 2 za hodinu, nejdřív nejpopulárnější hry. Pevná struktura (typ, co přináší, komu, změny ve
//    skupinách). Řádek s číslem, které v originále není, se zahodí; neprojde-li shrnutí, zůstane jen originální nadpis.
// GOG a Epic oficiální rozhraní pro poznámky k aktualizacím nemají – většina her je ale vydává i na Steamu.
import { zeptejSe } from "./ai.js";
import { token } from "./twitch.js";
import { denPraha } from "./psani.js";
import { BEZ_KATEGORIE } from "./prehled.js";
import { normNazev } from "./hra-data.js";
import { zajistiSchemaHlidac, prikazyPridejHry } from "./hlidac.js";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS patche (gid TEXT PRIMARY KEY, appid TEXT NOT NULL, hra TEXT NOT NULL, nadpis TEXT NOT NULL, url TEXT NOT NULL,
     datum INTEGER NOT NULL, text TEXT, stav TEXT NOT NULL DEFAULT 'novy', shrnuti TEXT, model TEXT, ziskano INTEGER)`,
  `CREATE INDEX IF NOT EXISTS idx_patche_datum ON patche(datum DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_patche_stav ON patche(stav, datum DESC)`,
  // Stránka hry a pulsometr hledají aktualizace jedné hry (appid ani datum se po vložení nemění → žádné zápisy navíc).
  `CREATE INDEX IF NOT EXISTS idx_patche_appid ON patche(appid, datum DESC)`,
  `CREATE TABLE IF NOT EXISTS sledovane (appid TEXT PRIMARY KEY, nazev TEXT, poradi INTEGER, zdroj TEXT, kontrola INTEGER, aktualizovano INTEGER)`,
  `CREATE INDEX IF NOT EXISTS idx_sledovane_kontrola ON sledovane(kontrola, poradi)`,
];
const NOVE_SLOUPCE = ["typ TEXT", "poradi INTEGER"];
let hotovo = false;
export async function zajistiSchemaPatchu(db) {
  if (hotovo) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  const { results } = await db.prepare("PRAGMA table_info(patche)").all();
  const ma = new Set(results.map((r) => r.name));
  for (const sl of NOVE_SLOUPCE) if (!ma.has(sl.split(" ")[0])) await db.prepare(`ALTER TABLE patche ADD COLUMN ${sl}`).run().catch(() => {});
  hotovo = true;
}

const HER_NA_BEH = 15;
const DEN = 86400e3;
const JE_AKTUALIZACE = /patch|update|hotfix|release notes|changelog|season|balance|aktualizace|chapter|expansion|\bv?\d+\.\d+(\.\d+)?\b/i;
const NENI = /\bsale\b|discount|sleva|giveaway|merch|soundtrack|tournament|esports|livestream|\bstream\b|contest|fan ?art|cosplay|wallpaper|survey|job|hiring/i;
const https = (u) => (/^https:\/\//.test(String(u || "")) ? String(u) : "");
const steamId = (s) => (/^\d{1,10}$/.test(String(s || "")) ? String(s) : "");

// Typ aktualizace podle nadpisu (než ho upřesní AI).
export function typPodleNadpisu(t) {
  t = String(t || "");
  if (/season|sezón|battle ?pass|chapter|\bact \d/i.test(t)) return "sezona";
  if (/hotfix|bug ?fix|fixes|oprava|crash/i.test(t)) return "opravy";
  if (/balanc|nerf|buff/i.test(t)) return "rovnovaha";
  if (/major|big update|expansion|\bdlc\b|content update|\b\d+\.0(?![.\d])|launch|out now|available now/i.test(t)) return "velka";
  return "aktualizace";
}

// BBCode/HTML ze Steamu → čistý text.
function cistyText(t) {
  return String(t || "").replace(/\[\/?(h\d|b|i|u|list|olist|p|url[^\]]*|img[^\]]*|previewyoutube[^\]]*|video[^\]]*|table|tr|td|th|hr|quote|code|spoiler|strike|c)\]/gi, "\n")
    .replace(/\[\*\]/g, "\n- ").replace(/<[^>]+>/g, " ").replace(/\{STEAM_CLAN_IMAGE\}[^\s]*/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

// ---------- 1) Seznam sledovaných her ----------
async function igdb(env, tok, cesta, telo) {
  const r = await fetch(`https://api.igdb.com/v4/${cesta}`, {
    method: "POST", body: telo, signal: AbortSignal.timeout(12000),
    headers: { "Client-ID": env.TWITCH_CLIENT_ID, Authorization: `Bearer ${tok}`, Accept: "application/json" },
  });
  if (!r.ok) { const e = new Error(`IGDB ${cesta} HTTP ${r.status}`); e.kod = r.status; throw e; }
  return r.json();
}

// Až 1 000 nejpopulárnějších her na Steamu z IGDB (6–7 požadavků).
async function popularniZIgdb(env) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return [];
  const tok = await token(env);
  const typy = await igdb(env, tok, "popularity_types", "fields id,name; limit 50;");
  const typ = typy.find((t) => /24\s*hr.*peak.*players/i.test(t.name || "")) || typy.find((t) => /total reviews/i.test(t.name || ""));
  if (!typ) return [];
  const prim = [];
  for (const offset of [0, 500]) prim.push(...await igdb(env, tok, "popularity_primitives", `fields game_id,value; where popularity_type = ${Number(typ.id)}; sort value desc; limit 500; offset ${offset};`));
  const poradi = new Map(prim.map((p, i) => [p.game_id, i + 1]));
  const ids = [...poradi.keys()].filter((x) => Number.isInteger(x));
  const vysledek = [];
  for (let i = 0; i < ids.length; i += 500) {
    const davka = ids.slice(i, i + 500).join(",");
    let ext;
    try { ext = await igdb(env, tok, "external_games", `fields uid,game,name; where game = (${davka}) & external_game_source = 1; limit 500;`); }
    catch (e) { if (e.kod !== 400) throw e; ext = await igdb(env, tok, "external_games", `fields uid,game,name; where game = (${davka}) & category = 1; limit 500;`); }
    for (const x of ext) if (steamId(x.uid)) vysledek.push({ appid: String(x.uid), nazev: String(x.name || "").slice(0, 160), poradi: poradi.get(x.game) || 9999 });
  }
  return vysledek;
}

export async function sestavSledovane(env) {
  const db = env.DB;
  await zajistiSchemaPatchu(db);
  const den = denPraha();
  const st = await db.prepare("SELECT hodnota FROM nastaveni WHERE klic = 'sledovane_den'").first().catch(() => null);
  if (st?.hodnota === den) return { stav: "aktuální" };
  const ted = Date.now();
  const hry = new Map(); // appid → { nazev, poradi, zdroje:Set }
  const pridej = (appid, nazev, poradi, zdroj) => {
    if (!steamId(appid)) return;
    const x = hry.get(appid) || { nazev: "", poradi: 99999, zdroje: new Set() };
    if (nazev && !x.nazev) x.nazev = nazev;
    x.poradi = Math.min(x.poradi, poradi); x.zdroje.add(zdroj);
    hry.set(appid, x);
  };
  let chyba = "";
  try { for (const g of await popularniZIgdb(env)) pridej(g.appid, g.nazev, g.poradi, "popularni"); }
  catch (e) { chyba = String(e.message || e).slice(0, 120); }
  // Nejhranější na Steamu (katalog) – vždy navrch.
  try {
    const k = await db.prepare("SELECT data FROM katalog WHERE klic = 'steam_hrane'").first();
    JSON.parse(k?.data || "[]").forEach((h, i) => pridej(String(h.id), h.nazev, i + 1, "steam"));
  } catch { /* nic */ }
  // Hry, které se nejvíc streamují v Česku (posledních 7 dní) → Steam ID podle názvu z databáze her.
  try {
    const od = new Date(ted - 7 * DEN).toISOString().slice(0, 10);
    const { results: top } = await db.prepare(`SELECT hra, SUM(divako_minut) AS dm FROM hry_den WHERE den >= ? AND hra <> ? GROUP BY hra ORDER BY dm DESC LIMIT 60`).bind(od, BEZ_KATEGORIE).all();
    const podleNorm = new Map(top.map((r, i) => [normNazev(r.hra), { hra: r.hra, i }]));
    const klice = [...podleNorm.keys()].filter(Boolean);
    if (klice.length) {
      const { results } = await db.prepare(`SELECT id, norm FROM steam_hry WHERE norm IN (${klice.map(() => "?").join(",")})`).bind(...klice).all();
      for (const r of results) { const x = podleNorm.get(r.norm); if (x) pridej(String(r.id), x.hra, 50 + x.i, "cesko"); }
    }
  } catch { /* tabulky ještě nemusí existovat */ }
  // Hlídané hry.
  try { (await db.prepare("SELECT DISTINCT steam_id, nazev FROM hlidani").all()).results.forEach((r) => pridej(String(r.steam_id), r.nazev, 500, "hlidane")); } catch { /* nic */ }

  const prikazy = [];
  const st2 = db.prepare(`INSERT INTO sledovane (appid, nazev, poradi, zdroj, aktualizovano) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(appid) DO UPDATE SET nazev = COALESCE(NULLIF(excluded.nazev, ''), sledovane.nazev), poradi = excluded.poradi,
      zdroj = CASE WHEN sledovane.zdroj LIKE '%wishlist%' AND excluded.zdroj NOT LIKE '%wishlist%' THEN excluded.zdroj || ',wishlist' ELSE excluded.zdroj END,
      aktualizovano = excluded.aktualizovano`);
  for (const [appid, x] of hry) prikazy.push(st2.bind(appid, x.nazev.slice(0, 160), x.poradi, [...x.zdroje].join(","), ted));
  // Co z popularních vypadlo a nikdo to nehlídá ani nemá v seznamu přání, po týdnu pryč.
  prikazy.push(db.prepare("DELETE FROM sledovane WHERE aktualizovano < ? AND COALESCE(zdroj, '') NOT LIKE '%wishlist%'").bind(ted - 7 * DEN));
  prikazy.push(db.prepare("INSERT OR REPLACE INTO nastaveni (klic, hodnota, plati_do) VALUES ('sledovane_den', ?, 0)").bind(hry.size >= 200 ? den : ""));
  for (let i = 0; i < prikazy.length; i += 100) await db.batch(prikazy.slice(i, i + 100));
  return { her: hry.size, chyba };
}

// Přidání her ze seznamu přání (volá wishlist.js) – zkontrolují se mezi prvními.
export function prikazyPridejSledovane(db, hry) {
  const st = db.prepare(`INSERT INTO sledovane (appid, nazev, poradi, zdroj, aktualizovano, kontrola) VALUES (?, ?, 800, 'wishlist', ?, 0)
    ON CONFLICT(appid) DO UPDATE SET zdroj = CASE WHEN COALESCE(sledovane.zdroj, '') LIKE '%wishlist%' THEN sledovane.zdroj ELSE COALESCE(sledovane.zdroj || ',', '') || 'wishlist' END,
      nazev = COALESCE(NULLIF(sledovane.nazev, ''), excluded.nazev)`);
  const ted = Date.now();
  return hry.filter((h) => steamId(h.id)).map((h) => st.bind(String(h.id), String(h.nazev || "").slice(0, 160), ted));
}

// ---------- 2) Kontrola novinek u sledovaných her ----------
export async function sberPatchu(env) {
  const db = env.DB;
  await zajistiSchemaPatchu(db);
  const { results: vyber } = await db.prepare("SELECT appid, nazev, poradi FROM sledovane ORDER BY COALESCE(kontrola, 0) ASC, poradi ASC LIMIT ?").bind(HER_NA_BEH).all();
  if (!vyber.length) return { her: 0, novych: 0 };
  const odp = await Promise.allSettled(vyber.map((h) => fetch(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${encodeURIComponent(h.appid)}&count=4&maxlength=0&feeds=steam_community_announcements`,
    { signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))));
  const ted = Date.now();
  const prikazy = [], vlozit = db.prepare(`INSERT OR IGNORE INTO patche (gid, appid, hra, nadpis, url, datum, text, ziskano, typ, poradi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const vlozeni = []; // indexy příkazů INSERT – počet skutečně nových aktualizací
  vyber.forEach((h, i) => {
    prikazy.push(db.prepare("UPDATE sledovane SET kontrola = ? WHERE appid = ?").bind(ted, h.appid));
    if (odp[i].status !== "fulfilled") return;
    for (const n of odp[i].value?.appnews?.newsitems || []) {
      const datum = (Number(n.date) || 0) * 1000;
      if (ted - datum > 21 * DEN || datum > ted + 3600e3 || !n.gid || !https(n.url)) continue;
      if (!JE_AKTUALIZACE.test(n.title || "") || NENI.test(n.title || "")) continue;
      const text = cistyText(n.contents).slice(0, 9000);
      if (text.length < 120) continue;
      vlozeni.push(prikazy.length);
      prikazy.push(vlozit.bind(String(n.gid).slice(0, 40), String(h.appid), String(h.nazev || "").slice(0, 120) || `Hra ${h.appid}`, String(n.title).slice(0, 200),
        String(n.url).slice(0, 400), datum, text, ted, typPodleNadpisu(n.title), h.poradi || 9999));
    }
  });
  prikazy.push(db.prepare("DELETE FROM patche WHERE datum < ?").bind(ted - 120 * DEN));
  // Hry s novou aktualizací do databáze her (obrázek, cena a čeština se doplní při dalším sběru).
  await zajistiSchemaHlidac(db);
  const sNovinkou = vyber.filter((h, i) => odp[i].status === "fulfilled" && (odp[i].value?.appnews?.newsitems || []).length && h.nazev);
  prikazy.push(...prikazyPridejHry(db, sNovinkou.map((h) => ({ id: String(h.appid), nazev: h.nazev })), ted));
  const v = await db.batch(prikazy);
  return { her: vyber.length, novych: vlozeni.reduce((a, i) => a + (v[i]?.meta?.changes || 0), 0) };
}

// ---------- 3) Shrnutí AI ----------
const cisla = (t) => (String(t).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(",", "."));
const TYPY = ["velka", "sezona", "opravy", "rovnovaha", "aktualizace"];
const SKUPINY = ["novinky", "hratelnost", "opravy", "vykon"];

async function shrnJeden(env, db, p) {
  let data, model;
  try {
    ({ data, model } = await zeptejSe(env, [
      { role: "system", content: "Jsi český herní redaktor. Shrnuješ oficiální poznámky k aktualizacím her srozumitelně i pro hráče, kteří hru neznají. Odpovídáš jen JSON." },
      { role: "user", content: `Shrň česky tuto oficiální aktualizaci hry „${p.hra}“. Vrať JSON:
{"typ":"velka|sezona|opravy|rovnovaha|aktualizace","shrnuti":"1–2 věty, co aktualizace přináší (max 240 znaků)","komu":"komu se to týká nejvíc, jedna krátká věta (max 120 znaků)",
 "novinky":["nový obsah: mapy, postavy, předměty, režimy"],"hratelnost":["úpravy hratelnosti a rovnováhy"],"opravy":["opravené chyby"],"vykon":["výkon, grafika, stabilita"]}
Pravidla: v každé skupině nejvýš 5 nejdůležitějších bodů, každý jedna krátká věta (max 140 znaků); prázdná skupina = [].
Typ: velka = hodně nového obsahu, sezona = nová sezóna/battle pass, opravy = hlavně opravy chyb, rovnovaha = hlavně úpravy síly zbraní/postav, jinak aktualizace.
Používej JEN to, co je v textu. Nic nedomýšlej, nehodnoť, nepřidávej čísla, která v textu nejsou. Názvy předmětů, postav a režimů nepřekládej.

NADPIS: ${p.nadpis}
TEXT:
${String(p.text || "").slice(0, 7000)}` },
    ]));
  } catch (e) {
    throw e; // výpadek AI: aktualizace zůstane „čeká na shrnutí“ a zkusí se při dalším běhu
  }
  const zdroj = new Set(cisla(`${p.nadpis} ${p.text}`));
  const ok = (t) => !cisla(t).some((c) => !zdroj.has(c));
  const veta = (t, n) => String(t || "").replace(/\s+/g, " ").trim().slice(0, n);
  const shrnuti = veta(data?.shrnuti, 300), komu = veta(data?.komu, 160);
  const skupiny = Object.fromEntries(SKUPINY.map((k) => [k, (Array.isArray(data?.[k]) ? data[k] : []).map((z) => veta(z, 180)).filter((z) => z.length >= 8 && ok(z)).slice(0, 5)]));
  const bodu = SKUPINY.reduce((a, k) => a + skupiny[k].length, 0);
  if (shrnuti.length < 20 || !ok(shrnuti) || bodu < 1) {
    await db.prepare("UPDATE patche SET stav = 'chyba' WHERE gid = ?").bind(p.gid).run();
    return { neproslo: true, hra: p.hra };
  }
  const typ = TYPY.includes(data?.typ) ? data.typ : p.typ || "aktualizace";
  await db.prepare("UPDATE patche SET stav = 'hotovo', typ = ?, shrnuti = ?, model = ?, text = NULL WHERE gid = ?")
    .bind(typ, JSON.stringify({ shrnuti, komu: komu && ok(komu) ? komu : "", ...skupiny }), model, p.gid).run();
  return { hra: p.hra, nadpis: p.nadpis };
}

export async function shrnPatch(env, kolik = 2) {
  const db = env.DB;
  await zajistiSchemaPatchu(db);
  // Jednorázově: aktualizace, u kterých 26. 11. selhala AI (zakázaný model), vrátit do fronty.
  const oprava = await db.prepare("SELECT hodnota FROM nastaveni WHERE klic = 'patche_oprava_ai'").first().catch(() => null);
  if (!oprava) await db.batch([
    db.prepare("UPDATE patche SET stav = 'novy' WHERE stav = 'chyba' AND text IS NOT NULL AND shrnuti IS NULL"),
    db.prepare("INSERT OR REPLACE INTO nastaveni (klic, hodnota, plati_do) VALUES ('patche_oprava_ai', '1', 0)"),
  ]);
  const { results } = await db.prepare("SELECT * FROM patche WHERE stav = 'novy' AND datum > ? ORDER BY COALESCE(poradi, 9999) ASC, datum DESC LIMIT ?")
    .bind(Date.now() - 14 * DEN, kolik).all();
  if (!results.length) return { stav: "nic nového" };
  const hotove = [], neprosle = [];
  for (const p of results) {
    const v = await shrnJeden(env, db, p);
    (v.neproslo ? neprosle : hotove).push(v);
  }
  return { hotove, neprosle };
}

// ---------- API ----------
// /api/aktualizace – nejnovější aktualizace (i ty, které na shrnutí teprve čekají).
export async function apiAktualizace(env) {
  const db = env.DB;
  await zajistiSchemaPatchu(db);
  const [p, s] = await db.batch([
    db.prepare(`SELECT p.gid, p.appid, p.hra, p.nadpis, p.url, p.datum, p.stav, p.shrnuti, p.typ, p.poradi, l.zdroj, g.obrazek AS obr FROM patche p
      LEFT JOIN sledovane l ON l.appid = p.appid LEFT JOIN steam_hry g ON g.id = p.appid ORDER BY p.datum DESC LIMIT 150`),
    db.prepare("SELECT COUNT(*) AS n, MIN(kontrola) AS nejstarsi FROM sledovane"),
  ]);
  return {
    sledovanych: s.results[0]?.n || 0,
    polozky: p.results.map((r) => {
      let x = {};
      try { x = JSON.parse(r.shrnuti || "{}"); } catch { /* nic */ }
      return {
        id: r.gid, steam_id: r.appid, hra: r.hra, nadpis: r.nadpis, url: r.url, datum: new Date(r.datum).toISOString(),
        typ: r.typ || typPodleNadpisu(r.nadpis), poradi: r.poradi || null, cesko: /cesko/.test(r.zdroj || ""),
        // Novější hry mají obrázek na adrese s jedinečným kódem → bereme oficiální header_image ze Steamu (steam_hry),
        // odhad staré adresy jen jako záloha (web při chybě ukáže náhradní dlaždici s názvem).
        obrazek: https(r.obr) || `https://cdn.cloudflare.steamstatic.com/steam/apps/${encodeURIComponent(r.appid)}/header.jpg`,
        stav: r.stav === "hotovo" ? "hotovo" : r.stav === "novy" ? "ceka" : "bez",
        shrnuti: x.shrnuti || "", komu: x.komu || "",
        skupiny: Object.fromEntries(SKUPINY.map((k) => [k, x[k] || (k === "novinky" && x.zmeny) || []])),
      };
    }),
  };
}
