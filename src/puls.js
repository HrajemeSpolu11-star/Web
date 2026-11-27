// Herní pulsometr: jak „živá“ je hra právě teď, 0–100. NEměří kvalitu hry, jen aktivitu kolem ní.
// Počítá se jen z toho, co opravdu měříme nebo dostáváme z oficiálních API – nic se neodhaduje:
//   hráči na Steamu teď (oficiální Steam Web API)            váha 30
//   sledovanost na českých streamech za 7 dní (naše měření)  váha 25
//   trend sledovanosti proti předchozímu týdnu (naše měření) váha 15
//   čerstvost aktualizací (oficiální oznámení na Steamu)     váha 20
//   výhodnost ceny teď (sleva v obchodě Steam)               váha 10
// Ukazatel, který pro hru nemáme, se nepočítá a váhy ostatních se poměrně navýší. Skóre se ukáže, jen když jsou
// k dispozici aspoň 3 ukazatele a mezi nimi hráči na Steamu nebo česká scéna.
import { denPraha } from "./psani.js";

const DEN = 86400e3;
const posun = (den, n) => new Date(Date.parse(den + "T12:00:00Z") + n * DEN).toISOString().slice(0, 10);
const omez = (x) => Math.max(0, Math.min(100, Math.round(x)));

export const VAHY = { hraci: 30, scena: 25, trend: 15, aktualizace: 20, cena: 10 };

// Vstup: { nazev, steamId, hraciTed, sleva, zdarma } + db. hmax = nejvíc hodin sledování jedné hry za týden (z trendů).
export async function pulsHry(db, { nazev, steamId, hraciTed, sleva, zdarma, cena }, { hmax = 0, odMereni = null } = {}) {
  const dnes = denPraha(), vcera = posun(dnes, -1), t0 = posun(dnes, -7), p0 = posun(dnes, -14);
  const [sc, pa, sl] = await db.batch([
    db.prepare(`SELECT SUM(CASE WHEN den >= ? THEN divako_minut ELSE 0 END) AS t, SUM(CASE WHEN den < ? THEN divako_minut ELSE 0 END) AS p
      FROM hry_den WHERE hra = ? AND den >= ? AND den <= ?`).bind(t0, t0, String(nazev || ""), p0, vcera),
    db.prepare("SELECT COUNT(*) AS n, MAX(datum) AS posledni FROM patche WHERE appid = ? AND datum > ?").bind(String(steamId || "-"), Date.now() - 90 * DEN),
    db.prepare("SELECT 1 AS ano FROM sledovane WHERE appid = ?").bind(String(steamId || "-")),
  ]).catch(() => [{ results: [] }, { results: [] }, { results: [] }]);
  const th = (sc.results[0]?.t || 0) / 60, ph = (sc.results[0]?.p || 0) / 60;
  const slozky = [];
  if (Number.isFinite(hraciTed) && hraciTed >= 0)
    slozky.push({ klic: "hraci", hodnota: hraciTed, skore: omez((Math.log10(hraciTed + 1) / 6) * 100), druh: "oficialni", zdroj: "Steam" });
  if (hmax > 0)
    slozky.push({ klic: "scena", hodnota: Math.round(th), skore: omez((Math.log10(th + 1) / Math.log10(hmax + 1)) * 100), druh: "mereno", zdroj: "Twitch + Kick" });
  // Trend jen při dostatku dat: aspoň 14 dní měření a aspoň 5 h sledování v obou týdnech dohromady.
  if (odMereni && odMereni <= p0 && th + ph >= 5) {
    const zmena = Math.max(-1, Math.min(1, (th - ph) / Math.max(ph, 1)));
    slozky.push({ klic: "trend", hodnota: Math.round(((th - ph) / Math.max(ph, 1)) * 100), skore: omez(50 + 50 * zmena), druh: "mereno", zdroj: "Twitch + Kick" });
  }
  // Aktualizace hodnotíme jen u her, jejichž oznámení na Steamu opravdu sledujeme (jinak bychom nevěděli, jestli nějaká byla).
  if (steamId && sl.results.length) {
    const posledni = pa.results[0]?.posledni || null;
    const dni = posledni ? Math.floor((Date.now() - posledni) / DEN) : null;
    slozky.push({ klic: "aktualizace", hodnota: { pocet: pa.results[0]?.n || 0, dni }, skore: dni == null ? 0 : omez(100 - (dni * 100) / 90), druh: "oficialni", zdroj: "Steam" });
  }
  if (zdarma || cena === 0) slozky.push({ klic: "cena", hodnota: "zdarma", skore: 100, druh: "oficialni", zdroj: "Steam" });
  else if (Number.isFinite(cena)) slozky.push({ klic: "cena", hodnota: Number(sleva) || 0, skore: omez((Number(sleva) || 0) * 1.25), druh: "oficialni", zdroj: "Steam" });
  for (const s of slozky) s.vaha = VAHY[s.klic];
  const zaklad = slozky.some((s) => s.klic === "hraci" || s.klic === "scena");
  if (slozky.length < 3 || !zaklad) return { skore: null, slozky, chybi: Object.keys(VAHY).filter((k) => !slozky.some((s) => s.klic === k)) };
  const sv = slozky.reduce((a, s) => a + s.vaha, 0);
  const skore = omez(slozky.reduce((a, s) => a + s.skore * s.vaha, 0) / sv);
  return { skore, slozky, chybi: Object.keys(VAHY).filter((k) => !slozky.some((s) => s.klic === k)) };
}
