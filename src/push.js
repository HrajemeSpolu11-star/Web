// Upozornění „je živě“ přes Web Push – bez účtů a bez osobních údajů.
// Push se posílá BEZ obsahu (nic se nešifruje); service worker si zprávu vyzvedne z /api/push/zpravy.
// VAPID klíče si Worker vygeneruje sám při prvním použití a uloží do D1 (tabulka nastaveni).
import { zajistiSchemaHlidac, hlidat, nehlidat } from "./hlidac.js";

const POVOLENE_SLUZBY = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/,
  /^web\.push\.apple\.com$/, /\.push\.apple\.com$/, /^android\.googleapis\.com$/];
const KLIC_OBLIBENEHO = /^(twitch|kick):[a-z0-9_-]{1,30}$/;
const MAX_OBLIBENYCH = 100;

export const SCHEMA_PUSH = [
  `CREATE TABLE IF NOT EXISTS push_odbery (id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, oblibeni TEXT, vytvoreno INTEGER, upraveno INTEGER)`,
  `CREATE TABLE IF NOT EXISTS push_zpravy (id INTEGER PRIMARY KEY AUTOINCREMENT, odber_id TEXT NOT NULL, titulek TEXT, text TEXT, url TEXT,
     cas INTEGER, odeslano INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_push_zpravy ON push_zpravy(odber_id)`,
];
let schemaHotova = false;
export async function zajistiSchemaPush(db) {
  if (schemaHotova) return;
  await db.batch(SCHEMA_PUSH.map((s) => db.prepare(s)));
  schemaHotova = true;
}

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uText = (t) => b64u(new TextEncoder().encode(t));

async function otisk(s) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function platnyEndpoint(u) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && POVOLENE_SLUZBY.some((re) => re.test(x.hostname)) && u.length < 1000;
  } catch { return false; }
}

// VAPID klíče: veřejný (raw, base64url) pro prohlížeč, soukromý (JWK) jen v D1.
export async function vapidKlice(env) {
  const db = env.DB;
  await zajistiSchemaPush(db);
  const r = await db.prepare("SELECT hodnota FROM nastaveni WHERE klic = 'vapid'").first();
  if (r) return JSON.parse(r.hodnota);
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const klice = {
    verejny: b64u(await crypto.subtle.exportKey("raw", par.publicKey)),
    soukromy: await crypto.subtle.exportKey("jwk", par.privateKey),
  };
  // INSERT OR IGNORE: pokud je souběžně vytvořil jiný požadavek, použijeme ty uložené.
  await db.prepare("INSERT OR IGNORE INTO nastaveni (klic, hodnota, plati_do) VALUES ('vapid', ?, NULL)").bind(JSON.stringify(klice)).run();
  const ulozene = await db.prepare("SELECT hodnota FROM nastaveni WHERE klic = 'vapid'").first();
  return JSON.parse(ulozene.hodnota);
}

async function vapidHlavicka(env, endpoint) {
  const k = await vapidKlice(env);
  const aud = new URL(endpoint).origin;
  const sub = /^https:\/\//.test(env.SITE_URL || "") ? env.SITE_URL : "mailto:noreply@example.com";
  const nepodepsane = `${b64uText(JSON.stringify({ typ: "JWT", alg: "ES256" }))}.${b64uText(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub }))}`;
  const klic = await crypto.subtle.importKey("jwk", k.soukromy, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const podpis = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, klic, new TextEncoder().encode(nepodepsane));
  return `vapid t=${nepodepsane}.${b64u(podpis)}, k=${k.verejny}`;
}

// Odešle prázdný push. Vrací false, pokud odběr už neplatí (má se smazat).
// Výsledek: "ok" = doručeno push službě, "neplatny" = odběr zanikl (404/410/403) → smazat,
// "znovu" = dočasná chyba (síť, 429, 5xx…) → zpráva zůstane ve frontě a zkusí se v dalším běhu (max. 2 dny).
async function posliPush(env, endpoint) {
  let r;
  try {
    r = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: await vapidHlavicka(env, endpoint), TTL: "3600", Urgency: "normal", "Content-Length": "0" },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) { console.warn("push síť:", e); return "znovu"; }
  if (r.ok) return "ok";
  if (r.status === 404 || r.status === 410 || r.status === 403) return "neplatny";
  console.warn("push HTTP", r.status);
  return "znovu";
}

// Zavolá sběr po zjištění, kdo právě začal vysílat. noveZive = [{ klic: "twitch:login", jmeno, hra }]
export async function zaradUpozorneni(env, noveZive) {
  if (!noveZive.length) return;
  const db = env.DB;
  await zajistiSchemaPush(db);
  const { results } = await db.prepare("SELECT id, oblibeni FROM push_odbery").all();
  if (!results.length) return;
  const web = String(env.SITE_URL || "").replace(/\/+$/, "");
  const vloz = db.prepare("INSERT INTO push_zpravy (odber_id, titulek, text, url, cas) VALUES (?, ?, ?, ?, ?)");
  const prikazy = [];
  const ted = Date.now();
  for (const o of results) {
    let obl = [];
    try { obl = JSON.parse(o.oblibeni || "[]"); } catch {}
    const mnozina = new Set(obl);
    for (const n of noveZive) {
      if (!mnozina.has(n.klic)) continue;
      const [plat, login] = n.klic.split(":");
      prikazy.push(vloz.bind(o.id, `${n.jmeno} je živě`, n.hra ? `Právě hraje ${n.hra}` : "Právě začal vysílat", `${web}/streamer/${plat}/${encodeURIComponent(login)}`, ted));
    }
  }
  if (prikazy.length) await db.batch(prikazy);
}

// Pošle push odběratelům, kteří mají neodeslané zprávy (max. `max` požadavků kvůli limitům).
export async function odesliFrontu(env, max = 10) {
  const db = env.DB;
  await zajistiSchemaPush(db);
  // Nejstarší čekající zprávy první, ať odběr s opakovanou chybou neblokuje ostatní.
  const { results } = await db.prepare(`SELECT o.id, o.endpoint, MIN(z.id) AS prvni, MAX(z.id) AS posledni FROM push_zpravy z JOIN push_odbery o ON o.id = z.odber_id
    WHERE z.odeslano = 0 GROUP BY o.id ORDER BY prvni LIMIT ?`).bind(max).all();
  for (const o of results) {
    let vysledek;
    try { vysledek = await posliPush(env, o.endpoint); } catch (e) { console.warn("push:", e); vysledek = "znovu"; }
    // Označíme jen zprávy, které existovaly před odesláním – nové počkají na další oznámení.
    if (vysledek === "ok") await db.prepare("UPDATE push_zpravy SET odeslano = 1 WHERE odber_id = ? AND odeslano = 0 AND id <= ?").bind(o.id, o.posledni).run();
    else if (vysledek === "neplatny") {
      await zajistiSchemaHlidac(db);
      await db.batch([db.prepare("DELETE FROM push_odbery WHERE id = ?").bind(o.id), db.prepare("DELETE FROM push_zpravy WHERE odber_id = ?").bind(o.id),
        db.prepare("DELETE FROM hlidani WHERE odber_id = ?").bind(o.id)]);
    }
  }
  // Úklid: staré zprávy (přes 2 dny) smazat.
  await db.prepare("DELETE FROM push_zpravy WHERE cas < ?").bind(Date.now() - 2 * 86400e3).run();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

// /api/push/klic (GET), /api/push/odber, /zrusit, /zpravy, /hlidat, /nehlidat (POST)
export async function pushApi(request, env) {
  const url = new URL(request.url);
  const cesta = url.pathname.slice(9);
  const db = env.DB;
  await zajistiSchemaPush(db);
  if (cesta === "/klic" && request.method === "GET") return json({ klic: (await vapidKlice(env)).verejny });
  if (request.method !== "POST") return json({ chyba: "Metoda není povolena" }, 405);
  if (request.headers.get("Origin") && request.headers.get("Origin") !== url.origin) return json({ chyba: "Zakázáno" }, 403);
  let b;
  try { b = await request.json(); } catch { return json({ chyba: "Neplatná data" }, 400); }
  const endpoint = String(b?.endpoint || "");
  if (!platnyEndpoint(endpoint)) return json({ chyba: "Neplatný odběr" }, 400);
  const id = await otisk(endpoint);

  if (cesta === "/odber") {
    const obl = (Array.isArray(b.oblibeni) ? b.oblibeni : []).map(String).filter((k) => KLIC_OBLIBENEHO.test(k)).slice(0, MAX_OBLIBENYCH);
    const ted = Date.now();
    await db.prepare(`INSERT INTO push_odbery (id, endpoint, oblibeni, vytvoreno, upraveno) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET oblibeni = excluded.oblibeni, upraveno = excluded.upraveno`).bind(id, endpoint, JSON.stringify(obl), ted, ted).run();
    return json({ ok: true, oblibenych: obl.length });
  }
  if (cesta === "/zrusit") {
    await zajistiSchemaHlidac(db);
    await db.batch([db.prepare("DELETE FROM push_odbery WHERE id = ?").bind(id), db.prepare("DELETE FROM push_zpravy WHERE odber_id = ?").bind(id),
      db.prepare("DELETE FROM hlidani WHERE odber_id = ?").bind(id)]);
    return json({ ok: true });
  }
  if (cesta === "/hlidat" || cesta === "/nehlidat") {
    // Odběr musí existovat (vznikne při zapnutí upozornění); hlídání bez něj nemá kam poslat zprávu.
    const ted = Date.now();
    await db.prepare(`INSERT INTO push_odbery (id, endpoint, oblibeni, vytvoreno, upraveno) VALUES (?, ?, '[]', ?, ?)
      ON CONFLICT(id) DO NOTHING`).bind(id, endpoint, ted, ted).run();
    const v = cesta === "/hlidat" ? await hlidat(db, id, b) : await nehlidat(db, id, b);
    return json(v.chyba ? { chyba: v.chyba } : v, v.status || 200);
  }
  if (cesta === "/zpravy") {
    const { results } = await db.prepare("SELECT id, titulek, text, url FROM push_zpravy WHERE odber_id = ? ORDER BY id DESC LIMIT 5").bind(id).all();
    if (results.length) await db.prepare("DELETE FROM push_zpravy WHERE odber_id = ?").bind(id).run();
    return json(results);
  }
  return json({ chyba: "Nenalezeno" }, 404);
}
