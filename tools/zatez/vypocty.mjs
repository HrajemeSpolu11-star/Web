// Stres test výpočtů: JS CPU (bez času v databázi), počet dotazů a dotazy, které procházejí celou velkou tabulku (SCAN).
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, readdirSync } from "node:fs";
globalThis.HTMLRewriter = class {};
const dir = "/tmp/zatez/web/.wrangler/state/v3/d1/" + readdirSync("/tmp/zatez/web/.wrangler/state/v3/d1/")[0] + "/";
const soubor = readdirSync(dir).find((f) => f.endsWith(".sqlite") && !f.startsWith("metadata"));
copyFileSync(dir + soubor, "/tmp/zatez/kopie.sqlite");
const sq = new DatabaseSync("/tmp/zatez/kopie.sqlite");
const VELKE = { snimky: 0, hry_den: 0, ceny_historie: 0, scena: 0, clanky: 0, patche: 0, streameri: 0, steam_hry: 0, hry_streamera: 0 };
for (const t of Object.keys(VELKE)) VELKE[t] = sq.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
let stat;
const reset = () => { stat = { db: 0, dotazu: 0, radku: 0, scany: [], odhadCteni: 0, zapisu: 0 }; };
reset();
function plan(sql, p) { const t0 = performance.now(); try { plan2(sql, p); } finally { stat.db += performance.now() - t0; } }
function plan2(sql, p) {
  if (!/^\s*(SELECT|WITH)/i.test(sql)) return;
  const alias = {};
  for (const m of sql.matchAll(/(?:FROM|JOIN)\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?/gi)) { alias[m[1]] = m[1]; if (m[2] && !/^(WHERE|JOIN|LEFT|ON|GROUP|ORDER|LIMIT|INNER)$/i.test(m[2])) alias[m[2]] = m[1]; }
  try {
    for (const r of sq.prepare("EXPLAIN QUERY PLAN " + sql).all(...p)) {
      const m = /^SCAN (\w+)/.exec(r.detail);
      if (!m) continue;
      const t = alias[m[1]] || m[1];
      if (!(VELKE[t] > 5000)) continue;
      const pres = /USING (COVERING )?INDEX (\w+)/.exec(r.detail);
      stat.scany.push(`SCAN ${t}${pres ? ` (celý index ${pres[2]})` : ""} – ${VELKE[t].toLocaleString("cs")} ř.: ${sql.replace(/\s+/g, " ").slice(0, 100)}`);
      stat.odhadCteni += VELKE[t];
    }
  } catch {}
}
const cas = (f) => { const t = performance.now(); const r = f(); stat.db += performance.now() - t; stat.dotazu++; return r; };
class St { constructor(sql) { this.sql = sql; this.p = []; } bind(...a) { this.p = a.map((x) => (typeof x === "boolean" ? Number(x) : x)); return this; }
  async all() { plan(this.sql, this.p); const r = cas(() => sq.prepare(this.sql).all(...this.p)); stat.radku += r.length; return { results: r, meta: {} }; }
  async first(c) { plan(this.sql, this.p); const r = cas(() => sq.prepare(this.sql).get(...this.p)) ?? null; return c ? r?.[c] ?? null : r; }
  async run() { const r = cas(() => sq.prepare(this.sql).run(...this.p)); stat.zapisu += Number(r.changes); return { meta: { changes: Number(r.changes) } }; } }
const DB = { prepare: (s) => new St(s), batch: async (l) => { const o = []; for (const x of l) o.push(/^\s*(SELECT|PRAGMA|WITH)/i.test(x.sql) ? await x.all() : await x.run()); return o; } };
const env = { DB, TWITCH_CLIENT_ID: "x" };
async function mer(nazev, f, opak = 1) {
  const vys = [];
  for (let i = 0; i < opak; i++) {
    reset();
    const t = performance.now(); const c0 = process.cpuUsage();
    let chyba = null;
    try { await f(); } catch (e) { chyba = String(e.message || e).slice(0, 120); }
    const wall = performance.now() - t;
    vys.push({ wall, js: wall - stat.db, ...stat, chyba });
  }
  const p = vys[vys.length - 1];
  console.log(`\n■ ${nazev}${p.chyba ? `  CHYBA: ${p.chyba}` : ""}\n  JS (bez DB): ${p.js.toFixed(1)} ms | DB: ${p.db.toFixed(0)} ms | dotazů: ${p.dotazu} | vráceno řádků: ${p.radku} | zapsáno řádků: ${p.zapisu} | odhad přečtených řádků: ${p.odhadCteni.toLocaleString("cs")}`);
  for (const s of [...new Set(p.scany)]) console.log("   · " + s);
  return p;
}
console.log("Objem:", JSON.stringify(VELKE));
const { sestavHitparadu, apiHitparada, poziceStreamera } = await import("/tmp/zatez/web/src/hitparada.js");
const { sestavAnalytiku } = await import("/tmp/zatez/web/src/analytika.js");
const { sestavTrendy } = await import("/tmp/zatez/web/src/trendy.js");
const { apiZprava } = await import("/tmp/zatez/web/src/zprava.js");
const { apiReport } = await import("/tmp/zatez/web/src/statistiky.js");
const { kontrolaSledovanych, apiMojeHry, sledovat } = await import("/tmp/zatez/web/src/sledovani.js");
const { hryVTextu } = await import("/tmp/zatez/web/src/propojeni.js");
const ted = Date.now();
await mer("Hitparáda – první běh (doplní 3 týdny)", () => sestavHitparadu(env, ted));
for (let i = 0; i < 30; i++) await sestavHitparadu(env, ted); // dokončit zpětné doplnění (52 týdnů)
await mer("Hitparáda – běžný běh (každé 3 h)", () => sestavHitparadu(env, ted), 2);
await mer("API hitparáda", () => apiHitparada(env, ""));
await mer("Pozice streamera (profil)", () => poziceStreamera(DB, "twitch", "stream5"));
await mer("Analytika", () => sestavAnalytiku(DB, ted));
await mer("Trendy – první běh dne", () => sestavTrendy(env)); await mer("Trendy – další běh téhož dne", () => sestavTrendy(env));
await mer("Měsíční zpráva – rozběhnutý měsíc", () => apiZprava(env, ""));
await mer("Měsíční zpráva – listopad", () => apiZprava(env, "2026-11"));
await mer("Týden na scéně (report)", () => apiReport(env, (r) => r, ""));
// sledování: 2000 odběrů × 5 her
for (let i = 1; i <= 2000; i++) sq.prepare("INSERT OR IGNORE INTO push_odbery (id, endpoint) VALUES (?, ?)").run(`o${i}`, `https://fcm.googleapis.com/x${i}`);
await (async () => { const { zajistiSchemaSledovani } = await import("/tmp/zatez/web/src/sledovani.js"); await zajistiSchemaSledovani(DB); })();
sq.exec("CREATE TABLE IF NOT EXISTS igdb_detail (slug TEXT PRIMARY KEY, data TEXT NOT NULL, cas INTEGER NOT NULL)");
for (let i = 0; i < 300; i++) sq.prepare("INSERT OR REPLACE INTO igdb_detail VALUES (?, ?, 1)").run(`hra-${i}`, JSON.stringify({ nazev: `Hra ${i}`, steam_id: String(10 + i), vydano: "2026-11-27", obal: "https://x" }));
for (let o = 1; o <= 2000; o++) for (let k = 0; k < 5; k++) { const i = (o * 7 + k * 13) % 300; sq.prepare("INSERT OR IGNORE INTO sledovani (odber_id, slug, nazev, steam_id, cas) VALUES (?,?,?,?,?)").run(`o${o}`, `hra-${i}`, `Hra ${i}`, String(10 + i), ted); }
sq.exec("INSERT OR IGNORE INTO sledovani_hry (slug, posledni) SELECT DISTINCT slug, " + (ted - 3 * 864e5) + " FROM sledovani");
sq.exec("DELETE FROM nastaveni WHERE klic = 'sledovani_beh'");
await mer("Kontrola sledovaných her (2000 odběrů, 300 her)", () => kontrolaSledovanych(env));
await mer("Kontrola sledovaných her – další hodina", () => kontrolaSledovanych(env));
await mer("Moje hry (40 her)", () => apiMojeHry(env, Array.from({ length: 40 }, (_, i) => `hra-${i}`).join(",")));
sq.exec("UPDATE hry SET igdb_slug = slug");
await mer("Hry v článku (první – sestaví seznam názvů)", () => hryVTextu(DB, "Novinka o Counter-Strike 2 a Hra 15 dnes"));
await mer("Hry v článku (další)", () => hryVTextu(DB, "Velká aktualizace pro Minecraft a Rust"));
