// Údaje o hře z IGDB (databáze her, kterou provozuje Twitch; data doplňuje komunita a vydavatelé):
//  • série a díly, DLC a rozšíření,
//  • „lehká herní DNA“: pohled hráče, herní režimy, kooperace a počty hráčů, témata, délka hraní (time to beat).
// Nic se nedomýšlí – co IGDB nemá, na webu není. Párování: Steam ID přes external_games (jednoznačné),
// bez Steamu přesný název hry. Mezipaměť v D1 7 dní (i „nenalezeno“, ať se IGDB neptáme pořád dokola).
import { token } from "./twitch.js";
import { normNazev } from "./hra-data.js";

const PLATNOST = 7 * 86400e3;
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS igdb_hry (klic TEXT PRIMARY KEY, data TEXT NOT NULL, cas INTEGER NOT NULL)`,
  // Jen počty hráčů pro „Co hrát s přáteli“ (hodně her najednou, malé řádky).
  `CREATE TABLE IF NOT EXISTS igdb_hraci (appid TEXT PRIMARY KEY, data TEXT, cas INTEGER NOT NULL)`,
];
let hotovo = false;
async function schema(db) { if (hotovo) return; await db.batch(SCHEMA.map((s) => db.prepare(s))); hotovo = true; }

async function dotaz(env, tok, cesta, telo) {
  const r = await fetch(`https://api.igdb.com/v4/${cesta}`, {
    method: "POST", body: telo, signal: AbortSignal.timeout(8000),
    headers: { "Client-ID": env.TWITCH_CLIENT_ID, Authorization: `Bearer ${tok}`, Accept: "application/json" },
  });
  if (!r.ok) { const e = new Error(`IGDB ${cesta} HTTP ${r.status}`); e.kod = r.status; throw e; }
  return r.json();
}
// Dotaz s obnovou tokenu (401) a záložními variantami pole (400 = IGDB pole přejmenovalo, např. category → game_type).
async function igdb(env, stav, cesta, varianty) {
  for (let i = 0; i < varianty.length; i++) {
    try { return await dotaz(env, stav.tok, cesta, varianty[i]); }
    catch (e) {
      if (e.kod === 401 && !stav.obnoveno) { stav.tok = await token(env, true); stav.obnoveno = true; i--; continue; }
      if (e.kod !== 400 || i === varianty.length - 1) throw e;
    }
  }
  return [];
}
const uvoz = (s) => String(s || "").replace(/["\\]/g, "").slice(0, 120);

// Steam ID → ID hry v IGDB (stejně jako sledované hry: external_game_source = 1, dříve category = 1).
async function idPodleSteamu(env, stav, appids) {
  const seznam = appids.map((a) => `"${String(a).replace(/\D/g, "")}"`).join(",");
  const d = await igdb(env, stav, "external_games", [
    `fields game,uid; where uid = (${seznam}) & external_game_source = 1; limit 500;`,
    `fields game,uid; where uid = (${seznam}) & category = 1; limit 500;`,
  ]);
  const m = new Map();
  for (const x of d || []) if (x?.uid && Number.isInteger(x.game) && !m.has(String(x.uid))) m.set(String(x.uid), x.game);
  return m;
}

const PERSPEKTIVY = { "First person": "Z pohledu první osoby", "Third person": "Z pohledu třetí osoby", "Bird view / Isometric": "Shora / izometricky",
  "Side view": "Z boku", "Text": "Textová", "Auditory": "Zvuková", "Virtual Reality": "Virtuální realita (VR)" };
const REZIMY = { "Single player": "Pro jednoho hráče", "Multiplayer": "Pro více hráčů", "Co-operative": "Kooperace", "Split screen": "Na jedné obrazovce",
  "Massively Multiplayer Online (MMO)": "MMO", "Battle Royale": "Battle royale" };
const TEMATA = { "Action": "Akce", "Fantasy": "Fantasy", "Science fiction": "Sci-fi", "Horror": "Horor", "Thriller": "Thriller", "Survival": "Přežití",
  "Historical": "Historie", "Stealth": "Plížení", "Comedy": "Humor", "Business": "Byznys", "Drama": "Drama", "Non-fiction": "Podle skutečnosti",
  "Sandbox": "Sandbox", "Educational": "Vzdělávací", "Kids": "Pro děti", "Open world": "Otevřený svět", "Warfare": "Válka", "Party": "Párty",
  "4X (explore, expand, exploit, and exterminate)": "4X strategie", "Mystery": "Záhada", "Romance": "Romantika" };
const preloz = (mapa, list) => [...new Set((list || []).map((x) => mapa[x?.name]).filter(Boolean))];
const rok = (s) => (Number.isFinite(s) ? new Date(s * 1000).getUTCFullYear() : null);
const HLAVNI = new Set([0, 4, 8, 9, 10]); // hlavní hra, samostatné rozšíření, remake, remaster, rozšířená verze

// Počty hráčů z multiplayer_modes (IGDB má záznam pro každou platformu → bereme maximum).
function hraciZModu(mm) {
  const m = Array.isArray(mm) ? mm.filter((x) => x && typeof x === "object") : [];
  if (!m.length) return null;
  const max = (k) => Math.max(0, ...m.map((x) => Number(x[k]) || 0)) || null;
  const ano = (k) => m.some((x) => x[k] === true);
  return { online_koop: ano("onlinecoop"), offline_koop: ano("offlinecoop"), lan: ano("lancoop"), splitscreen: ano("splitscreen") || ano("splitscreenonline"),
    online_koop_max: max("onlinecoopmax"), offline_koop_max: max("offlinecoopmax"), online_max: max("onlinemax"), offline_max: max("offlinemax") };
}

const POLE_HRY = `fields name,slug,first_release_date,game_modes.name,player_perspectives.name,themes.name,
  multiplayer_modes.onlinecoop,multiplayer_modes.offlinecoop,multiplayer_modes.lancoop,multiplayer_modes.splitscreen,multiplayer_modes.splitscreenonline,
  multiplayer_modes.onlinecoopmax,multiplayer_modes.offlinecoopmax,multiplayer_modes.onlinemax,multiplayer_modes.offlinemax,
  dlcs.name,dlcs.first_release_date,expansions.name,expansions.first_release_date,
  collections.name,collections.games.name,collections.games.first_release_date,collections.games.TYP,franchises.name`;

async function stahniPas(env, stav, { appid, nazev }) {
  let id = null;
  if (appid) id = (await idPodleSteamu(env, stav, [appid])).get(String(appid)) || null;
  if (!id && nazev) {
    const d = await igdb(env, stav, "games", [
      `fields id,name; where name ~ "${uvoz(nazev)}" & game_type = (0,8,9,10); limit 5;`,
      `fields id,name; where name ~ "${uvoz(nazev)}" & category = (0,8,9,10); limit 5;`,
    ]);
    const cil = normNazev(nazev);
    id = (d || []).find((g) => normNazev(g.name) === cil)?.id || null;
  }
  if (!id) return { nenalezeno: true };
  const zaklad = POLE_HRY.replace(/\s+/g, "");
  const [g] = await igdb(env, stav, "games", [
    `${zaklad.replace("TYP", "game_type")}; where id = ${id};`,
    `${zaklad.replace("TYP", "category")}; where id = ${id};`,
    `fields name,slug,first_release_date,game_modes.name,player_perspectives.name,themes.name,dlcs.name,expansions.name,collections.name; where id = ${id};`,
  ]);
  if (!g) return { nenalezeno: true };
  let ttb = null;
  try {
    const [t] = await igdb(env, stav, "game_time_to_beats", [`fields hastily,normally,completely,count; where game_id = ${id};`]);
    if (t && (t.count || 0) >= 3) ttb = { rychle: t.hastily || null, bezne: t.normally || null, vse: t.completely || null, hlasu: t.count };
  } catch { /* nepovinné */ }
  const kolekce = (g.collections || [])[0];
  const serie = kolekce?.games?.length > 1 ? {
    nazev: String(kolekce.name || "").slice(0, 100),
    hry: kolekce.games.filter((x) => x?.name && (x.game_type == null && x.category == null ? true : HLAVNI.has(x.game_type ?? x.category)))
      .map((x) => ({ nazev: String(x.name).slice(0, 100), rok: rok(x.first_release_date), tato: x.id === id }))
      .sort((a, b) => (a.rok || 9999) - (b.rok || 9999)).slice(0, 24),
  } : null;
  const dlc = [...(g.expansions || []).map((x) => ({ ...x, druh: "rozsireni" })), ...(g.dlcs || []).map((x) => ({ ...x, druh: "dlc" }))]
    .filter((x) => x?.name).map((x) => ({ nazev: String(x.name).slice(0, 100), rok: rok(x.first_release_date), druh: x.druh }))
    .sort((a, b) => (b.rok || 0) - (a.rok || 0)).slice(0, 16);
  return {
    igdb_id: id, url: g.slug ? `https://www.igdb.com/games/${encodeURIComponent(g.slug)}` : "",
    serie, dlc, dlc_celkem: (g.expansions || []).length + (g.dlcs || []).length,
    dna: {
      pohled: preloz(PERSPEKTIVY, g.player_perspectives), rezimy: preloz(REZIMY, g.game_modes), temata: preloz(TEMATA, g.themes),
      hraci: hraciZModu(g.multiplayer_modes), delka: ttb,
    },
  };
}

// Data pro Herní pas jedné hry. Při chybě IGDB vrátí starší data z mezipaměti, nebo null.
export async function pasZIgdb(env, ctx, { appid, nazev }) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return null;
  const db = env.DB;
  await schema(db);
  const klic = appid ? `s:${String(appid).replace(/\D/g, "")}` : `n:${normNazev(nazev).slice(0, 100)}`;
  if (klic.length < 3) return null;
  const r = await db.prepare("SELECT data, cas FROM igdb_hry WHERE klic = ?").bind(klic).first();
  const stary = r ? (() => { try { return JSON.parse(r.data); } catch { return null; } })() : null;
  if (stary && Date.now() - r.cas < PLATNOST) return stary;
  const obnov = async () => {
    const stav = { tok: await token(env), obnoveno: false };
    const d = await stahniPas(env, stav, { appid, nazev });
    await db.prepare("INSERT OR REPLACE INTO igdb_hry (klic, data, cas) VALUES (?, ?, ?)").bind(klic, JSON.stringify(d), Date.now()).run();
    return d;
  };
  if (stary) { ctx?.waitUntil(obnov().catch((e) => console.error("igdb pas:", e))); return stary; }
  // Poprvé: počkat nejvýš 5 s, ať stránka hry nevisí; zbytek doběhne na pozadí a uloží se.
  const p = obnov();
  ctx?.waitUntil(p.catch(() => {}));
  return Promise.race([p, new Promise((res) => setTimeout(() => res(null), 5000))]).catch(() => null);
}

// Počty hráčů pro víc her najednou (Co hrát s přáteli): z mezipaměti, chybějící max. 2 dotazy na IGDB. Platnost 30 dní.
export async function hraciZIgdb(env, appids) {
  const vysledek = new Map();
  if (!appids.length) return vysledek;
  const db = env.DB;
  await schema(db);
  const ids = [...new Set(appids.map(String))].slice(0, 90);
  const { results } = await db.prepare(`SELECT appid, data, cas FROM igdb_hraci WHERE appid IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
  const ted = Date.now();
  for (const r of results) if (ted - r.cas < 30 * 86400e3) { try { vysledek.set(r.appid, JSON.parse(r.data)); } catch { /* nic */ } }
  const chybi = ids.filter((a) => !vysledek.has(a));
  if (!chybi.length || !env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return vysledek;
  try {
    const stav = { tok: await token(env), obnoveno: false };
    const mapa = await idPodleSteamu(env, stav, chybi);
    const herni = [...new Set(mapa.values())];
    const mody = new Map();
    if (herni.length) {
      const d = await igdb(env, stav, "multiplayer_modes", [
        `fields game,onlinecoop,offlinecoop,lancoop,splitscreen,splitscreenonline,onlinecoopmax,offlinecoopmax,onlinemax,offlinemax; where game = (${herni.join(",")}); limit 500;`,
        `fields game,onlinecoop,offlinecoop,lancoop,splitscreen,onlinecoopmax,offlinecoopmax,onlinemax,offlinemax; where game = (${herni.join(",")}); limit 500;`,
      ]);
      for (const m of d || []) { const g = typeof m.game === "object" ? m.game?.id : m.game; if (!mody.has(g)) mody.set(g, []); mody.get(g).push(m); }
    }
    const zapisy = [];
    for (const a of chybi) {
      const g = mapa.get(a);
      const data = g ? hraciZModu(mody.get(g)) : null; // null = IGDB počet hráčů nezná
      vysledek.set(a, data);
      zapisy.push(db.prepare("INSERT OR REPLACE INTO igdb_hraci (appid, data, cas) VALUES (?, ?, ?)").bind(a, JSON.stringify(data), ted));
    }
    if (zapisy.length) await db.batch(zapisy);
  } catch (e) { console.error("igdb hraci:", e); }
  return vysledek;
}
