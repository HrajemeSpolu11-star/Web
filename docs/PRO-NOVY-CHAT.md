# Podklady pro nový chat (předání projektu)

Tento dokument vlož (nebo odkaž) na začátek nového chatu s AI. Obsahuje vše podstatné, aby se dalo
navázat bez čtení celé historie. **Aktualizuj ho, když se změní stav nebo rozhodnutí.**

## Kdo, co, kde
- **Majitel:** Michal, Česko. Píše česky, pracuje hlavně z **mobilu**. GitHub: `HrajemeSpolu11-star`.
- **Projekt:** Herní puls (pracovní název, dá se změnit v `public/js/config.js` a v `src/seo.js`).
- **Repo:** `HrajemeSpolu11-star/Web` (dříve `web`).
- **Web běží na:** https://web.hrajemespolu11.workers.dev (Cloudflare Worker `web`). Vlastní doména zatím **není**.
- **Databáze:** Cloudflare D1 `herni-puls-db`, id `c2962ce9-e393-4606-8734-b517dff06679`.
- **Nasazení:** push do `main` → Cloudflare Workers Builds nasadí automaticky. Žádné GitHub Actions.

## Co web umí (stav k 2026-11-26)
1. **Novinky** – sběr z RSS (14 zdrojů, `src/zdroje.js`) každých 15 min, jen zprávy mladší 12 h.
   Přepínač České weby / Ze zahraničí, kategorie, platformy, hledání. RSS zprávy odkazují na původní článek
   a mají `noindex`. České zdroje (Games.cz, Zing, Hrej, Doupě, Spite, Gaming Professors, PCTuning) ověřené 26. 11. 2026.
2. **Streameři** (Twitch + Kick, jen čeština) – sběr každých 15 min z oficiálních API:
   - Živě (karty, „živé bubliny“, kategorie, malí streameři, „Teď se děje“, hledání, přepínač platformy)
   - Žebříček (sledující, rekord diváků, hodiny za 30 dní, růst za 30 dní)
   - Hry (`/hry`, `/hra/:slug`), Přehled (`/prehled` – graf scény, týden, milníky, kalendář)
   - Profil (`/streamer/:platforma/:login`) – statistiky, graf, hry, rozvrh a klipy (Twitch), odkazy na sítě,
     oblíbení, upozornění „je živě“, porovnání (`/porovnat`).
3. **AI web** – uvítací karta, štítek „AI web“, stránka `/o-webu`. Web se otevřeně hlásí jako dělaný AI.
4. **AI psaní článků** – připravené (`src/psani.js`): 5 článků denně, kontrola faktů. **Aktuálně píše jen záložní
   Cloudflare Workers AI** (bez klíče). Groq nefungoval (přihlášení do Groq konzole se zacyklilo).
   Probírané varianty: OpenRouter (zdarma 50 požadavků/den), Claude Haiku (placené, ~8 Kč/měsíc). Uživatel řekl „AI zatím necháme“.
5. **Admin** `/admin` – editor článků, fronta ke schválení, správa streamerů (skrýt, ověřit, odkazy).
   **Je zamčený**, dokud se nenastaví Cloudflare Access → to čeká na **vlastní doménu** (Access na `workers.dev`
   by zamkl celý web). Alternativa: vlastní přihlášení heslem + TOTP (nerozhodnuto).
6. **Bezpečnost** – přísná CSP, bezpečné SQL, escapování, žádné cookies ani sledování.

## Nastavené tajné klíče (Cloudflare → Worker `web` → Settings → Runtime variables and secrets)
- `TWITCH_CLIENT_SECRET` ✅ (Client ID je ve `wrangler.jsonc`)
- `KICK_CLIENT_SECRET` ✅ (Client ID je ve `wrangler.jsonc`)
- `GROQ_API_KEY` ❌, `DISCORD_WEBHOOK_URL` ❌ (nepovinné)
- Pozor: uživatel jednou omylem dal proměnné do sekce **Build** – ty Worker nevidí.

## Rozhodnutí a přání uživatele (důležité)
- Streameři se mají ukazovat **hned**, bez čekání na počet streamů; živí nahoře.
- Data o streamerech musí být **naprosto přesná** – jen z oficiálních API, nic nedomýšlet.
- Horní menu jen **Novinky** a **Streameři**; vše o streamerech a hrách pod Streamery.
- Vzhled **přívětivý**: indigová noc, mango akcent, písmo Rubik, kulaté tvary (viz komentář v `css/style.css`).
- **Herní prvky** (EKG logo, achievementy, animace) – vždy střídmě a s vypnutím pro „omezit pohyb“.
- Web má jasně říkat, že je **AI web**, a prosit o chvilku pozornosti a důvěry.
- **Šetřit limity** (Actions, testy, chat). Vlastní doména až později.
- AI články: nekopírovat cizí texty, vždy uvádět zdroje, cizí fotky nepoužívat.

## Kde hledat co
| Co | Soubor |
|---|---|
| Vstup Workeru, API, routování | `src/index.js` |
| Sběr RSS | `src/sber.js`, `src/rss.js`, `src/zdroje.js` |
| Twitch / Kick | `src/twitch.js`, `src/kick.js`, `src/extra.js` |
| Přehled, milníky, kalendář | `src/prehled.js` |
| Upozornění (push) | `src/push.js`, `public/sw.js` |
| AI psaní | `src/psani.js`, `src/ai.js` |
| Admin | `src/admin.js`, `src/access.js`, `public/admin/` |
| SEO, sitemap | `src/seo.js` |
| Web (frontend) | `public/js/app.js`, `public/css/style.css`, `public/index.html` |

Podrobnosti: `docs/ARCHITEKTURA.md`, `docs/API.md`, `docs/DATABAZE.md`, `docs/NASTAVENI.md`, `docs/PROVOZ.md`.

## Hlavní stránka (od 2026-11-26)
- `/` = Domů: herní katalog ze Steamu, Epicu a GOGu (`src/katalog.js`, Cron `25 * * * *`, `/api/katalog`). Novinky jsou na `/novinky`.
- Menu: Domů · Novinky · Streameři. Uživatel chtěl na hlavní stránce obsah o hrách a herní scéně, ne o streamerech.

## Rozpracované / další možné kroky
- Vlastní doména → Cloudflare Access pro admin (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` ve `wrangler.jsonc`).
- Konzolista.cz a BonusWeb – RSS se nepodařilo ověřit (Konzolista vrací chybu, BonusWeb blokuje).
- Vybrat AI pro psaní článků (OpenRouter / Claude Haiku) a doplnit podporu v `src/ai.js`.
- Nápady na odlišení webu – viz `docs/NAPADY.md`.

## Jak s uživatelem pracovat
- Krátké odpovědi, kroky s přesnými názvy tlačítek (je na mobilu, často posílá screenshoty).
- Když něco nastavuje v Cloudflare, ať pošle screenshot a ověř podle něj.
- Na web `workers.dev` se z prostředí AI nedá přistoupit (proxy blokuje) – stav ověřuj přes screenshot `/api/stav`.
