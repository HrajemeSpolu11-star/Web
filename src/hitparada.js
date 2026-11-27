// Česká herní hitparáda: týdenní žebříček (pondělí–neděle, pražský čas) z vlastních měření oficiálních API Twitche a Kicku.
//  • Hry: hodiny sledování na českých streamech (hry_den), top 20.
//  • Streameři: nejvíc diváků najednou za týden (snimky.max_divaku), top 20.
// Každý týden se uloží do tabulky `hitparada` (archiv vydrží i po smazání denních dat po 400 dnech). Rozběhnutý týden se
// přepočítává (průběžné pořadí), uzavřený týden se zapíše jednou a už se nemění. Pozice minulý týden, počet týdnů
// v žebříčku a nejlepší pozice se berou z archivu – nic se nedopočítává.
// Běží v úloze „trendy“ (každé 3 h): ~4 čtení + nejvýš pár zápisů; při prvním běhu doplní uzavřené týdny od začátku měření.
import { denPraha } from "./psani.js";
import { slugHry } from "./twitch.js";
import { posunDne, hodin, pondeli, isoTyden, pondeliZTydne, zacatekDat, dotazHry } from "./statistiky.js";
import { zajistiSchemaPropojeni } from "./propojeni.js";

export const VELIKOST = 20;
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS hitparada (tyden TEXT NOT NULL, druh TEXT NOT NULL, od TEXT NOT NULL, data TEXT NOT NULL,
     uzavreno INTEGER DEFAULT 0, cas INTEGER NOT NULL, PRIMARY KEY (tyden, druh))`,
];
let hotovo = false;
export async function zajistiSchemaHitparady(db) { if (hotovo) return; await db.batch(SCHEMA.map((s) => db.prepare(s))); hotovo = true; }

// Historie z archivu: pozice podle týdnů → minulá pozice, počet týdnů v žebříčku, nejlepší pozice.
function pridejHistorii(polozky, klic, predchozi) {
  // predchozi: pole uložených týdnů (nejnovější první) – každý { tyden, mapa: Map(klic → poradi) }
  const minuly = predchozi[0]?.mapa;
  return polozky.map((p) => {
    const k = klic(p);
    const pozice = predchozi.map((t) => t.mapa.get(k)).filter(Boolean);
    const pred = minuly ? minuly.get(k) || null : null;
    const bylDriv = pozice.length > 0;
    return { ...p, poradi_pred: pred, tydnu: pozice.length + 1, nejlepsi: Math.min(p.poradi, ...pozice),
      stav: !minuly ? null : pred ? (pred > p.poradi ? "nahoru" : pred < p.poradi ? "dolu" : "stejne") : bylDriv ? "navrat" : "nova" };
  });
}

async function nactiPredchozi(db, druh, predTydnem, n = 52) {
  const { results } = await db.prepare("SELECT tyden, data FROM hitparada WHERE druh = ? AND tyden < ? ORDER BY tyden DESC LIMIT ?").bind(druh, predTydnem, n).all();
  return results.map((r) => {
    let d = [];
    try { d = JSON.parse(r.data); } catch { /* nic */ }
    return { tyden: r.tyden, mapa: new Map(d.map((x) => [druh === "hry" ? x.hra : `${x.platforma}:${x.login}`, x.poradi])) };
  });
}

async function spocitejTyden(db, po) {
  const ne = posunDne(po, 6), tyden = isoTyden(po);
  const [h, s, ig] = await db.batch([
    dotazHry(db, po, ne, VELIKOST),
    db.prepare(`SELECT s.platforma, s.login, s.jmeno, s.profilovka, MAX(n.max_divaku) AS divaci, SUM(n.minut) AS minut
      FROM snimky n JOIN streameri s ON s.id = n.user_id WHERE n.den BETWEEN ? AND ? AND s.skryty = 0 GROUP BY s.id
      HAVING divaci > 0 ORDER BY divaci DESC LIMIT ?`).bind(po, ne, VELIKOST),
    db.prepare("SELECT nazev, igdb_slug FROM hry WHERE igdb_slug IS NOT NULL AND posledni > ?").bind(Date.parse(po) - 30 * 86400e3),
  ]);
  const igdb = new Map(ig.results.map((r) => [r.nazev, r.igdb_slug]));
  const predchoziHry = await nactiPredchozi(db, "hry", tyden);
  const predchoziStr = await nactiPredchozi(db, "streameri", tyden);
  const hry = pridejHistorii(h.results.filter((r) => (r.dm || 0) >= 60).map((r, i) => ({
    poradi: i + 1, hra: r.hra, slug: slugHry(r.hra), igdb_slug: igdb.get(r.hra) || null, hodin: hodin(r.dm),
    kick_podil: r.dm ? Math.round(((r.dm_kick || 0) / r.dm) * 100) : 0, spicka: r.spicka || 0,
  })), (x) => x.hra, predchoziHry);
  const streameri = pridejHistorii(s.results.map((r, i) => ({
    poradi: i + 1, platforma: r.platforma || "twitch", login: r.login, jmeno: r.jmeno || r.login,
    profilovka: /^https:\/\//.test(r.profilovka || "") ? r.profilovka : "", divaci: r.divaci, hodin: Math.round((r.minut || 0) / 60),
  })), (x) => `${x.platforma}:${x.login}`, predchoziStr);
  return { tyden, od: po, hry, streameri };
}

export async function sestavHitparadu(env, ted = Date.now()) {
  const db = env.DB;
  await zajistiSchemaHitparady(db); await zajistiSchemaPropojeni(db);
  const od = await zacatekDat(db);
  if (!od) return { tydnu: 0 };
  const aktualni = pondeli(denPraha(ted));
  const { results: ulozene } = await db.prepare("SELECT tyden FROM hitparada WHERE druh = 'hry' AND uzavreno = 1").all();
  const hotove = new Set(ulozene.map((r) => r.tyden));
  // Uzavřené týdny, které v archivu chybí (od nejstaršího, ať navazuje historie) – nejvýš 8 za běh. Týden, kdy měření
  // začalo uprostřed, se ukládá také (s příznakem neúplný v datech stránky).
  let zpracovano = 0;
  for (let po = pondeli(od); po < aktualni && zpracovano < 8; po = posunDne(po, 7)) {
    if (hotove.has(isoTyden(po))) continue;
    await ulozTyden(db, await spocitejTyden(db, po), 1, ted, po < od);
    zpracovano++;
  }
  // Rozběhnutý týden – průběžně.
  await ulozTyden(db, await spocitejTyden(db, aktualni), 0, ted, aktualni < od);
  return { tydnu: zpracovano + 1 };
}

async function ulozTyden(db, t, uzavreno, ted, neuplny) {
  const zapis = (druh, data) => db.prepare(`INSERT INTO hitparada (tyden, druh, od, data, uzavreno, cas) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(tyden, druh) DO UPDATE SET data = excluded.data, uzavreno = excluded.uzavreno, cas = excluded.cas WHERE hitparada.uzavreno = 0`)
    .bind(t.tyden, druh, t.od, JSON.stringify(data), uzavreno, ted);
  await db.batch([zapis("hry", t.hry), zapis("streameri", t.streameri),
    ...(neuplny ? [db.prepare("INSERT OR REPLACE INTO nastaveni (klic, hodnota, plati_do) VALUES (?, '1', NULL)").bind(`hitparada_neuplny_${t.tyden}`)] : [])]);
}

// ---------- /api/hitparada?tyden=2026-W48 | aktualni ----------
export async function apiHitparada(env, tydenId) {
  const db = env.DB;
  await zajistiSchemaHitparady(db);
  const { results: tydny } = await db.prepare("SELECT tyden, od, uzavreno FROM hitparada WHERE druh = 'hry' ORDER BY tyden DESC LIMIT 200").all();
  if (!tydny.length) return { tyden: null, tydny: [], hry: [], streameri: [] };
  const posledniUzavreny = tydny.find((t) => t.uzavreno);
  const vybrany = tydenId === "aktualni" ? tydny[0] : tydny.find((t) => t.tyden === tydenId) || posledniUzavreny || tydny[0];
  const [h, s, n] = await db.batch([
    db.prepare("SELECT data, cas FROM hitparada WHERE tyden = ? AND druh = 'hry'").bind(vybrany.tyden),
    db.prepare("SELECT data FROM hitparada WHERE tyden = ? AND druh = 'streameri'").bind(vybrany.tyden),
    db.prepare("SELECT 1 AS x FROM nastaveni WHERE klic = ?").bind(`hitparada_neuplny_${vybrany.tyden}`),
  ]);
  const parse = (r) => { try { return JSON.parse(r?.data || "[]"); } catch { return []; } };
  return {
    tyden: vybrany.tyden, od: vybrany.od, do: posunDne(vybrany.od, 6), probiha: !vybrany.uzavreno, neuplny: !!n.results.length,
    hry: parse(h.results[0]), streameri: parse(s.results[0]), cas: h.results[0] ? new Date(h.results[0].cas).toISOString() : null,
    tydny: tydny.map((t) => ({ id: t.tyden, od: t.od, probiha: !t.uzavreno })),
    cache: vybrany.uzavreno ? 3600 : 900,
  };
}

// Pozice streamera v poslední uzavřené (jinak rozběhnuté) hitparádě – pro odznak na profilu.
export async function poziceStreamera(db, platforma, login) {
  await zajistiSchemaHitparady(db);
  const { results } = await db.prepare("SELECT tyden, od, data, uzavreno FROM hitparada WHERE druh = 'streameri' ORDER BY tyden DESC LIMIT 2").all();
  for (const r of [...results].sort((a, b) => b.uzavreno - a.uzavreno)) {
    let d = [];
    try { d = JSON.parse(r.data); } catch { /* nic */ }
    const x = d.find((y) => y.platforma === platforma && y.login === login);
    if (x) return { tyden: r.tyden, od: r.od, probiha: !r.uzavreno, poradi: x.poradi, divaci: x.divaci, tydnu: x.tydnu, nejlepsi: x.nejlepsi };
  }
  return null;
}

// Historie hry v hitparádě (pro profil hry v Česku).
export async function historieHryVHitparade(db, nazev) {
  await zajistiSchemaHitparady(db);
  const { results } = await db.prepare("SELECT tyden, od, data, uzavreno FROM hitparada WHERE druh = 'hry' ORDER BY tyden DESC LIMIT 60").all();
  const out = [];
  for (const r of results) {
    if (!String(r.data).includes(JSON.stringify(nazev).slice(1, -1))) continue; // rychlé předfiltrování bez parsování
    let d = [];
    try { d = JSON.parse(r.data); } catch { continue; }
    const x = d.find((y) => y.hra === nazev);
    if (x) out.push({ tyden: r.tyden, od: r.od, poradi: x.poradi, probiha: !r.uzavreno });
  }
  return out;
}
export { pondeliZTydne };
