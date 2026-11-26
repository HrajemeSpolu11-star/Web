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
| `*/15 * * * *` | RSS novinky (4 zdroje na běh, střídají se) | `sber()` v `src/sber.js` |
| `7 * * * *` | AI psaní (jen v hodinách `HODINY`, max `CLANKU_DENNE`) | `napisClanek()` v `src/psani.js` |
| `5,20,35,50 * * * *` | Twitch + Kick streameři, rekordy, milníky, rozvrhy, push | `sberTwitch()`, `sberKick()` |

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

Kick je jednodušší: `/livestreams?language=cs&limit=100`, profily `/channels?slug=…` (25 na běh). Kick API nevrací sledující.

## Rozpočet limitů (Free plán) – hlídat při změnách!
- **Podrequesty (fetch) na běh: max 50.** Twitch běh: token (≤1) + streamy (≤6) + users (1) + followers (15) + schedule (5) + push (≤10) ≈ 38.
- **CPU 10 ms na běh** – parsování je lehké, čekání na síť se nepočítá.
- **D1 zápisy ~100 tis. řádků/den.** Twitch běh zapisuje ~1 řádek na každý živý stream + 2 na streamy ≥ 3 diváky. Proto `MIN_STATISTIKY = 3`.
- **D1 čtení 5 mil./den** – veřejné API je cachované 60–300 s v Cloudflare cache.
- **Workers AI 10 000 neuronů/den** (záloha pro psaní).

## Frontend
- SPA bez frameworku: `public/js/app.js`. Routování přes `history.pushState`, skutečné adresy.
- Staré odkazy `/#/…` se přesměrují.
- Žádné inline skripty/styly (CSP) – barvy přes `data-a`/`data-b` a `obarvi()`.
- Lokální úložiště prohlížeče: `hp_uvitani` (zavřené uvítání), `hp_oblibeni` (oblíbení), `hp_push` (upozornění zapnutá).

## Bezpečnost
- `public/_headers`: CSP (`default-src 'none'`, `script-src 'self'`, `img-src 'self' data: https:`, `worker-src 'self'`…), HSTS, X-Frame-Options DENY aj.
- API: jen GET (kromě push a adminu), SQL přes `bind()`, validace vstupů, mezipaměť.
- Admin: JWT z Cloudflare Access ověřené ve Workeru (podpis RS256, aud, iss, exp) + kontrola Origin a hlavičky `X-Admin` proti CSRF.
- Push: povolené jen endpointy známých push služeb (ochrana proti SSRF), max. 100 oblíbených na odběr.
