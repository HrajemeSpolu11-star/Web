// Herní katalog z veřejných dat obchodů: Steam, Epic Games Store, GOG.
// Obnovuje se jednou za hodinu (cron "25 * * * *"), výsledek se ukládá do D1 (tabulka katalog).
// Jeden běh ≈ 33 požadavků: Steam 1 + hodnocení 8 + žebříček 1 + detaily 10 + hodnocení 10 + Epic 1 + GOG 2.
// Endpointy jsou veřejné (stejné, které používají weby obchodů), ale neoficiální –
// každý obchod se zpracovává zvlášť, takže výpadek jednoho nerozbije ostatní.

import { zajistiSchemaHlidac, prikazyUlozHry, doplnSteamUdaje } from "./hlidac.js";

const UA = "HerniPulsBot/0.1 (+https://github.com/HrajemeSpolu11-star/Web)";
const SCHEMA = `CREATE TABLE IF NOT EXISTS katalog (klic TEXT PRIMARY KEY, data TEXT NOT NULL, cas INTEGER NOT NULL)`;
const NEJHRANEJSICH = 10; // kolik her z žebříčku Steamu doplnit o název (1 požadavek na hru)

const https = (u) => /^https:\/\//.test(String(u || "")) ? String(u) : "";
const txt = (s, max = 120) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function json(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${new URL(url).hostname}`);
  return r.json();
}

// Cena ze Steamu je v setinách (CZK: 129900 = 1 299 Kč).
const steamCena = (c) => (typeof c === "number" ? Math.round(c) / 100 : null);

function steamPolozka(i) {
  return {
    id: String(i.id), nazev: txt(i.name), url: `https://store.steampowered.com/app/${encodeURIComponent(i.id)}/`,
    obrazek: https(i.large_capsule_image || i.header_image || i.small_capsule_image),
    sleva: i.discount_percent || 0, cena: steamCena(i.final_price), puvodni: steamCena(i.original_price),
    mena: i.currency || "CZK", konecSlevy: i.discount_expiration ? new Date(i.discount_expiration * 1000).toISOString() : null,
    obchod: "steam",
  };
}

// Hodnocení hráčů ze Steamu: procento kladných recenzí a jejich počet (1 požadavek na hru).
async function hodnoceni(ids) {
  const r = await Promise.allSettled(ids.map((id) =>
    json(`https://store.steampowered.com/appreviews/${encodeURIComponent(id)}?json=1&language=all&purchase_type=all&num_per_page=0&filter=summary`)));
  return ids.map((_, i) => {
    const q = r[i].status === "fulfilled" ? r[i].value?.query_summary : null;
    return q && q.total_reviews > 0 ? { kladne: Math.round((q.total_positive / q.total_reviews) * 100), recenzi: q.total_reviews } : null;
  });
}
const HODNOTIT_TOP = 8;

async function steam() {
  const d = await json("https://store.steampowered.com/api/featuredcategories?cc=cz&l=czech");
  const list = (k) => (d?.[k]?.items || []).filter((i) => i && i.id && i.name).map(steamPolozka);
  const slevy = list("specials");
  const top = list("top_sellers").slice(0, 15);
  const h = await hodnoceni(top.slice(0, HODNOTIT_TOP).map((t) => t.id));
  h.forEach((x, i) => { if (x) top[i].hodnoceni = x; });
  return {
    steam_slevy: slevy.filter((i) => i.sleva > 0 && i.sleva < 100).slice(0, 20),
    steam_zdarma: slevy.filter((i) => i.sleva === 100).slice(0, 10),
    steam_top: top,
    steam_nove: list("new_releases").slice(0, 15),
    steam_brzy: list("coming_soon").slice(0, 15),
  };
}

async function steamNejhranejsi() {
  const d = await json("https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/");
  const ranks = (d?.response?.ranks || []).slice(0, NEJHRANEJSICH);
  const [detaily, hod] = await Promise.all([
    Promise.allSettled(ranks.map((r) => json(`https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(r.appid)}&cc=cz&l=czech&filters=basic`))),
    hodnoceni(ranks.map((r) => r.appid)),
  ]);
  return {
    steam_hrane: ranks.map((r, i) => {
      const det = detaily[i].status === "fulfilled" ? detaily[i].value?.[r.appid]?.data : null;
      return {
        id: String(r.appid), poradi: r.rank, hracu: r.peak_in_game || r.concurrent_in_game || null,
        nazev: txt(det?.name || `Hra ${r.appid}`), obrazek: https(det?.header_image),
        url: `https://store.steampowered.com/app/${encodeURIComponent(r.appid)}/`, obchod: "steam", hodnoceni: hod[i] || undefined,
      };
    }).filter((h) => !h.nazev.startsWith("Hra ")),
  };
}

function epicSlug(e) {
  return e.productSlug && e.productSlug !== "[]" ? e.productSlug
    : e.offerMappings?.[0]?.pageSlug || e.catalogNs?.mappings?.[0]?.pageSlug || "";
}
async function epic() {
  const d = await json("https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=cs&country=CZ&allowCountries=CZ");
  const ted = Date.now();
  const zdarma = [], brzy = [];
  for (const e of d?.data?.Catalog?.searchStore?.elements || []) {
    const obr = e.keyImages?.find((k) => k.type === "OfferImageWide") || e.keyImages?.find((k) => k.type === "DieselStoreFrontWide") || e.keyImages?.[0];
    const slug = epicSlug(e);
    const zaklad = { id: e.id, nazev: txt(e.title), obrazek: https(obr?.url), obchod: "epic",
      url: slug ? `https://store.epicgames.com/cs/p/${encodeURIComponent(slug).replace(/%2F/g, "/")}` : "https://store.epicgames.com/cs/free-games" };
    const ted0 = e.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0];
    const pozdeji = e.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers?.[0];
    const zdarmaTed = ted0 && ted0.discountSetting?.discountPercentage === 0 && Date.parse(ted0.startDate) <= ted && Date.parse(ted0.endDate) > ted;
    if (zdarmaTed) zdarma.push({ ...zaklad, od: ted0.startDate, do: ted0.endDate });
    else if (pozdeji && pozdeji.discountSetting?.discountPercentage === 0) brzy.push({ ...zaklad, od: pozdeji.startDate, do: pozdeji.endDate });
  }
  return { epic_zdarma: zdarma, epic_brzy: brzy };
}

function gogPolozka(p) {
  const fin = p.price?.finalMoney, base = p.price?.baseMoney;
  const num = (m) => (m && m.amount != null ? Number(m.amount) : null);
  return {
    id: String(p.id), nazev: txt(p.title), obrazek: https(p.coverHorizontal || p.coverVertical),
    url: https(p.storeLink) || (p.slug ? `https://www.gog.com/cs/game/${encodeURIComponent(p.slug)}` : "https://www.gog.com"),
    cena: num(fin), puvodni: num(base), mena: fin?.currency || "EUR",
    sleva: Math.abs(parseInt(String(p.price?.discount || fin?.discount || "0").replace(/[^0-9-]/g, ""), 10) || 0),
    obchod: "gog",
  };
}
async function gog() {
  // GOG neprodává v Kč – v Česku účtuje v eurech. currencyCode=CZK vracel chybu a obě sekce zůstaly prázdné.
  const zaklad = "https://catalog.gog.com/v1/catalog?productType=in:game,pack&countryCode=CZ&locale=en-US&currencyCode=EUR&limit=48";
  const [trend, slevy] = await Promise.allSettled([json(`${zaklad}&order=desc:trending`), json(`${zaklad}&order=desc:discount`)]);
  if (trend.status === "rejected" && slevy.status === "rejected") throw new Error(`GOG: ${trend.reason?.message || trend.reason}`);
  const seznam = (r) => (r.status === "fulfilled" ? r.value?.products || [] : []).map(gogPolozka).filter((p) => p.nazev);
  return {
    gog_trend: seznam(trend).slice(0, 15),
    gog_slevy: seznam(slevy).filter((p) => p.sleva > 0).slice(0, 20),
  };
}

export async function sberKatalogu(env) {
  const db = env.DB;
  await db.prepare(SCHEMA).run();
  const ted = Date.now();
  const nazvy = ["Steam", "Steam žebříček", "Epic", "GOG"];
  const casti = await Promise.allSettled([steam(), steamNejhranejsi(), epic(), gog()]);
  const prikazy = [];
  const chyby = [];
  for (const [i, c] of casti.entries()) {
    if (c.status === "rejected") { chyby.push(`${nazvy[i]}: ${String(c.reason?.message || c.reason).slice(0, 120)}`); continue; }
    for (const [klic, data] of Object.entries(c.value)) {
      // Prázdný výsledek nepřepíše starší data (obchod mohl mít výpadek).
      if (!Array.isArray(data) || (!data.length && klic !== "epic_brzy" && klic !== "steam_zdarma")) continue;
      prikazy.push(db.prepare("INSERT OR REPLACE INTO katalog (klic, data, cas) VALUES (?, ?, ?)").bind(klic, JSON.stringify(data), ted));
    }
  }
  prikazy.push(db.prepare("INSERT OR REPLACE INTO katalog (klic, data, cas) VALUES ('stav', ?, ?)").bind(JSON.stringify({ chyby }), ted));
  // Hry ze Steamu jdou i do databáze her (čeština, historie cen, hlídač). Zápis jen při změně.
  await zajistiSchemaHlidac(db);
  const steamHry = casti.filter((c) => c.status === "fulfilled").flatMap((c) => Object.entries(c.value))
    .filter(([k, v]) => k.startsWith("steam_") && Array.isArray(v)).flatMap(([, v]) => v);
  prikazy.push(...prikazyUlozHry(db, steamHry, ted));
  await db.batch(prikazy);
  return { ulozeno: prikazy.length - 1, chyby };
}

export async function apiKatalog(env) {
  const db = env.DB;
  await db.prepare(SCHEMA).run();
  const { results } = await db.prepare("SELECT klic, data, cas FROM katalog").all();
  const out = { cas: null };
  for (const r of results) {
    try { out[r.klic] = JSON.parse(r.data); } catch { out[r.klic] = []; }
    if (r.klic === "stav") out.cas = new Date(r.cas).toISOString();
  }
  // Doplní češtinu a nejnižší cenu za 90 dní ke hrám ze Steamu.
  const steamKlice = Object.keys(out).filter((k) => k.startsWith("steam_") && Array.isArray(out[k]));
  const udaje = await doplnSteamUdaje(db, steamKlice.flatMap((k) => out[k].map((h) => h.id))).catch(() => new Map());
  for (const k of steamKlice) for (const h of out[k]) {
    const u = udaje.get(String(h.id));
    if (u) { h.cestina = u.cestina; h.min90 = u.min90; }
  }
  return out;
}

// Spustí sběr, pokud data chybí nebo jsou starší než 2 hodiny (při první návštěvě po nasazení).
export async function sberKataloguPokudStary(env) {
  const db = env.DB;
  await db.prepare(SCHEMA).run();
  const st = await db.prepare("SELECT cas FROM katalog WHERE klic = 'stav'").first();
  if (st && Date.now() - st.cas < 2 * 3600e3) return;
  const zamek = await db.prepare(`INSERT INTO nastaveni (klic, hodnota, plati_do) VALUES ('katalog_zamek', '', ?)
    ON CONFLICT(klic) DO UPDATE SET plati_do = excluded.plati_do WHERE nastaveni.plati_do < ?`).bind(Date.now() + 120e3, Date.now()).run();
  if (!zamek.meta?.changes) return;
  await sberKatalogu(env);
}
