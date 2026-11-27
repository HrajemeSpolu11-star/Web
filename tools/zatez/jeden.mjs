const B = "http://127.0.0.1:8787", ep = `https://fcm.googleapis.com/fcm/send/jeden${Date.now()}`;
const post = (b) => fetch(B + "/api/push/sledovat", { method: "POST", headers: { "Content-Type": "application/json", Origin: B }, body: JSON.stringify(b) }).then(async (r) => ({ s: r.status, t: (await r.text()).slice(0, 70) }));
const shrn = (n, r) => { const c = {}; for (const x of r) c[x.s] = (c[x.s] || 0) + 1; console.log(n.padEnd(52), JSON.stringify(c), r.find((x) => x.s >= 400)?.t || ""); };
shrn("1. hra (nový odběr)", [await post({ endpoint: ep, slug: "hra-0", nazev: "Hra" })]);
shrn("120× další hra souběžně ze stejného prohlížeče", await Promise.all(Array.from({ length: 120 }, (_, i) => post({ endpoint: ep, slug: `hra-${i + 1}`, nazev: "Hra" }))));
shrn("50× SQL / XSS ve slugu", await Promise.all(Array.from({ length: 50 }, (_, i) => post({ endpoint: ep, slug: i % 2 ? "x'; DROP TABLE sledovani;--" : "<script>alert(1)</script>" }))));
