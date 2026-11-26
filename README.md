# Herní puls (pracovní název)

Automatický web s herními novinkami a přehledem českých a slovenských streamerů.

**Stav:** testovací verze – všechna data jsou smyšlená ukázka.

## Struktura

- `index.html` – stránka webu
- `css/style.css` – vzhled
- `js/config.js` – nastavení (název webu, adresa API)
- `js/app.js` – logika webu (novinky, článek, živě, streameři)
- `data/` – testovací data, později je nahradí API z Cloudflare Workeru

## Plán

1. ✅ Testovací web (tento krok)
2. Sběrač RSS + filtr čerstvosti (Cloudflare Worker + D1)
3. Automatické psaní článků AI, režim se schvalováním
4. Streameři z Twitch a YouTube API
5. Vlastní doména, automatické sdílení na sítě

## Spuštění

Web nepotřebuje žádný build. Stačí zapnout GitHub Pages
(Settings → Pages → Deploy from a branch → `main` / root).
