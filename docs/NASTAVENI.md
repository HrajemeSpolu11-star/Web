# Nastavení a klíče

## Kde co je
- **Veřejné nastavení** – `wrangler.jsonc` → `vars` (mění se commitem): `PUBLIKOVAT`, `CLANKU_DENNE`, `HODINY`,
  `GROQ_MODEL`, `CF_MODEL`, `TWITCH_CLIENT_ID`, `KICK_CLIENT_ID`, `SITE_URL`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`.
- **Tajné klíče** – Cloudflare → Workers & Pages → **web** → Settings → **Runtime variables and secrets** → Add variable → typ **Secret**.
  ⚠️ Ne do sekce *Build → Variables and secrets* (ty Worker nevidí).
  ⚠️ Stejný název nesmí být zároveň ve `vars` i jako Secret (nasazení by selhalo).

| Secret | K čemu | Stav |
|---|---|---|
| `TWITCH_CLIENT_SECRET` | Twitch API | nastaveno |
| `KICK_CLIENT_SECRET` | Kick API | nastaveno |
| `GROQ_API_KEY` | AI psaní (Groq) | nenastaveno |
| `DISCORD_WEBHOOK_URL` | Oznámení nových článků na Discord | nenastaveno (nepovinné) |
| `ADMIN_EMAIL` | Dodatečná kontrola e-mailu v adminu | nepovinné |

## Twitch aplikace
dev.twitch.tv/console → Aplikace „Herniplus“ → Client ID ve `wrangler.jsonc`, nové heslo = `TWITCH_CLIENT_SECRET`.
Redirect URL: `https://web.hrajemespolu11.workers.dev` (nepoužívá se, přihlašuje se přes client credentials).

## Kick aplikace
https://kick.com/settings/developer → Client ID ve `wrangler.jsonc`, Client Secret = `KICK_CLIENT_SECRET`.

## Discord oznámení
Server → Nastavení kanálu → Integrace → Webhooky → Nový webhook → zkopírovat adresu → Secret `DISCORD_WEBHOOK_URL`.

## Admin přes Cloudflare Access (až bude vlastní doména)
1. Doména převedená na Cloudflare, Worker na ní (Settings → Domains & Routes → Custom domain).
2. Zero Trust → Access → Applications → Self-hosted: cesty `/admin*` a `/api/admin/*`, politika „Allow“ jen pro tvůj e-mail.
3. Z aplikace zkopírovat **Application Audience (AUD) tag** → `ACCESS_AUD`, týmovou doménu (`něco.cloudflareaccess.com`) → `ACCESS_TEAM_DOMAIN` ve `wrangler.jsonc`.
4. `SITE_URL` přepsat na novou doménu.

## Přejmenování webu
Název je v `public/js/config.js` (`nazev`), v `src/seo.js` (`NAZEV`), v `public/index.html`, `o-webu.html`, `soukromi.html` a admin.
