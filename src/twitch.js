// Sběr českých streamerů z oficiálního Twitch API (Helix).
// Všechna čísla pocházejí přímo z Twitche – nic se neodhaduje ani negeneruje.
import { denPraha } from "./psani.js";
import { SCHEMA_PREHLED, prikazScena, prikazMilnik, vyhodnotZmeny, nactiPredchozi, prikazyHryDen, rezervujMinuty, vratMinuty } from "./prehled.js";
import { SCHEMA_PUSH, zaradUpozorneni, odesliFrontu } from "./push.js";

const API = "https://api.twitch.tv/helix";
const JAZYK = "cs";
const MAX_STRAN = 6;              // max. 600 živých streamů na jeden běh
const PROFILU_NA_BEH = 100;       // obnova profilů (1 požadavek)
const SLEDUJICICH_NA_BEH = 15;    // obnova počtu sledujících (1 požadavek na kanál)
const ROZVRHU_NA_BEH = 5;         // obnova rozvrhů pro kalendář (1 požadavek na kanál)
const PUSH_NA_BEH = 10;           // max. odeslaných upozornění za běh (limit 50 požadavků na běh)
const ZIVE_PLATNOST = 25 * 60e3;
// Dřív MIN_STATISTIKY = 3 (statistiky jen od 3 diváků). Teď se počítají všechny streamy.

export const SCHEMA_TWITCH = [
  `CREATE TABLE IF NOT EXISTS nastaveni (klic TEXT PRIMARY KEY, hodnota TEXT, plati_do INTEGER)`,
  `CREATE TABLE IF NOT EXISTS streameri (
     id TEXT PRIMARY KEY, login TEXT NOT NULL, jmeno TEXT, popis TEXT, profilovka TEXT, banner TEXT,
     typ TEXT, ucet_od TEXT, sledujici INTEGER, sledujici_cas INTEGER,
     prvni_videno INTEGER, posledni_zive INTEGER, posledni_stream TEXT, pocet_streamu INTEGER DEFAULT 0,
     max_divaku INTEGER DEFAULT 0, posledni_hra TEXT, profil_cas INTEGER DEFAULT 0,
     skryty INTEGER DEFAULT 0, overeno INTEGER DEFAULT 0,
     zive_cas INTEGER, zive_hra TEXT, zive_titulek TEXT, zive_divaci INTEGER, zive_zacatek TEXT, zive_nahled TEXT)`,
  // Seznam her (slug pro adresy /hra/…).
  `CREATE TABLE IF NOT EXISTS hry (slug TEXT PRIMARY KEY, nazev TEXT NOT NULL, posledni INTEGER)`,
  `CREATE INDEX IF NOT EXISTS idx_streameri_zive ON streameri(zive_cas)`,
  `CREATE TABLE IF NOT EXISTS snimky (
     user_id TEXT NOT NULL, den TEXT NOT NULL, sledujici INTEGER, max_divaku INTEGER DEFAULT 0,
     minut INTEGER DEFAULT 0, PRIMARY KEY (user_id, den))`,
  `CREATE TABLE IF NOT EXISTS hry_streamera (
     user_id TEXT NOT NULL, hra TEXT NOT NULL, minut INTEGER DEFAULT 0, posledni INTEGER,
     PRIMARY KEY (user_id, hra))`,
  // Kdo hraje danou hru (stránka hry). Index jen na `hra` (nemění se), ne na `minut` – ten se mění každý běh = zápisy navíc.
  `CREATE INDEX IF NOT EXISTS idx_hry_streamera_hra ON hry_streamera(hra)`,
  // POZOR: index snimky(den) se tu automaticky NEZAKLÁDÁ. Založení indexu nad existující tabulkou počítá D1 jako zápis
  // za každý řádek (desítky tisíc) a spolu s běžným provozem vyčerpalo denní limit 100 tis. zápisů → sběr streamerů
  // přestal zapisovat (2026-11-27). Kód index použije, jen když existuje (src/indexy.js).
];

let migraceHotova = false;
export async function zajistiSchemaTwitch(db) {
  if (migraceHotova) return;
  try {
    await db.batch([...SCHEMA_TWITCH, ...SCHEMA_PREHLED, ...SCHEMA_PUSH].map((s) => db.prepare(s)));
  } catch (e) {
    // Když dávka selže (např. vyčerpaný denní limit zápisů), ale hlavní tabulky už existují, web musí dál číst data.
    const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('streameri', 'snimky', 'hry_den', 'hry')").all();
    if (results.length < 4) throw e;
    console.warn("schéma Twitch: dávka selhala, tabulky existují – pokračuji:", String(e?.message || e));
    migraceHotova = true;
    return;
  }
  // Migrace: sloupec platforma (twitch/kick). Index na login není unikátní – přejmenování účtů nesmí shodit zápis.
  const { results } = await db.prepare("PRAGMA table_info(streameri)").all();
  if (!results.some((c) => c.name === "platforma")) {
    await db.batch([
      db.prepare("ALTER TABLE streameri ADD COLUMN platforma TEXT NOT NULL DEFAULT 'twitch'"),
      db.prepare("DROP INDEX IF EXISTS idx_streameri_login"),
    ]);
  }
  // Migrace: odkazy na sítě (ručně z adminu) a čas poslední obnovy rozvrhu.
  const sloupce = new Set(results.map((c) => c.name));
  const pridat = [];
  if (!sloupce.has("odkazy")) pridat.push(db.prepare("ALTER TABLE streameri ADD COLUMN odkazy TEXT"));
  if (!sloupce.has("rozvrh_cas")) pridat.push(db.prepare("ALTER TABLE streameri ADD COLUMN rozvrh_cas INTEGER DEFAULT 0"));
  const sloupceHry = new Set((await db.prepare("PRAGMA table_info(hry)").all()).results.map((c) => c.name));
  if (!sloupceHry.has("twitch_id")) pridat.push(db.prepare("ALTER TABLE hry ADD COLUMN twitch_id TEXT"));
  if (pridat.length) await db.batch(pridat);
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_streameri_plogin ON streameri(platforma, login)").run();
  migraceHotova = true;
}

// Slug pro adresu hry: „Counter-Strike 2“ → „counter-strike-2“.
export function slugHry(nazev) {
  return String(nazev || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

// App access token (client credentials). Uložený v D1, platí ~60 dní.
export async function token(env, obnovit = false) {
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

export async function helix(env, cesta, tok) {
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

// Spustí sběr hned, pokud poslední proběhl před víc než 10 minutami (zámek brání souběhu).
export async function sberTwitchPokudStary(env) {
  if (!env.TWITCH_CLIENT_ID) return;
  const db = env.DB;
  await zajistiSchemaTwitch(db);
  const ted = Date.now();
  const st = await db.prepare("SELECT hodnota FROM nastaveni WHERE klic = 'twitch_stav'").first();
  const posledni = st ? JSON.parse(st.hodnota).cas || 0 : 0;
  if (ted - posledni < 10 * 60e3) return;
  const zamek = await db.prepare(`INSERT INTO nastaveni (klic, hodnota, plati_do) VALUES ('twitch_zamek', '', ?)
    ON CONFLICT(klic) DO UPDATE SET plati_do = excluded.plati_do WHERE nastaveni.plati_do < ?`).bind(ted + 120e3, ted).run();
  if (!zamek.meta?.changes) return;
  const { sberKick } = await import("./kick.js");
  await Promise.allSettled([sberTwitch(env), sberKick(env)]);
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

    // Předchozí stav (kdo byl živě, rekordy) – pro upozornění a milníky.
    const predchozi = await nactiPredchozi(db, "twitch", ted, ZIVE_PLATNOST);
    const zmeny = vyhodnotZmeny(db, ted, predchozi, streamy, (s) => s.user_id, "twitch");
    // Skutečně uplynulé minuty od minulého započteného běhu (0 = souběžný běh, statistiky nenavyšuje).
    const minut = await rezervujMinuty(db, "twitch", ted);
    const prikazy = [...zmeny.prikazy, prikazScena(db, ted, "twitch", streamy), ...prikazyHryDen(db, ted, "twitch", streamy, (s) => s.game_name, minut)];
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
    const hraSeznam = db.prepare(`INSERT INTO hry (slug, nazev, posledni, twitch_id) VALUES (?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET posledni = excluded.posledni, twitch_id = COALESCE(excluded.twitch_id, hry.twitch_id)`);
    const videneHry = new Set();
    const hra = db.prepare(`INSERT INTO hry_streamera (user_id, hra, minut, posledni) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, hra) DO UPDATE SET minut = hry_streamera.minut + excluded.minut, posledni = excluded.posledni`);

    for (const s of streamy) {
      const nahled = String(s.thumbnail_url || "").replace("{width}", "440").replace("{height}", "248");
      prikazy.push(
        upsert.bind(s.user_id, s.user_login, s.user_name, ted, ted, s.id, s.viewer_count || 0, s.game_name || "",
          ted, s.game_name || "", String(s.title || "").slice(0, 300), s.viewer_count || 0, s.started_at || null, nahled),
      );
      const slug = slugHry(s.game_name);
      if (slug && !videneHry.has(slug)) { videneHry.add(slug); prikazy.push(hraSeznam.bind(slug, s.game_name, ted, s.game_id ? String(s.game_id) : null)); }
      { // od 2026-11-26 všechny streamy (i 0–2 diváci), ať jsou hodiny malých kanálů přesné
        prikazy.push(snimek.bind(s.user_id, den, s.viewer_count || 0, minut));
        if (s.game_name && minut) prikazy.push(hra.bind(s.user_id, s.game_name, minut, ted));
      }
    }
    if (prikazy.length) {
      try { await db.batch(prikazy); }
      catch (e) { await vratMinuty(db, "twitch"); throw e; } // zápis selhal → interval vrátit, nezapočítá se dvakrát ani neztratí
    }
    await zaradUpozorneni(env, zmeny.noveZive);

    // 2) Obnova profilů (popis, profilovka, banner, typ účtu) – nové a starší než 24 h.
    const { results: kProfilu } = await db.prepare(
      "SELECT id FROM streameri WHERE platforma = 'twitch' AND profil_cas < ? ORDER BY max_divaku DESC LIMIT ?").bind(ted - 86400e3, PROFILU_NA_BEH).all();
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
      `SELECT id, sledujici FROM streameri WHERE platforma = 'twitch' AND skryty = 0 AND max_divaku >= 5 AND (sledujici_cas IS NULL OR sledujici_cas < ?)
       ORDER BY sledujici_cas IS NOT NULL, sledujici_cas LIMIT ?`).bind(ted - 86400e3, SLEDUJICICH_NA_BEH).all();
    let sledujiciChyba = null;
    const sledPrikazy = [];
    for (const r of kSled) {
      try {
        const d = await volej(`/channels/followers?broadcaster_id=${encodeURIComponent(r.id)}&first=1`);
        if (typeof d.total === "number") {
          const milnik = prikazMilnik(db, ted, r.id, r.sledujici, d.total);
          if (milnik) sledPrikazy.push(milnik);
          sledPrikazy.push(
            db.prepare("UPDATE streameri SET sledujici = ?, sledujici_cas = ? WHERE id = ?").bind(d.total, ted, r.id),
            db.prepare(`INSERT INTO snimky (user_id, den, sledujici) VALUES (?, ?, ?)
              ON CONFLICT(user_id, den) DO UPDATE SET sledujici = excluded.sledujici`).bind(r.id, den, d.total));
        }
      } catch (e) { sledujiciChyba = String(e.message || e); break; }
    }
    if (sledPrikazy.length) await db.batch(sledPrikazy);

    // 4) Rozvrhy pro kalendář – největší kanály, obnova po 12 h.
    const { results: kRozvrhu } = await db.prepare(
      `SELECT id FROM streameri WHERE platforma = 'twitch' AND skryty = 0 AND sledujici IS NOT NULL AND COALESCE(rozvrh_cas, 0) < ?
       ORDER BY sledujici DESC LIMIT ?`).bind(ted - 12 * 3600e3, ROZVRHU_NA_BEH).all();
    const rozPrikazy = [];
    for (const r of kRozvrhu) {
      rozPrikazy.push(db.prepare("UPDATE streameri SET rozvrh_cas = ? WHERE id = ?").bind(ted, r.id),
        db.prepare("DELETE FROM rozvrh WHERE user_id = ? AND zacatek > ?").bind(r.id, ted));
      try {
        const d = await volej(`/schedule?broadcaster_id=${encodeURIComponent(r.id)}&first=20`);
        for (const seg of d.data?.segments || []) {
          const z = Date.parse(seg.start_time);
          if (seg.canceled_until || !Number.isFinite(z) || z < ted || z > ted + 7 * 86400e3) continue;
          rozPrikazy.push(db.prepare("INSERT OR REPLACE INTO rozvrh (user_id, zacatek, konec, nazev, hra) VALUES (?,?,?,?,?)")
            .bind(r.id, z, Date.parse(seg.end_time) || null, String(seg.title || "").slice(0, 140), seg.category?.name || ""));
        }
      } catch { /* bez rozvrhu (Twitch vrací 404) – nic */ }
    }
    if (rozPrikazy.length) await db.batch(rozPrikazy);
    // Data pro týdenní reporty a žebříčky držíme ~13 měsíců (malé tabulky: ~200 a ~150 řádků denně).
    await db.batch([
      db.prepare("DELETE FROM scena WHERE cas < ?").bind(ted - 400 * 86400e3),
      db.prepare("DELETE FROM hry_den WHERE den < ?").bind(new Date(ted - 400 * 86400e3).toISOString().slice(0, 10)),
    ]);
    try { await odesliFrontu(env, PUSH_NA_BEH); } catch (e) { console.warn("push fronta:", e); }

    await zaznamenejStav(db, { ok: true, zivych: streamy.length, profilu: kProfilu.length, sledujicich: sledPrikazy.length / 2, chyba_sledujici: sledujiciChyba });
  } catch (e) {
    console.error("twitch:", e);
    await zaznamenejStav(db, { ok: false, chyba: String(e.message || e).slice(0, 200) });
  }
}
