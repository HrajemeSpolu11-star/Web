# Zátěžový a stres test (spouští se jen ručně, nikdy v GitHub Actions)

Kopie webu běží lokálně ve `wrangler dev` (stejný engine workerd jako Cloudflare) s lokální D1 naplněnou daty
o objemu ~1 roku provozu. Na ostrém webu se zátěž netestuje – spálila by denní limity Cloudflare Free.

1. `mkdir -p /tmp/zatez && cp -r . /tmp/zatez/web` (bez `.git`), ve `wrangler.jsonc` kopie smazat `"ai"` a nastavit
   `"main": "src/_zatez.js"`; `cp tools/zatez/obal-d1.js /tmp/zatez/web/src/_zatez.js` (přidá hlavičky x-rows-read/written).
2. `cd /tmp/zatez/web && npx wrangler dev --local --port 8787` a jednou otevřít pár `/api/...` (založí tabulky).
3. Zastavit, `python3 tools/zatez/naplnit.py` (5000 streamerů, 550 tis. snímků, 128 tis. her po dnech, 730 tis. cen…), znovu spustit.
4. `cd /tmp/zatez && npm i autocannon`, pak:
   - `node vypocty.mjs` – výpočty Cronů: CPU bez databáze, dotazy, čtení celé tabulky (SCAN),
   - `bash studene.sh` – každý endpoint se studenou mezipamětí: přečtené/zapsané řádky,
   - `node zatez.mjs 10,50,100,200 15` – smíšený provoz, latence, chyby,
   - `node naraz.mjs 100` – 100 souběžných požadavků na studenou mezipaměť (kolikrát se počítalo),
   - `node zapisy.mjs` a `node jeden.mjs` – zápisový nápor a nesmyslná data.

Výsledky a co se opravilo: `docs/ZATEZOVY-TEST.md`.
