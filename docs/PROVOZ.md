# Provoz a řešení problémů

## Rychlá kontrola stavu
Otevři `https://web.hrajemespolu11.workers.dev/api/stav`:
- `twitch.nastaveno` / `kick.nastaveno` – vidí Worker klíče? (`false` = Secret chybí nebo je v sekci Build)
- `twitch.posledni_beh.ok` / `kick.posledni_beh.ok` – poslední sběr proběhl? Při `false` je v `chyba` důvod.
- `zdroje[]` – stav každého RSS zdroje (`chyby` ≥ 5 = vypnutý).
- `zprav_z_rss`, `vlastnich_clanku`, `streameru_celkem`.

Logy: Cloudflare → Workers & Pages → web → **Logs** (observability je zapnutá).

## Časté problémy
| Příznak | Příčina / řešení |
|---|---|
| Nasazení selže „binding name already in use“ | Stejná proměnná je ve `vars` i jako Secret – jednu smaž. |
| Streameři prázdní | Zkontroluj `/api/stav` → `twitch`. Sběr běží v :05, :20, :35, :50 nebo hned při návštěvě. |
| Twitch `chyba: Twitch token HTTP 400/403` | Špatný `TWITCH_CLIENT_SECRET` – vygeneruj nový na dev.twitch.tv. |
| Kick nic nevrací | `kick.nastaveno` false nebo chyba tokenu – zkontroluj `KICK_CLIENT_SECRET`. |
| Počty sledujících „–“ | Kick je přes API nedává; u Twitche se doplňují postupně (15 kanálů na běh). |
| České novinky chybí | RSS adresy českých webů nejsou ověřené – v `/api/stav` mají chyby. Oprav adresy v `src/zdroje.js`. |
| D1 „daily limit exceeded“ | Moc zápisů – zvyš `MIN_STATISTIKY` v `src/twitch.js`/`src/kick.js` nebo zřeď cron. |
| Admin „Přístup odepřen“ | Očekávané, dokud není Cloudflare Access (viz `NASTAVENI.md`). |
| Upozornění nechodí na iPhonu | iOS podporuje web push jen u webu přidaného na plochu. |

## Údržba
- **CHANGELOG.md** – po každé změně přidat záznam nahoru, nic nemazat.
- **docs/PRO-NOVY-CHAT.md** – aktualizovat stav a rozhodnutí.
- Data se uklízejí sama: RSS zprávy 30 dní, scéna 35 dní, push zprávy 2 dny.
