// Pomocník pro „INDEXED BY“: nápověda indexu se použije jen tehdy, když index v databázi opravdu existuje.
// Kdyby chyběl, dotaz s INDEXED BY by skončil chybou „no such index“ (oprava 2026-11-27: index snímků podle dne
// se na ostré databázi nesměl automaticky zakládat – založení počítá zápis za každý existující řádek a spotřebovalo
// by denní limit zápisů D1 Free).
let indexy = null, cas = 0;
export async function maIndex(db, nazev) {
  if (!indexy || Date.now() - cas > 600e3) {
    try {
      const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all();
      indexy = new Set(results.map((r) => r.name)); cas = Date.now();
    } catch { indexy = new Set(); cas = Date.now(); }
  }
  return indexy.has(nazev);
}
export async function napoveda(db, nazev) { return (await maIndex(db, nazev)) ? `INDEXED BY ${nazev}` : ""; }
