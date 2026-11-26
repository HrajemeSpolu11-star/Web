// Doplňkové údaje k profilu Twitch streamera: rozvrh, klipy a záznamy vysílání (z Twitch API, mezipaměť 1 h).
// Záznamy (VOD, type=archive) dávají skutečnou historii vysílání i před začátkem našeho měření – ale jen pokud je
// streamer ukládá a jen po dobu, kterou je Twitch drží (partneři 60 dní, affiliate 14 dní, ostatní 7 dní).
import { token, helix } from "./twitch.js";

export async function extraTwitch(env, userId) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return { rozvrh: [], klipy: [], vysilani: null };
  let tok = await token(env);
  const volej = async (c) => {
    try { return await helix(env, c, tok); }
    catch (e) { if (e.kod !== 401) throw e; tok = await token(env, true); return helix(env, c, tok); }
  };
  const od = new Date(Date.now() - 30 * 86400e3).toISOString();
  const [rozvrh, klipy, videa] = await Promise.allSettled([
    volej(`/schedule?broadcaster_id=${encodeURIComponent(userId)}&first=10`),
    volej(`/clips?broadcaster_id=${encodeURIComponent(userId)}&first=6&started_at=${encodeURIComponent(od)}`),
    volej(`/videos?user_id=${encodeURIComponent(userId)}&type=archive&first=100`),
  ]);
  // Délka záznamu „3h21m10s“ → minuty.
  const minuty = (d) => { const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(String(d || "")); return m ? (+m[1] || 0) * 60 + (+m[2] || 0) + (+m[3] || 0) / 60 : 0; };
  const odMs = Date.now() - 30 * 86400e3;
  const zaznamy = videa.status === "fulfilled" ? (videa.value.data || []).filter((v) => Date.parse(v.created_at) >= odMs) : [];
  const https = (u) => /^https:\/\//.test(String(u || "")) ? String(u) : "";
  return {
    // Twitch vrací 404, pokud streamer rozvrh nemá – pak je prostě prázdný.
    rozvrh: rozvrh.status === "fulfilled"
      ? (rozvrh.value.data?.segments || []).filter((s) => !s.canceled_until).slice(0, 10).map((s) => ({
          zacatek: s.start_time, konec: s.end_time, nazev: String(s.title || "").slice(0, 140), hra: s.category?.name || "",
        }))
      : [],
    klipy: klipy.status === "fulfilled"
      ? (klipy.value.data || []).map((k) => ({
          url: https(k.url), nahled: https(k.thumbnail_url), nazev: String(k.title || "").slice(0, 140),
          zhlednuti: k.view_count || 0, delka: Math.round(k.duration || 0), vytvoreno: k.created_at,
        })).filter((k) => k.url)
      : [],
    vysilani: videa.status === "fulfilled" ? {
      hodin: Math.round(zaznamy.reduce((a, v) => a + minuty(v.duration), 0) / 60),
      pocet: zaznamy.length,
      nejstarsi: zaznamy.length ? zaznamy[zaznamy.length - 1].created_at : null,
      posledni: zaznamy.slice(0, 10).map((v) => ({ nazev: String(v.title || "").slice(0, 140), zacatek: v.created_at, minut: Math.round(minuty(v.duration)),
        zhlednuti: v.view_count || 0, url: https(v.url) })),
    } : null,
  };
}
