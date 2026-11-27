// Analytika žánrů a komunit (počítá se spolu s trendy každé 3 hodiny, ukládá se do katalogu „analytika“).
//  • Žánry na české scéně: hodiny sledování (hry_den) za 7 dní proti 7 předchozím, žánry podle Steamu (steam_hry.zanry).
//    Jen hry, které umíme spárovat se Steamem – podíl spárovaných hodin se ukládá (pokryti), nic se nedopočítává.
//  • Rostoucí komunity: kolik českých streamů hru hrálo nejvíc najednou na jedné platformě (max_streamu) – tento týden proti minulému.
//  • Nejčastěji ve slevě: počet dní se slevou za posledních 90 dní (ceny_historie, jen hry měřené aspoň 60 dní).
//  • Nejvíc aktualizací: oficiální oznámení na Steamu za 30 dní (patche).
import { denPraha } from "./psani.js";
import { BEZ_KATEGORIE } from "./prehled.js";
import { normNazev } from "./hra-data.js";
import { ZANRY } from "./nastroje.js";
import { slugHry } from "./twitch.js";
import { zajistiSchemaPatchu } from "./patche.js";
import { zajistiSchemaPropojeni } from "./propojeni.js";

const DEN = 86400e3;
const posun = (den, n) => new Date(Date.parse(den + "T12:00:00Z") + n * DEN).toISOString().slice(0, 10);
const https = (u) => (/^https:\/\//.test(String(u || "")) ? String(u) : "");

async function steamPodleNazvu(db, nazvy) {
  const norm = [...new Set(nazvy.map(normNazev).filter(Boolean))], m = new Map();
  for (let i = 0; i < norm.length; i += 90) {
    const d = norm.slice(i, i + 90);
    const { results } = await db.prepare(`SELECT id, norm, obrazek, zanry, igdb_slug FROM steam_hry WHERE norm IN (${d.map(() => "?").join(",")})`).bind(...d).all();
    for (const r of results) if (!m.has(r.norm)) m.set(r.norm, r);
  }
  return m;
}

export async function sestavAnalytiku(db, ted = Date.now()) {
  await zajistiSchemaPatchu(db); await zajistiSchemaPropojeni(db);
  const dnes = denPraha(ted), vcera = posun(dnes, -1), t0 = posun(dnes, -7), p0 = posun(dnes, -14);
  const [od, hry, slevy, patche] = await db.batch([
    db.prepare("SELECT MIN(den) AS od FROM hry_den"),
    db.prepare(`SELECT hra,
        SUM(CASE WHEN den >= ?1 THEN divako_minut ELSE 0 END) AS t, SUM(CASE WHEN den < ?1 THEN divako_minut ELSE 0 END) AS p,
        MAX(CASE WHEN den >= ?1 THEN max_streamu ELSE 0 END) AS st, MAX(CASE WHEN den < ?1 THEN max_streamu ELSE 0 END) AS sp
      FROM hry_den WHERE den >= ?2 AND den <= ?3 AND hra <> ?4 GROUP BY hra`).bind(t0, p0, vcera, BEZ_KATEGORIE),
    db.prepare(`SELECT c.id, g.nazev, g.obrazek, g.igdb_slug, SUM(CASE WHEN c.sleva > 0 THEN 1 ELSE 0 END) AS dni, MAX(c.sleva) AS max, COUNT(*) AS n
      FROM ceny_historie c JOIN steam_hry g ON g.id = c.id WHERE c.den >= ? GROUP BY c.id HAVING n >= 60 AND dni > 0 ORDER BY dni DESC, max DESC LIMIT 20`).bind(posun(dnes, -90)),
    db.prepare(`SELECT p.appid, MAX(p.hra) AS hra, COUNT(*) AS n, MAX(p.datum) AS posledni, MAX(g.obrazek) AS obrazek, MAX(g.igdb_slug) AS igdb_slug
      FROM patche p LEFT JOIN steam_hry g ON g.id = p.appid WHERE p.datum > ? GROUP BY p.appid ORDER BY n DESC LIMIT 20`).bind(ted - 30 * DEN),
  ]);
  const zacatek = od.results[0]?.od || null;
  const dostupne = !!zacatek && zacatek <= p0;

  // Žánry a komunity (jen když máme 14 dní záznamů).
  let zanry = [], komunity = [], pokryti = null;
  if (dostupne) {
    const radky = hry.results.filter((r) => (r.t || 0) + (r.p || 0) >= 60 * 60); // aspoň 1 h sledování za 14 dní
    const steam = await steamPodleNazvu(db, radky.map((r) => r.hra));
    const z = new Map();
    let vse = 0, sparovano = 0;
    for (const r of radky) {
      const s = steam.get(normNazev(r.hra));
      vse += r.t || 0;
      const ids = String(s?.zanry || "").split(",").map(Number).filter((x) => ZANRY[x]);
      if (!ids.length) continue;
      sparovano += r.t || 0;
      for (const id of ids) {
        const x = z.get(id) || { zanr: ZANRY[id], t: 0, p: 0, her: 0, top: [] };
        x.t += r.t || 0; x.p += r.p || 0; x.her++; x.top.push({ hra: r.hra, t: r.t || 0 });
        z.set(id, x);
      }
    }
    pokryti = vse ? Math.round((sparovano / vse) * 100) : null;
    zanry = [...z.values()].map((x) => ({ zanr: x.zanr, hodin: Math.round(x.t / 60), hodin_pred: Math.round(x.p / 60), her: x.her,
      zmena: x.p >= 120 ? Math.round(((x.t - x.p) / x.p) * 100) : null,
      top: x.top.sort((a, b) => b.t - a.t).slice(0, 3).map((h) => h.hra) })).filter((x) => x.hodin + x.hodin_pred >= 5).sort((a, b) => b.hodin - a.hodin);
    komunity = hry.results.filter((r) => (r.st || 0) >= 3 && (r.st || 0) > (r.sp || 0)).map((r) => {
      const s = steam.get(normNazev(r.hra));
      return { hra: r.hra, slug: slugHry(r.hra), streamu: r.st, streamu_pred: r.sp || 0, rozdil: r.st - (r.sp || 0), hodin: Math.round((r.t || 0) / 60),
        obrazek: https(s?.obrazek), igdb_slug: s?.igdb_slug || null };
    }).sort((a, b) => b.rozdil - a.rozdil || b.streamu - a.streamu).slice(0, 15);
  }
  return {
    dostupne, od: zacatek, obdobi: { od: t0, do: vcera, pred_od: p0 }, pokryti, zanry, komunity,
    slevy: slevy.results.map((r) => ({ id: r.id, nazev: r.nazev, obrazek: https(r.obrazek), igdb_slug: r.igdb_slug || null, dni: r.dni, z: r.n, max: r.max || 0 })),
    aktualizace: patche.results.map((r) => ({ id: r.appid, nazev: r.hra, pocet: r.n, posledni: new Date(r.posledni).toISOString(), obrazek: https(r.obrazek), igdb_slug: r.igdb_slug || null })),
  };
}
