# Architektura

```
            ┌──────────────── Cloudflare Worker „web“ (src/index.js) ────────────────┐
návštěvník →│ statické soubory (public/)   ← servíruje Cloudflare Assets přímo        │
            │ /zive, /streamer/… , /hra/…  → SEO: index.html + meta tagy (src/seo.js) │
            │ /api/*                        → veřejné API (jen čtení, mezipaměť)       │
            │ /api/push/*                   → upozornění (src/push.js)                │
            │ /admin, /api/admin/*          → jen s Cloudflare Access (src/access.js) │
            │ Cron                          → sběr dat                                 │
            └───────────────┬───────────────────────────────────┬────────────────────┘
                            │                                   │
                 Cloudflare D1 (herni-puls-db)        externí API: RSS weby, Twitch Helix,
                                                      Kick Public API, Groq / Workers AI,
                                                      Web Push služby, Discord webhook
```

## Plánované úlohy (Cron, UTC) – `wrangler.jsonc`
| Cron | Co dělá | Kód |
|---|---|---|
| `*/15 * * * *` | RSS novinky (10 z 19 zdrojů na běh, každý ≈ 30 min; vypnutý zdroj se zkusí znovu po 24 h) + studia a platformy (2 na běh) | `sber()` v `src/sber.js`, `sberStudii()` v `src/studia.js` |
| `7 * * * *` | AI psaní (jen v hodinách `HODINY`, max `CLANKU_DENNE`) | `napisClanek()` v `src/psani.js` |
| `5,20,35,50 * * * *` | Twitch + Kick streameři, rekordy, milníky, rozvrhy, push | `sberTwitch()`, `sberKick()` |
| `25 * * * *` | Herní katalog: Steam (slevy, top, nové, brzy, nejhranější + hodnocení hráčů), Epic (zdarma), GOG (trendy, slevy) – ≈33 požadavků | `sberKatalogu()` v `src/katalog.js` |
| `40 * * * *` | Videa z YouTube RSS (8 kanálů), Twitch klipy (8 streamerů), ceny her (≤3 × 100) a čeština (12 her) + upozornění hlídače – ≈34 požadavků | `sberObsahu()` v `src/obsah.js`, `sberHlidace()` v `src/hlidac.js` |

**Všech 5 Cronů je obsazeno.** Další pravidelná úloha se musí přidat do některého stávajícího běhu.

Navíc: když návštěvník otevře `/api/zive`, `/api/streameri` nebo `/api/hry` a poslední sběr je starší než 10 min,
spustí se sběr hned na pozadí (`sberTwitchPokudStary`, zámek `nastaveni.twitch_zamek`).

## Sběr streamerů (jeden běh Twitch)
1. `/streams?language=cs` – až 6 stránek po 100.
2. Porovnání s předchozím stavem → kdo **nově začal vysílat** (upozornění), kdo **překonal rekord** (událost).
3. Zápis: `streameri` (upsert), `snimky` + `hry_streamera` (jen streamy ≥ 3 diváky), `hry`, `scena`.
4. Profily: `/users` (100 nejstarších profilů, 1 požadavek).
5. Sledující: `/channels/followers` (15 kanálů, 1 požadavek každý) + milníky.
6. Rozvrhy: `/schedule` (5 kanálů s nejvíc sledujícími, obnova po 12 h) → tabulka `rozvrh`.
7. Odeslání upozornění (max. 10 push na běh).

Kick je jednodušší: nejdřív Livestreams V2 (`/public/v2/livestreams`, cursor, max. 2 stránky), při chybě V1 `/livestreams?language=cs&limit=100` (řazení podle diváků + podle začátku), profily `/channels?slug=…` (25 na běh). Kick API nevrací sledující.

## Rozpočet limitů (Free plán) – hlídat při změnách!
- **Podrequesty (fetch) na běh: max 50.** Twitch běh: token (≤1) + streamy (≤6) + users (1) + followers (15) + schedule (5) + push (≤10) ≈ 38.
- **CPU 10 ms na běh** – parsování je lehké, čekání na síť se nepočítá.
- **D1 zápisy ~100 tis. řádků/den.** Twitch běh zapisuje ~1 řádek na každý živý stream + 2 na streamy ≥ 3 diváky. Proto `MIN_STATISTIKY = 3`.
- **D1 čtení 5 mil./den** – veřejné API je cachované 60–300 s v Cloudflare cache.
- **Workers AI 10 000 neuronů/den** (záloha pro psaní).

## Frontend
- SPA bez frameworku: `public/js/app.js`. Routování přes `history.pushState`, skutečné adresy.
- Staré odkazy `/#/…` se přesměrují.
- **Nová stránka = přidat ji do tří míst**: `route()` v `app.js`, `jeStranka()` v `src/seo.js` a `assets.run_worker_first` ve `wrangler.jsonc`. Bez posledního vrátí obnovení stránky 404 (Cloudflare při navigaci servíruje `404.html` bez Workeru).
- Žádné inline skripty/styly (CSP) – barvy přes `data-a`/`data-b` a `obarvi()`.
- Lokální úložiště prohlížeče: `hp_uvitani` (zavřené uvítání), `hp_oblibeni` (oblíbení), `hp_push` (upozornění zapnutá).

## Bezpečnost
- `public/_headers`: CSP (`default-src 'none'`, `script-src 'self'`, `img-src 'self' data: https:`, `worker-src 'self'`…), HSTS, X-Frame-Options DENY aj.
- API: jen GET (kromě push a adminu), SQL přes `bind()`, validace vstupů, mezipaměť.
- Admin: JWT z Cloudflare Access ověřené ve Workeru (podpis RS256, aud, iss, exp) + kontrola Origin a hlavičky `X-Admin` proti CSRF.
- Push: povolené jen endpointy známých push služeb (ochrana proti SSRF), max. 100 oblíbených na odběr, strop 20 000 odběrů.
- Mezipaměť API: klíč jen ze známých parametrů (`POVOLENE` v `verejneApi`). Nový parametr API = doplnit tam.
- Kalendář vydání (`src/vydani.js`): IGDB `release_dates` + `game.first_release_date`; porty a plné verze po předběžném přístupu se označí `uz_vyslo` (i podle Steamu). Až 3 dotazy na IGDB (zjednodušení při chybě 400) + 1–2 na token.

## Souběžné běhy a přesnost statistik (od 2026-11-26)
- Sběr Twitch/Kick běží z Cronu (`5,20,35,50`) i na vyžádání (`sberTwitchPokudStary`, když je poslední sběr starší než 10 min – kontroluje se až po neúspěchu mezipaměti).
  Živá data (kdo vysílá) se jen přepisují, takže souběh nevadí.
- **Minuty a hodiny sledování** (`snimky.minut`, `hry_streamera.minut`, `hry_den`) se navyšují o **skutečně uplynulý čas**
  od posledního započteného běhu (max. 15 min) – `rezervujMinuty()` v `src/prehled.js`, klíč `nastaveni.beh_twitch` / `beh_kick`.
  Rezervace je atomická (`UPDATE … WHERE plati_do = předchozí`), dva souběžné běhy tedy nezapočítají stejný čas dvakrát.
- **AI psaní** má zámek `nastaveni.psani_zamek` (5 min) – plánované a ruční spuštění neběží zároveň.
  Rozvrh `HODINY` se porovnává s pražskou hodinou (`hodinaPraha`) a Cron běží každou hodinu, takže letní/zimní čas nevadí.
- **Stahování textu článků pro AI** jen přes https a jen z domény webu, odkud zpráva přišla (i u přesměrování, max. 3 kroky).

## Fronta push upozornění
- `zaradUpozorneni()` vloží zprávu do `push_zpravy`, `odesliFrontu()` (v každém běhu Twitch sběru, max. 10 odběrů) pošle
  prázdný push; service worker si text vyzvedne z `/api/push/zpravy`.
- Výsledek odeslání: 2xx = odesláno; 404/410/403 = odběr zanikl → smaže se; síťová chyba, 429, 5xx = **zůstane ve frontě**
  a zkusí se znovu v dalším běhu. Zprávy starší 2 dnů se mažou.


## Zápisy D1 – odhad (2026-11-26)
- Streameři (Twitch+Kick): řádek streamera + snímek dne + hra streamera u **každého** živého streamu (od 26. 11. i 0–2 diváci) ≈ 35–45 tis./den.
- `hry_den` ≈ 6 tis., `scena` ≈ 200, katalog + steam_hry + ceny ≈ 8–10 tis., studia/videa/klipy jen nové řádky, deník ≈ 400.
- Celkem zhruba 55–65 tis. z limitu 100 tis. denně. Při dalším růstu hlídat v Cloudflare → D1 → Metrics.

## Nové části (2026-11-26 večer)
| Část | Soubor | Kdy běží | Požadavky |
|---|---|---|---|
| Ranní přehled (AI) | `src/ranni.js`, tabulka `ranni` | Cron psaní „7“, od 6:00 Praha, 1× denně | 1 AI volání |
| Aktualizace her | `src/patche.js`, tabulky `patche`, `sledovane` | seznam her 1× denně (Cron psaní), kontrola v Cronu novinek „*/15“ (15 her), shrnutí v Cronu psaní (2/h) | 15 Steam / 15 min; ~7 IGDB/den; 2 AI/h |
| Seznam přání | `src/wishlist.js` | jen na žádost (10/min) | až 7 Steam |
| Výročí | `src/vyroci.js`, katalog `vyroci` | Cron katalogu „25“, 1× denně | 1–3 IGDB |
| Co hrát, Rádce, Vyšší/nižší | `src/nastroje.js` | jen na žádost (mezipaměť 30 min) | 0 externích |
| Česká scéna | `apiCeskaScena` v `src/studia.js` | jen na žádost | 0 externích |
| Rozjede se mi to? | `public/js/hw.js` | v prohlížeči | 0 |

Kontrola AI textů (ranní přehled, aktualizace): každé číslo v AI textu musí být i ve zdroji, jinak se bod/řádek vyřadí.
Rozcestník Hry: `SKUPINY_HER` v `app.js` – nová stránka sekce Hry se přidá do jedné skupiny.
