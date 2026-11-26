// Herní puls – Worker: statický web + API + sběrač novinek + AI psaní + admin.
import { ZDROJE } from "./zdroje.js";
import { sber, zajistiSchema } from "./sber.js";
import { napisClanek } from "./psani.js";
import { overAdmina } from "./access.js";
import { adminApi } from "./admin.js";

const PLATFORMY = new Set(["PC", "PS5", "Xbox", "Switch"]);
const ZDROJ_PODLE_ID = Object.fromEntries(ZDROJE.map((z) => [z.id, z]));
const BARVY = [["#ff7a3d", "#5a1a0a"], ["#7c5cff", "#0c0a2a"], ["#3fbf7f", "#0a2a1a"], ["#2fa8ff", "#06182e"],
  ["#1ec8c8", "#031c22"], ["#ff4d9a", "#2a0618"], ["#f2b631", "#2e2104"], ["#e2554b", "#2b0806"]];
const CRON_PSANI = "7 * * * *";

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

async function apiStav(env) {
  const [z, c, v] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM zdroje"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM clanky"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM prispevky WHERE stav = 'publikovano'"),
  ]);
  const stavy = Object.fromEntries(z.results.map((r) => [r.id, r]));
  return json({
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
  if (url.pathname === "/api/streameri") {
    // Streameři jsou zatím testovací data ze statických souborů.
    return env.ASSETS.fetch(new Request(new URL("/data/streameri.json", url)));
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
    else return json({ chyba: "Nenalezeno" }, 404);
  } catch (e) {
    if (/no such table/i.test(String(e))) {
      ctx.waitUntil(zajistiSchema(env.DB));
      return json([], 200);
    }
    console.error(e);
    return json({ chyba: "Interní chyba" }, 500);
  }
  if (odpoved.status === 200) ctx.waitUntil(cache.put(klic, odpoved.clone()));
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

    if (url.pathname.startsWith("/api/")) return verejneApi(request, env, ctx, url);
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    if (event.cron === CRON_PSANI) {
      ctx.waitUntil(napisClanek(env).then((v) => console.log("psaní:", JSON.stringify(v))).catch((e) => console.error("psaní:", e)));
    } else {
      ctx.waitUntil(sber(env));
    }
  },
};
