// Zátěžový test: smíšený provoz (stránky + API) při 10/50/100/200 souběžných klientech.
import autocannon from "/tmp/zatez/node_modules/autocannon/autocannon.js";
const B = "http://127.0.0.1:8787";
const cesty = ["/", "/zive", "/hitparada", "/novinky", "/api/zive", "/api/streameri", "/api/hitparada", "/api/zprava", "/api/report", "/api/trendy",
  "/api/prehled", "/api/cesko", "/api/hry", "/api/radar", "/api/katalog", "/api/aktualizace", "/api/vydani", "/api/clanky", "/api/streamer/twitch/stream5",
  "/api/hra/hra-5", "/api/analytika", "/api/moje-hry?s=hra-1,hra-2", "/css/style.css", "/js/app.js", "/js/jazyk.js"];
const vysl = [];
for (const c of (process.argv[2] || "10,50,100,200").split(",").map(Number)) {
  const r = await autocannon({ url: B, connections: c, duration: Number(process.argv[3] || 15), requests: cesty.map((p) => ({ method: "GET", path: p })) });
  const v = { klientu: c, pozadavku: r.requests.total, za_s: Math.round(r.requests.average), p50_ms: r.latency.p50, p97_5_ms: r.latency.p97_5, p99_ms: r.latency.p99, max_ms: r.latency.max,
    chyby: r.errors, timeouty: r.timeouts, s2xx: r["2xx"], s4xx: r["4xx"], s5xx: r["5xx"] };
  vysl.push(v); console.log(JSON.stringify(v));
}
