// Herní puls – Worker: statický web + API + sběrač novinek + AI psaní + admin.
import { ZDROJE } from "./zdroje.js";
import { sber, zajistiSchema } from "./sber.js";
import { napisClanek } from "./psani.js";
import { overAdmina } from "./access.js";
import { adminApi } from "./admin.js";
import { sberTwitch, sberTwitchPokudStary, zajistiSchemaTwitch, slugHry } from "./twitch.js";
import { sberKick, kickNastaven } from "./kick.js";
import { extraTwitch } from "./extra.js";
import { jeStranka, vykresliStranku, sitemap, robots } from "./seo.js";
import { pushApi } from "./push.js";
import { apiPrehled } from "./prehled.js";
import { zMezipameti } from "./mezipamet.js";
import { apiKatalog, sberKatalogu, sberKataloguPokudStary } from "./katalog.js";
import { apiObsah, sberObsahu } from "./obsah.js";
import { apiCesko, apiReport } from "./statistiky.js";
import { infoHry, infoHrySteam } from "./hra-data.js";
import { apiCestina, apiSteamHry, doplnSteamUdaje, prikazyUlozHry, zajistiSchemaHlidac } from "./hlidac.js";
import { zajistiSchemaObsah } from "./obsah.js";
import { denPraha } from "./psani.js";
import { behUlohy, uklidDeniku, apiStavSystemu } from "./denik.js";
import { apiStudia, apiStudio, sberStudii } from "./studia.js";
import { apiAkce, obnovObrazkyAkci } from "./akce.js";
import { apiVydani, sberVydani } from "./vydani.js";
import { apiRanni, generujRanni } from "./ranni.js";
import { apiAktualizace, sberPatchu, shrnPatch, sestavSledovane } from "./patche.js";
import { apiVyroci, sberVyroci } from "./vyroci.js";
import { apiCoHrat, apiVyssiNizsi } from "./nastroje.js";
import { apiCeskaScena } from "./studia.js";
import { apiRadar } from "./radar.js";
import { sestavTrendy, apiTrendy, apiCenovyRadar, apiAnalytika } from "./trendy.js";
import { doplnPas, apiSrovnani } from "./pas.js";
import { apiHraDatabaze, apiHledatDatabaze, apiPopularniDatabaze, sestavPopularni, prelozPopularni } from "./databaze.js";
import { propojHry, hryVTextu, zajistiSchemaPropojeni } from "./propojeni.js";
import { kontrolaSledovanych, apiMojeHry } from "./sledovani.js";
import { apiHledatFiltry, filtryDatabaze } from "./hledani.js";
import { apiHitparada, poziceStreamera, historieHryVHitparade } from "./hitparada.js";
import { apiZprava } from "./zprava.js";
import { pondeli, isoTyden } from "./statistiky.js";
import { apiWishlist } from "./wishlist.js";

const PLATFORMY = new Set(["PC", "PS5", "Xbox", "Switch"]);
const ZDROJ_PODLE_ID = Object.fromEntries(ZDROJE.map((z) => [z.id, z]));
const BARVY = [["#ff7a3d", "#5a1a0a"], ["#7c5cff", "#0c0a2a"], ["#3fbf7f", "#0a2a1a"], ["#2fa8ff", "#06182e"],
  ["#1ec8c8", "#031c22"], ["#ff4d9a", "#2a0618"], ["#f2b631", "#2e2104"], ["#e2554b", "#2b0806"]];
const CRON_PSANI = "7 * * * *";
const CRON_TWITCH = "5,20,35,50 * * * *";
const CRON_KATALOG = "25 * * * *";
const CRON_OBSAH = "40 * * * *";
const ZIVE_PLATNOST = 25 * 60e3; // stream je „živě“, pokud ho Twitch vrátil v posledních 25 min
// Adresář ukazuje každého streamera, který se objevil živě (kromě ručně skrytých).
const KVALITA = "s.skryty = 0";

const BEZPECNE_HLAVICKY = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function json(data, status = 200, cacheSec = 0, dalsi = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...BEZPECNE_HLAVICKY, "Cache-Control": cacheSec ? `public, max-age=${cacheSec}` : "no-store", ...dalsi },
  });
}

// Jednoduchý limit hledání v IGDB v rámci jedné instance Workeru (okno 1 minuta).
let hledaniOkno = { od: 0, n: 0 };
function limitHledani(max = 40) {
  const ted = Date.now();
  if (ted - hledaniOkno.od > 60e3) hledaniOkno = { od: ted, n: 0 };
  return ++hledaniOkno.n <= max;
}

function barvaPodle(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BARVY[h % BARVY.length];
}
const parse = (s, z) => { try { return JSON.parse(s || ""); } catch { return z; } };

// Zpráva z RSS → tvar pro web.
function naClanek(r) {
  const z = ZDROJ_PODLE_ID[r.zdroj_id] || { nazev: r.zdroj_id };
  return {
    id: r.id, nadpis: r.nadpis, perex: r.perex || "", obrazek: r.obrazek || "",
    url: r.url, datum: new Date(r.datum).toISOString(), platformy: parse(r.platformy, []), typ: r.typ || "Zpráva",
    jazyk: r.jazyk, zdroje: [{ nazev: z.nazev, url: r.url }], barva: barvaPodle(r.zdroj_id), ai: false, vlastni: false,
  };
}
// Vlastní článek (AI nebo ruční) → tvar pro web.
function naPrispevek(r) {
  return {
    id: r.id, nadpis: r.nadpis, perex: r.perex || "", md: r.text || "", obrazek: r.obrazek || "",
    datum: new Date(r.publikovano || r.vytvoreno).toISOString(), platformy: parse(r.platformy, []), typ: r.typ || "Zpráva",
    jazyk: "cs", zdroje: parse(r.zdroje, []), barva: barvaPodle(r.id), ai: r.autor === "ai", vlastni: true,
  };
}

async function apiClanky(url, env) {
  const p = url.searchParams;
  const limit = Math.min(Math.max(parseInt(p.get("limit") || "60", 10) || 60, 1), 100);
  const platforma = p.get("platforma");
  const q = (p.get("q") || "").slice(0, 80).trim();
  const jazyk = p.get("jazyk");
  // Archiv: ?pred=<čas v ms> → zprávy starší než tenhle okamžik (stránkování „Načíst starší zprávy“).
  const pred = Math.min(parseInt(p.get("pred") || "", 10) || 0, Date.now() + 3600e3);

  // Všechny vstupy jdou do SQL pouze přes bind() – žádné skládání dotazu z textu.
  const kdeR = [], hodR = [], kdeV = ["stav = 'publikovano'"], hodV = [];
  if (platforma && PLATFORMY.has(platforma)) {
    kdeR.push("platformy LIKE ?"); hodR.push(`%"${platforma}"%`);
    kdeV.push("platformy LIKE ?"); hodV.push(`%"${platforma}"%`);
  }
  if (jazyk === "cs" || jazyk === "en") { kdeR.push("jazyk = ?"); hodR.push(jazyk); }
  if (pred > 0) { kdeR.push("datum < ?"); hodR.push(pred); kdeV.push("COALESCE(publikovano, vytvoreno) < ?"); hodV.push(pred); }
  if (q) {
    kdeR.push("(nadpis LIKE ? OR perex LIKE ?)"); hodR.push(`%${q}%`, `%${q}%`);
    kdeV.push("(nadpis LIKE ? OR perex LIKE ? OR text LIKE ?)"); hodV.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const dotazy = [env.DB.prepare(`SELECT * FROM clanky ${kdeR.length ? "WHERE " + kdeR.join(" AND ") : ""} ORDER BY datum DESC LIMIT ?`).bind(...hodR, limit)];
  if (jazyk !== "en") dotazy.push(env.DB.prepare(`SELECT * FROM prispevky WHERE ${kdeV.join(" AND ")} ORDER BY publikovano DESC LIMIT ?`).bind(...hodV, limit));
  const [rss, vlastni] = await env.DB.batch(dotazy);
  const vse = [...(vlastni?.results || []).map(naPrispevek), ...rss.results.map(naClanek)]
    .sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, limit);
  return json(vse, 200, 60);
}

async function apiClanek(id, env) {
  if (/^p[0-9a-f]{15}$/.test(id)) {
    const r = await env.DB.prepare("SELECT * FROM prispevky WHERE id = ? AND stav = 'publikovano'").bind(id).first();
    return r ? json({ ...naPrispevek(r), hry: await hryVTextu(env.DB, `${r.nadpis} ${r.perex || ""}`).catch(() => []) }, 200, 60) : json({ chyba: "Nenalezeno" }, 404);
  }
  if (!/^[0-9a-f]{24}$/.test(id)) return json({ chyba: "Neplatné id" }, 400);
  const r = await env.DB.prepare("SELECT * FROM clanky WHERE id = ?").bind(id).first();
  return r ? json({ ...naClanek(r), hry: await hryVTextu(env.DB, `${r.nadpis} ${r.perex || ""}`).catch(() => []) }, 200, 300) : json({ chyba: "Nenalezeno" }, 404);
}

// ---------- Streameři ----------
function naStreamera(r, ted) {
  const zive = !!(r.zive_cas && r.zive_cas > ted - ZIVE_PLATNOST);
  return {
    platforma: r.platforma || "twitch", login: r.login, jmeno: r.jmeno || r.login, profilovka: r.profilovka || "", partner: r.typ === "partner",
    sledujici: r.sledujici ?? null, max_divaku: r.max_divaku || 0, posledni_hra: r.posledni_hra || "",
    zive, divaci: zive ? r.zive_divaci : null, hra: zive ? r.zive_hra : null, titulek: zive ? r.zive_titulek : null,
    zacatek: zive ? r.zive_zacatek : null, // Parametr ?t= jen u adres bez vlastních parametrů – podepsané adresy náhledů (Kick) by se jím rozbily.
    nahled: zive && r.zive_nahled ? (String(r.zive_nahled).includes("?") ? r.zive_nahled : `${r.zive_nahled}?t=${Math.floor(r.zive_cas / 60e3)}`) : "",
    minut30: r.minut30 ?? undefined, rust30: r.rust30 ?? undefined,
    odkazy: parse(r.odkazy, undefined),
  };
}

// Všichni živí čeští streameři (sběr bere až 600 streamů z Twitche + Kick) – žádné omezení na „velké“.
async function apiZive(env) {
  const ted = Date.now();
  const [st, hry] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM streameri s WHERE s.skryty = 0 AND s.zive_cas > ? ORDER BY s.zive_divaci DESC LIMIT 600`).bind(ted - ZIVE_PLATNOST),
    env.DB.prepare(`SELECT zive_hra AS hra, SUM(zive_divaci) AS divaci, COUNT(*) AS streamu FROM streameri
                    WHERE skryty = 0 AND zive_cas > ? AND zive_hra <> '' GROUP BY zive_hra ORDER BY divaci DESC LIMIT 12`).bind(ted - ZIVE_PLATNOST),
  ]);
  // Prázdný výsledek se necachuje, aby se data ukázala hned po prvním sběru.
  return json({ streamy: st.results.map((r) => naStreamera(r, ted)), hry: hry.results, cas: new Date(ted).toISOString() }, 200, st.results.length ? 60 : 0);
}

async function apiStreameri(url, env) {
  const ted = Date.now();
  const p = url.searchParams;
  const razeni = ["sledujici", "divaci", "hodiny", "rust"].includes(p.get("razeni")) ? p.get("razeni") : "sledujici";
  const q = (p.get("q") || "").slice(0, 40).trim();
  const hra = (p.get("hra") || "").slice(0, 120).trim();
  const platforma = ["twitch", "kick"].includes(p.get("platforma")) ? p.get("platforma") : "";
  const kde = [KVALITA], hod = [];
  if (platforma) { kde.push("s.platforma = ?"); hod.push(platforma); }
  if (q) { kde.push("(s.jmeno LIKE ? OR s.login LIKE ?)"); hod.push(`%${q}%`, `%${q}%`); }
  if (hra) { kde.push("EXISTS (SELECT 1 FROM hry_streamera h WHERE h.user_id = s.id AND h.hra = ?)"); hod.push(hra); }
  const poradi = {
    sledujici: "s.sledujici IS NULL, s.sledujici DESC",
    divaci: "s.max_divaku DESC",
    hodiny: "minut30 DESC",
    rust: "rust30 IS NULL, rust30 DESC",
  }[razeni];
  const sql = `SELECT s.*,
      (SELECT COALESCE(SUM(minut), 0) FROM snimky n WHERE n.user_id = s.id AND n.den >= date('now', '-30 day')) AS minut30,
      s.sledujici - (SELECT n.sledujici FROM snimky n WHERE n.user_id = s.id AND n.sledujici IS NOT NULL
                     AND n.den >= date('now', '-30 day') ORDER BY n.den LIMIT 1) AS rust30
    FROM streameri s WHERE ${kde.join(" AND ")}
    ORDER BY (s.zive_cas > ?) DESC, ${poradi} LIMIT 300`;
  const { results } = await env.DB.prepare(sql).bind(...hod, ted - ZIVE_PLATNOST).all();
  return json(results.map((r) => naStreamera(r, ted)), 200, results.length ? 60 : 0);
}

async function apiStreamer(platforma, login, env) {
  if (!["twitch", "kick"].includes(platforma) || !/^[a-z0-9_-]{1,30}$/i.test(login)) return json({ chyba: "Neplatné jméno" }, 400);
  const ted = Date.now();
  const r = await env.DB.prepare("SELECT * FROM streameri s WHERE s.platforma = ? AND s.login = ? AND s.skryty = 0 ORDER BY s.posledni_zive DESC LIMIT 1")
    .bind(platforma, login.toLowerCase()).first();
  if (!r) return json({ chyba: "Nenalezeno" }, 404);
  await zajistiSchemaPropojeni(env.DB);
  const [sn, hry] = await env.DB.batch([
    env.DB.prepare("SELECT den, sledujici, max_divaku, minut FROM snimky WHERE user_id = ? AND den >= date('now', '-90 day') ORDER BY den").bind(r.id),
    env.DB.prepare(`SELECT x.hra, x.minut, (SELECT h.igdb_slug FROM hry h WHERE h.nazev = x.hra LIMIT 1) AS igdb_slug
      FROM hry_streamera x WHERE x.user_id = ? ORDER BY x.minut DESC LIMIT 8`).bind(r.id),
  ]);
  const od30 = new Date(ted - 30 * 86400e3).toISOString().slice(0, 10);
  return json({
    ...naStreamera(r, ted),
    popis: r.popis || "", banner: r.banner || "", ucet_od: r.ucet_od, overeno: !!r.overeno,
    prvni_videno: r.prvni_videno ? new Date(r.prvni_videno).toISOString() : null,
    posledni_zive: r.posledni_zive ? new Date(r.posledni_zive).toISOString() : null,
    streamu: r.pocet_streamu || 0, typ: r.typ || "",
    // Od kdy máme vlastní měření tohoto streamera (dřív nic nevíme – nedomýšlíme).
    mereno_od: sn.results[0]?.den || null,
    hodin30: Math.round(sn.results.filter((x) => x.den >= od30).reduce((a, x) => a + (x.minut || 0), 0) / 60),
    snimky: sn.results, hry: hry.results.map((h) => ({ ...h, slug: slugHry(h.hra) })),
    hitparada: await poziceStreamera(env.DB, platforma, login.toLowerCase()).catch(() => null),
    aktualizovano: { profil: r.profil_cas ? new Date(r.profil_cas).toISOString() : null, sledujici: r.sledujici_cas ? new Date(r.sledujici_cas).toISOString() : null },
  }, 200, 120);
}

// ---------- Hry ----------
async function apiHry(env) {
  const ted = Date.now();
  // Živé streamy se sečtou jednou pro všechny hry (dřív se pro každou hru znovu procházeli všichni živí streameři –
  // při stovkách her to byly statisíce přečtených řádků na jedno načtení; zátěžový test 2026-11-27).
  // Počty streamerů u her se mění pomalu → jednou za 6 h do sdílené mezipaměti (čtou celou historii hry_streamera).
  const pocty = await zMezipameti(env.DB, "hry_streameru", 6 * 3600e3, async () => Object.fromEntries((await env.DB.prepare(
    `SELECT x.hra, COUNT(*) AS n FROM hry_streamera x WHERE x.hra IN (SELECT nazev FROM hry WHERE posledni > ?) GROUP BY x.hra`)
    .bind(ted - 30 * 86400e3).all()).results.map((r) => [r.hra, r.n])));
  const { results: radky } = await env.DB.prepare(`
    SELECT h.slug, h.nazev, COALESCE(z.zive, 0) AS zive, COALESCE(z.divaci, 0) AS divaci
    FROM hry h LEFT JOIN (SELECT zive_hra, COUNT(*) AS zive, SUM(zive_divaci) AS divaci FROM streameri
      WHERE skryty = 0 AND zive_cas > ?1 GROUP BY zive_hra) z ON z.zive_hra = h.nazev
    WHERE h.posledni > ?2`).bind(ted - ZIVE_PLATNOST, ted - 30 * 86400e3).all();
  const results = radky.map((r) => ({ ...r, streameru: pocty[r.nazev] || 0 }))
    .sort((a, b) => b.divaci - a.divaci || b.streameru - a.streameru).slice(0, 120);
  return json(results, 200, results.length ? 120 : 0);
}

// Název hry jako celé slovo: „Rust“ ano, „Trust“ ne.
function celyNazev(nazev) {
  const n = String(nazev || "").replace(/[™®©]/g, "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${n}(?![\\p{L}\\p{N}])`, "iu");
}
async function apiHra(slug, env, ctx) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ chyba: "Neplatná hra" }, 400);
  const ted = Date.now();
  await zajistiSchemaTwitch(env.DB);
  await zajistiSchemaObsah(env.DB);
  await zajistiSchemaPropojeni(env.DB);
  const h = await env.DB.prepare("SELECT slug, nazev, twitch_id, igdb_slug FROM hry WHERE slug = ?").bind(slug).first();
  if (!h) return json({ chyba: "Nenalezeno" }, 404);
  return hraOdpoved(env, ctx, h, infoHry(env, ctx, h.slug, h.nazev).catch(() => null), ted);
}

// Stránka libovolné hry ze Steamu (/hra/steam/:appid). Když ji někdo z Česka streamuje, přidají se statistiky ze streamů.
async function apiHraSteam(id, env, ctx) {
  if (!/^\d{1,10}$/.test(id)) return json({ chyba: "Neplatná hra" }, 400);
  const ted = Date.now();
  await zajistiSchemaTwitch(env.DB);
  await zajistiSchemaObsah(env.DB);
  const info = await infoHrySteam(env, ctx, id).catch(() => null);
  if (!info?.steam?.nazev) return json({ chyba: "Nenalezeno" }, 404);
  const tw = await env.DB.prepare("SELECT slug, nazev, twitch_id FROM hry WHERE nazev = ? COLLATE NOCASE LIMIT 1").bind(info.steam.nazev).first();
  const h = tw || { slug: null, nazev: info.steam.nazev, twitch_id: null };
  return hraOdpoved(env, ctx, h, Promise.resolve(info), ted, id);
}

// Česká scéna kolem hry (podle názvu kategorie na Twitchi/Kicku): kdo ji právě streamuje, hodiny sledování, klipy, novinky.
async function scenaHry(env, h, ted) {
  const q = `%${h.nazev}%`;
  const od30 = new Date(ted - 30 * 86400e3).toISOString().slice(0, 10), od7 = denPraha(ted - 6 * 86400e3);
  const [zive, nejvic, rss, vl, dny, klipy] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM streameri s WHERE s.skryty = 0 AND s.zive_cas > ? AND s.zive_hra = ? COLLATE NOCASE ORDER BY s.zive_divaci DESC LIMIT 50").bind(ted - ZIVE_PLATNOST, h.nazev),
    env.DB.prepare(`SELECT s.*, x.minut AS minut_hra FROM hry_streamera x JOIN streameri s ON s.id = x.user_id
                    WHERE x.hra = ? AND s.skryty = 0 ORDER BY x.minut DESC LIMIT 20`).bind(h.nazev),
    env.DB.prepare("SELECT * FROM clanky WHERE nadpis LIKE ? ORDER BY datum DESC LIMIT 10").bind(q),
    env.DB.prepare("SELECT * FROM prispevky WHERE stav = 'publikovano' AND (nadpis LIKE ? OR perex LIKE ?) ORDER BY publikovano DESC LIMIT 10").bind(q, q),
    env.DB.prepare("SELECT den, SUM(divako_minut) AS dm, MAX(max_divaku) AS spicka, MAX(max_streamu) AS streamu FROM hry_den WHERE hra = ? AND den >= ? GROUP BY den ORDER BY den").bind(h.nazev, od30),
    env.DB.prepare(`SELECT k.url, k.nazev, k.nahled, k.zhlednuti, k.delka, k.cas, s.jmeno, s.login, s.platforma, s.profilovka FROM klipy k
      JOIN streameri s ON s.id = k.streamer_id WHERE k.hra_id = ? AND s.skryty = 0 ORDER BY k.zhlednuti DESC LIMIT 8`).bind(h.twitch_id || "-"),
  ]);
  const tyden = dny.results.filter((d) => d.den >= od7);
  // Historie hry v Česku: hodiny sledování po týdnech od začátku měření + pozice v hitparádě.
  const [vse, hp] = await Promise.all([
    env.DB.prepare("SELECT den, SUM(divako_minut) AS dm, MAX(max_divaku) AS spicka FROM hry_den WHERE hra = ? GROUP BY den ORDER BY den").bind(h.nazev).all().catch(() => ({ results: [] })),
    historieHryVHitparade(env.DB, h.nazev).catch(() => []),
  ]);
  const poTydnech = new Map();
  for (const d of vse.results) {
    const po = pondeli(d.den), x = poTydnech.get(po) || { od: po, tyden: isoTyden(po), dm: 0, spicka: 0 };
    x.dm += d.dm || 0; x.spicka = Math.max(x.spicka, d.spicka || 0); poTydnech.set(po, x);
  }
  const poziceHp = new Map(hp.map((x) => [x.tyden, x.poradi]));
  const historie = vse.results.length ? {
    od: vse.results[0].den,
    tydny: [...poTydnech.values()].sort((a, b) => a.od.localeCompare(b.od)).slice(-60)
      .map((x) => ({ tyden: x.tyden, od: x.od, hodin: Math.round(x.dm / 60), spicka: x.spicka, poradi: poziceHp.get(x.tyden) || null })),
    nejlepsi: hp.length ? Math.min(...hp.map((x) => x.poradi)) : null, tydnu_v_hitparade: hp.filter((x) => !x.probiha).length,
  } : null;
  return {
    historie,
    statistiky: {
      hodin7: Math.round(tyden.reduce((a, d) => a + (d.dm || 0), 0) / 60),
      spicka7: Math.max(0, ...tyden.map((d) => d.spicka || 0)),
      dny: dny.results.map((d) => ({ den: d.den, hodin: Math.round((d.dm || 0) / 60), spicka: d.spicka || 0 })),
    },
    klipy: klipy.results.map((r) => ({ url: r.url, nazev: r.nazev, nahled: r.nahled, zhlednuti: r.zhlednuti, delka: r.delka,
      cas: new Date(r.cas).toISOString(), streamer: { jmeno: r.jmeno || r.login, login: r.login, platforma: r.platforma || "twitch", profilovka: r.profilovka || "" } })),
    zive: zive.results.map((r) => naStreamera(r, ted)),
    nejvic: nejvic.results.map((r) => ({ ...naStreamera(r, ted), hodin: Math.round((r.minut_hra || 0) / 60) })),
    // LIKE najde i „Hra 2“ u „Hra“ nebo název uprostřed slova – necháme jen články, kde je název hry celé slovo/fráze.
    clanky: [...vl.results.map(naPrispevek), ...rss.results.map(naClanek)].filter((c) => celyNazev(h.nazev).test(`${c.nadpis} ${c.perex || ""}`))
      .sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 12),
  };
}

// Bohatá karta hry z databáze: k údajům IGDB přidá všechno, co o hře víme odjinud –
// Steam (cena, sleva, hráči teď, recenze, Metacritic, požadavky, trailery, historie cen, pulsometr, aktualizace),
// GOG a Epic (cena, hodnocení, hra zdarma), naše měření (denní špička hráčů, česká scéna, kdo právě streamuje), klipy a novinky.
async function bohataKarta(env, ctx, d) {
  const ted = Date.now();
  await zajistiSchemaTwitch(env.DB);
  await zajistiSchemaObsah(env.DB);
  await zajistiSchemaPropojeni(env.DB);
  // Jedno ID: kategorie Twitche a hra ze Steamu se hledají nejdřív podle oficiální vazby na IGDB, až pak podle názvu.
  const tw = await env.DB.prepare("SELECT slug, nazev, twitch_id FROM hry WHERE igdb_slug = ? ORDER BY posledni DESC LIMIT 1").bind(d.slug).first()
    || await env.DB.prepare("SELECT slug, nazev, twitch_id FROM hry WHERE nazev = ? COLLATE NOCASE LIMIT 1").bind(d.nazev).first();
  const h = tw || { slug: null, nazev: d.nazev, twitch_id: null };
  if (!d.steam_id) d.steam_id = (await env.DB.prepare("SELECT id FROM steam_hry WHERE igdb_slug = ? LIMIT 1").bind(d.slug).first())?.id || "";
  const [scena, info] = await Promise.all([
    scenaHry(env, h, ted),
    (d.steam_id ? infoHrySteam(env, ctx, d.steam_id) : infoHry(env, ctx, `db-${d.slug}`, d.nazev)).catch(() => null),
  ]);
  let pas = null, spicka = null;
  if (info?.steam?.id) {
    // Hra ze Steamu jde i do naší databáze her → sleduje se její cena (historie, cenový radar, hlídání).
    try { await zajistiSchemaHlidac(env.DB); ctx.waitUntil(env.DB.batch(prikazyUlozHry(env.DB, [info.steam], ted)).catch(() => {})); } catch { /* nepovinné */ }
    pas = await doplnPas(env, ctx, { nazev: info.steam.nazev || d.nazev, st: info.steam }).catch(() => null);
    const r = await env.DB.prepare("SELECT den, spicka FROM hraci_den WHERE id = ? ORDER BY den DESC LIMIT 1").bind(String(info.steam.id)).first().catch(() => null);
    if (r) spicka = { den: r.den, hracu: r.spicka };
  }
  return { info, pas, scena, steam_spicka: spicka, cesko_slug: h.slug || d.cesko_slug || null };
}

async function hraOdpoved(env, ctx, h, infoP, ted, steamId = null) {
  const scena = await scenaHry(env, h, ted);
  const info = await infoP;
  // Hra ze Steamu jde do databáze her (sleduje se cena, dá se hlídat) a přidá se nejnižší cena za 90 dní.
  if (info?.steam?.id) {
    try {
      await zajistiSchemaHlidac(env.DB);
      ctx.waitUntil(env.DB.batch(prikazyUlozHry(env.DB, [info.steam], ted)).catch(() => {}));
      const u = (await doplnSteamUdaje(env.DB, [info.steam.id])).get(String(info.steam.id));
      if (u) info.steam.min90 = u.min90;
    } catch { /* nepovinné */ }
  }
  // Herní pas: pulsometr, cenový radar, aktualizace, série a DLC, lehká DNA.
  const pas = await doplnPas(env, ctx, { nazev: info?.steam?.nazev || h.nazev, st: info?.steam || null }).catch((e) => { console.error("pas:", e); return null; });
  return json({
    slug: h.slug, nazev: h.nazev, steam_id: steamId || info?.steam?.id || null,
    // Jedno ID hry: profil v databázi (z oficiální vazby Twitch → IGDB, Steam → IGDB, nebo z IGDB pasu).
    igdb_slug: h.igdb_slug || pas?.igdb?.slug || (info?.steam?.id ? (await env.DB.prepare("SELECT igdb_slug FROM steam_hry WHERE id = ?").bind(String(info.steam.id)).first().catch(() => null))?.igdb_slug : null) || null,
    info, pas, ...scena,
  }, 200, 120);
}

async function apiExtra(platforma, login, env) {
  if (platforma !== "twitch" || !/^[a-z0-9_]{1,25}$/i.test(login)) return json({ rozvrh: [], klipy: [] }, 200, 3600);
  const r = await env.DB.prepare("SELECT id FROM streameri WHERE platforma = 'twitch' AND login = ? LIMIT 1").bind(login.toLowerCase()).first();
  if (!r) return json({ rozvrh: [], klipy: [] }, 404);
  return json(await extraTwitch(env, r.id), 200, 3600);
}

async function apiStav(env) {
  const [z, c, v] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM zdroje"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM clanky"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM prispevky WHERE stav = 'publikovano'"),
  ]);
  let twitch = { nastaveno: !!(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET) };
  try {
    const [t, n, k] = await env.DB.batch([
      env.DB.prepare("SELECT hodnota FROM nastaveni WHERE klic = 'twitch_stav'"),
      env.DB.prepare("SELECT COUNT(*) AS n FROM streameri"),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM streameri s WHERE ${KVALITA}`),
    ]);
    const posledni = t.results[0] ? JSON.parse(t.results[0].hodnota) : null;
    twitch = { ...twitch, posledni_beh: posledni && { ...posledni, cas: new Date(posledni.cas).toISOString() },
      streameru_celkem: n.results[0]?.n || 0, streameru_na_webu: k.results[0]?.n || 0 };
  } catch { twitch.posledni_beh = "zatím neproběhl"; }
  let kick = { nastaveno: kickNastaven(env) };
  try {
    const k = await env.DB.prepare("SELECT hodnota FROM nastaveni WHERE klic = 'kick_stav'").first();
    if (k) { const v = JSON.parse(k.hodnota); kick.posledni_beh = { ...v, cas: new Date(v.cas).toISOString() }; }
  } catch {}
  const stavy = Object.fromEntries(z.results.map((r) => [r.id, r]));
  return json({
    twitch,
    kick,
    zprav_z_rss: c.results[0]?.n || 0,
    vlastnich_clanku: v.results[0]?.n || 0,
    zdroje: ZDROJE.map((zd) => ({
      nazev: zd.nazev, jazyk: zd.jazyk,
      posledni: stavy[zd.id]?.posledni ? new Date(stavy[zd.id].posledni).toISOString() : null,
      stav: stavy[zd.id]?.stav || "zatím nestaženo",
      chyby: stavy[zd.id]?.chyby || 0,
      aktivni: (stavy[zd.id]?.chyby || 0) < 5,
    })),
  }, 200, 30);
}

// decodeURIComponent vyhodí chybu u rozbité adresy (např. „%E0“) – pak vracíme prázdný text místo chyby 500.
const dekoduj = (x) => { try { return decodeURIComponent(x); } catch { return ""; } };

// Jednoduchý zámek v tabulce nastaveni: true = smíme (a zámek je teď náš), false = někdo to dělal nedávno.
async function zamekNa(db, klic, ms) {
  const ted = Date.now();
  try {
    const r = await db.prepare(`INSERT INTO nastaveni (klic, hodnota, plati_do) VALUES (?, '1', ?)
      ON CONFLICT(klic) DO UPDATE SET plati_do = excluded.plati_do WHERE nastaveni.plati_do < ?`).bind(klic, ted + ms, ted).run();
    return (r.meta?.changes || 0) > 0;
  } catch { return false; }
}

async function verejneApi(request, env, ctx, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return json({ chyba: "Metoda není povolena" }, 405);

  // Odpovědi se krátce drží v mezipaměti Cloudflare, aby návštěvy nezatěžovaly databázi.
  const cache = caches.default;
  // Klíč mezipaměti jen ze známých parametrů – náhodné ?x=… by jinak mezipaměť obcházely a zatěžovaly databázi.
  const POVOLENE = ["limit", "platforma", "q", "jazyk", "razeni", "hra", "tyden", "filtr", "ids", "den", "s", "cz", "cena", "zanr", "pred", "steam", "n", "mesic", "rezim", "tema", "od", "do", "hodnoceni", "dotaz"];
  const ciste = new URL(url.origin + url.pathname);
  for (const k of POVOLENE) {
    let v = url.searchParams.get(k);
    if (v == null) continue;
    // Hledaný text: velikost písmen a mezery nemění výsledek → stejný klíč mezipaměti („Zaklínač“ = „ zaklínač “).
    if (k === "q" || k === "dotaz") { v = v.trim().toLowerCase().replace(/\s+/g, " "); url.searchParams.set(k, v); }
    ciste.searchParams.set(k, v.slice(0, k === "ids" ? 4000 : 200));
  }
  const klic = new Request(ciste.toString(), { method: "GET" });
  const ulozeno = await cache.match(klic);
  if (ulozeno) return ulozeno;

  // Když jsou data o streamerech starší než 10 min, stáhnou se hned z Twitche (na pozadí).
  // Až po neúspěchu mezipaměti – jinak by každá návštěva dělala dotaz do databáze.
  if (url.pathname === "/api/zive" || url.pathname === "/api/streameri" || url.pathname === "/api/hry") {
    ctx.waitUntil(sberTwitchPokudStary(env).catch((e) => console.error("twitch na vyžádání:", e)));
  }

  let odpoved;
  try {
    if (url.pathname === "/api/clanky") odpoved = await apiClanky(url, env);
    else if (url.pathname.startsWith("/api/clanek/")) odpoved = await apiClanek(url.pathname.slice(12), env);
    else if (url.pathname === "/api/stav") odpoved = await apiStav(env);
    else if (url.pathname === "/api/zive") odpoved = await apiZive(env);
    else if (url.pathname === "/api/streameri") odpoved = await apiStreameri(url, env);
    else if (url.pathname === "/api/hry") odpoved = await apiHry(env);
    else if (url.pathname === "/api/prehled") odpoved = json(await zMezipameti(env.DB, "prehled", 30 * 60e3, () => apiPrehled(env, naStreamera)), 200, 300);
    else if (url.pathname === "/api/cesko") { await zajistiSchemaTwitch(env.DB); odpoved = json(await zMezipameti(env.DB, "cesko", 15 * 60e3, () => apiCesko(env)), 200, 900); }
    else if (url.pathname === "/api/hitparada") {
      await zajistiSchemaTwitch(env.DB);
      const t = String(url.searchParams.get("tyden") || "").slice(0, 10);
      const r = await apiHitparada(env, /^(\d{4}-W\d{2}|aktualni)$/.test(t) ? t : "");
      odpoved = json(r, 200, r.cache || 900);
    }
    else if (url.pathname === "/api/zprava") {
      await zajistiSchemaTwitch(env.DB);
      const m = String(url.searchParams.get("mesic") || "").slice(0, 7);
      const r = await apiZprava(env, /^\d{4}-\d{2}$/.test(m) ? m : "");
      odpoved = json(r, 200, r.cache || 1800);
    }
    else if (url.pathname === "/api/report") {
      await zajistiSchemaTwitch(env.DB);
      const t = String(url.searchParams.get("tyden") || "").slice(0, 10);
      const tid = /^(\d{4}-W\d{2}|aktualni)$/.test(t) ? t : "";
      // Uzavřený týden se už nemění (1 den v D1), rozběhnutý se přepočítá nejvýš jednou za hodinu.
      const r = await zMezipameti(env.DB, `report:${tid || "vychozi"}`, tid && tid !== "aktualni" ? 86400e3 : 60 * 60e3, () => apiReport(env, naStreamera, tid));
      odpoved = json(r, 200, r.cache);
    }
    else if (url.pathname === "/api/cestina") {
      const q = url.searchParams.get("q") || "", f = String(url.searchParams.get("filtr") || "");
      odpoved = json(await apiCestina(env, q, ["sleva", "zdarma", "dabing", "vse"].includes(f) ? f : ""), 200, q ? 3600 : 900);
    }
    else if (url.pathname === "/api/steam-hry") odpoved = json(await apiSteamHry(env, url.searchParams.get("ids")), 200, 300);
    else if (url.pathname === "/api/studia") odpoved = json(await apiStudia(env), 200, 600);
    else if (url.pathname.startsWith("/api/studio/")) { const s = await apiStudio(env, dekoduj(url.pathname.slice(12))); odpoved = s ? json(s, 200, 600) : json({ chyba: "Nenalezeno" }, 404); }
    else if (url.pathname === "/api/akce") odpoved = json(await apiAkce(env), 200, 600);
    else if (url.pathname === "/api/vydani") {
      let v = await apiVydani(env);
      // Prázdný kalendář (první spuštění): stáhnout z IGDB nejvýš jednou za 10 minut, ať návštěvy nezahltí IGDB.
      if (!v.cas && await zamekNa(env.DB, "vydani_pokus", 600e3)) { await sberVydani(env).catch((e) => console.error("vydání:", e)); v = await apiVydani(env); }
      // ?limit=N → jen N nejbližších opravdu nových her (pro Domů), ať se nestahuje celý kalendář.
      const lim = parseInt(url.searchParams.get("limit") || "", 10);
      if (lim > 0) v = { ...v, hry: v.hry.filter((h) => !h.uz_vyslo && Date.parse(h.datum) > Date.now() - 864e5).slice(0, Math.min(lim, 20)) };
      odpoved = json(v, 200, v.cas ? 1800 : 60);
    }
    else if (url.pathname === "/api/ranni") { const d = String(url.searchParams.get("den") || ""); odpoved = json(await apiRanni(env, d), 200, d ? 3600 : 600); }
    else if (url.pathname === "/api/aktualizace") odpoved = json(await apiAktualizace(env), 200, 900);
    else if (url.pathname === "/api/vyroci") odpoved = json(await apiVyroci(env), 200, 1800);
    else if (url.pathname === "/api/co-hrat") odpoved = json(await apiCoHrat(env, url.searchParams), 200, 1800);
    else if (url.pathname === "/api/vyssi-nizsi") { await zajistiSchemaTwitch(env.DB); odpoved = json(await apiVyssiNizsi(env), 200, 1800); }
    else if (url.pathname === "/api/wishlist") { const w = await apiWishlist(env, url.searchParams.get("steam") || ""); odpoved = w.chyba ? json({ chyba: w.chyba }, w.status || 400) : json(w, 200, 600); }
    else if (url.pathname === "/api/databaze") {
      await zajistiSchemaTwitch(env.DB);
      const q = url.searchParams.get("q");
      // Hledání volá IGDB (1–3 požadavky). Ochrana před zahlcením: nejvýš 40 nových hledání za minutu v jedné instanci
      // (opakovaná hledání jdou z mezipaměti a do limitu se nepočítají). Audit 2026-11-27.
      if ((q || url.searchParams.get("dotaz") || ["platforma", "zanr", "rezim", "tema", "od", "do", "hodnoceni", "cz", "cena"].some((k) => url.searchParams.get(k))) && !limitHledani()) {
        return json({ chyba: "Moc hledání najednou, zkus to za chvíli." }, 429, 0, { "Retry-After": "30" });
      }
      const sFiltry = ["platforma", "zanr", "rezim", "tema", "od", "do", "hodnoceni", "cz", "cena", "dotaz"].some((k) => url.searchParams.get(k));
      odpoved = sFiltry ? json(await apiHledatFiltry(env, url.searchParams), 200, 1800)
        : q ? json(await apiHledatDatabaze(env, q), 200, 3600) : json(await apiPopularniDatabaze(env), 200, 3600);
    }
    else if (url.pathname === "/api/databaze-filtry") {
      await zajistiSchemaTwitch(env.DB);
      odpoved = json(await filtryDatabaze(env), 200, 86400);
    }
    else if (url.pathname.startsWith("/api/databaze/")) {
      await zajistiSchemaTwitch(env.DB);
      const d = await apiHraDatabaze(env, ctx, dekoduj(url.pathname.slice(14)));
      if (!d.chyba) Object.assign(d, await bohataKarta(env, ctx, d).catch((e) => { console.error("karta:", e); return {}; }));
      // Bez českého popisu jen krátká mezipaměť – překlad se dělá na pozadí a má se brzy ukázat.
      odpoved = d.chyba ? json({ chyba: d.chyba }, d.status || 500) : json(d, 200, d.preklad || !(d.popis_en || d.pribeh_en) ? 900 : 120);
    }
    else if (url.pathname === "/api/radar") { await zajistiSchemaTwitch(env.DB); odpoved = json(await apiRadar(env), 200, 600); }
    else if (url.pathname === "/api/trendy") odpoved = json(await apiTrendy(env), 200, 1800);
    else if (url.pathname === "/api/cenovy-radar") odpoved = json(await apiCenovyRadar(env), 200, 1800);
    else if (url.pathname === "/api/srovnani") { await zajistiSchemaTwitch(env.DB); odpoved = json(await apiSrovnani(env, ctx, url.searchParams.get("ids")), 200, 1800); }
    else if (url.pathname === "/api/ceska-scena") odpoved = json(await apiCeskaScena(env), 200, 900);
    else if (url.pathname === "/api/stav-systemu") odpoved = json(await apiStavSystemu(env), 200, 60);
    else if (url.pathname === "/api/obsah") odpoved = json(await apiObsah(env), 200, 600);
    else if (url.pathname === "/api/katalog") {
      await zajistiSchemaTwitch(env.DB);
      let k = await apiKatalog(env);
      if (!k.cas) { await sberKataloguPokudStary(env).catch((e) => console.error("katalog:", e)); k = await apiKatalog(env); }
      else ctx.waitUntil(sberKataloguPokudStary(env).catch((e) => console.error("katalog:", e)));
      odpoved = json(k, 200, k.cas ? 600 : 0);
    }
    else if (url.pathname === "/api/analytika") odpoved = json(await apiAnalytika(env), 200, 900);
    else if (url.pathname === "/api/moje-hry") odpoved = json(await apiMojeHry(env, url.searchParams.get("s")), 200, 120);
    else if (url.pathname.startsWith("/api/hra-steam/")) odpoved = await apiHraSteam(url.pathname.slice(15), env, ctx);
    else if (url.pathname.startsWith("/api/hra/")) odpoved = await apiHra(dekoduj(url.pathname.slice(9)), env, ctx);
    else if (url.pathname.startsWith("/api/streamer-extra/")) {
      const [plat, login] = url.pathname.slice(20).split("/").map(dekoduj);
      odpoved = await apiExtra(plat, login || "", env);
    } else if (url.pathname.startsWith("/api/streamer/")) {
      const casti = url.pathname.slice(14).split("/").map(dekoduj);
      // Staré adresy /api/streamer/:login = Twitch.
      odpoved = casti.length === 1 ? await apiStreamer("twitch", casti[0], env) : await apiStreamer(casti[0], casti[1], env);
    }
    else return json({ chyba: "Nenalezeno" }, 404);
  } catch (e) {
    const t = String(e?.message || e);
    if (/no such table/i.test(t)) {
      // Chybějící tabulka se založí na pozadí; návštěvník dostane poctivou odpověď „připravuje se“, ne prázdná data
      // (prázdný seznam by vypadal, že nic neexistuje – audit 2026-11-27).
      ctx.waitUntil(Promise.all([zajistiSchema(env.DB), zajistiSchemaTwitch(env.DB)]).catch(() => {}));
      console.warn(`chybí tabulka (${url.pathname}):`, t);
      return json({ chyba: "Data se právě připravují, zkus to za chvíli." }, 503, 0, { "Retry-After": "30" });
    }
    // Výpadek externí služby (IGDB, Twitch, Steam…) nebo limit databáze = 503, ne „interní chyba“.
    if (/fetch|network|timeout|timed out|abort|IGDB|Twitch|token|ECONN|subrequest|D1_ERROR|too many/i.test(t)) {
      console.warn(`služba nedostupná (${url.pathname}):`, t);
      return json({ chyba: "Služba je teď nedostupná, zkus to za chvíli." }, 503, 0, { "Retry-After": "60" });
    }
    console.error(`chyba API (${url.pathname}):`, e);
    return json({ chyba: "Interní chyba" }, 500);
  }
  if (odpoved.status === 200 && /max-age/.test(odpoved.headers.get("Cache-Control") || "")) ctx.waitUntil(cache.put(klic, odpoved.clone()));
  return odpoved;
}

function zamceno(duvod) {
  return new Response(`<!DOCTYPE html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Přístup odepřen</title><body style="font-family:system-ui;background:#0d0f14;color:#e9ecf2;padding:40px 20px;text-align:center">
<h1>Přístup odepřen</h1><p>${duvod.replace(/[<>&]/g, "")}</p></body></html>`, {
    status: 403,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff" },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Administrace: každý požadavek musí mít platné přihlášení z Cloudflare Access.
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/") || url.pathname.startsWith("/api/admin/")) {
      const uzivatel = await overAdmina(request, env);
      if (!uzivatel.ok) {
        return url.pathname.startsWith("/api/") ? json({ chyba: uzivatel.duvod }, 403) : zamceno(uzivatel.duvod);
      }
      if (url.pathname.startsWith("/api/admin/")) return adminApi(request, env, ctx, uzivatel);
      const r = await env.ASSETS.fetch(request);
      const h = new Headers(r.headers);
      h.set("Cache-Control", "no-store");
      h.set("X-Robots-Tag", "noindex, nofollow");
      return new Response(r.body, { status: r.status, headers: h });
    }

    if (url.pathname.startsWith("/api/push/")) {
      try { await zajistiSchemaTwitch(env.DB); return await pushApi(request, env); }
      catch (e) { console.error("push api:", e); return json({ chyba: "Interní chyba" }, 500); }
    }
    if (url.pathname.startsWith("/api/")) return verejneApi(request, env, ctx, url);
    if (url.pathname === "/robots.txt") return robots(request);
    if (url.pathname === "/sitemap.xml") {
      // Mezipaměť na 6 h – sitemapu stahují roboti často a bez ní každé stažení čte ~15 tis. řádků (zátěžový test).
      const c = caches.default, klic = new Request(`${url.origin}/sitemap.xml`);
      const hit = await c.match(klic).catch(() => null);
      if (hit) return hit;
      const r = await sitemap(request, env);
      const o = new Response(r.body, r);
      o.headers.set("Cache-Control", "public, max-age=21600");
      ctx.waitUntil(c.put(klic, o.clone()).catch(() => {}));
      return o;
    }
    if ((request.method === "GET" || request.method === "HEAD") && jeStranka(url.pathname)) {
      try { await zajistiSchemaTwitch(env.DB); } catch {}
      return vykresliStranku(request, env);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    // Každá úloha zapíše do deníku AI jednu větu (stránka /stav).
    const pl = (n, a, b, c) => `${n} ${n === 1 ? a : n >= 2 && n <= 4 ? b : c}`;
    if (event.cron === CRON_KATALOG) {
      ctx.waitUntil(behUlohy(env, "katalog", async () => {
        // Jen obchody (~40 požadavků). Kalendář vydání a výročí (IGDB) jsou v Cronu psaní – sem by se nevešly (limit 50).
        const v = await sberKatalogu(env);
        await obnovObrazkyAkci(env.DB).catch((e) => v.chyby.push(`obrázky akcí: ${String(e.message || e).slice(0, 80)}`));
        return v;
      }, (v) => `Zkontrolovala obchody Steam, Epic a GOG – hry zdarma, slevy, žebříčky a hodnocení hráčů.` +
        `${v.chyby.length ? ` Nedostupné: ${v.chyby.join("; ")}.` : ""}`));
    } else if (event.cron === CRON_OBSAH) {
      ctx.waitUntil(behUlohy(env, "obsah", () => sberObsahu(env), (v) => {
        const h = typeof v.hlidac === "object" ? v.hlidac : {};
        return `Zkontrolovala ceny ${pl(Number(h.ceny) || 0, "hry", "her", "her")} a češtinu u ${pl(Number(h.jazyky) || 0, "hry", "her", "her")}` +
          `${Number(h.upozorneni) ? `, poslala ${pl(Number(h.upozorneni), "upozornění", "upozornění", "upozornění")} na slevy` : ""}` +
          `, načetla ${pl(Number(v.klipy?.klipu) || 0, "klip", "klipy", "klipů")} a ${pl(Number(v.youtube?.videi) || 0, "video", "videa", "videí")}.`;
      }));
    } else if (event.cron === CRON_TWITCH) {
      const stav = async (klic) => { try { return JSON.parse((await env.DB.prepare("SELECT hodnota FROM nastaveni WHERE klic = ?").bind(klic).first())?.hodnota || "{}"); } catch { return {}; } };
      ctx.waitUntil(Promise.allSettled([
        behUlohy(env, "twitch", async () => { await sberTwitch(env); return stav("twitch_stav"); }, (s) => {
          if (s.ok === false) throw new Error(s.chyba || "neznámá chyba");
          return `Na Twitchi našla ${pl(s.zivych || 0, "živý český stream", "živé české streamy", "živých českých streamů")}, obnovila ${pl(s.profilu || 0, "profil", "profily", "profilů")}.`;
        }),
        behUlohy(env, "kick", async () => { await sberKick(env); return stav("kick_stav"); }, (s) => {
          if (s.ok === false) throw new Error(s.chyba || "neznámá chyba");
          return `Na Kicku našla ${pl(s.zivych || 0, "živý český stream", "živé české streamy", "živých českých streamů")}` +
            `${s.api ? ` (API ${s.api}${s.uplne === false ? ", možná ne všechny – API víc nevrátí" : ""})` : ""}.`;
        }),
      ]));
    } else if (event.cron === CRON_PSANI) {
      ctx.waitUntil(behUlohy(env, "psani", () => napisClanek(env), (v) => v?.id || v?.nadpis ? `Napsala článek: ${v.nadpis || v.id}.` : null));
      ctx.waitUntil(behUlohy(env, "ranni", () => generujRanni(env), (v) => v?.bodu ? `Sestavila ranní přehled (${pl(v.bodu, "bod", "body", "bodů")}).` : null));
      // Kalendář vydání (každých 6 h, ≤5 dotazů na IGDB) a výročí (1× denně, ≤3) – přesunuto z Cronu obchodů kvůli limitu 50.
      ctx.waitUntil(behUlohy(env, "kalendar", async () => {
        const v = { chyby: [] };
        try { v.vydani = await sberVydani(env); } catch (e) { v.chyby.push(`kalendář: ${String(e.message || e).slice(0, 100)}`); }
        try { v.vyroci = await sberVyroci(env); } catch (e) { v.chyby.push(`výročí: ${String(e.message || e).slice(0, 100)}`); }
        if (v.chyby.length === 2) throw new Error(v.chyby.join("; "));
        return v;
      }, (v) => {
        const casti = [];
        if (v.vydani?.her) casti.push(`Aktualizovala kalendář vydání (${pl(v.vydani.her, "hra", "hry", "her")}).`);
        if (v.vyroci?.her) casti.push(`Našla ${pl(v.vyroci.her, "výročí", "výročí", "výročí")} her vydaných v dnešní den.`);
        if (v.chyby.length) casti.push(`Nepovedlo se: ${v.chyby.join("; ")}.`);
        return casti.length ? casti.join(" ") : null;
      }));
      // Databáze her: seznam populárních her z IGDB (1× denně) a předem 2 české překlady popisů za hodinu.
      ctx.waitUntil(behUlohy(env, "databaze", async () => {
        const pop = await sestavPopularni(env).catch((e) => ({ chyba: String(e.message || e).slice(0, 100) }));
        const pr = await prelozPopularni(env, 2).catch((e) => ({ chyba: String(e.message || e).slice(0, 100) }));
        const pj = await propojHry(env).catch((e) => ({ chyba: String(e.message || e).slice(0, 100) }));
        const sl = await kontrolaSledovanych(env).catch((e) => ({ chyba: String(e.message || e).slice(0, 100) }));
        return { pop, pr, pj, sl };
      }, (v) => {
        const casti = [];
        if (v.pop?.her) casti.push(`Obnovila seznam ${pl(v.pop.her, "populární hry", "populárních her", "populárních her")} v databázi.`);
        if (v.pop?.chyba) casti.push(`Seznam populárních her: ${v.pop.chyba}.`);
        if (v.pr?.prelozeno) casti.push(`Přeložila do češtiny popis ${pl(v.pr.prelozeno, "hry", "her", "her")}.`);
        if (v.pr?.chyba) casti.push(`Překlad: ${v.pr.chyba}.`);
        if (v.pj?.twitch || v.pj?.steam) casti.push(`Propojila s databází her ${pl(v.pj.twitch, "kategorii Twitche", "kategorie Twitche", "kategorií Twitche")} a ${pl(v.pj.steam, "hru ze Steamu", "hry ze Steamu", "her ze Steamu")}.`);
        if (v.pj?.chyba) casti.push(`Propojení her: ${v.pj.chyba}.`);
        if (v.sl?.zprav) casti.push(`Poslala ${pl(v.sl.zprav, "upozornění", "upozornění", "upozornění")} ke sledovaným hrám.`);
        if (v.sl?.chyba) casti.push(`Sledované hry: ${v.sl.chyba}.`);
        return casti.length ? casti.join(" ") : null;
      }));
      // Trendy (rostoucí/upadající hry) a cenový radar: každé 3 hodiny, jen čtení z D1 + 2 zápisy.
      ctx.waitUntil(behUlohy(env, "trendy", async () => (await zamekNa(env.DB, "trendy_beh", 3 * 3600e3 - 5 * 60e3)) ? sestavTrendy(env) : null, (v) => v
        ? `Spočítala trendy her (česká scéna ${pl(v.cesko, "hra", "hry", "her")}, Steam ${pl(v.steam, "hra", "hry", "her")}) a cenový radar (${pl(v.ceny, "hra", "hry", "her")} na nejnižší ceně od začátku měření).${v.chyby.length ? ` Problém: ${v.chyby.join("; ")}.` : ""}` : null));
      ctx.waitUntil(behUlohy(env, "patche", async () => {
        const sez = await sestavSledovane(env).catch((e) => ({ chyba: String(e.message || e).slice(0, 100) })); // 1× denně, ~7 dotazů na IGDB
        let shr;
        try { shr = await shrnPatch(env, 2); }
        catch (e) { if (!sez.her) throw e; shr = { chybaAi: String(e.message || e).slice(0, 160) }; } // seznam her se sestavil i bez AI
        return { ...shr, sez };
      }, (v) => {
        const casti = [];
        if (v.sez?.her) casti.push(`Sestavila seznam ${pl(v.sez.her, "sledované hry", "sledovaných her", "sledovaných her")}${v.sez.chyba ? ` (IGDB: ${v.sez.chyba})` : ""}.`);
        else if (v.sez?.chyba) casti.push(`Seznam sledovaných her se nepodařilo obnovit: ${v.sez.chyba}.`);
        for (const h of v.hotove || []) casti.push(`Shrnula aktualizaci hry ${h.hra}: ${h.nadpis}.`);
        for (const h of v.neprosle || []) casti.push(`Shrnutí aktualizace hry ${h.hra} neprošlo kontrolou faktů – zůstává jen originální nadpis.`);
        if (v.chybaAi) casti.push(`AI teď nepíše: ${v.chybaAi}`);
        return casti.length ? casti.join(" ") : null;
      }));
    } else {
      ctx.waitUntil(behUlohy(env, "studia", () => sberStudii(env), (v) =>
        `Zkontrolovala oficiální kanály: ${v.studia.join(", ")} – ${pl(v.polozek, "položka", "položky", "položek")}.${v.chyby.length ? ` Problém: ${v.chyby.join("; ")}.` : ""}`));
      ctx.waitUntil(behUlohy(env, "aktualizace", () => sberPatchu(env), (v) => v.her
        ? `Zkontrolovala oficiální oznámení ${pl(v.her, "hry", "her", "her")} na Steamu${v.novych ? `, našla ${pl(v.novych, "novou aktualizaci", "nové aktualizace", "nových aktualizací")}` : ""}.` : null));
      ctx.waitUntil(behUlohy(env, "rss", async () => { const v = await sber(env); await uklidDeniku(env.DB); return v; }, (v) =>
        `Prošla ${pl(v.zdroju.length, "herní web", "herní weby", "herních webů")} (${v.zdroju.join(", ")}), našla ${pl(v.cerstvych, "čerstvou zprávu", "čerstvé zprávy", "čerstvých zpráv")}.` +
        `${v.chybne.length ? ` Nedostupné: ${v.chybne.join(", ")}.` : ""}`));
    }
  },
};
