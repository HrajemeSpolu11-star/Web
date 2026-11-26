# Databáze (Cloudflare D1 `herni-puls-db`)

Tabulky se vytvářejí samy v kódu (`CREATE TABLE IF NOT EXISTS`), migrace sloupců přes `PRAGMA table_info` v `zajistiSchemaTwitch()`.
Ruční SQL není potřeba. Data si můžeš prohlédnout v Cloudflare → D1 → herni-puls-db → Explore Data / Console.

## Novinky a články
- **`clanky`** – zprávy z RSS: `id` (hash URL), `url`, `nadpis`, `perex`, `obrazek`, `zdroj_id`, `jazyk`, `platformy` (JSON), `typ`, `datum`, `ziskano`. Mažou se po 30 dnech.
- **`zdroje`** – stav RSS zdrojů: `posledni`, `chyby` (po 5 chybách se zdroj vypne), `etag`, `lastmod`, `stav`.
- **`prispevky`** – vlastní články (AI i ruční): `nadpis`, `perex`, `text` (jednoduchý markdown), `stav` (koncept/publikovano/zamitnuto), `autor` (ai/rucne), `poznamka` (co našla kontrola), `den`, časy.
- **`pouzite`** – ze kterých RSS zpráv už vznikl článek.

## Streameři
- **`streameri`** – jeden řádek na kanál. `id` (Twitch user id, Kick = `k` + id), `platforma`, `login`, `jmeno`, `popis`, `profilovka`, `banner`, `typ` (partner/affiliate), `sledujici` (+`sledujici_cas`), `prvni_videno`, `posledni_zive`, `posledni_stream`, `pocet_streamu`, `max_divaku`, `posledni_hra`, `profil_cas`, `skryty`, `overeno`, `odkazy` (JSON), `rozvrh_cas`, aktuální živé údaje `zive_cas`, `zive_hra`, `zive_titulek`, `zive_divaci`, `zive_zacatek`, `zive_nahled`.
- **`snimky`** – denní statistiky `(user_id, den)`: `sledujici`, `max_divaku`, `minut` (odvysíláno).
- **`hry_streamera`** – `(user_id, hra)`: `minut`, `posledni`.
- **`hry`** – seznam her: `slug`, `nazev`, `posledni`.
- **`scena`** – `(cas, platforma)`: počet streamů a diváků v každém běhu (graf scény). Maže se po 35 dnech.
- **`udalosti`** – `(typ, user_id, den)`: `rekord` (nový rekord diváků) a `milnik` (překonaný počet sledujících), `hodnota`, `cas`.
- **`rozvrh`** – `(user_id, zacatek)`: plánované streamy z Twitche na 7 dní.

## Upozornění
- **`push_odbery`** – `id` (hash endpointu), `endpoint`, `oblibeni` (JSON), časy.
- **`push_zpravy`** – fronta zpráv pro odběr (`titulek`, `text`, `url`, `odeslano`). Mažou se po 2 dnech nebo po vyzvednutí.

## Systémové
- **`nastaveni`** – klíč/hodnota: `twitch_token`, `kick_token`, `twitch_stav`, `kick_stav`, `twitch_zamek`, `vapid` (klíče pro push – **neměnit**, jinak přestanou fungovat existující odběry).

## `katalog` (src/katalog.js)
| sloupec | význam |
|---|---|
| `klic` | např. `steam_slevy`, `epic_zdarma`, `stav` |
| `data` | JSON pole her (u `stav` objekt s chybami) |
| `cas` | čas uložení (ms) |

## `videa`, `klipy`, `obsah_stav` (src/obsah.js)
- `videa`: id videa (Shorts s předponou `s:`), streamer_id, nazev, cas. Maže se po 60 dnech.
- `klipy`: id, streamer_id, url, nazev, nahled, zhlednuti, delka, hra_id, cas. Maže se po 14 dnech.
- `obsah_stav`: `yt:<streamer_id>` = ID YouTube kanálu nebo chyba (+ odkaz, ze kterého se hledal), `kl:<streamer_id>` = čas posledních klipů.

## `hry_den` (src/prehled.js)
Klíč (den, hra, platforma). `divako_minut` (÷60 = hodiny sledování), `minut` (minuty vysílání všech streamů), `max_divaku`, `max_streamu`, `slot` (15min běh – brání dvojímu započtení). Drží se 400 dní.

## `hra_info` (src/hra-data.js)
slug → JSON s daty ze Steamu, GOGu a Epicu, `cas`. Platnost 12 h, obnova na pozadí.

## `hry.twitch_id`
Twitch ID hry (z /streams), páruje klipy ke hře.

## `steam_hry`, `ceny_historie`, `hlidani` (src/hlidac.js)
- `steam_hry`: id (Steam appid), nazev, norm (pro hledání), obrazek, cestina (0/1/2/null), cena, puvodni, sleva, zdarma, vychazi,
  kladne, recenzi, jazyky_cas (ověřeno – znovu po 30 dnech), cena_cas (znovu po 6 h, hlídané každou hodinu), pridano.
- `ceny_historie`: (id, den) → nejnižší cena dne a sleva. 400 dní.
- `hlidani`: (odber_id, steam_id) → nazev, cil, upozorneno (cena, při které už upozornění odešlo), cas. Maže se s odběrem.
