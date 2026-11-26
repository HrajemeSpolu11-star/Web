// Aktualizace her srozumitelně: oficiální poznámky k aktualizacím ze Steamu (oznámení vývojářů) → česká AI shrnutí.
//  • Sběr (Cron obsahu „40“): 3 hry z nejhranějších na Steamu za běh, ISteamNews/GetNewsForApp jen kanál
//    steam_community_announcements = to, co píše sám vývojář. Uloží se jen zprávy, které vypadají jako aktualizace.
//  • Shrnutí (Cron psaní „7“): 1 aktualizace za hodinu. Řádek shrnutí s číslem, které v originále není, se zahodí.
import { zeptejSe } from "./ai.js";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS patche (gid TEXT PRIMARY KEY, appid TEXT NOT NULL, hra TEXT NOT NULL, nadpis TEXT NOT NULL, url TEXT NOT NULL,
     datum INTEGER NOT NULL, text TEXT, stav TEXT NOT NULL DEFAULT 'novy', shrnuti TEXT, model TEXT, ziskano INTEGER)`,
  `CREATE INDEX IF NOT EXISTS idx_patche_datum ON patche(datum DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_patche_stav ON patche(stav, datum DESC)`,
];
let hotovo = false;
async function schema(db) { if (hotovo) return; await db.batch(SCHEMA.map((s) => db.prepare(s))); hotovo = true; }

const HER_NA_BEH = 3;
const JE_AKTUALIZACE = /patch|update|hotfix|release notes|changelog|patch notes|season|balance|aktualizace|\bv?\d+\.\d+(\.\d+)?\b/i;
const NENI = /sale|discount|sleva|giveaway|merch|soundtrack|tournament|esports|livestream|stream/i;
const DEN = 86400e3;

// BBCode/HTML ze Steamu → čistý text.
function cistyText(t) {
  return String(t || "").replace(/\[\/?(h\d|b|i|u|list|olist|\*|p|url[^\]]*|img[^\]]*|previewyoutube[^\]]*|table|tr|td|th|hr|quote|code|spoiler|strike|c)\]/gi, "\n")
    .replace(/\[\*\]/g, "\n- ").replace(/<[^>]+>/g, " ").replace(/\{STEAM_CLAN_IMAGE\}[^\s]*/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

export async function sberPatchu(env, hry) {
  const db = env.DB;
  await schema(db);
  if (!hry?.length) return { her: 0, novych: 0 };
  // Rotace: pokaždé další 3 hry z žebříčku (ukazatel v tabulce nastaveni).
  const st = await db.prepare("SELECT hodnota FROM nastaveni WHERE klic = 'patche_index'").first().catch(() => null);
  const od = (parseInt(st?.hodnota || "0", 10) || 0) % hry.length;
  const vyber = Array.from({ length: Math.min(HER_NA_BEH, hry.length) }, (_, i) => hry[(od + i) % hry.length]);
  const odp = await Promise.allSettled(vyber.map((h) => fetch(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${encodeURIComponent(h.id)}&count=6&maxlength=0&feeds=steam_community_announcements`,
    { signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))));
  const ted = Date.now();
  const prikazy = [db.prepare("INSERT OR REPLACE INTO nastaveni (klic, hodnota, plati_do) VALUES ('patche_index', ?, 0)").bind(String((od + vyber.length) % hry.length))];
  vyber.forEach((h, i) => {
    if (odp[i].status !== "fulfilled") return;
    for (const n of odp[i].value?.appnews?.newsitems || []) {
      const datum = (Number(n.date) || 0) * 1000;
      if (ted - datum > 30 * DEN || !n.gid || !/^https:\/\//.test(n.url || "")) continue;
      if (!JE_AKTUALIZACE.test(n.title || "") || NENI.test(n.title || "")) continue;
      const text = cistyText(n.contents).slice(0, 9000);
      if (text.length < 200) continue;
      prikazy.push(db.prepare(`INSERT OR IGNORE INTO patche (gid, appid, hra, nadpis, url, datum, text, ziskano) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(String(n.gid).slice(0, 40), String(h.id), String(h.nazev).slice(0, 120), String(n.title).slice(0, 200), String(n.url).slice(0, 400), datum, text, ted));
    }
  });
  prikazy.push(db.prepare("DELETE FROM patche WHERE datum < ?").bind(ted - 120 * DEN));
  const v = await db.batch(prikazy);
  return { her: vyber.length, novych: v.slice(1, -1).reduce((a, r) => a + (r.meta?.changes || 0), 0) };
}

const cisla = (t) => (String(t).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(",", "."));

export async function shrnPatch(env) {
  const db = env.DB;
  await schema(db);
  const p = await db.prepare("SELECT * FROM patche WHERE stav = 'novy' AND datum > ? ORDER BY datum DESC LIMIT 1").bind(Date.now() - 14 * DEN).first();
  if (!p) return { stav: "nic nového" };
  let data, model;
  try {
    ({ data, model } = await zeptejSe(env, [
      { role: "system", content: "Jsi český herní redaktor. Shrnuješ oficiální poznámky k aktualizacím her srozumitelně pro hráče. Odpovídáš jen JSON." },
      { role: "user", content: `Shrň česky tuto oficiální aktualizaci hry „${p.hra}“.
- "shrnuti": 1–2 věty, co aktualizace přináší (max 240 znaků).
- "zmeny": 3–8 nejdůležitějších změn, každá jedna krátká věta (max 140 znaků). Názvy předmětů, postav a režimů nepřekládej.
- Použij JEN to, co je v textu. Nic nedomýšlej, nehodnoť, nepřidávej čísla, která v textu nejsou.
Vrať JSON: {"shrnuti":"...","zmeny":["..."]}

NADPIS: ${p.nadpis}
TEXT:
${String(p.text || "").slice(0, 7000)}` },
    ]));
  } catch (e) {
    await db.prepare("UPDATE patche SET stav = 'chyba' WHERE gid = ?").bind(p.gid).run();
    throw e;
  }
  const zdroj = new Set(cisla(`${p.nadpis} ${p.text}`));
  const ok = (t) => !cisla(t).some((c) => !zdroj.has(c));
  const shrnuti = String(data?.shrnuti || "").replace(/\s+/g, " ").trim().slice(0, 300);
  const zmeny = (Array.isArray(data?.zmeny) ? data.zmeny : []).map((z) => String(z || "").replace(/\s+/g, " ").trim().slice(0, 180))
    .filter((z) => z.length >= 8 && ok(z)).slice(0, 8);
  if (shrnuti.length < 20 || !ok(shrnuti) || zmeny.length < 2) {
    await db.prepare("UPDATE patche SET stav = 'chyba' WHERE gid = ?").bind(p.gid).run();
    return { stav: "shrnutí neprošlo kontrolou", hra: p.hra };
  }
  await db.prepare("UPDATE patche SET stav = 'hotovo', shrnuti = ?, model = ?, text = NULL WHERE gid = ?")
    .bind(JSON.stringify({ shrnuti, zmeny }), model, p.gid).run();
  return { hra: p.hra, nadpis: p.nadpis };
}

// /api/aktualizace – hotová shrnutí (nejnovější první) + seznam her.
export async function apiAktualizace(env) {
  const db = env.DB;
  await schema(db);
  const { results } = await db.prepare("SELECT gid, appid, hra, nadpis, url, datum, shrnuti FROM patche WHERE stav = 'hotovo' ORDER BY datum DESC LIMIT 40").all();
  return {
    polozky: results.map((r) => {
      let s = {};
      try { s = JSON.parse(r.shrnuti || "{}"); } catch { /* nic */ }
      return { id: r.gid, steam_id: r.appid, hra: r.hra, nadpis: r.nadpis, url: r.url, datum: new Date(r.datum).toISOString(), shrnuti: s.shrnuti || "", zmeny: s.zmeny || [] };
    }),
  };
}
