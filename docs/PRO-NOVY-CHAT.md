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
0. **Struktura (od 26. 11. večer)**: menu Domů / Novinky / Hry / Streameři. Domů = rozcestník (ranní přehled, živě, zprávy,
   4 nástroje, jedna hra týdne, týden na scéně, výročí) – **ne katalog obchodů** (uživatel nechce, aby web působil jako prodejní).
   Obchody jsou na `/obchody`. Hry = rozcestník `/pruvodce` se skupinami. Nové: `/ranni`, `/aktualizace`, `/ceska-scena`,
   `/co-hrat`, `/rozjede-se`, `/vyssi-nizsi`. Přání uživatele: nic nezahlcovat, přehlednost přede vším. Rádce pro streamery
   uživatel nechtěl – odstraněn, nevracet.
   **Vzhled „tep“**: slogan „Hry mají tep. My ho měříme.“, pulzující EKG křivky (u streamerů rychlost podle diváků),
   písmo nadpisů Bricolage Grotesque, na mobilu spodní lišta. Uživatel chce moderní, ne strohý web.
   **Na Domů NESMÍ být streameři** (výslovné přání). EKG musí vypadat jako skutečné a tepat klidně (60–130/min).
1. **Novinky** – sběr z RSS (19 zdrojů: 11 zahraničních, 8 českých – `src/zdroje.js`) každých 15 min, jen zprávy mladší 12 h.
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
- **PRAVIDLO: z hotového se nic nemaže** (výslovné přání 27. 11.). Nic hotového neodstraňovat ani nenahrazovat bez souhlasu;
  velké změny vzhledu (logo, barvy, rozložení) nejdřív ukázat jako návrh a počkat na schválení.
- Logo: návrh „přehrávací trojúhelník + EKG“ (27. 11.) uživatel odmítl („hnus“). Pak si sám vybral **herní ovladač s pulzující EKG křivkou** – to je aktuální logo (`.logo-ovladac`, `ikona.svg`). Neměnit bez souhlasu.
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

- Domů má i Hru týdne, Recenze, Klipy týdne a Videa streamerů (`src/obsah.js`, Cron `40`). YouTube kanály se zadávají v adminu u streamera.
- Všech 5 Cronů je obsazeno.

## Herní pas a „Puls her“ (2026-11-27, schváleno podle návrhu ChatGPT, upravené na poctivou verzi)
- **Herní radar** `/radar` (+ 5 položek na Domů „Na radaru“): aktualizace, hry zdarma, nejnižší ceny od začátku měření,
  rekordy streamerů, trendy, vydání, výročí – jen ze sbíraných dat.
- **Herní pas** = stránka hry: pulsometr, cenový radar + graf ceny (až 400 dní), herní DNA, poslední aktualizace, série a DLC (IGDB),
  tlačítko „Porovnat s jinou hrou“.
- **Pulsometr** 0–100 (jak je hra živá, NE jak je dobrá): hráči Steam 30 %, česká scéna 25 %, trend 15 %, aktualizace 20 %, sleva 10 %.
- **Rostoucí a upadající hry** `/trendy` (česká scéna + Steam), **Srovnávač her** `/porovnat-hry`, **Co hrát s přáteli** (`/co-hrat?n=`),
  **cenový radar** na Hlídači. Crossplay se neuvádí (není spolehlivý zdroj).
- **Štítky původu dat** všude: Změřeno námi / Oficiální data / Databáze IGDB / AI souhrn (`/o-webu#stitky`).
- Nedělat (rozhodnuto): uživatelské účty, knihovna/profil/hlasování s účty, česká herní mapa, AI poradce (až na konec),
  „DNA“ vymyšlená AI.

## Databáze her (od 2026-11-27)
`/databaze` + `/databaze/<slug>`: každá hra z IGDB, popis česky (AI, označený), podobné hry, napojení na Steam data.
Další schválený krok, zatím neudělaný: „Sledovat hru“ s upozorněním (vydání, aktualizace, sleva, novinka).

## Navigace (od 2026-11-27)
Lišta: Domů, Novinky, Radar, Slevy, Kalendář, Aktualizace, Hry, Streameři (uživatel chtěl vytáhnout části Hry nahoru).
Mobil: 5 ikon (Domů, Novinky, Radar, Hry, Streameři), třída `jen-pc` u ostatních. Vzhled „herní kanál“: banner `.kanal`
s ikonou a barvou sekce na každé stránce, žádné pásy s viditelným posuvníkem.

## Strategie odlišení (schváleno 2026-11-26)
Vlastní data o české scéně: „Co hraje Česko“ (`/hry`), týdenní report (`/report`), stránka hry se vším (obchody + čeština +
hodnocení + streamy + klipy), rychlost bez reklam, upřímnost u čísel (`/o-webu#data`). Data jen z oficiálních zdrojů / vlastního měření.
Nápad na později: IsThereAnyDeal API (zdarma s klíčem) pro ceny v dalších obchodech v €.

- Hlídač cen `/hlidac`, Má to češtinu? `/cestina` (src/hlidac.js), karty ke sdílení (public/og, tools/og-obrazky.py, canvas v app.js).

- Jazyky CZ/SK/EN: `public/js/jazyk.js` překládá rozhraní na stránce (obsah ne). Nové texty doplňovat do jeho slovníku.
- Stav systému a deník AI `/stav` (src/denik.js), PWA (manifest, sw.js offline), 404.
- Doménu uživatel řeší sám, až bude web hotový – nepřipomínat.

## Rozpracované / další možné kroky
- Vlastní doména → Cloudflare Access pro admin (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` ve `wrangler.jsonc`).
- Konzolista.cz a BonusWeb – RSS se nepodařilo ověřit (Konzolista vrací chybu, BonusWeb blokuje).
- Vybrat AI pro psaní článků (OpenRouter / Claude Haiku) a doplnit podporu v `src/ai.js`.
- Nápady na odlišení webu – viz `docs/NAPADY.md`.

## Jak s uživatelem pracovat
- Krátké odpovědi, kroky s přesnými názvy tlačítek (je na mobilu, často posílá screenshoty).
- Když něco nastavuje v Cloudflare, ať pošle screenshot a ověř podle něj.
- Na web `workers.dev` se z prostředí AI nedá přistoupit (proxy blokuje) – stav ověřuj přes screenshot `/api/stav`.
