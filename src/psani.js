// Automatické psaní článků: výběr tématu → podklady → AI článek → kontrola → uložení.
import { ZDROJE } from "./zdroje.js";
import { zeptejSe } from "./ai.js";
import { zajistiSchema } from "./sber.js";
import { oznamClanek } from "./discord.js";

const UA = "HerniPulsBot/0.1 (+https://github.com/HrajemeSpolu11-star/Web)";
const ZDROJ = Object.fromEntries(ZDROJE.map((z) => [z.id, z]));
const OFICIALNI = new Set(["psblog", "xboxwire"]);
export const PLATFORMY = ["PC", "PS5", "Xbox", "Switch"];
export const TYPY = ["Zpráva", "Oznámení", "Recenze", "Trailer", "Sleva", "Aktualizace"];
const MAX_ZA_DEN_TVRDY = 10; // pojistka i pro ruční spuštění

const STOP = new Set(("this that with from have will your their about what when after over into more just than they them been were also could would game games "
  + "jako které který která jsou bude byla tento tato toto nové nový nová").split(" "));

export function denPraha(ms = Date.now()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
export function hodinaPraha(ms = Date.now()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", hourCycle: "h23" }).format(new Date(ms)));
}
export function noveId() {
  return "p" + [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 15);
}

function slova(t) {
  return new Set(String(t).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)));
}
function podobnost(a, b) {
  if (!a.size || !b.size) return 0;
  let s = 0;
  for (const w of b) if (a.has(w)) s++;
  return s / Math.min(a.size, b.size);
}

// Seskupí zprávy o stejné události a vybere nejdůležitější téma.
export function vyberTema(clanky, ted = Date.now()) {
  const skupiny = [];
  for (const c of clanky) {
    const s = slova(c.nadpis);
    const sk = skupiny.find((g) => podobnost(g.jadro, s) >= 0.5);
    if (sk) sk.polozky.push(c);
    else skupiny.push({ jadro: s, polozky: [c] });
  }
  for (const g of skupiny) {
    const zdroje = new Set(g.polozky.map((p) => p.zdroj_id));
    const nejnovejsi = Math.max(...g.polozky.map((p) => p.datum));
    g.skore = zdroje.size * 3 + ([...zdroje].some((z) => OFICIALNI.has(z)) ? 2 : 0) - (ted - nejnovejsi) / 3600e3 * 0.3;
  }
  skupiny.sort((a, b) => b.skore - a.skore);
  return skupiny[0] || null;
}

// Stáhne text článku ze zdroje (jen odstavce, max ~6000 znaků).
// Stahujeme jen https stránky z domény webu, ze kterého RSS pochází (i u přesměrování, max. 3 kroky).
// Podvržená adresa v RSS tak nemůže Worker poslat jinam.
const domena = (host) => host.toLowerCase().split(".").slice(-2).join(".");
function povolenaAdresa(url, zdrojId) {
  try {
    const u = new URL(url), z = ZDROJ[zdrojId];
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443") || !z) return false;
    return domena(u.hostname) === domena(new URL(z.url).hostname);
  } catch { return false; }
}
async function textStranky(url, zdrojId) {
  try {
    let r, adresa = url;
    for (let krok = 0; krok < 4; krok++) {
      if (!povolenaAdresa(adresa, zdrojId)) return "";
      r = await fetch(adresa, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(10000) });
      if (r.status < 300 || r.status >= 400) break;
      adresa = new URL(r.headers.get("location") || "", adresa).href;
      r = null;
    }
    if (!r || !r.ok || !(r.headers.get("content-type") || "").includes("html")) return "";
    let vClanku = "", vsude = "";
    const rw = new HTMLRewriter()
      .on("article p", { text(t) { if (vClanku.length < 6000) vClanku += t.text + (t.lastInTextNode ? "\n" : ""); } })
      .on("p", { text(t) { if (vsude.length < 6000) vsude += t.text + (t.lastInTextNode ? "\n" : ""); } });
    await rw.transform(r).arrayBuffer();
    const text = (vClanku.trim().length > 300 ? vClanku : vsude);
    return text.replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim().slice(0, 6000);
  } catch { return ""; }
}

const SYSTEM_PSANI = `Jsi redaktor českého herního webu Herní puls. Píšeš krátké, věcné a čtivé zprávy pro české hráče.
Pravidla:
1. Používej POUZE fakta z dodaných podkladů. Nic si nedomýšlej: žádná data, ceny, jména, čísla ani citace, které v podkladech nejsou.
2. Piš vlastními slovy. Nepřekládej věty doslova a nekopíruj formulace ze zdrojů.
3. Piš spisovně česky. Názvy her, firem a studií ponech v originále.
4. Struktura: nadpis (max. 90 znaků, bez clickbaitu), perex (1–2 věty), 3–5 krátkých odstavců.
   Poslední odstavec může vysvětlit, co zpráva znamená pro hráče, ale jen na základě podkladů.
5. Odpověz POUZE platným JSON objektem v tomto tvaru:
{"nadpis":"...","perex":"...","odstavce":["...","..."],"platformy":["PC","PS5","Xbox","Switch"],"typ":"Zpráva"}
Do "platformy" dej jen platformy zmíněné v podkladech. "typ" je jedno z: ${TYPY.join(", ")}.`;

const SYSTEM_KONTROLA = `Jsi přísný ověřovatel faktů. Porovnáš článek s podklady.
Najdi každé tvrzení v článku, které NENÍ podložené podklady (čísla, data, ceny, jména, citace, platformy, události).
Odpověz POUZE JSON: {"v_poradku": true nebo false, "problemy": ["popis problému", "..."]}`;

function shingly(text, n = 8) {
  const w = String(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const s = new Set();
  for (let i = 0; i + n <= w.length; i++) s.add(w.slice(i, i + n).join(" "));
  return s;
}

// Kontroly bez AI: délky, čeština, opisování.
export function kontrolaTextu(cl, podklady) {
  const problemy = [];
  const text = (cl.odstavce || []).join("\n");
  if (!cl.nadpis || cl.nadpis.length < 15 || cl.nadpis.length > 120) problemy.push("nadpis má špatnou délku");
  if (!cl.perex || cl.perex.length < 40 || cl.perex.length > 400) problemy.push("perex má špatnou délku");
  if (!Array.isArray(cl.odstavce) || cl.odstavce.length < 2 || cl.odstavce.length > 7) problemy.push("špatný počet odstavců");
  if (text.length < 400 || text.length > 6000) problemy.push("text má špatnou délku");
  const vse = `${cl.nadpis} ${cl.perex} ${text}`;
  const pismena = (vse.match(/\p{L}/gu) || []).length;
  const diakritika = (vse.match(/[áčďéěíňóřšťúůýž]/gi) || []).length;
  if (pismena && diakritika / pismena < 0.03) problemy.push("text nevypadá česky");
  const zdroj = shingly(podklady);
  for (const s of shingly(vse)) if (zdroj.has(s)) { problemy.push("část textu je opsaná ze zdroje"); break; }
  return problemy;
}

function vycisti(cl) {
  const t = (s, max) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);
  return {
    nadpis: t(cl.nadpis, 120),
    perex: t(cl.perex, 400),
    odstavce: (Array.isArray(cl.odstavce) ? cl.odstavce : []).map((o) => t(o, 1500)).filter(Boolean).slice(0, 7),
    platformy: (Array.isArray(cl.platformy) ? cl.platformy : []).filter((p) => PLATFORMY.includes(p)),
    typ: TYPY.includes(cl.typ) ? cl.typ : "Zpráva",
  };
}

// Hlavní funkce. vynutit = spuštěno ručně z adminu (ignoruje rozvrh hodin).
export async function napisClanek(env, { vynutit = false } = {}) {
  const db = env.DB;
  const ted = Date.now();
  await zajistiSchema(db);

  const limit = Math.min(parseInt(env.CLANKU_DENNE || "5", 10) || 5, MAX_ZA_DEN_TVRDY);
  const hodiny = String(env.HODINY || "8,11,14,17,20").split(",").map((h) => parseInt(h, 10));
  if (!vynutit && !hodiny.includes(hodinaPraha(ted))) return { stav: "mimo rozvrh" };

  // Zámek: plánované a ruční psaní nesmí běžet zároveň (stejné téma dvakrát, překročený limit).
  await db.prepare("CREATE TABLE IF NOT EXISTS nastaveni (klic TEXT PRIMARY KEY, hodnota TEXT, plati_do INTEGER)").run();
  const zamek = await db.prepare(`INSERT INTO nastaveni (klic, hodnota, plati_do) VALUES ('psani_zamek', '', ?)
    ON CONFLICT(klic) DO UPDATE SET plati_do = excluded.plati_do WHERE nastaveni.plati_do < ?`).bind(ted + 5 * 60e3, ted).run();
  if (!zamek.meta?.changes) return { stav: "psaní už běží" };
  try { return await napisClanekBezZamku(env, db, ted, limit, vynutit); }
  finally { await db.prepare("UPDATE nastaveni SET plati_do = 0 WHERE klic = 'psani_zamek'").run(); }
}

async function napisClanekBezZamku(env, db, ted, limit, vynutit) {
  const den = denPraha(ted);
  const dnes = await db.prepare("SELECT COUNT(*) AS n FROM prispevky WHERE autor = 'ai' AND den = ?").bind(den).first();
  if ((dnes?.n || 0) >= (vynutit ? MAX_ZA_DEN_TVRDY : limit)) return { stav: "denní limit splněn" };
  if (!vynutit) {
    const nedavno = await db.prepare("SELECT COUNT(*) AS n FROM prispevky WHERE autor = 'ai' AND vytvoreno > ?").bind(ted - 50 * 60e3).first();
    if (nedavno?.n) return { stav: "v této hodině už napsáno" };
  }

  // Čerstvé zprávy (posledních 12 h), ze kterých ještě článek nevznikl.
  const { results } = await db.prepare(
    `SELECT * FROM clanky WHERE datum > ? AND id NOT IN (SELECT clanek_id FROM pouzite) ORDER BY datum DESC LIMIT 80`
  ).bind(ted - 12 * 3600e3).all();
  const tema = vyberTema(results, ted);
  if (!tema) return { stav: "žádné nové téma" };

  const polozky = tema.polozky.slice(0, 4);
  const texty = await Promise.all(polozky.slice(0, 2).map((p) => textStranky(p.url, p.zdroj_id)));
  const podklady = polozky.map((p, i) =>
    `[Zdroj ${i + 1}: ${ZDROJ[p.zdroj_id]?.nazev || p.zdroj_id}]\nNadpis: ${p.nadpis}\nShrnutí: ${p.perex || ""}` +
    (texty[i] ? `\nText článku:\n${texty[i]}` : "")).join("\n\n");

  const { data, model } = await zeptejSe(env, [
    { role: "system", content: SYSTEM_PSANI },
    { role: "user", content: `Podklady:\n\n${podklady}\n\nNapiš článek.` },
  ]);
  const cl = vycisti(data);

  const problemy = kontrolaTextu(cl, podklady);
  try {
    const { data: k } = await zeptejSe(env, [
      { role: "system", content: SYSTEM_KONTROLA },
      { role: "user", content: `Podklady:\n\n${podklady}\n\nČlánek:\n${cl.nadpis}\n${cl.perex}\n${cl.odstavce.join("\n")}` },
    ]);
    if (k.v_poradku !== true) problemy.push(...(Array.isArray(k.problemy) && k.problemy.length ? k.problemy.map((p) => "fakta: " + String(p).slice(0, 200)) : ["kontrola faktů neprošla"]));
  } catch (e) {
    problemy.push("kontrolu faktů se nepodařilo provést");
  }

  const zverejnit = env.PUBLIKOVAT === "auto" && problemy.length === 0;
  const id = noveId();
  const zdroje = polozky.map((p) => ({ nazev: ZDROJ[p.zdroj_id]?.nazev || p.zdroj_id, url: p.url }));
  await db.batch([
    db.prepare(`INSERT INTO prispevky (id,nadpis,perex,text,platformy,typ,obrazek,zdroje,stav,autor,model,poznamka,den,vytvoreno,upraveno,publikovano)
                VALUES (?,?,?,?,?,?,NULL,?,?, 'ai', ?, ?, ?, ?, ?, ?)`)
      .bind(id, cl.nadpis, cl.perex, cl.odstavce.join("\n\n"), JSON.stringify(cl.platformy), cl.typ,
        JSON.stringify(zdroje), zverejnit ? "publikovano" : "koncept", model, problemy.join("\n") || null,
        den, ted, ted, zverejnit ? ted : null),
    ...tema.polozky.map((p) => db.prepare("INSERT OR IGNORE INTO pouzite (clanek_id, prispevek_id, cas) VALUES (?,?,?)").bind(p.id, id, ted)),
  ]);
  if (zverejnit) await oznamClanek(env, { id, nadpis: cl.nadpis, perex: cl.perex });
  return { stav: zverejnit ? "zveřejněno" : "uloženo ke schválení", id, nadpis: cl.nadpis, problemy };
}
