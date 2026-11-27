// Service worker Herního pulsu: upozornění (živě, slevy) a stránka „Jsi offline“.
// Data ani stránky se necachují – web vždy ukazuje aktuální čísla. Uložená je jen offline stránka a styly k ní.
const OFFLINE = "hp-offline-v8";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(OFFLINE).then((c) => c.addAll(["/offline.html", "/css/style.css", "/js/jazyk.js"])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== OFFLINE) await caches.delete(k);
  await self.clients.claim();
})()));
// Jen načtení stránky: když není síť, ukáže se offline stránka. Vše ostatní jde normálně na síť.
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(async () => (await caches.match("/offline.html")) || Response.error()));
});

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let zpravy = [];
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        const r = await fetch("/api/push/zpravy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        if (r.ok) zpravy = await r.json();
      }
    } catch {}
    if (!zpravy.length) zpravy = [{ titulek: "Herní puls", text: "Někdo z tvých oblíbených je živě", url: "/zive" }];
    for (const z of zpravy) {
      let url = "/zive";
      try { const u = new URL(z.url, self.location.origin); if (u.origin === self.location.origin) url = u.pathname; } catch {}
      // Každá zpráva má vlastní značku – upozornění se navzájem nepřepisují.
      await self.registration.showNotification(String(z.titulek || "Herní puls").slice(0, 80), {
        body: String(z.text || "").slice(0, 140), tag: `hp-${z.id || Math.random()}`, data: { url }, icon: "/ikona-192.png", badge: "/ikona-192.png",
      });
    }
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/zive";
  e.waitUntil((async () => {
    const okna = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const o of okna) { if ("focus" in o) { o.navigate(url); return o.focus(); } }
    return self.clients.openWindow(url);
  })());
});
