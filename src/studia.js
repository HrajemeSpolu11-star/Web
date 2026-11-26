// Herní studia a platformy: oficiální novinky, trailery a oznámení – jen z jejich vlastních zdrojů.
//  • YouTube: veřejný RSS oficiálního kanálu. Kanál se najde podle @jména a ověří podle názvu autora v RSS
//    (když nesedí, nic se neukáže – raději nic než cizí kanál).
//  • Blog: oficiální RSS (PlayStation Blog, Xbox Wire, blog SCS Software).
//  • Steam: oficiální oznámení vývojářů k jejich hrám (Steam Web API ISteamNews/GetNewsForApp).
// Sběr: v RSS Cronu (*/15) vždy 2 studia, nejdéle neobnovená první → každé studio zhruba jednou za 3 h. Max ~12 požadavků.
import { idKanalu, parsujYoutube } from "./obsah.js";
import { parsujFeed, textBezHtml } from "./rss.js";
import { obnovNahledy, nactiNahledy } from "./nahled.js";

const UA = "HerniPulsBot/0.1 (+https://github.com/HrajemeSpolu11-star/Web)";
const STUDII_NA_BEH = 2;

// typ: platforma | studio | vydavatel; cz = české studio
export const STUDIA = [
  { slug: "playstation", nazev: "PlayStation", typ: "platforma", zeme: "JP", web: "https://www.playstation.com/cs-cz/", yt: "@PlayStation", ytAutor: /^PlayStation$/i,
    rss: "https://blog.playstation.com/feed/", popis: "Herní platforma Sony – konzole PS5, PlayStation Plus, přenosy State of Play." },
  { slug: "xbox", nazev: "Xbox", typ: "platforma", zeme: "US", web: "https://www.xbox.com/cs-CZ", yt: "@Xbox", ytAutor: /^Xbox$/i,
    rss: "https://news.xbox.com/en-us/feed/", popis: "Herní platforma Microsoftu – konzole Xbox, Game Pass, Xbox Games Showcase." },
  { slug: "nintendo", nazev: "Nintendo", typ: "platforma", zeme: "JP", web: "https://www.nintendo.com/cs-cz/", yt: "@NintendoAmerica", ytAutor: /^Nintendo of America$/i,
    popis: "Japonský výrobce konzolí Nintendo Switch a her Mario, Zelda a Pokémon. Přenosy Nintendo Direct." },
  { slug: "valve", nazev: "Valve", typ: "platforma", zeme: "US", web: "https://store.steampowered.com/", steam: [[730, "Counter-Strike 2"], [570, "Dota 2"]],
    popis: "Provozovatel obchodu Steam a autor her Counter-Strike, Dota a Half-Life." },
  { slug: "blizzard", nazev: "Blizzard Entertainment", typ: "studio", zeme: "US", web: "https://news.blizzard.com/", yt: "@Blizzard", ytAutor: /^Blizzard Entertainment$/i,
    steam: [[2344520, "Diablo IV"], [2357570, "Overwatch 2"]], popis: "Autor World of Warcraft, Diablo, Overwatch a Hearthstone." },
  { slug: "rockstar", nazev: "Rockstar Games", typ: "studio", zeme: "US", web: "https://www.rockstargames.com/", yt: "@RockstarGames", ytAutor: /^Rockstar Games$/i,
    steam: [[271590, "Grand Theft Auto V"], [1174180, "Red Dead Redemption 2"]], popis: "Autor sérií Grand Theft Auto a Red Dead Redemption." },
  { slug: "cd-projekt-red", nazev: "CD PROJEKT RED", typ: "studio", zeme: "PL", web: "https://www.cdprojektred.com/", yt: "@CDPROJEKTRED", ytAutor: /^CD PROJEKT RED$/i,
    steam: [[1091500, "Cyberpunk 2077"], [292030, "Zaklínač 3"]], popis: "Polské studio – Zaklínač a Cyberpunk 2077." },
  { slug: "ubisoft", nazev: "Ubisoft", typ: "vydavatel", zeme: "FR", web: "https://news.ubisoft.com/", yt: "@Ubisoft", ytAutor: /^Ubisoft$/i,
    steam: [[359550, "Rainbow Six Siege"]], popis: "Vydavatel sérií Assassin's Creed, Far Cry a Rainbow Six." },
  { slug: "ea", nazev: "Electronic Arts", typ: "vydavatel", zeme: "US", web: "https://www.ea.com/", yt: "@EA", ytAutor: /^(EA|Electronic Arts)$/i,
    steam: [[1172470, "Apex Legends"]], popis: "Vydavatel EA SPORTS FC, Battlefield, The Sims a Apex Legends." },
  { slug: "bethesda", nazev: "Bethesda", typ: "studio", zeme: "US", web: "https://bethesda.net/", yt: "@Bethesda", ytAutor: /^Bethesda$/i,
    steam: [[377160, "Fallout 4"], [489830, "Skyrim Special Edition"]], popis: "Autor sérií The Elder Scrolls, Fallout a Starfield." },
  { slug: "riot", nazev: "Riot Games", typ: "studio", zeme: "US", web: "https://www.riotgames.com/", yt: "@RiotGames", ytAutor: /^Riot Games$/i,
    popis: "Autor League of Legends, Valorant a Teamfight Tactics." },
  { slug: "larian", nazev: "Larian Studios", typ: "studio", zeme: "BE", web: "https://larian.com/", yt: "@LarianStudios", ytAutor: /^Larian Studios$/i,
    steam: [[1086940, "Baldur's Gate 3"]], popis: "Belgické studio – Baldur's Gate 3 a Divinity." },
  { slug: "fromsoftware", nazev: "FromSoftware", typ: "studio", zeme: "JP", web: "https://www.fromsoftware.jp/ww/", steam: [[1245620, "Elden Ring"]],
    popis: "Japonské studio – Elden Ring, Dark Souls a Sekiro." },
  { slug: "capcom", nazev: "Capcom", typ: "studio", zeme: "JP", web: "https://www.capcom.com/", yt: "@capcomusa", ytAutor: /^Capcom USA$/i,
    steam: [[2050650, "Resident Evil 4"]], popis: "Autor sérií Resident Evil, Monster Hunter a Street Fighter." },
  { slug: "paradox", nazev: "Paradox Interactive", typ: "vydavatel", zeme: "SE", web: "https://www.paradoxinteractive.com/", yt: "@ParadoxInteractive", ytAutor: /^Paradox Interactive$/i,
    steam: [[394360, "Hearts of Iron IV"], [949230, "Cities: Skylines II"]], popis: "Švédský vydavatel strategií – Hearts of Iron, Europa Universalis, Cities: Skylines." },
  { slug: "krafton", nazev: "KRAFTON (PUBG)", typ: "studio", zeme: "KR", web: "https://www.pubg.com/", steam: [[578080, "PUBG: BATTLEGROUNDS"]],
    popis: "Jihokorejský vydavatel PUBG: BATTLEGROUNDS." },
  { slug: "facepunch", nazev: "Facepunch Studios", typ: "studio", zeme: "GB", web: "https://facepunch.com/", steam: [[252490, "Rust"]],
    popis: "Britské studio – Rust a Garry's Mod." },
  // České studia
  { slug: "warhorse", nazev: "Warhorse Studios", typ: "studio", zeme: "CZ", cz: true, web: "https://warhorsestudios.cz/", yt: "@WarhorseStudios", ytAutor: /^Warhorse Studios$/i,
    steam: [[1771300, "Kingdom Come: Deliverance II"]], popis: "Pražské studio – Kingdom Come: Deliverance I a II." },
  { slug: "bohemia", nazev: "Bohemia Interactive", typ: "studio", zeme: "CZ", cz: true, web: "https://www.bohemia.net/", yt: "@BohemiaInteractive", ytAutor: /^Bohemia Interactive$/i,
    steam: [[221100, "DayZ"], [1874880, "Arma Reforger"], [107410, "Arma 3"]], popis: "České studio – série Arma, DayZ a Vigor." },
  { slug: "scs-software", nazev: "SCS Software", typ: "studio", zeme: "CZ", cz: true, web: "https://scssoft.com/", yt: "@SCSSoftware", ytAutor: /^SCS Software$/i,
    rss: "https://blog.scssoft.com/feeds/posts/default", steam: [[227300, "Euro Truck Simulator 2"], [270880, "American Truck Simulator"]],
    popis: "Pražské studio – Euro Truck Simulator 2 a American Truck Simulator." },
  { slug: "hangar-13", nazev: "Hangar 13 (Mafia)", typ: "studio", zeme: "CZ", cz: true, web: "https://hangar13games.com/", steam: [[1030840, "Mafia: Definitive Edition"]],
    popis: "Studio 2K s pobočkou v Brně a Praze – série Mafia." },
  { slug: "amanita", nazev: "Amanita Design", typ: "studio", zeme: "CZ", cz: true, web: "https://amanita-design.net/", steam: [[40700, "Machinarium"]],
    popis: "Brněnské studio – Machinarium, Samorost, Botanicula a Creaks." },
  { slug: "keen", nazev: "Keen Software House", typ: "studio", zeme: "CZ", cz: true, web: "https://www.keenswh.com/", steam: [[244850, "Space Engineers"]],
    popis: "Pražské studio – Space Engineers a Medieval Engineers." },
];
const PODLE_SLUGU = Object.fromEntries(STUDIA.map((s) => [s.slug, s]));

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS studia_zpravy (id TEXT PRIMARY KEY, studio TEXT NOT NULL, druh TEXT NOT NULL, nazev TEXT NOT NULL,
     url TEXT NOT NULL, nahled TEXT, text TEXT, hra TEXT, cas INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_studia_zpravy ON studia_zpravy(studio, cas)`,
  `CREATE INDEX IF NOT EXISTS idx_studia_zpravy_cas ON studia_zpravy(cas)`,
];
let hotovo = false;
export async function zajistiSchemaStudia(db) {
  if (hotovo) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  await db.prepare("CREATE TABLE IF NOT EXISTS obsah_stav (klic TEXT PRIMARY KEY, data TEXT, zdroj TEXT, cas INTEGER NOT NULL)").run();
  hotovo = true;
}

const https = (u) => /^https:\/\//.test(String(u || "")) ? String(u) : "";
async function stahni(url, typ = "json") {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${new URL(url).hostname}`);
  return typ === "json" ? r.json() : (await r.text()).slice(0, 800_000);
}

async function youtubeStudia(db, st, stav) {
  let kanal = stav?.data && /^UC[\w-]{22}$/.test(stav.data) ? stav.data : "";
  if (!kanal) kanal = await idKanalu(`https://www.youtube.com/${st.yt}`);
  const xml = await stahni(`https://www.youtube.com/feeds/videos.xml?channel_id=${kanal}`, "text");
  // Ověření: autor kanálu v RSS musí odpovídat očekávanému oficiálnímu názvu.
  const autor = textBezHtml((/<author>\s*<name>([\s\S]*?)<\/name>/.exec(xml) || [])[1] || "");
  if (!st.ytAutor.test(autor)) throw new Error(`YouTube kanál ${st.yt} patří „${autor.slice(0, 40)}“ – neověřeno, nepoužito`);
  return { kanal, polozky: parsujYoutube(xml).filter((v) => !v.shorts).map((v) => ({ id: `yt:${v.id}`, druh: "video", nazev: v.nazev,
    url: `https://www.youtube.com/watch?v=${v.id}`, nahled: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`, cas: v.cas })) };
}

async function steamOznameni(appid, hra) {
  const d = await stahni(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=4&maxlength=300&feeds=steam_community_announcements&format=json`);
  return (d?.appnews?.newsitems || []).map((n) => ({ id: `st:${n.gid}`, druh: "steam", nazev: textBezHtml(n.title).slice(0, 200),
    url: https(n.url) || `https://store.steampowered.com/news/app/${appid}`, text: textBezHtml(String(n.contents || "").replace(/\[[^\]]+\]/g, " ")).slice(0, 220),
    hra, cas: (n.date || 0) * 1000 }));
}

export async function sberStudii(env) {
  const db = env.DB;
  await zajistiSchemaStudia(db);
  const ted = Date.now();
  const { results } = await db.prepare("SELECT klic, data, cas FROM obsah_stav WHERE klic LIKE 'st:%'").all();
  const stavy = Object.fromEntries(results.map((r) => [r.klic.slice(3), r]));
  const fronta = [...STUDIA].sort((a, b) => (stavy[a.slug]?.cas || 0) - (stavy[b.slug]?.cas || 0)).slice(0, STUDII_NA_BEH);
  const prikazy = [], chyby = [];
  let novych = 0;
  for (const st of fronta) {
    const ukoly = [];
    if (st.yt) ukoly.push(youtubeStudia(db, st, stavy[st.slug]));
    if (st.rss) ukoly.push(stahni(st.rss, "text").then((xml) => ({ polozky: parsujFeed(xml, 10).map((p) => ({ id: `rss:${p.url}`.slice(0, 300), druh: "clanek",
      nazev: p.nadpis, url: https(p.url), nahled: https(p.obrazek), text: String(p.perex || "").slice(0, 220), cas: p.datum })) })));
    for (const [id, hra] of st.steam || []) ukoly.push(steamOznameni(id, hra).then((polozky) => ({ polozky })));
    const vysl = await Promise.allSettled(ukoly);
    let kanal = stavy[st.slug]?.data || "";
    for (const v of vysl) {
      if (v.status === "rejected") { chyby.push(`${st.nazev}: ${String(v.reason?.message || v.reason).slice(0, 120)}`); continue; }
      if (v.value.kanal) kanal = v.value.kanal;
      for (const p of v.value.polozky) {
        if (!p.url || !p.nazev || !Number.isFinite(p.cas) || p.cas > ted + 3600e3 || p.cas < ted - 120 * 86400e3) continue;
        prikazy.push(db.prepare(`INSERT OR IGNORE INTO studia_zpravy (id, studio, druh, nazev, url, nahled, text, hra, cas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(p.id, st.slug, p.druh, p.nazev.slice(0, 200), p.url, p.nahled || null, p.text || null, p.hra || null, p.cas));
        novych++;
      }
    }
    prikazy.push(db.prepare("INSERT OR REPLACE INTO obsah_stav (klic, data, zdroj, cas) VALUES (?, ?, ?, ?)").bind(`st:${st.slug}`, kanal, "", ted));
  }
  prikazy.push(db.prepare("DELETE FROM studia_zpravy WHERE cas < ?").bind(ted - 120 * 86400e3));
  await db.batch(prikazy);
  // Náhled oficiálního webu (obrázek, ikona, popis) – jednou za 7 dní, nejvýš 2 weby na běh.
  await obnovNahledy(db, fronta.map((s) => s.web), 2).catch((e) => chyby.push(`náhled webu: ${e.message}`));
  return { studia: fronta.map((s) => s.nazev), polozek: novych, chyby };
}

const naPolozku = (r) => ({ studio: r.studio, studio_nazev: PODLE_SLUGU[r.studio]?.nazev || r.studio, druh: r.druh, nazev: r.nazev, url: r.url,
  nahled: https(r.nahled), text: r.text || "", hra: r.hra || "", cas: new Date(r.cas).toISOString() });
const verejneStudio = (s) => ({ slug: s.slug, nazev: s.nazev, typ: s.typ, zeme: s.zeme, cz: !!s.cz, web: s.web, popis: s.popis,
  youtube: s.yt ? `https://www.youtube.com/${s.yt}` : "", hry: (s.steam || []).map(([id, hra]) => ({ id: String(id), hra, url: `https://store.steampowered.com/app/${id}/` })) });

// /api/studia – přehled studií + nejnovější trailery a zprávy napříč studii.
export async function apiStudia(env) {
  const db = env.DB;
  await zajistiSchemaStudia(db);
  const [poc, vid, zpr] = await db.batch([
    db.prepare("SELECT studio, COUNT(*) AS n, MAX(cas) AS posledni FROM studia_zpravy GROUP BY studio"),
    db.prepare("SELECT * FROM studia_zpravy WHERE druh = 'video' ORDER BY cas DESC LIMIT 24"),
    db.prepare("SELECT * FROM studia_zpravy WHERE druh <> 'video' ORDER BY cas DESC LIMIT 30"),
  ]);
  const p = Object.fromEntries(poc.results.map((r) => [r.studio, r]));
  const nahledy = await nactiNahledy(db, STUDIA.map((s) => s.web)).catch(() => new Map());
  return {
    studia: STUDIA.map((s) => ({ ...verejneStudio(s), nahled: nahledy.get(s.web) || null, polozek: p[s.slug]?.n || 0, posledni: p[s.slug]?.posledni ? new Date(p[s.slug].posledni).toISOString() : null })),
    videa: vid.results.map(naPolozku), zpravy: zpr.results.map(naPolozku),
  };
}
// /api/studio/:slug
export async function apiStudio(env, slug) {
  const s = PODLE_SLUGU[slug];
  if (!s) return null;
  const db = env.DB;
  await zajistiSchemaStudia(db);
  const { results } = await db.prepare("SELECT * FROM studia_zpravy WHERE studio = ? ORDER BY cas DESC LIMIT 60").bind(slug).all();
  const nahled = (await nactiNahledy(db, [s.web]).catch(() => new Map())).get(s.web) || null;
  return { ...verejneStudio(s), nahled, polozky: results.map(naPolozku) };
}
// Pro kalendář akcí a předplatné: novinky platforem podle klíčových slov v titulku.
export async function zpravyPlatforem(db, re, limit = 8) {
  await zajistiSchemaStudia(db);
  const { results } = await db.prepare("SELECT * FROM studia_zpravy WHERE studio IN ('playstation', 'xbox', 'nintendo') ORDER BY cas DESC LIMIT 300").all();
  return results.filter((r) => re.test(r.nazev)).slice(0, limit).map(naPolozku);
}
