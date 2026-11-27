// Cenový radar: rozbor historie cen jedné hry ze Steamu (tabulka ceny_historie).
// Historie začíná dnem, kdy jsme hru začali sledovat – nic se nedopočítává. Každý den je uložená nejnižší cena dne.
// Výsledek je popis minulosti, ne předpověď: „za dobu měření byla ve slevě N×“, ne „za týden bude sleva“.

const DEN = 86400e3;
const msDne = (den) => Date.parse(den + "T12:00:00Z");
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };

// radky: [{ den: "YYYY-MM-DD", cena, sleva }] seřazené podle dne. ted: aktuální { cena, sleva, zdarma }.
export function rozborCen(radky, ted = {}, cas = Date.now()) {
  const r = (radky || []).filter((x) => x && x.den && Number.isFinite(Number(x.cena))).map((x) => ({ den: x.den, cena: Number(x.cena), sleva: Number(x.sleva) || 0 }));
  if (!r.length) return null;
  const od = r[0].den;
  const dni = Math.max(0, Math.round((cas - msDne(od)) / DEN));
  const min = Math.min(...r.map((x) => x.cena));
  const minDen = [...r].reverse().find((x) => x.cena === min)?.den || null;
  // Slevová období: souvislé záznamy se slevou (mezera v záznamech delší než 3 dny období ukončí).
  const obdobi = [];
  let akt = null, pred = null;
  for (const x of r) {
    const navazuje = pred && msDne(x.den) - msDne(pred.den) <= 3 * DEN;
    if (x.sleva > 0) {
      if (akt && navazuje) { akt.do = x.den; akt.sleva = Math.max(akt.sleva, x.sleva); akt.cena = Math.min(akt.cena, x.cena); }
      else { akt = { od: x.den, do: x.den, sleva: x.sleva, cena: x.cena }; obdobi.push(akt); }
    } else akt = null;
    pred = x;
  }
  const cena = Number.isFinite(Number(ted.cena)) ? Number(ted.cena) : r[r.length - 1].cena;
  const sleva = Number(ted.sleva) || 0;
  const probiha = sleva > 0 && obdobi.length && obdobi[obdobi.length - 1].do === r[r.length - 1].den;
  const minula = probiha ? obdobi.slice(0, -1) : obdobi;
  const levneji = [...r].reverse().find((x) => x.cena < cena - 0.005)?.den || null;
  const vysledek = {
    od, dni, zaznamu: r.length, min, min_den: minDen, slevovych_obdobi: obdobi.length,
    obvykla_sleva: median(obdobi.map((o) => o.sleva)), nejvetsi_sleva: obdobi.length ? Math.max(...obdobi.map((o) => o.sleva)) : 0,
    posledni_sleva: minula.length ? minula[minula.length - 1].do : null, naposledy_levneji: levneji,
    nejnizsi_ted: cena <= min + 0.005, verdikt: null,
  };
  // Slovní shrnutí – vždy s tím, od kdy měříme. Pravidla jsou pevná (nepíše je AI).
  if (ted.zdarma || cena === 0) vysledek.verdikt = { druh: "zdarma" };
  else if (dni < 30) vysledek.verdikt = { druh: "malo" };
  else if (sleva > 0 && vysledek.nejnizsi_ted) vysledek.verdikt = { druh: "nejnizsi" };
  else if (sleva > 0) vysledek.verdikt = { druh: "sleva" };
  else if (obdobi.length) vysledek.verdikt = { druh: "pockat" };
  else vysledek.verdikt = { druh: "bez" };
  return vysledek;
}
