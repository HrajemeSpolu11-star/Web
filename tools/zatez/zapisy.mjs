// Zápisový nápor: 300 souběžných „Sledovat hru“ z různých prohlížečů + 300 opakovaných z jednoho, + nesmyslná data.
const B = "http://127.0.0.1:8787";
const post = (p, b) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json", Origin: B }, body: typeof b === "string" ? b : JSON.stringify(b) })
  .then(async (r) => ({ s: r.status, t: (await r.text()).slice(0, 80) })).catch((e) => ({ s: 0, t: String(e) }));
const shrn = (n, r) => { const c = {}; for (const x of r) c[x.s] = (c[x.s] || 0) + 1; console.log(n.padEnd(48), JSON.stringify(c), r.find((x) => x.s >= 400)?.t || ""); };
shrn("300× sledovat z různých prohlížečů", await Promise.all(Array.from({ length: 300 }, (_, i) => post("/api/push/sledovat", { endpoint: `https://fcm.googleapis.com/fcm/send/zatez${Date.now()}${i}`, slug: `hra-${i % 50}`, nazev: "Hra" }))));
const ep = `https://fcm.googleapis.com/fcm/send/jeden${Date.now()}`;
shrn("300× sledovat ze stejného prohlížeče (různé hry)", await Promise.all(Array.from({ length: 300 }, (_, i) => post("/api/push/sledovat", { endpoint: ep, slug: `hra-${i}`, nazev: "Hra" }))));
shrn("50× neplatný push server", await Promise.all(Array.from({ length: 50 }, (_, i) => post("/api/push/sledovat", { endpoint: `https://zly.example.com/${i}`, slug: "hra-1" }))));
shrn("50× neplatný slug / SQL / XSS", await Promise.all(Array.from({ length: 50 }, (_, i) => post("/api/push/sledovat", { endpoint: ep, slug: i % 2 ? "x'; DROP TABLE sledovani;--" : "<script>alert(1)</script>" }))));
shrn("20× tělo 2 MB", await Promise.all(Array.from({ length: 20 }, () => post("/api/push/sledovat", "x".repeat(2e6)))));
shrn("50× rozbitý JSON", await Promise.all(Array.from({ length: 50 }, () => post("/api/push/sledovat", "{\"endpoint\":"))));
const r = await fetch(B + "/api/moje-hry?s=" + Array.from({ length: 500 }, (_, i) => `hra-${i}`).join(",")); console.log("moje-hry s 500 hrami".padEnd(48), r.status, r.headers.get("x-rows-read"), "řádků");
const q = await fetch(B + "/api/databaze?dotaz=" + encodeURIComponent("'\"); DROP TABLE hry;-- ".repeat(20))); console.log("databáze – nebezpečný dotaz".padEnd(48), q.status);
