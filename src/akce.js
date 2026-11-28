// Kalendář herních akcí s odpočtem. Termíny jsou jen oficiálně potvrzené (zdroj u každé akce).
// Až pořadatel ohlásí další termíny, přidej je sem – staré akce se po skončení samy skryjí.
// Ohlášené přenosy (State of Play, Nintendo Direct…) a novinky předplatného se berou z oficiálních
// kanálů platforem (src/studia.js), hra zdarma na Epicu z katalogu.
import { zpravyPlatforem } from "./studia.js";
import { obnovNahledy, nactiNahledy } from "./nahled.js";
import { prenosyJakoAkce } from "./oficialni.js";

// Obrázky akcí: z náhledu oficiálního webu (og:image). Obnovuje Cron katalogu.
export const obnovObrazkyAkci = (db) => obnovNahledy(db, AKCE.map((a) => a.web), 4);

// Časy v UTC. Steam začíná a končí v 10:00 tichomořského času (PST = 18:00 UTC, PDT = 17:00 UTC).
export const AKCE = [
  { id: "tga-2026", nazev: "The Game Awards 2026", typ: "prenos", od: "2026-12-11T00:30:00Z", do: "2026-12-11T04:00:00Z",
    misto: "Los Angeles, živě online", popis: "Ceny za hry roku a světové premiéry trailerů.", zdroj: "https://thegameawards.com/news/tga-returns-december-10-2026", web: "https://thegameawards.com/" },
  { id: "steam-winter-2026", nazev: "Steam zimní výprodej 2026", typ: "vyprodej", od: "2026-12-17T18:00:00Z", do: "2027-01-04T18:00:00Z",
    popis: "Největší výprodej roku na Steamu a hlasování Steam Awards.", zdroj: "https://partner.steamgames.com/doc/marketing/upcoming_events", web: "https://store.steampowered.com/" },
  { id: "steam-nextfest-2027-02", nazev: "Steam Next Fest (únor 2027)", typ: "festival", od: "2027-02-22T18:00:00Z", do: "2027-03-01T18:00:00Z",
    popis: "Týden dem chystaných her zdarma.", zdroj: "https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/feb_2027", web: "https://store.steampowered.com/" },
  { id: "steam-spring-2027", nazev: "Steam jarní výprodej 2027", typ: "vyprodej", od: "2027-03-18T17:00:00Z", do: "2027-03-25T17:00:00Z",
    popis: "Sezónní výprodej na Steamu.", zdroj: "https://partner.steamgames.com/doc/marketing/upcoming_events", web: "https://store.steampowered.com/" },
  { id: "steam-nextfest-2027-06", nazev: "Steam Next Fest (červen 2027)", typ: "festival", od: "2027-06-14T17:00:00Z", do: "2027-06-21T17:00:00Z",
    popis: "Týden dem chystaných her zdarma.", zdroj: "https://partner.steamgames.com/doc/marketing/upcoming_events", web: "https://store.steampowered.com/" },
  { id: "steam-summer-2027", nazev: "Steam letní výprodej 2027", typ: "vyprodej", od: "2027-06-24T17:00:00Z", do: "2027-07-08T17:00:00Z",
    popis: "Velký letní výprodej na Steamu.", zdroj: "https://partner.steamgames.com/doc/marketing/upcoming_events", web: "https://store.steampowered.com/" },
  { id: "gamescom-onl-2027", nazev: "gamescom Opening Night Live 2027", typ: "prenos", od: "2027-08-24T00:00:00+02:00", celodenni: true,
    misto: "Kolín nad Rýnem, živě online", popis: "Úvodní přenos veletrhu plný oznámení a trailerů.", zdroj: "https://www.gamespress.com/it/gamescom-2026-more-international-than-ever", web: "https://www.gamescom.global/" },
  { id: "gamescom-2027", nazev: "gamescom 2027", typ: "vystava", od: "2027-08-25T00:00:00+02:00", do: "2027-08-30T00:00:00+02:00", celodenni: true,
    misto: "Kolín nad Rýnem", popis: "Největší herní veletrh na světě.", zdroj: "https://www.gamespress.com/it/gamescom-2026-more-international-than-ever", web: "https://www.gamescom.global/" },
];

export async function apiAkce(env) {
  const db = env.DB;
  const ted = Date.now();
  const nahledy = await nactiNahledy(db, AKCE.map((a) => a.web)).catch(() => new Map());
  // Pevné akce + jednorázové přenosy z oficiálních rozvrhů na Twitchi (PlayStation, Xbox, Nintendo…). Přenos, který už v pevném
  // seznamu je (začíná do 3 h od něj), se nepřidává podruhé.
  const pevne = AKCE.filter((a) => Date.parse(a.do || a.od) + (a.do ? 0 : 86400e3) > ted);
  const tw = (await prenosyJakoAkce(env).catch(() => [])).filter((p) => Date.parse(p.do || p.od) + (p.do ? 0 : 3 * 3600e3) > ted
    && !pevne.some((a) => a.typ === "prenos" && Math.abs(Date.parse(a.od) - Date.parse(p.od)) < 3 * 3600e3));
  const akce = [...pevne, ...tw]
    .map((a) => ({ ...a, bezi: Date.parse(a.od) <= ted, obrazek: nahledy.get(a.web)?.obrazek || "" }))
    .sort((a, b) => Date.parse(a.od) - Date.parse(b.od));
  const [prenosy, predplatne] = await Promise.all([
    zpravyPlatforem(db, /state of play|nintendo direct|games showcase|xbox showcase|partner preview|developer direct/i, 6).catch(() => []),
    zpravyPlatforem(db, /playstation plus|ps plus|game pass/i, 8).catch(() => []),
  ]);
  let epic = null;
  try {
    const r = await db.prepare("SELECT data FROM katalog WHERE klic = 'epic_brzy'").first();
    const h = r ? JSON.parse(r.data)[0] : null;
    if (h?.od && Date.parse(h.od) > ted) epic = { nazev: h.nazev, od: h.od, url: h.url, obrazek: h.obrazek };
  } catch { /* katalog ještě není */ }
  return { akce, prenosy, predplatne, epic, cas: new Date(ted).toISOString() };
}
