// Sběr českých streamerů z oficiálního Twitch API (Helix).
// Všechna čísla pocházejí přímo z Twitche – nic se neodhaduje ani negeneruje.
import { denPraha } from "./psani.js";

const API = "https://api.twitch.tv/helix";
const JAZYK = "cs";
const MAX_STRAN = 6;              // max. 600 živých streamů na jeden běh
const PROFILU_NA_BEH = 100;       // obnova profilů (1 požadavek)
const SLEDUJICICH_NA_BEH = 20;    // obnova počtu sledujících (1 požadavek na kanál)
const INTERVAL_MIN = 15;
const MIN_DIVAKU = 3;             // menší streamy se neukládají (šetří denní limit zápisů D1)

export const SCHEMA_TWITCH = [
  `CREATE TABLE IF NOT EXISTS nastaveni (klic TEXT PRIMARY KEY, hodnota TEXT, plati_do INTEGER)`,
  `CREATE TABLE IF NOT EXISTS streameri (
     id TEXT PRIMARY KEY, login TEXT NOT NULL, jmeno TEXT, popis TEXT, profilovka TEXT, banner TEXT,
     typ TEXT, ucet_od TEXT, sledujici INTEGER, sledujici_cas INTEGER,
     prvni_videno INTEGER, posledni_zive INTEGER, posledni_stream TEXT, pocet_streamu INTEGER DEFAULT 0,
     max_divaku INTEGER DEFAULT 0, posledni_hra TEXT, profil_cas INTEGER DEFAULT 0,
     skryty INTEGER DEFAULT 0, overeno INTEGER DEFAULT 0,
     zive_cas INTEGER, zive_hra TEXT, zive_titulek TEXT, zive_divaci INTEGER, zive_zacatek TEXT, zive_nahled TEXT)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_streameri_login ON streameri(login)`,
  `CREATE INDEX IF NOT EXISTS idx_streameri_zive ON streameri(zive_cas)`,
  `CREATE TABLE IF NOT EXISTS snimky (
     user_id TEXT NOT NULL, den TEXT NOT NULL, sledujici INTEGER, max_divaku INTEGER DEFAULT 0,
     minut INTEGER DEFAULT 0, PRIMARY KEY (user_id, den))`,
  `CREATE TABLE IF NOT EXISTS hry_streamera (
     user_id TEXT NOT NULL, hra TEXT NOT NULL, minut INTEGER DEFAULT 0, posledni INTEGER,
     PRIMARY KEY (user_id, hra))`,
];

export async function zajistiSchemaTwitch(db) {
  await db.batch(SCHEMA_TWITCH.map((s) => db.prepare(s)));
}

// App access token (client credentials). Uložený v D1, platí ~60 dní.
async function token(env, obnovit = false) {
  const db = env.DB;
  if (!obnovit) {
    const t = await db.prepare("SELECT hodnota, plati_do FROM nastaveni WHERE klic = 'twitch_token'").first();
    if (t && t.plati_do > Date.now() + 3600e3) return t.hodnota;
  }
  const r = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Twitch token HTTP ${r.status}`);
  const d = await r.json();
  await db.prepare("INSERT OR REPLACE INTO nastaveni (klic, hodnota, plati_do) VALUES ('twitch_token', ?, ?)")
    .bind(d.access_token, Date.now() + (d.expires_in || 3600) * 1000).run();
  return d.access_token;
}

async function helix(env, cesta, tok) {
  const r = await fetch(API + cesta, {
    headers: { "Client-Id": env.TWITCH_CLIENT_ID, Authorization: `Bearer ${tok}` },
    signal: AbortSignal.timeout(10000),
  });
  if (r.status === 401) { const e = new Error("401"); e.kod = 401; throw e; }
  if (!r.ok) throw new Error(`Twitch ${cesta.split("?")[0]} HTTP ${r.status}`);
  return r.json();
}

async function zaznamenejStav(db, stav) {
  await db.prepare("INSERT OR REPLACE INTO nastaveni (klic, hodnota, plati_do) VALUES ('twitch_stav', ?, NULL)")
    .bind(JSON.stringify({ ...stav, cas: Date.now() })).run();
}

export async function sberTwitch(env) {
  const db = env.DB;
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return;
  await zajistiSchemaTwitch(db);
  const ted = Date.now();
  const den = denPraha(ted);

  try {
    let tok = await token(env);
    const volej = async (cesta) => {
      try { return await helix(env, cesta, tok); }
      catch (e) { if (e.kod !== 401) throw e; tok = await token(env, true); return helix(env, cesta, tok); }
    };

    // 1) Všechny právě běžící streamy v češtině.
    const streamy = [];
    let kurzor = "";
    for (let i = 0; i < MAX_STRAN; i++) {
      const d = await volej(`/streams?language=${JAZYK}&type=live&first=100${kurzor ? "&after=" + encodeURIComponent(kurzor) : ""}`);
      streamy.push(...(d.data || []));
      kurzor = d.pagination?.cursor;
      if (!kurzor || (d.data || []).length < 100) break;
    }

    const prikazy = [];
    const upsert = db.prepare(`
      INSERT INTO streameri (id, login, jmeno, prvni_videno, posledni_zive, posledni_stream, pocet_streamu, max_divaku, posledni_hra,
        zive_cas, zive_hra, zive_titulek, zive_divaci, zive_zacatek, zive_nahled)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET login = excluded.login, jmeno = excluded.jmeno, posledni_zive = excluded.posledni_zive,
        zive_cas = excluded.zive_cas, zive_hra = excluded.zive_hra, zive_titulek = excluded.zive_titulek,
        zive_divaci = excluded.zive_divaci, zive_zacatek = excluded.zive_zacatek, zive_nahled = excluded.zive_nahled,
        pocet_streamu = streameri.pocet_streamu + (CASE WHEN streameri.posledni_stream IS excluded.posledni_stream THEN 0 ELSE 1 END),
        posledni_stream = excluded.posledni_stream,
        max_divaku = MAX(streameri.max_divaku, excluded.max_divaku),
        posledni_hra = COALESCE(NULLIF(excluded.posledni_hra, ''), streameri.posledni_hra)`);
    const snimek = db.prepare(`INSERT INTO snimky (user_id, den, max_divaku, minut) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, den) DO UPDATE SET max_divaku = MAX(snimky.max_divaku, excluded.max_divaku), minut = snimky.minut + excluded.minut`);
    const hra = db.prepare(`INSERT INTO hry_streamera (user_id, hra, minut, posledni) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, hra) DO UPDATE SET minut = hry_streamera.minut + excluded.minut, posledni = excluded.posledni`);

    for (const s of streamy) {
      if ((s.viewer_count || 0) < MIN_DIVAKU) continue;
      const nahled = String(s.thumbnail_url || "").replace("{width}", "440").replace("{height}", "248");
      prikazy.push(
        upsert.bind(s.user_id, s.user_login, s.user_name, ted, ted, s.id, s.viewer_count || 0, s.game_name || "",
          ted, s.game_name || "", String(s.title || "").slice(0, 300), s.viewer_count || 0, s.started_at || null, nahled),
        snimek.bind(s.user_id, den, s.viewer_count || 0, INTERVAL_MIN),
      );
      if (s.game_name) prikazy.push(hra.bind(s.user_id, s.game_name, INTERVAL_MIN, ted));
    }
    if (prikazy.length) await db.batch(prikazy);

    // 2) Obnova profilů (popis, profilovka, banner, typ účtu) – nové a starší než 24 h.
    const { results: kProfilu } = await db.prepare(
      "SELECT id FROM streameri WHERE profil_cas < ? ORDER BY max_divaku DESC LIMIT ?").bind(ted - 86400e3, PROFILU_NA_BEH).all();
    if (kProfilu.length) {
      const d = await volej("/users?" + kProfilu.map((r) => "id=" + encodeURIComponent(r.id)).join("&"));
      const upd = db.prepare("UPDATE streameri SET login=?, jmeno=?, popis=?, profilovka=?, banner=?, typ=?, ucet_od=?, profil_cas=? WHERE id=?");
      const nalezeno = new Set();
      const p = (d.data || []).map((u) => {
        nalezeno.add(u.id);
        return upd.bind(u.login, u.display_name, String(u.description || "").slice(0, 1000), u.profile_image_url || null,
          u.offline_image_url || null, u.broadcaster_type || "", u.created_at || null, ted, u.id);
      });
      // Účty, které Twitch už nevrací (smazané/zablokované), skryjeme.
      for (const r of kProfilu) if (!nalezeno.has(r.id)) p.push(db.prepare("UPDATE streameri SET skryty = 1, profil_cas = ? WHERE id = ?").bind(ted, r.id));
      if (p.length) await db.batch(p);
    }

    // 3) Počet sledujících – nejdéle neaktualizované kanály, které splňují filtr kvality.
    const { results: kSled } = await db.prepare(
      `SELECT id FROM streameri WHERE skryty = 0 AND max_divaku >= 5 AND (sledujici_cas IS NULL OR sledujici_cas < ?)
       ORDER BY sledujici_cas IS NOT NULL, sledujici_cas LIMIT ?`).bind(ted - 86400e3, SLEDUJICICH_NA_BEH).all();
    let sledujiciChyba = null;
    const sledPrikazy = [];
    for (const r of kSled) {
      try {
        const d = await volej(`/channels/followers?broadcaster_id=${encodeURIComponent(r.id)}&first=1`);
        if (typeof d.total === "number") {
          sledPrikazy.push(
            db.prepare("UPDATE streameri SET sledujici = ?, sledujici_cas = ? WHERE id = ?").bind(d.total, ted, r.id),
            db.prepare(`INSERT INTO snimky (user_id, den, sledujici) VALUES (?, ?, ?)
              ON CONFLICT(user_id, den) DO UPDATE SET sledujici = excluded.sledujici`).bind(r.id, den, d.total));
        }
      } catch (e) { sledujiciChyba = String(e.message || e); break; }
    }
    if (sledPrikazy.length) await db.batch(sledPrikazy);

    await zaznamenejStav(db, { ok: true, zivych: streamy.length, profilu: kProfilu.length, sledujicich: sledPrikazy.length / 2, chyba_sledujici: sledujiciChyba });
  } catch (e) {
    console.error("twitch:", e);
    await zaznamenejStav(db, { ok: false, chyba: String(e.message || e).slice(0, 200) });
  }
}
