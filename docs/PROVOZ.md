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
| České novinky chybí | Zkontroluj v `/api/stav` zdroje s `jazyk: cs`. Pokud web změnil adresu RSS, oprav ji v `src/zdroje.js` a dej zdroji nové `id` (staré chyby by ho blokovaly). |
| D1 „daily limit exceeded“ | Moc zápisů – zvyš `MIN_STATISTIKY` v `src/twitch.js`/`src/kick.js` nebo zřeď cron. |
| Admin „Přístup odepřen“ | Očekávané, dokud není Cloudflare Access (viz `NASTAVENI.md`). |
| Upozornění nechodí na iPhonu | iOS podporuje web push jen u webu přidaného na plochu. |

## Údržba
- **CHANGELOG.md** – po každé změně přidat záznam nahoru, nic nemazat.
- **docs/PRO-NOVY-CHAT.md** – aktualizovat stav a rozhodnutí.
- Data se uklízejí sama: RSS zprávy 30 dní, scéna 35 dní, push zprávy 2 dny.


## Zálohy databáze (D1 Time Travel)
- Cloudflare D1 si sám pamatuje stav databáze po minutách: **na Free plánu 7 dní zpět** (Paid 30 dní). Nic se nenastavuje.
- Obnova (z počítače s Node.js, příkazy Wrangleru):
  1. `npx wrangler d1 time-travel info herni-puls-db --timestamp="2026-11-26T10:00:00+01:00"` – zjistí záložku k času.
  2. `npx wrangler d1 time-travel restore herni-puls-db --timestamp="2026-11-26T10:00:00+01:00"` – obnoví. Vrátí záložku, kterou jde obnovu vrátit zpět.
- Úplná kopie mimo Cloudflare: `npx wrangler d1 export herni-puls-db --remote --output=zaloha.sql` (doporučeno jednou za čas, soubor do repa nedávat – jsou v něm odběry upozornění).

## Hlídání chodu – stránka /stav
- Každá automatická úloha (RSS, Twitch, Kick, katalog, obsah, psaní) po doběhnutí zapíše větu do tabulky `denik` (src/denik.js).
- `/stav` ukazuje u každé úlohy Běží / Zpožděno / Stojí / Chyba podle stáří posledního záznamu a počet chyb za 24 h, pod tím deník AI.
- Když něco stojí: podívej se do Cloudflare → Worker `web` → Logs, a do deníku (text chyby).
