// Herní puls – Worker: statický web + API + sběrač novinek.
import { ZDROJE } from "./zdroje.js";
import { sber, zajistiSchema } from "./sber.js";

const PLATFORMY = new Set(["PC", "PS5", "Xbox", "Switch"]);
const ZDROJ_PODLE_ID = Object.fromEntries(ZDROJE.map((z) => [z.id, z]));
const BARVY = [["#ff7a3d", "#5a1a0a"], ["#7c5cff", "#0c0a2a"], ["#3fbf7f", "#0a2a1a"], ["#2fa8ff", "#06182e"],
  ["#1ec8c8", "#031c22"], ["#ff4d9a", "#2a0618"], ["#f2b631", "#2e2104"], ["#e2554b", "#2b0806"]];

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

function barvaZdroje(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BARVY[h % BARVY.length];
}

// Řádek z databáze → tvar, který zná web.
function naClanek(r) {
  const z = ZDROJ_PODLE_ID[r.zdroj_id] || { nazev: r.zdroj_id };
  let platformy = [];
  try { platformy = JSON.parse(r.platformy || "[]"); } catch {}
  return {
    id: r.id, nadpis: r.nadpis, perex: r.perex || "", obrazek: r.obrazek || "",
    url: r.url, datum: new Date(r.datum).toISOString(), platformy, typ: r.typ || "Zpráva",
    jazyk: r.jazyk, zdroje: [{ nazev: z.nazev, url: r.url }], barva: barvaZdroje(r.zdroj_id), ai: false,
  };
}

async function apiClanky(url, env) {
  const p = url.searchParams;
  const limit = Math.min(Math.max(parseInt(p.get("limit") || "60", 10) || 60, 1), 100);
  const platforma = p.get("platforma");
  const q = (p.get("q") || "").slice(0, 80).trim();
  const jazyk = p.get("jazyk");

  // Všechny vstupy jdou do SQL pouze přes bind() – žádné skládání dotazu z textu.
  const kde = [], hodnoty = [];
  if (platforma && PLATFORMY.has(platforma)) { kde.push("platformy LIKE ?"); hodnoty.push(`%"${platforma}"%`); }
  if (jazyk === "cs" || jazyk === "en") { kde.push("jazyk = ?"); hodnoty.push(jazyk); }
  if (q) { kde.push("(nadpis LIKE ? OR perex LIKE ?)"); hodnoty.push(`%${q}%`, `%${q}%`); }
  const sql = `SELECT * FROM clanky ${kde.length ? "WHERE " + kde.join(" AND ") : ""} ORDER BY datum DESC LIMIT ?`;
  const { results } = await env.DB.prepare(sql).bind(...hodnoty, limit).all();
  return json(results.map(naClanek), 200, 60);
}

async function apiClanek(id, env) {
  if (!/^[0-9a-f]{24}$/.test(id)) return json({ chyba: "Neplatné id" }, 400);
  const r = await env.DB.prepare("SELECT * FROM clanky WHERE id = ?").bind(id).first();
  return r ? json(naClanek(r), 200, 300) : json({ chyba: "Nenalezeno" }, 404);
}

async function apiStav(env) {
  const { results } = await env.DB.prepare("SELECT * FROM zdroje").all();
  const stavy = Object.fromEntries(results.map((r) => [r.id, r]));
  const pocet = await env.DB.prepare("SELECT COUNT(*) AS n FROM clanky").first();
  return json({
    clanku: pocet?.n || 0,
    zdroje: ZDROJE.map((z) => ({
      nazev: z.nazev, jazyk: z.jazyk,
      posledni: stavy[z.id]?.posledni ? new Date(stavy[z.id].posledni).toISOString() : null,
      stav: stavy[z.id]?.stav || "zatím nestaženo",
      chyby: stavy[z.id]?.chyby || 0,
      aktivni: (stavy[z.id]?.chyby || 0) < 5,
    })),
  }, 200, 30);
}

async function api(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") return json({ chyba: "Metoda není povolena" }, 405);

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
    else if (url.pathname === "/api/streameri") {
      // Streameři jsou zatím testovací data ze statických souborů.
      return env.ASSETS.fetch(new Request(new URL("/data/streameri.json", url)));
    } else return json({ chyba: "Nenalezeno" }, 404);
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sber(env));
  },
};
