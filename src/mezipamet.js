// Sdílená mezipaměť v D1 pro drahé souhrny (Přehled, Co hraje Česko, Týden na scéně, počty streamerů u her).
// Mezipaměť Cloudflare (caches.default) je zvlášť v každém datacentru, takže při větší návštěvnosti z více míst se drahý
// výpočet opakuje. Tady se výsledek uloží do jednoho řádku v D1: další požadavky ho čtou (1 řádek) a výpočet proběhne
// nejvýš jednou za `maxMs` bez ohledu na počet návštěvníků (zátěžový test 2026-11-27).
// Ochrana proti náporu: když data zestárnou, přepočítá je jen jeden požadavek (zámek v D1), ostatní mezitím dostanou
// poslední uložená data. Souběžné požadavky ve stejné instanci Workeru čekají na jeden společný výpočet.
// (Bez toho 100 souběžných návštěv Přehledu = 64 výpočtů a 5,7 mil. přečtených řádků – víc než denní limit D1 Free.)
const SCHEMA = "CREATE TABLE IF NOT EXISTS mezipamet (klic TEXT PRIMARY KEY, data TEXT NOT NULL, cas INTEGER NOT NULL, zamek INTEGER)";
const ZAMEK_MS = 60e3;
let hotovo = false;
const bezi = new Map();

async function zajisti(db) {
  if (hotovo) return;
  await db.prepare(SCHEMA).run();
  const { results } = await db.prepare("PRAGMA table_info(mezipamet)").all();
  if (!results.some((c) => c.name === "zamek")) await db.prepare("ALTER TABLE mezipamet ADD COLUMN zamek INTEGER").run();
  hotovo = true;
}

export async function zMezipameti(db, klic, maxMs, vypocet) {
  if (bezi.has(klic)) return bezi.get(klic);
  // Když mezipaměť nejde založit (např. vyčerpaný denní limit zápisů D1), spočítá se výsledek přímo – web nesmí spadnout.
  try { await zajisti(db); } catch (e) { console.warn("mezipaměť nedostupná:", String(e?.message || e)); return vypocet(); }
  const ted = Date.now();
  const r = await db.prepare("SELECT data, cas, zamek FROM mezipamet WHERE klic = ?").bind(klic).first().catch(() => null);
  let stara = null;
  if (r) { try { stara = JSON.parse(r.data); } catch { /* přepočítat */ } }
  if (stara !== null && ted - r.cas < maxMs) return stara;
  if (stara !== null) {
    // Zestárlá data: přepočítá jen ten, kdo získá zámek; ostatní hned dostanou poslední verzi.
    const z = await db.prepare("UPDATE mezipamet SET zamek = ? WHERE klic = ? AND (zamek IS NULL OR zamek < ?)").bind(ted, klic, ted - ZAMEK_MS).run().catch(() => null);
    if (!z?.meta?.changes) return stara;
  }
  const p = (async () => {
    try {
      const data = await vypocet();
      await db.prepare("INSERT OR REPLACE INTO mezipamet (klic, data, cas, zamek) VALUES (?, ?, ?, NULL)").bind(klic, JSON.stringify(data), Date.now()).run().catch(() => {});
      return data;
    } catch (e) {
      // Výpočet selhal: uvolnit zámek a vrátit poslední data, pokud nějaká jsou.
      await db.prepare("UPDATE mezipamet SET zamek = NULL WHERE klic = ?").bind(klic).run().catch(() => {});
      if (stara !== null) return stara;
      throw e;
    } finally { bezi.delete(klic); }
  })();
  bezi.set(klic, p);
  return p;
}
