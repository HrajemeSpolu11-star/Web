// Databáze her ze Steamu (čeština + ceny), historie cen a hlídač cen s push upozorněním.
//  • steam_hry: hry z katalogu, z vyhledávání a hlídané hry. Čeština z appdetails (pole supported_languages),
//    ceny v Kč z price_overview (až 100 her jedním požadavkem).
//  • ceny_historie: nejnižší cena za každý den → „nejnižší cena za 90 dní“.
//  • hlidani: kdo (push odběr) hlídá kterou hru a za jakou cenu.
// Běží v Cronu "40 * * * *" (spolu s videi a klipy): max 3 požadavky na ceny + 12 na jazyky.
import { normNazev } from "./hra-data.js";
import { denPraha } from "./psani.js";
import { zajistiSchemaPush } from "./push.js";

const UA = "HerniPulsBot/0.1 (+https://github.com/HrajemeSpolu11-star/Web)";
const JAZYKU_NA_BEH = 12;
const CEN_POZADAVKU = 3; // × 100 her
export const MAX_HLIDANYCH = 50;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS steam_hry (id TEXT PRIMARY KEY, nazev TEXT NOT NULL, norm TEXT NOT NULL, obrazek TEXT,
     cestina INTEGER, cena REAL, puvodni REAL, sleva INTEGER DEFAULT 0, mena TEXT, zdarma INTEGER DEFAULT 0, vychazi INTEGER DEFAULT 0,
     kladne INTEGER, recenzi INTEGER, jazyky_cas INTEGER, cena_cas INTEGER, pridano INTEGER)`,
  `CREATE INDEX IF NOT EXISTS idx_steam_hry_norm ON steam_hry(norm)`,
  `CREATE INDEX IF NOT EXISTS idx_steam_hry_cestina ON steam_hry(cestina, sleva)`,
  `CREATE TABLE IF NOT EXISTS ceny_historie (id TEXT NOT NULL, den TEXT NOT NULL, cena REAL NOT NULL, sleva INTEGER, PRIMARY KEY (id, den))`,
  `CREATE TABLE IF NOT EXISTS hlidani (odber_id TEXT NOT NULL, steam_id TEXT NOT NULL, nazev TEXT, cil REAL,
     upozorneno REAL, cas INTEGER, PRIMARY KEY (odber_id, steam_id))`,
  `CREATE INDEX IF NOT EXISTS idx_hlidani_hra ON hlidani(steam_id)`,
];
let schemaHotova = false;
export async function zajistiSchemaHlidac(db) {
  if (schemaHotova) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  schemaHotova = true;
}

const https = (u) => /^https:\/\//.test(String(u || "")) ? String(u) : "";
const steamId = (s) => /^\d{1,10}$/.test(String(s || "")) ? String(s) : "";

async function json(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${new URL(url).hostname}`);
  return r.json();
}

// 0 = bez češtiny, 1 = titulky/rozhraní, 2 = i dabing (Steam značí plný zvuk <strong>*</strong>).
export function urovenCestiny(jazyky) {
  const m = /(čeština|czech)(\s*<strong>\*<\/strong>)?/i.exec(String(jazyky || ""));
  return m ? (m[2] ? 2 : 1) : 0;
}

// Uloží hry (z katalogu nebo hledání). Zapisuje jen, když se něco změnilo.
export function prikazyUlozHry(db, hry, ted) {
  const st = db.prepare(`INSERT INTO steam_hry (id, nazev, norm, obrazek, cena, puvodni, sleva, mena, kladne, recenzi, cena_cas, pridano)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET cena = COALESCE(excluded.cena, steam_hry.cena), puvodni = COALESCE(excluded.puvodni, steam_hry.puvodni),
      sleva = excluded.sleva, obrazek = COALESCE(excluded.obrazek, steam_hry.obrazek),
      kladne = COALESCE(excluded.kladne, steam_hry.kladne), recenzi = COALESCE(excluded.recenzi, steam_hry.recenzi)
    WHERE steam_hry.cena IS NOT excluded.cena OR steam_hry.sleva IS NOT excluded.sleva
      OR (excluded.kladne IS NOT NULL AND steam_hry.kladne IS NOT excluded.kladne)`);
  return hry.filter((h) => steamId(h.id) && h.nazev).map((h) => st.bind(String(h.id), h.nazev.slice(0, 160), normNazev(h.nazev),
    https(h.obrazek) || null, h.cena ?? null, h.puvodni ?? null, h.sleva || 0, h.mena || "CZK",
    h.hodnoceni?.kladne ?? null, h.hodnoceni?.recenzi ?? null, h.cena != null ? ted : null, ted));
}

// Jazyky (čeština) pro hry, které je ještě nemají nebo je mají starší než 30 dní. Hlídané hry první.
async function sberJazyku(db, ted, limit = JAZYKU_NA_BEH) {
  const { results } = await db.prepare(`SELECT g.id FROM steam_hry g LEFT JOIN (SELECT DISTINCT steam_id FROM hlidani) h ON h.steam_id = g.id
    WHERE g.jazyky_cas IS NULL OR g.jazyky_cas < ? ORDER BY (h.steam_id IS NULL), (g.jazyky_cas IS NOT NULL), g.pridano DESC LIMIT ?`)
    .bind(ted - 30 * 86400e3, limit).all();
  const odp = await Promise.allSettled(results.map((r) => json(`https://store.steampowered.com/api/appdetails?appids=${r.id}&cc=cz&l=czech`)));
  const prikazy = [];
  results.forEach((r, i) => {
    const o = odp[i];
    if (o.status !== "fulfilled") return;
    const d = o.value?.[r.id]?.success ? o.value[r.id].data : null;
    if (!d) { prikazy.push(db.prepare("UPDATE steam_hry SET jazyky_cas = ? WHERE id = ?").bind(ted, r.id)); return; }
    const p = d.price_overview;
    prikazy.push(db.prepare(`UPDATE steam_hry SET cestina = ?, zdarma = ?, vychazi = ?, obrazek = COALESCE(?, obrazek),
        cena = COALESCE(?, cena), puvodni = COALESCE(?, puvodni), sleva = COALESCE(?, sleva), jazyky_cas = ? WHERE id = ?`)
      .bind(urovenCestiny(d.supported_languages), d.is_free ? 1 : 0, d.release_date?.coming_soon ? 1 : 0, https(d.header_image) || null,
        p ? p.final / 100 : null, p ? p.initial / 100 : null, p ? p.discount_percent || 0 : null, ted, r.id));
  });
  if (prikazy.length) await db.batch(prikazy);
  return prikazy.length;
}

// Aktuální ceny: hlídané hry vždy, ostatní nejdéle nekontrolované. 100 her = 1 požadavek (filters=price_overview).
async function sberCen(env, db, ted) {
  const { results } = await db.prepare(`SELECT g.id, g.nazev, g.cena, g.sleva FROM steam_hry g
    LEFT JOIN (SELECT DISTINCT steam_id FROM hlidani) h ON h.steam_id = g.id
    WHERE h.steam_id IS NOT NULL OR g.cena_cas IS NULL OR g.cena_cas < ?
    ORDER BY (h.steam_id IS NULL), COALESCE(g.cena_cas, 0) LIMIT ?`).bind(ted - 6 * 3600e3, CEN_POZADAVKU * 100).all();
  if (!results.length) return 0;
  const den = denPraha(ted);
  const prikazy = [];
  for (let i = 0; i < results.length; i += 100) {
    const davka = results.slice(i, i + 100);
    let d;
    try { d = await json(`https://store.steampowered.com/api/appdetails?appids=${davka.map((r) => r.id).join(",")}&cc=cz&filters=price_overview`); }
    catch (e) { console.warn("ceny:", e.message); continue; }
    for (const r of davka) {
      const x = d?.[r.id];
      if (!x?.success) continue;
      // Bez price_overview je hra buď zdarma (to víme z jazyků/appdetails), nebo se zatím neprodává → cena neznámá.
      const p = Array.isArray(x.data) ? null : x.data?.price_overview;
      if (p) prikazy.push(db.prepare("UPDATE steam_hry SET cena = ?, puvodni = ?, sleva = ?, cena_cas = ? WHERE id = ?")
        .bind(p.final / 100, p.initial / 100, p.discount_percent || 0, ted, r.id));
      else prikazy.push(db.prepare("UPDATE steam_hry SET cena = CASE WHEN zdarma = 1 THEN 0 ELSE NULL END, puvodni = NULL, sleva = 0, cena_cas = ? WHERE id = ?").bind(ted, r.id));
      const cena = p ? p.final / 100 : 0, sleva = p ? p.discount_percent || 0 : 0;
      if (p) prikazy.push(db.prepare(`INSERT INTO ceny_historie (id, den, cena, sleva) VALUES (?, ?, ?, ?)
          ON CONFLICT(id, den) DO UPDATE SET cena = MIN(ceny_historie.cena, excluded.cena), sleva = MAX(ceny_historie.sleva, excluded.sleva)
          WHERE excluded.cena < ceny_historie.cena`).bind(r.id, den, cena, sleva));
    }
  }
  prikazy.push(db.prepare("DELETE FROM ceny_historie WHERE den < ?").bind(new Date(ted - 400 * 86400e3).toISOString().slice(0, 10)));
  await db.batch(prikazy);
  return results.length;
}

// Porovná hlídané hry s aktuální cenou a zařadí push upozornění (odešle je odesliFrontu() v běhu Twitche).
async function upozorniNaCeny(db, ted) {
  const { results } = await db.prepare(`SELECT h.odber_id, h.steam_id, h.cil, h.upozorneno, g.nazev, g.cena, g.puvodni, g.sleva, g.zdarma
    FROM hlidani h JOIN steam_hry g ON g.id = h.steam_id WHERE g.cena IS NOT NULL`).all();
  const prikazy = [];
  for (const r of results) {
    const splneno = r.cil != null ? r.cena <= r.cil : r.sleva > 0 || (r.zdarma && r.cena === 0 && r.puvodni > 0);
    if (splneno && (r.upozorneno == null || r.cena < r.upozorneno)) {
      const cena = (c) => (c === 0 ? "zdarma" : `${Number(c).toLocaleString("cs-CZ")} Kč`);
      const titulek = r.cena === 0 ? `${r.nazev} je zdarma!` : r.sleva > 0 ? `${r.nazev} je ve slevě −${r.sleva} %` : `${r.nazev} je pod tvou cenou`;
      const text = `Teď ${cena(r.cena)}${r.puvodni > r.cena ? ` (běžně ${cena(r.puvodni)})` : ""} na Steamu.`;
      prikazy.push(db.prepare("INSERT INTO push_zpravy (odber_id, titulek, text, url, cas) VALUES (?, ?, ?, ?, ?)")
        .bind(r.odber_id, titulek.slice(0, 120), text, "/hlidac", ted));
      prikazy.push(db.prepare("UPDATE hlidani SET upozorneno = ? WHERE odber_id = ? AND steam_id = ?").bind(r.cena, r.odber_id, r.steam_id));
    } else if (!splneno && r.upozorneno != null) {
      // Sleva skončila → při další slevě znovu upozorníme.
      prikazy.push(db.prepare("UPDATE hlidani SET upozorneno = NULL WHERE odber_id = ? AND steam_id = ?").bind(r.odber_id, r.steam_id));
    }
  }
  if (prikazy.length) await db.batch(prikazy);
  return prikazy.length;
}

export async function sberHlidace(env) {
  const db = env.DB;
  await zajistiSchemaHlidac(db);
  await zajistiSchemaPush(db);
  const ted = Date.now();
  const ceny = await sberCen(env, db, ted).catch((e) => `chyba: ${e.message}`);
  const jazyky = await sberJazyku(db, ted).catch((e) => `chyba: ${e.message}`);
  const upozorneni = await upozorniNaCeny(db, ted).catch((e) => `chyba: ${e.message}`);
  return { ceny, jazyky, upozorneni };
}

// ---------- API ----------
const naHru = (r) => ({
  id: r.id, nazev: r.nazev, url: `https://store.steampowered.com/app/${r.id}/`, obrazek: https(r.obrazek), obchod: "steam",
  cestina: r.cestina, cena: r.cena, puvodni: r.puvodni, sleva: r.sleva || 0, mena: r.mena || "CZK", vychazi: !!r.vychazi,
  hodnoceni: r.kladne != null ? { kladne: r.kladne, recenzi: r.recenzi } : undefined,
  min90: r.min90 ?? null, cena_cas: r.cena_cas ? new Date(r.cena_cas).toISOString() : null,
});
const SLOUPCE = `g.*, (SELECT MIN(c.cena) FROM ceny_historie c WHERE c.id = g.id AND c.den >= ?) AS min90`;
const od90 = (ted) => new Date(ted - 90 * 86400e3).toISOString().slice(0, 10);

// /api/cestina?q=…&filtr=sleva|zdarma|dabing|vse
export async function apiCestina(env, q, filtr) {
  const db = env.DB;
  await zajistiSchemaHlidac(db);
  const ted = Date.now();
  q = String(q || "").trim().slice(0, 60);
  if (q.length >= 2) {
    const n = normNazev(q);
    let { results } = await db.prepare(`SELECT ${SLOUPCE} FROM steam_hry g WHERE g.norm LIKE ? ORDER BY (g.norm = ?) DESC, g.recenzi DESC LIMIT 20`)
      .bind(od90(ted), `%${n}%`, n).all();
    const overeno = results.filter((r) => r.cestina != null);
    // Málo výsledků → zeptáme se Steamu (1 požadavek) a u prvních 3 her rovnou zjistíme češtinu (3 požadavky).
    if (overeno.length < 3 && n.length >= 3) {
      try {
        const s = await json(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=czech&cc=CZ`);
        const nove = (s?.items || []).filter((i) => i.type === "app").slice(0, 8).map((i) => ({
          id: i.id, nazev: i.name, obrazek: `https://cdn.akamai.steamstatic.com/steam/apps/${i.id}/header.jpg`,
          cena: i.price ? i.price.final / 100 : null, puvodni: i.price ? i.price.initial / 100 : null,
          sleva: i.price && i.price.initial ? Math.round((1 - i.price.final / i.price.initial) * 100) : 0, mena: i.price?.currency || "CZK",
        }));
        if (nove.length) {
          await db.batch(prikazyUlozHry(db, nove, ted));
          const bez = nove.slice(0, 3).map((x) => String(x.id));
          await db.batch(bez.map((id) => db.prepare("UPDATE steam_hry SET jazyky_cas = NULL WHERE id = ? AND cestina IS NULL").bind(id)));
          await sberJazyku(db, ted, 3);
          const ids = nove.map((x) => String(x.id));
          const r2 = await db.prepare(`SELECT ${SLOUPCE} FROM steam_hry g WHERE g.id IN (${ids.map(() => "?").join(",")})`).bind(od90(ted), ...ids).all();
          const mam = new Set(results.map((r) => r.id));
          results = [...results, ...r2.results.filter((r) => !mam.has(r.id))];
        }
      } catch (e) { console.warn("hledání steam:", e.message); }
    }
    return { q, hry: results.slice(0, 20).map(naHru) };
  }
  const podminka = {
    sleva: "g.cestina > 0 AND g.sleva > 0",
    zdarma: "g.cestina > 0 AND (g.zdarma = 1 OR g.cena = 0) AND g.vychazi = 0",
    dabing: "g.cestina = 2",
    vse: "g.cestina > 0",
  }[filtr] || "g.cestina > 0 AND g.sleva > 0";
  const poradi = filtr === "sleva" || !filtr ? "g.sleva DESC, g.recenzi DESC" : "g.recenzi DESC";
  const [h, poc] = await db.batch([
    db.prepare(`SELECT ${SLOUPCE} FROM steam_hry g WHERE ${podminka} ORDER BY ${poradi} LIMIT 40`).bind(od90(ted)),
    db.prepare("SELECT COUNT(*) AS vse, SUM(cestina > 0) AS cz, SUM(cestina = 2) AS dabing FROM steam_hry WHERE cestina IS NOT NULL"),
  ]);
  return { filtr: filtr || "sleva", hry: h.results.map(naHru), pocty: poc.results[0] || {} };
}

// /api/steam-hry?ids=1,2,3 – pro seznam hlídaných her.
export async function apiSteamHry(env, idsText) {
  const db = env.DB;
  await zajistiSchemaHlidac(db);
  const ids = String(idsText || "").split(",").map(steamId).filter(Boolean).slice(0, MAX_HLIDANYCH);
  if (!ids.length) return { hry: [] };
  const { results } = await db.prepare(`SELECT ${SLOUPCE} FROM steam_hry g WHERE g.id IN (${ids.map(() => "?").join(",")})`).bind(od90(Date.now()), ...ids).all();
  return { hry: results.map(naHru) };
}

// Čeština a nejnižší cena pro katalog a stránku hry.
export async function doplnSteamUdaje(db, ids) {
  await zajistiSchemaHlidac(db);
  const u = [...new Set(ids.map(steamId).filter(Boolean))].slice(0, 90);
  if (!u.length) return new Map();
  const { results } = await db.prepare(`SELECT g.id, g.cestina, (SELECT MIN(c.cena) FROM ceny_historie c WHERE c.id = g.id AND c.den >= ?) AS min90
    FROM steam_hry g WHERE g.id IN (${u.map(() => "?").join(",")})`).bind(od90(Date.now()), ...u).all();
  return new Map(results.map((r) => [r.id, r]));
}

// Přidání / odebrání hlídané hry (volá pushApi po ověření odběru).
export async function hlidat(db, odberId, b) {
  await zajistiSchemaHlidac(db);
  const id = steamId(b.steam_id);
  if (!id) return { chyba: "Neplatná hra", status: 400 };
  const cil = b.cil == null || b.cil === "" ? null : Math.max(0, Math.min(100000, Math.round(Number(b.cil) * 100) / 100));
  if (cil != null && !Number.isFinite(cil)) return { chyba: "Neplatná cena", status: 400 };
  const pocet = await db.prepare("SELECT COUNT(*) AS n FROM hlidani WHERE odber_id = ?").bind(odberId).first();
  const uz = await db.prepare("SELECT 1 FROM hlidani WHERE odber_id = ? AND steam_id = ?").bind(odberId, id).first();
  if (!uz && pocet.n >= MAX_HLIDANYCH) return { chyba: `Hlídat můžeš nejvýš ${MAX_HLIDANYCH} her.`, status: 400 };
  const nazev = String(b.nazev || "").slice(0, 160);
  await db.batch([
    db.prepare(`INSERT INTO hlidani (odber_id, steam_id, nazev, cil, cas) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(odber_id, steam_id) DO UPDATE SET cil = excluded.cil, upozorneno = NULL`).bind(odberId, id, nazev, cil, Date.now()),
    // Hra se hned zařadí do databáze, ať se cena zkontroluje v nejbližším běhu.
    db.prepare(`INSERT OR IGNORE INTO steam_hry (id, nazev, norm, pridano) VALUES (?, ?, ?, ?)`).bind(id, nazev || `Hra ${id}`, normNazev(nazev), Date.now()),
  ]);
  return { ok: true };
}
export async function nehlidat(db, odberId, b) {
  await zajistiSchemaHlidac(db);
  await db.prepare("DELETE FROM hlidani WHERE odber_id = ? AND steam_id = ?").bind(odberId, steamId(b.steam_id)).run();
  return { ok: true };
}
