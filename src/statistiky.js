// Vlastní statistiky české scény z dat, která sami sbíráme z oficiálních API Twitche a Kicku:
//  • „Co hraje Česko“ – žebříček her podle hodin sledování za posledních 7 dní, srovnání s předchozími 7 dny.
//  • Týdenní report – pondělí až neděle (pražský čas), souhrn, hry, streameři, rekordy a milníky.
// Hodiny sledování = součet diváků v každém měření × skutečně uplynulé minuty od předchozího (max. 15).
// Stejnou metodu používají i zahraniční statistické weby. Souběžné běhy se nezapočítají dvakrát (rezervujMinuty).
import { denPraha } from "./psani.js";
import { slugHry } from "./twitch.js";
import { BEZ_KATEGORIE } from "./prehled.js";

const DEN = 86400e3;
const posunDne = (den, n) => new Date(Date.parse(den + "T12:00:00Z") + n * DEN).toISOString().slice(0, 10);
const hodin = (divakoMinut) => Math.round((divakoMinut || 0) / 60);
const zmenaPct = (ted, pred) => (pred > 0 ? Math.round(((ted - pred) / pred) * 100) : null);

// Půlnoc daného dne v Praze jako UTC milisekundy (bere v úvahu letní/zimní čas).
function pulnocPraha(den) {
  const poledneUtc = Date.parse(den + "T12:00:00Z");
  const hodinaVPraze = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", hourCycle: "h23" }).format(new Date(poledneUtc)));
  return Date.parse(den + "T00:00:00Z") - (hodinaVPraze - 12) * 3600e3;
}
// Pondělí týdne, do kterého den patří, a ISO označení týdne (např. 2026-W48).
function pondeli(den) {
  const d = new Date(den + "T12:00:00Z");
  return posunDne(den, -((d.getUTCDay() + 6) % 7));
}
function pondeliPrvnihoTydne(rok) {
  const ctvrtyLeden = new Date(Date.UTC(rok, 0, 4, 12));
  return new Date(+ctvrtyLeden - ((ctvrtyLeden.getUTCDay() + 6) % 7) * DEN);
}
function isoTyden(pondeliDen) {
  const rok = new Date(Date.parse(pondeliDen + "T12:00:00Z") + 3 * DEN).getUTCFullYear(); // rok podle čtvrtka
  const tyden = 1 + Math.round((Date.parse(pondeliDen + "T12:00:00Z") - pondeliPrvnihoTydne(rok)) / (7 * DEN));
  return `${rok}-W${String(tyden).padStart(2, "0")}`;
}
function pondeliZTydne(id) {
  const m = /^(\d{4})-W(\d{2})$/.exec(id || "");
  if (!m || +m[2] < 1 || +m[2] > 53) return null;
  return new Date(+pondeliPrvnihoTydne(+m[1]) + (+m[2] - 1) * 7 * DEN).toISOString().slice(0, 10);
}

async function zacatekDat(db) {
  const r = await db.prepare("SELECT MIN(den) AS od FROM hry_den").first();
  return r?.od || null;
}

// Hry za období [od, do] (dny včetně) – součty z hry_den.
function dotazHry(db, od, doDen, limit) {
  return db.prepare(`SELECT hra, SUM(divako_minut) AS dm, SUM(minut) AS m, MAX(max_divaku) AS spicka,
      SUM(CASE WHEN platforma = 'kick' THEN divako_minut ELSE 0 END) AS dm_kick
    FROM hry_den WHERE den BETWEEN ? AND ? AND hra <> ? GROUP BY hra ORDER BY dm DESC LIMIT ?`).bind(od, doDen, BEZ_KATEGORIE, limit);
}

function sestavHry(ted, pred, streameru) {
  const predMapa = new Map(pred.map((r, i) => [r.hra, { ...r, poradi: i + 1 }]));
  return ted.map((r, i) => {
    const p = predMapa.get(r.hra);
    return {
      hra: r.hra, slug: slugHry(r.hra), poradi: i + 1,
      hodin: hodin(r.dm), hodin_pred: p ? hodin(p.dm) : 0, zmena: zmenaPct(r.dm, p?.dm || 0),
      poradi_pred: p?.poradi || null, novinka: !p || hodin(p.dm) === 0,
      vysilani_hodin: Math.round((r.m || 0) / 60), spicka: r.spicka || 0,
      kick_podil: r.dm ? Math.round(((r.dm_kick || 0) / r.dm) * 100) : 0,
      streameru: streameru.get(r.hra) || 0,
    };
  });
}

// ---------- /api/cesko ----------
export async function apiCesko(env) {
  const db = env.DB;
  const ted = Date.now();
  const dnes = denPraha(ted);
  const od = posunDne(dnes, -6), predOd = posunDne(dnes, -13), predDo = posunDne(dnes, -7);
  const [h, p, s, c] = await db.batch([
    dotazHry(db, od, dnes, 30),
    dotazHry(db, predOd, predDo, 300),
    db.prepare("SELECT hra, COUNT(*) AS n FROM hry_streamera WHERE posledni > ? GROUP BY hra").bind(ted - 7 * DEN),
    db.prepare("SELECT SUM(CASE WHEN den >= ? THEN divako_minut ELSE 0 END) AS ted, SUM(CASE WHEN den < ? THEN divako_minut ELSE 0 END) AS pred FROM hry_den WHERE den >= ?").bind(od, od, predOd),
  ]);
  const streameru = new Map(s.results.map((r) => [r.hra, r.n]));
  const hry = sestavHry(h.results, p.results, streameru);
  return {
    od, do: dnes, data_od: await zacatekDat(db),
    celkem: { hodin: hodin(c.results[0]?.ted), hodin_pred: hodin(c.results[0]?.pred), zmena: zmenaPct(c.results[0]?.ted || 0, c.results[0]?.pred || 0) },
    hry,
    nahoru: hry.filter((x) => !x.novinka && x.zmena != null && x.hodin >= 10).sort((a, b) => b.zmena - a.zmena).slice(0, 5),
    novinky: hry.filter((x) => x.novinka && x.hodin >= 5).slice(0, 5),
    cas: new Date(ted).toISOString(),
  };
}

// ---------- /api/report?tyden=2026-W48 ----------
export async function apiReport(env, naStreamera, tydenId) {
  const db = env.DB;
  const ted = Date.now();
  const dnes = denPraha(ted);
  const aktualniPondeli = pondeli(dnes);
  // Bez parametru: poslední celý týden. „aktualni“ = rozběhnutý týden.
  let po = tydenId === "aktualni" ? aktualniPondeli : pondeliZTydne(tydenId) || posunDne(aktualniPondeli, -7);
  if (po > aktualniPondeli) po = aktualniPondeli;
  const ne = posunDne(po, 6), predPo = posunDne(po, -7), predNe = posunDne(po, -1);
  const odMs = pulnocPraha(po), doMs = pulnocPraha(posunDne(po, 7)), predOdMs = pulnocPraha(predPo);
  const probiha = po === aktualniPondeli;

  const [sc, scP, spicka, kanaly, kanalyP, h, hp, sStr, top, hodinyStr, rust, udal] = await db.batch([
    db.prepare(`SELECT platforma, SUM(divako_minut) AS dm, (SELECT COUNT(DISTINCT cas) FROM scena WHERE cas >= ?3 AND cas < ?4) AS mereni
      FROM hry_den WHERE den BETWEEN ?1 AND ?2 GROUP BY platforma`).bind(po, ne, odMs, doMs),
    db.prepare("SELECT SUM(divako_minut) AS dm FROM hry_den WHERE den BETWEEN ? AND ?").bind(predPo, predNe),
    db.prepare("SELECT cas, SUM(divaci) AS d, SUM(streamu) AS s FROM scena WHERE cas >= ? AND cas < ? GROUP BY cas ORDER BY d DESC LIMIT 1").bind(odMs, doMs),
    db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM snimky WHERE den BETWEEN ? AND ? AND max_divaku >= 3").bind(po, ne),
    db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM snimky WHERE den BETWEEN ? AND ? AND max_divaku >= 3").bind(predPo, predNe),
    dotazHry(db, po, ne, 15),
    dotazHry(db, predPo, predNe, 300),
    db.prepare("SELECT hra, COUNT(DISTINCT user_id) AS n FROM hry_streamera WHERE posledni BETWEEN ? AND ? GROUP BY hra").bind(odMs, doMs),
    db.prepare(`SELECT s.*, MAX(n.max_divaku) AS t_max FROM snimky n JOIN streameri s ON s.id = n.user_id
      WHERE n.den BETWEEN ? AND ? AND s.skryty = 0 GROUP BY s.id ORDER BY t_max DESC LIMIT 5`).bind(po, ne),
    db.prepare(`SELECT s.*, SUM(n.minut) AS t_minut FROM snimky n JOIN streameri s ON s.id = n.user_id
      WHERE n.den BETWEEN ? AND ? AND s.skryty = 0 GROUP BY s.id ORDER BY t_minut DESC LIMIT 5`).bind(po, ne),
    db.prepare(`SELECT s.*, (SELECT b.sledujici FROM snimky b WHERE b.user_id = s.id AND b.den BETWEEN ?1 AND ?2 AND b.sledujici IS NOT NULL ORDER BY b.den DESC LIMIT 1)
        - (SELECT a.sledujici FROM snimky a WHERE a.user_id = s.id AND a.den BETWEEN ?1 AND ?2 AND a.sledujici IS NOT NULL ORDER BY a.den LIMIT 1) AS t_rust
      FROM streameri s WHERE s.skryty = 0 AND s.id IN (SELECT user_id FROM snimky WHERE den BETWEEN ?1 AND ?2 AND sledujici IS NOT NULL)
      ORDER BY t_rust DESC LIMIT 5`).bind(po, ne),
    db.prepare(`SELECT s.*, u.typ AS u_typ, u.hodnota AS u_hodnota, u.cas AS u_cas FROM udalosti u JOIN streameri s ON s.id = u.user_id
      WHERE u.cas >= ? AND u.cas < ? AND s.skryty = 0 ORDER BY u.hodnota DESC LIMIT 12`).bind(odMs, doMs),
  ]);

  const div = Object.fromEntries(sc.results.map((r) => [r.platforma, r.dm || 0]));
  const celkemDm = (div.twitch || 0) + (div.kick || 0);
  const predDm = scP.results[0]?.dm || 0;
  const mereni = Math.max(0, ...sc.results.map((r) => r.mereni || 0));
  const hry = sestavHry(h.results, hp.results, new Map(sStr.results.map((r) => [r.hra, r.n])));
  const sp = spicka.results[0];
  const str = (r, extra) => ({ ...naStreamera(r, ted), ...extra });

  const souhrn = {
    hodin: hodin(celkemDm), hodin_pred: hodin(predDm), zmena: zmenaPct(celkemDm, predDm),
    hodin_twitch: hodin(div.twitch || 0), hodin_kick: hodin(div.kick || 0),
    prumer_divaku: mereni ? Math.round(celkemDm / 15 / mereni) : 0,
    spicka: sp ? { divaci: sp.d, streamu: sp.s, cas: new Date(sp.cas).toISOString() } : null,
    kanalu: kanaly.results[0]?.n || 0, kanalu_pred: kanalyP.results[0]?.n || 0,
    pokryti: Math.min(100, Math.round((mereni / (7 * 96)) * 100)), // kolik 15min měření z týdne máme
  };

  // Shrnutí větami – jen z čísel výše, nic domyšleného.
  const vety = [];
  if (souhrn.hodin) vety.push(`Diváci strávili u českých streamů ${souhrn.hodin.toLocaleString("cs-CZ")} hodin${souhrn.zmena != null && souhrn.hodin_pred ? ` (${souhrn.zmena >= 0 ? "+" : ""}${souhrn.zmena} % proti minulému týdnu)` : ""}.`);
  if (hry[0]) vety.push(`Nejsledovanější hrou byla ${hry[0].hra} s ${hry[0].hodin.toLocaleString("cs-CZ")} hodinami sledování.`);
  const skokan = hry.filter((x) => !x.novinka && x.zmena != null && x.hodin >= 20).sort((a, b) => b.zmena - a.zmena)[0];
  if (skokan && skokan.zmena > 0) vety.push(`Největší skok zaznamenala ${skokan.hra}: +${skokan.zmena} %.`);
  const nova = hry.find((x) => x.novinka && x.hodin >= 10 && hp.results.length);
  if (nova) vety.push(`Nově se do žebříčku dostala ${nova.hra}.`);
  if (top.results[0]) vety.push(`Nejvíc diváků najednou měl ${top.results[0].jmeno || top.results[0].login} (${Number(top.results[0].t_max).toLocaleString("cs-CZ")}).`);

  // Seznam týdnů, pro které máme data.
  const od = await zacatekDat(db);

  // Nově zachycené kanály (poprvé jsme je viděli vysílat tento týden) – má smysl až od druhého týdne měření.
  let novacci = [], klipy = [];
  if (od && od < po) {
    novacci = await db.prepare(`SELECT s.*, MAX(n.max_divaku) AS t_max FROM snimky n JOIN streameri s ON s.id = n.user_id
      WHERE n.den BETWEEN ?1 AND ?2 AND s.skryty = 0 AND NOT EXISTS (SELECT 1 FROM snimky b WHERE b.user_id = n.user_id AND b.den < ?1)
      GROUP BY s.id HAVING t_max >= 3 ORDER BY t_max DESC LIMIT 5`).bind(po, ne).all().then((r) => r.results).catch(() => []);
  }
  klipy = await db.prepare(`SELECT k.url, k.nazev, k.nahled, k.zhlednuti, k.delka, k.cas, s.jmeno, s.login, s.platforma, s.profilovka FROM klipy k
    JOIN streameri s ON s.id = k.streamer_id WHERE s.skryty = 0 AND k.cas >= ? AND k.cas < ? ORDER BY k.zhlednuti DESC LIMIT 6`)
    .bind(odMs, doMs).all().then((r) => r.results).catch(() => []);
  const tydny = [];
  if (od) for (let t = aktualniPondeli; t >= pondeli(od) && tydny.length < 60; t = posunDne(t, -7)) tydny.push({ id: isoTyden(t), od: t, do: posunDne(t, 6), probiha: t === aktualniPondeli });

  return {
    tyden: isoTyden(po), od: po, do: ne, probiha, souhrn, vety, hry,
    streameri: {
      divaci: top.results.map((r) => str(r, { hodnota: r.t_max })),
      hodiny: hodinyStr.results.map((r) => str(r, { hodnota: Math.round((r.t_minut || 0) / 60) })),
      rust: rust.results.filter((r) => r.t_rust > 0).map((r) => str(r, { hodnota: r.t_rust })),
      novacci: novacci.map((r) => str(r, { hodnota: r.t_max })),
    },
    klipy: klipy.map((k) => ({ url: k.url, nazev: k.nazev, nahled: k.nahled, zhlednuti: k.zhlednuti, delka: k.delka, cas: new Date(k.cas).toISOString(),
      jmeno: k.jmeno || k.login, login: k.login, platforma: k.platforma || "twitch", profilovka: /^https:\/\//.test(k.profilovka || "") ? k.profilovka : "" })),
    udalosti: udal.results.map((r) => str(r, { typ: r.u_typ, hodnota: r.u_hodnota, cas: new Date(r.u_cas).toISOString() })),
    tydny, data_od: od, cache: probiha ? 1800 : 86400,
  };
}

// Sdílené pomocné funkce (hitparáda, měsíční zpráva).
export { posunDne, hodin, zmenaPct, pulnocPraha, pondeli, isoTyden, pondeliZTydne, zacatekDat, dotazHry };
