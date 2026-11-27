// Data o hře přímo z obchodů – pro stránku /hra/:slug.
//  • Steam (oficiální veřejná data obchodu): cena v Kč, sleva, čeština (rozhraní/titulky, dabing), datum vydání, žánry,
//    hodnocení hráčů (appreviews), Metacritic, počet hráčů právě teď (ISteamUserStats/GetNumberOfCurrentPlayers – oficiální Steam Web API).
//  • GOG: cena v € (GOG v Česku účtuje v eurech), sleva, hodnocení GOG.
//  • Epic: jen jestli je hra právě zdarma nebo bude (z tabulky katalog).
// Hra se páruje podle přesného názvu (bez ™, ®, interpunkce a velikosti písmen) – raději nic než špatná hra.
// Mezipaměť v D1 (hra_info) 12 h. Obnova = max 5 požadavků.

const UA = "HerniPulsBot/0.1 (+https://github.com/HrajemeSpolu11-star/Web)";
const PLATNOST = 12 * 3600e3;
const SCHEMA = `CREATE TABLE IF NOT EXISTS hra_info (slug TEXT PRIMARY KEY, data TEXT NOT NULL, cas INTEGER NOT NULL)`;

const https = (u) => /^https:\/\//.test(String(u || "")) ? String(u) : "";
export const normNazev = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[™®©]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const bezHtml = (s, max = 300) => String(s || "").replace(/<[^>]*>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
  .replace(/&#39;/g, "'").replace(/\s+/g, " ").trim().slice(0, max);

async function json(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${new URL(url).hostname}`);
  return r.json();
}

// Čeština ze seznamu jazyků Steamu (HTML). Jazyky s plným dabingem mají za sebou <strong>*</strong>.
function cestina(jazyky) {
  const t = String(jazyky || "");
  const m = /(čeština|czech)(\s*<strong>\*<\/strong>)?/i.exec(t);
  return { rozhrani: !!m, dabing: !!(m && m[2]) };
}

// Systémové požadavky (PC) ze Steamu: HTML seznam → řádky textu (max 12 na úroveň).
function pozadavky(html) {
  const radky = String(html || "").replace(/<br\s*\/?>|<\/li>|<\/p>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .split("\n").map((r) => r.replace(/\s+/g, " ").trim()).filter((r) => r && !/^(minimum|recommended|minimální|doporučené)[^:]*:?$/i.test(r));
  return radky.slice(0, 12).map((r) => r.slice(0, 140));
}

async function steam(nazev) {
  const hledani = await json(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(nazev)}&l=czech&cc=CZ`);
  const cil = normNazev(nazev);
  const shoda = (hledani?.items || []).find((i) => i.type === "app" && normNazev(i.name) === cil);
  if (!shoda) return null;
  return steamPodleId(shoda.id, shoda);
}

// Údaje o hře podle čísla na Steamu (appid) – jednoznačné, bez párování podle názvu.
async function steamPodleId(id, shoda = {}) {
  const [det, rec, hraci] = await Promise.allSettled([
    json(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=cz&l=czech`),
    json(`https://store.steampowered.com/appreviews/${id}?json=1&language=all&purchase_type=all&num_per_page=0&filter=summary`),
    json(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${id}`),
  ]);
  const d = det.status === "fulfilled" && det.value?.[id]?.success ? det.value[id].data : null;
  const q = rec.status === "fulfilled" ? rec.value?.query_summary : null;
  const p = d?.price_overview;
  return {
    id: String(id), url: `https://store.steampowered.com/app/${id}/`, nazev: d?.name || shoda.name || "",
    vydavatele: (d?.publishers || []).slice(0, 2), typ: d?.type || "",
    obrazek: https(d?.header_image || shoda.tiny_image), popis: bezHtml(d?.short_description, 300),
    zdarma: !!d?.is_free,
    cena: p ? p.final / 100 : null, puvodni: p ? p.initial / 100 : null, sleva: p?.discount_percent || 0, mena: p?.currency || "CZK",
    cestina: d ? cestina(d.supported_languages) : null,
    vydani: d?.release_date?.date || "", chysta_se: !!d?.release_date?.coming_soon,
    zanry: (d?.genres || []).map((g) => g.description).slice(0, 4),
    vyvojari: (d?.developers || []).slice(0, 2), metacritic: d?.metacritic?.score || null,
    platformy: d?.platforms ? Object.entries(d.platforms).filter(([, v]) => v).map(([k]) => k) : [],
    hodnoceni: q && q.total_reviews > 0 ? { kladne: Math.round((q.total_positive / q.total_reviews) * 100), recenzi: q.total_reviews } : null,
    hraci_ted: hraci.status === "fulfilled" && hraci.value?.response?.result === 1 ? hraci.value.response.player_count : null,
    // Oficiální obrázky ze stránky hry: pozadí obchodu, screenshoty a trailery (mp4 u starších, HLS u novějších videí).
    pozadi: https(d?.background_raw || d?.background),
    screenshoty: (d?.screenshots || []).slice(0, 16).map((x) => ({ male: https(x.path_thumbnail), velke: https(x.path_full) })).filter((x) => x.male && x.velke),
    videa: (d?.movies || []).slice(0, 4).map((m) => ({ nazev: String(m.name || "").slice(0, 100), nahled: https(m.thumbnail),
      mp4: https(m.mp4?.max || m.mp4?.["480"]), hls: https(m.hls_h264) })).filter((m) => m.nahled && (m.mp4 || m.hls)),
    pozadavky: d?.pc_requirements && !Array.isArray(d.pc_requirements)
      ? { min: pozadavky(d.pc_requirements.minimum), dop: pozadavky(d.pc_requirements.recommended) } : null,
  };
}

async function gog(nazev) {
  const d = await json(`https://catalog.gog.com/v1/catalog?limit=5&query=like:${encodeURIComponent(nazev)}&productType=in:game,pack&countryCode=CZ&locale=en-US&currencyCode=EUR`);
  const cil = normNazev(nazev);
  const p = (d?.products || []).find((x) => normNazev(x.title) === cil);
  if (!p) return null;
  const num = (m) => (m && m.amount != null ? Number(m.amount) : null);
  return {
    id: String(p.id), url: https(p.storeLink) || `https://www.gog.com/game/${encodeURIComponent(p.slug || "")}`,
    cena: num(p.price?.finalMoney), puvodni: num(p.price?.baseMoney), mena: p.price?.finalMoney?.currency || "EUR",
    sleva: Math.abs(parseInt(String(p.price?.discount || "0").replace(/[^0-9-]/g, ""), 10) || 0),
    hodnoceni: p.reviewsRating ? (p.reviewsRating > 5 ? Math.round(p.reviewsRating) / 10 : Math.round(p.reviewsRating * 10) / 10) : null, // 0–5 hvězd
  };
}

async function epic(db, nazev) {
  const cil = normNazev(nazev);
  const { results } = await db.prepare("SELECT klic, data FROM katalog WHERE klic IN ('epic_zdarma', 'epic_brzy')").all();
  for (const r of results) {
    let list = [];
    try { list = JSON.parse(r.data); } catch { /* nic */ }
    const h = list.find((x) => normNazev(x.nazev) === cil);
    if (h) return { url: h.url, zdarma_ted: r.klic === "epic_zdarma", od: h.od, do: h.do };
  }
  return null;
}

async function stahni(db, nazev) {
  const [s, g, e] = await Promise.allSettled([steam(nazev), gog(nazev), epic(db, nazev)]);
  const chyby = [s, g, e].filter((x) => x.status === "rejected").map((x) => String(x.reason?.message || x.reason).slice(0, 100));
  return { steam: s.value || null, gog: g.value || null, epic: e.value || null, chyby, cas: new Date().toISOString() };
}

// Stránka hry podle Steam ID: Steam podle čísla, GOG a Epic podle přesného názvu ze Steamu.
async function stahniPodleId(db, id) {
  const st = await steamPodleId(id);
  if (!st?.nazev || (st.typ && st.typ !== "game")) return { steam: st?.nazev ? st : null, gog: null, epic: null, chyby: [], cas: new Date().toISOString() };
  const [g, e] = await Promise.allSettled([gog(st.nazev), epic(db, st.nazev)]);
  return { steam: st, gog: g.value || null, epic: e.value || null, chyby: [g, e].filter((x) => x.status === "rejected").map((x) => String(x.reason?.message || x.reason).slice(0, 100)), cas: new Date().toISOString() };
}
export async function infoHrySteam(env, ctx, id) {
  if (!/^\d{1,10}$/.test(String(id))) return null;
  const db = env.DB;
  await db.prepare(SCHEMA).run();
  await db.prepare("CREATE TABLE IF NOT EXISTS katalog (klic TEXT PRIMARY KEY, data TEXT NOT NULL, cas INTEGER NOT NULL)").run();
  const klic = `steam-${id}`;
  const r = await db.prepare("SELECT data, cas FROM hra_info WHERE slug = ?").bind(klic).first();
  const uloz = async () => {
    const data = await stahniPodleId(db, id);
    if (!data.steam && r) return JSON.parse(r.data);
    if (data.steam) await db.prepare("INSERT OR REPLACE INTO hra_info (slug, data, cas) VALUES (?, ?, ?)").bind(klic, JSON.stringify(data), Date.now()).run();
    return data;
  };
  if (!r) return uloz().catch(() => null);
  if (Date.now() - r.cas > PLATNOST || !/"screenshoty"/.test(r.data)) ctx.waitUntil(uloz().catch((e) => console.error("hra_info steam:", e)));
  try { return JSON.parse(r.data); } catch { return null; }
}

// Vrátí data z mezipaměti; chybějící stáhne hned, zastaralá obnoví na pozadí.
export async function infoHry(env, ctx, slug, nazev) {
  const db = env.DB;
  await db.prepare(SCHEMA).run();
  await db.prepare("CREATE TABLE IF NOT EXISTS katalog (klic TEXT PRIMARY KEY, data TEXT NOT NULL, cas INTEGER NOT NULL)").run();
  const r = await db.prepare("SELECT data, cas FROM hra_info WHERE slug = ?").bind(slug).first();
  const uloz = async () => {
    const data = await stahni(db, nazev);
    // Když obchody jen selhaly, starší data nepřepisujeme.
    if (r && !data.steam && !data.gog && data.chyby.length) return JSON.parse(r.data);
    await db.prepare("INSERT OR REPLACE INTO hra_info (slug, data, cas) VALUES (?, ?, ?)").bind(slug, JSON.stringify(data), Date.now()).run();
    return data;
  };
  if (!r) return uloz().catch(() => null);
  // Starší záznamy bez obrázků (před 27. 11.) se obnoví hned na pozadí.
  if (Date.now() - r.cas > PLATNOST || (/"steam":\{/.test(r.data) && !/"screenshoty"/.test(r.data))) ctx.waitUntil(uloz().catch((e) => console.error("hra_info:", e)));
  try { return JSON.parse(r.data); } catch { return null; }
}
