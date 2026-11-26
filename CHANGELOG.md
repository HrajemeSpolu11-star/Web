# Seznam úprav (CHANGELOG)

> **Pravidlo: z tohoto souboru se nic nemaže ani nepřepisuje.** Nové záznamy se přidávají vždy **nahoru**
> pod nadpis s datem. Když se něco vrací nebo opravuje, napíše se nový záznam („Oprava: …“, „Vráceno: …“),
> starý zůstává. Časy jsou v UTC podle commitů na GitHubu.

---

## 2026-11-26 (odpoledne, 2) – Herní animace a české RSS zdroje

- **České RSS zdroje ověřené** (vracely aktuální zprávy 26. 11. 2026): Games.cz (`games.tiscali.cz/rss2.xml`),
  Zing.cz (`zing.cz/rss/all`), Hrej.cz (`hrej.cz/rss/all`), Doupě.cz (`doupe.zive.cz/rss`), Spite.cz (`spite.cz/rss/all`),
  Gaming Professors (`gamingprofessors.cz/feed/`), PCTuning.cz (`pctuning.cz/rss/all`). BonusWeb přidán neověřený.
  Opravené zdroje dostaly nová ID (`games-cz`, `zing-cz`, `doupe-cz`), aby je nezablokovaly staré chyby.
  Sběrač bere 6 zdrojů na běh místo 4.
- **Herní prvky**: logo s animovanou EKG křivkou („puls“), otáčející se prstence živých bublin, tepající tečka u ŽIVĚ,
  „achievement“ oznámení (první oblíbený, zapnutá upozornění), čísla ve statistikách „naběhnou“ jako skóre,
  ukazatele her se plní, jemná synthwave mřížka v hlavičkách, 3D naklonění a záře karet za myší (jen počítač),
  kostry se shimmerem místo „Načítám…“. Vše vypnuté při „omezit pohyb“ (`prefers-reduced-motion`).

## 2026-11-26 (odpoledne) – Funkce pro streamery, rozdělení novinek, dokumentace

- **Oblíbení streameři**: hvězdička na profilu, pruh „Tvoji oblíbení“ a jejich bubliny jsou v sekci Streameři první.
  Ukládá se jen v prohlížeči (`localStorage`, klíč `hp_oblibeni`), bez účtu.
- **Upozornění „je živě“ (Web Push)**: tlačítko na profilu. Service worker `public/sw.js`, API `/api/push/*`,
  logika `src/push.js`. Push se posílá bez obsahu, zprávu si service worker vyzvedne z `/api/push/zpravy`.
  VAPID klíče si Worker vytvoří sám a uloží do D1 (`nastaveni.vapid`). Na iPhonu funguje jen po přidání webu na plochu.
- **Detekce začátku streamu, rekordů a milníků** při každém sběru (Twitch i Kick) – `src/prehled.js`.
- **Nová podsekce Přehled** (`/prehled`): graf diváků české scény za 7 dní, nejvíc vyrostli, rekordy týdne,
  nejvíc odvysílali, nejhranější hry, milníky a rekordy, kalendář plánovaných streamů na 48 h.
- **Kalendář**: sběr rozvrhů z Twitche (5 největších kanálů na běh, obnova po 12 h) do tabulky `rozvrh`.
- **Živě**: kategorie (Povídání a IRL, Střílečky, Strategie a MMO, Závody a sport, Sandbox a přežití, Ostatní),
  filtr „Malí streameři (do 50 diváků)“, karty „Teď se děje“ (víc streamů stejné hry se stejným slovem v názvu).
- **Porovnání streamerů** (`/porovnat?a=twitch/login&b=kick/login`), tlačítko „Porovnat“ na profilu.
- **Odkazy na sítě** (web, YouTube, Instagram, TikTok, X, Discord) u profilu – zadávají se ručně v adminu
  (záložka Streameři), tam jde streamera i skrýt nebo označit jako ověřeného. Nový sloupec `streameri.odkazy`.
- **Novinky**: přepínač Vše / České weby / Ze zahraničí, kategorie (Oznámení a vydání, Recenze, Trailery,
  Slevy a hry zdarma, Aktualizace, Esport, Streamování, Hardware), automatická obnova každých 5 minut,
  načítá se 100 zpráv. Sběrač rozpoznává nové typy Esport, Streamování, Hardware.
- **CSP**: přidáno `worker-src 'self'` kvůli service workeru. Nová ikona `public/ikona.svg`.
- **Dokumentace**: `docs/` (architektura, API, databáze, nastavení, provoz, podklady pro nový chat), `CLAUDE.md`, tento soubor.

## 2026-11-26 09:58 – Hledání a přepínač platformy (commit 4914b8c)
- Sekce Streameři: hledání podle jména (i bez diakritiky) a přepínač Vše / Twitch / Kick v Živě i Žebříčku.
- Filtr her přejmenován na „Všechny hry“.

## 2026-11-26 09:56 – Otevřeně jako AI web (commit 4b2a17e)
- Uvítací karta při první návštěvě („Ahoj! Tenhle web dělá umělá inteligence.“), štítek „AI web“ v hlavičce,
  stránka `/o-webu` (Jak to funguje), odkaz v patičce.

## 2026-11-26 09:53 – Nový vzhled (commit baa95ab)
- Horní menu jen Novinky a Streameři; Živě, Žebříček a Hry jsou podsekce Streamerů.
- Řada „živých bublin“, indigová paleta s mango akcentem, písmo Rubik (vlastní hosting v `public/fonts`).
- Kompaktní řádky novinek na mobilu, opravená česká množná čísla.

## 2026-11-26 09:38–09:40 – Kick Client ID (commity 427546a, c97b593)
- `KICK_CLIENT_ID` je ve `wrangler.jsonc` (veřejné), `KICK_CLIENT_SECRET` je Secret v Cloudflare.

## 2026-11-26 09:22 – Adresy pro Google, hry, Kick, rozvrh a klipy, Discord (commit 29b37f6)
- Skutečné adresy místo `#/…`: `/zive`, `/streameri`, `/streamer/:platforma/:login`, `/hry`, `/hra/:slug`, `/clanek/:id`.
- Worker vkládá title, description, Open Graph, canonical (`src/seo.js`); `sitemap.xml`, `robots.txt`.
- Převzaté RSS zprávy mají `noindex`.
- Kick: sběr českých živých streamů z oficiálního API (`src/kick.js`), sloupec `streameri.platforma`.
- Stránky her, rozvrh a klipy na profilu Twitch streamera (`src/extra.js`), Discord webhook pro nové články.

## 2026-11-26 09:08 – Sběr na vyžádání (commit 1f3b645)
- Když jsou data o streamerech starší než 10 min, Worker je stáhne hned při návštěvě (se zámkem proti souběhu).
- Ukládají se i streamy pod 3 diváky (statistiky až od 3 diváků kvůli limitu zápisů D1).

## 2026-11-26 09:01 – Streameři hned (commit b5e8b2d)
- Zrušen filtr „aspoň 3 streamy a 10 diváků“; živí streameři jsou v seznamu nahoře.

## 2026-11-26 08:47 – Čeští streameři z Twitche (commit 47b0483)
- `src/twitch.js`: každých 15 min české živé streamy, profily, sledující, denní snímky, hry.
- API `/api/zive`, `/api/streameri`, `/api/streamer/:login`; stránky Živě, Streameři, profil s grafem.

## 2026-11-26 07:46 – AI psaní a admin (commit dd66da8)
- `src/psani.js`: 5 článků denně (8, 11, 14, 17, 20 h), výběr tématu, kontrola faktů a opisování.
- AI: Groq (pokud je klíč), záloha Cloudflare Workers AI (`src/ai.js`).
- Admin `/admin` s editorem, frontou ke schválení a vložením hotového textu; ověření přes Cloudflare Access (`src/access.js`).
  **Stav: admin je zamčený, dokud není nastavený Cloudflare Access (čeká na vlastní doménu).**

## 2026-11-26 07:26 – Sběrač novinek (commit 405b367)
- Worker + D1 + Cron: RSS každých 15 min, jen zprávy mladší 12 h, bez duplikátů. `/api/stav`.

## 2026-11-26 07:20 – Zabezpečení (commit ddca509)
- Bezpečnostní hlavičky (`public/_headers`), přísná CSP, kontrola odkazů a barev, stránka o soukromí.

## 2026-11-26 07:05 – Testovací verze webu (commit 017f28f)
- První statická verze s ukázkovými daty.
