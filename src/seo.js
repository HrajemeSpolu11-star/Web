// SEO: skutečné adresy stránek s meta tagy z databáze, sitemap.xml a robots.txt.
const NAZEV = "Herní puls";
const POPIS = "Herní novinky a přehled českých streamerů z Twitche a Kicku – kdo je právě živě, žebříčky a profily.";
const PLATFORMA = { twitch: "Twitch", kick: "Kick" };

const escXml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const zkrat = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trim() + "…" : s; };

// Je cesta stránkou webu (SPA), kterou má Worker vykreslit s meta tagy?
export function jeStranka(pathname) {
  return pathname === "/" || /^\/(novinky|zive|streameri|hry|prehled|porovnat|report)\/?$/.test(pathname) || /^\/report\/(\d{4}-W\d{2}|aktualni)\/?$/.test(pathname) ||
    /^\/(clanek|hra)\/[^/]+\/?$/.test(pathname) || /^\/streamer\/(twitch|kick)\/[^/]+\/?$/.test(pathname);
}

async function metaProStranku(url, env) {
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const db = env.DB;
  let m = { title: `${NAZEV} – herní novinky a čeští streameři`, popis: POPIS, obrazek: "", index: true, status: 200, typ: "website" };
  try {
    if (p === "/") m = { ...m, title: `${NAZEV} – hry zdarma, slevy, žebříčky a herní novinky`, popis: "Hry zdarma na Epicu a Steamu, největší slevy na Steamu a GOGu, nejhranější hry, novinky v obchodech a herní zprávy – na jednom místě a česky." };
    else if (p === "/novinky") m = { ...m, title: `Herní novinky z Česka i ze světa | ${NAZEV}`, popis: "Nejčerstvější herní zprávy z českých i zahraničních webů na jednom místě. Obnovuje se automaticky." };
    else if (p === "/zive") m = { ...m, title: `Právě živě – čeští streameři na Twitchi a Kicku | ${NAZEV}`, popis: "Kdo z českých streamerů právě vysílá, co hraje a kolik má diváků. Aktualizováno každých 15 minut." };
    else if (p === "/streameri") m = { ...m, title: `Čeští streameři – žebříček | ${NAZEV}`, popis: "Žebříček českých streamerů z Twitche a Kicku podle sledujících, rekordu diváků, odvysílaných hodin a růstu." };
    else if (p === "/prehled") m = { ...m, title: `Přehled české streamovací scény – týden v číslech | ${NAZEV}`, popis: "Kolik Čechů je živě během dne, kdo tento týden nejvíc rostl, rekordy, milníky a kalendář plánovaných streamů." };
    else if (p === "/porovnat") m = { ...m, title: `Porovnat streamery | ${NAZEV}`, popis: "Porovnej dva české streamery vedle sebe: sledující, diváci, odvysílané hodiny a hry.", index: false };
    else if (p === "/hry") m = { ...m, title: `Co hraje Česko – nejsledovanější hry českých streamů | ${NAZEV}`, popis: "Žebříček her podle hodin sledování na českých streamech Twitch a Kick za posledních 7 dní. Co roste, co je nového a kdo co hraje." };
    else if (p.startsWith("/report")) m = { ...m, title: `Týden na české herní scéně v číslech | ${NAZEV}`, popis: "Týdenní report české streamovací scény: hodiny sledování, nejsledovanější hry, rekordy, milníky a streameři, kteří nejvíc rostli." };
    else if (p.startsWith("/streamer/")) {
      const [, , plat, login] = p.split("/");
      const r = await db.prepare("SELECT jmeno, popis, profilovka, posledni_hra FROM streameri WHERE platforma = ? AND login = ? AND skryty = 0 ORDER BY posledni_zive DESC LIMIT 1")
        .bind(plat, decodeURIComponent(login).toLowerCase()).first();
      if (!r) m = { ...m, title: `Streamer nenalezen | ${NAZEV}`, index: false, status: 404 };
      else m = { ...m, typ: "profile", obrazek: r.profilovka || "",
        title: `${r.jmeno} – ${PLATFORMA[plat]} streamer, statistiky a rozvrh | ${NAZEV}`,
        popis: zkrat(r.popis || `${r.jmeno} je český streamer na platformě ${PLATFORMA[plat]}${r.posledni_hra ? `, naposledy hrál ${r.posledni_hra}` : ""}. Sledující, rekord diváků, odvysílané hodiny a nejhranější hry.`, 160) };
    } else if (p.startsWith("/hra/")) {
      const r = await db.prepare("SELECT nazev FROM hry WHERE slug = ?").bind(decodeURIComponent(p.slice(5))).first();
      if (!r) m = { ...m, title: `Hra nenalezena | ${NAZEV}`, index: false, status: 404 };
      else m = { ...m, title: `${r.nazev} – cena, čeština, hodnocení a čeští streameři | ${NAZEV}`, popis: `${r.nazev}: cena na Steamu a GOGu, jestli má češtinu, hodnocení hráčů, kolik se hraje na českých streamech a kdo ji hraje nejvíc.` };
    } else if (p.startsWith("/clanek/")) {
      const id = decodeURIComponent(p.slice(8));
      if (/^p[0-9a-f]{15}$/.test(id)) {
        const r = await db.prepare("SELECT nadpis, perex, obrazek FROM prispevky WHERE id = ? AND stav = 'publikovano'").bind(id).first();
        m = r ? { ...m, typ: "article", title: `${r.nadpis} | ${NAZEV}`, popis: zkrat(r.perex, 160), obrazek: r.obrazek || "" }
              : { ...m, title: `Článek nenalezen | ${NAZEV}`, index: false, status: 404 };
      } else {
        // Převzaté zprávy z RSS: patří autorům, proto je Google nemá indexovat u nás.
        const r = /^[0-9a-f]{24}$/.test(id) ? await db.prepare("SELECT nadpis, perex FROM clanky WHERE id = ?").bind(id).first() : null;
        m = r ? { ...m, title: `${r.nadpis} | ${NAZEV}`, popis: zkrat(r.perex, 160), index: false }
              : { ...m, title: `Článek nenalezen | ${NAZEV}`, index: false, status: 404 };
      }
    }
  } catch (e) { console.warn("seo meta:", e); }
  return m;
}

// Vrátí index.html s meta tagy pro danou stránku.
export async function vykresliStranku(request, env) {
  const url = new URL(request.url);
  const [m, html] = await Promise.all([metaProStranku(url, env), env.ASSETS.fetch(new Request(new URL("/", url)))]);
  const canonical = url.origin + (url.pathname.replace(/\/+$/, "") || "/");
  const head = [
    `<link rel="canonical" href="${escXml(canonical)}">`,
    `<meta property="og:site_name" content="${escXml(NAZEV)}">`,
    `<meta property="og:type" content="${escXml(m.typ)}">`,
    `<meta property="og:title" content="${escXml(m.title)}">`,
    `<meta property="og:description" content="${escXml(m.popis)}">`,
    `<meta property="og:url" content="${escXml(canonical)}">`,
    `<meta property="og:locale" content="cs_CZ">`,
    m.obrazek && /^https:\/\//.test(m.obrazek) ? `<meta property="og:image" content="${escXml(m.obrazek)}">` : "",
    `<meta name="twitter:card" content="summary">`,
    m.index ? "" : `<meta name="robots" content="noindex, follow">`,
  ].join("");
  const out = new HTMLRewriter()
    .on("title", { element(e) { e.setInnerContent(m.title); } })
    .on('meta[name="description"]', { element(e) { e.setAttribute("content", m.popis); } })
    .on("head", { element(e) { e.append(head, { html: true }); } })
    .transform(html);
  const h = new Headers(out.headers);
  h.set("Content-Type", "text/html; charset=utf-8");
  h.set("Cache-Control", "public, max-age=60");
  return new Response(out.body, { status: m.status, headers: h });
}

export async function sitemap(request, env) {
  const o = new URL(request.url).origin;
  const ted = new Date().toISOString().slice(0, 10);
  const adresy = [["/", ted, "hourly"], ["/novinky", ted, "hourly"], ["/zive", ted, "always"], ["/streameri", ted, "daily"], ["/hry", ted, "daily"], ["/report", ted, "weekly"], ["/prehled", ted, "daily"], ["/o-webu", ted, "monthly"]];
  try {
    const [st, hry, cl] = await env.DB.batch([
      env.DB.prepare("SELECT platforma, login, posledni_zive FROM streameri WHERE skryty = 0 ORDER BY posledni_zive DESC LIMIT 5000"),
      env.DB.prepare("SELECT slug, posledni FROM hry ORDER BY posledni DESC LIMIT 2000"),
      env.DB.prepare("SELECT id, COALESCE(upraveno, publikovano) AS t FROM prispevky WHERE stav = 'publikovano' ORDER BY publikovano DESC LIMIT 2000"),
    ]);
    const d = (ms) => ms ? new Date(ms).toISOString().slice(0, 10) : ted;
    for (const r of st.results) adresy.push([`/streamer/${r.platforma}/${encodeURIComponent(r.login)}`, d(r.posledni_zive), "daily"]);
    for (const r of hry.results) adresy.push([`/hra/${encodeURIComponent(r.slug)}`, d(r.posledni), "daily"]);
    for (const r of cl.results) adresy.push([`/clanek/${r.id}`, d(r.t), "weekly"]);
  } catch (e) { console.warn("sitemap:", e); }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    adresy.map(([u, l, f]) => `<url><loc>${escXml(o + u)}</loc><lastmod>${l}</lastmod><changefreq>${f}</changefreq></url>`).join("\n") + "\n</urlset>\n";
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

export function robots(request) {
  const o = new URL(request.url).origin;
  return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\n\nSitemap: ${o}/sitemap.xml\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
