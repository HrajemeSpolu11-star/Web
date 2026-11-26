// Doplňkové údaje k profilu Twitch streamera: rozvrh a klipy (z Twitch API, mezipaměť 1 h).
import { token, helix } from "./twitch.js";

export async function extraTwitch(env, userId) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return { rozvrh: [], klipy: [] };
  let tok = await token(env);
  const volej = async (c) => {
    try { return await helix(env, c, tok); }
    catch (e) { if (e.kod !== 401) throw e; tok = await token(env, true); return helix(env, c, tok); }
  };
  const od = new Date(Date.now() - 30 * 86400e3).toISOString();
  const [rozvrh, klipy] = await Promise.allSettled([
    volej(`/schedule?broadcaster_id=${encodeURIComponent(userId)}&first=10`),
    volej(`/clips?broadcaster_id=${encodeURIComponent(userId)}&first=6&started_at=${encodeURIComponent(od)}`),
  ]);
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
  };
}
