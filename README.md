# Herní puls (pracovní název)

Automatický web s herními novinkami a přehledem českých a slovenských streamerů.

**Stav:** testovací verze – všechna data jsou smyšlená ukázka.

## Struktura

- `public/` – statický web (HTML, CSS, JS), `public/_headers` = bezpečnostní hlavičky
- `src/index.js` – Cloudflare Worker: API (`/api/clanky`, `/api/clanek/:id`, `/api/stav`)
- `src/sber.js` – sběrač novinek (Cron každých 15 min, jen zprávy mladší 12 h)
- `src/rss.js` – parser RSS/Atom
- `src/zdroje.js` – seznam RSS zdrojů
- `wrangler.jsonc` – nastavení Workeru, databáze D1 a Cronu

## Plán

1. ✅ Testovací web (tento krok)
2. ✅ Sběrač RSS + filtr čerstvosti (Cloudflare Worker + D1)
3. Automatické psaní článků AI, režim se schvalováním
4. Streameři z Twitch a YouTube API
5. Vlastní doména, automatické sdílení na sítě

## Spuštění

Cloudflare nasazuje automaticky po každém pushi do `main`. Build se neprovádí,
Worker nemá žádné npm závislosti. Stav sběru: `/api/stav`.
