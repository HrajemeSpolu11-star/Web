// Databáze her: profil KAŽDÉ hry z IGDB (přes 300 tisíc her – i konzolové exkluzivity a staré klasiky).
//  • /api/databaze?q=…        hledání (mezipaměť Cloudflare 1 h)
//  • /api/databaze            populární hry (katalog „igdb_popularni“, obnova 1× denně v Cronu psaní)
//  • /api/databaze/:slug      profil hry (D1 „igdb_detail“, 7 dní) + naše data (cena, čeština, streamy) + český popis
// Popis v IGDB je anglicky → český překlad dělá AI (vždy označený, originál k dispozici). Překládá se na pozadí,
// max. PREKLADU_DENNE za den (šetří limit Workers AI); každé číslo v překladu musí být i v originálu.
// Nic se nedomýšlí: co IGDB nemá, na stránce není.
import { token } from "./twitch.js";
import { igdb, uvoz, PERSPEKTIVY, REZIMY, TEMATA, serieZKolekce } from "./igdb-hra.js";
import { zeptejSe } from "./ai.js";
import { zajistiSchemaHlidac } from "./hlidac.js";
import { normNazev } from "./hra-data.js";
import { denPraha } from "./psani.js";

const PLATNOST = 7 * 86400e3;
const PREKLADU_DENNE = 250;
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS igdb_detail (slug TEXT PRIMARY KEY, data TEXT NOT NULL, cas INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS igdb_preklad (slug TEXT PRIMARY KEY, popis TEXT, pribeh TEXT, model TEXT, cas INTEGER NOT NULL)`,
];
let hotovo = false;
async function schema(db) { if (hotovo) return; await db.batch(SCHEMA.map((s) => db.prepare(s))); hotovo = true; }
const https = (u) => (/^https:\/\//.test(String(u || "")) ? String(u) : "");
const obr = (id, vel) => (id ? `https://images.igdb.com/igdb/image/upload/${vel}/${encodeURIComponent(id)}.jpg` : "");
const okSlug = (s) => /^[a-z0-9][a-z0-9-]{0,99}$/.test(String(s || ""));
const HLAVNI_TYP = "(0,4,8,9,10,11)"; // hlavní hra, samostatné rozšíření, remake, remaster, rozšířená verze, port

export const ZANRY_IGDB = { "Shooter": "Střílečka", "Role-playing (RPG)": "RPG", "Adventure": "Adventura", "Strategy": "Strategie", "Simulator": "Simulace",
  "Sport": "Sport", "Racing": "Závody", "Puzzle": "Logická", "Platform": "Plošinovka", "Fighting": "Bojovka", "Indie": "Nezávislá (indie)", "Arcade": "Arkáda",
  "Real Time Strategy (RTS)": "Strategie v reálném čase", "Turn-based strategy (TBS)": "Tahová strategie", "Tactical": "Taktická", "Hack and slash/Beat 'em up": "Mlátička",
  "Quiz/Trivia": "Kvíz", "Music": "Hudební", "Point-and-click": "Point-and-click", "Visual Novel": "Vizuální román", "Card & Board Game": "Karetní a desková",
  "MOBA": "MOBA", "Pinball": "Pinball" };
const preloz = (mapa, list) => [...new Set((list || []).map((x) => mapa[x?.name] || null).filter(Boolean))];

// Obchody a oficiální stránky podle adresy (u IGDB se číselné kategorie odkazů mění – adresa je spolehlivější).
const OBCHODY = [[/store\.steampowered\.com\/app\/(\d+)/i, "Steam"], [/gog\.com/i, "GOG"], [/(store\.)?epicgames\.com/i, "Epic Games Store"],
  [/store\.playstation\.com|playstation\.com\/.*games/i, "PlayStation Store"], [/xbox\.com|microsoft\.com\/.*store/i, "Microsoft Store / Xbox"],
  [/nintendo\.(com|co\.uk|de|cz)/i, "Nintendo eShop"], [/itch\.io/i, "itch.io"], [/apps\.apple\.com/i, "App Store"], [/play\.google\.com/i, "Google Play"]];
const NE_OFICIALNI = /wikipedia|fandom|wikia|twitter\.com|x\.com|facebook|instagram|youtube|twitch\.tv|reddit|discord|tiktok|steamcommunity|igdb|vk\.com|weibo|bilibili/i;

function odkazy(websites) {
  const obchody = [], vid = new Set();
  let oficialni = "", steamId = "";
  for (const w of websites || []) {
    const u = https(w?.url);
    if (!u) continue;
    const o = OBCHODY.find(([re]) => re.test(u));
    if (o) {
      if (o[1] === "Steam" && !steamId) steamId = (o[0].exec(u) || [])[1] || "";
      if (!vid.has(o[1])) { vid.add(o[1]); obchody.push({ nazev: o[1], url: u }); }
    } else if (!oficialni && !NE_OFICIALNI.test(u)) oficialni = u;
  }
  return { obchody, oficialni, steamId };
}

// PEGI/ESRB: nové schéma IGDB (rating_category.rating) i staré (category + rating jako čísla).
const PEGI_STARE = { 1: "PEGI 3", 2: "PEGI 7", 3: "PEGI 12", 4: "PEGI 16", 5: "PEGI 18" };
const SLOVA = { three: 3, seven: 7, twelve: 12, sixteen: 16, eighteen: 18 };
function vekove(ar) {
  for (const a of ar || []) {
    if (a?.category === 2 && PEGI_STARE[a.rating]) return PEGI_STARE[a.rating];
    const t = String(a?.rating_category?.rating || ""), org = String(a?.organization?.name || "");
    if (!/pegi/i.test(org) && !/pegi/i.test(t)) continue;
    const n = (/\d+/.exec(t) || [])[0] || SLOVA[t.toLowerCase().replace(/^pegi\s*/, "")];
    if ([3, 7, 12, 16, 18].includes(Number(n))) return `PEGI ${Number(n)}`;
  }
  return null;
}

function cestinaIgdb(ls) {
  const typy = new Set();
  for (const l of ls || []) if (/czech|čeština/i.test(l?.language?.name || "")) typy.add(String(l?.language_support_type?.name || "").toLowerCase());
  if (!typy.size) return null;
  return { texty: typy.has("interface") || typy.has("subtitles"), titulky: typy.has("subtitles"), dabing: typy.has("audio") };
}

const POLE = [
  `fields name,slug,summary,storyline,first_release_date,game_type,cover.image_id,screenshots.image_id,artworks.image_id,videos.video_id,videos.name,
   websites.url,platforms.name,platforms.abbreviation,genres.name,themes.name,game_modes.name,player_perspectives.name,
   involved_companies.company.name,involved_companies.developer,involved_companies.publisher,release_dates.date,release_dates.human,release_dates.platform.name,
   age_ratings.rating_category.rating,age_ratings.organization.name,aggregated_rating,aggregated_rating_count,rating,rating_count,
   similar_games.name,similar_games.slug,similar_games.cover.image_id,similar_games.first_release_date,
   collections.name,collections.games.name,collections.games.slug,collections.games.first_release_date,collections.games.game_type,
   dlcs.name,dlcs.first_release_date,expansions.name,expansions.first_release_date,franchises.name,
   language_supports.language.name,language_supports.language_support_type.name,parent_game.name,parent_game.slug`,
  // záloha pro starší schéma IGDB (category místo game_type, age_ratings jako čísla)
  `fields name,slug,summary,storyline,first_release_date,category,cover.image_id,screenshots.image_id,artworks.image_id,videos.video_id,videos.name,
   websites.url,platforms.name,platforms.abbreviation,genres.name,themes.name,game_modes.name,player_perspectives.name,
   involved_companies.company.name,involved_companies.developer,involved_companies.publisher,release_dates.date,release_dates.human,release_dates.platform.name,
   age_ratings.category,age_ratings.rating,aggregated_rating,aggregated_rating_count,rating,rating_count,
   similar_games.name,similar_games.slug,similar_games.cover.image_id,similar_games.first_release_date,
   collections.name,collections.games.name,collections.games.slug,collections.games.first_release_date,collections.games.category,
   dlcs.name,dlcs.first_release_date,expansions.name,expansions.first_release_date,franchises.name,parent_game.name,parent_game.slug`,
  // minimální varianta
  `fields name,slug,summary,storyline,first_release_date,cover.image_id,screenshots.image_id,websites.url,platforms.name,genres.name,themes.name,
   game_modes.name,player_perspectives.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,
   aggregated_rating,aggregated_rating_count,rating,rating_count,similar_games.name,similar_games.slug,similar_games.cover.image_id`,
].map((p) => p.replace(/\s+/g, " ").replace(/\s*,\s*/g, ","));

const rok = (s) => (Number.isFinite(s) ? new Date(s * 1000).getUTCFullYear() : null);
const HLAVNI = new Set([0, 4, 8, 9, 10, 11]);

function zpracuj(g) {
  const firmy = g.involved_companies || [];
  const jmena = (f) => [...new Set(firmy.filter(f).map((x) => x?.company?.name).filter(Boolean))].slice(0, 4);
  const { obchody, oficialni, steamId } = odkazy(g.websites);
  // Datum vydání po platformách (nejdřívější pro každou platformu).
  const podle = new Map();
  for (const r of g.release_dates || []) {
    const p = r?.platform?.name;
    if (!p || !Number.isFinite(r.date)) continue;
    if (!podle.has(p) || r.date < podle.get(p).datum) podle.set(p, { platforma: p, datum: r.date, text: String(r.human || "") });
  }
  const kol = (g.collections || [])[0];
  return {
    v: 2, slug: g.slug, nazev: String(g.name || "").slice(0, 200), url: g.slug ? `https://www.igdb.com/games/${encodeURIComponent(g.slug)}` : "",
    popis_en: String(g.summary || "").slice(0, 4000), pribeh_en: String(g.storyline || "").slice(0, 6000),
    vydano: Number.isFinite(g.first_release_date) ? g.first_release_date * 1000 : null,
    obal: obr(g.cover?.image_id, "t_cover_big"), pozadi: obr((g.artworks || [])[0]?.image_id || (g.screenshots || [])[0]?.image_id, "t_1080p"),
    obrazky: [...(g.screenshots || []), ...(g.artworks || [])].slice(0, 20).map((s) => ({ male: obr(s.image_id, "t_screenshot_med"), velke: obr(s.image_id, "t_1080p") })).filter((x) => x.male),
    videa: (g.videos || []).filter((v) => /^[\w-]{6,20}$/.test(v?.video_id || "")).slice(0, 6).map((v) => ({ id: v.video_id, nazev: String(v.name || "").slice(0, 100) })),
    platformy: (g.platforms || []).map((p) => p.name).filter(Boolean).slice(0, 20),
    vydani: [...podle.values()].sort((a, b) => a.datum - b.datum).map((x) => ({ ...x, datum: x.datum * 1000 })).slice(0, 20),
    zanry: preloz(ZANRY_IGDB, g.genres), temata: preloz(TEMATA, g.themes), rezimy: preloz(REZIMY, g.game_modes), pohled: preloz(PERSPEKTIVY, g.player_perspectives),
    vyvojari: jmena((x) => x.developer), vydavatele: jmena((x) => x.publisher),
    pegi: vekove(g.age_ratings), cestina: cestinaIgdb(g.language_supports),
    kritici: g.aggregated_rating_count ? { skore: Math.round(g.aggregated_rating), pocet: g.aggregated_rating_count } : null,
    hraci: g.rating_count ? { skore: Math.round(g.rating), pocet: g.rating_count } : null,
    obchody, oficialni, steam_id: steamId,
    podobne: (g.similar_games || []).filter((x) => x?.slug).slice(0, 12).map((x) => ({ nazev: x.name, slug: x.slug, obal: obr(x.cover?.image_id, "t_cover_big"), rok: rok(x.first_release_date) })),
    serie: serieZKolekce(kol, (x) => x.slug === g.slug),
    dlc: [...(g.expansions || []).map((x) => ({ ...x, druh: "rozsireni" })), ...(g.dlcs || []).map((x) => ({ ...x, druh: "dlc" }))].filter((x) => x?.name)
      .map((x) => ({ nazev: x.name, rok: rok(x.first_release_date), druh: x.druh })).sort((a, b) => (b.rok || 0) - (a.rok || 0)).slice(0, 20),
    serie_jmeno: (g.franchises || [])[0]?.name || kol?.name || "",
    rodic: g.parent_game?.slug ? { nazev: g.parent_game.name, slug: g.parent_game.slug } : null,
  };
}

async function stahni(env, slug) {
  const stav = { tok: await token(env), obnoveno: false };
  const [g] = await igdb(env, stav, "games", POLE.map((p) => `${p}; where slug = "${uvoz(slug)}"; limit 1;`));
  if (!g) return { nenalezeno: true };
  const d = zpracuj(g);
  try {
    const [t] = await igdb(env, stav, "game_time_to_beats", [`fields hastily,normally,completely,count; where game_id = ${Number(g.id)};`]);
    if (t && (t.count || 0) >= 3) d.delka = { bezne: t.normally || null, vse: t.completely || null, hlasu: t.count };
  } catch { /* nepovinné */ }
  return d;
}

// Český překlad popisu (AI). Vrací null, když dnes už byl vyčerpán limit nebo AI selhala.
const SYSTEM_PREKLAD = `Jsi překladatel herního webu. Přelož anglický popis hry do přirozené češtiny.
Pravidla: překládej věrně, nic nepřidávej, nic nevynechávej, nehodnoť. Názvy her, postav, míst, firem a herních pojmů ponech v originále.
Odpověz jen JSON: {"popis":"…","pribeh":"…"} (prázdný řetězec, když text chybí).`;
export async function prelozHru(env, slug, d) {
  const db = env.DB;
  if (!d?.popis_en && !d?.pribeh_en) return null;
  const klic = `preklad_${denPraha()}`;
  const r = await db.prepare(`INSERT INTO nastaveni (klic, hodnota, plati_do) VALUES (?, '1', ?)
    ON CONFLICT(klic) DO UPDATE SET hodnota = CAST(nastaveni.hodnota AS INTEGER) + 1 WHERE CAST(nastaveni.hodnota AS INTEGER) < ?`)
    .bind(klic, Date.now() + 2 * 86400e3, PREKLADU_DENNE).run();
  if (!r.meta?.changes) return null;
  const { data, model } = await zeptejSe(env, [
    { role: "system", content: SYSTEM_PREKLAD },
    { role: "user", content: `POPIS:\n${d.popis_en || ""}\n\nPŘÍBĚH:\n${(d.pribeh_en || "").slice(0, 3000)}` },
  ], { bezSlabych: true });
  const popis = String(data?.popis || "").trim().slice(0, 5000), pribeh = String(data?.pribeh || "").trim().slice(0, 7000);
  // Pojistky: překlad nesmí být prázdný, nesmí obsahovat čísla, která v originálu nejsou, a nesmí být výrazně delší.
  const cisla = new Set(`${d.popis_en} ${d.pribeh_en}`.match(/\d+/g) || []);
  const cizi = `${popis} ${pribeh}`.match(/\d+/g)?.filter((c) => !cisla.has(c)) || [];
  if ((d.popis_en && !popis) || cizi.length || popis.length > (d.popis_en || "").length * 1.8 + 200) return null;
  await db.prepare("INSERT OR REPLACE INTO igdb_preklad (slug, popis, pribeh, model, cas) VALUES (?, ?, ?, ?, ?)").bind(slug, popis, pribeh, model, Date.now()).run();
  return { popis, pribeh, model };
}

export async function apiHraDatabaze(env, ctx, slug) {
  if (!okSlug(slug)) return { chyba: "Neplatná hra", status: 400 };
  const db = env.DB;
  await schema(db);
  const r = await db.prepare("SELECT data, cas FROM igdb_detail WHERE slug = ?").bind(slug).first();
  let d = r ? (() => { try { return JSON.parse(r.data); } catch { return null; } })() : null;
  const obnov = async () => {
    const n = await stahni(env, slug);
    if (!n.nenalezeno || !d) await db.prepare("INSERT OR REPLACE INTO igdb_detail (slug, data, cas) VALUES (?, ?, ?)").bind(slug, JSON.stringify(n), Date.now()).run();
    return n;
  };
  // Záznamy starší verze (série jen z prvních 30 dílů) se obnoví hned.
  if (d && !d.nenalezeno && d.v !== 2) { try { d = await obnov(); } catch { /* zůstane starý */ } }
  if (!d) { try { d = await obnov(); } catch (e) { console.error("databaze:", e); return { chyba: "Databáze her je teď nedostupná, zkus to za chvíli.", status: 503 }; } }
  else if (Date.now() - r.cas > PLATNOST) ctx.waitUntil(obnov().catch(() => {}));
  if (d.nenalezeno) return { chyba: "Hru jsme v databázi nenašli.", status: 404 };
  // Naše data: cena a čeština ze Steamu, česká scéna, aktualizace.
  await zajistiSchemaHlidac(db);
  const [pr, st, hra] = await db.batch([
    db.prepare("SELECT popis, pribeh, cas FROM igdb_preklad WHERE slug = ?").bind(slug),
    db.prepare("SELECT id, cena, puvodni, sleva, mena, zdarma, cestina, kladne, recenzi FROM steam_hry WHERE id = ?").bind(d.steam_id || "-"),
    db.prepare("SELECT slug FROM hry WHERE nazev = ? COLLATE NOCASE LIMIT 1").bind(d.nazev),
  ]);
  const preklad = pr.results[0] || null;
  if (!preklad && (d.popis_en || d.pribeh_en)) ctx.waitUntil(prelozHru(env, slug, d).catch((e) => console.warn("preklad:", e.message)));
  const s = st.results[0];
  return {
    ...d, preklad: preklad ? { popis: preklad.popis, pribeh: preklad.pribeh } : null,
    steam: s ? { id: s.id, cena: s.cena, puvodni: s.puvodni, sleva: s.sleva || 0, mena: s.mena || "CZK", zdarma: !!s.zdarma, cestina: s.cestina,
      hodnoceni: s.recenzi >= 20 && s.kladne != null ? { kladne: s.kladne, recenzi: s.recenzi } : null } : null,
    cesko_slug: hra.results[0]?.slug || null,
    cas: new Date(r?.cas || Date.now()).toISOString(),
  };
}

// Hledání v celé databázi IGDB (mezipaměť Cloudflare 1 h – nastavuje volající).
export async function apiHledatDatabaze(env, q) {
  q = String(q || "").trim().slice(0, 60);
  if (q.length < 2) return { hry: [] };
  const stav = { tok: await token(env), obnoveno: false };
  const d = await igdb(env, stav, "games", [
    `search "${uvoz(q)}"; fields name,slug,first_release_date,cover.image_id,platforms.abbreviation,game_type,total_rating_count; where game_type = ${HLAVNI_TYP}; limit 24;`,
    `search "${uvoz(q)}"; fields name,slug,first_release_date,cover.image_id,platforms.abbreviation,category,total_rating_count; where category = ${HLAVNI_TYP}; limit 24;`,
    `search "${uvoz(q)}"; fields name,slug,first_release_date,cover.image_id,platforms.abbreviation; limit 24;`,
  ]);
  const cil = normNazev(q);
  return { hry: (d || []).filter((g) => g?.slug).map((g) => ({ nazev: g.name, slug: g.slug, rok: rok(g.first_release_date), obal: obr(g.cover?.image_id, "t_cover_big"),
    platformy: (g.platforms || []).map((p) => p.abbreviation).filter(Boolean).slice(0, 6), _p: (normNazev(g.name) === cil ? 1e9 : 0) + (g.total_rating_count || 0) }))
    .sort((a, b) => b._p - a._p).map(({ _p, ...x }) => x) };
}

// Populární hry pro úvod databáze a sitemap (1× denně, ~5 dotazů na IGDB). Typ popularity: návštěvy IGDB.
export async function sestavPopularni(env) {
  const db = env.DB;
  const r = await db.prepare("SELECT cas FROM katalog WHERE klic = 'igdb_popularni'").first().catch(() => null);
  if (r && Date.now() - r.cas < 20 * 3600e3) return null;
  const stav = { tok: await token(env), obnoveno: false };
  const typy = await igdb(env, stav, "popularity_types", ["fields id,name; limit 50;"]);
  const typ = typy.find((t) => /visits/i.test(t.name || "")) || typy.find((t) => /want to play/i.test(t.name || "")) || typy[0];
  if (!typ) return null;
  const prim = await igdb(env, stav, "popularity_primitives", [`fields game_id,value; where popularity_type = ${Number(typ.id)}; sort value desc; limit 500;`]);
  const ids = prim.map((p) => p.game_id).filter(Number.isInteger);
  const hry = [];
  for (let i = 0; i < ids.length && i < 500; i += 250) {
    const d = await igdb(env, stav, "games", [
      `fields name,slug,first_release_date,cover.image_id,game_type; where id = (${ids.slice(i, i + 250).join(",")}) & game_type = ${HLAVNI_TYP}; limit 250;`,
      `fields name,slug,first_release_date,cover.image_id; where id = (${ids.slice(i, i + 250).join(",")}); limit 250;`,
    ]);
    hry.push(...d);
  }
  const poradi = new Map(ids.map((id, i) => [id, i]));
  const seznam = hry.filter((g) => g?.slug).sort((a, b) => (poradi.get(a.id) ?? 1e9) - (poradi.get(b.id) ?? 1e9))
    .map((g) => ({ nazev: g.name, slug: g.slug, rok: rok(g.first_release_date), obal: obr(g.cover?.image_id, "t_cover_big") }));
  if (!seznam.length) return null;
  await db.prepare("INSERT OR REPLACE INTO katalog (klic, data, cas) VALUES ('igdb_popularni', ?, ?)").bind(JSON.stringify(seznam), Date.now()).run();
  return { her: seznam.length, typ: typ.name };
}

export async function apiPopularniDatabaze(env) {
  const r = await env.DB.prepare("SELECT data, cas FROM katalog WHERE klic = 'igdb_popularni'").first().catch(() => null);
  let hry = [];
  try { hry = r ? JSON.parse(r.data) : []; } catch { /* nic */ }
  return { hry: hry.slice(0, 60), cas: r ? new Date(r.cas).toISOString() : null };
}

// Cron: přeložit předem pár populárních her (ať je čeština hned), nejvýš `kolik` za běh.
export async function prelozPopularni(env, kolik = 3) {
  const db = env.DB;
  await schema(db);
  const p = await apiPopularniDatabaze(env);
  let hotovo = 0;
  for (const h of p.hry.slice(0, 60)) {
    if (hotovo >= kolik) break;
    const ma = await db.prepare("SELECT 1 AS a FROM igdb_preklad WHERE slug = ?").bind(h.slug).first();
    if (ma) continue;
    let d = null;
    const r = await db.prepare("SELECT data FROM igdb_detail WHERE slug = ?").bind(h.slug).first();
    try { d = r ? JSON.parse(r.data) : null; } catch { /* nic */ }
    if (!d) { d = await stahni(env, h.slug); if (!d.nenalezeno) await db.prepare("INSERT OR REPLACE INTO igdb_detail (slug, data, cas) VALUES (?, ?, ?)").bind(h.slug, JSON.stringify(d), Date.now()).run(); }
    if (d.nenalezeno) continue;
    if (await prelozHru(env, h.slug, d)) hotovo++;
    else break; // limit dne nebo chyba AI – zkusíme příště
  }
  return { prelozeno: hotovo };
}
