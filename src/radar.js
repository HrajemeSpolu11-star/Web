// Herní radar: jeden proud událostí z dat, která web už sbírá. Žádné nové externí požadavky.
//   aktualizace  – nové velké aktualizace a sezóny (oficiální oznámení na Steamu)
//   zdarma       – hry zdarma na Epicu (oficiální obchod)
//   cena         – hra má nejnižší cenu od začátku našeho měření (Steam, aspoň 30 dní historie)
//   rekord       – český streamer překonal svůj rekord diváků nebo milník sledujících (naše měření Twitch/Kick)
//   trend        – hra prudce roste nebo znovu ožívá (česká scéna / Steam, naše výpočty z naměřených čísel)
//   vydani       – hra vychází (kalendář IGDB, výběr populárních)
//   vyroci       – výročí vydání (IGDB)
import { zajistiSchemaPatchu, typPodleNadpisu } from "./patche.js";
import { apiVydani } from "./vydani.js";
import { apiVyroci } from "./vyroci.js";
import { nactiKatalog } from "./trendy.js";

const DEN = 86400e3;
const https = (u) => (/^https:\/\//.test(String(u || "")) ? String(u) : "");
const iso = (ms) => new Date(ms).toISOString();
const dbOdkaz = (u) => { const m = /igdb\.com\/games\/([a-z0-9-]{1,100})/.exec(String(u || "")); return m ? `/databaze/${m[1]}` : ""; };

export async function apiRadar(env) {
  const db = env.DB, ted = Date.now();
  await zajistiSchemaPatchu(db);
  const [pa, ud, kat] = await db.batch([
    db.prepare(`SELECT p.gid, p.appid, p.hra, p.nadpis, p.url, p.datum, p.typ, p.poradi, p.shrnuti, p.stav, g.obrazek FROM patche p
      LEFT JOIN steam_hry g ON g.id = p.appid WHERE p.datum > ? ORDER BY p.datum DESC LIMIT 80`).bind(ted - 7 * DEN),
    db.prepare(`SELECT u.typ, u.hodnota, u.cas, s.jmeno, s.login, s.platforma, s.profilovka FROM udalosti u JOIN streameri s ON s.id = u.user_id
      WHERE u.cas > ? AND s.skryty = 0 AND (u.typ = 'milnik' OR (u.typ = 'rekord' AND u.hodnota >= 300)) ORDER BY u.cas DESC LIMIT 25`).bind(ted - 7 * DEN),
    db.prepare("SELECT klic, data, cas FROM katalog WHERE klic IN ('epic_zdarma', 'epic_brzy')"),
  ]).catch(() => [{ results: [] }, { results: [] }, { results: [] }]);
  const u = [];

  // Aktualizace: velké a sezóny vždy, ostatní jen u 50 nejhranějších sledovaných her (jinak by radar zahltily opravy).
  for (const r of pa.results) {
    const typ = r.typ || typPodleNadpisu(r.nadpis);
    if (!(typ === "velka" || typ === "sezona" || (r.poradi && r.poradi <= 50 && typ !== "opravy"))) continue;
    let shr = "";
    try { shr = r.stav === "hotovo" ? JSON.parse(r.shrnuti || "{}").shrnuti || "" : ""; } catch { /* nic */ }
    u.push({ typ: "aktualizace", podtyp: typ, cas: iso(r.datum), hra: r.hra, nadpis: r.nadpis, text: shr, ai: !!shr,
      odkaz: `/aktualizace?hra=${encodeURIComponent(r.appid)}`, venku: r.url, steam_id: r.appid,
      obrazek: https(r.obrazek) || `https://cdn.cloudflare.steamstatic.com/steam/apps/${encodeURIComponent(r.appid)}/header.jpg`, druh: "oficialni", zdroj: "Steam" });
  }
  // Rekordy a milníky streamerů.
  for (const r of ud.results) u.push({ typ: "rekord", podtyp: r.typ, cas: iso(r.cas), hodnota: r.hodnota,
    streamer: { jmeno: r.jmeno || r.login, login: r.login, platforma: r.platforma || "twitch", profilovka: https(r.profilovka) },
    odkaz: `/streamer/${encodeURIComponent(r.platforma || "twitch")}/${encodeURIComponent(r.login)}`, druh: "mereno", zdroj: r.platforma === "kick" ? "Kick" : "Twitch" });
  // Hry zdarma na Epicu (čas = začátek akce).
  for (const k of kat.results) {
    let list = [];
    try { list = JSON.parse(k.data) || []; } catch { /* nic */ }
    for (const h of list) {
      const od = Date.parse(h.od);
      if (!Number.isFinite(od)) continue;
      if (k.klic === "epic_zdarma" && od > ted - 7 * DEN) u.push({ typ: "zdarma", cas: iso(od), hra: h.nazev, do: h.do, odkaz: "/obchody", venku: h.url, obrazek: https(h.obrazek), druh: "oficialni", zdroj: "Epic Games Store" });
    }
  }
  // Nejnižší ceny od začátku měření (počítá se každé 3 hodiny).
  const cr = await nactiKatalog(db, "cenovy_radar");
  for (const h of (cr?.hry || []).slice(0, 10)) u.push({ typ: "cena", cas: cr.cas, hra: h.nazev, cena: h.cena, puvodni: h.puvodni, sleva: h.sleva, mena: h.mena,
    od: h.od, odkaz: `/hra/steam/${encodeURIComponent(h.id)}`, steam_id: h.id, obrazek: https(h.obrazek), druh: "mereno", zdroj: "Steam" });
  // Trendy: jen výrazné pohyby (prudký růst, návrat, nová hra na české scéně).
  const tr = await nactiKatalog(db, "trendy");
  for (const p of (tr?.cesko?.polozky || []).filter((p) => ["prudce_roste", "oziva", "nova"].includes(p.stav) && p.hodin >= 20).slice(0, 6))
    u.push({ typ: "trend", podtyp: p.stav, oblast: "cesko", cas: tr.cas, hra: p.hra, hodin: p.hodin, hodin_pred: p.hodin_pred, zmena: p.zmena,
      odkaz: `/hra/${encodeURIComponent(p.slug)}`, obrazek: p.obrazek || "", druh: "mereno", zdroj: "Twitch + Kick" });
  for (const p of (tr?.steam?.polozky || []).filter((p) => p.stav === "prudce_roste").slice(0, 4))
    u.push({ typ: "trend", podtyp: p.stav, oblast: "steam", cas: tr.cas, hra: p.hra, hracu: p.hracu, hracu_pred: p.hracu_pred, zmena: p.zmena,
      odkaz: `/hra/steam/${encodeURIComponent(p.steam_id)}`, steam_id: p.steam_id, obrazek: p.obrazek || "", druh: "mereno", zdroj: "Steam" });
  // Vydání: co vyšlo za poslední 2 dny (proud) a co vyjde do 7 dní (zvlášť).
  const brzy = [];
  try {
    const v = await apiVydani(env);
    for (const h of v.hry || []) {
      const d = Date.parse(h.datum);
      if (!Number.isFinite(d) || h.uz_vyslo) continue;
      const x = { typ: "vydani", cas: h.datum, hra: h.nazev, presne: h.presne, platformy: h.platformy, cestina: h.cestina, obrazek: https(h.obrazek),
        odkaz: h.steam_id ? `/hra/steam/${encodeURIComponent(h.steam_id)}` : dbOdkaz(h.igdb) || "/vydani", druh: "databaze", zdroj: "IGDB" };
      if (d <= ted && d > ted - 2 * DEN) u.push(x);
      else if (d > ted && d <= ted + 7 * DEN && h.presne !== false) brzy.push(x);
    }
  } catch { /* kalendář nepovinný */ }
  try {
    const vy = await apiVyroci(env);
    for (const h of (vy.hry || []).slice(0, 3)) u.push({ typ: "vyroci", cas: iso(Date.parse(vy.den + "T05:00:00Z")), hra: h.nazev, pred: h.pred, rok: h.rok, obrazek: https(h.obrazek),
      odkaz: h.steam ? `/hra/steam/${encodeURIComponent(h.steam)}` : dbOdkaz(h.igdb) || h.igdb || "/", druh: "databaze", zdroj: "IGDB" });
  } catch { /* nepovinné */ }
  u.sort((a, b) => b.cas.localeCompare(a.cas));
  brzy.sort((a, b) => a.cas.localeCompare(b.cas));
  return { udalosti: u.slice(0, 80), brzy: brzy.slice(0, 12), cas: iso(ted) };
}
