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

const PLATFORMY = new Set(["PC", "PS5", "Xbox", "Switch"]);
const ZDROJ_PODLE_ID = Object.fromEntries(ZDROJE.map((z) => [z.id, z]));
const BARVY = [["#ff7a3d", "#5a1a0a"], ["#7c5cff", "#0c0a2a"], ["#3fbf7f", "#0a2a1a"], ["#2fa8ff", "#06182e"],
  ["#1ec8c8", "#031c22"], ["#ff4d9a", "#2a0618"], ["#f2b631", "#2e2104"], ["#e2554b", "#2b0806"]];
const CRON_PSANI = "7 * * * *";
const CRON_TWITCH = "5,20,35,50 * * * *";
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

function json(data, status = 200, cacheSec = 0) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...BEZPECNE_HLAVICKY, "Cache-Control": cacheSec ? `public, max-age=${cacheSec}` : "no-store" },
  });
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

  // Všechny vstupy jdou do SQL pouze přes bind() – žádné skládání dotazu z textu.
  const kdeR = [], hodR = [], kdeV = ["stav = 'publikovano'"], hodV = [];
  if (platforma && PLATFORMY.has(platforma)) {
    kdeR.push("platformy LIKE ?"); hodR.push(`%"${platforma}"%`);
    kdeV.push("platformy LIKE ?"); hodV.push(`%"${platforma}"%`);
  }
  if (jazyk === "cs" || jazyk === "en") { kdeR.push("jazyk = ?"); hodR.push(jazyk); }
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
    return r ? json(naPrispevek(r), 200, 60) : json({ chyba: "Nenalezeno" }, 404);
  }
  if (!/^[0-9a-f]{24}$/.test(id)) return json({ chyba: "Neplatné id" }, 400);
  const r = await env.DB.prepare("SELECT * FROM clanky WHERE id = ?").bind(id).first();
  return r ? json(naClanek(r), 200, 300) : json({ chyba: "Nenalezeno" }, 404);
}

// ---------- Streameři ----------
function naStreamera(r, ted) {
  const zive = !!(r.zive_cas && r.zive_cas > ted - ZIVE_PLATNOST);
  return {
    platforma: r.platforma || "twitch", login: r.login, jmeno: r.jmeno || r.login, profilovka: r.profilovka || "", partner: r.typ === "partner",
    sledujici: r.sledujici ?? null, max_divaku: r.max_divaku || 0, posledni_hra: r.posledni_hra || "",
    zive, divaci: zive ? r.zive_divaci : null, hra: zive ? r.zive_hra : null, titulek: zive ? r.zive_titulek : null,
    zacatek: zive ? r.zive_zacatek : null, nahled: zive && r.zive_nahled ? `${r.zive_nahled}?t=${Math.floor(r.zive_cas / 60e3)}` : "",
    minut30: r.minut30 ?? undefined, rust30: r.rust30 ?? undefined,
    odkazy: parse(r.odkazy, undefined),
  };
}

async function apiZive(env) {
  const ted = Date.now();
  const [st, hry] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM streameri s WHERE s.skryty = 0 AND s.zive_cas > ? ORDER BY s.zive_divaci DESC LIMIT 120`).bind(ted - ZIVE_PLATNOST),
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
  const [sn, hry] = await env.DB.batch([
    env.DB.prepare("SELECT den, sledujici, max_divaku, minut FROM snimky WHERE user_id = ? AND den >= date('now', '-90 day') ORDER BY den").bind(r.id),
    env.DB.prepare("SELECT hra, minut FROM hry_streamera WHERE user_id = ? ORDER BY minut DESC LIMIT 8").bind(r.id),
  ]);
  const od30 = new Date(ted - 30 * 86400e3).toISOString().slice(0, 10);
  return json({
    ...naStreamera(r, ted),
    popis: r.popis || "", banner: r.banner || "", ucet_od: r.ucet_od, overeno: !!r.overeno,
    prvni_videno: r.prvni_videno ? new Date(r.prvni_videno).toISOString() : null,
    posledni_zive: r.posledni_zive ? new Date(r.posledni_zive).toISOString() : null,
    streamu: r.pocet_streamu || 0,
    hodin30: Math.round(sn.results.filter((x) => x.den >= od30).reduce((a, x) => a + (x.minut || 0), 0) / 60),
    snimky: sn.results, hry: hry.results.map((h) => ({ ...h, slug: slugHry(h.hra) })),
    aktualizovano: { profil: r.profil_cas ? new Date(r.profil_cas).toISOString() : null, sledujici: r.sledujici_cas ? new Date(r.sledujici_cas).toISOString() : null },
  }, 200, 120);
}

// ---------- Hry ----------
async function apiHry(env) {
  const ted = Date.now();
  const { results } = await env.DB.prepare(`
    SELECT h.slug, h.nazev,
      (SELECT COUNT(*) FROM streameri s WHERE s.skryty = 0 AND s.zive_cas > ?1 AND s.zive_hra = h.nazev) AS zive,
      (SELECT COALESCE(SUM(s.zive_divaci), 0) FROM streameri s WHERE s.skryty = 0 AND s.zive_cas > ?1 AND s.zive_hra = h.nazev) AS divaci,
      (SELECT COUNT(*) FROM hry_streamera x WHERE x.hra = h.nazev) AS streameru
    FROM hry h WHERE h.posledni > ?2 ORDER BY divaci DESC, streameru DESC LIMIT 120`).bind(ted - ZIVE_PLATNOST, ted - 30 * 86400e3).all();
  return json(results, 200, results.length ? 120 : 0);
}

async function apiHra(slug, env) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ chyba: "Neplatná hra" }, 400);
  const ted = Date.now();
  const h = await env.DB.prepare("SELECT slug, nazev FROM hry WHERE slug = ?").bind(slug).first();
  if (!h) return json({ chyba: "Nenalezeno" }, 404);
  const q = `%${h.nazev}%`;
  const [zive, nejvic, rss, vl] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM streameri s WHERE s.skryty = 0 AND s.zive_cas > ? AND s.zive_hra = ? ORDER BY s.zive_divaci DESC LIMIT 50").bind(ted - ZIVE_PLATNOST, h.nazev),
    env.DB.prepare(`SELECT s.*, x.minut AS minut_hra FROM hry_streamera x JOIN streameri s ON s.id = x.user_id
                    WHERE x.hra = ? AND s.skryty = 0 ORDER BY x.minut DESC LIMIT 20`).bind(h.nazev),
    env.DB.prepare("SELECT * FROM clanky WHERE nadpis LIKE ? ORDER BY datum DESC LIMIT 10").bind(q),
    env.DB.prepare("SELECT * FROM prispevky WHERE stav = 'publikovano' AND (nadpis LIKE ? OR perex LIKE ?) ORDER BY publikovano DESC LIMIT 10").bind(q, q),
  ]);
  return json({
    ...h,
    zive: zive.results.map((r) => naStreamera(r, ted)),
    nejvic: nejvic.results.map((r) => ({ ...naStreamera(r, ted), hodin: Math.round((r.minut_hra || 0) / 60) })),
    clanky: [...vl.results.map(naPrispevek), ...rss.results.map(naClanek)].sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 12),
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

async function verejneApi(request, env, ctx, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return json({ chyba: "Metoda není povolena" }, 405);

  // Když jsou data o streamerech starší než 10 min, stáhnou se hned z Twitche (na pozadí).
  if (url.pathname === "/api/zive" || url.pathname === "/api/streameri" || url.pathname === "/api/hry") {
    ctx.waitUntil(sberTwitchPokudStary(env).catch((e) => console.error("twitch na vyžádání:", e)));
  }

  // Odpovědi se krátce drží v mezipaměti Cloudflare, aby návštěvy nezatěžovaly databázi.
  const cache = caches.default;
  const klic = new Request(url.toString(), { method: "GET" });
  const ulozeno = await cache.match(klic);
  if (ulozeno) return ulozeno;

  let odpoved;
  try {
    if (url.pathname === "/api/clanky") odpoved = await apiClanky(url, env);
    else if (url.pathname.startsWith("/api/clanek/")) odpoved = await apiClanek(url.pathname.slice(12), env);
    else if (url.pathname === "/api/stav") odpoved = await apiStav(env);
    else if (url.pathname === "/api/zive") odpoved = await apiZive(env);
    else if (url.pathname === "/api/streameri") odpoved = await apiStreameri(url, env);
    else if (url.pathname === "/api/hry") odpoved = await apiHry(env);
    else if (url.pathname === "/api/prehled") odpoved = json(await apiPrehled(env, naStreamera), 200, 300);
    else if (url.pathname.startsWith("/api/hra/")) odpoved = await apiHra(decodeURIComponent(url.pathname.slice(9)), env);
    else if (url.pathname.startsWith("/api/streamer-extra/")) {
      const [plat, login] = url.pathname.slice(20).split("/").map(decodeURIComponent);
      odpoved = await apiExtra(plat, login || "", env);
    } else if (url.pathname.startsWith("/api/streamer/")) {
      const casti = url.pathname.slice(14).split("/").map(decodeURIComponent);
      // Staré adresy /api/streamer/:login = Twitch.
      odpoved = casti.length === 1 ? await apiStreamer("twitch", casti[0], env) : await apiStreamer(casti[0], casti[1], env);
    }
    else return json({ chyba: "Nenalezeno" }, 404);
  } catch (e) {
    if (/no such table/i.test(String(e))) {
      ctx.waitUntil(Promise.all([zajistiSchema(env.DB), zajistiSchemaTwitch(env.DB)]));
      return json(url.pathname === "/api/zive" ? { streamy: [], hry: [] } : [], 200);
    }
    console.error(e);
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
    if (url.pathname === "/sitemap.xml") return sitemap(request, env);
    if ((request.method === "GET" || request.method === "HEAD") && jeStranka(url.pathname)) {
      try { await zajistiSchemaTwitch(env.DB); } catch {}
      return vykresliStranku(request, env);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    if (event.cron === CRON_TWITCH) {
      ctx.waitUntil(Promise.allSettled([sberTwitch(env), sberKick(env)]));
    } else if (event.cron === CRON_PSANI) {
      ctx.waitUntil(napisClanek(env).then((v) => console.log("psaní:", JSON.stringify(v))).catch((e) => console.error("psaní:", e)));
    } else {
      ctx.waitUntil(sber(env));
    }
  },
};
