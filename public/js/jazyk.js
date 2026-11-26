// Přepínač jazyka: čeština (výchozí), slovenština, angličtina.
// Web se vykresluje česky a tento soubor přeloží texty rozhraní přímo na stránce (i ty, které se doplní později).
// Nepřekládá se obsah: názvy her, jména streamerů, titulky streamů a zprávy z herních webů zůstávají v originále.
// Volba se pamatuje v prohlížeči (localStorage hp_jazyk). Nové texty přidávej do SLOVNIK (přesná shoda) nebo FRAZE (věty s čísly).
(() => {
  "use strict";
  const JAZYKY = { cs: "CZ", sk: "SK", en: "EN" };
  let jazyk = "cs";
  try { jazyk = localStorage.getItem("hp_jazyk") || ""; } catch {}
  if (!JAZYKY[jazyk]) jazyk = /^sk\b/i.test(navigator.language || "") ? "sk" : "cs";
  window.HP_JAZYK = jazyk;

  // ---------- Přepínač v hlavičce ----------
  function prepinac() {
    const hlava = document.querySelector("header.top");
    if (!hlava || hlava.querySelector(".jazyky")) return;
    const el = document.createElement("div");
    el.className = "jazyky";
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", { cs: "Jazyk", sk: "Jazyk", en: "Language" }[jazyk]);
    for (const [k, v] of Object.entries(JAZYKY)) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = v; b.lang = k;
      b.className = "jz" + (k === jazyk ? " on" : "");
      b.setAttribute("aria-pressed", String(k === jazyk));
      b.addEventListener("click", () => {
        if (k === jazyk) return;
        try { localStorage.setItem("hp_jazyk", k); } catch {}
        location.reload();
      });
      el.appendChild(b);
    }
    const nav = hlava.querySelector("nav.tabs");
    if (nav) hlava.insertBefore(el, nav); else hlava.appendChild(el);
  }

  if (jazyk === "cs") { document.addEventListener("DOMContentLoaded", prepinac); return; }
  const I = jazyk === "sk" ? 0 : 1;
  document.documentElement.lang = jazyk;

  // ---------- Slovník: česky → [slovensky, anglicky] ----------
  const SLOVNIK = {
    // hlavička, menu, patička
    "Domů": ["Domov", "Home"], "Novinky": ["Novinky", "News"], "Streameři": ["Streameri", "Streamers"],
    "AI web": ["AI web", "AI site"], "Herní puls": ["Herní puls", "Herní puls"],
    "Web dělá AI – jak to funguje": ["Web robí AI – ako to funguje", "This site is run by AI – how it works"],
    "Soukromí a bezpečnost": ["Súkromie a bezpečnosť", "Privacy and security"], "Soukromí": ["Súkromie", "Privacy"],
    "Odkud jsou čísla": ["Odkiaľ sú čísla", "Where the numbers come from"],
    "Stav systému a deník AI": ["Stav systému a denník AI", "System status and AI log"],
    "· bez reklam, cookies a sledování ·": ["· bez reklám, cookies a sledovania ·", "· no ads, cookies or tracking ·"],
    "bez reklam, cookies a sledování": ["bez reklám, cookies a sledovania", "no ads, cookies or tracking"],
    "· bez cookies, bez sledování": ["· bez cookies, bez sledovania", "· no cookies, no tracking"],
    "📲 Nainstalovat jako aplikaci": ["📲 Nainštalovať ako aplikáciu", "📲 Install as an app"],
    "Novinky sbíráme z veřejných RSS kanálů herních webů a každá zpráva odkazuje na původní článek. Údaje o streamerech jsou z oficiálních API Twitche a Kicku. Web je ve zkušebním provozu.":
      ["Novinky zbierame z verejných RSS kanálov herných webov a každá správa odkazuje na pôvodný článok. Údaje o streameroch sú z oficiálnych API Twitchu a Kicku. Web je v skúšobnej prevádzke.",
       "News is collected from public RSS feeds of gaming sites and every story links to the original article. Streamer data comes from the official Twitch and Kick APIs. The site is in beta."],
    "Jak tenhle web funguje": ["Ako tento web funguje", "How this site works"],
    "← Zpět na web": ["← Späť na web", "← Back to the site"],

    // uvítání a Domů
    "Herní internet je roztroušený. My ho skládáme dohromady.": ["Herný internet je roztrúsený. My ho skladáme dohromady.", "Gaming info is scattered all over the internet. We put it together."],
    "Ceny na Steamu, hry zdarma na Epicu, zprávy na desítkách webů, streamy na Twitchi a Kicku – každé je jinde. Umělá inteligence to za tebe hlídá nonstop a skládá přehledně na jedno místo,":
      ["Ceny na Steame, hry zadarmo na Epicu, správy na desiatkach webov, streamy na Twitchi a Kicku – každé je inde. Umelá inteligencia to za teba stráži nonstop a skladá prehľadne na jedno miesto,",
       "Steam prices, free games on Epic, news on dozens of sites, streams on Twitch and Kick – everything is somewhere else. AI watches it for you around the clock and puts it neatly in one place,"],
    "abys už nemusel nic hledat": ["aby si už nemusel nič hľadať", "so you don't have to search anymore"],
    "Web navrhla, naprogramovala a provozuje AI. Čísla bere přímo z oficiálních zdrojů, ale občas se splete – když něco nesedí, dej nám vědět.":
      ["Web navrhla, naprogramovala a prevádzkuje AI. Čísla berie priamo z oficiálnych zdrojov, ale občas sa pomýli – keď niečo nesedí, daj nám vedieť.",
       "The site was designed, coded and is run by AI. It takes numbers straight from official sources, but sometimes gets things wrong – if something looks off, let us know."],
    "Jasně, jdu se podívat": ["Jasné, idem sa pozrieť", "Sure, let me look around"], "Jak to funguje": ["Ako to funguje", "How it works"],
    "Všechno o hrách na jednom místě": ["Všetko o hrách na jednom mieste", "Everything about games in one place"],
    "AI za tebe sbírá ceny, hry zdarma, zprávy a streamy z celého internetu.": ["AI za teba zbiera ceny, hry zadarmo, správy a streamy z celého internetu.", "AI collects prices, free games, news and streams from all over the internet for you."],
    "Má to češtinu?": ["Má to češtinu?", "Does it have Czech?"], "🔔 Hlídač cen": ["🔔 Strážca cien", "🔔 Price watch"], "Hlídač cen": ["Strážca cien", "Price watch"],
    "AI správce webu": ["AI správca webu", "AI site manager"], "deník AI": ["denník AI", "AI log"], "právě kontroluji obchody": ["práve kontrolujem obchody", "checking the stores right now"],
    "Hra týdne": ["Hra týždňa", "Game of the week"], "Další hry zdarma": ["Ďalšie hry zadarmo", "More free games"], "Hry zdarma": ["Hry zadarmo", "Free games"],
    "Příští týden zdarma na Epicu:": ["Budúci týždeň zadarmo na Epicu:", "Free on Epic next week:"],
    "Teď ji nikdo z českých streamerů nehraje.": ["Teraz ju nikto z českých streamerov nehrá.", "No Czech streamer is playing it right now."],
    "Právě ji hraje:": ["Práve ju hrá:", "Playing it now:"], "Píše se o ní:": ["Píše sa o nej:", "In the news:"],
    "Největší slevy": ["Najväčšie zľavy", "Biggest discounts"], "Nejhranější na Steamu": ["Najhrávanejšie na Steame", "Most played on Steam"],
    "Nejvyšší počet hráčů současně za poslední týden podle Steamu.": ["Najvyšší počet hráčov súčasne za posledný týždeň podľa Steamu.", "Peak concurrent players in the last week, according to Steam."],
    "Žebříček se načítá.": ["Rebríček sa načítava.", "Loading the chart."],
    "Nejprodávanější na Steamu": ["Najpredávanejšie na Steame", "Top sellers on Steam"], "Trendy na GOGu": ["Trendy na GOGu", "Trending on GOG"],
    "Nově vydané": ["Novo vydané", "New releases"], "Brzy vyjde": ["Čoskoro vyjde", "Coming soon"], "Nové": ["Nové", "New"], "Brzy": ["Čoskoro", "Soon"],
    "Ve slevě a česky ·": ["V zľave a po česky ·", "On sale with Czech ·"],
    "Hry s českým textem nebo dabingem (podle údajů na Steamu), které jsou právě ve slevě. Chceš upozornit na slevu konkrétní hry?":
      ["Hry s českým textom alebo dabingom (podľa údajov na Steame), ktoré sú práve v zľave. Chceš upozorniť na zľavu konkrétnej hry?", "Games with Czech text or dubbing (per Steam listings) that are on sale now. Want an alert for a specific game?"],
    "Co hraje Česko ·": ["Čo hrá Česko ·", "What Czechia plays ·"], "celý žebříček": ["celý rebríček", "full chart"], "report týdne": ["report týždňa", "weekly report"],
    "Hodiny sledování českých streamů na Twitchi a Kicku za posledních 7 dní.": ["Hodiny sledovania českých streamov na Twitchi a Kicku za posledných 7 dní.", "Watch hours of Czech streams on Twitch and Kick in the last 7 days."],
    "Recenze": ["Recenzie", "Reviews"], "Recenze píšou redakce uvedených webů, u každé je odkaz na celý článek.": ["Recenzie píšu redakcie uvedených webov, pri každej je odkaz na celý článok.", "Reviews are written by the listed sites; each links to the full article."],
    "Recenze se sbírají z herních webů – první se objeví, jakmile některý web vydá novou.": ["Recenzie sa zbierajú z herných webov – prvá sa objaví, keď niektorý web vydá novú.", "Reviews are collected from gaming sites – the first one appears as soon as a site publishes one."],
    "Klipy týdne": ["Klipy týždňa", "Clips of the week"], "Nejsledovanější klipy českých streamerů z Twitche za posledních 7 dní.": ["Najsledovanejšie klipy českých streamerov z Twitchu za posledných 7 dní.", "Most watched Twitch clips by Czech streamers in the last 7 days."],
    "Klipy se načítají jednou za hodinu.": ["Klipy sa načítavajú raz za hodinu.", "Clips are loaded once an hour."],
    "Nová videa streamerů": ["Nové videá streamerov", "New streamer videos"], "Nejnovější videa z YouTube kanálů českých streamerů. Kliknutím se otevře YouTube.": ["Najnovšie videá z YouTube kanálov českých streamerov. Kliknutím sa otvorí YouTube.", "Latest videos from Czech streamers' YouTube channels. Clicking opens YouTube."],
    "Zatím tu nejsou žádná videa. Kanály hledáme v popisech streamerů na Twitchi a Kicku (odkaz youtube.com/@…) a doplňují se postupně každou hodinu.": ["Zatiaľ tu nie sú žiadne videá. Kanály hľadáme v popisoch streamerov na Twitchi a Kicku (odkaz youtube.com/@…) a dopĺňajú sa postupne každú hodinu.", "No videos yet. We look for channels in streamers' Twitch and Kick bios (a youtube.com/@… link); they're added gradually every hour."],
    "Nejnovější zprávy ·": ["Najnovšie správy ·", "Latest news ·"], "všechny novinky": ["všetky novinky", "all news"], "Zprávy se načítají.": ["Správy sa načítavajú.", "Loading news."],
    "Teď tu nic není – obchody se načítají, zkus to za chvíli.": ["Teraz tu nič nie je – obchody sa načítavajú, skús to o chvíľu.", "Nothing here yet – the stores are loading, try again shortly."],
    "Teď žádná hra zdarma – podívej se na slevy.": ["Teraz žiadna hra zadarmo – pozri sa na zľavy.", "No free games right now – check the discounts."],
    "Klip": ["Klip", "Clip"], "Zdarma": ["Zadarmo", "Free"], "trvale": ["natrvalo", "forever"], "zatím se neprodává": ["zatiaľ sa nepredáva", "not on sale yet"],
    "Data ověřila AI z oficiálního zdroje": ["Dáta overila AI z oficiálneho zdroja", "Data verified by AI from the official source"],

    // čeština a hlídač
    "CZ dabing": ["CZ dabing", "Czech dub"], "CZ texty": ["CZ texty", "Czech text"], "bez češtiny": ["bez češtiny", "no Czech"], "čeština se ověřuje": ["čeština sa overuje", "checking Czech"],
    "Napiš název hry a hned uvidíš, jestli má český text nebo dabing, kolik stojí a jestli je ve slevě. Údaje o češtině bereme ze Steamu.":
      ["Napíš názov hry a hneď uvidíš, či má český text alebo dabing, koľko stojí a či je v zľave. Údaje o češtine berieme zo Steamu.",
       "Type a game's name to see whether it has Czech text or dubbing, what it costs and whether it's on sale. Language info comes from Steam."],
    "Hledat": ["Hľadať", "Search"], "Najít": ["Nájsť", "Find"], "Název hry": ["Názov hry", "Game title"],
    "Ve slevě s češtinou": ["V zľave s češtinou", "On sale with Czech"], "Zdarma s češtinou": ["Zadarmo s češtinou", "Free with Czech"], "S českým dabingem": ["S českým dabingom", "With Czech dubbing"], "Vše s češtinou": ["Všetko s češtinou", "All with Czech"],
    "Čeština podle údajů vydavatele na Steamu: „CZ texty“ = český text (rozhraní nebo titulky – Steam je v tomto seznamu nerozlišuje), „CZ dabing“ = Steam uvádí plnou podporu zvuku. Nejde o nezávisle ověřený stav hry. Ceny v Kč ze Steamu, kontrolujeme je několikrát denně; vždy platí cena v obchodě. Hry do databáze přibývají – když hru nenajdeš, hledání se zeptá přímo Steamu.":
      ["Čeština podľa údajov vydavateľa na Steame: „CZ texty“ = český text (rozhranie alebo titulky – Steam ich v tomto zozname nerozlišuje), „CZ dabing“ = Steam uvádza plnú podporu zvuku. Nejde o nezávisle overený stav hry. Ceny v Kč zo Steamu kontrolujeme niekoľkokrát denne; vždy platí cena v obchode. Hry do databázy pribúdajú – keď hru nenájdeš, vyhľadávanie sa opýta priamo Steamu.",
       "Czech support per the publisher's Steam listing: \"Czech text\" = Czech interface or subtitles (Steam's list doesn't tell them apart), \"Czech dub\" = Steam lists full audio. Not independently verified. Prices in CZK from Steam, checked several times a day; the store price always applies. Games are added continuously – if a game is missing, the search asks Steam directly."],
    "Databáze se teprve plní – zkus to za hodinu nebo hledej konkrétní hru.": ["Databáza sa ešte plní – skús to o hodinu alebo hľadaj konkrétnu hru.", "The database is still filling up – try in an hour or search for a specific game."],
    "Nic jsme nenašli. Zkus anglický název hry, jak je na Steamu.": ["Nič sme nenašli. Skús anglický názov hry, ako je na Steame.", "Nothing found. Try the English title as listed on Steam."],
    "Nic jsme nenašli – zkus anglický název ze Steamu.": ["Nič sme nenašli – skús anglický názov zo Steamu.", "Nothing found – try the English title from Steam."],
    "Hledání se nepovedlo, zkus to znovu.": ["Hľadanie sa nepodarilo, skús to znova.", "Search failed, please try again."],
    "Vyber si hry a my ti pošleme upozornění, až budou ve slevě nebo pod tvou cenou. Bez registrace a bez e-mailu – stačí povolit upozornění v prohlížeči.":
      ["Vyber si hry a my ti pošleme upozornenie, keď budú v zľave alebo pod tvojou cenou. Bez registrácie a bez e-mailu – stačí povoliť upozornenia v prehliadači.",
       "Pick games and we'll notify you when they're on sale or below your price. No sign-up, no e-mail – just allow notifications in your browser."],
    "Přidat hru – napiš název…": ["Pridať hru – napíš názov…", "Add a game – type its name…"], "Moje hlídané hry": ["Moje strážené hry", "My watched games"],
    "Zatím nic nehlídáš. Najdi hru výše nebo klikni na „Hlídat cenu“ u kterékoliv hry na webu.": ["Zatiaľ nič nestrážiš. Nájdi hru vyššie alebo klikni na „Strážiť cenu“ pri ktorejkoľvek hre na webe.", "You're not watching anything yet. Find a game above or tap \"Watch price\" on any game on the site."],
    "Ceny hlídaných her kontrolujeme každou hodinu přímo na Steamu (v Kč). Upozornění přijde jednou za slevu – a znovu, jen když cena klesne ještě níž. Hlídané hry jsou uložené u tvého odběru upozornění; vypnutím upozornění se smažou.":
      ["Ceny strážených hier kontrolujeme každú hodinu priamo na Steame (v Kč). Upozornenie príde raz za zľavu – a znova, len keď cena klesne ešte nižšie. Strážené hry sú uložené pri tvojom odbere upozornení; vypnutím upozornení sa zmažú.",
       "We check watched games' prices every hour directly on Steam (in CZK). You get one alert per sale – and another only if the price drops further. Watched games are stored with your notification subscription; turning notifications off deletes them."],
    "Tenhle prohlížeč upozornění nepodporuje. Na iPhonu si web nejdřív přidej na plochu (Sdílet → Přidat na plochu) a otevři ho odtamtud.":
      ["Tento prehliadač upozornenia nepodporuje. Na iPhone si web najprv pridaj na plochu (Zdieľať → Pridať na plochu) a otvor ho odtiaľ.", "This browser doesn't support notifications. On iPhone, first add the site to your home screen (Share → Add to Home Screen) and open it from there."],
    "🔔 Hlídat cenu": ["🔔 Strážiť cenu", "🔔 Watch price"], "🔔 Hlídám": ["🔔 Strážim", "🔔 Watching"], "Cílová cena": ["Cieľová cena", "Target price"],
    "Upozorním na jakoukoliv slevu": ["Upozorním na akúkoľvek zľavu", "I'll alert you on any discount"],
    "Pošleme upozornění, až bude ve slevě.": ["Pošleme upozornenie, keď bude v zľave.", "We'll notify you when it's on sale."],
    "Hlídám cenu": ["Strážim cenu", "Watching the price"], "Dám ti vědět, až bude ve slevě.": ["Dám ti vedieť, keď bude v zľave.", "I'll let you know when it's on sale."],
    "Hlídání zrušeno": ["Stráženie zrušené", "Watch removed"], "Nejde to": ["Nejde to", "That didn't work"], "Zkus to znovu.": ["Skús to znova.", "Please try again."],
    "Nepodařilo se uložit.": ["Nepodarilo sa uložiť.", "Couldn't save."], "Neplatná cena": ["Neplatná cena", "Invalid price"], "Zadej číslo, např. 299.": ["Zadaj číslo, napr. 299.", "Enter a number, e.g. 299."],
    "nejnižší cena za 90 dní": ["najnižšia cena za 90 dní", "lowest price in 90 days"],

    // stránka hry
    "← Co hraje Česko": ["← Čo hrá Česko", "← What Czechia plays"], "Kde koupit": ["Kde kúpiť", "Where to buy"], "Čeština": ["Čeština", "Czech"],
    "✓ dabing i titulky": ["✓ dabing aj titulky", "✓ dubbing and subtitles"], "✓ texty (rozhraní nebo titulky)": ["✓ texty (rozhranie alebo titulky)", "✓ text (interface or subtitles)"], "Čeština (podle Steamu)": ["Čeština (podľa Steamu)", "Czech (per Steam)"], "✗ bez češtiny": ["✗ bez češtiny", "✗ no Czech"],
    "Hodnocení hráčů": ["Hodnotenie hráčov", "Player rating"], "Hodnocení GOG": ["Hodnotenie GOG", "GOG rating"], "Hraje právě teď": ["Hrá práve teraz", "Playing right now"],
    "Vydáno": ["Vydané", "Released"], "Vyjde": ["Vyjde", "Release"], "Žánr": ["Žáner", "Genre"], "Vývojář": ["Vývojár", "Developer"],
    "Na českých streamech": ["Na českých streamoch", "On Czech streams"], "hodin sledování za 7 dní": ["hodín sledovania za 7 dní", "watch hours in 7 days"], "diváků ve špičce": ["divákov v špičke", "peak viewers"],
    "Hodiny sledování po dnech za posledních 30 dní (od začátku měření).": ["Hodiny sledovania po dňoch za posledných 30 dní (od začiatku merania).", "Daily watch hours over the last 30 days (since measuring began)."],
    "Právě živě": ["Práve naživo", "Live now"], "Nejlepší klipy": ["Najlepšie klipy", "Top clips"], "Kdo hraje nejvíc": ["Kto hrá najviac", "Who plays it most"], "Novinky a recenze": ["Novinky a recenzie", "News and reviews"],
    "Teď nikdo z českých streamerů nevysílá": ["Teraz nikto z českých streamerov nevysiela", "No Czech streamer is live right now"],
    "Údaje z obchodů se načítají – zkus stránku obnovit za chvíli.": ["Údaje z obchodov sa načítavajú – skús stránku obnoviť o chvíľu.", "Loading store data – try refreshing in a moment."],
    "Tuhle hru jsme v obchodech Steam, GOG ani Epic pod stejným názvem nenašli (může jít o kategorii jako „Just Chatting“ nebo hru z jiného obchodu).":
      ["Túto hru sme v obchodoch Steam, GOG ani Epic pod rovnakým názvom nenašli (môže ísť o kategóriu ako „Just Chatting“ alebo hru z iného obchodu).", "We couldn't find this game on Steam, GOG or Epic under the same name (it may be a category like \"Just Chatting\" or a game from another store)."],
    "Hru jsme nenašli.": ["Hru sme nenašli.", "Game not found."], "Sdílet jako obrázek": ["Zdieľať ako obrázok", "Share as image"], "Sdílet odkaz": ["Zdieľať odkaz", "Share link"],
    "Jak počítáme": ["Ako počítame", "How we count"], "(Steam)": ["(Steam)", "(Steam)"],

    // Co hraje Česko, report
    "Co hraje Česko": ["Čo hrá Česko", "What Czechia plays"], "Report týdne": ["Report týždňa", "Weekly report"], "Report": ["Report", "Report"],
    "Týden na české scéně": ["Týždeň na českej scéne", "The week on the Czech scene"], "Rostou": ["Rastú", "Rising"], "Nově se hraje": ["Nové hry", "Newly played"],
    "Právě se hraje": ["Práve sa hrá", "Being played now"], "nové": ["nové", "new"], "≈ stejně": ["≈ rovnako", "≈ same"],
    "Žebříček se plní – první čísla budou do 15 minut.": ["Rebríček sa plní – prvé čísla budú do 15 minút.", "The chart is filling up – first numbers within 15 minutes."],
    "Statistiky her se začaly sbírat právě teď – první čísla uvidíš do 15 minut.": ["Štatistiky hier sa začali zbierať práve teraz – prvé čísla uvidíš do 15 minút.", "Game stats just started collecting – first numbers within 15 minutes."],
    "hodin sledování": ["hodín sledovania", "watch hours"], "diváků v průměru": ["divákov v priemere", "average viewers"], "aktivních kanálů": ["aktívnych kanálov", "active channels"],
    "Nejsledovanější hry": ["Najsledovanejšie hry", "Most watched games"], "Nejvíc diváků najednou": ["Najviac divákov naraz", "Most viewers at once"],
    "Nejdéle vysílali": ["Najdlhšie vysielali", "Streamed the longest"], "Nejvíc nových sledujících": ["Najviac nových sledujúcich", "Most new followers"],
    "Rekordy a milníky": ["Rekordy a míľniky", "Records and milestones"], "Tento týden": ["Tento týždeň", "This week"],
    "Zatím bez dat.": ["Zatiaľ bez dát.", "No data yet."], "Za tento týden zatím nemáme dost dat.": ["Za tento týždeň zatiaľ nemáme dosť dát.", "Not enough data for this week yet."],
    "Report se nepodařilo načíst.": ["Report sa nepodarilo načítať.", "Couldn't load the report."],
    "Všechna čísla jsou z vlastních měření oficiálních API Twitche a Kicku každých 15 minut. Aktivní kanál = vysílal aspoň chvíli s 3 a více diváky.":
      ["Všetky čísla sú z vlastných meraní oficiálnych API Twitchu a Kicku každých 15 minút. Aktívny kanál = vysielal aspoň chvíľu s 3 a viac divákmi.", "All numbers come from our own measurements of the official Twitch and Kick APIs every 15 minutes. Active channel = streamed at least briefly with 3+ viewers."],
    "Hodiny sledování = součet diváků ze všech českých streamů na Twitchi a Kicku, měřený každých 15 minut z jejich oficiálních API.":
      ["Hodiny sledovania = súčet divákov zo všetkých českých streamov na Twitchi a Kicku, meraný každých 15 minút z ich oficiálnych API.", "Watch hours = total viewers across all Czech streams on Twitch and Kick, measured every 15 minutes via their official APIs."],
    "sledujících": ["sledujúcich", "followers"], "diváků": ["divákov", "viewers"], "hodin": ["hodín", "hours"], "hráčů": ["hráčov", "players"],

    // streameři
    "Živě": ["Naživo", "Live"], "ŽIVĚ": ["NAŽIVO", "LIVE"], "Žebříček": ["Rebríček", "Ranking"], "Přehled": ["Prehľad", "Overview"], "Porovnat": ["Porovnať", "Compare"],
    "Porovnat streamery": ["Porovnať streamerov", "Compare streamers"], "Vyber dva streamery a porovnej je vedle sebe.": ["Vyber dvoch streamerov a porovnaj ich vedľa seba.", "Pick two streamers and compare them side by side."],
    "Hledat streamera podle jména": ["Hľadať streamera podľa mena", "Search streamers by name"], "Najdi streamera": ["Nájdi streamera", "Find a streamer"],
    "Všechny platformy": ["Všetky platformy", "All platforms"], "Všechny kategorie": ["Všetky kategórie", "All categories"], "Všechno": ["Všetko", "Everything"], "Vše": ["Všetko", "All"], "všichni": ["všetci", "everyone"],
    "Malí streameři (do 50 diváků)": ["Malí streameri (do 50 divákov)", "Small streamers (up to 50 viewers)"],
    "Povídání a IRL": ["Rozprávanie a IRL", "Just Chatting & IRL"], "Střílečky": ["Strieľačky", "Shooters"], "Strategie a MMO": ["Stratégie a MMO", "Strategy & MMO"],
    "Závody a sport": ["Preteky a šport", "Racing & sports"], "Sandbox a přežití": ["Sandbox a prežitie", "Sandbox & survival"], "Ostatní": ["Ostatné", "Other"],
    "Sledující": ["Sledujúci", "Followers"], "Rekord diváků": ["Rekord divákov", "Peak viewers"], "Odvysíláno (30 dní)": ["Odvysielané (30 dní)", "Streamed (30 days)"], "Růst (30 dní)": ["Rast (30 dní)", "Growth (30 days)"],
    "Seznam se právě plní. Streameři se objeví, jakmile je zachytíme živě (do 15 minut).": ["Zoznam sa práve plní. Streameri sa objavia, keď ich zachytíme naživo (do 15 minút).", "The list is filling up. Streamers appear once we catch them live (within 15 minutes)."],
    "Nikoho takového jsme nenašli.": ["Nikoho takého sme nenašli.", "No one found."], "Nikoho jsme nenašli.": ["Nikoho sme nenašli.", "No one found."],
    "Seznam se nepodařilo načíst.": ["Zoznam sa nepodarilo načítať.", "Couldn't load the list."],
    "Údaje z oficiálních API Twitche a Kicku. Počty sledujících (jen Twitch) se obnovují denně. Růst a odvysílané hodiny počítáme z vlastních denních záznamů.":
      ["Údaje z oficiálnych API Twitchu a Kicku. Počty sledujúcich (len Twitch) sa obnovujú denne. Rast a odvysielané hodiny počítame z vlastných denných záznamov.", "Data from the official Twitch and Kick APIs. Follower counts (Twitch only) refresh daily. Growth and hours streamed come from our own daily records."],
    "← Všichni streameři": ["← Všetci streameri", "← All streamers"], "☆ Přidat do oblíbených": ["☆ Pridať do obľúbených", "☆ Add to favourites"], "★ Oblíbený": ["★ Obľúbený", "★ Favourite"],
    "Upozornit, až začne vysílat": ["Upozorniť, keď začne vysielať", "Notify me when live"], "Upozornění zapnutá": ["Upozornenia zapnuté", "Notifications on"],
    "Právě vysílá": ["Práve vysiela", "Live now"], "odvysíláno za 30 dní": ["odvysielané za 30 dní", "streamed in 30 days"], "rekord diváků": ["rekord divákov", "peak viewers"],
    "Vývoj sledujících": ["Vývoj sledujúcich", "Follower growth"], "Nejčastěji hrané hry": ["Najčastejšie hrané hry", "Most played games"], "Rozvrh streamů": ["Rozvrh streamov", "Stream schedule"],
    "Nejlepší klipy za 30 dní": ["Najlepšie klipy za 30 dní", "Top clips (30 days)"], "Tvoji oblíbení": ["Tvoji obľúbení", "Your favourites"], "Teď se děje": ["Teraz sa deje", "Happening now"],
    "Streamer nenalezen.": ["Streamer sa nenašiel.", "Streamer not found."], "Zpět na seznam": ["Späť na zoznam", "Back to the list"],
    "Odebráno z oblíbených.": ["Odobraté z obľúbených.", "Removed from favourites."], "Nový oblíbený streamer": ["Nový obľúbený streamer", "New favourite streamer"],
    "Achievement: První oblíbený!": ["Achievement: Prvý obľúbený!", "Achievement: First favourite!"],
    "Upozornění jsou v prohlížeči zakázaná. Povol je v nastavení webu a zkus to znovu.": ["Upozornenia sú v prehliadači zakázané. Povoľ ich v nastaveniach webu a skús to znova.", "Notifications are blocked in your browser. Allow them in site settings and try again."],
    "Upozornění se nepodařilo zapnout.": ["Upozornenia sa nepodarilo zapnúť.", "Couldn't turn on notifications."],
    "Teď nikdo nevysílá – mrkni na žebříček nebo hry.": ["Teraz nikto nevysiela – pozri rebríček alebo hry.", "Nobody's live right now – check the ranking or games."],
    "Teď nikdo z českých streamerů nevysílá (nebo se seznam teprve načítá).": ["Teraz nikto z českých streamerov nevysiela (alebo sa zoznam ešte načítava).", "No Czech streamer is live right now (or the list is still loading)."],
    "Přehled české scény": ["Prehľad českej scény", "Czech scene overview"], "Milníky a rekordy": ["Míľniky a rekordy", "Milestones and records"], "Kalendář: dnes a zítra": ["Kalendár: dnes a zajtra", "Calendar: today and tomorrow"],
    "Nejvíc vyrostli": ["Najviac narástli", "Grew the most"], "Nejvíc odvysílali": ["Najviac odvysielali", "Streamed the most"], "Nejhranější hry": ["Najhrávanejšie hry", "Most played games"],
    "Diváci českých streamů za 7 dní": ["Diváci českých streamov za 7 dní", "Czech stream viewers over 7 days"], "Přehled se nepodařilo načíst.": ["Prehľad sa nepodarilo načítať.", "Couldn't load the overview."],
    "Zatím málo dat – vrať se za pár dní.": ["Zatiaľ málo dát – vráť sa o pár dní.", "Not much data yet – come back in a few days."], "Zatím málo dat.": ["Zatiaľ málo dát.", "Not much data yet."],
    "Graf se začne plnit s každým během sběru (každých 15 minut).": ["Graf sa začne plniť s každým zberom (každých 15 minút).", "The chart fills up with every collection run (every 15 minutes)."],
    "Až někdo překoná rekord nebo milník sledujících, uvidíš to tady.": ["Keď niekto prekoná rekord alebo míľnik sledujúcich, uvidíš to tu.", "When someone breaks a record or follower milestone, you'll see it here."],
    "Kalendář bere rozvrhy, které si streameři nastavili na Twitchi. Plní se postupně.": ["Kalendár berie rozvrhy, ktoré si streameri nastavili na Twitchi. Plní sa postupne.", "The calendar uses schedules streamers set on Twitch. It fills up gradually."],
    "Přehled počítáme z vlastních záznamů od začátku provozu webu. Čím déle web běží, tím přesnější je.": ["Prehľad počítame z vlastných záznamov od začiatku prevádzky webu. Čím dlhšie web beží, tým je presnejší.", "The overview is computed from our own records since the site launched. The longer it runs, the more accurate it gets."],
    "Nejhranější hra": ["Najhrávanejšia hra", "Most played game"], "Profil": ["Profil", "Profile"], "Změnit": ["Zmeniť", "Change"], "vs": ["vs", "vs"],

    // novinky a články
    "Herní novinky": ["Herné novinky", "Gaming news"], "Ze zahraničí": ["Zo zahraničia", "International"], "České weby": ["České weby", "Czech sites"],
    "Hledat ve zprávách": ["Hľadať v správach", "Search news"], "Platforma": ["Platforma", "Platform"], "Odkud": ["Odkiaľ", "Source"],
    "Co je nového ve světě her – nejčerstvější zprávy nahoře, obnovuje se samo.": ["Čo je nové vo svete hier – najčerstvejšie správy hore, obnovuje sa samo.", "What's new in gaming – freshest news on top, updates automatically."],
    "Sběr novinek právě běží. První zprávy se objeví do 15 minut.": ["Zber noviniek práve beží. Prvé správy sa objavia do 15 minút.", "News collection is running. First stories appear within 15 minutes."],
    "Oznámení a vydání": ["Oznámenia a vydania", "Announcements & releases"], "Streamování": ["Streamovanie", "Streaming"],
    "← Zpět na novinky": ["← Späť na novinky", "← Back to news"], "Zpět na novinky": ["Späť na novinky", "Back to news"], "Článek nenalezen.": ["Článok sa nenašiel.", "Article not found."], "Článek nenalezen": ["Článok sa nenašiel", "Article not found"],
    "Zpráva byla automaticky převzata z RSS kanálu zdroje. Celý článek najdeš u autora.": ["Správa bola automaticky prevzatá z RSS kanála zdroja. Celý článok nájdeš u autora.", "This story was automatically taken from the source's RSS feed. Read the full article at the source."],
    "Článek napsala AI na základě uvedených zdrojů a prošel automatickou kontrolou faktů.": ["Článok napísala AI na základe uvedených zdrojov a prešiel automatickou kontrolou faktov.", "This article was written by AI from the listed sources and passed an automatic fact check."],
    "Článek redakce Herní puls.": ["Článok redakcie Herní puls.", "Article by the Herní puls team."],
    "České herní weby zatím nedodávají zprávy – ověřujeme jejich RSS kanály. Do té doby tu najdeš jen články Herního pulsu.": ["České herné weby zatiaľ nedodávajú správy – overujeme ich RSS kanály. Dovtedy tu nájdeš len články Herného pulzu.", "Czech gaming sites aren't delivering news yet – we're checking their RSS feeds. Until then you'll only find Herní puls articles here."],

    // stav, 404
    "Stav systému a deník AI | Herní puls": ["Stav systému a denník AI | Herní puls", "System status and AI log | Herní puls"],
    "Web provozuje AI. Tady je vidět, co právě dělá a jestli všechno běží – bez přikrášlování, včetně chyb.": ["Web prevádzkuje AI. Tu je vidieť, čo práve robí a či všetko beží – bez prikrášľovania, vrátane chýb.", "This site is run by AI. Here you can see what it's doing and whether everything works – no sugar-coating, errors included."],
    "Všechno běží": ["Všetko beží", "All systems running"], "Něco nejede, jak má": ["Niečo nejde, ako má", "Something isn't working"],
    "Běží": ["Beží", "Running"], "Zpožděno": ["Oneskorené", "Delayed"], "Stojí": ["Stojí", "Stopped"], "Chyba": ["Chyba", "Error"], "Čeká na první běh": ["Čaká na prvý beh", "Waiting for first run"],
    "Novinky z herních webů": ["Novinky z herných webov", "News from gaming sites"], "Streameři na Twitchi": ["Streameri na Twitchi", "Streamers on Twitch"], "Streameři na Kicku": ["Streameri na Kicku", "Streamers on Kick"],
    "Obchody Steam, Epic a GOG": ["Obchody Steam, Epic a GOG", "Steam, Epic and GOG stores"], "Videa, klipy, ceny a čeština": ["Videá, klipy, ceny a čeština", "Videos, clips, prices and Czech support"], "Psaní článků (AI)": ["Písanie článkov (AI)", "Article writing (AI)"],
    "Běží jen v nastavené hodiny.": ["Beží len v nastavené hodiny.", "Runs only at set hours."], "Zatím bez záznamu.": ["Zatiaľ bez záznamu.", "No entries yet."],
    "Deník AI": ["Denník AI", "AI log"], "Deník se začne plnit s prvním během úloh (do 15 minut).": ["Denník sa začne plniť s prvým behom úloh (do 15 minút).", "The log starts filling with the first task run (within 15 minutes)."],
    "Každá automatická úloha po doběhnutí zapíše jednu větu, co udělala. Deník se drží 7 dní.": ["Každá automatická úloha po dobehnutí zapíše jednu vetu, čo urobila. Denník sa drží 7 dní.", "Every automated task writes one sentence about what it did. The log is kept for 7 days."],
    "Stav se nepodařilo načíst.": ["Stav sa nepodarilo načítať.", "Couldn't load the status."],
    "Tuhle stránku AI nenašla": ["Túto stránku AI nenašla", "The AI couldn't find this page"], "Odkaz je asi starý nebo má překlep. Zkus začít tady:": ["Odkaz je asi starý alebo má preklep. Skús začať tu:", "The link may be old or mistyped. Try starting here:"],
    "Domů – hry zdarma a slevy": ["Domov – hry zadarmo a zľavy", "Home – free games and deals"], "Kdo je živě": ["Kto je naživo", "Who's live"],
    // sekce Hry
    "Hry": ["Hry", "Games"], "Kalendář vydání": ["Kalendár vydaní", "Release calendar"], "Akce a odpočty": ["Akcie a odpočty", "Events & countdowns"],
    "Studia": ["Štúdiá", "Studios"], "Kalendář vydání her": ["Kalendár vydaní hier", "Game release calendar"],
    "Co vychází, kdy a na čem – a jestli bude hra v češtině.": ["Čo vychádza, kedy a na čom – a či bude hra v češtine.", "What's coming out, when, on which platforms – and whether it will have Czech."],
    "Všechny": ["Všetky", "All"], "Jen s češtinou": ["Len s češtinou", "Czech only"], "Jen s přesným datem": ["Len s presným dátumom", "Exact date only"],
    "čeština zatím neoznámena": ["čeština zatiaľ neoznámená", "Czech not announced"], "IGDB": ["IGDB", "IGDB"],
    "Žádná hra neodpovídá filtru.": ["Žiadna hra nezodpovedá filtru.", "No game matches the filter."],
    "Kalendář se načítá z databáze IGDB – zkus to za chvíli.": ["Kalendár sa načítava z databázy IGDB – skús to o chvíľu.", "Loading the calendar from IGDB – try again shortly."],
    "Výprodeje, herní přenosy a veletrhy – s přesným odpočtem podle oficiálních termínů.": ["Výpredaje, herné prenosy a veľtrhy – s presným odpočtom podľa oficiálnych termínov.", "Sales, game showcases and expos – with exact countdowns based on official dates."],
    "Výprodej": ["Výpredaj", "Sale"], "Festival her": ["Festival hier", "Game festival"], "Přenos": ["Prenos", "Showcase"], "Veletrh": ["Veľtrh", "Expo"], "Hra zdarma": ["Hra zadarmo", "Free game"],
    "Oficiální web": ["Oficiálny web", "Official site"], "zdroj termínu": ["zdroj termínu", "date source"], "Obchod Epic": ["Obchod Epic", "Epic Store"],
    "Ohlášené přenosy": ["Ohlásené prenosy", "Announced showcases"], "Předplatné: PS Plus a Game Pass": ["Predplatné: PS Plus a Game Pass", "Subscriptions: PS Plus & Game Pass"],
    "Až PlayStation, Xbox nebo Nintendo ohlásí přenos (State of Play, Nintendo Direct, Showcase), objeví se tady z jejich oficiálních kanálů.": ["Keď PlayStation, Xbox alebo Nintendo ohlási prenos (State of Play, Nintendo Direct, Showcase), objaví sa tu z ich oficiálnych kanálov.", "When PlayStation, Xbox or Nintendo announce a showcase (State of Play, Nintendo Direct, Showcase), it shows up here from their official channels."],
    "Novinky o hrách v PlayStation Plus a Xbox Game Pass se načítají z oficiálních blogů PlayStation a Xbox.": ["Novinky o hrách v PlayStation Plus a Xbox Game Pass sa načítavajú z oficiálnych blogov PlayStation a Xbox.", "PlayStation Plus and Xbox Game Pass news is loaded from the official PlayStation and Xbox blogs."],
    "Termíny akcí jen podle oficiálních oznámení pořadatelů (u každé je odkaz na zdroj). Časy jsou v našem časovém pásmu. Přenosy a předplatné z oficiálních blogů a kanálů platforem.": ["Termíny akcií len podľa oficiálnych oznámení organizátorov (pri každej je odkaz na zdroj). Časy sú v našom časovom pásme. Prenosy a predplatné z oficiálnych blogov a kanálov platforiem.", "Event dates only from organisers' official announcements (each links to its source). Times are in your time zone. Showcases and subscriptions come from the platforms' official blogs and channels."],
    "Steam zimní výprodej 2026": ["Steam zimný výpredaj 2026", "Steam Winter Sale 2026"], "Steam jarní výprodej 2027": ["Steam jarný výpredaj 2027", "Steam Spring Sale 2027"], "Steam letní výprodej 2027": ["Steam letný výpredaj 2027", "Steam Summer Sale 2027"],
    "Steam Next Fest (únor 2027)": ["Steam Next Fest (február 2027)", "Steam Next Fest (February 2027)"], "Steam Next Fest (červen 2027)": ["Steam Next Fest (jún 2027)", "Steam Next Fest (June 2027)"],
    "Ceny za hry roku a světové premiéry trailerů.": ["Ceny za hry roka a svetové premiéry trailerov.", "Game of the year awards and world premiere trailers."],
    "Největší výprodej roku na Steamu a hlasování Steam Awards.": ["Najväčší výpredaj roka na Steame a hlasovanie Steam Awards.", "Steam's biggest sale of the year and Steam Awards voting."],
    "Týden dem chystaných her zdarma.": ["Týždeň dem pripravovaných hier zadarmo.", "A week of free demos of upcoming games."], "Sezónní výprodej na Steamu.": ["Sezónny výpredaj na Steame.", "Seasonal Steam sale."],
    "Velký letní výprodej na Steamu.": ["Veľký letný výpredaj na Steame.", "The big Steam summer sale."], "Úvodní přenos veletrhu plný oznámení a trailerů.": ["Úvodný prenos veľtrhu plný oznámení a trailerov.", "The expo's opening show full of announcements and trailers."],
    "Největší herní veletrh na světě.": ["Najväčší herný veľtrh na svete.", "The world's biggest games expo."], "Kolín nad Rýnem": ["Kolín nad Rýnom", "Cologne"],
    "Kolín nad Rýnem, živě online": ["Kolín nad Rýnom, naživo online", "Cologne, live online"], "Los Angeles, živě online": ["Los Angeles, naživo online", "Los Angeles, live online"],
    "Studia a platformy": ["Štúdiá a platformy", "Studios and platforms"], "Oficiální novinky, trailery a oznámení přímo od tvůrců her.": ["Oficiálne novinky, trailery a oznámenia priamo od tvorcov hier.", "Official news, trailers and announcements straight from game makers."],
    "Všechna": ["Všetky", "All"], "Česká studia": ["České štúdiá", "Czech studios"], "Platformy": ["Platformy", "Platforms"],
    "platforma": ["platforma", "platform"], "vydavatel": ["vydavateľ", "publisher"], "studio": ["štúdio", "studio"],
    "Nejnovější trailery a videa": ["Najnovšie trailery a videá", "Latest trailers and videos"], "Oficiální novinky a oznámení": ["Oficiálne novinky a oznámenia", "Official news and announcements"],
    "Novinky studií se načítají postupně – každé studio zhruba jednou za 3 hodiny.": ["Novinky štúdií sa načítavajú postupne – každé štúdio zhruba raz za 3 hodiny.", "Studio news loads gradually – each studio roughly every 3 hours."],
    "Jen oficiální zdroje: YouTube kanály studií (ověřené podle názvu kanálu), jejich blogy a oznámení vývojářů na Steamu. Kliknutím otevřeš originál.": ["Len oficiálne zdroje: YouTube kanály štúdií (overené podľa názvu kanála), ich blogy a oznámenia vývojárov na Steame. Kliknutím otvoríš originál.", "Official sources only: studio YouTube channels (verified by channel name), their blogs and developer announcements on Steam. Tap to open the original."],
    "← Studia a platformy": ["← Štúdiá a platformy", "← Studios and platforms"], "Trailery a videa": ["Trailery a videá", "Trailers and videos"], "Novinky a oznámení": ["Novinky a oznámenia", "News and announcements"],
    "Zatím nic – oficiální zdroje se kontrolují zhruba jednou za 3 hodiny.": ["Zatiaľ nič – oficiálne zdroje sa kontrolujú zhruba raz za 3 hodiny.", "Nothing yet – official sources are checked roughly every 3 hours."],
    "Obsah pochází z oficiálních kanálů studia (YouTube, blog, oznámení na Steamu) a vede na originál.": ["Obsah pochádza z oficiálnych kanálov štúdia (YouTube, blog, oznámenia na Steame) a vedie na originál.", "Content comes from the studio's official channels (YouTube, blog, Steam announcements) and links to the original."],
    "Nové trailery ·": ["Nové trailery ·", "New trailers ·"], "studia a platformy": ["štúdiá a platformy", "studios and platforms"], "Z oficiálních YouTube kanálů platforem a studií.": ["Z oficiálnych YouTube kanálov platforiem a štúdií.", "From the official YouTube channels of platforms and studios."],
    "Steam": ["Steam", "Steam"], "Blog": ["Blog", "Blog"], "oznámení na Steamu": ["oznámenie na Steame", "Steam announcement"], "oficiální blog": ["oficiálny blog", "official blog"],
    "Vývoj ceny na Steamu": ["Vývoj ceny na Steame", "Steam price history"], "Nejnižší cena každého dne za posledních 90 dní (od začátku sledování), v Kč.": ["Najnižšia cena každého dňa za posledných 90 dní (od začiatku sledovania), v Kč.", "Lowest daily price over the last 90 days (since tracking began), in CZK."],
    "Systémové požadavky (PC)": ["Systémové požiadavky (PC)", "System requirements (PC)"], "Minimální": ["Minimálne", "Minimum"], "Doporučené": ["Odporúčané", "Recommended"], "Podle stránky hry na Steamu.": ["Podľa stránky hry na Steame.", "From the game's Steam page."],
    "probíhá · končí za": ["prebieha · končí o", "live · ends in"], "za": ["o", "in"], "Právě probíhá · končí za": ["Práve prebieha · končí o", "Live now · ends in"], "Začíná za": ["Začína o", "Starts in"],
    "Zdarma na Epicu za": ["Zadarmo na Epicu o", "Free on Epic in"], "teď": ["teraz", "now"],
    "Otevřít web studia": ["Otvoriť web štúdia", "Visit studio website"], "← Hry": ["← Hry", "← Games"],
    "Tuhle hru zatím nikdo z českých streamerů nevysílal (od začátku našeho měření). Jakmile ji někdo začne hrát, objeví se tu statistiky.": ["Túto hru zatiaľ nikto z českých streamerov nevysielal (od začiatku nášho merania). Keď ju niekto začne hrať, objavia sa tu štatistiky.", "No Czech streamer has played this game yet (since we started measuring). Stats will appear once someone does."],
    "Odvysíláno (naše měření)": ["Odvysielané (naše meranie)", "Streamed (our measurement)"], "Růst (naše měření)": ["Rast (naše meranie)", "Growth (our measurement)"],
    "Odvysíláno (naše měření, max. 30 dní)": ["Odvysielané (naše meranie, max. 30 dní)", "Streamed (our measurement, max. 30 days)"],
    "Kick je ve svém oficiálním API nezveřejňuje": ["Kick ich vo svojom oficiálnom API nezverejňuje", "Kick doesn't publish them in its official API"],
    "doplní se do 24 h": ["doplní sa do 24 h", "added within 24 h"], "nejvíc diváků najednou": ["najviac divákov naraz", "most viewers at once"],
    "od té doby ho měříme my": ["odvtedy ho meriame my", "since we started measuring"], "Poslední vysílání": ["Posledné vysielania", "Recent broadcasts"],
    "zhlédnutí": ["zhliadnutí", "views"], "Vysílání": ["Vysielanie", "Broadcast"],
    "Ze záznamů vysílání na Twitchi. Twitch je drží jen omezeně (partneři 60 dní, affiliate 14 dní, ostatní 7 dní) a jen když je má streamer zapnuté – starší vysílání tu proto chybí.": ["Zo záznamov vysielaní na Twitchi. Twitch ich drží len obmedzene (partneri 60 dní, affiliate 14 dní, ostatní 7 dní) a len keď ich má streamer zapnuté – staršie vysielania tu preto chýbajú.", "From Twitch past broadcasts. Twitch keeps them only for a limited time (partners 60 days, affiliates 14, others 7) and only if the streamer has them enabled – older streams are therefore missing."],
    "Tenhle streamer nemá na Twitchi uložené záznamy vysílání, takže historii před začátkem našeho měření neznáme.": ["Tento streamer nemá na Twitchi uložené záznamy vysielaní, takže históriu pred začiatkom nášho merania nepoznáme.", "This streamer has no saved past broadcasts on Twitch, so we don't know their history before we started measuring."],
    "Teď nejsi připojený k internetu": ["Teraz nie si pripojený na internet", "You're offline"], "Nainstalováno": ["Nainštalované", "Installed"], "Herní puls najdeš na ploše.": ["Herní puls nájdeš na ploche.", "Find Herní puls on your home screen."],
  };

  // ---------- Věty s čísly a proměnnými částmi: [vzor, slovensky, anglicky] ----------
  const FRAZE = [
    [/^Zdarma na (.+?) – ještě (.+)$/, "Zadarmo na $1 – ešte $2", "Free on $1 – $2 left"],
    [/^ještě (\d+) d (\d+) h$/, "ešte $1 d $2 h", "$1 d $2 h left"], [/^ještě (\d+) h (\d+) min$/, "ešte $1 h $2 min", "$1 h $2 min left"],
    [/^Sleva −(\d+) % na (.+)$/, "Zľava −$1 % na $2", "−$1 % off on $2"],
    [/^(\d+) (?:hra|hry|her) zdarma$/, (m) => `${m[1]} ${+m[1] === 1 ? "hra" : +m[1] < 5 ? "hry" : "hier"} zadarmo`, (m) => `${m[1]} free game${+m[1] === 1 ? "" : "s"}`],
    [/^slevy až$/, "zľavy až", "deals up to"], [/^nejhranější:$/, "najhrávanejšia:", "most played:"],
    [/^obchody zkontrolovány v (\S+), další kontrola v (\S+)$/, "obchody skontrolované o $1, ďalšia kontrola o $2", "stores checked at $1, next check at $2"],
    [/^sleduji (\d+) (?:živý stream|živé streamy|živých streamů) \((\S+)\)$/, "sledujem $1 živých streamov ($2)", "watching $1 live streams ($2)"],
    [/^čtu zprávy z (\d+) webů?$/, "čítam správy z $1 webov", "reading news from $1 sites"],
    [/^👍 (\d+) % z (.+) recenzí$/, "👍 $1 % z $2 recenzií", "👍 $1 % of $2 reviews"],
    [/^(.+) hráčů na Steamu \(celý svět\)$/, "$1 hráčov na Steame (celý svet)", "$1 players on Steam (worldwide)"],
    [/^(.+) hráčů$/, "$1 hráčov", "$1 players"], [/^(.+) zhlédnutí · (.+)$/, "$1 zhliadnutí · $2", "$1 views · $2"],
    [/^(\d+) (streamer|streameři|streamerů) · špička (.+?) diváků(?: · Kick (\d+) %)?$/, (m) => `${m[1]} streamerov · špička ${m[3]} divákov${m[4] ? ` · Kick ${m[4]} %` : ""}`, (m) => `${m[1]} streamer${m[1] === "1" ? "" : "s"} · peak ${m[3]} viewers${m[4] ? ` · Kick ${m[4]} %` : ""}`],
    [/^špička (.+?) diváků(?: · Kick (\d+) %)?$/, (m) => `špička ${m[1]} divákov${m[2] ? ` · Kick ${m[2]} %` : ""}`, (m) => `peak ${m[1]} viewers${m[2] ? ` · Kick ${m[2]} %` : ""}`],
    [/^(.+) diváků$/, "$1 divákov", "$1 viewers"], [/^(.+) diváků\.$/, "$1 divákov.", "$1 viewers."], [/^(.+) sledujících$/, "$1 sledujúcich", "$1 followers"],
    [/^(.+) diváků ve špičce \((.+)\)$/, "$1 divákov v špičke ($2)", "$1 peak viewers ($2)"], [/^diváků ve špičce \((.+)\)$/, "divákov v špičke ($1)", "peak viewers ($1)"],
    [/^nejníž za 90 dní:? (.+)$/, "najnižšie za 90 dní: $1", "90-day low: $1"],
    [/^Upozorním, až bude pod (.+)$/, "Upozorním, keď bude pod $1", "I'll alert you below $1"],
    [/^Ověřeno (.+) her, z toho (.+) s češtinou a (.+) s dabingem\.$/, "Overených $1 hier, z toho $2 s češtinou a $3 s dabingom.", "$1 games checked, $2 with Czech and $3 with Czech dubbing."],
    [/^Nejsledovanější hry na českých streamech za posledních 7 dní \((.+)\)\. Celkem$/, "Najsledovanejšie hry na českých streamoch za posledných 7 dní ($1). Celkom", "Most watched games on Czech streams in the last 7 days ($1). In total"],
    [/^sledování, ([+−-]?\d+) % proti předchozímu týdnu\.$/, "sledovania, $1 % oproti predchádzajúcemu týždňu.", "watched, $1 % vs. the previous week."],
    [/^Statistiky her sbíráme od (.+) \((\d+) (?:den|dny|dní)\)\. Srovnání s předchozím týdnem bude úplné po 14 dnech\.$/, "Štatistiky hier zbierame od $1 ($2 d). Porovnanie s predchádzajúcim týždňom bude úplné po 14 dňoch.", "We've collected game stats since $1 ($2 d). The week-over-week comparison will be complete after 14 days."],
    [/^Za tento týden máme (\d+) % měření – statistiky sbíráme od (.+)\. Čísla jsou proto nižší, než by byla za celý týden\.$/, "Za tento týždeň máme $1 % meraní – štatistiky zbierame od $2. Čísla sú preto nižšie, než by boli za celý týždeň.", "We have $1 % of this week's measurements – stats collected since $2. Numbers are therefore lower than for a full week."],
    [/^(.+) · týden ještě běží, čísla se průběžně mění$/, "$1 · týždeň ešte beží, čísla sa priebežne menia", "$1 · week in progress, numbers keep changing"],
    [/^Report týdne (\d{4}) · týden (\d+)$/, "Report týždňa $1 · týždeň $2", "Weekly report $1 · week $2"],
    [/^hodin sledování ([+−-]?\d+ %)$/, "hodín sledovania $1", "watch hours $1"],
    [/^naposledy ([^·]+)$/, (m) => `naposledy ${prelozJadro(m[1]) ?? m[1]}`, (m) => `last run ${prelozJadro(m[1]) ?? m[1]}`],
    [/^každých (\d+) min$/, "každých $1 min", "every $1 min"],
    [/^(\d+) (?:chyba|chyby|chyb) za 24 h$/, "$1 chýb za 24 h", "$1 errors in 24 h"],
    [/^kontrola (\S+)$/, "kontrola $1", "checked $1"],
    [/^Prošla (\d+) herní(?:ch)? web(?:y|ů)?(?: \((.+)\))?, našla (\d+) čerstv\S+ zpráv\S*\.(?: Nedostupné: (.+)\.)?$/, (m) => `Prešla ${m[1]} herných webov${m[2] ? ` (${m[2]})` : ""}, našla ${m[3]} čerstvých správ.${m[4] ? ` Nedostupné: ${m[4]}.` : ""}`, (m) => `Checked ${m[1]} gaming sites${m[2] ? ` (${m[2]})` : ""}, found ${m[3]} fresh stories.${m[4] ? ` Unavailable: ${m[4]}.` : ""}`],
    [/^Na Twitchi našla (\d+) živ\S+ česk\S+ stream\S*, obnovila (\d+) profil\S*\.$/, "Na Twitchi našla $1 živých českých streamov, obnovila $2 profilov.", "Found $1 live Czech streams on Twitch, refreshed $2 profiles."],
    [/^Na Kicku našla (\d+) živ\S+ česk\S+ stream\S*\.$/, "Na Kicku našla $1 živých českých streamov.", "Found $1 live Czech streams on Kick."],
    [/^Zkontrolovala obchody Steam, Epic a GOG – hry zdarma, slevy, žebříčky a hodnocení hráčů\.(?: Nedostupné: (.+)\.)?$/, (m) => `Skontrolovala obchody Steam, Epic a GOG – hry zadarmo, zľavy, rebríčky a hodnotenie hráčov.${m[1] ? ` Nedostupné: ${m[1]}.` : ""}`, (m) => `Checked the Steam, Epic and GOG stores – free games, deals, charts and player ratings.${m[1] ? ` Unavailable: ${m[1]}.` : ""}`],
    [/^Zkontrolovala ceny (\d+) \S+ a češtinu u (\d+) \S+(, poslala (\d+) upozornění na slevy)?, načetla (\d+) \S+ a (\d+) \S+\.$/, (m) => `Skontrolovala ceny ${m[1]} hier a češtinu pri ${m[2]} hrách${m[3] ? `, poslala ${m[4]} upozornení na zľavy` : ""}, načítala ${m[5]} klipov a ${m[6]} videí.`, (m) => `Checked prices of ${m[1]} games and Czech support for ${m[2]}${m[3] ? `, sent ${m[4]} sale alerts` : ""}, loaded ${m[5]} clips and ${m[6]} videos.`],
    [/^Zkontrolovala oficiální kanály: (.+) – (\d+) \S+\.(?: Problém: (.+)\.)?$/, (m) => `Skontrolovala oficiálne kanály: ${m[1]} – ${m[2]} položiek.${m[3] ? ` Problém: ${m[3]}.` : ""}`, (m) => `Checked official channels: ${m[1]} – ${m[2]} items.${m[3] ? ` Issue: ${m[3]}.` : ""}`],
    [/^(.+) · (\d+) (?:novinka|novinky|novinek)$/, (m) => `${m[1]} · ${m[2]} noviniek`, (m) => `${m[1]} · ${m[2]} news`],
    [/^Napsala článek: (.+)$/, "Napísala článok: $1", "Wrote an article: $1"], [/^Chyba: (.+)$/, "Chyba: $1", "Error: $1"],
    [/^překonal\(a\) (.+) sledujících · (.+)$/, "prekonal(a) $1 sledujúcich · $2", "passed $1 followers · $2"],
    [/^nový rekord: (.+) diváků · (.+)$/, "nový rekord: $1 divákov · $2", "new record: $1 viewers · $2"],
    [/^(\d+) (?:český stream|české streamy|českých streamů) právě živě · (.+) diváků$/, "$1 českých streamov práve naživo · $2 divákov", "$1 Czech streams live now · $2 viewers"],
    [/^Právě vysílá (\d+) (?:streamer|streameři|streamerů) pro$/, "Práve vysiela $1 streamerov pre", "$1 streamers live now for"],
    [/^Data z oficiálních API Twitche a Kicku, naposledy (.+)\. Obnovují se každých 15 minut a zahrnují streamy s jazykem nastaveným na češtinu\.$/, "Dáta z oficiálnych API Twitchu a Kicku, naposledy $1. Obnovujú sa každých 15 minút a zahŕňajú streamy s jazykom nastaveným na češtinu.", "Data from the official Twitch and Kick APIs, last updated $1. Refreshed every 15 minutes; includes streams with language set to Czech."],
    [/^Ceny a nabídky jsou z veřejných stránek obchodů Steam, Epic Games Store a GOG, aktualizováno (.+)\. Ceny se můžou lišit – vždy platí cena v obchodě\. Kliknutím přejdeš do obchodu\.$/, "Ceny a ponuky sú z verejných stránok obchodov Steam, Epic Games Store a GOG, aktualizované $1. Ceny sa môžu líšiť – vždy platí cena v obchode. Kliknutím prejdeš do obchodu.", "Prices and offers come from the public Steam, Epic Games Store and GOG pages, updated $1. Prices may differ – the store price always applies. Tap to open the store."],
    [/^Ceny, čeština, hodnocení a počet hráčů jsou přímo z obchodů Steam a GOG(?: \(stav (.+)\))?; vždy platí cena v obchodě\. Hodiny na streamech měříme sami z API Twitche a Kicku\.$/, (m) => `Ceny, čeština, hodnotenie a počet hráčov sú priamo z obchodov Steam a GOG${m[1] ? ` (stav ${m[1]})` : ""}; vždy platí cena v obchode. Hodiny na streamoch meriame sami z API Twitchu a Kicku.`, (m) => `Prices, Czech support, ratings and player counts come straight from Steam and GOG${m[1] ? ` (as of ${m[1]})` : ""}; the store price always applies. Stream hours are our own measurements via the Twitch and Kick APIs.`],
    // nadpisy stránek
    [/^(.+) – (Twitch|Kick) streamer \| Herní puls$/, "$1 – $2 streamer | Herní puls", "$1 – $2 streamer | Herní puls"],
    [/^Týden na české herní scéně (.+) \| Herní puls$/, "Týždeň na českej hernej scéne $1 | Herní puls", "The week on the Czech gaming scene $1 | Herní puls"],
    [/^(.+) – cena, čeština, hodnocení a čeští streameři \| Herní puls$/, "$1 – cena, čeština, hodnotenie a českí streameri | Herní puls", "$1 – price, Czech support, ratings and Czech streamers | Herní puls"],
  ];

  // Obecná pravidla pro krátké texty s čísly (časy, zkratky).
  const OBECNE = [
    [/^právě teď$/, "práve teraz", "just now"],
    [/^od (.+), kdy měříme$/, "od $1, kedy meriame", "since $1 (when we started measuring)"], [/^odvysíláno od (.+)$/, "odvysielané od $1", "streamed since $1"],
    [/^odvysíláno za (?:posledních )?(\d+) dní$/, "odvysielané za posledných $1 dní", "streamed in the last $1 days"],
    [/^podle záznamů na Twitchi \((\d+) vysílání\)$/, "podľa záznamov na Twitchi ($1 vysielaní)", "per Twitch past broadcasts ($1 streams)"],
    [/^(\d+) d (\d+) h (\d+) min$/, "$1 d $2 h $3 min", "$1 d $2 h $3 min"], [/^(\d+) h (\d+) min (\d+) s$/, "$1 h $2 min $3 s", "$1 h $2 min $3 s"],
    [/^(.+) · za$/, (m) => `${m[1]} · o`, (m) => `${m[1]} · in`], [/^včera$/, "včera", "yesterday"],
    [/^před (\d+) min$/, "pred $1 min", "$1 min ago"], [/^před (\d+) h$/, "pred $1 h", "$1 h ago"], [/^před (\d+) (?:dny|dnem|dní)$/, "pred $1 d", "$1 d ago"],
    [/^(\d[\d\s]*,?\d*) tis\.$/, "$1 tis.", (m) => `${m[1].replace(/\s/g, "").replace(",", ".")}k`],
    [/^(\d[\d\s]*,?\d*) mil\.$/, "$1 mil.", (m) => `${m[1].replace(/\s/g, "").replace(",", ".")}M`],
    [/^(\d[\d\s]*,?\d*) tis\. h$/, "$1 tis. h", (m) => `${m[1].replace(/\s/g, "").replace(",", ".")}k h`],
    [/^(\d[\d\s]*) Kč$/, "$1 Kč", (m) => `CZK ${m[1].replace(/\s/g, ",")}`],
  ];

  const TITULEK_SUFIX = / \| Herní puls$/;
  // Angličtina: české zkratky čísel → 1.5k, 2M (i uvnitř delších textů).
  const cislaEn = (t) => t.replace(/(\d[\d\u00a0 ]*(?:,\d+)?) tis\./g, (_, n) => `${n.replace(/[\s\u00a0]/g, "").replace(",", ".")}k`)
    .replace(/(\d[\d\u00a0 ]*(?:,\d+)?) mil\./g, (_, n) => `${n.replace(/[\s\u00a0]/g, "").replace(",", ".")}M`);
  function prelozText(t) {
    const cele = t.replace(/\s+/g, " ").trim();
    if (!cele) return null;
    // Oddělovače „·“ na krajích (text navazuje na odkaz nebo tučné slovo) se při hledání ignorují.
    let v = prelozJadro(cele), pred = "", za = "";
    if (v == null) {
      const m = /^([·\s]*)(.*?)([\s·:]*)$/.exec(cele);
      pred = m[1]; za = m[3];
      if (m[2] && m[2] !== cele) v = prelozJadro(m[2]);
    }
    if (v == null && cele.includes(" · ")) {
      // Text složený z více částí („obchody zkontrolovány… · sleduji…“): přelož každou část zvlášť.
      let zmena = false;
      const casti = cele.split(" · ").map((c) => {
        const m = /^([·\s]*)(.*?)([\s·:]*)$/.exec(c);
        const t = m[2] ? prelozJadro(m[2]) : null;
        if (t == null) return c;
        zmena = true; return m[1] + t + m[3];
      });
      if (zmena) { v = casti.join(" · "); pred = ""; za = ""; }
    }
    if (v == null) return I === 1 && /\d (tis|mil)\./.test(cele) ? cislaEn(cele) : null;
    return pred + (I === 1 ? cislaEn(v) : v) + za;
  }
  function prelozJadro(x) {
    if (!x) return null;
    const s = SLOVNIK[x];
    if (s) return s[I];
    for (const [re, sk, en] of [...FRAZE, ...OBECNE]) {
      const m = re.exec(x);
      if (!m) continue;
      const cil = I === 0 ? sk : en;
      return typeof cil === "function" ? cil(m) : x.replace(re, cil);
    }
    // Nadpis stránky: přelož část před „| Herní puls“.
    if (TITULEK_SUFIX.test(x)) {
      const p = SLOVNIK[x.replace(TITULEK_SUFIX, "")];
      if (p) return `${p[I]} | Herní puls`;
    }
    return null;
  }

  // Obsah, který se nepřekládá (názvy her, jména, titulky streamů, zprávy, články).
  // PRIMO = jen text přímo v prvku (např. název hry v h3, ale štítek „nové“ ve <span> uvnitř se přeloží).
  const PRIMO = "h3, .hk-t > b, .rec b, .hrad-t > a b, .ht-t h2 a, .welcome-bot";
  const NEPREKLADAT = ".vk-autor, .popis, .clanek .text, article .text, .titulek, .stream-title, [data-nepreklad], script, style, code, svg";
  const hotovo = new WeakMap();
  function prelozUzel(n) {
    const rodic = n.parentElement;
    if (!rodic || rodic.matches(PRIMO) || rodic.closest(NEPREKLADAT) || rodic.closest(".nt-bezi")) return;
    if (hotovo.get(n) === n.textContent) return;
    const v = prelozText(n.textContent);
    if (v != null) {
      const pred = n.textContent.match(/^\s*/)[0], za = n.textContent.match(/\s*$/)[0];
      n.textContent = pred + v + za;
    }
    hotovo.set(n, n.textContent);
  }
  function prelozAtributy(el) {
    for (const a of ["placeholder", "aria-label", "title", "alt"]) {
      const v = el.getAttribute && el.getAttribute(a);
      if (!v) continue;
      const p = prelozText(v);
      if (p != null && p !== v) el.setAttribute(a, p);
    }
  }
  function prelozStrom(root) {
    if (root.nodeType === 3) { prelozUzel(root); return; }
    if (root.nodeType !== 1) return;
    prelozAtributy(root);
    root.querySelectorAll("[placeholder],[aria-label],[title],[alt]").forEach(prelozAtributy);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) prelozUzel(w.currentNode);
  }
  function prelozTitulek() {
    const p = prelozText(document.title);
    if (p && p !== document.title) document.title = p;
  }

  // Hlášky prohlížeče (cílová cena v hlídači).
  const puvodniPrompt = window.prompt.bind(window);
  window.prompt = (zprava, vychozi) => puvodniPrompt(I === 0
    ? String(zprava).replace("Upozornit, až bude", "Upozorniť, keď bude").replace("pod jakou cenou (Kč)? Nech prázdné = jakákoliv sleva.", "pod akou cenou (Kč)? Nechaj prázdne = akákoľvek zľava.")
    : String(zprava).replace(/^Upozornit, až bude „(.+)“ pod jakou cenou \(Kč\)\? Nech prázdné = jakákoliv sleva\.$/, "Alert me when \"$1\" drops below what price (CZK)? Leave empty = any discount."), vychozi);

  function start() {
    prepinac();
    // Na statických stránkách s dlouhým textem upozorníme, že jsou zatím jen česky.
    const clanek = document.querySelector("main.article");
    if (clanek && !document.getElementById("app")) {
      const p = document.createElement("p");
      p.className = "info-box";
      p.textContent = I === 0 ? "Táto stránka je zatiaľ len v češtine." : "This page is currently available in Czech only.";
      clanek.prepend(p);
    }
    prelozStrom(document.body);
    prelozTitulek();
    new MutationObserver((zmeny) => {
      for (const z of zmeny) {
        if (z.type === "characterData") prelozUzel(z.target);
        else z.addedNodes.forEach(prelozStrom);
        if (z.type === "attributes") prelozAtributy(z.target);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "aria-label", "title"] });
    const t = document.querySelector("title");
    if (t) new MutationObserver(prelozTitulek).observe(t, { childList: true, characterData: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
