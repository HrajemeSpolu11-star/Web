// Rostoucí a upadající hry + cenový radar. Počítá se každé 3 hodiny (Cron psaní) z vlastních záznamů a ukládá do katalogu,
// stránky pak čtou jen jeden řádek (šetří čtení z D1).
//  • Česká scéna: hodiny sledování na českých streamech (Twitch + Kick, tabulka hry_den) – 7 celých dní proti 7 předchozím.
//  • Steam: denní špička hráčů (ISteamChartsService/GetMostPlayedGames, top ~100) – ukládáme 1× denně do hraci_den,
//    porovnává se se stejným žebříčkem o 7 dní dřív. Hra, která z žebříčku vypadla, NENÍ „mrtvá“ – jen ji neměříme.
//  • Cenový radar: hry ve slevě, které mají teď nejnižší cenu od začátku našeho měření (aspoň 30 dní historie).
import { denPraha } from "./psani.js";
import { BEZ_KATEGORIE } from "./prehled.js";
import { zajistiSchemaHlidac } from "./hlidac.js";
import { normNazev } from "./hra-data.js";
import { rozborCen } from "./ceny.js";
import { slugHry } from "./twitch.js";
import { sestavAnalytiku } from "./analytika.js";

const DEN = 86400e3;
const posun = (den, n) => new Date(Date.parse(den + "T12:00:00Z") + n * DEN).toISOString().slice(0, 10);
const https = (u) => (/^https:\/\//.test(String(u || "")) ? String(u) : "");

export const SCHEMA_HRACI = [
  `CREATE TABLE IF NOT EXISTS hraci_den (id TEXT NOT NULL, den TEXT NOT NULL, spicka INTEGER NOT NULL, nazev TEXT, PRIMARY KEY (id, den))`,
  `CREATE INDEX IF NOT EXISTS idx_hraci_den_den ON hraci_den(den)`,
];

// Z hodinového sběru žebříčku Steamu: jen první záznam dne (INSERT OR IGNORE → další běhy ten den nic nezapíšou).
// ~100 zápisů denně. Historie 400 dní.
export function prikazyHraciDen(db, hrane, ted = Date.now()) {
  const den = denPraha(ted);
  const p = (hrane || []).filter((h) => h?.id && Number.isFinite(h.hracu) && h.hracu > 0).slice(0, 100)
    .map((h) => db.prepare("INSERT OR IGNORE INTO hraci_den (id, den, spicka, nazev) VALUES (?, ?, ?, ?)").bind(String(h.id), den, Math.round(h.hracu), String(h.nazev || "").slice(0, 120)));
  if (p.length) p.push(db.prepare("DELETE FROM hraci_den WHERE den < ?").bind(posun(den, -400)));
  return p;
}

// Stav podle změny. Česká scéna kolísá víc (jeden velký streamer umí číslo hodně pohnout) → širší pásma než u Steamu.
export const PASMA = {
  cesko: { prudce: 1, roste: 0.25, klesa: -0.25, vyrazne: -0.6 },
  steam: { prudce: 0.5, roste: 0.15, klesa: -0.15, vyrazne: -0.4 },
};
function stavZmeny(zmena, pasma) {
  if (zmena >= pasma.prudce) return "prudce_roste";
  if (zmena >= pasma.roste) return "roste";
  if (zmena > pasma.klesa) return "stabilni";
  if (zmena > pasma.vyrazne) return "klesa";
  return "vyrazne_klesa";
}

async function obrazkyPodleNazvu(db, nazvy) {
  const norm = [...new Set(nazvy.map(normNazev).filter(Boolean))], m = new Map();
  for (let i = 0; i < norm.length; i += 90) {
    const d = norm.slice(i, i + 90);
    const { results } = await db.prepare(`SELECT id, norm, obrazek FROM steam_hry WHERE norm IN (${d.map(() => "?").join(",")})`).bind(...d).all();
    for (const r of results) if (!m.has(r.norm)) m.set(r.norm, r);
  }
  return m;
}

async function trendCesko(db, ted) {
  const dnes = denPraha(ted), vcera = posun(dnes, -1);
  const t0 = posun(dnes, -7), p0 = posun(dnes, -14), s0 = posun(dnes, -45);
  const [od, rows] = await db.batch([
    db.prepare("SELECT MIN(den) AS od FROM hry_den"),
    db.prepare(`SELECT hra,
        SUM(CASE WHEN den >= ? THEN divako_minut ELSE 0 END) AS t,
        SUM(CASE WHEN den >= ? AND den < ? THEN divako_minut ELSE 0 END) AS p,
        SUM(CASE WHEN den < ? THEN divako_minut ELSE 0 END) AS s
      FROM hry_den WHERE den >= ? AND den <= ? AND hra <> ? GROUP BY hra`).bind(t0, p0, t0, p0, s0, vcera, BEZ_KATEGORIE),
  ]);
  const zacatek = od.results[0]?.od || null;
  const hmax = Math.max(0, ...rows.results.map((r) => r.t || 0)) / 60;
  // Trend jde spočítat, až máme 14 celých dní záznamů.
  const dostupne = !!zacatek && zacatek <= p0;
  const polozky = [];
  if (dostupne) {
    for (const r of rows.results) {
      const th = (r.t || 0) / 60, ph = (r.p || 0) / 60, sh = (r.s || 0) / 60;
      if (Math.max(th, ph) < 10) continue; // pod 10 h týdně je to šum
      let stav, zmena = null;
      if (ph < 2 && th >= 15) stav = sh >= 5 ? "oziva" : "nova"; // dřív hraná, týden ticho, teď zpět / nově na scéně
      else if (ph >= 2) { zmena = (th - ph) / ph; stav = stavZmeny(zmena, PASMA.cesko); }
      else continue;
      polozky.push({ hra: r.hra, slug: slugHry(r.hra), hodin: Math.round(th), hodin_pred: Math.round(ph), zmena: zmena == null ? null : Math.round(zmena * 100), stav });
    }
    const obr = await obrazkyPodleNazvu(db, polozky.map((p) => p.hra));
    for (const p of polozky) { const s = obr.get(normNazev(p.hra)); if (s) { p.steam_id = s.id; p.obrazek = https(s.obrazek); } }
    polozky.sort((a, b) => b.hodin - a.hodin);
  }
  return { dostupne, od: zacatek, obdobi: { od: t0, do: vcera, pred_od: p0 }, hmax: Math.round(hmax), polozky: polozky.slice(0, 120) };
}

async function trendSteam(db) {
  const { results: dny } = await db.prepare("SELECT DISTINCT den FROM hraci_den ORDER BY den DESC LIMIT 12").all();
  const posl = dny[0]?.den, od = dny[dny.length - 1]?.den || null;
  if (!posl) return { dostupne: false, od: null, polozky: [] };
  // Srovnávací den: přesně o 7 dní dřív, jinak nejbližší 6–9 dní zpět (když sběr nějaký den vypadl).
  const cil = posun(posl, -7);
  const srov = [cil, posun(cil, 1), posun(cil, -1), posun(cil, -2)].find((d) => dny.some((x) => x.den === d));
  if (!srov) return { dostupne: false, od, den: posl, polozky: [] };
  const { results } = await db.prepare("SELECT id, den, spicka, nazev FROM hraci_den WHERE den IN (?, ?)").bind(posl, srov).all();
  const ted = new Map(), pred = new Map();
  for (const r of results) (r.den === posl ? ted : pred).set(r.id, r);
  const polozky = [];
  for (const [id, r] of ted) {
    const p = pred.get(id);
    if (!p || p.spicka < 1000) continue; // bez srovnání (nová v žebříčku) nehodnotíme
    const zmena = (r.spicka - p.spicka) / p.spicka;
    polozky.push({ steam_id: id, hra: r.nazev, hracu: r.spicka, hracu_pred: p.spicka, zmena: Math.round(zmena * 100), stav: stavZmeny(zmena, PASMA.steam) });
  }
  const ids = polozky.map((p) => p.steam_id), obr = new Map();
  for (let i = 0; i < ids.length; i += 90) {
    const d = ids.slice(i, i + 90);
    const { results: g } = await db.prepare(`SELECT id, obrazek FROM steam_hry WHERE id IN (${d.map(() => "?").join(",")})`).bind(...d).all();
    for (const x of g) obr.set(x.id, https(x.obrazek));
  }
  for (const p of polozky) p.obrazek = obr.get(p.steam_id) || `https://cdn.cloudflare.steamstatic.com/steam/apps/${encodeURIComponent(p.steam_id)}/header.jpg`;
  polozky.sort((a, b) => b.hracu - a.hracu);
  return { dostupne: true, od, den: posl, srovnani: srov, polozky };
}

async function cenovyRadar(db, ted) {
  const { results: kand } = await db.prepare(`SELECT id, nazev, obrazek, cena, puvodni, sleva, mena, doporuceni, kladne, recenzi, cestina FROM steam_hry
    WHERE sleva > 0 AND cena > 0 AND cena_cas > ? ORDER BY COALESCE(doporuceni, 0) DESC LIMIT 150`).bind(ted - 2 * DEN).all();
  // 150 nejoblíbenějších her ve slevě × historie (max. 400 dní) ≈ do 60 tis. čtení na běh, 8 běhů denně.
  const hist = new Map();
  for (let i = 0; i < kand.length; i += 90) {
    const d = kand.slice(i, i + 90).map((k) => k.id);
    const { results } = await db.prepare(`SELECT id, den, cena, sleva FROM ceny_historie WHERE id IN (${d.map(() => "?").join(",")}) ORDER BY id, den`).bind(...d).all();
    for (const r of results) { if (!hist.has(r.id)) hist.set(r.id, []); hist.get(r.id).push(r); }
  }
  const hry = [];
  for (const k of kand) {
    const r = rozborCen(hist.get(k.id) || [], { cena: k.cena, sleva: k.sleva }, ted);
    if (!r || r.dni < 30 || !r.nejnizsi_ted) continue;
    hry.push({ id: k.id, nazev: k.nazev, obrazek: https(k.obrazek), cena: k.cena, puvodni: k.puvodni, sleva: k.sleva, mena: k.mena || "CZK", cestina: k.cestina,
      hodnoceni: k.recenzi >= 50 && k.kladne != null ? { kladne: k.kladne, recenzi: k.recenzi } : null,
      od: r.od, dni: r.dni, slevovych_obdobi: r.slevovych_obdobi, obvykla_sleva: r.obvykla_sleva });
  }
  return { hry: hry.slice(0, 40), kandidatu: kand.length };
}

export async function sestavTrendy(env) {
  const db = env.DB, ted = Date.now();
  await zajistiSchemaHlidac(db);
  await db.batch(SCHEMA_HRACI.map((s) => db.prepare(s)));
  const [c, s, k, a] = await Promise.allSettled([trendCesko(db, ted), trendSteam(db), cenovyRadar(db, ted), sestavAnalytiku(db, ted)]);
  const chyby = [c, s, k, a].filter((x) => x.status === "rejected").map((x) => String(x.reason?.message || x.reason).slice(0, 100));
  const p = [];
  if (c.status === "fulfilled" || s.status === "fulfilled")
    p.push(db.prepare("INSERT OR REPLACE INTO katalog (klic, data, cas) VALUES ('trendy', ?, ?)").bind(JSON.stringify({
      cesko: c.status === "fulfilled" ? c.value : null, steam: s.status === "fulfilled" ? s.value : null }), ted));
  if (k.status === "fulfilled") p.push(db.prepare("INSERT OR REPLACE INTO katalog (klic, data, cas) VALUES ('cenovy_radar', ?, ?)").bind(JSON.stringify(k.value), ted));
  if (a.status === "fulfilled") p.push(db.prepare("INSERT OR REPLACE INTO katalog (klic, data, cas) VALUES ('analytika', ?, ?)").bind(JSON.stringify(a.value), ted));
  if (p.length) await db.batch(p);
  if (!p.length) throw new Error(chyby.join("; ") || "nic se nespočítalo");
  return { cesko: c.value?.polozky?.length || 0, steam: s.value?.polozky?.length || 0, ceny: k.value?.hry?.length || 0, chyby };
}

export async function nactiKatalog(db, klic) {
  const r = await db.prepare("SELECT data, cas FROM katalog WHERE klic = ?").bind(klic).first().catch(() => null);
  if (!r) return null;
  try { return { ...JSON.parse(r.data), cas: new Date(r.cas).toISOString() }; } catch { return null; }
}

export async function apiTrendy(env) {
  const t = await nactiKatalog(env.DB, "trendy");
  return t || { cesko: null, steam: null, cas: null };
}
export async function apiCenovyRadar(env) {
  return (await nactiKatalog(env.DB, "cenovy_radar")) || { hry: [], cas: null };
}
export async function apiAnalytika(env) {
  return (await nactiKatalog(env.DB, "analytika")) || { dostupne: false, zanry: [], komunity: [], slevy: [], aktualizace: [], cas: null };
}
