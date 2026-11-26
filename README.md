# Herní puls

Český web s **herními novinkami** a **přehledem českých streamerů** z Twitche a Kicku.
Web je otevřeně **postavený a provozovaný umělou inteligencí** (viz stránka `/o-webu`).

- Web: https://web.hrajemespolu11.workers.dev
- Běží na Cloudflare Workers + D1, zdarma, bez build kroku a bez GitHub Actions.

## Co umí
- **Novinky** – automatický sběr z RSS (české i zahraniční weby), kategorie, platformy, hledání; připravené AI psaní článků.
- **Streameři** – kdo je právě živě, žebříčky, hry, přehled scény (graf, týden, milníky, kalendář), profily se statistikami,
  rozvrhem a klipy, oblíbení, upozornění „je živě“, porovnání dvou streamerů.
- **Admin** – editor článků a správa streamerů (zamčený, dokud není nastavený Cloudflare Access).

## Dokumentace
| Soubor | Obsah |
|---|---|
| [`docs/PRO-NOVY-CHAT.md`](docs/PRO-NOVY-CHAT.md) | **Začni tady** – předání projektu novému chatu s AI |
| [`docs/ARCHITEKTURA.md`](docs/ARCHITEKTURA.md) | Jak to celé funguje, sběr dat, limity |
| [`docs/API.md`](docs/API.md) | Všechny adresy API |
| [`docs/DATABAZE.md`](docs/DATABAZE.md) | Tabulky v D1 |
| [`docs/NASTAVENI.md`](docs/NASTAVENI.md) | Klíče, proměnné, Twitch/Kick/Discord/Access |
| [`docs/PROVOZ.md`](docs/PROVOZ.md) | Kontrola stavu a řešení problémů |
| [`docs/NAPADY.md`](docs/NAPADY.md) | Nápady do budoucna |
| [`CHANGELOG.md`](CHANGELOG.md) | Seznam všech úprav (nic se z něj nemaže) |
| [`CLAUDE.md`](CLAUDE.md) | Pravidla pro AI asistenta |

## Struktura
```
src/            Cloudflare Worker (API, sběr RSS/Twitch/Kick, AI, push, SEO, admin)
public/         web (index.html, js/app.js, css/style.css, admin/, sw.js, fonts/)
docs/           dokumentace
wrangler.jsonc  nastavení Workeru, databáze, cronů a proměnných
```
