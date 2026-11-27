// Herní pas: všechno, co o hře víme, na jednom místě – pro stránku hry a srovnávač her.
// Skládá jen existující data: obchody (hra-data.js), databáze her Steam (steam_hry), historie cen, aktualizace,
// naše měření českých streamů, IGDB (série, DLC, lehká DNA) a pulsometr.
import { infoHrySteam } from "./hra-data.js";
import { zajistiSchemaHlidac } from "./hlidac.js";
import { zajistiSchemaPatchu, typPodleNadpisu } from "./patche.js";
import { pasZIgdb } from "./igdb-hra.js";
import { pulsHry } from "./puls.js";
import { rozborCen } from "./ceny.js";
import { nactiKatalog } from "./trendy.js";
import { ZANRY } from "./nastroje.js";

const DEN = 86400e3;
const https = (u) => (/^https:\/\//.test(String(u || "")) ? String(u) : "");

// Doplňky pasu ke hře, o které už máme údaje z obchodů (st = info.steam).
export async function doplnPas(env, ctx, { nazev, st }) {
  const db = env.DB;
  await zajistiSchemaHlidac(db);
  await zajistiSchemaPatchu(db);
  const id = st?.id ? String(st.id) : null;
  const tr = await nactiKatalog(db, "trendy");
  const [rows, igdb] = await Promise.all([
    id ? db.batch([
      db.prepare("SELECT den, cena, sleva FROM ceny_historie WHERE id = ? ORDER BY den").bind(id),
      db.prepare("SELECT gid, nadpis, url, datum, typ, stav, shrnuti FROM patche WHERE appid = ? ORDER BY datum DESC LIMIT 6").bind(id),
      db.prepare("SELECT rezim, zanry, cestina FROM steam_hry WHERE id = ?").bind(id),
    ]).catch(() => null) : Promise.resolve(null),
    pasZIgdb(env, ctx, { appid: id, nazev }).catch(() => null),
  ]);
  const historie = rows?.[0]?.results || [];
  const g = rows?.[2]?.results?.[0] || null;
  const puls = await pulsHry(db, { nazev, steamId: id, hraciTed: st?.hraci_ted, sleva: st?.sleva, zdarma: st?.zdarma, cena: st?.cena },
    { hmax: tr?.cesko?.hmax || 0, odMereni: tr?.cesko?.od || null }).catch(() => null);
  const patche = (rows?.[1]?.results || []).map((r) => {
    let shr = "";
    try { shr = r.stav === "hotovo" ? JSON.parse(r.shrnuti || "{}").shrnuti || "" : ""; } catch { /* nic */ }
    return { nadpis: r.nadpis, url: r.url, datum: new Date(r.datum).toISOString(), typ: r.typ || typPodleNadpisu(r.nadpis), shrnuti: shr };
  });
  const akt = puls?.slozky?.find((s) => s.klic === "aktualizace");
  // Lehká DNA: jen skutečná pole ze Steamu a IGDB + naše čísla. Každá část nese zdroj.
  const rezim = g?.rezim || 0;
  const dna = {
    steam: g ? { sam: !!(rezim & 1), koop: !!(rezim & 2), online: !!(rezim & 4),
      zanry: String(g.zanry || "").split(",").map(Number).filter((z) => ZANRY[z]).map((z) => ZANRY[z]) } : null,
    igdb: igdb && !igdb.nenalezeno ? igdb.dna : null,
    aktivita: akt ? { pocet90: akt.hodnota.pocet, dni: akt.hodnota.dni } : null,
  };
  return {
    puls,
    ceny: historie.length ? { historie: historie.slice(-400), rozbor: rozborCen(historie, { cena: st?.cena, sleva: st?.sleva, zdarma: st?.zdarma, puvodni: st?.puvodni }) } : null,
    patche, dna,
    igdb: igdb && !igdb.nenalezeno ? { url: igdb.url, slug: igdb.slug || "", serie: igdb.serie, dlc: igdb.dlc, dlc_celkem: igdb.dlc_celkem } : null,
  };
}

// Srovnávač: 2–4 hry podle Steam ID.
export async function apiSrovnani(env, ctx, idsText) {
  const ids = [...new Set(String(idsText || "").split(",").map((x) => x.trim()).filter((x) => /^\d{1,10}$/.test(x)))].slice(0, 4);
  if (!ids.length) return { hry: [] };
  const info = await Promise.all(ids.map((id) => infoHrySteam(env, ctx, id).catch(() => null)));
  const hry = await Promise.all(ids.map(async (id, i) => {
    const st = info[i]?.steam;
    if (!st?.nazev) return { id, nenalezeno: true };
    const pas = await doplnPas(env, ctx, { nazev: st.nazev, st }).catch(() => null);
    return {
      id, nazev: st.nazev, obrazek: https(st.obrazek), url: st.url, zdarma: st.zdarma, cena: st.cena, puvodni: st.puvodni, sleva: st.sleva, mena: st.mena,
      cestina: st.cestina, hodnoceni: st.hodnoceni, metacritic: st.metacritic, hraci_ted: st.hraci_ted, vydani: st.vydani, chysta_se: st.chysta_se,
      vyvojari: st.vyvojari, platformy: st.platformy, zanry: st.zanry, gog: info[i]?.gog ? { cena: info[i].gog.cena, mena: info[i].gog.mena, sleva: info[i].gog.sleva, url: info[i].gog.url } : null,
      stav_dat: info[i]?.cas || null,
      puls: pas?.puls || null, dna: pas?.dna || null, rozbor: pas?.ceny?.rozbor || null,
      posledni_patch: pas?.patche?.[0] || null, dlc_celkem: pas?.igdb?.dlc_celkem ?? null,
    };
  }));
  return { hry };
}
