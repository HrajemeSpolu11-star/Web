// CheapShark (https://www.cheapshark.com) – veřejné rozhraní zdarma, bez klíče. Sleduje ceny her v desítkách obchodů
// (Steam, GOG, Humble, Fanatical, GreenManGaming, Epic…). Ceny jsou v amerických dolarech (USD, ceny pro USA).
// Podmínka použití: odkazy na nabídky musí vést přes odkaz CheapShark (redirect?dealID=…).
// Použití u nás:
//  1) Katalog (cron jednou za hodinu): seznam obchodů + nejlepší slevy napříč obchody = 2 požadavky, 2 zápisy řádků.
//  2) Stránka hry: ceny ve všech obchodech podle Steam ID = 2 požadavky, výsledek ve sdílené mezipaměti D1 na 12 h
//     (1 zápis na hru za 12 h). Slouží i k ověření slevy ze Steamu druhým zdrojem.

import { zMezipameti } from "./mezipamet.js";
import { cenyHryItad, katalogItad, STEAM_SHOP } from "./itad.js";

const API = "https://www.cheapshark.com/api/1.0";
const UA = "HerniPulsBot/0.1 (+https://github.com/HrajemeSpolu11-star/Web)";
const txt = (s, max = 120) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const https = (u) => /^https:\/\//.test(String(u || "")) ? String(u) : "";
const cislo = (x) => { const n = Number(x); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };
// dealID přichází už zakódovaný (např. „…%3D“) – pustíme jen bezpečné znaky.
const odkazNabidky = (id) => /^[A-Za-z0-9%+/=_-]{8,200}$/.test(String(id || "")) ? `https://www.cheapshark.com/redirect?dealID=${id}` : "";

async function json(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} cheapshark`);
  return r.json();
}

async function obchodyCS() {
  const d = await json(`${API}/stores`);
  if (!Array.isArray(d)) throw new Error("CheapShark: neočekávaná odpověď (obchody)");
  return d.filter((s) => s && String(s.isActive) === "1").map((s) => ({ id: String(s.storeID), nazev: txt(s.storeName, 40) }));
}

// Pro hodinový sběr katalogu: obchody + nejlepší slevy (hodnocení nabídky CheapShark, hry s dobrým hodnocením na Steamu).
export async function katalogCheapShark() {
  const [obchody, deals] = await Promise.all([
    obchodyCS(),
    json(`${API}/deals?onSale=1&sortBy=${encodeURIComponent("Deal Rating")}&pageSize=40&steamRating=75`),
  ]);
  if (!Array.isArray(deals)) throw new Error("CheapShark: neočekávaná odpověď (slevy)");
  const jmena = new Map(obchody.map((o) => [o.id, o.nazev]));
  const vid = new Set(), slevy = [];
  for (const d of deals) {
    if (!d || vid.has(d.gameID) || !jmena.has(String(d.storeID))) continue;
    const url = odkazNabidky(d.dealID);
    if (!url) continue;
    vid.add(d.gameID);
    slevy.push({ nazev: txt(d.title), obchod: jmena.get(String(d.storeID)), obchod_id: String(d.storeID), cena: cislo(d.salePrice), puvodni: cislo(d.normalPrice),
      sleva: Math.round(Number(d.savings) || 0), mena: "USD", steam_id: /^\d{1,10}$/.test(String(d.steamAppID || "")) ? String(d.steamAppID) : null,
      hodnoceni: Number(d.steamRatingPercent) || null, obrazek: https(d.thumb), url });
    if (slevy.length >= 20) break;
  }
  return { cs_obchody: obchody, cs_slevy: slevy, cs_zdroj: [{ zdroj: "CheapShark", zeme: "US" }] };
}

// Ceny jedné hry ve všech obchodech podle Steam ID. Prázdný výsledek ({ obchody: [] }) = CheapShark hru nezná.
async function cenyHry(db, steamId) {
  const hledani = await json(`${API}/games?steamAppID=${encodeURIComponent(steamId)}`);
  const hra = Array.isArray(hledani) ? hledani.find((g) => String(g?.steamAppID) === String(steamId)) : null;
  if (!hra?.gameID || !/^\d{1,12}$/.test(String(hra.gameID))) return { obchody: [] };
  const d = await json(`${API}/games?id=${encodeURIComponent(hra.gameID)}`);
  let jmena = new Map();
  try {
    const r = await db.prepare("SELECT data FROM katalog WHERE klic = 'cs_obchody'").first();
    if (r) jmena = new Map(JSON.parse(r.data).map((o) => [o.id, o.nazev]));
  } catch { /* katalog ještě není */ }
  if (!jmena.size) jmena = new Map((await obchodyCS()).map((o) => [o.id, o.nazev]));
  const obchody = (Array.isArray(d?.deals) ? d.deals : [])
    .filter((x) => jmena.has(String(x.storeID)) && odkazNabidky(x.dealID))
    .map((x) => ({ obchod: jmena.get(String(x.storeID)), obchod_id: String(x.storeID), cena: cislo(x.price), puvodni: cislo(x.retailPrice),
      sleva: Math.round(Number(x.savings) || 0), url: odkazNabidky(x.dealID) }))
    .filter((x) => x.cena != null).sort((a, b) => a.cena - b.cena).slice(0, 10);
  const nej = d?.cheapestPriceEver;
  return {
    mena: "USD", obchody,
    nejlevneji_kdy: nej?.price != null ? { cena: cislo(nej.price), den: nej.date ? new Date(Number(nej.date) * 1000).toISOString().slice(0, 10) : null } : null,
  };
}

// S klíčem ITAD_KEY ceny pro Česko z IsThereAnyDeal, bez něj CheapShark (jen obchody a procenta – ceny jsou tam pro USA).
export async function apiCenyObchodu(env, steamId) {
  if (!/^\d{1,10}$/.test(String(steamId || ""))) return { chyba: "Neplatná hra" };
  if (env.ITAD_KEY) {
    const data = await zMezipameti(env.DB, `itad:${steamId}`, 12 * 3600e3, () => cenyHryItad(env, steamId));
    return { ...data, zdroj: "IsThereAnyDeal", steam_shop: STEAM_SHOP };
  }
  const data = await zMezipameti(env.DB, `cs:${steamId}`, 12 * 3600e3, () => cenyHry(env.DB, steamId));
  return { ...data, zdroj: "CheapShark", zeme: "US", steam_shop: "1" };
}
export const katalogCen = (env) => env.ITAD_KEY ? katalogItad(env) : katalogCheapShark();
