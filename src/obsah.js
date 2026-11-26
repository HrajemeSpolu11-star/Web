// Obsah od streamerů: videa z YouTube (veřejné RSS kanálu, bez klíče) a nejlepší klipy z Twitche za týden.
// Cron "40 * * * *". Jeden běh: max 4 dohledání ID kanálu + 8 YouTube RSS + 8× Twitch /clips (+1 token) ≈ 19 požadavků
// + hlídač cen a čeština (src/hlidac.js): 3 požadavky na ceny + 12 na jazyky → celkem ≈ 34 z 50.
// Zápisy: jen nová videa (INSERT OR IGNORE), klipy (max 40) a značky času obnovy (16) → ~1 500 řádků denně.
import { token, helix, zajistiSchemaTwitch } from "./twitch.js";
import { ZDROJE } from "./zdroje.js";
import { sberHlidace } from "./hlidac.js";

const NAZEV_ZDROJE = Object.fromEntries(ZDROJE.map((z) => [z.id, z.nazev]));

const UA = "HerniPulsBot/0.1 (+https://github.com/HrajemeSpolu11-star/Web)";
const KANALU_NA_BEH = 8;
const KLIPU_STREAMERU_NA_BEH = 8;
const DOHLEDANI_NA_BEH = 4;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS videa (id TEXT PRIMARY KEY, streamer_id TEXT NOT NULL, nazev TEXT NOT NULL, cas INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_videa_cas ON videa(cas)`,
  `CREATE TABLE IF NOT EXISTS klipy (id TEXT PRIMARY KEY, streamer_id TEXT NOT NULL, url TEXT NOT NULL, nazev TEXT,
     nahled TEXT, zhlednuti INTEGER DEFAULT 0, delka INTEGER, hra_id TEXT, cas INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_klipy_cas ON klipy(cas)`,
  // klic = "yt:<streamer_id>" (data = ID kanálu nebo chyba) nebo "kl:<streamer_id>" (čas posledních klipů)
  `CREATE TABLE IF NOT EXISTS obsah_stav (klic TEXT PRIMARY KEY, data TEXT, zdroj TEXT, cas INTEGER NOT NULL)`,
];
export async function zajistiSchemaObsah(db) { await db.batch(SCHEMA.map((s) => db.prepare(s))); }

const https = (u) => /^https:\/\//.test(String(u || "")) ? String(u) : "";
const ytId = (s) => /^UC[\w-]{22}$/.test(String(s || "")) ? String(s) : "";
const odkazYoutube = (odkazy) => { try { return https(JSON.parse(odkazy || "{}").youtube); } catch { return ""; } };
// Odkaz na YouTube kanál z popisu, který si streamer sám napsal na Twitchi/Kicku (např. „youtube.com/@jmeno“).
// Odkazy na jednotlivá videa (youtu.be, watch?v=) se neberou – jen kanály.
function youtubeZPopisu(popis) {
  const m = /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(@[\w.\-]{3,40}|channel\/UC[\w-]{22}|c\/[\w.\-]{2,60}|user\/[\w.\-]{2,60})/i.exec(String(popis || ""));
  return m ? `https://www.youtube.com/${m[1].replace(/\.+$/, "")}` : "";
}
const dekoduj = (s) => String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).trim();

// Z adresy kanálu získá ID „UC…“. Odkazy /channel/UC… přímo, jinak (/@jmeno, /c/…, /user/…) přečte stránku kanálu.
export async function idKanalu(url) {
  const u = new URL(url);
  if (!/(^|\.)youtube\.com$/.test(u.hostname)) throw new Error("není odkaz na youtube.com");
  const m = u.pathname.match(/^\/channel\/(UC[\w-]{22})/);
  if (m) return m[1];
  const r = await fetch(`https://www.youtube.com${u.pathname}`, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "cs", Cookie: "SOCS=CAI; CONSENT=YES+1" },
    signal: AbortSignal.timeout(10000), redirect: "follow",
  });
  if (!r.ok) throw new Error(`YouTube HTTP ${r.status}`);
  let id = "";
  // Stránka kanálu je velká (přes 1 MB). Čteme ji po kouscích a skončíme, jakmile najdeme ID kanálu
  // (je v hlavičce v odkazu „canonical“) – šetří to procesorový čas (limit 10 ms).
  const cteni = r.body.getReader(), dekoder = new TextDecoder();
  let okno = "", precteno = 0;
  while (!id && precteno < 1_500_000) {
    const { value, done } = await cteni.read();
    if (done) break;
    precteno += value.length;
    okno = (okno.slice(-300) + dekoder.decode(value, { stream: true }));
    const m = /(?:rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/|"externalId":"|itemprop="identifier" content=")(UC[\w-]{22})/.exec(okno);
    if (m) id = m[1];
  }
  await cteni.cancel().catch(() => {});
  if (!id) throw new Error("ID kanálu se nenašlo – vlož odkaz ve tvaru youtube.com/channel/UC…");
  return id;
}

export function parsujYoutube(xml) {
  const out = [];
  for (const blok of xml.split("<entry>").slice(1, 16)) {
    const id = (blok.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/) || [])[1];
    const nazev = dekoduj((blok.match(/<title>([\s\S]*?)<\/title>/) || [])[1]).slice(0, 160);
    const cas = Date.parse((blok.match(/<published>([^<]+)<\/published>/) || [])[1]);
    if (id && nazev && cas) out.push({ id, nazev, cas, shorts: /\/shorts\//.test(blok) });
  }
  return out;
}

async function youtube(env, db, ted) {
  const vysledek = { videi: 0, chyby: [] };
  // Kanál z odkazu v adminu, jinak z popisu kanálu na Twitchi/Kicku.
  const { results } = await db.prepare(`SELECT s.id, s.odkazy, s.popis, o.data, o.zdroj, o.cas FROM streameri s
      LEFT JOIN obsah_stav o ON o.klic = 'yt:' || s.id
      WHERE s.skryty = 0 AND (s.odkazy LIKE '%youtube.com%' OR s.popis LIKE '%youtube.com/%') AND COALESCE(o.cas, 0) < ?
      ORDER BY COALESCE(o.cas, 0) ASC LIMIT ?`).bind(ted - 3 * 3600e3, KANALU_NA_BEH).all();
  let dohledano = 0;
  const prikazy = [];
  for (const s of results) {
    const url = odkazYoutube(s.odkazy) || youtubeZPopisu(s.popis);
    if (!url) continue;
    let kanal = s.zdroj === url ? ytId(s.data) : "";
    try {
      if (!kanal) {
        if (dohledano++ >= DOHLEDANI_NA_BEH) continue;
        kanal = await idKanalu(url);
      }
      const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${kanal}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(`RSS HTTP ${r.status}`);
      const videa = parsujYoutube((await r.text()).slice(0, 600_000)).filter((v) => v.cas > ted - 60 * 86400e3);
      for (const v of videa) prikazy.push(db.prepare("INSERT OR IGNORE INTO videa (id, streamer_id, nazev, cas) VALUES (?, ?, ?, ?)").bind(v.shorts ? `s:${v.id}` : v.id, s.id, v.nazev, v.cas));
      vysledek.videi += videa.length;
      prikazy.push(db.prepare("INSERT OR REPLACE INTO obsah_stav (klic, data, zdroj, cas) VALUES (?, ?, ?, ?)").bind(`yt:${s.id}`, kanal, url, ted));
    } catch (e) {
      vysledek.chyby.push(`${s.id}: ${String(e.message || e).slice(0, 100)}`);
      // Chybu uložíme do stavu (vidí ji admin) a zkusíme to znovu až za den.
      prikazy.push(db.prepare("INSERT OR REPLACE INTO obsah_stav (klic, data, zdroj, cas) VALUES (?, ?, ?, ?)").bind(`yt:${s.id}`, `chyba: ${String(e.message || e).slice(0, 140)}`, url, ted + 86400e3));
    }
  }
  prikazy.push(db.prepare("DELETE FROM videa WHERE cas < ?").bind(ted - 60 * 86400e3));
  await db.batch(prikazy);
  return vysledek;
}

async function klipy(env, db, ted) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return { klipu: 0 };
  // Nejsledovanější streameři Twitche, nejdéle neobnovení jako první.
  const { results } = await db.prepare(`SELECT s.id FROM (SELECT id FROM streameri WHERE skryty = 0 AND COALESCE(platforma, 'twitch') = 'twitch'
      AND id NOT LIKE 'k%' ORDER BY sledujici DESC LIMIT 80) s LEFT JOIN obsah_stav o ON o.klic = 'kl:' || s.id
      ORDER BY COALESCE(o.cas, 0) ASC LIMIT ?`).bind(KLIPU_STREAMERU_NA_BEH).all();
  if (!results.length) return { klipu: 0 };
  let tok = await token(env);
  const od = new Date(ted - 7 * 86400e3).toISOString();
  const odpovedi = await Promise.allSettled(results.map(async (s) => {
    const cesta = `/clips?broadcaster_id=${encodeURIComponent(s.id)}&first=5&started_at=${encodeURIComponent(od)}`;
    try { return await helix(env, cesta, tok); }
    catch (e) { if (e.kod !== 401) throw e; tok = await token(env, true); return helix(env, cesta, tok); }
  }));
  const prikazy = [];
  let pocet = 0;
  results.forEach((s, i) => {
    const o = odpovedi[i];
    if (o.status !== "fulfilled") return;
    for (const k of o.value?.data || []) {
      if (!k.id || !https(k.url)) continue;
      pocet++;
      prikazy.push(db.prepare(`INSERT OR REPLACE INTO klipy (id, streamer_id, url, nazev, nahled, zhlednuti, delka, hra_id, cas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(String(k.id).slice(0, 120), s.id, k.url, String(k.title || "").slice(0, 140),
        https(k.thumbnail_url), k.view_count || 0, Math.round(k.duration || 0), String(k.game_id || ""), Date.parse(k.created_at) || ted));
    }
    prikazy.push(db.prepare("INSERT OR REPLACE INTO obsah_stav (klic, data, zdroj, cas) VALUES (?, '', '', ?)").bind(`kl:${s.id}`, ted));
  });
  prikazy.push(db.prepare("DELETE FROM klipy WHERE cas < ?").bind(ted - 14 * 86400e3));
  await db.batch(prikazy);
  return { klipu: pocet };
}

export async function sberObsahu(env) {
  const db = env.DB;
  await zajistiSchemaTwitch(db);
  await zajistiSchemaObsah(db);
  const ted = Date.now();
  const [yt, kl, hl] = await Promise.allSettled([youtube(env, db, ted), klipy(env, db, ted), sberHlidace(env)]);
  return {
    hlidac: hl.status === "fulfilled" ? hl.value : String(hl.reason?.message || hl.reason),
    youtube: yt.status === "fulfilled" ? yt.value : String(yt.reason?.message || yt.reason),
    klipy: kl.status === "fulfilled" ? kl.value : String(kl.reason?.message || kl.reason),
  };
}

// Veřejné API: videa, klipy týdne a recenze z českých i zahraničních webů.
export async function apiObsah(env) {
  const db = env.DB;
  await zajistiSchemaTwitch(db);
  await zajistiSchemaObsah(db);
  const ted = Date.now();
  const streamer = (r) => ({ jmeno: r.jmeno || r.login, login: r.login, platforma: r.platforma || "twitch", profilovka: https(r.profilovka) });
  const [v, k, rec] = await db.batch([
    db.prepare(`SELECT v.id, v.nazev, v.cas, s.jmeno, s.login, s.platforma, s.profilovka FROM videa v JOIN streameri s ON s.id = v.streamer_id
      WHERE s.skryty = 0 AND v.id NOT LIKE 's:%' ORDER BY v.cas DESC LIMIT 24`),
    db.prepare(`SELECT k.url, k.nazev, k.nahled, k.zhlednuti, k.delka, k.cas, s.jmeno, s.login, s.platforma, s.profilovka FROM klipy k
      JOIN streameri s ON s.id = k.streamer_id WHERE s.skryty = 0 AND k.cas > ? ORDER BY k.zhlednuti DESC LIMIT 12`).bind(ted - 7 * 86400e3),
    db.prepare(`SELECT c.id, c.url, c.nadpis, c.perex, c.obrazek, c.jazyk, c.datum, c.zdroj_id FROM clanky c
      WHERE c.typ = 'Recenze' OR c.nadpis LIKE '%recenze%' OR c.nadpis LIKE '%review%' ORDER BY (c.jazyk = 'cs') DESC, c.datum DESC LIMIT 12`),
  ]);
  return {
    videa: v.results.map((r) => ({ id: r.id, url: `https://www.youtube.com/watch?v=${r.id}`, nahled: `https://i.ytimg.com/vi/${r.id}/mqdefault.jpg`,
      nazev: r.nazev, cas: new Date(r.cas).toISOString(), streamer: streamer(r) })),
    klipy: k.results.map((r) => ({ url: r.url, nazev: r.nazev, nahled: r.nahled, zhlednuti: r.zhlednuti, delka: r.delka,
      cas: new Date(r.cas).toISOString(), streamer: streamer(r) })),
    recenze: rec.results.map((r) => ({ id: r.id, url: https(r.url), nadpis: r.nadpis, perex: String(r.perex || "").slice(0, 200),
      obrazek: https(r.obrazek), jazyk: r.jazyk, zdroj: NAZEV_ZDROJE[r.zdroj_id] || r.zdroj_id || "", datum: new Date(r.datum).toISOString() })),
  };
}

// Pro admin: stav YouTube kanálů (jestli se ID podařilo najít).
export async function stavYoutube(db) {
  await zajistiSchemaObsah(db);
  const { results } = await db.prepare("SELECT klic, data, zdroj, cas FROM obsah_stav WHERE klic LIKE 'yt:%'").all();
  return Object.fromEntries(results.map((r) => [r.klic.slice(3), { kanal: ytId(r.data), chyba: ytId(r.data) ? "" : r.data, odkaz: r.zdroj }]));
}
