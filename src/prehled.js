// Přehled české streamovací scény: graf (scena), milníky (udalosti), kalendář (rozvrh), týden v číslech.
import { denPraha } from "./psani.js";
import { topStreameru } from "./statistiky.js";
import { maIndex, napoveda } from "./indexy.js";
import { zajistiSchemaTwitch } from "./twitch.js";

export const SCHEMA_PREHLED = [
  `CREATE TABLE IF NOT EXISTS scena (cas INTEGER NOT NULL, platforma TEXT NOT NULL, streamu INTEGER, divaci INTEGER, PRIMARY KEY (cas, platforma))`,
  `CREATE TABLE IF NOT EXISTS udalosti (typ TEXT NOT NULL, user_id TEXT NOT NULL, den TEXT NOT NULL, hodnota INTEGER, cas INTEGER,
     PRIMARY KEY (typ, user_id, den))`,
  `CREATE INDEX IF NOT EXISTS idx_udalosti_cas ON udalosti(cas DESC)`,
  `CREATE TABLE IF NOT EXISTS rozvrh (user_id TEXT NOT NULL, zacatek INTEGER NOT NULL, konec INTEGER, nazev TEXT, hra TEXT,
     PRIMARY KEY (user_id, zacatek))`,
  `CREATE INDEX IF NOT EXISTS idx_rozvrh_zacatek ON rozvrh(zacatek)`,
  // Statistiky her po dnech (den podle Prahy): divácké minuty (= hodiny sledování × 60), minuty vysílání, špičky.
  // slot = 15min běh, ve kterém se řádek naposledy navýšil – opakovaný běh ve stejném slotu nic nezapočítá dvakrát.
  `CREATE TABLE IF NOT EXISTS hry_den (den TEXT NOT NULL, hra TEXT NOT NULL, platforma TEXT NOT NULL,
     divako_minut INTEGER DEFAULT 0, minut INTEGER DEFAULT 0, max_divaku INTEGER DEFAULT 0, max_streamu INTEGER DEFAULT 0,
     slot INTEGER DEFAULT 0, PRIMARY KEY (den, hra, platforma))`,
  `CREATE INDEX IF NOT EXISTS idx_hry_den_den ON hry_den(den)`,
  // Stránka hry hledá podle názvu hry; hra/den se při navyšování nemění → index nepřidává zápisy při každém běhu.
  `CREATE INDEX IF NOT EXISTS idx_hry_den_hra ON hry_den(hra, den)`,
];

// Kolik minut má tento běh započítat do statistik (odvysílané minuty, hodiny sledování).
// Počítá se skutečně uplynulý čas od posledního započteného běhu dané platformy (max. 15 min – co se dělo
// při výpadku, nevíme, tak to nedomýšlíme). Rezervace je atomická: když dva běhy (Cron a sběr na vyžádání)
// proběhnou zároveň, započítá se jen jeden. Vrací 0 = tento běh statistiky nenavyšuje.
export async function rezervujMinuty(db, platforma, ted) {
  const klic = `beh_${platforma}`;
  await db.prepare("INSERT OR IGNORE INTO nastaveni (klic, hodnota, plati_do) VALUES (?, '', ?)").bind(klic, ted - 15 * 60e3).run();
  const r = await db.prepare("SELECT plati_do FROM nastaveni WHERE klic = ?").bind(klic).first();
  const pred = r?.plati_do || 0;
  const minut = Math.min(15, Math.floor((ted - pred) / 60e3));
  if (minut < 1) return 0;
  const nove = minut === 15 ? ted : pred + minut * 60e3;
  const u = await db.prepare("UPDATE nastaveni SET plati_do = ? WHERE klic = ? AND plati_do = ?").bind(nove, klic, pred).run();
  if (!u.meta?.changes) return 0;
  rezervace.set(platforma, { pred, nove });
  return minut;
}
// Když zápis statistik po rezervaci selže, rezervaci vrátíme – interval se započítá při dalším běhu a nic se neztratí.
const rezervace = new Map();
export async function vratMinuty(db, platforma) {
  const r = rezervace.get(platforma);
  if (!r) return;
  rezervace.delete(platforma);
  await db.prepare("UPDATE nastaveni SET plati_do = ? WHERE klic = ? AND plati_do = ?").bind(r.pred, `beh_${platforma}`, r.nove).run().catch(() => {});
}

// Jeden zápis na hru a běh: součet diváků, počet streamů. Bere všechny streamy (i s 0 diváky), ať je to přesné.
// Streamy bez kategorie jdou pod BEZ_KATEGORIE – v žebříčku her se nezobrazí, ale počítají se do celkových hodin.
export const BEZ_KATEGORIE = "(bez kategorie)";
export function prikazyHryDen(db, ted, platforma, streamy, nazevHry, intervalMin) {
  if (!intervalMin) return [];
  const souhrn = new Map();
  for (const s of streamy) {
    const hra = String(nazevHry(s) || "").slice(0, 120) || BEZ_KATEGORIE;
    const x = souhrn.get(hra) || { divaci: 0, streamu: 0 };
    x.divaci += s.viewer_count || 0; x.streamu++;
    souhrn.set(hra, x);
  }
  const den = denPraha(ted), slot = casBehu(ted);
  // Dvojímu započtení brání rezervujMinuty() – sem chodí jen běh, který minuty dostal.
  const st = db.prepare(`INSERT INTO hry_den (den, hra, platforma, divako_minut, minut, max_divaku, max_streamu, slot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(den, hra, platforma) DO UPDATE SET
      divako_minut = hry_den.divako_minut + excluded.divako_minut,
      minut = hry_den.minut + excluded.minut,
      max_divaku = MAX(hry_den.max_divaku, excluded.max_divaku), max_streamu = MAX(hry_den.max_streamu, excluded.max_streamu),
      slot = excluded.slot`);
  return [...souhrn].map(([hra, x]) => st.bind(den, hra, platforma, x.divaci * intervalMin, x.streamu * intervalMin, x.divaci, x.streamu, slot));
}

export const MILNIKY = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
const MIN_PRO_REKORD = 30; // rekordy diváků hlásíme až u kanálů, které už měly aspoň 30 diváků

// Časová značka běhu zaokrouhlená na 15 min – Twitch i Kick ze stejného běhu padnou do stejného bodu grafu.
export const casBehu = (ted) => Math.floor(ted / 900e3) * 900e3;

export function prikazScena(db, ted, platforma, streamy) {
  const divaci = streamy.reduce((a, s) => a + (s.viewer_count || 0), 0);
  return db.prepare(`INSERT INTO scena (cas, platforma, streamu, divaci) VALUES (?, ?, ?, ?)
    ON CONFLICT(cas, platforma) DO UPDATE SET streamu = excluded.streamu, divaci = excluded.divaci`)
    .bind(casBehu(ted), platforma, streamy.length, divaci);
}

export function prikazRekord(db, ted, userId, divaci) {
  return db.prepare(`INSERT INTO udalosti (typ, user_id, den, hodnota, cas) VALUES ('rekord', ?, ?, ?, ?)
    ON CONFLICT(typ, user_id, den) DO UPDATE SET hodnota = MAX(udalosti.hodnota, excluded.hodnota), cas = excluded.cas`)
    .bind(userId, denPraha(ted), divaci, ted);
}

export function prikazMilnik(db, ted, userId, pred, ted2) {
  const prekonany = MILNIKY.filter((m) => pred != null && pred < m && ted2 >= m).pop();
  if (!prekonany) return null;
  return db.prepare(`INSERT OR IGNORE INTO udalosti (typ, user_id, den, hodnota, cas) VALUES ('milnik', ?, ?, ?, ?)`)
    .bind(userId, denPraha(ted), prekonany, ted);
}

// Na základě předchozího stavu: kdo nově začal vysílat a kdo překonal rekord diváků.
export function vyhodnotZmeny(db, ted, predchozi, streamy, idZ, platforma) {
  const prikazy = [], noveZive = [];
  for (const s of streamy) {
    const id = idZ(s);
    const p = predchozi.get(id);
    const divaci = s.viewer_count || 0;
    if (!p || !p.zive) noveZive.push({ klic: `${platforma}:${String(s.user_login || s.slug || "").toLowerCase()}`, jmeno: s.user_name || s.slug, hra: s.game_name || s.category?.name || "" });
    if (p && p.max_divaku >= MIN_PRO_REKORD && divaci > p.max_divaku) prikazy.push(prikazRekord(db, ted, id, divaci));
  }
  return { prikazy, noveZive };
}

export async function nactiPredchozi(db, platforma, ted, platnost) {
  const { results } = await db.prepare("SELECT id, max_divaku, zive_cas FROM streameri WHERE platforma = ?").bind(platforma).all();
  return new Map(results.map((r) => [r.id, { max_divaku: r.max_divaku || 0, zive: !!(r.zive_cas && r.zive_cas > ted - platnost) }]));
}

// ---------- API /api/prehled ----------
export async function apiPrehled(env, naStreamera) {
  const db = env.DB;
  await zajistiSchemaTwitch(db);
  const idx = await maIndex(db, "idx_snimky_den"), idxHry = await napoveda(db, "idx_hry_den_den");
  const ted = Date.now();
  const od7 = ted - 7 * 86400e3;
  const den7 = new Date(od7).toISOString().slice(0, 10);
  const [scena, rust, divaci, hodiny, hry, udal, kal] = await db.batch([
    db.prepare(`SELECT cas, SUM(streamu) AS streamu, SUM(divaci) AS divaci FROM scena WHERE cas > ? GROUP BY cas ORDER BY cas`).bind(od7),
    db.prepare(`SELECT s.*, s.sledujici - (SELECT n.sledujici FROM snimky n WHERE n.user_id = s.id AND n.sledujici IS NOT NULL AND n.den >= ? ORDER BY n.den LIMIT 1) AS rust7
      FROM streameri s WHERE s.skryty = 0 AND s.sledujici IS NOT NULL ORDER BY rust7 IS NULL, rust7 DESC LIMIT 5`).bind(den7),
    topStreameru(db, den7, "9999-12-31", "MAX(max_divaku)", "max7", 5, idx),
    topStreameru(db, den7, "9999-12-31", "SUM(minut)", "minut7", 5, idx),
    // Kandidáti = 40 nejsledovanějších her za 7 dní (hry_den přes index dne), počty z hry_streamera jen pro ně přes index hry.
    // Dřív se četla celá tabulka hry_streamera (zátěžový test 2026-11-27).
    db.prepare(`SELECT h.hra, SUM(h.minut) AS minut, COUNT(*) AS streameru FROM hry_streamera h
      WHERE h.hra IN (SELECT hra FROM hry_den ${idxHry} WHERE den >= ? GROUP BY hra ORDER BY SUM(minut) DESC LIMIT 40)
        AND h.posledni > ? GROUP BY h.hra ORDER BY minut DESC LIMIT 8`).bind(den7, od7),
    db.prepare(`SELECT s.*, u.typ AS u_typ, u.hodnota AS u_hodnota, u.cas AS u_cas FROM udalosti u JOIN streameri s ON s.id = u.user_id
      WHERE u.cas > ? AND s.skryty = 0 ORDER BY u.cas DESC LIMIT 20`).bind(od7),
    db.prepare(`SELECT s.*, r.zacatek AS r_zacatek, r.konec AS r_konec, r.nazev AS r_nazev, r.hra AS r_hra FROM rozvrh r JOIN streameri s ON s.id = r.user_id
      WHERE r.zacatek BETWEEN ? AND ? AND s.skryty = 0 ORDER BY r.zacatek LIMIT 40`).bind(ted - 3600e3, ted + 48 * 3600e3),
  ]);
  // Graf: po hodinách (maximum v hodině), ať je bodů rozumně.
  const hod = new Map();
  for (const b of scena.results) {
    const h = Math.floor(b.cas / 3600e3) * 3600e3;
    const p = hod.get(h);
    if (!p || b.divaci > p.divaci) hod.set(h, { cas: h, streamu: b.streamu, divaci: b.divaci });
  }
  return {
    graf: [...hod.values()].map((b) => ({ ...b, cas: new Date(b.cas).toISOString() })),
    tyden: {
      rust: rust.results.filter((r) => r.rust7 > 0).map((r) => ({ ...naStreamera(r, ted), hodnota: r.rust7 })),
      divaci: divaci.results.map((r) => ({ ...naStreamera(r, ted), hodnota: r.max7 })),
      hodiny: hodiny.results.map((r) => ({ ...naStreamera(r, ted), hodnota: Math.round((r.minut7 || 0) / 60) })),
      hry: hry.results.map((h) => ({ hra: h.hra, hodin: Math.round(h.minut / 60), streameru: h.streameru })),
    },
    milniky: udal.results.map((r) => ({ typ: r.u_typ, hodnota: r.u_hodnota, cas: new Date(r.u_cas).toISOString(), streamer: naStreamera(r, ted) })),
    kalendar: kal.results.map((r) => ({ zacatek: new Date(r.r_zacatek).toISOString(), konec: r.r_konec ? new Date(r.r_konec).toISOString() : null,
      nazev: r.r_nazev, hra: r.r_hra, streamer: naStreamera(r, ted) })),
  };
}
