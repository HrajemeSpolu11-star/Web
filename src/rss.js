// Jednoduchý a rychlý parser RSS 2.0 a Atom bez závislostí.

const ENTITY = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function dekoduj(s) {
  return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITY[e.toLowerCase()] ?? m;
  });
}

const bezCdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

function tag(blok, jmeno) {
  const m = blok.match(new RegExp(`<${jmeno}(?:\\s[^>]*)?>([\\s\\S]*?)</${jmeno}>`, "i"));
  return m ? bezCdata(m[1]).trim() : "";
}
function atribut(blok, re) {
  const m = blok.match(re);
  return m ? dekoduj(m[1]) : "";
}

export function textBezHtml(s) {
  return dekoduj(bezCdata(String(s || "")).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function zkrat(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trim() + "…";
}

// Vrátí pole { nadpis, url, perex, obrazek, datum (ms) }.
export function parsujFeed(xml, maxPolozek = 30) {
  const bloky = (xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || []).slice(0, maxPolozek);
  return bloky.map((b) => {
    const nadpis = textBezHtml(tag(b, "title"));
    let url = textBezHtml(tag(b, "link"));
    if (!/^https?:/i.test(url)) {
      url = atribut(b, /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/i) || atribut(b, /<link[^>]*href=["']([^"']+)/i);
    }
    const datumText = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
    const surovyPopis = tag(b, "description") || tag(b, "summary") || tag(b, "content:encoded") || tag(b, "content");
    const obrazek =
      atribut(b, /<media:(?:content|thumbnail)[^>]*url=["']([^"']+)/i) ||
      atribut(b, /<enclosure[^>]*url=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)/i) ||
      atribut(dekoduj(bezCdata(surovyPopis)), /<img[^>]*src=["']([^"']+)/i);
    return {
      nadpis: zkrat(nadpis, 200),
      url,
      perex: zkrat(textBezHtml(surovyPopis), 280),
      obrazek: /^https:\/\//i.test(obrazek) ? obrazek : "",
      datum: Date.parse(datumText.trim()),
    };
  });
}
