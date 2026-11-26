// Deník AI a stav systému: každá automatická úloha zapíše po doběhnutí jednu větu, co udělala (nebo jakou měla chybu).
// Stránka /stav z toho ukazuje, jestli všechno běží – je to zároveň jednoduché hlídání chodu webu.
// Zápisy: ~1 řádek na běh úlohy (~250 denně), drží se 7 dní.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS denik (id INTEGER PRIMARY KEY AUTOINCREMENT, cas INTEGER NOT NULL, uloha TEXT NOT NULL, ok INTEGER NOT NULL, text TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_denik_uloha ON denik(uloha, cas)`,
];
let hotovo = false;
async function schema(db) {
  if (hotovo) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  hotovo = true;
}

// Úlohy, jak často mají běžet (min) a jak se jmenují pro lidi.
export const ULOHY = {
  rss: { nazev: "Novinky z herních webů", interval: 15 },
  twitch: { nazev: "Streameři na Twitchi", interval: 15 },
  kick: { nazev: "Streameři na Kicku", interval: 15 },
  katalog: { nazev: "Obchody Steam, Epic a GOG", interval: 60 },
  obsah: { nazev: "Videa, klipy, ceny a čeština", interval: 60 },
  psani: { nazev: "Psaní článků (AI)", interval: null }, // běží jen v nastavené hodiny a jen s AI klíčem
};

export async function zapis(db, uloha, ok, text) {
  await schema(db);
  await db.prepare("INSERT INTO denik (cas, uloha, ok, text) VALUES (?, ?, ?, ?)").bind(Date.now(), uloha, ok ? 1 : 0, String(text || "").slice(0, 300)).run();
}

// Spustí úlohu a zapíše výsledek do deníku. popis(v) vrátí větu, nebo null = nezapisovat (např. „nic k práci“).
export async function behUlohy(env, uloha, fn, popis) {
  try {
    const v = await fn();
    const text = popis(v);
    if (text) await zapis(env.DB, uloha, true, text);
    return v;
  } catch (e) {
    console.error(uloha + ":", e);
    await zapis(env.DB, uloha, false, `Chyba: ${String(e?.message || e).slice(0, 200)}`).catch(() => {});
  }
}

export async function uklidDeniku(db) {
  await schema(db);
  await db.prepare("DELETE FROM denik WHERE cas < ?").bind(Date.now() - 7 * 86400e3).run();
}

// /api/stav-systemu
export async function apiStavSystemu(env) {
  const db = env.DB;
  await schema(db);
  const ted = Date.now();
  const [posl, chyby, log] = await db.batch([
    db.prepare(`SELECT d.uloha, d.cas, d.ok, d.text FROM denik d JOIN (SELECT uloha, MAX(id) AS id FROM denik GROUP BY uloha) m ON m.id = d.id`),
    db.prepare("SELECT uloha, COUNT(*) AS n FROM denik WHERE ok = 0 AND cas > ? GROUP BY uloha").bind(ted - 86400e3),
    db.prepare("SELECT cas, uloha, ok, text FROM denik ORDER BY id DESC LIMIT 60"),
  ]);
  const posledni = new Map(posl.results.map((r) => [r.uloha, r]));
  const chyb = new Map(chyby.results.map((r) => [r.uloha, r.n]));
  const ulohy = Object.entries(ULOHY).map(([id, u]) => {
    const p = posledni.get(id);
    let stav = "neznamy";
    if (p) {
      const stari = (ted - p.cas) / 60e3;
      stav = !p.ok ? "chyba" : u.interval == null ? "ok" : stari <= u.interval * 2.5 ? "ok" : stari <= u.interval * 6 ? "zpozdeni" : "stoji";
    }
    return { id, nazev: u.nazev, interval: u.interval, stav, posledni: p ? new Date(p.cas).toISOString() : null, text: p?.text || "", chyb24: chyb.get(id) || 0 };
  });
  return {
    vse_ok: ulohy.filter((u) => u.interval != null).every((u) => u.stav === "ok"),
    ulohy,
    denik: log.results.map((r) => ({ cas: new Date(r.cas).toISOString(), uloha: r.uloha, nazev: ULOHY[r.uloha]?.nazev || r.uloha, ok: !!r.ok, text: r.text })),
    cas: new Date(ted).toISOString(),
  };
}
