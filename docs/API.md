# API (`/api/…`)

Veřejné API je jen pro čtení (GET), odpovědi JSON, krátce cachované. Výjimky: `/api/push/*` (POST) a `/api/admin/*`.

## Novinky
| Metoda a cesta | Popis |
|---|---|
| `GET /api/clanky?limit=1–100&platforma=PC\|PS5\|Xbox\|Switch&jazyk=cs\|en&q=text` | Vlastní články + RSS zprávy, nejnovější první |
| `GET /api/clanek/:id` | Jeden článek (`p…` = vlastní, 24 hex = RSS) |

## Streameři a hry
| Metoda a cesta | Popis |
|---|---|
| `GET /api/zive` | `{ streamy, hry, cas }` – kdo je právě živě (posledních 25 min) |
| `GET /api/streameri?razeni=sledujici\|divaci\|hodiny\|rust&platforma=twitch\|kick&q=&hra=` | Žebříček (max 300), živí nahoře |
| `GET /api/streamer/:platforma/:login` | Profil: statistiky, `snimky` (90 dní), `hry`, `odkazy` |
| `GET /api/streamer-extra/twitch/:login` | `{ rozvrh, klipy }` z Twitche (cache 1 h) |
| `GET /api/hry` | Hry za 30 dní: kolik živě, diváci, počet streamerů |
| `GET /api/hra/:slug` | Detail hry: `zive`, `nejvic`, `clanky` |
| `GET /api/prehled` | `{ graf, tyden: { rust, divaci, hodiny, hry }, milniky, kalendar }` |
| `GET /api/stav` | Stav sběru: RSS zdroje, Twitch, Kick, počty |

## Upozornění (Web Push)
| Metoda a cesta | Tělo | Popis |
|---|---|---|
| `GET /api/push/klic` | – | Veřejný VAPID klíč |
| `POST /api/push/odber` | `{ endpoint, oblibeni: ["twitch:login", …] }` | Uloží/aktualizuje odběr |
| `POST /api/push/zrusit` | `{ endpoint }` | Smaže odběr |
| `POST /api/push/zpravy` | `{ endpoint }` | Service worker si vyzvedne zprávy (po přečtení se smažou) |

## Admin (jen s Cloudflare Access, POST navíc `Origin` = web a hlavička `X-Admin: 1`)
| Metoda a cesta | Popis |
|---|---|
| `GET /api/admin/ja` | Přihlášený e-mail, stav AI |
| `GET /api/admin/prispevky?stav=koncept\|publikovano\|zamitnuto` | Seznam článků |
| `GET /api/admin/prispevek/:id` | Jeden článek |
| `POST /api/admin/prispevek` / `POST /api/admin/prispevek/:id` | Vytvořit / upravit (`stav: koncept\|publikovano`) |
| `POST /api/admin/prispevek/:id/stav` | Změna stavu |
| `POST /api/admin/napis-ted` | Nechat AI napsat článek hned |
| `GET /api/admin/streameri?q=` | Seznam streamerů pro správu |
| `POST /api/admin/streamer/:id` | `{ skryty, overeno, odkazy: { web, youtube, instagram, tiktok, x, discord } }` |

## Ostatní
- `GET /sitemap.xml`, `GET /robots.txt` – generuje Worker.

## `GET /api/katalog`
Herní katalog pro hlavní stránku. Klíče: `epic_zdarma`, `epic_brzy`, `steam_zdarma`, `steam_slevy`, `steam_top`,
`steam_nove`, `steam_brzy`, `steam_hrane`, `gog_trend`, `gog_slevy` (pole her: `nazev`, `url`, `obrazek`, `obchod`,
`cena`, `puvodni`, `mena`, `sleva`, `od`/`do`, `hracu`), `stav.chyby`, `cas`. Cache 10 min. Když data chybí, sběr se spustí hned.

## `GET /api/obsah`
`videa` (YouTube: `url`, `nahled`, `nazev`, `cas`, `streamer`), `klipy` (Twitch, 7 dní, podle zhlédnutí), `recenze` (články typu Recenze, české první). Cache 10 min.

## `GET /api/cesko`
Co hraje Česko: `od`, `do`, `data_od`, `celkem {hodin, hodin_pred, zmena}`, `hry[]` (`hra`, `slug`, `poradi`, `hodin`, `hodin_pred`, `zmena` %, `novinka`, `spicka`, `kick_podil` %, `streameru`), `nahoru[]`, `novinky[]`. Cache 15 min.

## `GET /api/report?tyden=2026-W48 | aktualni`
Týdenní report (bez parametru poslední celý týden): `souhrn` (hodin, zmena, hodin_twitch/kick, prumer_divaku, spicka, kanalu, pokryti %), `vety[]`, `hry[]`, `streameri {divaci, hodiny, rust}`, `udalosti[]`, `tydny[]`. Cache 30 min (běžící týden) / 1 den.

## `GET /api/hra/:slug` (rozšířeno)
Navíc `info {steam, gog, epic, cas}` z obchodů, `statistiky {hodin7, spicka7, dny[]}` a `klipy[]`.

## `GET /api/cestina?q=… | filtr=sleva|zdarma|dabing|vse`
Hry ze Steamu s češtinou (`cestina`: 0 bez, 1 titulky, 2 dabing, null neověřeno), cenou a `min90`. S `q` hledá v databázi a případně na Steamu (max. 4 požadavky). Cache 1 h (hledání) / 15 min.

## `GET /api/steam-hry?ids=1,2,3`
Aktuální údaje hlídaných her (max. 50).

## `POST /api/push/hlidat` / `POST /api/push/nehlidat`
Tělo `{endpoint, steam_id, nazev, cil}` (cil = cílová cena v Kč, null = jakákoliv sleva). Odběr musí být platná push adresa.
