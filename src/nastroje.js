// Nástroje pro hráče a streamery – vše z dat, která web už sbírá (žádné nové externí požadavky):
//  • /api/co-hrat      – doporučení her podle filtru (databáze her ze Steamu: žánry, režim, čeština, cena, doporučení)
//  • /api/vyssi-nizsi  – data pro denní minihru „Vyšší, nebo nižší?“
import { denPraha } from "./psani.js";
import { BEZ_KATEGORIE } from "./prehled.js";
import { zajistiSchemaHlidac } from "./hlidac.js";

const DEN = 86400e3;
const posunDne = (den, n) => new Date(Date.parse(den + "T12:00:00Z") + n * DEN).toISOString().slice(0, 10);
const https = (u) => (/^https:\/\//.test(String(u || "")) ? String(u) : "");

// Žánry Steamu (čísla jsou stálá napříč jazyky).
export const ZANRY = { 1: "Akční", 25: "Adventura", 3: "RPG", 2: "Strategie", 28: "Simulace", 9: "Závodní", 18: "Sport", 4: "Pohodové", 23: "Nezávislé (indie)", 29: "MMO" };

// ---------- Co dnes hrát ----------
export async function apiCoHrat(env, p) {
  const db = env.DB;
  await zajistiSchemaHlidac(db);
  const kde = ["g.jazyky_cas IS NOT NULL", "g.vychazi = 0", "g.zanry IS NOT NULL", "g.zanry <> ','"], hod = [];
  const s = { sam: 1, koop: 2, online: 4 }[p.get("s")];
  if (s) { kde.push("(COALESCE(g.rezim, 0) & ?) <> 0"); hod.push(s); }
  const cz = { texty: 1, dabing: 2 }[p.get("cz")];
  if (cz) { kde.push("g.cestina >= ?"); hod.push(cz); }
  const cena = p.get("cena");
  if (cena === "zdarma") kde.push("(g.zdarma = 1 OR g.cena = 0)");
  else if (cena === "200" || cena === "500") { kde.push("(g.zdarma = 1 OR (g.cena IS NOT NULL AND g.cena <= ?))"); hod.push(Number(cena)); }
  const zanr = parseInt(p.get("zanr") || "", 10);
  if (ZANRY[zanr]) { kde.push("g.zanry LIKE ?"); hod.push(`%,${zanr},%`); }
  const [vys, celkem] = await db.batch([
    db.prepare(`SELECT g.* FROM steam_hry g WHERE ${kde.join(" AND ")} ORDER BY COALESCE(g.doporuceni, 0) DESC LIMIT 80`).bind(...hod),
    db.prepare("SELECT COUNT(*) AS n FROM steam_hry WHERE zanry IS NOT NULL AND zanry <> ','"),
  ]);
  // Pořadí: kvalita (hodnocení hráčů, jinak Metacritic) × popularita (počet doporučení na Steamu).
  const skore = (g) => {
    const q = g.recenzi >= 50 && g.kladne != null ? g.kladne / 100 : g.metacritic ? g.metacritic / 100 : 0.7;
    return q * q * Math.log10((g.doporuceni || 0) + 10);
  };
  const hry = vys.results.map((g) => ({
    id: g.id, nazev: g.nazev, obrazek: https(g.obrazek), cestina: g.cestina, cena: g.cena, puvodni: g.puvodni, sleva: g.sleva || 0,
    zdarma: !!g.zdarma, mena: g.mena || "CZK", rezim: g.rezim || 0, doporuceni: g.doporuceni || 0, metacritic: g.metacritic || null,
    hodnoceni: g.recenzi >= 50 && g.kladne != null ? { kladne: g.kladne, recenzi: g.recenzi } : null,
    zanry: String(g.zanry || "").split(",").map(Number).filter((z) => ZANRY[z]).map((z) => ZANRY[z]),
    _s: skore(g),
  })).sort((a, b) => b._s - a._s).slice(0, 12).map(({ _s, ...h }) => h);
  return { hry, databaze: celkem.results[0]?.n || 0, zanry: ZANRY };
}

// ---------- Vyšší, nebo nižší? ----------
// Tři sady čísel, všechny z oficiálních zdrojů: hráči na Steamu (žebříček), hodiny sledování na českých streamech (7 dní),
// počet doporučení na Steamu.
export async function apiVyssiNizsi(env) {
  const db = env.DB;
  await zajistiSchemaHlidac(db);
  const od = posunDne(denPraha(), -7);
  const [k, c, d] = await db.batch([
    db.prepare("SELECT data FROM katalog WHERE klic = 'steam_hrane'"),
    db.prepare("SELECT hra, SUM(divako_minut) AS dm FROM hry_den WHERE den >= ? AND hra <> ? GROUP BY hra ORDER BY dm DESC LIMIT 40").bind(od, BEZ_KATEGORIE),
    db.prepare("SELECT id, nazev, obrazek, doporuceni FROM steam_hry WHERE doporuceni >= 1000 AND vychazi = 0 ORDER BY doporuceni DESC LIMIT 80"),
  ]).catch(() => [{ results: [] }, { results: [] }, { results: [] }]);
  let hraci = [];
  try {
    hraci = (JSON.parse(k.results[0]?.data || "[]") || []).filter((h) => h.hracu > 0).map((h) => ({ nazev: h.nazev, hodnota: h.hracu, obrazek: https(h.obrazek), steam_id: h.id }));
  } catch { /* nic */ }
  return {
    den: denPraha(),
    sady: {
      hraci: { nazev: "Hráči na Steamu", otazka: "Která hra měla za posledních 24 h víc hráčů najednou?", jednotka: "hráčů ve špičce", zdroj: "Steam – nejvíc hráčů najednou za posledních 24 hodin (denní špička)", hry: hraci },
      cesko: { nazev: "Česká scéna", otazka: "Na co se Češi na streamech dívali víc?", jednotka: "hodin sledování", zdroj: "Naše měření českých streamů na Twitchi a Kicku za 7 dní",
        hry: c.results.filter((r) => r.dm >= 600).map((r) => ({ nazev: r.hra, hodnota: Math.round(r.dm / 60) })) },
      doporuceni: { nazev: "Oblíbenost", otazka: "Která hra má na Steamu víc doporučení?", jednotka: "doporučení", zdroj: "Steam – počet doporučení hráčů",
        hry: d.results.map((r) => ({ nazev: r.nazev, hodnota: r.doporuceni, obrazek: https(r.obrazek), steam_id: r.id })) },
    },
  };
}
