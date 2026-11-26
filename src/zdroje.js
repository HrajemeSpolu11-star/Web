// Seznam RSS zdrojů. Přidání nebo odebrání webu = úprava tohoto souboru.
// "overeno: false" = adresu se nepodařilo předem ověřit. Sběrač zdroj
// po opakovaných chybách sám vypne (viz /api/stav).
export const ZDROJE = [
  // Zahraniční
  { id: "pcgamer", nazev: "PC Gamer", url: "https://www.pcgamer.com/feeds.xml", jazyk: "en", overeno: true },
  { id: "polygon", nazev: "Polygon", url: "https://www.polygon.com/rss/index.xml", jazyk: "en", overeno: true },
  { id: "kotaku", nazev: "Kotaku", url: "https://kotaku.com/feed", jazyk: "en", overeno: true },
  { id: "ign", nazev: "IGN", url: "https://feeds.feedburner.com/ign/games-all", jazyk: "en", overeno: true },
  { id: "eurogamer", nazev: "Eurogamer", url: "https://www.eurogamer.net/feed", jazyk: "en", overeno: false },
  { id: "rps", nazev: "Rock Paper Shotgun", url: "https://www.rockpapershotgun.com/feed", jazyk: "en", overeno: false, platforma: "PC" },
  { id: "gematsu", nazev: "Gematsu", url: "https://www.gematsu.com/feed", jazyk: "en", overeno: false },
  { id: "vgc", nazev: "VGC", url: "https://www.videogameschronicle.com/feed/", jazyk: "en", overeno: false },
  { id: "nintendolife", nazev: "Nintendo Life", url: "https://www.nintendolife.com/feeds/latest", jazyk: "en", overeno: false, platforma: "Switch" },

  // Oficiální
  { id: "psblog", nazev: "PlayStation Blog", url: "https://blog.playstation.com/feed/", jazyk: "en", overeno: false, platforma: "PS5" },
  { id: "xboxwire", nazev: "Xbox Wire", url: "https://news.xbox.com/en-us/feed/", jazyk: "en", overeno: false, platforma: "Xbox" },

  // České (ověřené 2026-11-26 – kanály vracely aktuální zprávy)
  { id: "games-cz", nazev: "Games.cz", url: "https://games.tiscali.cz/rss2.xml", jazyk: "cs", overeno: true },
  { id: "zing-cz", nazev: "Zing.cz", url: "https://zing.cz/rss/all", jazyk: "cs", overeno: true },
  { id: "hrej", nazev: "Hrej.cz", url: "https://www.hrej.cz/rss/all", jazyk: "cs", overeno: true },
  { id: "doupe-cz", nazev: "Doupě.cz", url: "https://doupe.zive.cz/rss", jazyk: "cs", overeno: true },
  { id: "spite", nazev: "Spite.cz", url: "https://www.spite.cz/rss/all", jazyk: "cs", overeno: true },
  { id: "gamingprofessors", nazev: "Gaming Professors", url: "https://gamingprofessors.cz/feed/", jazyk: "cs", overeno: true },
  { id: "pctuning", nazev: "PCTuning.cz", url: "https://pctuning.cz/rss/all", jazyk: "cs", overeno: true },
  // České (neověřené – sběrač je po 5 chybách sám vypne)
  { id: "bonusweb", nazev: "BonusWeb", url: "https://servis.idnes.cz/rss.aspx?c=bonusweb", jazyk: "cs", overeno: false },
];
