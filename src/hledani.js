// Chytré hledání v databázi her: filtry (platforma, žánr, režim, téma, roky, hodnocení, čeština, cena)
// a převod české věty („kooperační horor na PS5 s češtinou do 500 Kč“) na filtry – pevnými pravidly, bez AI a bez hádání.
// Seznamy žánrů/režimů/témat/platforem se berou přímo z IGDB (ID i anglické názvy) a drží se 7 dní v katalogu.
// Čeština a cena: jen u her propojených se Steamem (steam_hry.igdb_slug) – u ostatních to nevíme, takže je filtr vyřadí.
import { token } from "./twitch.js";
import { igdb, uvoz, REZIMY, TEMATA } from "./igdb-hra.js";
import { ZANRY_IGDB } from "./databaze.js";
import { zajistiSchemaPropojeni } from "./propojeni.js";

const HLAVNI_TYP = "(0,4,8,9,10,11)";
// Platformy, které nabízíme ve filtru (ID z IGDB; skutečné názvy se načtou z IGDB, takže případná chyba ID by byla vidět).
const PLATFORMY_ID = [6, 167, 48, 169, 49, 130, 508, 14, 3, 34, 39];
const PLATFORMY_CZ = { "PC (Microsoft Windows)": "PC", "PlayStation 5": "PlayStation 5", "PlayStation 4": "PlayStation 4", "Xbox Series X|S": "Xbox Series X|S",
  "Xbox One": "Xbox One", "Nintendo Switch": "Nintendo Switch", "Nintendo Switch 2": "Nintendo Switch 2", "Mac": "Mac", "Linux": "Linux", "Android": "Android", "iOS": "iOS" };
const obr = (id, vel) => (id ? `https://images.igdb.com/igdb/image/upload/${vel}/${encodeURIComponent(id)}.jpg` : "");
const rok = (s) => (Number.isFinite(s) ? new Date(s * 1000).getUTCFullYear() : null);

export async function filtryDatabaze(env) {
  const db = env.DB;
  const r = await db.prepare("SELECT data, cas FROM katalog WHERE klic = 'igdb_filtry'").first().catch(() => null);
  if (r && Date.now() - r.cas < 7 * 86400e3) { try { return JSON.parse(r.data); } catch { /* znovu */ } }
  const stav = { tok: await token(env), obnoveno: false };
  const [z, m, t, p] = await Promise.all([
    igdb(env, stav, "genres", ["fields id,name; limit 100;"]),
    igdb(env, stav, "game_modes", ["fields id,name; limit 50;"]),
    igdb(env, stav, "themes", ["fields id,name; limit 100;"]),
    igdb(env, stav, "platforms", [`fields id,name; where id = (${PLATFORMY_ID.join(",")}); limit 50;`]),
  ]);
  const prevod = (list, mapa, jenZnamy) => (list || []).filter((x) => Number.isInteger(x.id) && x.name && (!jenZnamy || mapa[x.name]))
    .map((x) => ({ id: x.id, nazev: mapa[x.name] || x.name, en: x.name })).sort((a, b) => a.nazev.localeCompare(b.nazev, "cs"));
  const f = {
    zanry: prevod(z, ZANRY_IGDB, false), rezimy: prevod(m, REZIMY, false), temata: prevod(t, TEMATA, true),
    platformy: PLATFORMY_ID.map((id) => (p || []).find((x) => x.id === id)).filter(Boolean).map((x) => ({ id: x.id, nazev: PLATFORMY_CZ[x.name] || x.name, en: x.name })),
  };
  if (f.zanry.length && f.platformy.length) await db.prepare("INSERT OR REPLACE INTO katalog (klic, data, cas) VALUES ('igdb_filtry', ?, ?)").bind(JSON.stringify(f), Date.now()).run();
  return f;
}

// Česká věta → filtry. Každé pravidlo hledá celé slovo nebo frázi; co se nepoužije, zůstane jako hledaný text.
const PRAVIDLA = [
  // [regulární výraz, druh, anglický název v IGDB]
  [/\b(ko-?op\w*|kooperac\w*|kooperativn\w*|ve dvou|s kamarád\w*|s přátel\w*)\b/i, "rezim", "Co-operative"],
  [/\b(multiplayer\w*|pro více hráčů|online hr\w*)\b/i, "rezim", "Multiplayer"],
  [/\b(singleplayer\w*|pro jednoho( hráče)?|sólo)\b/i, "rezim", "Single player"],
  [/\b(split-?screen\w*|na jedné obrazovce|gauč\w*)\b/i, "rezim", "Split screen"],
  [/\b(mmo\w*)\b/i, "rezim", "Massively Multiplayer Online (MMO)"],
  [/\b(battle ?royale)\b/i, "rezim", "Battle Royale"],
  [/\b(horor\w*|horror\w*)\b/i, "tema", "Horror"],
  [/\b(fantasy)\b/i, "tema", "Fantasy"],
  [/\b(sci-?fi|vesmír\w*|science fiction)\b/i, "tema", "Science fiction"],
  [/\b(přežití|survival\w*)\b/i, "tema", "Survival"],
  [/\b(otevřen\w* svět\w*|open[- ]world)\b/i, "tema", "Open world"],
  [/\b(historick\w*|histori\w*)\b/i, "tema", "Historical"],
  [/\b(válečn\w*|válk\w*)\b/i, "tema", "Warfare"],
  [/\b(plížen\w*|stealth)\b/i, "tema", "Stealth"],
  [/\b(sandbox\w*)\b/i, "tema", "Sandbox"],
  [/\b(vtipn\w*|humor\w*|komedi\w*)\b/i, "tema", "Comedy"],
  [/\b(záhad\w*|detektiv\w*)\b/i, "tema", "Mystery"],
  [/\b(střílečk\w*|střílen\w*|shooter\w*|fps)\b/i, "zanr", "Shooter"],
  [/\b(rpg|erpégéčk\w*|hran\w* rol\w*)\b/i, "zanr", "Role-playing (RPG)"],
  [/\b(adventur\w*)\b/i, "zanr", "Adventure"],
  [/\b(tahov\w* strategi\w*)\b/i, "zanr", "Turn-based strategy (TBS)"],
  [/\b(rts|realtime strategi\w*)\b/i, "zanr", "Real Time Strategy (RTS)"],
  [/\b(strategi\w*)\b/i, "zanr", "Strategy"],
  [/\b(simulátor\w*|simulac\w*)\b/i, "zanr", "Simulator"],
  [/\b(závod\w*|závodn\w*|racing)\b/i, "zanr", "Racing"],
  [/\b(sport\w*)\b/i, "zanr", "Sport"],
  [/\b(logick\w*|puzzle)\b/i, "zanr", "Puzzle"],
  [/\b(plošinovk\w*|platform\w*)\b/i, "zanr", "Platform"],
  [/\b(bojovk\w*|fighting)\b/i, "zanr", "Fighting"],
  [/\b(indie|nezávisl\w*)\b/i, "zanr", "Indie"],
  [/\b(mlátičk\w*|hack and slash)\b/i, "zanr", "Hack and slash/Beat 'em up"],
  [/\b(karetn\w*|deskov\w*)\b/i, "zanr", "Card & Board Game"],
  [/\b(moba)\b/i, "zanr", "MOBA"],
  [/\b(ps ?5|playstation ?5)\b/i, "platforma", "PlayStation 5"],
  [/\b(ps ?4|playstation ?4)\b/i, "platforma", "PlayStation 4"],
  [/\b(xbox series( x\|?s| x| s)?|series x)\b/i, "platforma", "Xbox Series X|S"],
  [/\b(xbox one)\b/i, "platforma", "Xbox One"],
  [/\b(switch ?2)\b/i, "platforma", "Nintendo Switch 2"],
  [/\b((nintendo )?switch)\b/i, "platforma", "Nintendo Switch"],
  [/\b(pc|počítač\w*|windows)\b/i, "platforma", "PC (Microsoft Windows)"],
  [/\b(mac\w*)\b/i, "platforma", "Mac"],
  [/\b(linux\w*|steam deck)\b/i, "platforma", "Linux"],
  [/\b(android\w*|mobil\w*)\b/i, "platforma", "Android"],
  [/\b(ios|iphon\w*|ipad\w*)\b/i, "platforma", "iOS"],
];
// \b a \w v JS znají jen anglická písmena – převedeme na hranice slov s diakritikou (příznak u).
const cz = (re, fl = "iu") => new RegExp(`(?<![\\p{L}\\p{N}])(?:${re.source.replace(/\\b/g, "").replace(/\\w/g, "[\\p{L}\\p{N}]")})(?![\\p{L}\\p{N}])`, fl);
for (const p of PRAVIDLA) p[0] = cz(p[0]);
const VYPLNOVA = /\b(hr[auyě]|her|hry|game|games|nějak\w*|chci|hledám|najdi|doporuč\w*|na|pro|s|se|a|v|ve|do|od|kterou?|které|co|něco|dobr\w*|nejlepš\w*|nov\w*|star\w*|levn\w*|zdarma|česk\w*|češtin\w*|kč|korun|roku?|let|po|před)\b/gi;
const VYPLN = cz(VYPLNOVA, "giu");

export function rozeberDotaz(text, filtry) {
  let t = ` ${String(text || "").slice(0, 160)} `;
  const f = {}, pouzito = [];
  const najdi = (druh, en) => {
    const list = { rezim: filtry.rezimy, tema: filtry.temata, zanr: filtry.zanry, platforma: filtry.platformy }[druh] || [];
    return list.find((x) => x.en === en);
  };
  for (const [re, druh, en] of PRAVIDLA) {
    if (f[druh]) continue;
    const m = t.match(re);
    if (!m) continue;
    const pol = najdi(druh, en);
    if (!pol) continue;
    f[druh] = pol.id; pouzito.push(m[0].trim());
    t = t.replace(m[0], " ");
  }
  let m;
  if ((m = t.match(cz(/\b(s češtinou|česky|v češtině|česk\w* titulk\w*|češtin\w*)\b/i)))) { f.cz = 1; pouzito.push(m[0]); t = t.replace(m[0], " "); }
  if ((m = t.match(cz(/\b(český dabing|česk\w* dabing\w*|dabovan\w*)\b/i)))) { f.cz = 2; pouzito.push(m[0]); t = t.replace(m[0], " "); }
  if ((m = t.match(cz(/\bzdarma\b|\bfree\b/i)))) { f.cena = 0; pouzito.push(m[0]); t = t.replace(m[0], " "); }
  else if ((m = t.match(cz(/\b(do|pod|max\.?|maximálně)\s*(\d{2,5})\s*(kč|korun)?/i)))) { f.cena = Number(m[2]); pouzito.push(m[0].trim()); t = t.replace(m[0], " "); }
  if ((m = t.match(cz(/\b(z roku|rok|v roce)\s*((19|20)\d\d)\b/i)))) { f.od = f.do = Number(m[2]); pouzito.push(m[0]); t = t.replace(m[0], " "); }
  else {
    if ((m = t.match(cz(/\b(od roku|od|po roce|novější než)\s*((19|20)\d\d)\b/i)))) { f.od = Number(m[2]); pouzito.push(m[0]); t = t.replace(m[0], " "); }
    if ((m = t.match(cz(/\b(do roku|před rokem|starší než)\s*((19|20)\d\d)\b/i)))) { f.do = Number(m[2]); pouzito.push(m[0]); t = t.replace(m[0], " "); }
    if (!f.od && (m = t.match(cz(/\b(nov[éáý]\w*|novinky|letošní)\b/i)))) { f.od = new Date().getUTCFullYear() - 1; pouzito.push(m[0]); t = t.replace(m[0], " "); }
    if (!f.do && (m = t.match(cz(/\b(retro|stará|staré|starší|klasik\w*)\b/i)))) { f.do = 2005; pouzito.push(m[0]); t = t.replace(m[0], " "); }
  }
  if ((m = t.match(cz(/\b(dobře hodnocen\w*|nejlepší|top|skvěl\w*|kvalitní)\b/i)))) { f.hodnoceni = 80; pouzito.push(m[0]); t = t.replace(m[0], " "); }
  const zbytek = t.replace(VYPLN, " ").replace(/[^\p{L}\p{N}:' -]/gu, " ").replace(/\s+/g, " ").trim();
  if (zbytek.length >= 2) f.q = zbytek;
  return { filtry: f, pouzito };
}

const cislo = (v, min, max) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : null; };

export async function apiHledatFiltry(env, sp) {
  const filtry = await filtryDatabaze(env);
  let f = {
    q: String(sp.get("q") || "").trim().slice(0, 60) || null,
    platforma: cislo(sp.get("platforma"), 1, 100000), zanr: cislo(sp.get("zanr"), 1, 100000), rezim: cislo(sp.get("rezim"), 1, 100000), tema: cislo(sp.get("tema"), 1, 100000),
    od: cislo(sp.get("od"), 1950, 2100), do: cislo(sp.get("do"), 1950, 2100), hodnoceni: cislo(sp.get("hodnoceni"), 1, 100),
    cz: cislo(sp.get("cz"), 1, 2), cena: cislo(sp.get("cena"), 0, 100000),
  };
  let pouzito = [];
  const dotaz = String(sp.get("dotaz") || "").trim();
  if (dotaz) {
    const r = rozeberDotaz(dotaz, filtry);
    pouzito = r.pouzito;
    for (const [k, v] of Object.entries(r.filtry)) if (f[k] == null) f[k] = v;
  }
  const where = [`game_type = ${HLAVNI_TYP}`];
  if (f.platforma) where.push(`platforms = (${f.platforma})`);
  if (f.zanr) where.push(`genres = (${f.zanr})`);
  if (f.rezim) where.push(`game_modes = (${f.rezim})`);
  if (f.tema) where.push(`themes = (${f.tema})`);
  if (f.od) where.push(`first_release_date >= ${Date.UTC(f.od, 0, 1) / 1000}`);
  if (f.do) where.push(`first_release_date < ${Date.UTC(f.do + 1, 0, 1) / 1000}`);
  if (f.hodnoceni) where.push(`total_rating >= ${f.hodnoceni} & total_rating_count >= 5`);
  if (!f.q && !f.od && !f.do) where.push(`first_release_date < ${Math.floor(Date.now() / 1000)}`); // bez textu jen vydané hry
  const pole = "fields name,slug,first_release_date,cover.image_id,platforms.abbreviation,genres.name,themes.name,game_modes.name,total_rating,total_rating_count";
  const limit = f.cz || f.cena != null ? 200 : 60; // u češtiny/ceny se dofiltruje podle Steamu
  const hledat = f.q ? `search "${uvoz(f.q)}"; ` : "";
  const razeni = f.q ? "" : " sort total_rating_count desc;";
  const stav = { tok: await token(env), obnoveno: false };
  let d = await igdb(env, stav, "games", [
    `${hledat}${pole}; where ${where.join(" & ")};${razeni} limit ${limit};`,
    `${hledat}${pole.replace("game_type", "category")}; where ${where.join(" & ").replace(/game_type/g, "category")};${razeni} limit ${limit};`,
  ]);
  d = (d || []).filter((g) => g?.slug);
  // Čeština a cena z našich dat o Steamu (jen propojené hry).
  let steam = new Map();
  if (d.length) {
    await zajistiSchemaPropojeni(env.DB);
    const slugy = d.map((g) => g.slug);
    for (let i = 0; i < slugy.length; i += 90) {
      const { results } = await env.DB.prepare(`SELECT id, igdb_slug, cestina, cena, sleva, mena, zdarma FROM steam_hry WHERE igdb_slug IN (${slugy.slice(i, i + 90).map(() => "?").join(",")})`)
        .bind(...slugy.slice(i, i + 90)).all();
      for (const r of results) steam.set(r.igdb_slug, r);
    }
  }
  const jmeno = (list, id) => (list || []).find((x) => x.id === id)?.nazev;
  const hry = [];
  for (const g of d) {
    const s = steam.get(g.slug);
    if (f.cz && !(s && (s.cestina || 0) >= f.cz)) continue;
    if (f.cena != null && !(s && s.cena != null && (s.zdarma || s.cena <= f.cena))) continue;
    // „Proč se hodí“: které podmínky hra splňuje (jen ty, které uživatel zadal).
    const proc = [];
    if (f.platforma) proc.push(jmeno(filtry.platformy, f.platforma));
    if (f.zanr) proc.push(jmeno(filtry.zanry, f.zanr));
    if (f.rezim) proc.push(jmeno(filtry.rezimy, f.rezim));
    if (f.tema) proc.push(jmeno(filtry.temata, f.tema));
    if (f.hodnoceni && Number.isFinite(g.total_rating)) proc.push(`hodnocení ${Math.round(g.total_rating)}/100`);
    if (f.cz && s) proc.push(s.cestina >= 2 ? "CZ dabing" : "CZ texty");
    if (f.cena != null && s) proc.push(s.zdarma || s.cena === 0 ? "zdarma" : `${s.cena} ${s.mena === "EUR" ? "€" : "Kč"}${s.sleva ? ` (−${s.sleva} %)` : ""}`);
    if ((f.od || f.do) && rok(g.first_release_date)) proc.push(`vyšlo ${rok(g.first_release_date)}`);
    hry.push({ nazev: g.name, slug: g.slug, rok: rok(g.first_release_date), obal: obr(g.cover?.image_id, "t_cover_big"),
      platformy: (g.platforms || []).map((p) => p.abbreviation).filter(Boolean).slice(0, 6),
      hodnoceni: Number.isFinite(g.total_rating) && (g.total_rating_count || 0) >= 5 ? Math.round(g.total_rating) : null,
      proc: proc.filter(Boolean), steam_id: s?.id || null });
    if (hry.length >= 48) break;
  }
  return { hry, filtry: f, pouzito, nabidka: filtry };
}
