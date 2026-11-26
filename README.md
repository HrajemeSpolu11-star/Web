# Herní puls (pracovní název)

Automatický web s herními novinkami a přehledem českých a slovenských streamerů.

**Stav:** testovací verze – všechna data jsou smyšlená ukázka.

## Struktura

- `public/` – statický web (HTML, CSS, JS), `public/_headers` = bezpečnostní hlavičky
- `src/index.js` – Cloudflare Worker: API (`/api/clanky`, `/api/clanek/:id`, `/api/stav`)
- `src/sber.js` – sběrač novinek (Cron každých 15 min, jen zprávy mladší 12 h)
- `src/rss.js` – parser RSS/Atom
- `src/zdroje.js` – seznam RSS zdrojů
- `src/twitch.js`, `src/kick.js` – sběr českých streamerů z Twitche a Kicku (každých 15 min)
- `src/extra.js` – rozvrh a klipy z Twitche
- `src/seo.js` – skutečné adresy s meta tagy, `sitemap.xml`, `robots.txt`
- `src/discord.js` – oznámení nových článků na Discord
- `src/psani.js` – AI psaní článků (výběr tématu, kontrola faktů, 5 článků denně)
- `src/ai.js` – volání AI (Groq, záloha Workers AI)
- `src/admin.js`, `src/access.js` – admin API a ověření přihlášení přes Cloudflare Access
- `public/admin/` – administrace s editorem (`/admin`)
- `wrangler.jsonc` – nastavení Workeru, databáze D1 a Cronu

## Plán

1. ✅ Testovací web (tento krok)
2. ✅ Sběrač RSS + filtr čerstvosti (Cloudflare Worker + D1)
3. ✅ Automatické psaní článků AI + admin s editorem
4. ✅ Čeští streameři z Twitch API (živě, žebříčky, profily) · YouTube později
5. Vlastní doména, automatické sdílení na sítě

## Spuštění

Cloudflare nasazuje automaticky po každém pushi do `main`. Build se neprovádí,
Worker nemá žádné npm závislosti. Stav sběru: `/api/stav`.

## Nastavení v Cloudflare (jednorázově)

- **Secret `KICK_CLIENT_SECRET`** – Kick aplikace (Client ID je ve `wrangler.jsonc`)
- **Secret `DISCORD_WEBHOOK_URL`** (nepovinné) – oznámení nových článků
- **Secret `TWITCH_CLIENT_SECRET`** – Twitch aplikace (Client ID je ve `wrangler.jsonc`)
- **Secret `GROQ_API_KEY`** – Worker → Settings → Variables and Secrets (nikdy ne do repozitáře)
- **Cloudflare Access** pro `/admin` a `/api/admin/*` – pak doplnit `ACCESS_TEAM_DOMAIN` a `ACCESS_AUD` do `wrangler.jsonc`
- Bez Access je admin zamčený pro všechny.
