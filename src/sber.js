// Sběrač novinek – spouští ho Cron Trigger každých 15 minut.
import { ZDROJE } from "./zdroje.js";
import { parsujFeed } from "./rss.js";
import { textOmezeny } from "./telo.js";

const MAX_STARI_H = 12;          // starší zprávy se nezveřejní
const ZDROJU_NA_BEH = 10;        // 19 zdrojů → každý zhruba jednou za 30 min (limit 50 požadavků: RSS 10 + studia ≤ 12)
const MAX_CHYB = 5;              // po tolika chybách v řadě se zdroj vypne
const UCHOVAT_DNI = 90;          // starší články se mažou (archiv novinek na webu)
const UA = "HerniPulsBot/0.1 (+https://github.com/HrajemeSpolu11-star/Web)";

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS clanky (
     id TEXT PRIMARY KEY, url TEXT NOT NULL, nadpis TEXT NOT NULL, perex TEXT,
     obrazek TEXT, zdroj_id TEXT NOT NULL, jazyk TEXT, platformy TEXT, typ TEXT,
     datum INTEGER NOT NULL, ziskano INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_clanky_datum ON clanky(datum DESC)`,
  `CREATE TABLE IF NOT EXISTS zdroje (
     id TEXT PRIMARY KEY, posledni INTEGER DEFAULT 0, chyby INTEGER DEFAULT 0,
     etag TEXT, lastmod TEXT, stav TEXT, ulozeno INTEGER DEFAULT 0)`,
  // Vlastní články (napsané AI nebo ručně v adminu).
  `CREATE TABLE IF NOT EXISTS prispevky (
     id TEXT PRIMARY KEY, nadpis TEXT NOT NULL, perex TEXT, text TEXT, platformy TEXT, typ TEXT,
     obrazek TEXT, zdroje TEXT, stav TEXT NOT NULL, autor TEXT NOT NULL, model TEXT, poznamka TEXT,
     den TEXT, vytvoreno INTEGER NOT NULL, upraveno INTEGER, publikovano INTEGER)`,
  `CREATE INDEX IF NOT EXISTS idx_prispevky_stav ON prispevky(stav, publikovano DESC)`,
  // Zprávy, ze kterých už článek vznikl (aby se téma neopakovalo).
  `CREATE TABLE IF NOT EXISTS pouzite (clanek_id TEXT PRIMARY KEY, prispevek_id TEXT, cas INTEGER)`,
];

export async function zajistiSchema(db) {
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
}

// Normalizace adresy, aby se stejný článek neuložil dvakrát (utm parametry apod.).
function normalizujUrl(u) {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" && x.protocol !== "http:") return "";
    x.hash = "";
    [...x.searchParams.keys()].filter((k) => /^(utm_|ref$|fbclid|gclid)/i.test(k)).forEach((k) => x.searchParams.delete(k));
    x.protocol = "https:";
    return x.href.replace(/\/$/, "");
  } catch { return ""; }
}

async function otisk(s) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function platformy(text, zdroj) {
  const p = new Set(zdroj.platforma ? [zdroj.platforma] : []);
  // PlayStation: konkrétní generace, když je uvedená; obecná zmínka = „PlayStation“.
  const ps5 = /\bps5\b|playstation 5/i.test(text), ps4 = /\bps4\b|playstation 4/i.test(text);
  if (ps5) p.add("PS5");
  if (ps4) p.add("PS4");
  if (!ps5 && !ps4 && /\bplaystation\b/i.test(text)) p.add("PlayStation");
  if (/\bxbox\b/i.test(text)) p.add("Xbox");
  if (/\b(nintendo|switch 2)\b/i.test(text)) p.add("Switch");
  if (/\b(pc|steam|epic games store|gog)\b/i.test(text)) p.add("PC");
  return [...p];
}
function typ(text) {
  if (/\b(review|recenze)\b/i.test(text)) return "Recenze";
  if (/\b(esports?|tournament|turnaj|major|championship|liga|league finals?|grand final)\b/i.test(text)) return "Esport";
  if (/\b(twitch|kick\.com|streamer|streamerka|youtuber|stream)\b/i.test(text)) return "Streamování";
  if (/\b(gpu|nvidia|geforce|radeon|amd|intel|ps5 pro|steam deck|handheld|monitor|headset|hardware|rtx)\b/i.test(text)) return "Hardware";
  if (/\btrailer\b/i.test(text)) return "Trailer";
  if (/\b(sale|deal|discount|free|sleva|zdarma)\b/i.test(text)) return "Sleva";
  if (/\b(patch|update|aktualizace)\b/i.test(text)) return "Aktualizace";
  if (/\b(announce[sd]?|reveal(ed|s)?|release date|delay(ed)?|oznámen|odklad)/i.test(text)) return "Oznámení";
  return "Zpráva";
}

async function stahniZdroj(zdroj, stav) {
  const hlavicky = { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" };
  if (stav?.etag) hlavicky["If-None-Match"] = stav.etag;
  if (stav?.lastmod) hlavicky["If-Modified-Since"] = stav.lastmod;
  const r = await fetch(zdroj.url, { headers: hlavicky, signal: AbortSignal.timeout(10000), redirect: "follow" });
  if (r.status === 304) return { polozky: [], etag: stav.etag, lastmod: stav.lastmod, stav: "beze změn" };
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const xml = await textOmezeny(r, 2_000_000);
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) throw new Error("není RSS");
  return { polozky: parsujFeed(xml), etag: r.headers.get("ETag"), lastmod: r.headers.get("Last-Modified"), stav: "ok" };
}

export async function sber(env) {
  const db = env.DB;
  const ted = Date.now();
  await zajistiSchema(db);

  const { results } = await db.prepare("SELECT * FROM zdroje").all();
  const stavy = Object.fromEntries(results.map((r) => [r.id, r]));

  // Vyber zdroje, které se nejdéle nestahovaly a nejsou vypnuté.
  const fronta = ZDROJE
    // Vypnutý zdroj (MAX_CHYB chyb v řadě) se zkusí znovu po 24 h – když funguje, chyby se vynulují.
    .filter((z) => (stavy[z.id]?.chyby || 0) < MAX_CHYB || (stavy[z.id]?.posledni || 0) < ted - 24 * 3600e3)
    .sort((a, b) => (stavy[a.id]?.posledni || 0) - (stavy[b.id]?.posledni || 0))
    .slice(0, ZDROJU_NA_BEH);

  const vysledky = await Promise.allSettled(fronta.map((z) => stahniZdroj(z, stavy[z.id])));

  const prikazy = [];
  const vlozit = db.prepare(
    `INSERT OR IGNORE INTO clanky (id,url,nadpis,perex,obrazek,zdroj_id,jazyk,platformy,typ,datum,ziskano)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const upsertZdroj = db.prepare(
    `INSERT INTO zdroje (id,posledni,chyby,etag,lastmod,stav,ulozeno) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET posledni=excluded.posledni, chyby=excluded.chyby,
       etag=excluded.etag, lastmod=excluded.lastmod, stav=excluded.stav, ulozeno=zdroje.ulozeno+excluded.ulozeno`);

  for (let i = 0; i < fronta.length; i++) {
    const z = fronta[i], v = vysledky[i], s = stavy[z.id];
    if (v.status === "rejected") {
      prikazy.push(upsertZdroj.bind(z.id, ted, (s?.chyby || 0) + 1, s?.etag || null, s?.lastmod || null, "chyba: " + String(v.reason?.message || v.reason).slice(0, 80), 0));
      continue;
    }
    let pocet = 0;
    for (const p of v.value.polozky) {
      const url = normalizujUrl(p.url);
      // Filtr čerstvosti: jen zprávy s datem z posledních MAX_STARI_H hodin (a ne z budoucnosti).
      if (!url || !p.nadpis || !Number.isFinite(p.datum)) continue;
      if (p.datum < ted - MAX_STARI_H * 3600e3 || p.datum > ted + 3600e3) continue;
      const text = `${p.nadpis} ${p.perex}`;
      prikazy.push(vlozit.bind(await otisk(url), url, p.nadpis, p.perex, p.obrazek || null, z.id, z.jazyk,
        JSON.stringify(platformy(text, z)), typ(text), p.datum, ted));
      pocet++;
    }
    prikazy.push(upsertZdroj.bind(z.id, ted, 0, v.value.etag || null, v.value.lastmod || null, `${v.value.stav} (${pocet} čerstvých)`, pocet));
  }

  prikazy.push(db.prepare("DELETE FROM clanky WHERE datum < ?").bind(ted - UCHOVAT_DNI * 86400e3));
  // Všechny zápisy v jednom dávkovém dotazu = jeden požadavek do databáze.
  await db.batch(prikazy);
  // Pro deník AI: kolik webů prošla, kolik čerstvých zpráv našla (nové i už známé) a kde byla chyba.
  const chybne = fronta.filter((_, i) => vysledky[i].status === "rejected").map((z) => z.nazev || z.id);
  const cerstvych = vysledky.reduce((a, v) => a + (v.status === "fulfilled" ? v.value.polozky.filter((p) => Number.isFinite(p.datum) && p.datum >= ted - MAX_STARI_H * 3600e3).length : 0), 0);
  return { zdroju: fronta.map((z) => z.nazev || z.id), cerstvych, chybne };
}
