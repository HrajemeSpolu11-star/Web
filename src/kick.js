// Sběr českých streamerů z oficiálního Kick Public API (api.kick.com/public/v1).
// Zapne se sám, jakmile je nastaven KICK_CLIENT_ID (wrangler.jsonc) a Secret KICK_CLIENT_SECRET.
import { denPraha } from "./psani.js";
import { zajistiSchemaTwitch, slugHry } from "./twitch.js";
import { prikazScena, vyhodnotZmeny, nactiPredchozi, prikazyHryDen } from "./prehled.js";
import { zaradUpozorneni } from "./push.js";

const API = "https://api.kick.com/public/v1";
const JAZYK = "cs";
const INTERVAL_MIN = 15;
const MIN_STATISTIKY = 3;
const PROFILU_NA_BEH = 25;

export const kickNastaven = (env) => !!(env.KICK_CLIENT_ID && env.KICK_CLIENT_SECRET);

async function token(env, obnovit = false) {
  const db = env.DB;
  if (!obnovit) {
    const t = await db.prepare("SELECT hodnota, plati_do FROM nastaveni WHERE klic = 'kick_token'").first();
    if (t && t.plati_do > Date.now() + 600e3) return t.hodnota;
  }
  const r = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.KICK_CLIENT_ID, client_secret: env.KICK_CLIENT_SECRET, grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Kick token HTTP ${r.status}`);
  const d = await r.json();
  await db.prepare("INSERT OR REPLACE INTO nastaveni (klic, hodnota, plati_do) VALUES ('kick_token', ?, ?)")
    .bind(d.access_token, Date.now() + (d.expires_in || 3600) * 1000).run();
  return d.access_token;
}

async function kick(cesta, tok) {
  const r = await fetch(API + cesta, { headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (r.status === 401) { const e = new Error("401"); e.kod = 401; throw e; }
  if (!r.ok) throw new Error(`Kick ${cesta.split("?")[0]} HTTP ${r.status}`);
  return r.json();
}

const https = (u) => /^https:\/\//.test(String(u || "")) ? String(u) : null;

export async function sberKick(env) {
  if (!kickNastaven(env)) return;
  const db = env.DB;
  await zajistiSchemaTwitch(db);
  const ted = Date.now();
  const den = denPraha(ted);
  const ulozStav = (s) => db.prepare("INSERT OR REPLACE INTO nastaveni (klic, hodnota, plati_do) VALUES ('kick_stav', ?, NULL)")
    .bind(JSON.stringify({ ...s, cas: ted })).run();

  try {
    let tok = await token(env);
    const volej = async (c) => {
      try { return await kick(c, tok); }
      catch (e) { if (e.kod !== 401) throw e; tok = await token(env, true); return kick(c, tok); }
    };

    // 1) Živé streamy v češtině (API vrací max. 100, seřazené podle diváků).
    const d = await volej(`/livestreams?language=${JAZYK}&limit=100&sort=viewer_count`);
    const streamy = (d.data || []).filter((s) => s.slug && s.broadcaster_user_id);

    const upsert = db.prepare(`
      INSERT INTO streameri (id, platforma, login, jmeno, profilovka, prvni_videno, posledni_zive, posledni_stream, pocet_streamu, max_divaku, posledni_hra,
        zive_cas, zive_hra, zive_titulek, zive_divaci, zive_zacatek, zive_nahled)
      VALUES (?, 'kick', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET login = excluded.login, jmeno = excluded.jmeno,
        profilovka = COALESCE(excluded.profilovka, streameri.profilovka), posledni_zive = excluded.posledni_zive,
        zive_cas = excluded.zive_cas, zive_hra = excluded.zive_hra, zive_titulek = excluded.zive_titulek,
        zive_divaci = excluded.zive_divaci, zive_zacatek = excluded.zive_zacatek, zive_nahled = excluded.zive_nahled,
        pocet_streamu = streameri.pocet_streamu + (CASE WHEN streameri.posledni_stream IS excluded.posledni_stream THEN 0 ELSE 1 END),
        posledni_stream = excluded.posledni_stream, max_divaku = MAX(streameri.max_divaku, excluded.max_divaku),
        posledni_hra = COALESCE(NULLIF(excluded.posledni_hra, ''), streameri.posledni_hra)`);
    const snimek = db.prepare(`INSERT INTO snimky (user_id, den, max_divaku, minut) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, den) DO UPDATE SET max_divaku = MAX(snimky.max_divaku, excluded.max_divaku), minut = snimky.minut + excluded.minut`);
    const hra = db.prepare(`INSERT INTO hry_streamera (user_id, hra, minut, posledni) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, hra) DO UPDATE SET minut = hry_streamera.minut + excluded.minut, posledni = excluded.posledni`);
    const hraSeznam = db.prepare(`INSERT INTO hry (slug, nazev, posledni) VALUES (?, ?, ?) ON CONFLICT(slug) DO UPDATE SET posledni = excluded.posledni`);

    const predchozi = await nactiPredchozi(db, "kick", ted, 25 * 60e3);
    const zmeny = vyhodnotZmeny(db, ted, predchozi, streamy, (s) => "k" + s.broadcaster_user_id, "kick");
    const prikazy = [...zmeny.prikazy, prikazScena(db, ted, "kick", streamy), ...prikazyHryDen(db, ted, "kick", streamy, (s) => s.category?.name, INTERVAL_MIN)];
    const videneHry = new Set();
    for (const s of streamy) {
      const id = "k" + s.broadcaster_user_id;
      const nazevHry = s.category?.name || "";
      // Kick nevrací ID streamu – za identitu streamu bereme čas jeho začátku.
      prikazy.push(upsert.bind(id, String(s.slug).toLowerCase(), s.slug, https(s.profile_picture), ted, ted,
        String(s.started_at || ""), s.viewer_count || 0, nazevHry,
        ted, nazevHry, String(s.stream_title || "").slice(0, 300), s.viewer_count || 0, s.started_at || null, https(s.thumbnail)));
      const slug = slugHry(nazevHry);
      if (slug && !videneHry.has(slug)) { videneHry.add(slug); prikazy.push(hraSeznam.bind(slug, nazevHry, ted)); }
      if ((s.viewer_count || 0) >= MIN_STATISTIKY) {
        prikazy.push(snimek.bind(id, den, s.viewer_count || 0, INTERVAL_MIN));
        if (nazevHry) prikazy.push(hra.bind(id, nazevHry, INTERVAL_MIN, ted));
      }
    }
    if (prikazy.length) await db.batch(prikazy);
    await zaradUpozorneni(env, zmeny.noveZive);

    // 2) Profily (popis, banner) – nové a starší než 24 h.
    const { results: kProfilu } = await db.prepare(
      "SELECT id, login FROM streameri WHERE platforma = 'kick' AND profil_cas < ? ORDER BY max_divaku DESC LIMIT ?").bind(ted - 86400e3, PROFILU_NA_BEH).all();
    let profilu = 0;
    if (kProfilu.length) {
      try {
        const c = await volej("/channels?" + kProfilu.map((r) => "slug=" + encodeURIComponent(r.login)).join("&"));
        const upd = db.prepare("UPDATE streameri SET popis = ?, banner = ?, profil_cas = ? WHERE platforma = 'kick' AND login = ?");
        const p = (c.data || []).map((ch) => upd.bind(String(ch.channel_description || "").slice(0, 1000), https(ch.banner_picture), ted, String(ch.slug || "").toLowerCase()));
        // I u kanálů, které API nevrátilo, posuneme čas, ať se nezkoušejí pořád dokola.
        p.push(db.prepare(`UPDATE streameri SET profil_cas = ? WHERE platforma = 'kick' AND id IN (${kProfilu.map(() => "?").join(",")}) AND profil_cas < ?`)
          .bind(ted, ...kProfilu.map((r) => r.id), ted - 86400e3));
        await db.batch(p);
        profilu = (c.data || []).length;
      } catch (e) { console.warn("kick profily:", e); }
    }
    await ulozStav({ ok: true, zivych: streamy.length, profilu });
  } catch (e) {
    console.error("kick:", e);
    await ulozStav({ ok: false, chyba: String(e.message || e).slice(0, 200) });
  }
}
