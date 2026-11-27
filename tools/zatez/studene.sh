#!/bin/bash
# Každý endpoint 1× se studenou mezipamětí (čtení/zápisy D1, dotazy, čas), pak 2× s teplou.
B=http://127.0.0.1:8787
for u in / /zive /hitparada /api/zive /api/streameri "/api/streamer/twitch/stream5" /api/hry "/api/hra/hra-5" /api/cesko /api/ceska-scena /api/hitparada /api/zprava /api/report /api/trendy /api/analytika /api/prehled /api/radar /api/katalog /api/cenovy-radar "/api/moje-hry?s=hra-1,hra-2,hra-3" /api/vydani /api/aktualizace /api/stav /api/akce /api/clanky /api/cestina "/api/co-hrat" /api/vyssi-nizsi /api/vyroci /api/ranni /sitemap.xml; do
  h=$(curl -s -o /dev/null -D - -m 60 -w 'code=%{http_code} t=%{time_total}' "$B$u")
  r=$(echo "$h" | grep -i '^x-rows-read' | tr -d '\r' | awk '{print $2}'); w=$(echo "$h" | grep -i '^x-rows-written' | tr -d '\r' | awk '{print $2}'); d=$(echo "$h" | grep -i '^x-dotazu' | tr -d '\r' | awk '{print $2}')
  c=$(echo "$h" | tail -1)
  h2=$(curl -s -o /dev/null -D - -m 60 -w 't=%{time_total}' "$B$u"); r2=$(echo "$h2" | grep -i '^x-rows-read' | tr -d '\r' | awk '{print $2}')
  printf "%-36s %-22s čtení=%-8s zápisy=%-5s dotazů=%-4s | teplá: čtení=%-6s %s\n" "$u" "$c" "$r" "$w" "$d" "$r2" "$(echo "$h2" | tail -1)"
done
