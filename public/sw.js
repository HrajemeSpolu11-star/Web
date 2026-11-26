// Service worker Herního pulsu – jen pro upozornění „je živě“. Nic necachuje.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
    for (const z of zpravy.slice(0, 3)) {
      let url = "/zive";
      try { const u = new URL(z.url, self.location.origin); if (u.origin === self.location.origin) url = u.pathname; } catch {}
      await self.registration.showNotification(String(z.titulek || "Herní puls").slice(0, 80), {
        body: String(z.text || "").slice(0, 140), tag: url, data: { url }, icon: "/ikona.svg", badge: "/ikona.svg",
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
