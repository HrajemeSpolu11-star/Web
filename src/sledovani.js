// „Sledovat hru“: bez účtu. Seznam sledovaných her má návštěvník v prohlížeči; pro upozornění se k jeho push odběru
// uloží jen ID hry (slug z databáze her). Každou hodinu se pro sledované hry zjistí novinky a zařadí se push zprávy:
//   • nová aktualizace (oficiální oznámení na Steamu),
//   • začala sleva na Steamu,
//   • hra dnes vychází (datum z IGDB),
//   • nová zpráva o hře (název hry v nadpisu zprávy z RSS nebo článku webu).
// Zprávy odešle stávající fronta (odesliFrontu v běhu Twitche). Nejvýš 3 zprávy na odběr a 100 událostí za běh.
import { zajistiSchemaPush } from "./push.js";
import { zajistiSchemaPatchu } from "./patche.js";
import { zajistiSchemaHlidac } from "./hlidac.js";
import { denPraha } from "./psani.js";

export const MAX_SLEDOVANYCH = 100;
const okSlug = (s) => /^[a-z0-9][a-z0-9-]{0,99}$/.test(String(s || ""));
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sledovani (odber_id TEXT NOT NULL, slug TEXT NOT NULL, nazev TEXT, steam_id TEXT, cas INTEGER, PRIMARY KEY (odber_id, slug))`,
  `CREATE INDEX IF NOT EXISTS idx_sledovani_slug ON sledovani(slug)`,
  // Stav kontroly pro každou sledovanou hru (ať se stejná událost neposílá dvakrát).
  `CREATE TABLE IF NOT EXISTS sledovani_hry (slug TEXT PRIMARY KEY, posledni INTEGER, sleva INTEGER DEFAULT 0, vydani_ozn TEXT)`,
];
let hotovo = false;
export async function zajistiSchemaSledovani(db) { if (hotovo) return; await db.batch(SCHEMA.map((s) => db.prepare(s))); hotovo = true; }

export async function sledovat(db, odberId, b) {
  await zajistiSchemaSledovani(db);
  const slug = String(b.slug || "");
  if (!okSlug(slug)) return { chyba: "Neplatná hra", status: 400 };
  const steam = /^\d{1,10}$/.test(String(b.steam_id || "")) ? String(b.steam_id) : null;
  // Limit 100 her se hlídá v jednom příkazu (kontrola + zápis atomicky) – při souběžných požadavcích ho nejde přetéct
  // (zátěžový test 2026-11-27: dřív 120 souběžných kliknutí = 121 her).
  const ted = Date.now();
  const [vlozeno, aktualizovano] = await db.batch([
    db.prepare(`INSERT INTO sledovani (odber_id, slug, nazev, steam_id, cas) SELECT ?1, ?2, ?3, ?4, ?5
      WHERE NOT EXISTS (SELECT 1 FROM sledovani WHERE odber_id = ?1 AND slug = ?2)
        AND (SELECT COUNT(*) FROM sledovani WHERE odber_id = ?1) < ?6`).bind(odberId, slug, String(b.nazev || "").slice(0, 160), steam, ted, MAX_SLEDOVANYCH),
    db.prepare("UPDATE sledovani SET nazev = ?3, steam_id = COALESCE(?4, steam_id) WHERE odber_id = ?1 AND slug = ?2")
      .bind(odberId, slug, String(b.nazev || "").slice(0, 160), steam),
  ]);
  if (!vlozeno.meta?.changes && !aktualizovano.meta?.changes) return { chyba: `Sledovat můžeš nejvýš ${MAX_SLEDOVANYCH} her.`, status: 400 };
  await db.prepare("INSERT OR IGNORE INTO sledovani_hry (slug, posledni) VALUES (?, ?)").bind(slug, ted).run();
  return { ok: true };
}
export async function nesledovat(db, odberId, b) {
  await zajistiSchemaSledovani(db);
  await db.prepare("DELETE FROM sledovani WHERE odber_id = ? AND slug = ?").bind(odberId, String(b.slug || "")).run();
  return { ok: true };
}

const reNazvu = (n) => new RegExp(`(^|[^\\p{L}\\p{N}])${String(n || "").replace(/[™®©]/g, "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu");

export async function kontrolaSledovanych(env) {
  const db = env.DB, ted = Date.now();
  await zajistiSchemaSledovani(db); await zajistiSchemaPush(db); await zajistiSchemaPatchu(db); await zajistiSchemaHlidac(db);
  const { results: hry } = await db.prepare(`SELECT s.slug, MAX(s.nazev) AS nazev, MAX(s.steam_id) AS steam_id, h.posledni, h.sleva, h.vydani_ozn
    FROM sledovani s LEFT JOIN sledovani_hry h ON h.slug = s.slug GROUP BY s.slug LIMIT 400`).all();
  if (!hry.length) return { her: 0, zprav: 0 };
  // Čas minulé kontroly je jeden společný řádek (šetří zápisy); řádek hry se zapisuje jen při změně slevy nebo dni vydání.
  const beh = Number((await db.prepare("SELECT hodnota FROM nastaveni WHERE klic = 'sledovani_beh'").first().catch(() => null))?.hodnota) || ted - 3600e3;
  for (const h of hry) h.posledni = Math.max(h.posledni || 0, beh);
  const od = Math.min(...hry.map((h) => h.posledni));
  const steamIds = [...new Set(hry.map((h) => h.steam_id).filter(Boolean))];
  const ph = (n) => Array(n).fill("?").join(",");
  const dotazy = [
    db.prepare("SELECT id, nadpis, url, datum FROM clanky WHERE datum > ? ORDER BY datum DESC LIMIT 300").bind(od),
    db.prepare(`SELECT slug, data FROM igdb_detail WHERE slug IN (${ph(Math.min(hry.length, 90))})`).bind(...hry.slice(0, 90).map((h) => h.slug)),
  ];
  if (steamIds.length) {
    const ids = steamIds.slice(0, 90);
    dotazy.push(db.prepare(`SELECT appid, nadpis, url, datum FROM patche WHERE appid IN (${ph(ids.length)}) AND datum > ? ORDER BY datum DESC`).bind(...ids, od));
    dotazy.push(db.prepare(`SELECT id, cena, sleva, mena FROM steam_hry WHERE id IN (${ph(ids.length)})`).bind(...ids));
  }
  const [cl, det, pa, sh] = await db.batch(dotazy).catch(() => [{ results: [] }, { results: [] }, { results: [] }, { results: [] }]);
  const vydano = new Map();
  for (const r of det?.results || []) { try { const d = JSON.parse(r.data); if (d?.vydano) vydano.set(r.slug, d.vydano); } catch { /* nic */ } }
  const ceny = new Map((sh?.results || []).map((r) => [String(r.id), r]));
  const dnes = denPraha(ted);
  const udalosti = new Map(); // slug → [{titulek, text, url}]
  const pridej = (slug, u) => { if (!udalosti.has(slug)) udalosti.set(slug, []); udalosti.get(slug).push(u); };
  const zmeny = [];
  // Předpřipravené vyhledávání (jinak hry × oznámení × zprávy = statisíce porovnání při velké dávce).
  const patchePodleHry = new Map();
  for (const p of pa?.results || []) if (!patchePodleHry.has(String(p.appid))) patchePodleHry.set(String(p.appid), p); // nejnovější první
  const zpravy = (cl?.results || []).map((x) => ({ ...x, mala: String(x.nadpis || "").toLowerCase() }));
  for (const h of hry) {
    const posl = h.posledni || ted - 3600e3, nazev = h.nazev || h.slug, url = `/databaze/${h.slug}`;
    const p = patchePodleHry.get(String(h.steam_id));
    if (p && p.datum > posl) pridej(h.slug, { titulek: `${nazev}: nová aktualizace`, text: String(p.nadpis || "").slice(0, 140), url });
    const c = ceny.get(String(h.steam_id || ""));
    const sleva = Number(c?.sleva) || 0;
    if (c && sleva > 0 && !(h.sleva > 0)) pridej(h.slug, { titulek: `${nazev} je ve slevě −${sleva} %`, text: `Na Steamu teď za ${Number(c.cena)} ${c.mena === "EUR" ? "€" : "Kč"}.`, url });
    const v = vydano.get(h.slug);
    if (v && new Date(v).toISOString().slice(0, 10) === dnes && h.vydani_ozn !== dnes) pridej(h.slug, { titulek: `${nazev} dnes vychází`, text: "Hra, kterou sleduješ, právě vychází.", url });
    if (String(nazev).length >= 4 && zpravy.length) {
      const mn = String(nazev).replace(/[™®©]/g, "").trim().toLowerCase();
      const kandidati = zpravy.filter((x) => Number(x.datum) > posl && x.mala.includes(mn));
      const re = kandidati.length ? reNazvu(nazev) : null;
      const z = kandidati.find((x) => re.test(x.nadpis || ""));
      if (z) pridej(h.slug, { titulek: `Novinka: ${nazev}`, text: String(z.nadpis).slice(0, 140), url: `/clanek/${z.id}` });
    }
    const novaSleva = c ? sleva : (h.sleva || 0), vydaniDnes = v && new Date(v).toISOString().slice(0, 10) === dnes && h.vydani_ozn !== dnes;
    if (novaSleva !== (h.sleva || 0) || vydaniDnes)
      zmeny.push(db.prepare(`INSERT INTO sledovani_hry (slug, posledni, sleva, vydani_ozn) VALUES (?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET sleva = excluded.sleva, vydani_ozn = COALESCE(excluded.vydani_ozn, sledovani_hry.vydani_ozn)`)
        .bind(h.slug, ted, novaSleva, vydaniDnes ? dnes : null));
  }
  zmeny.push(db.prepare("INSERT OR REPLACE INTO nastaveni (klic, hodnota, plati_do) VALUES ('sledovani_beh', ?, NULL)").bind(String(ted)));
  // Zprávy pro odběratele: jeden příkaz INSERT … SELECT na událost (rozeslání dělá databáze, ne JavaScript – i při velké
  // slevové akci s tisíci odběry zůstane CPU pod limitem). Nejvýš 3 zprávy na odběr za běh, nejvýš 100 událostí za běh.
  let zprav = 0;
  const vsechny = [...udalosti.entries()].flatMap(([slug, l]) => l.map((u) => ({ slug, ...u }))).slice(0, 100);
  const rozeslat = vsechny.map((u) => db.prepare(`INSERT INTO push_zpravy (odber_id, titulek, text, url, cas)
      SELECT s.odber_id, ?, ?, ?, ? FROM sledovani s WHERE s.slug = ?
        AND (SELECT COUNT(*) FROM push_zpravy z WHERE z.odber_id = s.odber_id AND z.cas = ?) < 3`)
    .bind(u.titulek.slice(0, 120), u.text.slice(0, 200), u.url, ted, u.slug, ted));
  // Nejdřív zprávy, pak stav (čas kontroly) – kdyby rozeslání selhalo, události se zkusí znovu za hodinu.
  for (let i = 0; i < rozeslat.length; i += 25) {
    const v = await db.batch(rozeslat.slice(i, i + 25));
    zprav += v.reduce((a, r) => a + (r.meta?.changes || 0), 0);
  }
  for (let i = 0; i < zmeny.length; i += 100) await db.batch(zmeny.slice(i, i + 100));
  return { her: hry.length, udalosti: vsechny.length, zprav };
}

// „Moje hry“ na Domů: stav sledovaných her (jen z uložených dat, žádné externí požadavky).
export async function apiMojeHry(env, slugyText) {
  const db = env.DB;
  const slugy = [...new Set(String(slugyText || "").split(",").filter(okSlug))].slice(0, 40);
  if (!slugy.length) return { hry: [] };
  await zajistiSchemaPatchu(db); await zajistiSchemaHlidac(db);
  const ph = slugy.map(() => "?").join(",");
  const [det, st] = await db.batch([
    db.prepare(`SELECT slug, data FROM igdb_detail WHERE slug IN (${ph})`).bind(...slugy),
    db.prepare(`SELECT id, igdb_slug, cena, puvodni, sleva, mena, zdarma FROM steam_hry WHERE igdb_slug IN (${ph})`).bind(...slugy),
  ]).catch(() => [{ results: [] }, { results: [] }]);
  const mapa = new Map();
  for (const r of det.results) { try { const d = JSON.parse(r.data); if (!d.nenalezeno) mapa.set(r.slug, d); } catch { /* nic */ } }
  const steam = new Map(st.results.map((r) => [r.igdb_slug, r]));
  const ted = Date.now();
  const ids = [...new Set([...mapa.values()].map((d) => d.steam_id).concat(st.results.map((r) => r.id)).filter(Boolean))].slice(0, 80);
  const nazvy = [...mapa.values()].map((d) => d.nazev).filter(Boolean).slice(0, 80);
  const [pa, zi] = await db.batch([
    ids.length ? db.prepare(`SELECT appid, nadpis, datum FROM patche WHERE appid IN (${ids.map(() => "?").join(",")}) AND datum > ? ORDER BY datum DESC`).bind(...ids, ted - 14 * 86400e3)
      : db.prepare("SELECT 1 WHERE 0"),
    nazvy.length ? db.prepare(`SELECT zive_hra AS hra, COUNT(*) AS n FROM streameri WHERE skryty = 0 AND zive_cas > ? AND zive_hra IN (${nazvy.map(() => "?").join(",")}) GROUP BY zive_hra`).bind(ted - 30 * 60e3, ...nazvy)
      : db.prepare("SELECT 1 WHERE 0"),
  ]).catch(() => [{ results: [] }, { results: [] }]);
  const zive = new Map(zi.results.map((r) => [r.hra, r.n]));
  return { hry: slugy.map((slug) => {
    const d = mapa.get(slug), s = steam.get(slug) || null;
    const sid = d?.steam_id || s?.id || null;
    const p = (pa.results || []).find((x) => String(x.appid) === String(sid));
    return { slug, nazev: d?.nazev || null, obal: d?.obal || "", vydano: d?.vydano || null,
      steam: s ? { cena: s.cena, puvodni: s.puvodni, sleva: s.sleva || 0, mena: s.mena || "CZK", zdarma: !!s.zdarma } : null,
      patch: p ? { nadpis: p.nadpis, datum: new Date(p.datum).toISOString() } : null, zive: zive.get(d?.nazev) || 0 };
  }) };
}
