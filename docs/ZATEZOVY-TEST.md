# Zátěžový a stres test – 2026-11-27

## Jak se testovalo
- **Kde:** přesná kopie webu lokálně ve `wrangler dev` (engine workerd jako na Cloudflare) s lokální D1. Ostrý web se
  netestoval – zátěž by spálila denní limity Cloudflare Free (100 tis. požadavků, 5 mil. přečtených řádků D1).
- **Data:** objem jako po **roce provozu** – 5 000 streamerů, 548 tis. denních snímků, 128 tis. záznamů her po dnech,
  70 tis. měření scény, 730 tis. cen, 20 tis. aktualizací, 30 tis. zpráv. (Ostrý web má teď data za ~45 dní.)
- **Co se měřilo:** přečtené a zapsané řádky D1 na požadavek (hlavičky z obalu D1), CPU výpočtů bez času databáze
  (limit 10 ms), latence a chyby při 10–200 souběžných klientech, nápor na studenou mezipaměť, zápisový nápor,
  nesmyslná data, Crony souběžně s provozem, výpadek externích služeb (testovací prostředí nemá internet).
- **Co se nedalo ověřit:** skutečné chování sítě Cloudflare (více datacenter a instancí), reálné limity Twitch/Kick/IGDB/Steam,
  přesné CPU na Cloudflare (měřeno v Node/workerd lokálně – řádově odpovídá).

## Výsledky
| Test | Výsledek |
|---|---|
| Smíšený provoz 10 / 50 / 100 / 200 klientů (25 stránek a API) | **0 chyb**, p50 14 / 59 / 121 / 285 ms (strop dával lokální počítač, ~700 pož./s) |
| 15 spuštění všech Cronů během zátěže 100 klientů | 0 chyb, 14 tis. požadavků OK |
| Crony bez internetu (výpadek Twitch/Kick/IGDB/Steam) | doběhly, chyby zapsané v deníku, web dál odpovídal |
| 300 souběžných nových odběrů upozornění | 30 přijato, zbytek 503 – pojistka proti zahlcení funguje |
| Tělo 2 MB / rozbitý JSON / cizí push server / SQL a HTML ve vstupu | 413 / 400 / 400 / 400 – nic se neuložilo |

## Co test našel a co se opravilo
| Nález (při objemu po roce) | Před | Po |
|---|---|---|
| 100 souběžných návštěv Přehledu se studenou mezipamětí | 64 výpočtů, **5,7 mil. přečtených řádků** (víc než denní limit) | 1 výpočet, 89 tis. |
| `/api/hry` – živé streamy počítané znovu pro každou hru | 314 tis. řádků / načtení | 1,9 tis. (počty streamerů 1× za 6 h) |
| Vyšší nebo nižší – dotaz kvůli GROUP BY četl celou historii | 128 tis. | 10 tis. |
| Co hraje Česko – celá tabulka hry_streamera | 75 tis. | 19 tis., a nejvýš 1× za 15 min |
| Přehled | 163 tis. | 89 tis., a nejvýš 1× za 30 min |
| Týden na scéně | 230 tis. | 151 tis., rozběhnutý týden nejvýš 1× za hodinu, uzavřený 1× denně |
| Měsíční zpráva (nová) | 625 tis. při každém načtení | uzavřený měsíc se spočítá jednou, rozběhnutý 1× za 12 h |
| Snímky streamerů bez indexu podle dne – týdenní/měsíční výběry četly celou tabulku | 548 tis. | jen dané období |
| Analytika: historie cen 8× denně | 5,8 mil./den | 1× denně (730 tis.) |
| Sitemap bez mezipaměti | 15 tis. při každém stažení robotem | 1× za 6 h |
| Hitparáda: výpočet týdne v JavaScriptu nad 4 000 řádky, doplnění 8 týdnů naráz | 45–69 ms CPU | ~1 ms běžně, doplnění po 2 týdnech |
| Sledované hry: velká sleva u 300 her a 2 000 odběrů | 442 ms CPU, 2 800 příkazů | ~11 ms, rozeslání přímo v databázi |
| Limit 100 sledovaných her šel při souběžném klikání přetéct (121) | 121 | přesně 100 (kontrola a zápis v jednom příkazu) |
| Chybějící tabulka vracela prázdná data s kódem 200 (audit) | „nic tu není“ | 503 „Data se právě připravují“ |
| Výpadek IGDB/Twitch vracel „Interní chyba“ 500 | 500 | 503 „Služba je teď nedostupná“ |
| Hledání v IGDB bez limitu, různá velikost písmen = nové hledání (audit) | bez limitu | 40 nových hledání/min na instanci, sjednocený dotaz |

**Sdílená mezipaměť v D1** (`src/mezipamet.js`): mezipaměť Cloudflare je zvlášť v každém datacentru, takže drahý souhrn
se při návštěvách z více míst počítal znovu. Teď se výsledek uloží do D1 a počítá se nejvýš jednou za danou dobu. Když data
zestárnou, přepočítá je jen jeden požadavek (zámek), ostatní dostanou poslední verzi.

## Co zůstává (při roce dat a nepřetržité návštěvnosti)
Nejhorší případ = data za rok a návštěva v každém okně mezipaměti celý den. Teď (data za ~45 dní, menší návštěvnost) je
všechno hluboko pod limitem; tohle jsou místa, která porostou s historií:
| Místo | Čtení na výpočet | Nejhorší případ za den |
|---|---|---|
| Žebříček streamerů (`/api/streameri`, mezipaměť 60 s, víc variant řazení) | 22 tis. (30denní součty pro každého streamera) | až desítky milionů – **největší riziko** |
| Přehled (1× za 30 min) | 89 tis. | 4,3 mil. |
| Týden na scéně, rozběhnutý týden (1× za hodinu) | 151 tis. | 3,6 mil. |
| Co hraje Česko (1× za 15 min) | 19 tis. | 1,8 mil. |

**Navržený další krok:** tabulka denních souhrnů streamerů (minuty a špička za 7 a 30 dní, růst sledujících), přepočítaná
jednou denně v Cronu. Žebříček, Přehled i Týden na scéně by pak četly stovky řádků místo desítek tisíc.

Další poznámky:
- **Oprava 2026-11-27 večer:** automatické založení indexu `idx_snimky_den` na ostré databázi vyčerpalo denní limit zápisů
  a zastavilo sběr streamerů. Index se už nezakládá; kód ho použije jen, pokud existuje. Bez indexu se čte víc (viz čísla výše
  bez indexu: Týden na scéně ~181 tis., Přehled ~85 tis., Měsíční zpráva ~264 tis. při objemu po roce).
- Ochrana proti náporu u úplně prvního výpočtu (prázdná mezipaměť) funguje jen v rámci jedné instance Workeru.
