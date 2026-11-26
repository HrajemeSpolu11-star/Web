# Seznam úprav (CHANGELOG)

> **Pravidlo: z tohoto souboru se nic nemaže ani nepřepisuje.** Nové záznamy se přidávají vždy **nahoru**
> pod nadpis s datem. Když se něco vrací nebo opravuje, napíše se nový záznam („Oprava: …“, „Vráceno: …“),
> starý zůstává. Časy jsou v UTC podle commitů na GitHubu.

---

## 2026-11-26 (odpoledne, 13) – Stav systému a deník AI, 404, aplikace na plochu, zálohy
- **Deník AI a stav systému** (`/stav`, `src/denik.js`, tabulka `denik`, `/api/stav-systemu`): každá automatická úloha po
  doběhnutí zapíše jednu větu (např. „Na Twitchi našla 118 živých českých streamů…“) nebo chybu. Stránka ukazuje u úloh
  Běží / Zpožděno / Stojí / Chyba a deník posledních akcí. Je to zároveň hlídání chodu webu. Odkaz z řádku AI správce a z patičky.
  RSS sběr nově vrací, kolik webů prošel a kolik čerstvých zpráv našel.
- **Stránka 404**: `public/404.html` (Cloudflare `not_found_handling: 404-page`) i uvnitř webu pro neznámé adresy.
- **Aplikace na plochu (PWA)**: `manifest.webmanifest`, ikony 192/512/maskovatelná/apple-touch (generuje `tools/og-obrazky.py`),
  service worker se registruje všem; bez sítě ukáže `offline.html` (data se necachují). Tlačítko „Nainstalovat jako aplikaci“
  v patičce (Android/Chrome), návod pro iPhone na `/o-webu`.
- **Zálohy**: popsaná obnova přes D1 Time Travel (Free plán 7 dní) a export v `docs/PROVOZ.md`.
- Menu na stránkách O webu a Soukromí opraveno na Domů · Novinky · Streameři.

## 2026-11-26 (odpoledne, 12) – Hlídač cen, „Má to češtinu?“, karty ke sdílení
- **Databáze her ze Steamu** (`src/hlidac.js`, tabulky `steam_hry`, `ceny_historie`, `hlidani`): hry z katalogu, z hledání,
  ze stránek her a hlídané hry. Čeština z appdetails (0 bez, 1 titulky/rozhraní, 2 dabing), ceny v Kč z `price_overview`
  (až 100 her jedním požadavkem), denní nejnižší cena → „nejnižší cena za 90 dní“. Sběr v Cronu `40` (≈ +15 požadavků, celkem ≈ 34 z 50).
- **Hlídač cen** (`/hlidac`): tlačítko „Hlídat cenu“ u her (stránka hry, Má to češtinu?, hlídač), volitelná cílová cena.
  Upozornění přes stávající Web Push (bez účtu a e-mailu) – jednou za slevu, znovu jen při dalším zlevnění. Max. 50 her.
  API `POST /api/push/hlidat`, `/api/push/nehlidat`; vypnutí upozornění smaže i hlídané hry.
- **Má to češtinu?** (`/cestina`, `/api/cestina`): hledání hry (když ji nemáme, zeptá se Steamu a rovnou ověří češtinu),
  filtry Ve slevě / Zdarma / S dabingem / Vše s češtinou. Štítky „CZ titulky“ / „CZ dabing“ u her v katalogu.
  Na Domů sekce „Ve slevě a česky“ a rychlé odkazy na Má to češtinu? a Hlídač cen.
- **Karty ke sdílení**: obrázky 1200×630 pro sdílení odkazů (`public/og/*.png`, generátor `tools/og-obrazky.py`), u hry obrázek ze Steamu,
  v popisu reportu a hry skutečná čísla, `summary_large_image`. Tlačítko **„Sdílet jako obrázek“** u reportu, hry a streamera:
  karta 1080×1350 se nakreslí v prohlížeči (canvas, jen text a čísla) a otevře se nabídka Sdílet / stáhne se.
- Stránka Soukromí doplněna o hlídané hry (localStorage `hp_hlidam` i server).

## 2026-11-26 (odpoledne, 11) – Přehlednější začátek Domů a nový uvítací text
- Hlavní nadpis Domů: „Všechno o hrách na jednom místě“ + věta, co AI dělá. Pod ním rychlé odkazy a pak řádek AI správce.
- Hra týdne se už neopakuje v sekci her zdarma: sekce se jmenuje „Další hry zdarma“ a zobrazí se jen, když je zdarma víc her.
  Jinak je „Příští týden zdarma na Epicu“ přímo v kartě Hry týdne.
- Uvítací karta: „Herní internet je roztroušený. My ho skládáme dohromady.“ – AI sbírá data z obchodů, webů a streamů,
  abys nemusel nic hledat. Upozornění, že web provozuje AI a může se splést, zůstalo.

## 2026-11-26 (odpoledne, 10) – Vzhled „web spravuje AI“
- **Nadpisy sekcí výrazně větší** (23–30 px, tučné, barevný proužek vlevo) a při prvním zobrazení se „dekódují“:
  znaky se přeskupí do textu a dobliká kurzor jako u odpovědi AI. Jen jednou za návštěvu, mění se jen text (odkazy a přepínače ne).
  Při omezení animací v systému se nic nehýbe.
- **Stavový řádek „AI správce webu“** nahoře na Domů: kdy byly obchody naposledy zkontrolovány a kdy bude další kontrola,
  kolik živých streamů AI sleduje a z kolika webů čte zprávy. Jen skutečné časy z dat.
- **Čipy u sekcí** (např. „● Steam API · 11:25“): zdroj dat a čas poslední kontroly, zelená tečka „pulzuje“.

## 2026-11-26 (odpoledne, 9) – Opravy podle externího auditu (ChatGPT)
- **Push upozornění se už neztrácí**: síťová chyba, 429 a 5xx = zpráva zůstane ve frontě a zkusí se znovu (dřív se označila
  jako odeslaná). 404/410/403 = zaniklý odběr se smaže. Fronta bere nejstarší zprávy první; označí se jen zprávy z doby odeslání.
- **Přesné minuty a hodiny sledování**: místo pevných 15 min se počítá skutečně uplynulý čas od posledního započteného běhu
  (max. 15 min) s atomickou rezervací – Cron a sběr na vyžádání už nezapočítají stejný čas dvakrát. Týká se `snimky.minut`,
  `hry_streamera.minut` a `hry_den`. Report týdne bere celkové hodiny z `hry_den` (dřív `scena` × 15).
  Streamy bez kategorie se počítají do celku, v žebříčku her se nezobrazují.
- **Bezpečné stahování článků pro AI**: jen https a jen doména webu, ze kterého zpráva přišla, i u přesměrování (max. 3 kroky).
- **AI psaní má zámek** (5 min): plánované a ruční psaní neběží zároveň → žádné duplicitní téma ani překročený limit.
- **Stránka Soukromí přepsána podle skutečnosti**: co je v localStorage, co se ukládá při zapnutí upozornění (adresa odběru,
  oblíbení, čekající zprávy max. 2 dny), účel, doba uchování, jak smazat, obrázky z cizích serverů.
- Dokumentace: počet RSS zdrojů (19), popis souběžných běhů, přesnosti statistik a push fronty v `docs/ARCHITEKTURA.md`.
- Neměněno záměrně: rozvrh psaní je už v pražském čase (`hodinaPraha`) a Cron běží každou hodinu → letní čas nic neposune.
  Automatické testy a GitHub Actions se podle pravidel projektu nepřidávají.

## 2026-11-26 (odpoledne, 8) – Vlastní statistiky: Co hraje Česko, report týdne, stránka hry s daty obchodů
- **Nové měření `hry_den`**: každých 15 min se u každé hry sečtou diváci a streamy (Twitch i Kick, všechny streamy).
  Z toho hodiny sledování, minuty vysílání a špičky po dnech. Ochrana proti dvojímu započtení (slot 15 min).
  Zápisy: ~65 her × 96 běhů ≈ 6 tis. řádků denně. Data `scena` a `hry_den` se drží 400 dní (dřív `scena` 35 dní).
  K hrám se ukládá i Twitch ID hry (`hry.twitch_id`) – podle něj se ke hře přiřazují klipy.
- **Co hraje Česko** (`/hry`, `/api/cesko`): žebříček her podle hodin sledování za 7 dní, změna proti předchozím 7 dnům,
  „Rostou“, „Nově se hraje“, podíl Kicku, počet streamerů. Top 5 i na Domů.
- **Report týdne** (`/report`, `/report/2026-W48`, `/report/aktualni`, `/api/report`): pondělí–neděle podle Prahy;
  hodiny sledování (Twitch/Kick), průměr a špička diváků, aktivní kanály, top hry se změnou, streameři (diváci, hodiny,
  noví sledující), rekordy a milníky, shrnutí větami jen z čísel, archiv týdnů, tlačítko Sdílet. Upozorní, když je měření neúplné.
- **Stránka hry** (`src/hra-data.js`, tabulka `hra_info`, mezipaměť 12 h): Steam – cena v Kč a sleva, čeština (titulky/dabing),
  datum vydání, žánry, vývojář, hodnocení hráčů, Metacritic, počet hráčů právě teď (oficiální Steam Web API);
  GOG – cena v € a hodnocení; Epic – jestli je zdarma. Párování jen podle přesného názvu. Dále hodiny sledování
  za 7 dní, graf po dnech, nejlepší klipy ke hře.
- **Upřímnost**: na `/o-webu#data` nová sekce „Odkud bereme data a jak počítáme“ a „Bez reklam, bez sledování“;
  u čísel odkaz „Jak počítáme“, v patičce „Odkud jsou čísla“.
- **Rychlost**: fonty se cachují rok (`_headers`). Záložky ve Streamerech se na mobilu posouvají do strany.
- Oprava: odkazy na `/o-webu` a `/soukromi` uvnitř webu otevíraly hlavní stránku (zachytával je router).

## 2026-11-26 (odpoledne, 7) – Hra týdne, recenze, klipy, videa z YouTube, hodnocení ze Steamu
- **Hra týdne** nahoře na Domů: hra zdarma (jinak největší sleva) + hodnocení hráčů ze Steamu + kdo z českých streamerů ji
  právě hraje + články, které o ní píšou.
- **Recenze**: články označené jako recenze z českých i zahraničních webů (české první), odkaz na stránku článku.
- **Klipy týdne**: nejsledovanější Twitch klipy českých streamerů za 7 dní (80 nejsledovanějších, 8 na běh, střídají se).
- **Nová videa streamerů**: z veřejného RSS YouTube kanálu (bez klíče). Kanál se bere z odkazu „YouTube“ v adminu u streamera;
  admin ukazuje, jestli se kanál podařilo najít. Shorts se nezobrazují.
- **Hodnocení hráčů ze Steamu** (% kladných recenzí a počet) u nejhranějších a 8 nejprodávanějších her.
- Nový soubor `src/obsah.js`, tabulky `videa`, `klipy`, `obsah_stav`, endpoint `/api/obsah`, Cron `40 * * * *` (**5 z 5 Cronů – žádný další už nejde přidat**).
  Běh obsahu ≈ 19 požadavků, katalog teď ≈ 33 požadavků (limit 50).

## 2026-11-26 (odpoledne, 6) – Oprava: prázdný GOG
- Sekce GOG byly prázdné. Nejpravděpodobnější příčina: GOG v Česku neprodává v korunách, takže dotaz s měnou CZK vracel chybu.
  GOG se teď načítá v eurech (ceny na webu jsou u GOGu v €, u Steamu dál v Kč).
- Trendy a slevy GOG se načítají každé zvlášť, výpadek jednoho nesmaže druhé. Slevy se řadí od největší a filtrují se až na našem webu.
- Chyby sběru se v `katalog` → `stav` ukládají s názvem obchodu (např. „GOG: HTTP 403“).

## 2026-11-26 (odpoledne, 5) – Nové logo „AI jádro“
- Logo EKG nahradila animovaná ikona umělé inteligence: šestiúhelníková neuronová síť. Uzly se postupně rozsvítí,
  signál doběhne do středu a jádro tepe („přemýšlí“). Po najetí myší tepe rychleji. Při omezení animací stojí.
- Stejné logo je na `/`, `/o-webu` a `/soukromi.html`; ikona webu (`ikona.svg`) má jeho statickou verzi.
- Staré EKG styly v CSS zůstaly, nic se nemazalo.

## 2026-11-26 (odpoledne, 4) – Hlavní stránka s herním katalogem
- **Nová hlavní stránka „Domů“ (`/`)**: hry zdarma (Epic Games, případně Steam) s odpočtem, kolik zbývá; příští hra zdarma
  na Epicu; největší slevy (přepínač Steam/GOG, ceny v Kč); nejhranější hry na Steamu (počet hráčů současně);
  nejprodávanější na Steamu / trendy na GOGu; nově vydané a brzy vyjde; 4 nejnovější zprávy.
- **Novinky se přesunuly na `/novinky`**. Horní menu: Domů · Novinky · Streameři.
- Nový soubor `src/katalog.js`, tabulka `katalog`, endpoint `/api/katalog`, nový Cron `25 * * * *` (4. z 5 povolených).
  Jeden běh = 15 požadavků (Steam 1 + žebříček 1 + 10 detailů her + Epic 1 + GOG 2) a ~10 zápisů řádků → ~240 zápisů denně.
  Výpadek jednoho obchodu nesmaže data ostatních ani starší data.
- Zdroje jsou veřejné, ale neoficiální endpointy obchodů. Pokud některý obchod formát změní, jeho sekce zůstane prázdná a chyba je v `katalog` → klíč `stav`.

## 2026-11-26 (odpoledne, 3) – Barvy platforem
- Přepínač platformy: Twitch je vždy fialový, Kick vždy zelený; vybraná platforma má bílý rámeček a fajfku.

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
