// Měsíční zpráva o české streamovací scéně – jen z vlastních měření oficiálních API Twitche a Kicku (žádná AI, žádné odhady).
// Měsíc = kalendářní měsíc podle pražského času. Rozběhnutý měsíc se počítá průběžně (označeno), minulé se drží v mezipaměti.
import { denPraha } from "./psani.js";
import { slugHry } from "./twitch.js";
import { posunDne, hodin, zmenaPct, pulnocPraha, zacatekDat, dotazHry } from "./statistiky.js";

const MESICE = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
const MESICE_2 = ["lednu", "únoru", "březnu", "dubnu", "květnu", "červnu", "červenci", "srpnu", "září", "říjnu", "listopadu", "prosinci"];
const cz = (n) => Number(n || 0).toLocaleString("cs-CZ");
const posunMesic = (m, n) => { const [r, mm] = m.split("-").map(Number); const d = new Date(Date.UTC(r, mm - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const posledniDen = (m) => { const [r, mm] = m.split("-").map(Number); return new Date(Date.UTC(r, mm, 0)).toISOString().slice(0, 10); };

async function souhrnMesice(db, od, doDen) {
  const odMs = pulnocPraha(od), doMs = pulnocPraha(posunDne(doDen, 1));
  const [pl, kan, spicka, hry, top, mereni] = await db.batch([
    db.prepare("SELECT platforma, SUM(divako_minut) AS dm, SUM(minut) AS m FROM hry_den WHERE den BETWEEN ? AND ? GROUP BY platforma").bind(od, doDen),
    db.prepare(`SELECT s.platforma, COUNT(DISTINCT n.user_id) AS n FROM snimky n JOIN streameri s ON s.id = n.user_id
      WHERE n.den BETWEEN ? AND ? AND n.max_divaku >= 3 GROUP BY s.platforma`).bind(od, doDen),
    db.prepare("SELECT cas, SUM(divaci) AS d, SUM(streamu) AS s FROM scena WHERE cas >= ? AND cas < ? GROUP BY cas ORDER BY d DESC LIMIT 1").bind(odMs, doMs),
    dotazHry(db, od, doDen, 60),
    db.prepare(`SELECT s.platforma, s.login, s.jmeno, s.profilovka, MAX(n.max_divaku) AS divaci, SUM(n.minut) AS minut
      FROM snimky n JOIN streameri s ON s.id = n.user_id WHERE n.den BETWEEN ? AND ? AND s.skryty = 0 GROUP BY s.id ORDER BY divaci DESC LIMIT 10`).bind(od, doDen),
    db.prepare("SELECT COUNT(DISTINCT cas) AS n FROM scena WHERE cas >= ? AND cas < ?").bind(odMs, doMs),
  ]);
  const p = Object.fromEntries(pl.results.map((r) => [r.platforma, r]));
  const k = Object.fromEntries(kan.results.map((r) => [r.platforma, r.n]));
  return {
    dm: (p.twitch?.dm || 0) + (p.kick?.dm || 0), dm_twitch: p.twitch?.dm || 0, dm_kick: p.kick?.dm || 0,
    vysilani_min: (p.twitch?.m || 0) + (p.kick?.m || 0),
    kanalu_twitch: k.twitch || 0, kanalu_kick: k.kick || 0,
    spicka: spicka.results[0] ? { divaci: spicka.results[0].d, streamu: spicka.results[0].s, cas: new Date(spicka.results[0].cas).toISOString() } : null,
    hry: hry.results, top: top.results, mereni: mereni.results[0]?.n || 0,
  };
}

export async function apiZprava(env, mesicId) {
  const db = env.DB, ted = Date.now();
  const dnes = denPraha(ted), aktualni = dnes.slice(0, 7);
  const zacatek = await zacatekDat(db);
  if (!zacatek) return { mesic: null, mesice: [] };
  const prvni = zacatek.slice(0, 7);
  // Výchozí: poslední celý měsíc; když ještě žádný celý není, rozběhnutý.
  let mesic = /^\d{4}-\d{2}$/.test(mesicId || "") ? mesicId : posunMesic(aktualni, -1);
  if (mesic < prvni) mesic = prvni;
  if (mesic > aktualni) mesic = aktualni;
  const probiha = mesic === aktualni;
  const od = `${mesic}-01`, doDen = probiha ? dnes : posledniDen(mesic);
  const predMesic = posunMesic(mesic, -1);
  const predOd = `${predMesic}-01`, predDo = probiha ? [posunDne(predOd, Number(dnes.slice(8)) - 1), posledniDen(predMesic)].sort()[0] : posledniDen(predMesic); // u rozběhnutého stejný počet dní
  const [t, p] = [await souhrnMesice(db, od, doDen), await souhrnMesice(db, predOd, predDo)];
  const maPred = zacatek <= predOd && p.dm > 0; // srovnání jen s měsícem, který máme změřený celý
  const dni = Math.round((Date.parse(doDen) - Date.parse(od)) / 86400e3) + 1;
  const pokryti = Math.min(100, Math.round((t.mereni / (dni * 96)) * 100));

  const predPoradi = new Map(p.hry.map((r, i) => [r.hra, { poradi: i + 1, dm: r.dm }]));
  const hry = t.hry.slice(0, 15).map((r, i) => {
    const x = predPoradi.get(r.hra);
    return { poradi: i + 1, hra: r.hra, slug: slugHry(r.hra), hodin: hodin(r.dm), kick_podil: r.dm ? Math.round(((r.dm_kick || 0) / r.dm) * 100) : 0,
      poradi_pred: maPred ? x?.poradi || null : null, zmena: maPred && x ? zmenaPct(r.dm, x.dm) : null, nova: maPred && !x };
  });
  const skokani = maPred ? t.hry.map((r) => ({ r, x: predPoradi.get(r.hra) })).filter(({ r, x }) => x && hodin(x.dm) >= 20 && hodin(r.dm) >= 30)
    .map(({ r, x }) => ({ hra: r.hra, slug: slugHry(r.hra), hodin: hodin(r.dm), zmena: zmenaPct(r.dm, x.dm) })).filter((h) => h.zmena > 0)
    .sort((a, b) => b.zmena - a.zmena).slice(0, 5) : [];
  const nove = maPred ? hry.filter((h) => h.nova).slice(0, 5) : [];
  const podilKick = t.dm ? Math.round((t.dm_kick / t.dm) * 100) : 0, podilKickPred = p.dm ? Math.round((p.dm_kick / p.dm) * 100) : null;

  // Věty jen z čísel výše.
  const M = MESICE_2[Number(mesic.slice(5)) - 1];
  const vety = [];
  if (t.dm) vety.push(`V ${M}${probiha ? " (zatím)" : ""} diváci strávili u českých streamů ${cz(hodin(t.dm))} hodin${maPred && zmenaPct(t.dm, p.dm) != null ? ` – ${zmenaPct(t.dm, p.dm) >= 0 ? "o " + zmenaPct(t.dm, p.dm) + " % víc" : "o " + Math.abs(zmenaPct(t.dm, p.dm)) + " % míň"} ${probiha ? " než ve stejném období minulého měsíce" : " než minulý měsíc"}` : ""}.`);
  if (t.dm) vety.push(`Na Kick připadlo ${podilKick} % hodin sledování, na Twitch ${100 - podilKick} %${maPred && podilKickPred != null && podilKickPred !== podilKick ? ` (minulý měsíc Kick ${podilKickPred} %)` : ""}.`);
  const kanalu = t.kanalu_twitch + t.kanalu_kick;
  if (kanalu) vety.push(`${kanalu === 1 ? "Vysílal 1 český kanál" : kanalu <= 4 ? `Vysílaly ${kanalu} české kanály` : `Vysílalo ${cz(kanalu)} českých kanálů`} s aspoň 3 diváky: ${cz(t.kanalu_twitch)} na Twitchi a ${cz(t.kanalu_kick)} na Kicku.`);
  if (hry[0]) vety.push(`Nejsledovanější hrou byla ${hry[0].hra} (${cz(hry[0].hodin)} h)${hry[1] ? `, za ní ${hry[1].hra}${hry[2] ? ` a ${hry[2].hra}` : ""}` : ""}.`);
  if (skokani[0]) vety.push(`Největší skok: ${skokani[0].hra} (+${skokani[0].zmena} %).`);
  if (nove[0]) vety.push(`Nově mezi 15 nejsledovanějšími: ${nove.map((h) => h.hra).join(", ")}.`);
  if (t.top[0]) vety.push(`Nejvíc diváků najednou měl ${t.top[0].jmeno || t.top[0].login} (${cz(t.top[0].divaci)}).`);
  if (t.spicka) vety.push(`Celá scéna měla nejvíc diváků najednou ${cz(t.spicka.divaci)} na ${cz(t.spicka.streamu)} streamech.`);

  const mesice = [];
  for (let m = aktualni; m >= prvni && mesice.length < 36; m = posunMesic(m, -1)) mesice.push({ id: m, nazev: `${MESICE[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`, probiha: m === aktualni });
  return {
    mesic, nazev: `${MESICE[Number(mesic.slice(5)) - 1]} ${mesic.slice(0, 4)}`, od, do: doDen, probiha, pokryti, data_od: zacatek,
    neuplny: zacatek > od, vety,
    souhrn: { hodin: hodin(t.dm), hodin_pred: maPred ? hodin(p.dm) : null, zmena: maPred ? zmenaPct(t.dm, p.dm) : null,
      hodin_twitch: hodin(t.dm_twitch), hodin_kick: hodin(t.dm_kick), podil_kick: podilKick, podil_kick_pred: maPred ? podilKickPred : null,
      vysilani_hodin: Math.round(t.vysilani_min / 60), kanalu_twitch: t.kanalu_twitch, kanalu_kick: t.kanalu_kick, spicka: t.spicka },
    hry, skokani, nove,
    streameri: t.top.map((r) => ({ platforma: r.platforma || "twitch", login: r.login, jmeno: r.jmeno || r.login,
      profilovka: /^https:\/\//.test(r.profilovka || "") ? r.profilovka : "", divaci: r.divaci, hodin: Math.round((r.minut || 0) / 60) })),
    mesice, cas: new Date(ted).toISOString(), cache: probiha ? 1800 : 86400,
  };
}
