// Seznam přání ze Steamu: návštěvník zadá odkaz na svůj Steam profil, web načte jeho veřejný seznam přání
// (IWishlistService/GetWishlist – oficiální Steam Web API) a názvy her (IStoreBrowseService/GetItems).
// Web si NEUKLÁDÁ, čí seznam to je: hry se jen přidají do databáze her (ceny, čeština) a mezi sledované aktualizace.
// Seznam „Moje hry“ si drží prohlížeč návštěvníka (localStorage). GOG a Epic veřejné API pro seznam přání nemají.
// Požadavky: 1 (profil) + 1 (seznam) + až 5 (názvy po 100) = nejvýš 7 na jedno načtení; omezeno na 10 načtení za minutu.
import { zajistiSchemaHlidac, prikazyPridejHry, hryPodleId, naHru } from "./hlidac.js";
import { prikazyPridejSledovane, zajistiSchemaPatchu } from "./patche.js";

const MAX_HER = 500;
const UA = "HerniPuls/1.0 (+https://web.hrajemespolu11.workers.dev)";

async function json(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.kod = r.status; throw e; }
  return r.json();
}

// Z textu, který návštěvník vloží, udělá SteamID64 (17 číslic).
async function steamIdZVstupu(env, vstup) {
  const t = String(vstup || "").trim().slice(0, 200);
  let m = /^(\d{17})$/.exec(t) || /steamcommunity\.com\/profiles\/(\d{17})/i.exec(t);
  if (m) return m[1];
  m = /steamcommunity\.com\/id\/([A-Za-z0-9_-]{2,32})/i.exec(t) || /^([A-Za-z0-9_-]{2,32})$/.exec(t);
  if (!m) return null;
  const jmeno = m[1];
  if (env.STEAM_API_KEY) {
    const d = await json(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(env.STEAM_API_KEY)}&vanityurl=${encodeURIComponent(jmeno)}`);
    return d?.response?.success === 1 && /^\d{17}$/.test(d.response.steamid || "") ? d.response.steamid : null;
  }
  // Bez klíče: veřejný XML profil (obsahuje SteamID64).
  const r = await fetch(`https://steamcommunity.com/id/${encodeURIComponent(jmeno)}/?xml=1`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null;
  const x = /<steamID64>(\d{17})<\/steamID64>/.exec((await r.text()).slice(0, 5000));
  return x ? x[1] : null;
}

async function smimNacist(db) {
  const minuta = Math.floor(Date.now() / 60e3);
  const r = await db.prepare(`INSERT INTO nastaveni (klic, hodnota, plati_do) VALUES ('wishlist_limit', '1', ?)
    ON CONFLICT(klic) DO UPDATE SET hodnota = CASE WHEN nastaveni.plati_do = excluded.plati_do THEN CAST(nastaveni.hodnota AS INTEGER) + 1 ELSE 1 END,
      plati_do = excluded.plati_do RETURNING hodnota`).bind(minuta).first();
  return Number(r?.hodnota || 0) <= 10;
}

// /api/wishlist?steam=<odkaz na profil | SteamID64 | vlastní adresa>
export async function apiWishlist(env, vstup) {
  const db = env.DB;
  await zajistiSchemaHlidac(db);
  await zajistiSchemaPatchu(db);
  if (!await smimNacist(db)) return { chyba: "Teď to zkouší moc lidí najednou. Zkus to za minutu.", status: 429 };
  const sid = await steamIdZVstupu(env, vstup).catch(() => null);
  if (!sid) return { chyba: "Tenhle Steam profil jsme nenašli. Vlož odkaz ve tvaru steamcommunity.com/id/jmeno nebo steamcommunity.com/profiles/číslo.", status: 404 };
  let d;
  try { d = await json(`https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${sid}`); }
  catch { return { chyba: "Steam teď seznam přání nevydal. Zkus to za chvíli.", status: 502 }; }
  const polozky = (d?.response?.items || []).filter((x) => Number.isInteger(x.appid)).sort((a, b) => (a.priority || 999) - (b.priority || 999)).slice(0, MAX_HER);
  if (!polozky.length) return { chyba: "Seznam přání je prázdný, nebo je skrytý. Na Steamu: Profil → Upravit profil → Nastavení soukromí → Detaily o hrách: Veřejné.", status: 404 };
  const ids = polozky.map((x) => String(x.appid));
  // Názvy: co už v databázi máme, nehledáme znovu.
  const znam = new Map((await hryPodleId(db, ids)).map((r) => [r.id, r]));
  const chybi = ids.filter((id) => !znam.has(id));
  const nove = [];
  for (let i = 0; i < chybi.length && i < 500; i += 100) {
    const davka = chybi.slice(i, i + 100);
    const vstupJson = JSON.stringify({ ids: davka.map((a) => ({ appid: Number(a) })), context: { language: "czech", country_code: "CZ" }, data_request: { include_basic_info: true } });
    try {
      const g = await json(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(vstupJson)}`);
      for (const it of g?.response?.store_items || []) if (it?.appid && it.name) nove.push({ id: String(it.appid), nazev: String(it.name).slice(0, 160) });
    } catch { /* názvy doplní později katalog */ }
  }
  const ted = Date.now();
  const prikazy = [...prikazyPridejHry(db, nove, ted), ...prikazyPridejSledovane(db, [...nove, ...[...znam.values()].map((r) => ({ id: r.id, nazev: r.nazev }))])];
  for (let i = 0; i < prikazy.length; i += 100) await db.batch(prikazy.slice(i, i + 100));
  const radky = new Map((await hryPodleId(db, ids)).map((r) => [r.id, r]));
  return { pocet: polozky.length, hry: ids.map((id) => radky.get(id)).filter(Boolean).map(naHru) };
}
