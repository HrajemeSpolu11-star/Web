# Pokyny pro AI asistenta (Claude) v tomto repozitáři

Projekt **Herní puls** – český web s herními novinkami a přehledem českých streamerů (Twitch + Kick).
Majitel: Michal (GitHub `HrajemeSpolu11-star`). Komunikace **vždy česky**.

**Než začneš, přečti `docs/PRO-NOVY-CHAT.md`.** Tam je kontext, stav a rozhodnutí.

## Pravidla
0. **Z toho, co je hotové, se nic nemaže.** Žádná hotová funkce, stránka, sekce, text, data ani vzhled se neodstraní
   ani nenahradí bez výslovného souhlasu uživatele. Úpravy se dělají přidáním nebo vylepšením, ne odebráním.
   Když je změna vzhledu velká (logo, barvy, rozložení), nejdřív ukaž návrh(y) a počkej na schválení – teprve pak měň.
   Když je něco potřeba kvůli chybě odebrat, napiš to uživateli předem a zapiš do `CHANGELOG.md`.
1. **`CHANGELOG.md` se nikdy nemaže ani nepřepisuje.** Každou změnu zapiš jako nový záznam nahoru.
2. **Nespouštěj zbytečně testy** a nespotřebovávej GitHub Actions – projekt žádné Actions nepoužívá a mít je nemá.
   Stačí `node --check` na změněné soubory; vizuální kontrolu dělej jen u větších změn vzhledu.
3. **Tajné klíče nikdy do repozitáře ani do chatu.** Patří do Cloudflare (Worker `web` → Settings → Runtime variables and secrets → Secret).
   Veřejná ID (Twitch/Kick Client ID) jsou ve `wrangler.jsonc`. Stejný název nesmí být zároveň ve `vars` a jako Secret.
4. **Bezpečnost**: veškerý text z databáze/API se do HTML vkládá přes `esc()`, odkazy přes `bezpecnaUrl()`/`https()`,
   SQL jen přes `.bind()`. Žádné inline skripty ani styly (CSP je přísná – viz `public/_headers`); barvy a šířky se nastavují přes JS (CSSOM).
5. **Limity Cloudflare Free**: 50 podrequestů a 10 ms CPU na běh, D1 ~100 tis. zápisů řádků denně, 5 Cron Triggerů.
   Při každé změně sběru spočítej požadavky a zápisy (viz `docs/ARCHITEKTURA.md`).
6. **Přesnost dat o streamerech**: čísla jen z oficiálních API, nic nedomýšlet; u lidí jen veřejné profesní informace.
7. **Web se otevřeně hlásí jako AI web** (uvítací karta, štítek, `/o-webu`). Nic nepřikrašluj, AI články vždy označuj.
8. Nasazení: push do `main` → Cloudflare Workers Builds nasadí samo (bez build kroku). Commity piš česky.
9. Uživatel pracuje z mobilu – návody piš krok za krokem, krátce, s přesnými názvy tlačítek.

## Rychlá orientace
- `src/` – Cloudflare Worker (API, sběr, AI, SEO, push). Vstup: `src/index.js`.
- `public/` – statický web (SPA bez frameworku): `index.html`, `js/app.js`, `css/style.css`, admin v `public/admin/`.
- `wrangler.jsonc` – nastavení Workeru, D1, Cronů, proměnných.
- `docs/` – podrobná dokumentace.
- `public/js/jazyk.js` – překlad rozhraní do SK/EN. **Každý nový text v rozhraní doplň i sem** (SLOVNIK nebo FRAZE).
  Kontrola: `python3 tools/testovaci-server.py &` a `python3 tools/kontrola-prekladu.py en` (a `sk`) – vypíše, co zůstalo česky.
  Data formátuj přes `LOC` (ne napevno "cs-CZ").
