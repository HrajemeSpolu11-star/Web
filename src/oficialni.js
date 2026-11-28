// Oficiální herní kanály na Twitchi (PlayStation, Xbox, Nintendo, The Game Awards, IGN…):
//  • kdo z nich právě vysílá (1 požadavek, sdílená mezipaměť 3 min → nejvýš ~480 požadavků a zápisů denně),
//  • jednorázové ohlášené přenosy z jejich oficiálního rozvrhu na Twitchi (Get Channel Stream Schedule) –
//    1 + počet kanálů požadavků jednou za 6 h. Opakované týdenní pořady se vynechávají, berou se jen jednorázové přenosy.
// Kanál, který na Twitchi neexistuje, Twitch prostě nevrátí – nic se nerozbije.
import { token, helix } from "./twitch.js";
import { zMezipameti } from "./mezipamet.js";

export const KANALY = [
  ["playstation", "PlayStation"], ["xbox", "Xbox"], ["nintendo", "Nintendo"], ["thegameawards", "The Game Awards"],
  ["ign", "IGN"], ["gamespot", "GameSpot"], ["ubisoft", "Ubisoft"], ["bethesda", "Bethesda"], ["riotgames", "Riot Games"],
  ["blizzard", "Blizzard"], ["gamescom", "gamescom"], ["summergamefest", "Summer Game Fest"],
];
const JMENA = new Map(KANALY);
const txt = (s, max = 140) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function sHelix(env, cesta) {
  let tok = await token(env);
  try { return await helix(env, cesta, tok); }
  catch (e) { if (e.kod !== 401) throw e; tok = await token(env, true); return helix(env, cesta, tok); }
}

async function ziveTed(env) {
  const q = KANALY.map(([l]) => `user_login=${encodeURIComponent(l)}`).join("&");
  const d = await sHelix(env, `/streams?${q}&type=live&first=20`);
  return (d.data || []).map((s) => ({
    login: String(s.user_login || "").toLowerCase(), jmeno: JMENA.get(String(s.user_login || "").toLowerCase()) || txt(s.user_name, 40),
    titulek: txt(s.title), hra: txt(s.game_name, 80), divaci: Number(s.viewer_count) || 0, od: s.started_at || null,
    nahled: String(s.thumbnail_url || "").replace("{width}", "440").replace("{height}", "248"),
  })).filter((s) => /^[a-z0-9_]{2,25}$/.test(s.login));
}

async function planPrenosu(env) {
  const u = await sHelix(env, `/users?${KANALY.map(([l]) => `login=${encodeURIComponent(l)}`).join("&")}`);
  const ted = Date.now(), za30 = ted + 30 * 86400e3;
  const casti = await Promise.allSettled((u.data || []).map((x) => sHelix(env, `/schedule?broadcaster_id=${encodeURIComponent(x.id)}&first=10`)
    .then((d) => ({ login: String(x.login).toLowerCase(), d }))));
  const plan = [];
  for (const c of casti) {
    if (c.status !== "fulfilled") continue; // kanál bez rozvrhu vrací 404
    const { login, d } = c.value;
    let n = 0;
    for (const s of d?.data?.segments || []) {
      const od = Date.parse(s.start_time);
      if (s.is_recurring || s.canceled_until || !od || od < ted - 3 * 3600e3 || od > za30 || n >= 3) continue;
      n++;
      plan.push({ login, jmeno: JMENA.get(login) || login, nazev: txt(s.title) || `Přenos ${JMENA.get(login) || login}`, od: s.start_time,
        do: s.end_time || null, hra: txt(s.category?.name, 80) });
    }
  }
  return plan.sort((a, b) => Date.parse(a.od) - Date.parse(b.od));
}

export async function apiOficialni(env) {
  const [zive, plan] = await Promise.all([
    zMezipameti(env.DB, "oficialni_zive", 3 * 60e3, () => ziveTed(env)).catch(() => []),
    zMezipameti(env.DB, "oficialni_plan", 6 * 3600e3, () => planPrenosu(env)).catch(() => []),
  ]);
  return { zive, plan, kanaly: KANALY.map(([login, jmeno]) => ({ login, jmeno })), cas: new Date().toISOString() };
}

// Pro kalendář akcí: ohlášené přenosy jako akce s odpočtem.
export async function prenosyJakoAkce(env) {
  const plan = await zMezipameti(env.DB, "oficialni_plan", 6 * 3600e3, () => planPrenosu(env)).catch(() => []);
  return plan.map((p) => ({ id: `tw-${p.login}-${p.od}`, nazev: `${p.jmeno}: ${p.nazev}`, typ: "prenos", od: p.od, do: p.do,
    misto: "živě na Twitchi", popis: p.hra ? `Kategorie: ${p.hra}` : "Ohlášený přenos z oficiálního kanálu.",
    zdroj: `https://www.twitch.tv/${p.login}/schedule`, web: `https://www.twitch.tv/${p.login}`, twitch: p.login }));
}
