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
