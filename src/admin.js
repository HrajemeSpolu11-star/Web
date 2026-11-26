// API administrace – volá se jen po úspěšném ověření přes Cloudflare Access.
import { napisClanek, PLATFORMY, TYPY, noveId, denPraha } from "./psani.js";
import { zajistiSchema } from "./sber.js";

const STAVY = new Set(["koncept", "publikovano", "zamitnuto"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

const https = (u) => { try { const x = new URL(u); return x.protocol === "https:" ? x.href : ""; } catch { return ""; } };
const txt = (s, max) => String(s ?? "").replace(/\r/g, "").trim().slice(0, max);

// Ověří a vyčistí data z editoru. Vrací { data } nebo { chyba }.
function validuj(b) {
  const d = {
    nadpis: txt(b.nadpis, 160).replace(/\s+/g, " "),
    perex: txt(b.perex, 600).replace(/\s+/g, " "),
    text: txt(b.text, 20000),
    platformy: (Array.isArray(b.platformy) ? b.platformy : []).filter((p) => PLATFORMY.includes(p)),
    typ: TYPY.includes(b.typ) ? b.typ : "Zpráva",
    obrazek: b.obrazek ? https(b.obrazek) : "",
    zdroje: (Array.isArray(b.zdroje) ? b.zdroje : []).slice(0, 8)
      .map((z) => ({ nazev: txt(z?.nazev, 80), url: https(z?.url) })).filter((z) => z.nazev && z.url),
  };
  if (d.nadpis.length < 5) return { chyba: "Nadpis je příliš krátký." };
  if (b.obrazek && !d.obrazek) return { chyba: "Obrázek musí být odkaz začínající https://" };
  return { data: d };
}

function naAdminPolozku(r) {
  const parse = (s, z) => { try { return JSON.parse(s || ""); } catch { return z; } };
  return {
    id: r.id, nadpis: r.nadpis, perex: r.perex || "", text: r.text || "", typ: r.typ, obrazek: r.obrazek || "",
    platformy: parse(r.platformy, []), zdroje: parse(r.zdroje, []), stav: r.stav, autor: r.autor, model: r.model,
    poznamka: r.poznamka || "", vytvoreno: r.vytvoreno, publikovano: r.publikovano,
  };
}

export async function adminApi(request, env, ctx, uzivatel) {
  const url = new URL(request.url);
  const cesta = url.pathname.replace(/^\/api\/admin/, "");
  const db = env.DB;

  if (request.method === "POST") {
    // Ochrana proti CSRF: požadavek musí přijít z této domény a nést vlastní hlavičku.
    const origin = request.headers.get("Origin");
    if (origin !== url.origin || request.headers.get("X-Admin") !== "1") return json({ chyba: "Zakázáno" }, 403);
  } else if (request.method !== "GET") return json({ chyba: "Metoda není povolena" }, 405);

  await zajistiSchema(db);

  if (request.method === "GET" && cesta === "/ja") return json({ email: uzivatel.email, publikovat: env.PUBLIKOVAT || "auto", groq: !!env.GROQ_API_KEY });

  if (request.method === "GET" && cesta === "/prispevky") {
    const stav = STAVY.has(url.searchParams.get("stav")) ? url.searchParams.get("stav") : "koncept";
    const { results } = await db.prepare(
      `SELECT * FROM prispevky WHERE stav = ? ORDER BY COALESCE(publikovano, vytvoreno) DESC LIMIT 100`).bind(stav).all();
    return json(results.map(naAdminPolozku));
  }

  const m = cesta.match(/^\/prispevek\/(p[0-9a-f]{15})(\/stav)?$/);
  if (request.method === "GET" && m && !m[2]) {
    const r = await db.prepare("SELECT * FROM prispevky WHERE id = ?").bind(m[1]).first();
    return r ? json(naAdminPolozku(r)) : json({ chyba: "Nenalezeno" }, 404);
  }

  if (request.method === "POST") {
    let b;
    try { b = await request.json(); } catch { return json({ chyba: "Neplatná data" }, 400); }
    const ted = Date.now();

    // Uložení / vytvoření článku z editoru.
    if (cesta === "/prispevek" || (m && !m[2])) {
      const { data: d, chyba } = validuj(b);
      if (chyba) return json({ chyba }, 400);
      const stav = b.stav === "publikovano" ? "publikovano" : "koncept";
      if (m) {
        const puvodni = await db.prepare("SELECT stav, publikovano FROM prispevky WHERE id = ?").bind(m[1]).first();
        if (!puvodni) return json({ chyba: "Nenalezeno" }, 404);
        const pub = stav === "publikovano" ? (puvodni.publikovano || ted) : null;
        await db.prepare(`UPDATE prispevky SET nadpis=?, perex=?, text=?, platformy=?, typ=?, obrazek=?, zdroje=?, stav=?, upraveno=?, publikovano=?, poznamka=NULL WHERE id=?`)
          .bind(d.nadpis, d.perex, d.text, JSON.stringify(d.platformy), d.typ, d.obrazek || null, JSON.stringify(d.zdroje), stav, ted, pub, m[1]).run();
        return json({ ok: true, id: m[1], stav });
      }
      const id = noveId();
      await db.prepare(`INSERT INTO prispevky (id,nadpis,perex,text,platformy,typ,obrazek,zdroje,stav,autor,model,poznamka,den,vytvoreno,upraveno,publikovano)
                        VALUES (?,?,?,?,?,?,?,?,?, 'rucne', NULL, NULL, ?, ?, ?, ?)`)
        .bind(id, d.nadpis, d.perex, d.text, JSON.stringify(d.platformy), d.typ, d.obrazek || null, JSON.stringify(d.zdroje),
          stav, denPraha(ted), ted, ted, stav === "publikovano" ? ted : null).run();
      return json({ ok: true, id, stav });
    }

    // Změna stavu (zveřejnit / stáhnout / zahodit).
    if (m && m[2]) {
      if (!STAVY.has(b.stav)) return json({ chyba: "Neplatný stav" }, 400);
      await db.prepare(`UPDATE prispevky SET stav = ?, upraveno = ?, publikovano = CASE WHEN ? = 'publikovano' THEN COALESCE(publikovano, ?) ELSE NULL END WHERE id = ?`)
        .bind(b.stav, ted, b.stav, ted, m[1]).run();
      return json({ ok: true });
    }

    // Napsat článek pomocí AI hned teď.
    if (cesta === "/napis-ted") {
      try { return json(await napisClanek(env, { vynutit: true })); }
      catch (e) { return json({ chyba: String(e.message || e).slice(0, 300) }, 502); }
    }
  }
  return json({ chyba: "Nenalezeno" }, 404);
}
