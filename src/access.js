// Ověření přihlášení přes Cloudflare Access (JWT v hlavičce Cf-Access-Jwt-Assertion).
// Pokud Access ještě není nastavený (ACCESS_TEAM_DOMAIN / ACCESS_AUD), admin je zamčený pro všechny.

let certCache = { team: "", keys: [], do: 0 };

function b64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
}
const jsonZ = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

async function klice(team, obnovit = false) {
  if (!obnovit && certCache.team === team && certCache.do > Date.now()) return certCache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error("certs " + r.status);
  const { keys } = await r.json();
  certCache = { team, keys: keys || [], do: Date.now() + 3600e3 };
  return certCache.keys;
}

export async function overAdmina(request, env) {
  const team = String(env.ACCESS_TEAM_DOMAIN || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const aud = String(env.ACCESS_AUD || "").trim();
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(team) || !aud) return { ok: false, duvod: "Admin ještě není nastavený (chybí Cloudflare Access)." };

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { ok: false, duvod: "Nejsi přihlášený." };
  try {
    const [h, p, s] = token.split(".");
    const hlava = jsonZ(h), obsah = jsonZ(p);
    if (hlava.alg !== "RS256") throw new Error("alg");
    let jwk = (await klice(team)).find((k) => k.kid === hlava.kid);
    if (!jwk) jwk = (await klice(team, true)).find((k) => k.kid === hlava.kid);
    if (!jwk) throw new Error("kid");
    const klic = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const platny = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", klic, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    if (!platny) throw new Error("podpis");
    const ted = Date.now() / 1000;
    const auds = Array.isArray(obsah.aud) ? obsah.aud : [obsah.aud];
    if (!auds.includes(aud)) throw new Error("aud");
    if (!obsah.exp || obsah.exp < ted) throw new Error("exp");
    if (obsah.iss !== `https://${team}`) throw new Error("iss");
    if (env.ADMIN_EMAIL && String(obsah.email || "").toLowerCase() !== String(env.ADMIN_EMAIL).toLowerCase()) throw new Error("email");
    return { ok: true, email: obsah.email || "" };
  } catch (e) {
    return { ok: false, duvod: "Přihlášení je neplatné." };
  }
}
