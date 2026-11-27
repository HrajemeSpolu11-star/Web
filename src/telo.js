// Čtení těla odpovědi/požadavku s pevným limitem bajtů – ochrana proti obřím stránkám a feedům (limit 10 ms CPU, paměť).
// Čte se proud po částech; po dosažení limitu se čtení zruší, takže se zbytek ani nestahuje.

async function precti(body, max, useknout) {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader(), casti = [];
  let delka = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (delka + value.byteLength > max) {
      reader.cancel().catch(() => {});
      if (!useknout) throw new Error("příliš velké");
      casti.push(value.subarray(0, max - delka)); delka = max;
      break;
    }
    casti.push(value); delka += value.byteLength;
  }
  const vse = new Uint8Array(delka);
  let o = 0;
  for (const c of casti) { vse.set(c, o); o += c.byteLength; }
  return vse;
}

// Text odpovědi, nejvýš `max` bajtů (delší se usekne – u RSS/HTML stačí začátek).
export async function textOmezeny(r, max) {
  return new TextDecoder().decode(await precti(r.body, max, true));
}

// Tělo požadavku (formuláře, admin): delší než `max` → chyba „příliš velké“.
export async function teloPozadavku(request, max) {
  if (Number(request.headers.get("Content-Length") || 0) > max) throw new Error("příliš velké");
  return new TextDecoder().decode(await precti(request.body, max, false));
}

// Odpověď se stejnými hlavičkami, ale tělem useknutým na `max` bajtů (pro HTMLRewriter).
export function odpovedOmezena(r, max) {
  if (!r.body) return r;
  let zbyva = max;
  const reader = r.body.getReader();
  const proud = new ReadableStream({
    async pull(c) {
      if (zbyva <= 0) { reader.cancel().catch(() => {}); c.close(); return; }
      const { done, value } = await reader.read();
      if (done) { c.close(); return; }
      const kus = value.byteLength > zbyva ? value.subarray(0, zbyva) : value;
      zbyva -= kus.byteLength; c.enqueue(kus);
    },
    cancel() { reader.cancel().catch(() => {}); },
  });
  return new Response(proud, { status: r.status, headers: r.headers });
}
