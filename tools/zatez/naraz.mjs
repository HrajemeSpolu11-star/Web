// Nápor na studenou mezipaměť: N souběžných požadavků na stejný drahý endpoint. Kolikrát se počítalo? Kolik řádků se přečetlo?
const B = "http://127.0.0.1:8787";
const N = Number(process.argv[2] || 100);
for (const p of (process.argv[3] || "/api/prehled,/api/report,/api/zprava,/api/hry,/api/cesko").split(",")) {
  const t = Date.now();
  const r = await Promise.all(Array.from({ length: N }, () => fetch(B + p).then(async (x) => ({ s: x.status, cteni: Number(x.headers.get("x-rows-read") || 0), b: (await x.arrayBuffer()).byteLength })).catch((e) => ({ s: 0, e: String(e) }))));
  const vypoctu = r.filter((x) => x.cteni > 50).length;
  console.log(JSON.stringify({ cesta: p, pozadavku: N, ok: r.filter((x) => x.s === 200).length, chyby: r.filter((x) => x.s !== 200).map((x) => x.s).slice(0, 5),
    vypoctu, precteno_celkem: r.reduce((a, x) => a + (x.cteni || 0), 0), ms: Date.now() - t }));
}
