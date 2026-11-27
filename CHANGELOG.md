# Seznam úprav (CHANGELOG)

> **Pravidlo projektu: z toho, co je hotové, se nic nemaže** (funkce, stránky, texty, data, vzhled) bez výslovného souhlasu
> uživatele. Velké změny vzhledu se nejdřív ukazují jako návrh.
> **Pravidlo: z tohoto souboru se nic nemaže ani nepřepisuje.** Nové záznamy se přidávají vždy **nahoru**
> pod nadpis s datem. Když se něco vrací nebo opravuje, napíše se nový záznam („Oprava: …“, „Vráceno: …“),
> starý zůstává. Časy jsou v UTC podle commitů na GitHubu.

---

## 2026-11-27 – Databáze v horní liště, bohatá karta hry
- **Lišta**: nová položka **Databáze** (na počítači; na mobilu je v sekci Hry – spodní lišta má 5 míst). Menu se na
  vlastní řádek přesouvá až pod 1460 px.
- **Karta hry v databázi** (`/databaze/<slug>`) teď spojuje všechny zdroje, ne jen popis:
  - „X českých streamů právě živě“ v hlavičce a sekce **Právě streamují · Česko** s živými kartami streamerů,
  - **Statistiky ze všech zdrojů**: hráči teď na Steamu, denní špička (naše měření), recenze Steamu, Metacritic,
    hodnocení kritiků a hráčů IGDB, hodnocení GOG, hodiny sledování a špička diváků na českých streamech, pulsometr,
  - pulsometr, **Kde hrát a koupit** (Steam a GOG s cenou a slevou, Epic zdarma, ostatní obchody), cenový radar,
    hlídání ceny, porovnání, graf ceny, oficiální trailery ze Steamu (jinak obrázky IGDB a trailery YouTube),
    herní DNA, poslední aktualizace, česká scéna (graf 30 dní, kdo hraje nejvíc), klipy, novinky o hře,
    systémové požadavky + „Rozjede se mi to?“, série, DLC, podobné hry.
- Backend: společná funkce `scenaHry()` (stránka hry i databáze), `bohataKarta()` v `src/index.js`. Hry ze Steamu
  otevřené přes databázi se přidají do sledování cen.

## 2026-11-27 – Oprava: profil hry v databázi hlásil „nenalezeno“
- Příčina: dotaz na IGDB se skládal z víceřádkového seznamu polí a při odstraňování mezer zmizela i mezera za slovem
  `fields` („fieldsname,slug…“) → IGDB vracelo chybu u všech variant dotazu a web ukázal „Hru jsme nenašli“.
  Hledání fungovalo, protože jeho dotazy se tak neupravovaly. Opraveno v `src/databaze.js` i `src/igdb-hra.js`.
- Stejná chyba postihovala sérii/DLC/DNA na stránkách her ze Steamu (fungovala jen zjednodušená záloha bez počtu hráčů).
  Uložené záznamy se značkou starší verze se teď obnoví na pozadí (`v: 2`).
- Stránka hry v databázi teď rozlišuje „hru jsme nenašli“ (404) a „databáze teď neodpovídá“ (jiná chyba).

## 2026-11-27 – Oprava: nasazení selhávalo (run_worker_first)
- Nasazení od commitu „Databáze her…“ selhávalo: Cloudflare odmítá v `run_worker_first` adresu `/databaze/`, když je tam
  zároveň `/databaze/*` („rule makes it redundant“). Odebráno `/databaze/` (pokrývá ho `/databaze/*`). Ověřeno
  `wrangler deploy --dry-run`.
- Do `CLAUDE.md` přidána kontrola: po změně `wrangler.jsonc` spustit `wrangler deploy --dry-run` (lokálně, bez Actions).

## 2026-11-27 – Databáze her (IGDB) s českým popisem
- **Nová sekce `/databaze`**: hledání v celé databázi IGDB (přes 300 tisíc her, i konzolové exkluzivity a staré klasiky)
  a populárních 48 her podle návštěvnosti IGDB (seznam se obnovuje 1× denně v Cronu psaní).
- **Profil každé hry `/databaze/<slug>`**: obal a pozadí, platformy, vývojář a vydavatel, **popis česky** (přeložila AI,
  štítek „AI souhrn · přeloženo z IGDB“ + originál ke zobrazení; anglicky pro návštěvníky s EN), příběh, galerie obrázků,
  trailery (odkazy na YouTube), data vydání podle platforem, hodnocení kritiků a hráčů (IGDB) + Steam, PEGI, čeština
  (Steam, jinak IGDB), délka hraní, žánry/témata/režimy/pohled, série s odkazy, DLC, **podobné hry**, obchody
  (Steam, GOG, Epic, PlayStation, Xbox, Nintendo, itch.io…) a oficiální web. Napojení na naše data: cena a sleva ze Steamu,
  hlídání ceny, odkaz na stránku hry na Steamu (pulsometr) a na české streamy.
- **Český překlad** (`src/databaze.js`): AI na pozadí, max. 250 překladů denně + 2 populární hry každou hodinu předem;
  překlad se zahodí, když obsahuje číslo, které v originálu není, nebo je podezřele dlouhý. Tabulky `igdb_detail` (7 dní),
  `igdb_preklad`.
- Propojení: kalendář vydání, výročí, radar a Domů vedou u her bez Steamu na profil v databázi; stránka hry ze Steamu
  odkazuje na „Celý profil hry v databázi“. Rozcestník Hry: nová dlaždice Databáze her.
- **Oprava**: `/radar`, `/trendy` a `/porovnat-hry` po obnovení stránky (F5) nebo při otevření odkazem vracely chybu 404 –
  chyběly v seznamu stránek Workeru (`jeStranka` v `src/seo.js`). Opraveno i v mapě webu (sitemap) – chybné `db` místo
  `env.DB` způsobilo, že se do ní nepřidávaly hry ze Steamu a články. Sitemap nově obsahuje až 500 her z databáze.
- SEO: titulky a popisy profilů her (český popis, obal jako náhled). Překlady SK/EN.

## 2026-11-27 – Nové logo: herní ovladač s pulzující křivkou (vybral uživatel)
- Uživatel vybral z návrhů logo „herní ovladač s EKG křivkou“ (3. v horní řadě). Původní logo (EKG ve žlutém čtverci)
  nahrazeno se souhlasem uživatele.
- Hlavička: ovladač se světlou fialovou září, vlevo kříž, vpravo čtyři tlačítka, uprostřed růžová EKG křivka, která se
  opakovaně vykresluje a „tepe“ (rychleji při najetí myší; při omezení animací v systému stojí).
- Nové ikony: `ikona.svg`, `ikona-192/512.png`, `ikona-maskable-512.png`, `apple-touch-icon.png`; logo i v obrázcích ke sdílení.
  Service worker `hp-offline-v6`.

## 2026-11-27 – Vráceno původní logo, náhledy streamů na Kicku, pravidlo „nic nemazat“
- **Vráceno: původní logo** (EKG ve žlutém čtverci, ikony a obrázky ke sdílení). Nové logo „trojúhelník + EKG“ uživatel
  odmítl. Další návrhy loga se nejdřív ukážou k výběru.
- **Náhledy živých streamů**: u adres náhledů s vlastními parametry (podepsané adresy, Kick) se už nepřidává `?t=…`,
  které je rozbíjelo. Když se náhled přesto nenačte, místo rozbité ikony se ukáže rozostřená profilovka streamera.
- **Nové pravidlo** v `CLAUDE.md` a `docs/PRO-NOVY-CHAT.md`: z hotového se nic nemaže bez souhlasu uživatele.

## 2026-11-27 – Nové logo, hlavní stránka, náhledy streamerů, zpětná tlačítka
- **Nové logo**: přehrávací trojúhelník s EKG křivkou v barevném čtverci (růžová → fialová), křivka v hlavičce „tepe“.
  Nové `ikona.svg`, `ikona-192/512.png`, `ikona-maskable-512.png`, `apple-touch-icon.png`, logo i v obrázcích ke sdílení.
  Název v hlavičce písmem Bricolage Grotesque.
- **Domů**: úvod ve dvou sloupcích – slogan, krátká věta a tři klikací čísla (zprávy za 24 h, hry zdarma, aktualizace
  za 24 h) vlevo, monitor tepu a příští velké vydání vpravo; akce s odpočtem pod tím. Na mobilu pod sebou.
- **Náhled profilu streamera**: když streamer nemá vlastní banner (na Twitchi/Kicku si ho nastavuje sám), ukáže se živý záběr
  ze streamu, jinak rozostřená profilovka v barvě platformy s EKG křivkou. Banner, který se nenačte, se nahradí taky.
- **Zpětná tlačítka**: „← Zpět“ vrací na opravdu předchozí stránku webu (i se stavem filtrů); bez historie vede na nadřazenou
  sekci. Doplněno na /stav. Kontrola odkazů: 57 typů stránek prolezeno, žádný odkaz nevede na neexistující stránku.
- Service worker `hp-offline-v4`. Překlady nových textů.

## 2026-11-27 – Jednotný vzhled „herního kanálu“, nová lišta, kalendář bez posuvníku
- **Lišta**: nové položky Radar, Slevy (`/obchody`), Kalendář (`/vydani`), Aktualizace – na počítači všechny s ikonami,
  na mobilu spodní lišta s 5 ikonami (Domů, Novinky, Radar, Hry, Streameři); Slevy/Kalendář/Aktualizace jsou na mobilu
  v sekci Hry. Mezi 761 a 1340 px jde menu na vlastní řádek. Stejná lišta v `404.html`, `offline.html`, `o-webu.html`.
- **Hlavička každé stránky** jako banner kanálu: barva sekce, velká ikona, EKG stopa v rohu (na mobilu bez ní).
  Platí pro všechny herní stránky (`hubHry`), Streamery a Novinky. Podsekce jako jednotné barevné pilulky.
- **Rozcestník Hry**: dlaždice s ikonou v barvě skupiny, jemná záře a zvednutí při najetí, větší nadpisy skupin.
- **„Vychází do 7 dní“ na radaru** a police na Domů: místo pásu s posuvníkem mřížka obalů her s odpočtem; na Domů jedna
  řada po 8, na mobilu posun prstem bez viditelné lišty.
- Obsah stránky je na širokých monitorech omezený na 1180 px a vycentrovaný (dřív se roztahoval přes celou šířku).
- `obarvi()` nastavuje barvu sekce (`data-barva`) všude. Service worker `hp-offline-v3`. Překlady lišty.

## 2026-11-27 – Stránka hry: oficiální pozadí, dva sloupce, galerie a trailery
- **Pozadí hry**: oficiální obrázek pozadí ze stránky hry na Steamu (`background_raw`) přes celou šířku okna, ztmavený
  a rozostřený, aby byl text čitelný. Když se nenačte, zmizí. Hry mimo Steam mají dál pozadí v barvě hry.
- **Dva sloupce na počítači** (od šířky 1100 px): vpravo sloupec, který zůstává při posouvání na místě – pulsometr, Kde koupit,
  cenový radar, Hlídat cenu, čeština a hodnocení, Porovnat s jinou hrou. Vlevo popis, galerie, graf ceny, DNA, aktualizace,
  série, požadavky a české streamy. Na mobilu jeden sloupec, popis hned pod hlavičkou.
- **Galerie**: až 16 oficiálních screenshotů a 4 trailery ze Steamu (`screenshots`, `movies` v appdetails – žádné požadavky navíc).
  Prohlížeč přes celou obrazovku: šipky, Esc, posun prstem, počítadlo. Trailer se načte až po kliknutí (mp4, nebo HLS);
  když ho prohlížeč neumí přehrát, nabídne „Přehrát na Steamu“.
- Starší uložené údaje o hrách (bez obrázků) se při dalším zobrazení obnoví na pozadí.
- CSP: přidáno `media-src` jen pro videa ze Steamu (`*.steamstatic.com`, `steamcdn-a.akamaihd.net`). Patička nad pozadím (`z-index`).

## 2026-11-27 – Herní pas, pulsometr, herní radar, trendy, srovnávač her
Podle návrhu (ChatGPT), který uživatel schválil v poctivé podobě – nic se nedomýšlí, vše má uvedený původ.
- **Herní radar** (`/radar`, `src/radar.js`): proud událostí – velké aktualizace, hry zdarma na Epicu, hry na nejnižší ceně
  od začátku měření, rekordy a milníky streamerů, prudce rostoucí / znovu ožívající hry, vydání, výročí. Filtry podle druhu,
  „Vychází do 7 dní“. Na Domů blok „Na radaru“ (5 položek, bez aktualizací – ty mají vlastní blok).
- **Rostoucí a upadající hry** (`/trendy`, `src/trendy.js`): česká scéna (hodiny sledování 7 celých dní proti předchozím 7)
  a Steam (denní špička hráčů proti týdnu předtím; nová tabulka `hraci_den`, ukládá se 1× denně). Stavy: prudce roste, roste,
  stabilní, klesá, výrazně klesá, znovu ožívá, nově na scéně. Počítá se každé 3 hodiny v Cronu psaní (nová úloha deníku „trendy“).
- **Pulsometr** (`src/puls.js`): 0–100 z hráčů na Steamu, české scény, trendu, čerstvosti aktualizací a slevy, s rozpisem,
  váhami a vysvětlením. Chybějící ukazatel se nepočítá; skóre až od 3 ukazatelů.
- **Cenový radar** (`src/ceny.js`): u hry „nejnižší od…“, „ve slevě N× za dobu měření, obvykle −X %“, vždy s datem začátku
  měření. Graf ceny na stránce hry až 400 dní. Na Hlídači seznam her na nejnižší ceně od začátku měření.
- **Herní pas** (`src/pas.js`, `src/igdb-hra.js`): stránka hry nově s pulsometrem, cenovým radarem, herní DNA, posledními
  aktualizacemi, sérií a DLC z IGDB (mezipaměť 7 dní, tabulka `igdb_hry`) a tlačítkem „Porovnat s jinou hrou“.
- **Lehká herní DNA**: pohled, režimy, počty hráčů, témata, délka hraní (IGDB), režimy a žánry (Steam), aktivita vývojářů
  (náš počet aktualizací za 90 dní). Každý řádek se štítkem zdroje.
- **Srovnávač her** (`/porovnat-hry?ids=`, `/api/srovnani`): 2–4 hry vedle sebe (cena, cenový radar, GOG, čeština,
  hodnocení, hráči teď, pulsometr, česká scéna, režimy, počet hráčů, pohled, délka, aktualizace, DLC, vydání, vývojář).
- **Co hrát s přáteli**: volba „Kolik vás bude?“ – počet hráčů z IGDB (tabulka `igdb_hraci`), cena pro celou skupinu,
  „na jednom zařízení stačí jedna kopie“ u split-screenu, hry bez údaje označené a na konci. Crossplay se neuvádí.
- **Štítky původu dat** (`puvod()` v `app.js`): Změřeno námi / Oficiální data / Databáze IGDB / AI souhrn. Opraven starý štítek
  u dat z obchodů, který chybně tvrdil „Data ověřila AI“.
- Rozcestník Hry: nová skupina „Puls her“. Nové trasy ve `wrangler.jsonc`, SEO titulky a sitemap, `/o-webu#stitky`,
  `#pulsometr`, `#trendy`. Překlady SK/EN. Indexy `patche(appid, datum)`, `hraci_den(den)`. Katalog API už neposílá `trendy`
  a `cenovy_radar`.

## 2026-11-27 – Opravy podle externího auditu (ChatGPT)
- **Push upozornění**: `/nehlidat` už nezakládá odběr; tělo požadavku se čte s pevným limitem (ne až po stažení celé);
  max. 30 nových odběrů za minutu pro celý web; neúspěšná odeslání mají postupné čekání (15 min → max. 12 h,
  sloupce `pokusy`, `dalsi_pokus`) – jeden nefunkční odběr už neblokuje frontu ostatním. Index fronty.
- **Kick**: nejdřív se zkusí Livestreams V2 (stránkování), když není nebo vrátí nečekaná data, použije se osvědčené V1.
  Na /stav je vidět, které API běželo a jestli mohlo pokrytí být neúplné. (Že je V1 zastaralé, se ověřit nepodařilo.)
- **Měření minut**: když zápis statistik selže, rezervace intervalu se vrátí – minuty se neztratí.
- **AI**: Gemma (pro účet zakázaná) vyřazena ze seznamu. Články a kontrolu faktů nepíše slabý model 8B.
  Automatické zveřejnění nově chce plný text u dvou zdrojů z různých webů a čísla v článku musí být v podkladech.
- **Hlídač cen**: hry, které Steam nevrátí, se posunou na konec fronty; hlídané hry nezaberou každý běh celé místo.
- **Steam hráči**: popisky opraveny na „denní špička za 24 h“ (dřív chybně „za týden“); aktuální počet se ukládá zvlášť.
- **Limity velikosti**: RSS, YouTube, stránky studií a zdroje článků se čtou s limitem bajtů (proudově); admin
  přijímá max. 64 / 256 kB. Nový soubor `src/telo.js`.
- **Výkon**: kontrola stáří dat Twitche až po neúspěchu mezipaměti; indexy `hry_den(hra, den)` a `hry_streamera(hra)`
  (sloupce, které se nemění → bez zápisů navíc).
- Kalendář vydání označen jako „výběr populárních her z IGDB“.

## 2026-11-27 – Obrázky u aktualizací her, bezpečné přidávání her
- **Chybějící obrázky u aktualizací**: novější hry mají na Steamu obrázek na adrese s jedinečným kódem, odhad
  `…/steam/apps/ID/header.jpg` nefungoval. API bere oficiální `header_image` z `steam_hry`; hry s novou aktualizací se do
  databáze her přidají (sběr doplní obrázek). Když obrázek přesto chybí: dlaždice s názvem hry. Název hry v hlavičce karty
  už neujíždí doprava.
- Typ podle nadpisu: „Update 1.0.7“ už není „Velká aktualizace“ (jen verze x.0 bez další číslice).
- **Oprava rizika**: `prikazyUlozHry` s hrou bez ceny (jen ID + název) by u známé hry vynulovala slevu. Nová
  `prikazyPridejHry` (INSERT OR IGNORE) pro kalendář vydání, aktualizace a seznam přání.

## 2026-11-26 (večer, 32) – Oprava AI, kalendáře a Kicku podle stránky /stav
- **AI nepsala nic**: Cloudflare účtu zakázal model `@cf/google/gemma-3-12b-it` (chyba 5018). `ai.js` má teď řadu záložních
  modelů Workers AI (Mistral Small 3.1 → Llama 3.3 70B → Llama 3.1 8B → Gemma), použije první funkční a ověří, že vrátil JSON.
  `CF_MODEL` ve `wrangler.jsonc` = Mistral Small 3.1.
- Při výpadku AI zůstane aktualizace hry ve frontě (dřív se označila „bez shrnutí“ natrvalo); jednorázově vráceny ty z 26. 11.
- **Kalendář vydání a výročí** hlásily „Too many subrequests“ – Cron obchodů má sám ~40 požadavků. Přesunuto do Cronu psaní
  jako nová úloha „Kalendář vydání a výročí (IGDB)“.
- **Kick**: oficiální API vrátí max. 100 streamů bez stránkování → dva dotazy (100 nejsledovanějších + 100 naposledy spuštěných).

## 2026-11-26 (večer, 31) – Oprava: polovina webu v EN/SK zůstávala česky
- Nové části webu neměly překlady v `jazyk.js` a věty poskládané z více kousků (např. řádek pod EKG) slovník nepoznal.
  Doplněno ~150 textů a frází (Domů, aktualizace + slovníček, Co hrát, Rozjede se, Vyšší/nižší, Česká scéna, seznam přání,
  systémové požadavky, popisky zdrojů…). Fragmenty kolem tučných čísel mají vlastní položky.
- **Data a čísla podle jazyka**: `LOC` v `app.js` (cs-CZ / sk-SK / en-GB) místo napevno české lokalizace
  („Thursday 26 November“ místo „čtvrtek 26. listopadu“). „před X min“ uvnitř vět → „X min ago“ / „pred X min“.
- **Nové nástroje** `tools/testovaci-server.py` (web s ukázkovými daty) a `tools/kontrola-prekladu.py en|sk` (projde 28 stránek
  a vypíše texty, které zůstaly česky). Spustit vždy, když přibudou texty v rozhraní.

## 2026-11-26 (večer, 30) – Stránka hry: poctivý popisek měření
- „Hodin sledování za 7 dní“ → když měříme kratší dobu, „od <datum> (od té doby měříme)“ (podle nejstaršího dne v `statistiky.dny`).
- Hra, která není na Steamu/GOGu/Epicu: věta nově zmiňuje hry jen pro konzole (např. GTA VI).

## 2026-11-26 (večer, 29) – Domů přehledněji: police obalů
- „Brzy vyjde“ byl dlouhý seznam přes celou šířku → **police obalů** (10 her vedle sebe, na mobilu posuvná do strany,
  štítek „dnes / zítra / za N dní“). Stejně „Dnes před lety vyšlo“ (až 8 her).
- Pořadí na Domů: úvod s EKG → ranní přehled + hra týdne → Co je nového ve hrách → Brzy vyjde → zprávy (2 sloupce) →
  nástroje → dnes před lety. Bloky se při chybějících datech roztáhnou, aby nezůstávala díra.

## 2026-11-26 (večer, 28) – Aktualizace her pro ~1 000 her, seznam přání ze Steamu
- **Sledované hry** (tabulka `sledovane`, `sestavSledovane` 1× denně v Cronu psaní): 1 000 nejpopulárnějších her na Steamu
  podle IGDB (`popularity_types` → „Steam 24hr Peak Players“ → `popularity_primitives` → `external_games`), 100 nejhranějších
  ze Steamu, hry nejvíc streamované v Česku, hlídané hry a hry ze seznamů přání.
- **Kontrola každých 15 min** (Cron novinek, úloha „aktualizace“ v deníku): 15 nejdéle nekontrolovaných her = 60/h,
  celý seznam ~1× za 17 h. Nová aktualizace se zobrazí hned (nadpis, hra, obrázek, typ podle nadpisu, odkaz) se štítkem
  „Shrnutí se připravuje“.
- **Shrnutí AI 2× za hodinu**, nejpopulárnější hry první. Struktura: typ (Velká aktualizace / Nová sezóna / Opravy chyb /
  Úpravy rovnováhy / Aktualizace), co přináší, komu se týká, změny ve skupinách Novinky / Úpravy hratelnosti / Opravy /
  Výkon. Kontrola čísel; neprojde-li, zůstane originální nadpis s odkazem.
- **Slovníček** (buff, nerf, hotfix, meta, battle pass, PvP…): pevné vysvětlivky, ukážou se jen pojmy z dané aktualizace.
- Filtry: Všechny / Velké a sezóny / Opravy / Hraje Česko / Moje hry. **Domů: blok „Co je nového ve hrách“** (4 karty).
- **Seznam přání ze Steamu** v Hlídači cen (`/api/wishlist?steam=`, `src/wishlist.js`): IWishlistService/GetWishlist,
  názvy přes IStoreBrowseService/GetItems, vlastní adresa profilu přes veřejný XML profil (nebo ResolveVanityURL, pokud je
  nastaven Secret `STEAM_API_KEY`). Seznam „Moje hry“ jen v prohlížeči (`hp_moje`), server neukládá, čí seznam je.
  Hry z něj se přidají do databáze her a mezi sledované aktualizace. „Hlídat slevy u všech“. Limit 10 načtení/min.
- Hlídač cen: až 200 her (dřív 50). `/api/steam-hry` po dávkách 90 (D1 má limit 100 parametrů).
- Oprava: klíč mezipaměti API ořezával `ids` na 200 znaků → různé seznamy her mohly dostat stejnou odpověď.
- Požadavky: Cron novinek ~10 RSS + ~14 studia + 15 aktualizace ≈ 39 z 50; Cron psaní + 1× denně ~7 IGDB.

## 2026-11-26 (večer, 27) – Oprava: falešný odpočet u vydání her
- Kalendář vydání a „Brzy vyjde“ ukazovaly odpočet na sekundy do půlnoci UTC (např. „za 7 h 03 min“), i když IGDB ani Steam API
  neznají hodinu vydání (Steam ji ukazuje jen na stránce obchodu). Teď jen „vychází dnes / zítra / za N dní“ a datum v UTC
  (`datumVydani`, `dnyDoVydani`). Přesný odpočet zůstává jen u akcí s oficiálním časem.

## 2026-11-26 (večer, 26) – Dohasínající EKG v barvách platforem, archiv novinek
- **EKG dohasíná jako fosfor na monitoru**: nová stopa svítí naplno, starší postupně slábne (destination-out každých 0,1 s,
  τ ≈ 1,5 s), okraje monitoru jsou měkce ztracené (maska).
- **Barva podle platformy**: Twitch fialová (#a970ff), Kick zelená (#53fc18) – křivka, záře, mřížka i srdíčko u tepu.
  „Tep herního světa“ na Domů zůstává v barvě webu.
- **Archiv novinek**: nahoře 12 velkých karet, pod nimi plynule přehledný seznam po dnech (Dnes, Včera, Úterý 24. listopadu…)
  s malým obrázkem, nadpisem, zdrojem a časem; „Načíst starší zprávy“ (`/api/clanky?pred=<ms>`). Zprávy se v databázi
  drží 90 dní (dřív 30). Automatická obnova každých 5 min nové zprávy přidá a načtený archiv nechá.

## 2026-11-26 (večer, 25) – EKG monitor kreslený živě, všichni živí streameři
- **EKG jako skutečný monitor** (canvas): svítící bod kreslí křivku zleva doprava, před sebou maže starou stopu, mřížka
  v pozadí. Tvar úderu = vlny P, Q, R, S, T (model ECGSYN). **Každý úder je jiný**: rozestup ±12 %, výška/síla hrotu ±18 %,
  vlny P a T se mění, linka se vlní, drobný šum. Animují se jen monitory, které jsou vidět (IntersectionObserver),
  jedna společná smyčka requestAnimationFrame. „Omezit pohyb“ = statický záznam.
- **Živě: všichni streameři.** `/api/zive` vracelo jen 120 nejsledovanějších (proto seznam končil u 10 diváků) –
  teď až 600 (= vše, co sběr najde).

## 2026-11-26 (večer, 24) – Opravdové EKG, streameři pryč z Domů
- **Tep jako skutečné EKG**: rovná linka, vlna P, ostrý komplex QRS, vlna T (`uderEkg()`). Papír jede stálou rychlostí,
  při vyšším tepu jsou údery hustěji – jako na monitoru. Tempo uvěřitelné: 60–130 tepů/min
  (0–1 divák ≈ 60, 10 ≈ 75, 100 ≈ 90, 1 000 ≈ 105, 10 000 ≈ 120). Dřív bylo moc rychlé (až 190) a tvar nepřipomínal EKG.
- **Na Domů nejsou streameři** (přání majitele): pryč „Tep scény“ i „Tento týden na scéně“. Nově „Brzy vyjde“
  (5 nejbližších nových her z kalendáře, `/api/vydani?limit=5`) a „Nové aktualizace her“. Velká křivka pod sloganem
  = „tep herního světa“ podle počtu zpráv za 24 h. Křivky u streamerů zůstávají v sekci Streameři a na profilech.

## 2026-11-26 (večer, 23) – Nový vzhled „Herní puls“: všechno tepe
- **Slogan** na Domů: „Hry mají tep. My ho měříme.“ (nadpisy písmem Bricolage Grotesque, OFL, vlastní hosting v `public/fonts`).
- **EKG křivka jako hlavní motiv** (`ekg()`, `nakresliEkg()`, `tepZDivaku()` v `app.js`): velká křivka pod sloganem tepe podle
  všech diváků české scény, **každý živý streamer má vlastní křivku**, která tepe tím rychleji, čím víc má diváků
  (logaritmicky: 10 diváků ≈ 85/min, 100 ≈ 115, 1 000 ≈ 145, 10 000 ≈ 175, strop 190). Na Domů (blok „Tep scény“),
  na kartách Živě a na profilu streamera. Respektuje „omezit pohyb“.
- **Logo** = tep v jantarovém čtverečku (úder každé 2,4 s) na všech stránkách. Načítání = běžící křivka.
- **Mobil: spodní lišta jako v aplikaci** (ikony Domů / Novinky / Hry / Streameři, počet živých). Pozor: hlavička nesmí mít
  na mobilu `backdrop-filter`, jinak by lištu „uvěznila“ nahoře.
- **Domů jako mozaika**: ranní přehled + tep scény, hra týdne přes celou kartu s obrázkem + zprávy, nástroje s ikonami,
  týden na scéně v číslech + výročí. Tmavší indigové pozadí se světelným nádechem, větší zaoblení.
- Třída `.hero` je obsazená hlavním článkem v Novinkách – úvod Domů má třídu `.uvod`.

## 2026-11-26 (večer, 22) – Vráceno: Rádce pro streamery odstraněn
- Na přání majitele úplně pryč: stránka `/radce`, `/api/radce`, záložka u Streamerů, dlaždice na Domů (nahrazena odkazem
  na Českou herní scénu), SEO, sitemap, `run_worker_first`, překlady. Data `hry_den` zůstávají (používá je Týden na scéně a minihra).

## 2026-11-26 (večer, 21) – Web už není jen katalog obchodů: nový Domů, rozcestník Hry a 8 nových částí
- **Domů přestavěn**: ranní přehled → právě živě → zprávy → 4 nástroje → jedna hra týdne + odkaz na slevy → týden na české
  scéně → „dnes před lety vyšlo“. Všechny obchodní sekce (slevy, žebříčky, novinky v obchodech) jsou na nové stránce
  **/obchody „Slevy a hry zdarma“**. Klipy a videa streamerů jsou v Týdnu na scéně a na stránce Živě.
- **Rozcestník Hry `/pruvodce`** (menu „Hry“): stránky rozdělené do 5 skupin (Najdi si hru, Ušetři, Co se chystá, Kdo hry dělá,
  Zahraj si). Na podstránkách jen odkaz zpět a záložky stejné skupiny – žádná dlouhá řada odkazů.
- **Ranní přehled (AI)** `/ranni` (`src/ranni.js`, Cron psaní od 6:00): 5 bodů ze zpráv za 24 h; bod musí odkazovat na
  existující zprávu a čísla v něm se musí objevit ve zprávě, jinak se vyřadí. Archiv 60 dní. Odkaz i v Novinkách.
- **Aktualizace her** `/aktualizace` (`src/patche.js`): oficiální oznámení vývojářů na Steamu u nejhranějších her (Cron obsahu,
  3 hry/běh) → AI shrnutí česky (Cron psaní, 1/h). Stejná kontrola čísel; nepovedené shrnutí se nezveřejní.
- **Česká herní scéna** `/ceska-scena` (`/api/ceska-scena`): česká studia, jejich zprávy a videa, kdo právě streamuje jejich hry.
- **Co dnes hrát?** `/co-hrat` (`/api/co-hrat`): volby s kým / cena / čeština / žánr → hry seřazené podle hodnocení hráčů
  (nebo Metacritic) a počtu doporučení. Databáze her ze Steamu má nové sloupce `zanry`, `rezim`, `doporuceni`, `metacritic`
  (plní je `sberJazyku`, 12 her/h; nejdřív hry bez žánrů).
- **Rozjede se mi to?** `/rozjede-se` + kontrola na stránce každé hry: počítač se uloží jen v prohlížeči (`hp_pc`),
  porovnání s požadavky ze Steamu podle orientační tabulky výkonu (`public/js/hw.js`, načítá se jen na těchto stránkách).
- **Vyšší, nebo nižší?** `/vyssi-nizsi` (`/api/vyssi-nizsi`): denní minihra, 3 sady čísel (hráči na Steamu, hodiny sledování
  českých streamů, doporučení na Steamu), stejné kolo pro všechny, skóre a rekord v prohlížeči, sdílení textem i obrázkem.
- **Rádce pro streamery** `/radce` (`/api/radce`): průměrný počet diváků jednoho českého streamu každé hry za 7 dní
  (`hry_den`: divácké minuty / minuty vysílání), průměrný počet souběžných streamů, počet streamerů.
- **Týden na české scéně** (report): nově „Nově zachycené kanály“ (od 2. týdne měření) a „Klipy týdne“; záložka se jmenuje
  „Týden na scéně“.
- **Dnes před lety vyšlo** (`src/vyroci.js`, Cron katalogu 1× denně, 1 dotaz na IGDB).
- Oprava: `/api/katalog` už neposílá celý kalendář vydání (zbytečně velká odpověď na Domů).
- Požadavky v Cronech: katalog nejhůř ~45 z 50 (výročí jen 1× denně), obsah ~39, psaní ~3 AI volání za hodinu.

## 2026-11-26 (odpoledne, 20) – Oprava 404 po obnovení stránky, kalendář vydání bez starých her, barevné filtry, audit
- **Oprava: obnovení stránky vracelo 404** (např. `/porovnat?a=…`, ale týkalo se všech podstránek). Cloudflare při navigaci
  servíroval rovnou `404.html` a Worker nespustil. Všechny stránky webu jsou teď ve `run_worker_first` (`wrangler.jsonc`) –
  seznam musí odpovídat funkci `jeStranka()` v `src/seo.js`.
- **Kalendář vydání**: IGDB vrací každé vydání zvlášť (port na novou konzoli, plná verze po předběžném přístupu, jiný region),
  takže se staré hry ukazovaly jako novinky. Nově se bere `game.first_release_date` a stav na Steamu (`steam_hry.vychazi`);
  hry, které už vyšly, jsou v záložce „Nové platformy a plné verze“ s textem, kdy vyšly. Vyřazené jsou zrušené termíny a balíčky,
  aktualizace a módy (`game_type`). Když IGDB některé pole nezná, dotaz se sám zjednoduší (3 úrovně). Stará data se přepočítají
  při nejbližším běhu katalogu. Výchozí záložka se jmenuje „Nové hry“; u dnešních vydání „právě vychází“.
- **Novinky podle jazyka**: CZ/SK → výchozí „České weby“, EN → „Ze zahraničí“ (jen když nějaké zprávy jsou; jinak „Vše“).
  Na Domů jsou čerstvé zprávy (do 48 h) v jazyce návštěvníka nahoře.
- **Barevné filtry** v Novinkách: každá kategorie a platforma má svou barvu (PlayStation modrá, Xbox zelená, Switch červená…),
  při najetí myší se zvednou a rozsvítí, na mobilu se při ťuknutí zmáčknou. Respektuje „omezit pohyb“.
- Audit – bezpečnost a stabilita:
  - Klíč mezipaměti API jen ze známých parametrů (náhodné `?x=` ji obcházely a zatěžovaly D1).
  - Rozbité kódování v adrese API (`%E0`) už nevrací chybu 500.
  - Prázdný kalendář stahuje z IGDB na žádost návštěvy nejvýš jednou za 10 minut (zámek `vydani_pokus`).
  - Strop 20 000 push odběrů proti zahlcení databáze vymyšlenými odběry.
  - Čísla ze serveru (sleva, délka klipu, interval) se do HTML vkládají jako čísla.

## 2026-11-26 (odpoledne, 19) – Poctivé statistiky streamerů a historie vysílání z Twitche
- „Odvysíláno za 30 dní“ bylo zavádějící: počítáme ho sami a měření teprve začalo. Profil teď ukazuje
  „odvysíláno od <datum>“ a „nejvíc diváků najednou od <datum>, kdy měříme“, dokud neuplyne 30 dní (`mereno_od` v API).
- **Historie z Twitche**: profil načítá záznamy vysílání (Helix `/videos?type=archive`) – skutečné hodiny i před naším měřením
  a seznam posledních 10 vysílání (název, datum, délka, zhlédnutí). Když dávají víc než naše měření, ukáže se jejich číslo
  s popiskem „podle záznamů na Twitchi“ a správným oknem (Twitch drží záznamy partnerů 60 dní, affiliate 14, ostatních 7;
  jen když je má streamer zapnuté). Bez záznamů web napíše, že historii před měřením neznáme.
- Kick: místo „–“ u sledujících vysvětlení, že je Kick ve svém oficiálním API nezveřejňuje.
- Žebříček a porovnání: „Odvysíláno (naše měření)“, „Růst (naše měření)“.

## 2026-11-26 (odpoledne, 18) – Stránka pro každou hru, obrázky akcí, loga a náhledy webů studií
- **Každá hra ze Steamu má vlastní stránku** `/hra/steam/<číslo hry>` (`/api/hra-steam/:id`): cena a sleva, čeština (podle Steamu),
  hodnocení, hráči teď, vývoj ceny, PC požadavky, GOG a Epic podle přesného názvu. Když hru streamuje někdo z Česka, přidají
  se statistiky ze streamů, klipy a kdo ji hraje (spárování podle názvu s Twitch kategorií). Hra se páruje podle čísla na
  Steamu, ne podle názvu. Mezipaměť `hra_info` pod klíčem `steam-<id>` (12 h).
  Odkazy z katalogu, slev, hry týdne, nejhranějších, Má to češtinu?, hlídače a kalendáře vydání teď vedou na tuto stránku
  (dřív přímo do obchodu). SEO: titulek a popis s cenou a češtinou, obrázek ze Steamu, 300 her v sitemap.
- **Obrázky u akcí**: z náhledu oficiálního webu akce (og:image), jinak vlastní obrázek podle typu (`public/og/akce-*.png`,
  generuje `tools/og-obrazky.py`). Hra zdarma na Epicu s obrázkem hry.
- **Studia: logo a náhled webu** (`src/nahled.js`): z hlavičky oficiálního webu studia se vezme ikona (apple-touch-icon),
  obrázek pro sdílení, titulek a krátký popis – jako náhled odkazu v Discordu. Čte se jen hlavička stránky, obnova 1× za 7 dní
  (2 weby na běh studií). Na stránce studia karta „Otevřít web studia“.
- **Oprava**: stránky Akce a Studia mohly přetékat do šířky (karty uříznuté vpravo) – mřížky a dlouhé texty se už nezvětšují nad šířku displeje.

## 2026-11-26 (odpoledne, 17) – Opravy podle druhého auditu (ChatGPT)
- **Push fronta bez ztrát**: jedno oznámení = max. 4 zprávy; service worker si vyzvedne jen zprávy, ke kterým už push odešel,
  a server smaže přesně ty vydané. Zbytek čeká na další push. Každé upozornění má vlastní značku (`tag`), takže se v telefonu
  navzájem nepřepisují (dřív se cenová upozornění na /hlidac nahrazovala). Omezení velikosti těla push požadavků (8 kB).
- **Čeština poctivě**: Steam v seznamu jazyků nerozlišuje rozhraní a titulky → štítek „CZ texty“ místo „CZ titulky“,
  „CZ dabing“ jen při plném zvuku. U hry „Čeština (podle Steamu)“ a vysvětlení, že jde o údaj vydavatele, ne nezávislé ověření.
- **Přesné hodiny malých streamerů**: odvysílané minuty a hry se počítají u všech streamů (dřív jen od 3 diváků).
  „Aktivní kanál“ v reportu dál znamená aspoň chvíli 3+ diváků. Odhad zápisů D1 doplněn do `docs/ARCHITEKTURA.md`.
- **PlayStation ve zprávách**: PS5, PS4 a obecné „PlayStation“ se rozlišují; filtr „PlayStation“ v novinkách zahrne všechny.
- **AI články přísněji**: automaticky se zveřejní jen článek s plným textem aspoň jednoho zdroje a se zprávou potvrzenou
  aspoň 2 různými weby; jinak čeká ke schválení. AI typy článků sjednoceny s RSS (Esport, Hardware, Streamování).
- **RSS zdroje**: vypnutý zdroj se zkusí znovu po 24 h; 10 zdrojů na běh (každý ≈ 30 min místo ≈ 48 min).
- **Kontrola domén** u stahování článků pro AI zvládá přípony typu co.uk / com.au.
- **Hledání na Steamu** z veřejného „Má to češtinu?“: max. 20 nových dotazů za minutu pro celý web.
- **Související články u hry** jen při shodě celého názvu (ne „Rust“ v „Trust“).
- Záměrně neměněno: automatické testy a GitHub Actions (pravidlo projektu), zamčený admin (do vlastní domény).

## 2026-11-26 (odpoledne, 16) – Sekce Hry: kalendář vydání, akce s odpočtem, studia, předplatné, graf ceny
- **Nová záložka „Hry“** v hlavním menu (Domů · Novinky · Hry · Streameři) s podzáložkami Kalendář vydání · Akce a odpočty ·
  Studia · Má to češtinu? · Hlídač cen.
- **Kalendář vydání** (`/vydani`, `src/vydani.js`): chystané hry z IGDB (oficiální API, přihlášení Twitch klíči), termín,
  platformy, odpočet, čeština (Steam, jinak IGDB, jinak „zatím neoznámena“), odkazy Steam/IGDB, tlačítko Hlídat cenu.
  Filtry: jen s češtinou, jen s přesným datem. Obnova každých 6 h v Cronu katalogu (1–2 požadavky); hry ze Steamu jdou do databáze her.
- **Akce a odpočty** (`/akce`, `src/akce.js`): živý odpočet do The Game Awards 2026, Steam zimního výprodeje 2026, Next Festu
  (únor a červen 2027), jarního a letního výprodeje 2027 a gamescomu 2027 – jen oficiálně potvrzené termíny s odkazem na zdroj.
  Odpočet do další hry zdarma na Epicu, **ohlášené přenosy** (State of Play, Nintendo Direct, Showcase) a **předplatné**
  (PS Plus, Game Pass) z oficiálních blogů PlayStation a Xbox. Nejbližší akce s odpočtem i na Domů.
- **Studia a platformy** (`/studia`, `/studio/:slug`, `src/studia.js`): 23 studií a platforem (PlayStation, Xbox, Nintendo, Valve,
  Blizzard, Rockstar, CD PROJEKT RED, Ubisoft, EA, Bethesda, Riot, Larian, FromSoftware, Capcom, Paradox, KRAFTON, Facepunch
  a česká Warhorse, Bohemia Interactive, SCS Software, Hangar 13, Amanita Design, Keen Software House). Jen oficiální zdroje:
  YouTube kanál (ověřený podle jména autora v RSS – nesedí-li, nepoužije se), oficiální blog (PS Blog, Xbox Wire, blog SCS),
  oznámení vývojářů na Steamu (ISteamNews). Sběr v RSS Cronu, 2 studia na běh (≈ každé studio jednou za 3 h, ≤ 12 požadavků).
  Na Domů sekce **Nové trailery**. Deník AI má novou úlohu „Studia a platformy“.
- **Stránka hry**: graf vývoje ceny na Steamu (90 dní) a systémové požadavky PC ze Steamu.
- SEO: nové stránky v sitemap, vlastní titulky pro každé studio. Překlady SK/EN pro všechny nové texty.

## 2026-11-26 (odpoledne, 15) – Videa: YouTube kanály z popisů streamerů
- Videa se neukazovala, protože YouTube kanál šel zadat jen v adminu (zamčený). Nově se kanál bere i z popisu, který si
  streamer sám napsal na Twitchi/Kicku (odkaz `youtube.com/@…`, `/channel/…`, `/c/…`, `/user/…`; odkazy na videa ne).
  Nic se nedohledává podle jména. Odkaz z adminu má přednost.
- ID kanálu se čte ze stránky kanálu po kouscích a čtení skončí, jakmile se najde (šetří CPU). Až 4 nové kanály za hodinu,
  každý kanál se obnovuje po 3 h. Běh obsahu ≈ 36 požadavků z 50.
- Texty na Domů a `/o-webu` upraveny podle toho.

## 2026-11-26 (odpoledne, 14) – Přepínač jazyka CZ / SK / EN
- V hlavičce přepínač **CZ · SK · EN** (pamatuje se v prohlížeči, `hp_jazyk`; návštěvník se slovenským prohlížečem dostane
  napoprvé slovenštinu). Výchozí je čeština.
- `public/js/jazyk.js`: web se vykresluje česky a skript přeloží texty rozhraní přímo na stránce (i texty doplněné později –
  MutationObserver): slovník přesných textů (~300), vzory pro věty s čísly (deník AI, časy, počty), anglické zkratky čísel
  (1,5 tis. → 1.5k, Kč → CZK), nadpis stránky, popisky polí a hlášky.
- **Nepřekládá se obsah**: názvy her, jména streamerů, titulky streamů, zprávy a recenze z herních webů zůstávají v originále.
- Dlouhé stránky O webu a Soukromí jsou zatím jen česky – v SK/EN mají nahoře upozornění.
- Nové texty v rozhraní je potřeba doplnit do `SLOVNIK` nebo `FRAZE` v `public/js/jazyk.js` (jinak zůstanou česky).

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
