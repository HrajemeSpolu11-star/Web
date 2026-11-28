// Česká herní hitparáda: týdenní žebříček (pondělí–neděle, pražský čas) z vlastních měření oficiálních API Twitche a Kicku.
//  • Hry: hodiny sledování na českých streamech (hry_den), top 20.
//  • Streameři: nejvíc diváků najednou za týden (snimky.max_divaku), top 20.
//  • Střední (51–300 diváků) a malí (do 50) streameři: podle průměru denních špiček, aspoň 3 h a 2 dny vysílání, top 20.
// Každý týden se uloží do tabulky `hitparada` (archiv vydrží i po smazání denních dat po 400 dnech). Rozběhnutý týden se
// přepočítává (průběžné pořadí), uzavřený týden se zapíše jednou a už se nemění. Pozice minulý týden, počet týdnů
// v žebříčku a nejlepší pozice se berou z archivu – nic se nedopočítává.
// Běží v úloze „trendy“ (každé 3 h): ~13 dotazů, 4 zápisy; chybějící uzavřené týdny doplňuje po 2 za běh.
import { denPraha } from "./psani.js";
import { slugHry } from "./twitch.js";
import { posunDne, hodin, pondeli, isoTyden, pondeliZTydne, zacatekDat, dotazHry } from "./statistiky.js";
import { zajistiSchemaPropojeni } from "./propojeni.js";
import { zajistiSchemaTwitch } from "./twitch.js";
import { maIndex } from "./indexy.js";

export const VELIKOST = 20;
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS hitparada (tyden TEXT NOT NULL, druh TEXT NOT NULL, od TEXT NOT NULL, data TEXT NOT NULL,
     uzavreno INTEGER DEFAULT 0, cas INTEGER NOT NULL, PRIMARY KEY (tyden, druh))`,
];
let hotovo = false;
export async function zajistiSchemaHitparady(db) { if (hotovo) return; await db.batch(SCHEMA.map((s) => db.prepare(s))); hotovo = true; }

// Historie z archivu: minulá pozice, počet týdnů v žebříčku a nejlepší pozice. Každá uložená položka nese své `tydnu`
// a `nejlepsi`, takže stačí poslední výskyt: z minulého týdne, a jen u nováčků/návratů se hledá starší výskyt
// (dotazem LIKE přímo v databázi – nenačítá se a neparsuje celý archiv, šetří CPU).
const klicHry = (x) => `"hra":${JSON.stringify(x.hra)}`;
const klicStr = (x) => `"login":${JSON.stringify(x.login)}`;
const stejny = (druh, a, b) => (druh === "hry" ? a.hra === b.hra : a.login === b.login && a.platforma === b.platforma);
async function pridejHistorii(db, druh, tyden, polozky) {
  const minulyRadek = await db.prepare("SELECT data FROM hitparada WHERE druh = ? AND tyden < ? ORDER BY tyden DESC LIMIT 1").bind(druh, tyden).first();
  if (!minulyRadek) return polozky.map((p) => ({ ...p, poradi_pred: null, tydnu: 1, nejlepsi: p.poradi, stav: null }));
  let minuly = [];
  try { minuly = JSON.parse(minulyRadek.data); } catch { /* nic */ }
  const klic = druh === "hry" ? klicHry : klicStr;
  const chybi = polozky.filter((p) => !minuly.some((m) => stejny(druh, m, p)));
  const starsi = new Map();
  if (chybi.length) {
    const v = await db.batch(chybi.map((p) => db.prepare("SELECT data FROM hitparada WHERE druh = ? AND tyden < ? AND instr(data, ?) > 0 ORDER BY tyden DESC LIMIT 1")
      .bind(druh, tyden, klic(p))));
    chybi.forEach((p, i) => {
      const r = v[i].results[0];
      if (!r) return;
      try { const e = JSON.parse(r.data).find((m) => stejny(druh, m, p)); if (e) starsi.set(p, e); } catch { /* nic */ }
    });
  }
  return polozky.map((p) => {
    const m = minuly.find((x) => stejny(druh, x, p));
    const e = m || starsi.get(p);
    const pred = m ? m.poradi : null;
    return { ...p, poradi_pred: pred, tydnu: e ? (e.tydnu || 1) + 1 : 1, nejlepsi: Math.min(p.poradi, e?.nejlepsi || e?.poradi || p.poradi),
      stav: pred ? (pred > p.poradi ? "nahoru" : pred < p.poradi ? "dolu" : "stejne") : e ? "navrat" : "nova" };
  });
}

// Stejná hra pod dvěma názvy kategorie (Twitch „Grand Theft Auto VI“ a Kick „Grand Theft Auto VI (GTA)“) = jeden řádek.
// Shoda: stejné IGDB ID, nebo stejný název bez přípony v závorce. Ponechá se název s víc hodinami bez závorky.
const zakladNazvu = (n) => String(n || "").replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
function sloucitDuplicity(radky, igdb) {
  const skupiny = new Map(), out = [];
  for (const r of radky) {
    const k = igdb.get(r.hra) ? `i:${igdb.get(r.hra)}` : `n:${zakladNazvu(r.hra)}`;
    const k2 = `n:${zakladNazvu(r.hra)}`;
    const x = skupiny.get(k) || skupiny.get(k2);
    if (!x) { const novy = { ...r }; out.push(novy); skupiny.set(k, novy); skupiny.set(k2, novy); continue; }
    x.dm = (x.dm || 0) + (r.dm || 0); x.m = (x.m || 0) + (r.m || 0); x.dm_kick = (x.dm_kick || 0) + (r.dm_kick || 0);
    x.spicka = Math.max(x.spicka || 0, r.spicka || 0);
    if (/\(/.test(x.hra) && !/\(/.test(r.hra)) x.hra = r.hra;
    skupiny.set(k, x);
  }
  return out.sort((a, b) => (b.dm || 0) - (a.dm || 0));
}

async function spocitejTyden(db, po) {
  const ne = posunDne(po, 6), tyden = isoTyden(po);
  const idx = await maIndex(db, "idx_snimky_den");
  const [h, s, s2, s3, ig] = await db.batch([
    dotazHry(db, po, ne, VELIKOST + 10),
    // Tři žebříčky rovnou v databázi (vrací 3 × 20 řádků, ne tisíce). prumer = průměr denních špiček ve dnech, kdy vysílal.
    // S indexem snimky(den) se nejdřív sečtou snímky týdne; bez něj původní tvar přes streamery a primární klíč snímků.
    ...[["", "divaci DESC"], ["AND divaci BETWEEN 51 AND 300 AND minut >= 180 AND dni >= 2", "prumer DESC, minut DESC"],
      ["AND divaci BETWEEN 3 AND 50 AND minut >= 180 AND dni >= 2", "prumer DESC, minut DESC"]].map(([podminka, razeni]) => idx
      ? db.prepare(`SELECT s.platforma, s.login, s.jmeno, s.profilovka, a.divaci, a.minut, a.prumer, a.dni
        FROM (SELECT user_id, MAX(max_divaku) AS divaci, SUM(minut) AS minut, AVG(CASE WHEN minut > 0 THEN max_divaku END) AS prumer,
            SUM(CASE WHEN minut > 0 THEN 1 ELSE 0 END) AS dni FROM snimky INDEXED BY idx_snimky_den WHERE den BETWEEN ? AND ?
          GROUP BY user_id HAVING divaci >= 3 ${podminka} ORDER BY ${razeni} LIMIT ${VELIKOST + 20}) a
        JOIN streameri s ON s.id = a.user_id WHERE s.skryty = 0 ORDER BY ${razeni.replace(/(\w+) (DESC)/g, "a.$1 $2")} LIMIT ${VELIKOST}`).bind(po, ne)
      : db.prepare(`SELECT s.platforma, s.login, s.jmeno, s.profilovka, MAX(n.max_divaku) AS divaci, SUM(n.minut) AS minut,
          AVG(CASE WHEN n.minut > 0 THEN n.max_divaku END) AS prumer, SUM(CASE WHEN n.minut > 0 THEN 1 ELSE 0 END) AS dni
        FROM snimky n JOIN streameri s ON s.id = n.user_id WHERE n.den BETWEEN ? AND ? AND s.skryty = 0 GROUP BY s.id
        HAVING divaci >= 3 ${podminka} ORDER BY ${razeni} LIMIT ${VELIKOST}`).bind(po, ne)),
    db.prepare("SELECT nazev, igdb_slug FROM hry WHERE igdb_slug IS NOT NULL AND posledni > ?").bind(Date.parse(po) - 30 * 86400e3),
  ]);
  const igdb = new Map(ig.results.map((r) => [r.nazev, r.igdb_slug]));
  const hry = await pridejHistorii(db, "hry", tyden, sloucitDuplicity(h.results, igdb).slice(0, VELIKOST).filter((r) => (r.dm || 0) >= 60).map((r, i) => ({
    poradi: i + 1, hra: r.hra, slug: slugHry(r.hra), igdb_slug: igdb.get(r.hra) || null, hodin: hodin(r.dm),
    kick_podil: r.dm ? Math.round(((r.dm_kick || 0) / r.dm) * 100) : 0, spicka: r.spicka || 0,
  })));
  const naRadek = (r, i) => ({
    poradi: i + 1, platforma: r.platforma || "twitch", login: r.login, jmeno: r.jmeno || r.login,
    profilovka: /^https:\/\//.test(r.profilovka || "") ? r.profilovka : "", divaci: r.divaci, hodin: Math.round((r.minut || 0) / 60),
    prumer: Math.round(r.prumer || 0), dni: r.dni || 0,
  });
  // Střední a malí: řadí se podle průměru denních špiček (jeden nájezd diváků nerozhodne), musí vysílat aspoň 3 h a 2 dny.
  const [streameri, stredni, mali] = await Promise.all([["streameri", s], ["stredni", s2], ["mali", s3]]
    .map(([druh, r]) => pridejHistorii(db, druh, tyden, r.results.map(naRadek))));
  return { tyden, od: po, hry, streameri, stredni, mali };
}

export async function sestavHitparadu(env, ted = Date.now()) {
  const db = env.DB;
  await zajistiSchemaHitparady(db); await zajistiSchemaPropojeni(db); await zajistiSchemaTwitch(db);
  const od = await zacatekDat(db);
  if (!od) return { tydnu: 0 };
  const aktualni = pondeli(denPraha(ted));
  // Hotový = uzavřený týden se všemi čtyřmi žebříčky (střední a malí přibyli později – doplní se).
  const { results: ulozene } = await db.prepare("SELECT tyden, COUNT(*) AS n FROM hitparada WHERE uzavreno = 1 GROUP BY tyden").all();
  const hotove = new Set(ulozene.filter((r) => r.n >= 4).map((r) => r.tyden));
  // Uzavřené týdny, které v archivu chybí (od nejstaršího, ať navazuje historie) – nejvýš 2 za běh (limit CPU). Týden, kdy měření
  // začalo uprostřed, se ukládá také (s příznakem neúplný v datech stránky).
  let zpracovano = 0;
  for (let po = pondeli(od); po < aktualni && zpracovano < 2; po = posunDne(po, 7)) {
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
  await db.batch([zapis("hry", t.hry), zapis("streameri", t.streameri), zapis("stredni", t.stredni), zapis("mali", t.mali),
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
  const [h, s, n, st, ma] = await db.batch([
    db.prepare("SELECT data, cas FROM hitparada WHERE tyden = ? AND druh = 'hry'").bind(vybrany.tyden),
    db.prepare("SELECT data FROM hitparada WHERE tyden = ? AND druh = 'streameri'").bind(vybrany.tyden),
    db.prepare("SELECT 1 AS x FROM nastaveni WHERE klic = ?").bind(`hitparada_neuplny_${vybrany.tyden}`),
    db.prepare("SELECT data FROM hitparada WHERE tyden = ? AND druh = 'stredni'").bind(vybrany.tyden),
    db.prepare("SELECT data FROM hitparada WHERE tyden = ? AND druh = 'mali'").bind(vybrany.tyden),
  ]);
  const parse = (r) => { try { return JSON.parse(r?.data || "[]"); } catch { return []; } };
  const hry = parse(h.results[0]);
  // Obrázek hry = oficiální obal kategorie na Twitchi (podle ID kategorie). Doplňuje se při čtení, takže ho má i archiv.
  if (hry.length) {
    const jmena = [...new Set(hry.map((x) => x.hra))].slice(0, 90);
    const { results: kat } = await db.prepare(`SELECT nazev, twitch_id FROM hry WHERE nazev IN (${jmena.map(() => "?").join(",")})`).bind(...jmena).all().catch(() => ({ results: [] }));
    const tw = new Map(kat.filter((r) => /^\d{1,15}$/.test(String(r.twitch_id || ""))).map((r) => [r.nazev, r.twitch_id]));
    for (const x of hry) if (tw.has(x.hra)) x.obrazek = `https://static-cdn.jtvnw.net/ttv-boxart/${tw.get(x.hra)}-72x96.jpg`;
  }
  return {
    tyden: vybrany.tyden, od: vybrany.od, do: posunDne(vybrany.od, 6), probiha: !vybrany.uzavreno, neuplny: !!n.results.length,
    hry, streameri: parse(s.results[0]), stredni: parse(st.results[0]), mali: parse(ma.results[0]), cas: h.results[0] ? new Date(h.results[0].cas).toISOString() : null,
    tydny: tydny.map((t) => ({ id: t.tyden, od: t.od, probiha: !t.uzavreno })),
    cache: vybrany.uzavreno ? 3600 : 900,
  };
}

// Pozice streamera v poslední uzavřené (jinak rozběhnuté) hitparádě – pro odznak na profilu.
export async function poziceStreamera(db, platforma, login) {
  await zajistiSchemaHitparady(db);
  // Poslední uzavřený a rozběhnutý týden; přednost má uzavřený týden a v něm hlavní žebříček, pak střední, pak malí.
  const { results } = await db.prepare(`SELECT tyden, od, druh, data, uzavreno FROM hitparada WHERE druh IN ('streameri', 'stredni', 'mali')
    AND tyden IN (SELECT DISTINCT tyden FROM hitparada ORDER BY tyden DESC LIMIT 2)`).all();
  const PORADI = { streameri: 0, stredni: 1, mali: 2 };
  for (const r of [...results].sort((a, b) => b.uzavreno - a.uzavreno || b.tyden.localeCompare(a.tyden) || PORADI[a.druh] - PORADI[b.druh])) {
    if (!String(r.data).includes(`"login":${JSON.stringify(login)}`)) continue;
    let d = [];
    try { d = JSON.parse(r.data); } catch { continue; }
    const x = d.find((y) => y.platforma === platforma && y.login === login);
    if (x) return { tyden: r.tyden, od: r.od, druh: r.druh, probiha: !r.uzavreno, poradi: x.poradi, divaci: x.divaci, prumer: x.prumer || null, tydnu: x.tydnu, nejlepsi: x.nejlepsi };
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
