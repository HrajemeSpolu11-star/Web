// IsThereAnyDeal (https://isthereanydeal.com) – ceny her v desítkách obchodů PRO ČESKO (country=CZ), historicky nejnižší cena.
// Potřebuje klíč: Secret ITAD_KEY ve Workeru (Cloudflare → Worker web → Settings → Variables and Secrets). Bez klíče se použije
// CheapShark, ale bez cen (jen obchod a procento slevy), protože CheapShark zná jen ceny pro USA.
// Limit ITAD: 1000 požadavků / 5 min – my jich děláme zlomek (katalog 1 za hodinu, stránka hry 2 za 12 h na hru, sdílená mezipaměť).
// Steam má v ITAD id obchodu 61 – podle něj ověřujeme naši naměřenou slevu na Steamu.

const API = "https://api.isthereanydeal.com";
const UA = "HerniPulsBot/0.1 (+https://github.com/HrajemeSpolu11-star/Web)";
const ZEME = "CZ";
export const STEAM_SHOP = "61";
const txt = (s, max = 120) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const https = (u) => /^https:\/\//.test(String(u || "")) ? String(u) : "";
const cislo = (x) => { const n = Number(x); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };
const mena = (p) => /^[A-Z]{3}$/.test(String(p?.currency || "")) ? p.currency : "EUR";
const odkazHry = (slug) => /^[a-z0-9-]{1,120}$/.test(String(slug || "")) ? `https://isthereanydeal.com/game/${slug}/info/` : "";

async function zadost(env, cesta, body) {
  const url = `${API}${cesta}${cesta.includes("?") ? "&" : "?"}key=${encodeURIComponent(env.ITAD_KEY)}`;
  const r = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "User-Agent": UA, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} isthereanydeal`);
  return r.json();
}

const naObchod = (d, slug) => ({
  obchod: txt(d?.shop?.name, 40), obchod_id: String(d?.shop?.id ?? ""), cena: cislo(d?.price?.amount), puvodni: cislo(d?.regular?.amount),
  sleva: Math.round(Number(d?.cut) || 0), mena: mena(d?.price), url: https(d?.url) || odkazHry(slug),
});

// Katalog (hodinový cron, 1 požadavek): aktuální slevy pro Česko. Klíč katalogu cs_slevy – stejný tvar jako z CheapShark.
export async function katalogItad(env) {
  const d = await zadost(env, `/deals/v2?country=${ZEME}&limit=60&mature=false`);
  const list = Array.isArray(d?.list) ? d.list : null;
  if (!list) throw new Error("ITAD: neočekávaná odpověď (slevy)");
  const vid = new Set(), slevy = [];
  for (const x of list) {
    if (!x?.deal || x.type !== "game" || vid.has(x.id)) continue;
    const o = naObchod(x.deal, x.slug);
    if (!o.obchod || o.cena == null || !(o.sleva > 0) || !o.url) continue;
    vid.add(x.id);
    slevy.push({ nazev: txt(x.title), ...o, steam_id: null, nejniz: x.deal.historyLow?.amount != null && cislo(x.deal.historyLow.amount) >= o.cena,
      obrazek: https(x.assets?.banner300 || x.assets?.banner145 || x.assets?.boxart) });
    if (slevy.length >= 20) break;
  }
  return { cs_slevy: slevy, cs_zdroj: [{ zdroj: "IsThereAnyDeal", zeme: ZEME }] };
}

// Ceny jedné hry pro Česko ve všech obchodech podle Steam ID (2 požadavky).
export async function cenyHryItad(env, steamId) {
  const l = await zadost(env, `/games/lookup/v1?appid=${encodeURIComponent(steamId)}`);
  if (!l?.found || !l.game?.id) return { obchody: [] };
  const p = await zadost(env, `/games/prices/v3?country=${ZEME}&vouchers=false`, [l.game.id]);
  const hra = Array.isArray(p) ? p.find((x) => x?.id === l.game.id) : null;
  const obchody = (hra?.deals || []).map((d) => naObchod(d, l.game.slug)).filter((o) => o.obchod && o.cena != null && o.url)
    .sort((a, b) => a.cena - b.cena).slice(0, 10);
  const nej = hra?.historyLow?.all;
  return { zeme: ZEME, mena: obchody[0]?.mena || mena(nej), obchody, nejlevneji_kdy: nej?.amount != null ? { cena: cislo(nej.amount), den: null } : null,
    odkaz: odkazHry(l.game.slug) };
}
