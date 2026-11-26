// Náhled webu (jako když vložíš odkaz do Discordu): obrázek pro sdílení (og:image), ikona webu, titulek a krátký popis.
// Bere se jen z hlavičky oficiální stránky – čte se po kouscích a skončí na </head> (šetří CPU i data).
// Ukládá se do obsah_stav pod klíčem „web:<adresa>“ a obnovuje jednou za 7 dní.

const PLATNOST = 7 * 86400e3;
const https = (u) => /^https:\/\//.test(String(u || "")) ? String(u) : "";
const dekoduj = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/\s+/g, " ").trim();

function atribut(tag, jmeno) {
  const m = new RegExp(`${jmeno}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? (m[2] ?? m[3] ?? "") : "";
}

export async function nahledWebu(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; HerniPulsBot/0.1; +https://github.com/HrajemeSpolu11-star/Web)", Accept: "text/html", "Accept-Language": "cs,en;q=0.8" },
    redirect: "follow", signal: AbortSignal.timeout(10000),
  });
  if (!r.ok || !/html/i.test(r.headers.get("content-type") || "")) throw new Error(`HTTP ${r.status}`);
  const cteni = r.body.getReader(), dekoder = new TextDecoder();
  let html = "";
  while (html.length < 400_000) {
    const { value, done } = await cteni.read();
    if (done) break;
    html += dekoder.decode(value, { stream: true });
    if (/<\/head>/i.test(html)) break;
  }
  await cteni.cancel().catch(() => {});
  const hlava = html.split(/<\/head>/i)[0];
  const meta = {};
  for (const t of hlava.match(/<meta\b[^>]*>/gi) || []) {
    const k = (atribut(t, "property") || atribut(t, "name")).toLowerCase();
    if (k && !(k in meta)) meta[k] = atribut(t, "content");
  }
  const zakl = r.url || url;
  const abs = (u) => { try { return https(new URL(dekoduj(u), zakl).href); } catch { return ""; } };
  // Ikona: apple-touch-icon (bývá velká), jinak největší „icon“.
  let ikona = "", nejvetsi = 0;
  for (const t of hlava.match(/<link\b[^>]*>/gi) || []) {
    const rel = atribut(t, "rel").toLowerCase();
    if (!/icon/.test(rel)) continue;
    const vel = Math.max(0, ...String(atribut(t, "sizes")).split(/\s+/).map((x) => parseInt(x, 10) || 0)) + (/apple-touch/.test(rel) ? 180 : 0);
    const h = abs(atribut(t, "href"));
    if (h && !/\.ico(\?|$)/i.test(h) && vel >= nejvetsi) { ikona = h; nejvetsi = vel; }
  }
  return {
    obrazek: abs(meta["og:image"] || meta["og:image:url"] || meta["twitter:image"] || meta["twitter:image:src"] || ""),
    ikona,
    titulek: dekoduj(meta["og:title"] || (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(hlava) || [])[1] || "").slice(0, 120),
    popis: dekoduj(meta["og:description"] || meta.description || "").slice(0, 220),
    web: https(zakl) || url,
  };
}

async function schema(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS obsah_stav (klic TEXT PRIMARY KEY, data TEXT, zdroj TEXT, cas INTEGER NOT NULL)").run();
}

// Obnoví nejvýš `max` náhledů, které chybí nebo jsou starší než 7 dní. Chyba = zkusí se znovu za den.
export async function obnovNahledy(db, adresy, max = 2) {
  await schema(db);
  const unikatni = [...new Set(adresy.filter(Boolean))];
  if (!unikatni.length) return 0;
  const { results } = await db.prepare(`SELECT klic, cas FROM obsah_stav WHERE klic IN (${unikatni.map(() => "?").join(",")})`).bind(...unikatni.map((u) => `web:${u}`)).all();
  const cas = new Map(results.map((r) => [r.klic.slice(4), r.cas]));
  const ted = Date.now();
  const fronta = unikatni.filter((u) => !cas.has(u) || ted - cas.get(u) > PLATNOST).sort((a, b) => (cas.get(a) || 0) - (cas.get(b) || 0)).slice(0, max);
  const vysl = await Promise.allSettled(fronta.map(nahledWebu));
  const prikazy = fronta.map((u, i) => vysl[i].status === "fulfilled"
    ? db.prepare("INSERT OR REPLACE INTO obsah_stav (klic, data, zdroj, cas) VALUES (?, ?, ?, ?)").bind(`web:${u}`, JSON.stringify(vysl[i].value), u, ted)
    : db.prepare("INSERT OR REPLACE INTO obsah_stav (klic, data, zdroj, cas) VALUES (?, COALESCE((SELECT data FROM obsah_stav WHERE klic = ?), '{}'), ?, ?)")
      .bind(`web:${u}`, `web:${u}`, u, ted - PLATNOST + 86400e3));
  if (prikazy.length) await db.batch(prikazy);
  return fronta.length;
}

export async function nactiNahledy(db, adresy) {
  await schema(db);
  const unikatni = [...new Set(adresy.filter(Boolean))];
  if (!unikatni.length) return new Map();
  const { results } = await db.prepare(`SELECT zdroj, data FROM obsah_stav WHERE klic IN (${unikatni.map(() => "?").join(",")})`).bind(...unikatni.map((u) => `web:${u}`)).all();
  const m = new Map();
  for (const r of results) { try { const d = JSON.parse(r.data || "{}"); if (d.obrazek || d.ikona || d.popis) m.set(r.zdroj, d); } catch { /* nic */ } }
  return m;
}
