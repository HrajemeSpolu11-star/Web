(() => {
  const C = window.CONFIG || {};
  const app = document.getElementById("app");
  const state = {
    clanky: [], zive: { streamy: [], hry: [] }, adresar: {}, hry: null,
    razeni: "sledujici", platforma: "", hledatS: "", hraZive: "", filtr: "Vše", hledat: "",
    kategorie: "", mali: false, udalost: null, prehled: null, zdrojNov: null, katNov: "",
    katalog: null, obsah: undefined, slevyObchod: "steam", topObchod: "steam", noveBrzy: "nove",
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " mil." : n >= 1e3 ? (Math.round(n / 100) / 10).toString().replace(".", ",") + " tis." : String(n ?? 0);
  const https = (u) => /^https:\/\//.test(String(u || "")) ? u : "";
  const enc = encodeURIComponent;
  // Formát data a čísel podle zvoleného jazyka (CZ / SK / EN) – nastavuje jazyk.js.
  const LOC = { sk: "sk-SK", en: "en-GB" }[window.HP_JAZYK] || "cs-CZ";
  // Česká množná čísla: 1 stream, 2–4 streamy, 5+ streamů.
  const pl = (n, a, b, c) => `${n} ${n === 1 ? a : n >= 2 && n <= 4 ? b : c}`;

  // Bezpečnost: barvy pouze ve tvaru #abc / #aabbcc, odkazy pouze http(s).
  const barva = (v, zaloha) => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(v)) ? v : zaloha;
  function bezpecnaUrl(u) {
    try { const x = new URL(u, location.href); return x.protocol === "https:" || x.protocol === "http:" ? x.href : "#"; }
    catch { return "#"; }
  }
  // Styly se nastavují přes JS (CSSOM), takže CSP může zakázat inline styly.
  function obarvi(root) {
    requestAnimationFrame(() => nakresliEkg(root));
    root.querySelectorAll("[data-barva]").forEach((el) => el.style.setProperty("--sk", barva(el.dataset.barva, "#ffc04d")));
    // Zpětné tlačítko vede na předchozí stránku webu → popisek „Zpět“ (bez historie vede na nadřazenou sekci s jejím názvem).
    if ((history.state?.n || 0) > 0) root.querySelectorAll("a.back, a.zpet-hub").forEach((a) => { a.textContent = "← Zpět"; });
    // Náhled streamu, který se nenačte: zmizí a ukáže se rozostřená profilovka streamera (žádná rozbitá ikona obrázku).
    root.querySelectorAll("img[data-nahled]").forEach((img) => {
      const pryc = () => { img.closest(".live-thumb")?.classList.add("bez-nahledu"); img.remove(); };
      if (img.complete && img.naturalWidth === 0 && img.src) pryc(); else img.addEventListener("error", pryc, { once: true });
    });
    // Obrázek, který se nenačte (smazaný banner, vypršelý náhled), nahradí náhradní pozadí.
    root.querySelectorAll("img[data-zaloha]").forEach((img) => img.addEventListener("error", () => { const b = img.closest(".banner"); img.remove(); b?.classList.add("banner-nahrada"); }, { once: true }));
    root.querySelectorAll("img.cover-img").forEach((img) => img.addEventListener("error", () => img.remove(), { once: true }));
    // Aktualizace bez obrázku: náhradní dlaždice s názvem hry (data-hra → CSS).
    root.querySelectorAll(".patch-obr img").forEach((img) => img.addEventListener("error", () => { img.parentElement.classList.add("bez-obr"); img.remove(); }, { once: true }));
    root.querySelectorAll("[data-a]").forEach((el) => {
      el.style.background = `linear-gradient(135deg,${barva(el.dataset.a, "#444")},${barva(el.dataset.b, "#111")})`;
    });
    root.querySelectorAll(".bar i[data-w]").forEach((i) => {
      const w = Math.max(2, Math.min(100, +i.dataset.w || 0)) + "%";
      if (malyPohyb()) i.style.width = w; else requestAnimationFrame(() => requestAnimationFrame(() => (i.style.width = w)));
    });
    dekodujNadpisy(root);
    root.querySelectorAll(".sloupce i[data-h]").forEach((i) => { i.style.height = Math.max(2, Math.min(100, +i.dataset.h || 0)) + "%"; });
    // Čísla „naběhnou“ jako skóre ve hře.
    if (!malyPohyb()) root.querySelectorAll("[data-count]").forEach((el) => {
      const cil = +el.dataset.count, pripona = el.dataset.suffix || "";
      if (!Number.isFinite(cil) || cil <= 0) return;
      // Souhrn v hlavičce se animuje jen jednou (ne při každém přepnutí filtru).
      if (el.dataset.once) { if (animovano.has(el.dataset.once)) return; animovano.add(el.dataset.once); }
      const start = performance.now(), delka = 900;
      const krok = (t) => {
        const p = Math.min(1, (t - start) / delka), e = 1 - Math.pow(1 - p, 3);
        el.textContent = num(Math.round(cil * e)) + pripona;
        if (p < 1) requestAnimationFrame(krok);
      };
      requestAnimationFrame(krok);
    });
  }
  const animovano = new Set();

  // Nadpisy sekcí se při prvním zobrazení „dekódují“ jako výstup AI: znaky se přeskupí do textu a dobliká kurzor.
  // Mění se jen první textový uzel nadpisu (odkazy a přepínače zůstávají). Každý nadpis jen jednou za návštěvu stránky.
  const ZNAKY_AI = "01<>/#*+=%?_";
  const dekodovano = new Set();
  let pozorovatel = null;
  function dekodujNadpis(el) {
    const uzel = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!uzel) return;
    const cil = uzel.textContent, delka = Math.min(900, 300 + cil.trim().length * 28), start = performance.now();
    const kurzor = document.createElement("span");
    kurzor.className = "ai-kurzor";
    kurzor.setAttribute("aria-hidden", "true");
    uzel.after(kurzor);
    el.classList.add("nt-bezi");
    const krok = (t) => {
      const p = Math.min(1, (t - start) / delka), hotovo = Math.floor(cil.length * p);
      uzel.textContent = cil.slice(0, hotovo) + [...cil.slice(hotovo)].map((z) => (z === " " ? " " : ZNAKY_AI[(Math.random() * ZNAKY_AI.length) | 0])).join("");
      if (p < 1) requestAnimationFrame(krok);
      else { uzel.textContent = cil; el.classList.remove("nt-bezi"); setTimeout(() => kurzor.remove(), 1600); }
    };
    requestAnimationFrame(krok);
  }
  function dekodujNadpisy(root) {
    if (malyPohyb() || !("IntersectionObserver" in window)) return;
    pozorovatel ||= new IntersectionObserver((zaznamy) => zaznamy.forEach((z) => {
      if (!z.isIntersecting) return;
      pozorovatel.unobserve(z.target);
      dekodujNadpis(z.target);
    }), { threshold: 0.6 });
    root.querySelectorAll(".section-title, .home-head h1, .cesko-head h2, .rep-head h2").forEach((el) => {
      const klic = location.pathname + "|" + el.textContent.trim().slice(0, 40);
      if (dekodovano.has(klic)) return;
      dekodovano.add(klic);
      pozorovatel.observe(el);
    });
  }

  // Stavový řádek AI: jen skutečné časy z dat (kdy se naposledy kontrolovalo), nic vymyšleného.
  const hhmm = (d) => new Date(d).toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit" });
  function dalsiKontrola(minuta) {
    const d = new Date(); d.setSeconds(0, 0);
    if (d.getMinutes() >= minuta) d.setHours(d.getHours() + 1);
    d.setMinutes(minuta);
    return d;
  }
  // Dřív „ai-cip“ s chybným popisem „Data ověřila AI“ – data z obchodů AI neověřuje, jsou přímo z oficiálního rozhraní.
  const aiCip = (zdroj, cas) => cas ? puvod("oficialni", zdroj, cas) : "";
  const malyPohyb = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const kostra = (n = 4, typ = "radek") => `<div class="kostry">${Array.from({ length: n }, () => `<div class="kostra kostra-${typ}"></div>`).join("")}</div>`;

  // Herní „achievement“ oznámení.
  function achievement(nazev, text) {
    document.querySelectorAll(".ach").forEach((e) => e.remove());
    const el = document.createElement("div");
    el.className = "ach";
    el.setAttribute("role", "status");
    el.innerHTML = `<div class="ach-ikona" aria-hidden="true">★</div><div><b>${esc(nazev)}</b><span>${esc(text)}</span></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add("ach-pryc"), 3200);
    setTimeout(() => el.remove(), 3800);
  }

  // ---------- Sdílení jako obrázek ----------
  // Karta 1080×1350 se nakreslí přímo v prohlížeči (canvas) jen z textu a čísel – žádné cizí obrázky, nic se neposílá na server.
  // Na mobilu se otevře nabídka Sdílet (Instagram, WhatsApp, Discord…), jinde se obrázek stáhne.
  async function sdilejObrazek({ stitek, nadpis, radky = [], odkaz }) {
    const W = 1080, H = 1350, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    try { await Promise.all([document.fonts.load('800 80px "Rubik"'), document.fonts.load('500 40px "Rubik"')]); } catch {}
    const F = (v, s) => `${v} ${s}px "Rubik", system-ui, sans-serif`;
    g.fillStyle = "#16132e"; g.fillRect(0, 0, W, H);
    const z = g.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, 700);
    z.addColorStop(0, "rgba(155,92,255,.38)"); z.addColorStop(1, "rgba(155,92,255,0)");
    g.fillStyle = z; g.fillRect(0, 0, W, H);
    // znak loga: herní ovladač s EKG křivkou (stejný jako v hlavičce webu)
    const znak = (x, y, vel, a) => {
      g.save(); g.translate(x, y); g.scale(vel / 64, vel / 64); g.globalAlpha = a;
      g.fillStyle = "#140f33"; g.beginPath(); g.roundRect(0, 0, 64, 64, 18); g.fill();
      const telo = new Path2D("M20 18.5h24c6.5 0 10.6 4.2 12 10.5l2.6 12c1 4.8-2.2 8.5-6.2 8.5-2.6 0-4.4-1.6-5.8-3.8l-3-4.7H20.4l-3 4.7c-1.4 2.2-3.2 3.8-5.8 3.8-4 0-7.2-3.7-6.2-8.5l2.6-12C9.4 22.7 13.5 18.5 20 18.5z");
      const go = g.createLinearGradient(5, 18, 59, 50); go.addColorStop(0, "#efe8ff"); go.addColorStop(1, "#a98bff");
      g.fillStyle = "#1d1645"; g.fill(telo); g.lineWidth = 3; g.lineJoin = "round"; g.strokeStyle = go; g.shadowColor = "rgba(169,139,255,.7)"; g.shadowBlur = 6; g.stroke(telo); g.shadowBlur = 0;
      g.lineCap = "round"; g.lineWidth = 2.6; g.strokeStyle = "#efe8ff"; g.stroke(new Path2D("M17.5 26v8M13.5 30h8"));
      g.fillStyle = "#c9b8ff"; for (const [cx, cy] of [[46.5, 26.8], [50.2, 30.4], [46.5, 34], [42.8, 30.4]]) { g.beginPath(); g.arc(cx, cy, 1.9, 0, 7); g.fill(); }
      g.strokeStyle = "#ff3d7f"; g.shadowColor = "rgba(255,61,127,.8)"; g.shadowBlur = 5; g.stroke(new Path2D("M23 31h3.4l2.2-6 3.4 11 2.8-7.6 1.6 2.6h3.4"));
      g.restore();
    };
    znak(760, 70, 280, 0.2); znak(76, 76, 72, 1);
    g.fillStyle = "#f4f1ff"; g.font = F(800, 46); g.textBaseline = "middle"; g.fillText("Herní puls", 165, 112);
    // štítek
    g.font = F(800, 34); const sw = g.measureText(stitek).width;
    g.fillStyle = "#ffc04d"; g.beginPath(); g.roundRect(72, 250, sw + 48, 64, 32); g.fill();
    g.fillStyle = "#2a1d00"; g.fillText(stitek, 96, 283);
    // nadpis (zalomení, max 3 řádky)
    let vel = 84; g.font = F(800, vel);
    const zalom = (t, max) => { const out = []; let r = ""; for (const s of t.split(" ")) { const z = r ? r + " " + s : s; if (g.measureText(z).width > max && r) { out.push(r); r = s; } else r = z; } return [...out, r]; };
    let rad = zalom(nadpis, W - 144);
    if (rad.length > 3) { vel = 66; g.font = F(800, vel); rad = zalom(nadpis, W - 144); }
    g.fillStyle = "#f4f1ff"; g.textBaseline = "alphabetic";
    let y = 420; rad.slice(0, 3).forEach((r) => { g.fillText(r, 72, y); y += vel * 1.12; });
    // čísla
    y += 30;
    // Dlaždice s čísly se přizpůsobí místu, které zbývá nad patičkou.
    const list = radky.slice(0, 4), mezera = 20, vyska = Math.min(150, (H - 190 - y - mezera * (list.length - 1)) / Math.max(1, list.length)), k = vyska / 150;
    for (const [cislo, popis] of list) {
      g.fillStyle = "rgba(255,255,255,.06)"; g.beginPath(); g.roundRect(72, y, W - 144, vyska, 28 * k); g.fill();
      g.fillStyle = "#ffc04d"; g.font = F(800, Math.round(64 * k)); g.fillText(String(cislo), 112, y + 88 * k);
      g.fillStyle = "#b9b2dc"; g.font = F(500, Math.round(32 * k)); g.fillText(String(popis).slice(0, 48), 112, y + 128 * k);
      y += vyska + mezera;
    }
    g.fillStyle = "#ffc04d"; g.fillRect(0, H - 14, W, 14);
    g.fillStyle = "#f4f1ff"; g.font = F(800, 32); g.fillText(location.host + (odkaz || ""), 72, H - 100);
    g.fillStyle = "#b9b2dc"; g.font = F(500, 28); g.fillText("Data ověřila AI z oficiálních zdrojů · Herní puls", 72, H - 56);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const soubor = new File([blob], `herni-puls-${(odkaz || "karta").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "karta"}.png`, { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [soubor] })) { await navigator.share({ files: [soubor], title: nadpis, url: location.origin + (odkaz || "") }); return; }
    } catch (e) { if (e.name === "AbortError") return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = soubor.name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const tlacitkoObrazek = (id) => `<button type="button" class="btn-maly" id="${id}">Sdílet jako obrázek</button>`;

  // Odkaz na hru: hry ze Steamu mají vlastní stránku u nás (/hra/steam/ID), ostatní vedou do obchodu.
  const steamIdHry = (h) => h.obchod === "steam" || /store\.steampowered\.com\/app\/\d+/.test(h.url || "") ? String(h.id || (/app\/(\d+)/.exec(h.url || "") || [])[1] || "") : "";
  function odkazHry(h) {
    const id = steamIdHry(h);
    return /^\d+$/.test(id) ? `href="/hra/steam/${id}"` : `href="${esc(bezpecnaUrl(h.url))}" target="_blank" rel="noopener noreferrer"`;
  }

  // ---------- Čeština a hlídač cen ----------
  // Čeština podle údajů na Steamu: 2 = dabing, 1 = titulky/rozhraní, 0 = bez češtiny, null = zatím neověřeno.
  function czStitek(h, uplny = false) {
    if (h.cestina === 2) return `<span class="cz cz-dabing">CZ dabing</span>`;
    if (h.cestina === 1) return `<span class="cz">CZ texty</span>`;
    if (uplny && h.cestina === 0) return `<span class="cz cz-ne">bez češtiny</span>`;
    if (uplny && h.cestina == null) return `<span class="cz cz-nevim">čeština se ověřuje</span>`;
    return "";
  }
  function hlidane() { try { return JSON.parse(localStorage.getItem("hp_hlidam") || "[]"); } catch { return []; } }
  const ulozHlidane = (l) => { try { localStorage.setItem("hp_hlidam", JSON.stringify(l.slice(0, 200))); } catch {} };
  const hlidam = (id) => hlidane().some((x) => x.id === String(id));
  const tlacitkoHlidat = (h) => `<button type="button" class="hlidat${hlidam(h.id) ? " on" : ""}" data-hlidat="${esc(h.id)}" data-nazev="${esc(h.nazev)}"
      aria-pressed="${hlidam(h.id)}">${hlidam(h.id) ? "🔔 Hlídám" : "🔔 Hlídat cenu"}</button>`;
  async function odberPush() {
    if (!pushZapnuto()) await zapniUpozorneni();
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = reg && await reg.pushManager.getSubscription();
    if (!sub) { await zapniUpozorneni(); return odberPush(); }
    return sub;
  }
  async function nastavHlidani(id, nazev, zapnout, cil = null) {
    const sub = await odberPush();
    const r = await fetch(`/api/push/${zapnout ? "hlidat" : "nehlidat"}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint, steam_id: String(id), nazev, cil }) });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(v.chyba || "Nepodařilo se uložit.");
    const l = hlidane().filter((x) => x.id !== String(id));
    if (zapnout) l.unshift({ id: String(id), nazev, cil });
    ulozHlidane(l);
  }
  // Jedno místo pro všechna tlačítka „Hlídat cenu“ (karty, stránka hry, čeština, hlídač).
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-hlidat]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const id = b.dataset.hlidat, zapnout = !hlidam(id);
    b.disabled = true;
    try {
      await nastavHlidani(id, b.dataset.nazev || "", zapnout);
      document.querySelectorAll(`[data-hlidat="${CSS.escape(id)}"]`).forEach((x) => {
        x.classList.toggle("on", zapnout); x.setAttribute("aria-pressed", zapnout); x.textContent = zapnout ? "🔔 Hlídám" : "🔔 Hlídat cenu";
      });
      achievement(zapnout ? "Hlídám cenu" : "Hlídání zrušeno", zapnout ? "Dám ti vědět, až bude ve slevě." : b.dataset.nazev || "");
    } catch (err) { achievement("Nejde to", err.message || "Zkus to znovu."); }
    finally { b.disabled = false; }
  }, true);

  // ---------- Sledované hry („Sledovat hru“ + blok Moje hry na Domů) ----------
  // Seznam je jen v prohlížeči. Když jsou zapnutá upozornění, server zná pouze ID hry u tvého push odběru.
  function sledovane() { try { return JSON.parse(localStorage.getItem("hp_sledovane") || "[]"); } catch { return []; } }
  const ulozSledovane = (l) => { try { localStorage.setItem("hp_sledovane", JSON.stringify(l.slice(0, 100))); } catch {} };
  const sleduji = (slug) => sledovane().some((x) => x.slug === slug);
  const tlacitkoSledovat = (h) => !h?.slug ? "" : `<button type="button" class="sledovat${sleduji(h.slug) ? " on" : ""}" data-sledovat="${esc(h.slug)}"
      data-nazev="${esc(h.nazev || "")}" data-steam="${esc(h.steam_id || "")}" aria-pressed="${sleduji(h.slug)}">${sleduji(h.slug) ? "★ Sleduji" : "☆ Sledovat hru"}</button>`;
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-sledovat]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const slug = b.dataset.sledovat, zapnout = !sleduji(slug), nazev = b.dataset.nazev || "";
    const l = sledovane().filter((x) => x.slug !== slug);
    if (zapnout) l.unshift({ slug, nazev, steam_id: b.dataset.steam || null });
    ulozSledovane(l);
    document.querySelectorAll(`[data-sledovat="${CSS.escape(slug)}"]`).forEach((x) => {
      x.classList.toggle("on", zapnout); x.setAttribute("aria-pressed", zapnout); x.textContent = zapnout ? "★ Sleduji" : "☆ Sledovat hru";
    });
    b.disabled = true;
    let upozorneni = false, chyba = "";
    try {
      if (pushPodpora() && (zapnout || pushZapnuto())) {
        const sub = await odberPush();
        const r = await fetch(`/api/push/${zapnout ? "sledovat" : "nesledovat"}`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint, slug, nazev, steam_id: b.dataset.steam || null }) });
        const v = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(v.chyba || "Nepodařilo se uložit.");
        upozorneni = true;
      }
    } catch (err) { chyba = err.message || ""; }
    finally { b.disabled = false; }
    if (!zapnout) achievement("Už nesleduji", nazev);
    else achievement("Sleduji hru", upozorneni ? "Dám ti vědět o aktualizaci, slevě, vydání a novinkách. Najdeš ji na Domů v bloku Moje hry."
      : `Najdeš ji na Domů v bloku Moje hry.${chyba ? ` Upozornění nejdou: ${chyba}` : ""}`);
  }, true);
  // Když si někdo zapne upozornění později, pošleme serveru i dříve sledované hry (jednou za den).
  async function synchronizujSledovane() {
    const l = sledovane();
    if (!l.length || !pushZapnuto() || !pushPodpora()) return;
    try { if (Date.now() - Number(localStorage.getItem("hp_sled_sync") || 0) < 864e5) return; } catch { return; }
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg && await reg.pushManager.getSubscription();
      if (!sub) return;
      for (const h of l.slice(0, 100)) await fetch("/api/push/sledovat", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, slug: h.slug, nazev: h.nazev, steam_id: h.steam_id }) });
      localStorage.setItem("hp_sled_sync", String(Date.now()));
    } catch {}
  }
  setTimeout(synchronizujSledovane, 4000);
  async function blokMojeHry(el) {
    const l = sledovane();
    if (!el || !l.length) return;
    let d;
    try { d = await nacti(`moje-hry?s=${enc(l.slice(0, 40).map((x) => x.slug).join(","))}`); } catch { return; }
    const jm = new Map(l.map((x) => [x.slug, x.nazev]));
    el.innerHTML = `<div class="section-title">Moje hry · <span class="dim">${esc(pl(l.length, "sledovaná hra", "sledované hry", "sledovaných her"))}</span></div>
      <div class="moje-hry">${(d.hry || []).map((h) => {
        const cipy = [];
        if (h.zive) cipy.push(`<span class="mh-cip mh-zive">${esc(pl(h.zive, "stream živě", "streamy živě", "streamů živě"))}</span>`);
        if (h.steam?.zdarma) cipy.push(`<span class="mh-cip mh-sleva">zdarma</span>`);
        else if (h.steam?.sleva > 0) cipy.push(`<span class="mh-cip mh-sleva">−${Number(h.steam.sleva) || 0} % · ${esc(cena(h.steam.cena, h.steam.mena))}</span>`);
        if (h.patch && Date.now() - Date.parse(h.patch.datum) < 7 * 864e5) cipy.push(`<span class="mh-cip">aktualizace ${esc(kdy(Date.parse(h.patch.datum)))}</span>`);
        if (h.vydano && Date.parse(h.vydano) > Date.now()) cipy.push(`<span class="mh-cip">${esc(dnyDoVydani(h.vydano))}</span>`);
        const nazev = h.nazev || jm.get(h.slug) || h.slug;
        return `<a class="mh-hra" href="/databaze/${esc(h.slug)}">${https(h.obal) ? `<img src="${esc(h.obal)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="obal-bez">${esc(nazev[0] || "?")}</span>`}
          <div><b>${esc(nazev)}</b><div class="mh-cipy">${cipy.join("") || `<span class="dim">nic nového</span>`}</div></div></a>`;
      }).join("")}</div>
      <p class="source-note">Seznam máš jen v tomto prohlížeči. Údaje z uložených dat webu (Steam, Twitch, Kick, IGDB).</p>`;
    el.hidden = false;
  }

  function radekHry(h, { hlidac = false } = {}) {
    const cenaTxt = h.cena == null ? (h.vychazi ? "zatím se neprodává" : "") : h.cena === 0 ? "Zdarma"
      : `${h.sleva ? `<s>${esc(cena(h.puvodni, h.mena))}</s> <em>−${Number(h.sleva) || 0} %</em> ` : ""}<strong>${esc(cena(h.cena, h.mena))}</strong>`;
    const minTxt = h.min90 != null && h.cena != null && h.cena > 0
      ? (h.cena <= h.min90 ? `<span class="min90 min-ok">nejnižší cena za 90 dní</span>` : `<span class="min90">nejníž za 90 dní: ${esc(cena(h.min90, h.mena))}</span>`) : "";
    return `<div class="hrad">
      <a class="hrad-obr" ${odkazHry({ ...h, obchod: "steam" })}>${https(h.obrazek) ? `<img src="${esc(h.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</a>
      <div class="hrad-t"><a ${odkazHry({ ...h, obchod: "steam" })}><b>${esc(h.nazev)}</b></a>
        <div class="hrad-meta">${czStitek(h, true)}${hodnoceniHry(h)}</div>
        <div class="hrad-cena">${cenaTxt} ${minTxt}</div>
        ${hlidac ? `<div class="hrad-cil">${(() => { const x = hlidane().find((y) => y.id === String(h.id)); return x?.cil != null ? `Upozorním, až bude pod ${esc(cena(x.cil, "CZK"))}` : "Upozorním na jakoukoliv slevu"; })()}</div>` : ""}
      </div>
      <div class="hrad-akce">${tlacitkoHlidat(h)}${hlidac ? `<button type="button" class="cil-btn" data-cil="${esc(h.id)}" data-nazev="${esc(h.nazev)}">Cílová cena</button>` : ""}</div>
    </div>`;
  }

  // ---------- Má to češtinu? ----------
  async function strankaCestina() {
    nastavTitulek("Má to češtinu? – hry s češtinou ve slevě a zdarma");
    const filtr = new URLSearchParams(location.search).get("filtr") || "sleva";
    const q = new URLSearchParams(location.search).get("q") || "";
    app.innerHTML = `${hubHry("cestina", "Má to češtinu?", "Napiš název hry a hned uvidíš, jestli má český text nebo dabing, kolik stojí a jestli je ve slevě. Údaje o češtině bereme ze Steamu.")}
      <form class="hledat-hru" role="search"><input id="q-hra" type="search" placeholder="Např. Kingdom Come, Cyberpunk, Hollow Knight…" value="${esc(q)}" autocomplete="off" maxlength="60" aria-label="Název hry"><button type="submit">Hledat</button></form>
      <div class="mini-seg cz-filtry" role="group">${[["sleva", "Ve slevě s češtinou"], ["zdarma", "Zdarma s češtinou"], ["dabing", "S českým dabingem"], ["vse", "Vše s češtinou"]]
        .map(([k, v]) => `<a class="ms-b${!q && k === filtr ? " on" : ""}" href="/cestina?filtr=${k}">${v}</a>`).join("")}</div>
      <div id="cz-vysledky">${kostra(5)}</div>
      <p class="source-note">Čeština podle údajů vydavatele na Steamu: „CZ texty“ = český text (rozhraní nebo titulky – Steam je v tomto seznamu nerozlišuje), „CZ dabing“ = Steam uvádí plnou podporu zvuku. Nejde o nezávisle ověřený stav hry. Ceny v Kč ze Steamu, kontrolujeme je několikrát denně; vždy platí cena v obchodě. Hry do databáze přibývají – když hru nenajdeš, hledání se zeptá přímo Steamu.</p>`;
    app.querySelector(".hledat-hru").onsubmit = (e) => { e.preventDefault(); const v = app.querySelector("#q-hra").value.trim(); jdi(v ? `/cestina?q=${enc(v)}` : "/cestina"); };
    let d;
    try { d = await nacti(`cestina?${q ? `q=${enc(q)}` : `filtr=${enc(filtr)}`}`); } catch { d = { hry: [] }; }
    const el = document.getElementById("cz-vysledky");
    if (!el) return;
    const p = d.pocty || {};
    el.innerHTML = (!q && p.vse ? `<p class="dim">Ověřeno ${esc(num(p.vse))} her, z toho ${esc(num(p.cz || 0))} s češtinou a ${esc(num(p.dabing || 0))} s dabingem.</p>` : "")
      + (d.hry.length ? `<div class="hrady">${d.hry.map((h) => radekHry(h)).join("")}</div>`
        : `<p class="empty">${q ? "Nic jsme nenašli. Zkus anglický název hry, jak je na Steamu." : "Databáze se teprve plní – zkus to za hodinu nebo hledej konkrétní hru."}</p>`);
    obarvi(el);
  }

  // ---------- Hlídač cen ----------
  async function strankaHlidac() {
    nastavTitulek("Hlídač cen – upozornění na slevy her");
    const l = hlidane();
    app.innerHTML = `${hubHry("hlidac", "Hlídač cen", "Vyber si hry a my ti pošleme upozornění, až budou ve slevě nebo pod tvou cenou. Bez registrace a bez e-mailu – stačí povolit upozornění v prohlížeči.")}
      ${!pushPodpora() ? `<p class="info-box">Tenhle prohlížeč upozornění nepodporuje. Na iPhonu si web nejdřív přidej na plochu (Sdílet → Přidat na plochu) a otevři ho odtamtud.</p>` : ""}
      <form class="hledat-hru" role="search"><input id="q-hra" type="search" placeholder="Přidat hru – napiš název…" autocomplete="off" maxlength="60" aria-label="Název hry"><button type="submit">Najít</button></form>
      <div id="hl-hledani"></div>
      <section class="blok seznam-prani" id="seznam-prani">
        <div class="section-title">Můj seznam přání ze Steamu</div>
        <p class="dim">Vlož odkaz na svůj Steam profil a načteme tvůj seznam přání: ceny, slevy, češtinu a novinky k aktualizacím těch her.
          Seznam se uloží jen v tomhle prohlížeči, k nám se neukládá, čí je.</p>
        <form class="hledat-hru" id="f-prani"><input id="q-prani" type="text" inputmode="url" placeholder="steamcommunity.com/id/tvoje-jmeno" autocomplete="off" maxlength="200" aria-label="Odkaz na Steam profil" value="${esc((() => { try { return localStorage.getItem("hp_steam") || ""; } catch { return ""; } })())}"><button type="submit">Načíst</button></form>
        <p class="dim pc-pozn">Seznam musí být veřejný: Steam → Profil → Upravit profil → Nastavení soukromí → Detaily o hrách: Veřejné. GOG a Epic seznamy přání přes oficiální rozhraní nezveřejňují.</p>
        <div id="prani-seznam"></div>
      </section>
      <div class="section-title">Moje hlídané hry</div>
      <div id="hl-seznam">${l.length ? kostra(Math.min(4, l.length)) : `<p class="empty">Zatím nic nehlídáš. Najdi hru výše nebo klikni na „Hlídat cenu“ u kterékoliv hry na webu.</p>`}</div>
      <section class="blok" id="cenovy-radar"></section>
      <p class="source-note">Ceny hlídaných her kontrolujeme každou hodinu přímo na Steamu (v Kč). Upozornění přijde jednou za slevu – a znovu, jen když cena klesne ještě níž. Hlídané hry jsou uložené u tvého odběru upozornění; vypnutím upozornění se smažou. <a href="/soukromi.html">Soukromí</a></p>`;
    blokCenovyRadar(document.getElementById("cenovy-radar"));
    app.querySelector(".hledat-hru").onsubmit = async (e) => {
      e.preventDefault();
      const v = app.querySelector("#q-hra").value.trim(), out = document.getElementById("hl-hledani");
      if (v.length < 2) return;
      out.innerHTML = kostra(3);
      try { const d = await nacti(`cestina?q=${enc(v)}`); out.innerHTML = d.hry.length ? `<div class="hrady">${d.hry.slice(0, 6).map((h) => radekHry(h)).join("")}</div>` : `<p class="dim">Nic jsme nenašli – zkus anglický název ze Steamu.</p>`; }
      catch { out.innerHTML = `<p class="dim">Hledání se nepovedlo, zkus to znovu.</p>`; }
    };
    // Seznam přání
    const vykresliPrani = (hry) => {
      const el = document.getElementById("prani-seznam");
      if (!el) return;
      if (!hry.length) { el.innerHTML = ""; return; }
      const serazene = [...hry].sort((a, b) => (b.sleva || 0) - (a.sleva || 0));
      const vSleve = serazene.filter((h) => h.sleva > 0).length, cesky = serazene.filter((h) => h.cestina > 0).length;
      el.innerHTML = `<p class="prani-souhrn"><b>${pl(hry.length, "hra", "hry", "her")}</b> · ve slevě <b>${vSleve}</b> · s češtinou <b>${cesky}</b>
          · <a href="/aktualizace?f=moje">aktualizace mých her</a></p>
        <div class="vyd-akce"><button type="button" class="btn-maly" id="hlidat-vse">🔔 Hlídat slevy u všech</button><button type="button" class="btn-maly" id="prani-smazat">Odebrat seznam</button></div>
        <div class="hrady">${serazene.slice(0, 200).map((h) => radekHry(h)).join("")}</div>`;
      el.querySelector("#prani-smazat").onclick = () => { try { localStorage.removeItem("hp_moje"); } catch {} el.innerHTML = ""; };
      el.querySelector("#hlidat-vse").onclick = async (e) => {
        const b = e.target; b.disabled = true;
        const uz = new Set(hlidane().map((x) => x.id));
        const zbyva = serazene.filter((h) => !uz.has(String(h.id))).slice(0, 200);
        let n = 0;
        for (const h of zbyva) {
          try { await nastavHlidani(h.id, h.nazev, true); n++; b.textContent = `Přidávám… ${n}/${zbyva.length}`; }
          catch (err) { achievement("Hotovo jen částečně", err.message); break; }
        }
        achievement("Hlídám slevy", `${pl(n, "nová hra", "nové hry", "nových her")} v hlídání.`);
        strankaHlidac();
      };
    };
    const moje = mojeHry();
    if (moje.length) nacti(`steam-hry?ids=${moje.map((x) => x.id).join(",")}`).then((d) => vykresliPrani(d.hry || [])).catch(() => {});
    document.getElementById("f-prani").onsubmit = async (e) => {
      e.preventDefault();
      const v = document.getElementById("q-prani").value.trim(), el = document.getElementById("prani-seznam");
      if (v.length < 2) return;
      el.innerHTML = kostra(3);
      try {
        const r = await fetch(`/api/wishlist?steam=${enc(v)}`);
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.chyba || "Seznam se nepodařilo načíst.");
        try { localStorage.setItem("hp_steam", v); localStorage.setItem("hp_moje", JSON.stringify(d.hry.map((h) => ({ id: String(h.id), nazev: h.nazev })))); } catch {}
        vykresliPrani(d.hry);
        achievement("Seznam přání načten", `${pl(d.hry.length, "hra", "hry", "her")} ze Steamu.`);
      } catch (err) { el.innerHTML = `<p class="info-box">${esc(err.message)}</p>`; }
    };
    if (!l.length) return;
    let d;
    try { d = await nacti(`steam-hry?ids=${l.map((x) => x.id).join(",")}`); } catch { d = { hry: [] }; }
    const el = document.getElementById("hl-seznam");
    if (!el) return;
    const mapa = new Map(d.hry.map((h) => [String(h.id), h]));
    el.innerHTML = `<div class="hrady">${l.map((x) => radekHry(mapa.get(x.id) || { id: x.id, nazev: x.nazev, url: `https://store.steampowered.com/app/${x.id}/`, cestina: null, cena: null }, { hlidac: true })).join("")}</div>`;
    el.querySelectorAll("[data-cil]").forEach((b) => b.onclick = async () => {
      const x = hlidane().find((y) => y.id === b.dataset.cil);
      const v = prompt(`Upozornit, až bude „${b.dataset.nazev}“ pod jakou cenou (Kč)? Nech prázdné = jakákoliv sleva.`, x?.cil ?? "");
      if (v === null) return;
      const c = v.trim() === "" ? null : Number(v.replace(",", ".").replace(/[^\d.]/g, ""));
      if (c != null && !(c >= 0)) { achievement("Neplatná cena", "Zadej číslo, např. 299."); return; }
      try { await nastavHlidani(b.dataset.cil, b.dataset.nazev, true, c); strankaHlidac(); }
      catch (err) { achievement("Nejde to", err.message); }
    });
  }

  // ---------- Sekce Hry: rozcestník (/pruvodce) a skupiny stránek ----------
  // Stránky jsou rozdělené do malých skupin, ať se návštěvník neztratí v dlouhé řadě odkazů.
  // Na každé stránce je jen odkaz zpět na rozcestník a záložky stejné skupiny.
  const SKUPINY_HER = [
    { id: "puls", nazev: "Puls her", barva: "#ff3d7f", polozky: [
      ["radar", "/radar", "Herní radar", "Co se právě děje: velké aktualizace, hry zdarma, rekordní ceny, rekordy streamerů, vydání."],
      ["trendy", "/trendy", "Rostoucí a upadající hry", "Které hry nabírají hráče a diváky a které je ztrácejí – podle skutečných čísel."],
      ["porovnat-hry", "/porovnat-hry", "Srovnávač her", "Dvě až čtyři hry vedle sebe: cena, čeština, hráči, pulsometr a herní DNA."]] },
    { id: "najit", nazev: "Najdi si hru", barva: "#ffc04d", polozky: [
      ["databaze", "/databaze", "Databáze her", "Přes 300 tisíc her i pro konzole: popis česky, platformy, data vydání, obrázky, podobné hry."],
      ["co-hrat", "/co-hrat", "Co dnes hrát?", "Vyber, s kým, za kolik a jaký žánr – doporučíme hry, které hráči nejvíc chválí."],
      ["rozjede-se", "/rozjede-se", "Rozjede se mi to?", "Zadej grafiku a procesor, porovnáme je s požadavky hry."],
      ["cestina", "/cestina", "Má to češtinu?", "Zjisti, jestli má hra český text nebo dabing."]] },
    { id: "usetri", nazev: "Ušetři", barva: "#4fd88f", polozky: [
      ["obchody", "/obchody", "Slevy a hry zdarma", "Hry zdarma na Epicu a Steamu, největší slevy a žebříčky obchodů."],
      ["hlidac", "/hlidac", "Hlídač cen", "Dáme ti vědět, až bude hra ve slevě. A cenový radar: co je teď nejlevnější od začátku měření."]] },
    { id: "chysta", nazev: "Co se chystá", barva: "#5cc8ff", polozky: [
      ["vydani", "/vydani", "Kalendář vydání", "Co vychází, kdy, na čem a jestli bude česky."],
      ["aktualizace", "/aktualizace", "Aktualizace her", "Co přinesly nové patche oblíbených her – česky a stručně."],
      ["akce", "/akce", "Akce a odpočty", "Výprodeje, herní přenosy a veletrhy s odpočtem."]] },
    { id: "tvurci", nazev: "Kdo hry dělá", barva: "#ff7a9c", polozky: [
      ["ceska-scena", "/ceska-scena", "Česká herní scéna", "Warhorse, Bohemia, Amanita a další – co je nového u českých studií."],
      ["studia", "/studia", "Studia a platformy", "Oficiální novinky a trailery velkých studií a PlayStationu, Xboxu, Nintenda."]] },
    { id: "hraj", nazev: "Zahraj si", barva: "#b47cff", polozky: [
      ["vyssi-nizsi", "/vyssi-nizsi", "Vyšší, nebo nižší?", "Denní minihra: tipni, která hra má víc hráčů. Každý den nové kolo."]] },
  ];
  function hubHry(aktivni, nadpis, perex) {
    const sk = SKUPINY_HER.find((g) => g.polozky.some(([k]) => k === aktivni));
    const ik = IKONY[IKONA_STRANKY[aktivni]];
    return `<a class="zpet-hub" href="/pruvodce">← Všechno o hrách</a>
      <div class="cesko-head kanal"${sk ? ` data-barva="${sk.barva}"` : ""}>${ik ? `<span class="kanal-ikona" aria-hidden="true">${ik}</span>` : ""}<div><h1>${esc(nadpis)}</h1>${perex ? `<p>${perex}</p>` : ""}</div></div>
      ${sk && sk.polozky.length > 1 ? `<nav class="hub-tabs" aria-label="${esc(sk.nazev)}">${sk.polozky.map(([k, h, t]) => `<a href="${h}" class="${k === aktivni ? "on" : ""}">${t}</a>`).join("")}</nav>` : ""}`;
  }
  function strankaPruvodce() {
    nastavTitulek("Všechno o hrách – nástroje, slevy, kalendář, studia");
    app.innerHTML = `<div class="cesko-head kanal" data-barva="#ffc04d"><span class="kanal-ikona" aria-hidden="true">${IKONY.hrat}</span><div><h1>Všechno o hrách</h1><p>Vyber, co tě zajímá. Každá stránka dělá jednu věc a dělá ji pořádně.</p></div></div>
      <div class="pruvodce">${SKUPINY_HER.map((g) => `<section class="pr-skupina" data-barva="${g.barva}">
        <h2>${esc(g.nazev)}</h2>
        <div class="pr-dlazdice">${g.polozky.map(([k, h, t, popis]) => `<a class="pr-dl" href="${h}"><span class="n-ikona" aria-hidden="true">${IKONY[IKONA_STRANKY[k]] || IKONY.hrat}</span><div><b>${t}</b><span>${popis}</span></div></a>`).join("")}</div>
      </section>`).join("")}</div>
      <p class="source-note">Hledáš streamery? Jsou v sekci <a href="/zive">Streameři</a>.</p>`;
    app.querySelectorAll("[data-barva]").forEach((el) => el.style.setProperty("--sk", barva(el.dataset.barva, "#ffc04d")));
  }
  // ---------- Ranní přehled (AI) ----------
  const denCz = (den) => new Date(den + "T12:00:00Z").toLocaleDateString(LOC, { weekday: "long", day: "numeric", month: "long" });
  const bodyRanni = (r, max = 5) => `<ol class="ranni-body">${r.body.slice(0, max).map((b) => `<li><a href="/clanek/${esc(enc(b.clanek))}"><b>${esc(b.nadpis)}</b></a>
      <span>${esc(b.text)}</span><small class="dim">${esc(b.zdroj || "zdroj")}${b.jazyk === "cs" ? " · česky" : ""}</small></li>`).join("")}</ol>`;
  async function strankaRanni() {
    nastavTitulek("Ranní přehled – 5 nejdůležitějších herních zpráv");
    const den = new URLSearchParams(location.search).get("den") || "";
    app.innerHTML = `<a class="zpet-hub" href="/novinky">← Novinky</a><div class="cesko-head"><h1>Ranní přehled</h1></div>${kostra(5)}`;
    let r;
    try { r = await nacti("ranni" + (den ? `?den=${enc(den)}` : "")); } catch { r = { body: [], dny: [] }; }
    if (!location.pathname.startsWith("/ranni")) return;
    app.innerHTML = `<a class="zpet-hub" href="/novinky">← Novinky</a>
      <div class="cesko-head"><h1>Ranní přehled</h1><p>Každé ráno 5 nejdůležitějších věcí z herního světa za posledních 24 hodin. Čtení na dvě minuty.</p></div>
      ${r.body.length ? `<article class="ranni-karta ranni-cela">
          <header><span class="ai-stitek">Sestavila AI</span><h2>${esc(denCz(r.den))}</h2></header>
          ${bodyRanni(r, 10)}
          <p class="source-note">Přehled sestavila umělá inteligence jen ze zpráv, které web ráno nasbíral (${pl(r.zprav || 0, "zpráva", "zprávy", "zpráv")} za 24 h).
            Každý bod vede na původní zprávu se zdrojem. Body, ve kterých AI uvedla číslo, které ve zprávě není, web automaticky vyřadí.</p>
        </article>`
        : `<p class="empty">Dnešní přehled ještě není hotový – AI ho skládá každé ráno po 6. hodině. Mezitím <a href="/novinky">všechny novinky</a>.</p>`}
      ${r.dny.length > 1 ? `<div class="section-title">Starší přehledy</div><div class="mini-seg">${r.dny.map((d) =>
        `<a class="ms-b${d === r.den ? " on" : ""}" href="/ranni${d === r.dny[0] ? "" : `?den=${esc(d)}`}">${esc(new Date(d + "T12:00:00Z").toLocaleDateString(LOC, { day: "numeric", month: "numeric" }))}</a>`).join("")}</div>` : ""}`;
  }

  // ---------- Aktualizace her ----------
  const TYP_PATCHE = {
    velka: ["Velká aktualizace", "#ffc04d"], sezona: ["Nová sezóna", "#b47cff"], opravy: ["Opravy chyb", "#4fd88f"],
    rovnovaha: ["Úpravy rovnováhy", "#ff7a9c"], aktualizace: ["Aktualizace", "#5cc8ff"],
  };
  const SKUPINY_PATCHE = [["novinky", "Novinky"], ["hratelnost", "Úpravy hratelnosti"], ["opravy", "Opravy"], ["vykon", "Výkon a stabilita"]];
  // Slovníček: pevné vysvětlivky (nepíše je AI) – ukážou se jen pojmy, které se v aktualizaci opravdu objevují.
  const SLOVNICEK = [
    [/\bbuff/i, "Buff", "Posílení – zbraň, postava nebo schopnost je silnější než dřív."],
    [/\bnerf/i, "Nerf", "Oslabení – něco, co bylo moc silné, vývojáři zeslabili."],
    [/hotfix/i, "Hotfix", "Rychlá malá oprava, která řeší akutní chybu hned, bez čekání na velkou aktualizaci."],
    [/\bpatch/i, "Patch", "Aktualizace hry, která přidává obsah nebo opravuje chyby."],
    [/\bmeta\b/i, "Meta", "Nejsilnější a nejpoužívanější taktiky, zbraně nebo postavy v danou chvíli."],
    [/battle ?pass/i, "Battle pass", "Sezónní odměny, které odemykáš hraním; obvykle bezplatná a placená část."],
    [/\bpvp\b/i, "PvP", "Hráči proti hráčům."], [/\bpve\b/i, "PvE", "Hráči proti počítači (nepřátelům ve hře)."],
    [/matchmaking/i, "Matchmaking", "Systém, který ti hledá spoluhráče a soupeře do zápasu."],
    [/\branked|hodnocen/i, "Ranked", "Hodnocené zápasy, ve kterých stoupáš nebo klesáš v žebříčku."],
    [/\bexploit/i, "Exploit", "Zneužití chyby ve hře k nečekané výhodě."],
    [/cooldown/i, "Cooldown", "Čas, po který nejde schopnost znovu použít."],
    [/hitbox/i, "Hitbox", "Neviditelná oblast postavy nebo předmětu, která počítá zásahy."],
    [/netcode/i, "Netcode", "Jak hra posílá data přes internet – ovlivňuje zpoždění a „sekání“ v online hře."],
    [/anti-?cheat/i, "Anti-cheat", "Ochrana proti podvádění."], [/\bcrash/i, "Crash", "Pád hry."],
    [/\bfps\b/i, "FPS", "Snímky za sekundu – čím víc, tím plynulejší obraz. (Někdy také střílečka z pohledu první osoby.)"],
    [/\bdlc\b/i, "DLC", "Stahovatelný obsah navíc – rozšíření hry, často placené."],
    [/kosmet|cosmetic|skin/i, "Kosmetika / skin", "Vzhled postavy nebo zbraně, který nemění sílu."],
    [/\bspawn/i, "Spawn", "Místo nebo okamžik, kdy se objeví hráč, nepřítel nebo předmět."],
    [/\bloot/i, "Loot", "Kořist – předměty, které ve hře sbíráš."], [/\bxp\b|zkušenost/i, "XP", "Body zkušeností za hraní."],
  ];
  const mojeHry = () => { try { return JSON.parse(localStorage.getItem("hp_moje") || "[]"); } catch { return []; } };
  const typStitek = (t) => { const [n, c] = TYP_PATCHE[t] || TYP_PATCHE.aktualizace; return `<span class="patch-typ" data-barva="${c}">${esc(n)}</span>`; };
  function kartaPatche(p, mala = false) {
    const text = [p.nadpis, p.shrnuti, p.komu, ...SKUPINY_PATCHE.flatMap(([k]) => p.skupiny?.[k] || [])].join(" ");
    const pojmy = SLOVNICEK.filter(([re]) => re.test(text));
    return `<article class="patch${mala ? " patch-mala" : ""}">
      <a class="patch-obr" href="/hra/steam/${esc(p.steam_id)}" data-hra="${esc(p.hra)}"><img src="${esc(p.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>
      <div class="patch-t">
        <header>${typStitek(p.typ)}<a class="patch-hra" href="/hra/steam/${esc(p.steam_id)}">${esc(p.hra)}</a><span class="dim">${esc(kdy(new Date(p.datum)))}</span></header>
        <h3>${esc(p.nadpis)}</h3>
        ${p.stav === "hotovo" ? `<p class="patch-shrnuti">${esc(p.shrnuti)}</p>${p.komu && !mala ? `<p class="patch-komu"><b>Komu se to týká:</b> ${esc(p.komu)}</p>` : ""}
          ${mala ? "" : SKUPINY_PATCHE.filter(([k]) => (p.skupiny?.[k] || []).length).map(([k, n]) => `<div class="patch-skupina"><b>${n}</b><ul>${p.skupiny[k].map((z) => `<li>${esc(z)}</li>`).join("")}</ul></div>`).join("")}
          ${!mala && pojmy.length ? `<details class="slovnicek"><summary>Slovníček (${pojmy.length})</summary><dl>${pojmy.map(([, t, v]) => `<dt>${t}</dt><dd>${v}</dd>`).join("")}</dl></details>` : ""}`
          : p.stav === "ceka" ? `<p class="dim patch-ceka">Shrnutí v češtině se připravuje – zatím si přečti originál.</p>` : `<p class="dim">Shrnutí není k dispozici – přečti si originální poznámky.</p>`}
        ${mala ? "" : `<footer>${p.stav === "hotovo" ? `<span class="ai-stitek">Shrnula AI</span>` : ""}<a href="${esc(bezpecnaUrl(p.url))}" target="_blank" rel="noopener noreferrer">Originální poznámky na Steamu</a></footer>`}
      </div></article>`;
  }
  async function strankaAktualizace() {
    nastavTitulek("Aktualizace her česky – co přinesly nové patche");
    if (!state.patche) app.innerHTML = `${hubHry("aktualizace", "Aktualizace her", "")}${kostra(4)}`;
    if (!state.patche || Date.now() - state.patche._cas > 5 * 60e3) {
      try { state.patche = { ...(await nacti("aktualizace")), _cas: Date.now() }; } catch { state.patche = { polozky: [], _cas: 0 }; }
    }
    if (!location.pathname.startsWith("/aktualizace")) return;
    const d = state.patche, q = new URLSearchParams(location.search), f = q.get("f") || "", hra = q.get("hra") || "";
    const moje = new Set([...mojeHry(), ...hlidane()].map((x) => String(x.id)));
    const FILTRY = [["", "Všechny"], ["velke", "Velké a sezóny"], ["opravy", "Opravy"], ["cesko", "Hraje Česko"], ["moje", `Moje hry${moje.size ? ` (${moje.size})` : ""}`]];
    let list = d.polozky;
    if (hra) list = list.filter((p) => p.hra === hra);
    if (f === "velke") list = list.filter((p) => p.typ === "velka" || p.typ === "sezona");
    if (f === "opravy") list = list.filter((p) => p.typ === "opravy" || p.typ === "rovnovaha");
    if (f === "cesko") list = list.filter((p) => p.cesko);
    if (f === "moje") list = list.filter((p) => moje.has(String(p.steam_id)));
    app.innerHTML = `${hubHry("aktualizace", "Aktualizace her", `Hlídáme oficiální oznámení vývojářů u ${d.sledovanych ? `<b>${esc(num(d.sledovanych))}</b>` : "stovek"} her na Steamu. Nová aktualizace se tu ukáže do pár hodin a AI ji česky vysvětlí: co přináší, komu se týká a co se změnilo.`)}
      <div class="chips chips-barvy">${FILTRY.map(([k, t]) => `<a class="chip${k === f && !hra ? " on" : ""}" href="/aktualizace${k ? `?f=${k}` : ""}">${t}</a>`).join("")}${hra ? `<a class="chip on" href="/aktualizace">${esc(hra)} ✕</a>` : ""}</div>
      ${f === "moje" && !moje.size ? `<p class="info-box">Zatím nemáš žádné „Moje hry“. Načti si <a href="/hlidac#seznam-prani">seznam přání ze Steamu</a> nebo si v Hlídači cen označ hry, které tě zajímají.</p>` : ""}
      ${list.length ? `<div class="patche">${list.slice(0, 60).map((p) => kartaPatche(p)).join("")}</div>`
        : `<p class="empty">${d.polozky.length ? "Tady zatím nic není – zkus jiný filtr." : "Seznam se teprve plní: web každých 15 minut prochází oficiální oznámení dalších her a nové aktualizace sem hned přidá."}</p>`}
      <p class="source-note">Zdroj: oficiální oznámení vývojářů na Steamu (kanál, kam píše sám vývojář). Sledujeme ~1 000 nejpopulárnějších her, hry, které se hrají v Česku, a hry ze seznamů přání.
        Shrnutí píše AI a web ho zveřejní, jen když v něm nejsou čísla, která v originále chybí. Slovníček je pevný, nepíše ho AI. GOG a Epic poznámky k aktualizacím přes oficiální rozhraní nezveřejňují.</p>`;
    app.querySelectorAll("[data-barva]").forEach((el) => el.style.setProperty("--sk", barva(el.dataset.barva, "#5cc8ff")));
  }

  // ---------- Česká herní scéna ----------
  async function strankaCeskaScena() {
    nastavTitulek("Česká herní scéna – Warhorse, Bohemia, Amanita a další");
    app.innerHTML = `${hubHry("ceska-scena", "Česká herní scéna", "")}${kostra(4)}`;
    let d;
    try { d = await nacti("ceska-scena"); } catch { d = { studia: [], zpravy: [], videa: [] }; }
    if (!location.pathname.startsWith("/ceska-scena")) return;
    // Kdo z českých streamerů právě hraje hru českého studia.
    const hryStudii = new Map();
    for (const st of d.studia) for (const h of st.hry || []) hryStudii.set(normNazev(h.hra), { ...h, studio: st.nazev });
    const hrajou = state.zive.streamy.filter((s) => s.hra && hryStudii.has(normNazev(s.hra)));
    const czClanky = state.clanky.filter((c) => d.studia.some((st) => st.hry.some((h) => h.hra.length > 3 && normNazev(c.nadpis).includes(normNazev(h.hra)))) || /warhorse|bohemia interactive|amanita|scs software|keen software|hangar 13/i.test(c.nadpis)).slice(0, 6);
    app.innerHTML = `${hubHry("ceska-scena", "Česká herní scéna", "Studia z Česka dělají hry, které hraje celý svět. Tady je, co je u nich nového – z jejich oficiálních kanálů.")}
      <div class="cz-studia">${d.studia.map((s) => `<a class="cz-studio" href="/studio/${esc(s.slug)}">
          ${https(s.nahled?.obrazek) ? `<img src="${esc(s.nahled.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="cz-studio-bez">${esc(s.nazev[0])}</div>`}
          <div><b>${esc(s.nazev)}</b><span>${esc((s.hry || []).map((h) => h.hra).slice(0, 3).join(" · "))}</span></div></a>`).join("")}</div>
      ${hrajou.length ? `<div class="section-title">Právě streamují české hry</div><div class="live-grid">${hrajou.slice(0, 6).map(kartaZive).join("")}</div>` : ""}
      <div class="section-title">Novinky ze studií</div>
      ${d.zpravy.length ? `<div class="rec-list">${d.zpravy.slice(0, 8).map((z) => radekZpravy(z)).join("")}</div>` : `<p class="dim">Novinky se načítají postupně z blogů a oznámení na Steamu.</p>`}
      ${d.videa.length ? `<div class="section-title">Videa a trailery</div><div class="regal">${d.videa.map(kartaTraileru).join("")}</div>` : ""}
      ${czClanky.length ? `<div class="section-title">Píšou o nich</div><div class="rec-list">${czClanky.map((c) => `<a class="rec" href="/clanek/${esc(enc(c.id))}">
          ${https(c.obrazek) ? `<img src="${esc(c.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="rec-bez"></div>`}
          <div><b>${esc(c.nadpis)}</b><span class="dim">${esc(c.zdroje?.[0]?.nazev || "")} · ${esc(kdy(datum(c)))}</span></div></a>`).join("")}</div>` : ""}
      <p class="source-note">Zdroje: oficiální weby, blogy, YouTube kanály a oznámení na Steamu jednotlivých studií. Chybí ti tu české studio? Napiš nám.</p>`;
  }

  // ---------- Co dnes hrát? ----------
  const VOLBY_HRAT = [
    ["s", "S kým hraješ?", [["", "Je mi to jedno"], ["sam", "Sám"], ["koop", "S kamarády (kooperace)"], ["online", "Proti ostatním online"]]],
    ["n", "Kolik vás bude?", [["", "Nevím / jen já"], ["2", "Dva"], ["3", "Tři"], ["4", "Čtyři"], ["5", "Pět a víc"]]],
    ["cena", "Kolik chceš dát?", [["", "Je mi to jedno"], ["zdarma", "Nic – jen zdarma"], ["200", "Do 200 Kč"], ["500", "Do 500 Kč"]]],
    ["cz", "Čeština", [["", "Nevadí angličtina"], ["texty", "Aspoň české texty"], ["dabing", "Český dabing"]]],
    ["zanr", "Na co máš chuť?", [["", "Cokoliv"], ["1", "Akce"], ["25", "Adventura"], ["3", "RPG"], ["2", "Strategie"], ["28", "Simulace"], ["9", "Závody"], ["18", "Sport"], ["4", "Pohodovka"], ["23", "Indie"]]],
  ];
  async function strankaCoHrat() {
    nastavTitulek("Co dnes hrát? – doporučení her podle tebe");
    const q = new URLSearchParams(location.search);
    const vybrano = Object.fromEntries(VOLBY_HRAT.map(([k]) => [k, q.get(k) || ""]));
    const formular = `<form class="cohrat" aria-label="Co dnes hrát">${VOLBY_HRAT.map(([k, otazka, moznosti]) => `<fieldset><legend>${otazka}</legend>
        <div class="ch-volby">${moznosti.map(([v, t]) => `<label class="ch-v${vybrano[k] === v ? " on" : ""}"><input type="radio" name="${k}" value="${v}"${vybrano[k] === v ? " checked" : ""}><span>${t}</span></label>`).join("")}</div></fieldset>`).join("")}
      </form>`;
    app.innerHTML = `${hubHry("co-hrat", "Co dnes hrát?", "")}${formular}${kostra(4)}`;
    let d;
    try { d = await nacti("co-hrat?" + new URLSearchParams(Object.entries(vybrano).filter(([, v]) => v)).toString()); } catch { d = { hry: [], databaze: 0 }; }
    if (!location.pathname.startsWith("/co-hrat")) return;
    const rezim = (r) => [r & 1 && "pro jednoho", r & 2 && "kooperace", r & 4 && "online proti ostatním"].filter(Boolean).join(" · ");
    // Skupina: kolik hráčů hra podle IGDB umožní a kolik vyjde pro celou partu (každý potřebuje vlastní kopii).
    const skupinaHry = (h) => {
      if (!h.skupina) return "";
      const x = h.hraci, n = h.skupina.pocet;
      const hraci = x?.max ? `až ${x.max} hráčů${x.online_koop ? " online" : ""}${x.splitscreen ? " · rozdělená obrazovka" : ""}` : "počet hráčů IGDB neuvádí – ověř na stránce hry";
      const cenaSk = h.skupina.celkem === 0 ? "zdarma pro všechny" : h.skupina.celkem != null ? `pro ${n}: ${esc(cena(h.skupina.celkem, h.mena))} (každý svou kopii)` : "";
      return `<span class="ch-skupina${x?.max ? "" : " nevime"}">👥 ${esc(hraci)}${cenaSk ? ` · ${cenaSk}` : ""}${x?.jedna_kopie ? " · na jednom zařízení stačí jedna kopie" : ""}</span>`;
    };
    const cenaHry = (h) => h.zdarma || h.cena === 0 ? "Zdarma" : h.cena != null ? `${h.sleva ? `<s>${esc(cena(h.puvodni, h.mena))}</s> ` : ""}<b>${esc(cena(h.cena, h.mena))}</b>${h.sleva ? ` <em>−${Number(h.sleva) || 0} %</em>` : ""}` : "";
    app.innerHTML = `${hubHry("co-hrat", "Co dnes hrát?", "Ťukni na pár voleb a ukážeme hry, které hráči na Steamu nejvíc chválí. Výsledek se mění hned.")}${formular}
      <div class="section-title">${d.hry.length ? "Doporučujeme" : "Nic jsme nenašli"}</div>
      ${d.hry.length ? `<div class="ch-vysledky">${d.hry.map((h, i) => `<a class="ch-hra" href="/hra/steam/${esc(h.id)}">
          ${https(h.obrazek) ? `<img src="${esc(h.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ch-bez"></div>`}
          <div class="ch-t"><b>${i + 1}. ${esc(h.nazev)}</b>
            <span class="ch-meta">${czStitek(h)}${h.zanry.slice(0, 2).map((z) => `<span class="plat">${esc(z)}</span>`).join("")}</span>
            <span class="dim">${esc(rezim(h.rezim))}</span>
            <span class="ch-proc">${h.hodnoceni ? `👍 ${Number(h.hodnoceni.kladne) || 0} % hráčů doporučuje` : h.metacritic ? `Metacritic ${Number(h.metacritic) || 0}` : ""}${h.doporuceni ? ` · ${esc(num(h.doporuceni))} doporučení` : ""}</span>
            <span class="ch-cena">${cenaHry(h)}</span>${skupinaHry(h)}</div></a>`).join("")}</div>`
        : `<p class="empty">S těmihle volbami jsme nic nenašli. Zkus jednu volbu povolit (třeba cenu nebo češtinu).</p>`}
      ${d.skupina ? `<p class="source-note">Počet hráčů bereme z databáze IGDB ${puvod("databaze", "IGDB")}. Ověřený počet má ${pl(d.skupina.overeno, "hra", "hry", "her")}${d.skupina.nevime ? `, u ${pl(d.skupina.nevime, "hry", "her", "her")} ho IGDB neuvádí (jsou na konci)` : ""}${d.skupina.vyrazeno ? `, ${pl(d.skupina.vyrazeno, "hru", "hry", "her")} jsme vyřadili, protože vás tolik hrát nemůže` : ""}.
        Hraní napříč PC a konzolemi (crossplay) neuvádíme – spolehlivý zdroj pro něj není.</p>` : ""}
      <p class="source-note">Vybíráme z ${pl(d.databaze || 0, "hry", "her", "her")} ze Steamu, u kterých máme ověřené žánry, režimy hraní, češtinu a cenu (databáze každou hodinu roste).
        Pořadí: hodnocení hráčů nebo Metacritic a počet doporučení na Steamu. Nic nám nikdo neplatí.</p>`;
    app.querySelector(".cohrat").addEventListener("change", () => {
      const f = new FormData(app.querySelector(".cohrat"));
      const nove = new URLSearchParams([...f.entries()].filter(([, v]) => v));
      history.replaceState(null, "", "/co-hrat" + (nove.toString() ? "?" + nove : ""));
      strankaCoHrat().then(() => obarvi(app));
    });
  }

  // ---------- Původ dat (důvěryhodnost) ----------
  // Jednotný štítek u každého důležitého údaje: odkud je, jakého druhu a kdy byl zjištěn.
  const PUVOD = { mereno: "Změřeno námi", oficialni: "Oficiální data", databaze: "Databáze IGDB", ai: "AI souhrn" };
  const PUVOD_TIP = {
    mereno: "Čísla jsme sami naměřili z oficiálních rozhraní (Twitch, Kick, Steam) a spočítali podle pravidel popsaných na stránce O webu.",
    oficialni: "Údaj přímo z oficiálního zdroje – obchod, vývojář nebo rozhraní platformy. Vždy platí údaj u zdroje.",
    databaze: "Údaj z databáze her IGDB. Doplňuje ji komunita a vydavatelé, proto může být neúplný.",
    ai: "Text napsala AI podle oficiálního zdroje. Může obsahovat chybu – originál je vždy v odkazu.",
  };
  function puvod(druh, zdroj = "", cas = null) {
    if (!PUVOD[druh]) return "";
    const c = cas ? new Date(cas) : null;
    return `<span class="puvod puvod-${druh}" title="${esc(PUVOD_TIP[druh])}"><i aria-hidden="true"></i>${PUVOD[druh]}${zdroj && !(druh === "databaze" && zdroj === "IGDB") ? ` · ${esc(zdroj)}` : ""}${c && !isNaN(c) ? ` · ${esc(kdy(c))}` : ""}</span>`;
  }
  const datumKr = (d) => new Date(String(d).length === 10 ? d + "T12:00:00" : d).toLocaleDateString(LOC, { day: "numeric", month: "numeric", year: "numeric" });
  const dobaMereni = (dni) => dni >= 60 ? pl(Math.round(dni / 30), "měsíc", "měsíce", "měsíců") : pl(dni, "den", "dny", "dní");

  // ---------- Herní pulsometr ----------
  const PULS_NAZVY = { hraci: "Hráči na Steamu", scena: "Česká scéna", trend: "Trend na streamech", aktualizace: "Aktualizace", cena: "Cena teď" };
  const stavPulsu = (s) => s >= 80 ? "Hra žije naplno" : s >= 60 ? "Hodně aktivní" : s >= 40 ? "Stabilně aktivní" : s >= 20 ? "Klidnější období" : "Skoro ticho";
  const tridaPulsu = (s) => s >= 60 ? "p-hi" : s >= 30 ? "p-mid" : "p-lo";
  function hodnotaPulsu(s) {
    const v = s.hodnota;
    if (s.klic === "hraci") return `${num(v)} hráčů právě teď (celý svět)`;
    if (s.klic === "scena") return `${num(v)} h sledování za 7 dní`;
    if (s.klic === "trend") return `${v > 0 ? "+" : ""}${v} % proti předchozímu týdnu`;
    if (s.klic === "aktualizace") return v.dni == null ? "za 90 dní žádná" : `poslední před ${pl(v.dni, "dnem", "dny", "dny")} · ${pl(v.pocet, "aktualizace", "aktualizace", "aktualizací")} za 90 dní`;
    if (s.klic === "cena") return v === "zdarma" ? "hra je zdarma" : v ? `sleva −${Number(v) || 0} %` : "bez slevy";
    return "";
  }
  function pulsBlok(p, kratce = false) {
    if (!p) return "";
    if (p.skore == null) return kratce ? `<span class="dim">málo dat</span>` : `<section class="puls-blok puls-malo"><div><h2>Herní pulsometr</h2>
      <p class="dim">Na výpočet zatím nemáme dost změřených údajů (potřebujeme aspoň tři, mezi nimi hráče na Steamu nebo českou scénu). <a href="/o-webu#pulsometr">Jak počítáme</a></p></div></section>`;
    if (kratce) return `<span class="puls-mini ${tridaPulsu(p.skore)}"><b>${p.skore}</b>/100</span>`;
    return `<section class="puls-blok" aria-label="Herní pulsometr">
      <div class="puls-cislo ${tridaPulsu(p.skore)}"><b>${p.skore}</b><span>/100</span></div>
      <div class="puls-hlava"><h2>Herní pulsometr</h2><p class="puls-stav">${stavPulsu(p.skore)}</p>
        <p class="dim">Měří, jak živá je hra právě teď – ne jak je dobrá.</p></div>
      <ul class="puls-slozky">${p.slozky.map((s) => `<li><span class="ps-n">${PULS_NAZVY[s.klic] || s.klic} <small class="dim">váha ${s.vaha} %</small></span>
        <span class="bar"><i data-w="${Number(s.skore) || 0}"></i></span><b>${Number(s.skore) || 0}</b>
        <small class="ps-h">${esc(hodnotaPulsu(s))} ${puvod(s.druh, s.zdroj)}</small></li>`).join("")}</ul>
      ${p.chybi?.length ? `<p class="dim puls-chybi">Nepočítáno, protože to pro tuhle hru nemáme: ${p.chybi.map((k) => PULS_NAZVY[k] || k).join(", ")}. Váhy ostatních ukazatelů se poměrně navýšily.</p>` : ""}
      <details class="puls-jak"><summary>Jak pulsometr počítáme</summary>
        <ul><li><b>Hráči na Steamu (30 %)</b> – kolik lidí hraje právě teď, podle oficiálního rozhraní Steamu. Škála je logaritmická: 1 000 hráčů ≈ 50 bodů, milion hráčů = 100 bodů.</li>
        <li><b>Česká scéna (25 %)</b> – hodiny sledování na českých streamech (Twitch a Kick) za posledních 7 celých dní, v poměru k nejsledovanější hře týdne.</li>
        <li><b>Trend na streamech (15 %)</b> – změna sledovanosti proti předchozímu týdnu. 50 bodů = beze změny, 100 = dvojnásobek a víc, 0 = pokles o polovinu a víc. Jen když měříme aspoň 14 dní a hru někdo sledoval.</li>
        <li><b>Aktualizace (20 %)</b> – jak dávno vyšla poslední aktualizace podle oficiálních oznámení na Steamu. Dnes = 100 bodů, před 90 a více dny = 0. Jen u her, jejichž oznámení sledujeme.</li>
        <li><b>Cena teď (10 %)</b> – sleva v obchodě Steam (sleva 80 % a víc = 100 bodů, hra zdarma = 100).</li></ul>
        <p class="dim">Čísla nikdo neupravuje ručně a AI do nich nezasahuje. Pulsometr neříká, jestli je hra dobrá – jen jak moc se kolem ní teď něco děje.</p></details>
    </section>`;
  }

  // ---------- Cenový radar (text) ----------
  function cenovyText(r, st) {
    if (!r?.verdikt || r.verdikt.druh === "zdarma") return "";
    const od = datumKr(r.od), m = st?.mena || "CZK";
    const t = {
      malo: `Cenu sledujeme teprve ${pl(r.dni, "den", "dny", "dní")} (od ${od}) – na radu je zatím brzy.`,
      nejnizsi: `Teď je nejlevnější od ${od}, kdy cenu sledujeme.`,
      sleva: `Sleva −${Number(st?.sleva) || 0} %. Od ${od} byla nejníž za ${cena(r.min, m)}${r.min_den ? ` (${datumKr(r.min_den)})` : ""}.`,
      pockat: `Za ${dobaMereni(r.dni)} měření byla ve slevě ${r.slevovych_obdobi}×${r.obvykla_sleva ? `, obvykle −${r.obvykla_sleva} %` : ""}${r.posledni_sleva ? `, naposledy ${datumKr(r.posledni_sleva)}` : ""}. Pokud nespěcháš, může se vyplatit počkat.`,
      bez: `Za ${dobaMereni(r.dni)} měření (od ${od}) nebyla ve slevě ani jednou.`,
    }[r.verdikt.druh];
    return t ? `<div class="cenovy-radar cr-${esc(r.verdikt.druh)}"><b>Cenový radar</b><span>${esc(t)}</span>
      <small class="dim">Není to předpověď, jen to, co jsme naměřili. ${puvod("mereno", "Steam")}</small></div>` : "";
  }

  // ---------- Nákupní poradce (pevná pravidla nad naměřenými cenami) ----------
  const PORADCE = { koupit: ["Koupit teď", "pc-koupit"], dobra: ["Dobrá cena", "pc-dobra"], pockat: ["Spíš počkat", "pc-pockat"], nevime: ["Zatím nevíme", "pc-nevime"] };
  function poradceText(p, m) {
    return (p?.duvody || []).map((d) => ({
      malo: `Cenu měříme teprve ${pl(d.dni, "den", "dny", "dní")} – na radu je brzy.`,
      nafouknuta: `Pozor: „původní“ cena ${cena(d.puvodni, m)} je vyšší, než jakou jsme mimo slevy obvykle měřili (${cena(d.bezna, m)}). Skutečná sleva je asi −${d.skutecna ?? 0} %.`,
      nejnizsi: `Nejnižší cena od ${datumKr(d.od)}, kdy cenu měříme.`,
      blizko: `Jen kousek nad naměřeným minimem ${cena(d.min, m)}${d.min_den ? ` (${datumKr(d.min_den)})` : ""}.`,
      bylo_levneji: `Už byla levněji: ${cena(d.min, m)}${d.min_den ? ` (${datumKr(d.min_den)})` : ""}.`,
      pod_prumerem: `Pod průměrnou cenou za 90 dní (${cena(d.prumer90, m)}).`,
      slevy: `Teď bez slevy. Za dobu měření byla ve slevě ${d.pocet}×${d.obvykla ? `, obvykle −${d.obvykla} %` : ""}${d.posledni ? `, naposledy ${datumKr(d.posledni)}` : ""}; nejníž ${cena(d.nejnizsi, m)}.`,
      bez_slev: `Za ${dobaMereni(d.dni)} měření nebyla ve slevě – kdy bude, nevíme.`,
    }[d.k])).filter(Boolean);
  }
  function poradceBlok(r, st) {
    const p = r?.poradce;
    if (!p || !PORADCE[p.druh]) return "";
    const m = st?.mena || "CZK";
    const [nadpis, tr] = PORADCE[p.druh];
    const cisla = [p.prumer30 != null && ["průměr 30 dní", cena(p.prumer30, m)], p.prumer90 != null && ["průměr 90 dní", cena(p.prumer90, m)],
      p.bezna != null && ["běžná cena bez slevy", cena(p.bezna, m)], p.skutecna_sleva != null && ["skutečná sleva", `−${p.skutecna_sleva} %`]].filter(Boolean);
    return `<div class="poradce ${tr}"><div class="poradce-h"><span>Nákupní poradce</span><b>${esc(nadpis)}</b></div>
      <ul>${poradceText(p, m).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      ${cisla.length ? `<dl class="poradce-c">${cisla.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
      <small class="dim">Doporučení z cen, které jsme naměřili na Steamu – ne předpověď. ${puvod("mereno", "Steam")}</small></div>`;
  }

  // ---------- Lehká herní DNA ----------
  const hodinyHrani = (s) => { const h = s / 3600; return h < 2 ? (Math.round(h * 10) / 10).toLocaleString(LOC) : String(Math.round(h)); };
  function dnaBlok(dna) {
    if (!dna) return "";
    const ig = dna.igdb, stm = dna.steam, radky = [];
    const cipy = (list) => list.map((x) => `<span class="dna-c">${esc(x)}</span>`).join("");
    if (ig?.pohled?.length) radky.push(["Jak se hraje", cipy(ig.pohled), puvod("databaze", "IGDB")]);
    const skym = [];
    if (stm?.sam) skym.push("Pro jednoho");
    if (stm?.koop) skym.push("Kooperace");
    if (stm?.online) skym.push("Online proti ostatním");
    const h = ig?.hraci, igSkym = [];
    if (h?.online_koop_max) igSkym.push(`online kooperace až ${h.online_koop_max} hráčů`);
    else if (h?.online_koop) igSkym.push("online kooperace");
    if (h?.offline_koop_max) igSkym.push(`na jednom zařízení až ${h.offline_koop_max} hráčů`);
    if (h?.splitscreen) igSkym.push("rozdělená obrazovka");
    if (h?.online_max) igSkym.push(`online až ${h.online_max} hráčů`);
    if (skym.length) radky.push(["S kým", cipy(skym), puvod("oficialni", "Steam")]);
    if (igSkym.length) radky.push(["Kolik hráčů", cipy(igSkym), puvod("databaze", "IGDB")]);
    if (stm?.zanry?.length) radky.push(["Žánr", cipy(stm.zanry), puvod("oficialni", "Steam")]);
    if (ig?.temata?.length) radky.push(["Témata", cipy(ig.temata), puvod("databaze", "IGDB")]);
    if (ig?.delka?.bezne || ig?.delka?.vse) radky.push(["Délka hraní", `${ig.delka.bezne ? `hlavní příběh ≈ ${hodinyHrani(ig.delka.bezne)} h` : ""}${ig.delka.bezne && ig.delka.vse ? " · " : ""}${ig.delka.vse ? `všechno ≈ ${hodinyHrani(ig.delka.vse)} h` : ""}
      <small class="dim">(podle ${pl(Number(ig.delka.hlasu) || 0, "hráče", "hráčů", "hráčů")})</small>`, puvod("databaze", "IGDB")]);
    if (dna.aktivita) radky.push(["Aktivita vývojářů", dna.aktivita.dni == null ? "za 90 dní žádná aktualizace" : `${pl(dna.aktivita.pocet90, "aktualizace", "aktualizace", "aktualizací")} za 90 dní, poslední před ${pl(dna.aktivita.dni, "dnem", "dny", "dny")}`, puvod("mereno", "Steam")]);
    if (!radky.length) return "";
    return `<div class="section-title">Herní DNA</div>
      <dl class="dna">${radky.map(([k, v, p]) => `<div><dt>${k}</dt><dd>${v}<span class="dna-p">${p}</span></dd></div>`).join("")}</dl>
      <p class="source-note">Herní DNA skládáme jen ze skutečných údajů Steamu, databáze IGDB a z našeho měření. Co v nich není, si nevymýšlíme.</p>`;
  }
  // Série: na první pohled posledních 12 dílů (a tahle hra), celá série v rozbalovacím seznamu. Díly vedou na profil v databázi.
  function serieSeznam(serie) {
    if (!serie?.hry?.length || serie.hry.length < 2) return "";
    const pol = (x) => `<li class="${x.tato ? "tato" : ""}"><span>${x.rok || "?"}</span>${!x.tato && x.slug ? `<a href="/databaze/${esc(x.slug)}"><b>${esc(x.nazev)}</b></a>` : `<b>${esc(x.nazev)}</b>`}${x.typ ? `<small class="dim">${esc(x.typ)}</small>` : ""}${x.tato ? `<em>tato hra</em>` : ""}</li>`;
    const vse = serie.hry, kratce = vse.length > 14;
    return `<div class="section-title">Série: ${esc(serie.nazev)} <span class="dim">(${pl(vse.length, "hra", "hry", "her")})</span></div>
      ${kratce ? `<ol class="serie">${vse.slice(-12).map(pol).join("")}</ol>
        <details class="serie-cela"><summary>Zobrazit celou sérii (${pl(vse.length, "hra", "hry", "her")})</summary><ol class="serie">${vse.map(pol).join("")}</ol></details>`
      : `<ol class="serie">${vse.map(pol).join("")}</ol>`}`;
  }
  function serieBlok(ig) {
    if (!ig || (!ig.serie?.hry?.length && !ig.dlc?.length)) return "";
    return `${serieSeznam(ig.serie)}
      ${ig.dlc?.length ? `<div class="section-title">DLC a rozšíření${ig.dlc_celkem > ig.dlc.length ? ` <span class="dim">(${ig.dlc.length} z ${ig.dlc_celkem})</span>` : ""}</div>
        <ul class="dlc">${ig.dlc.map((x) => `<li><b>${esc(x.nazev)}</b><span class="dim">${x.druh === "rozsireni" ? "rozšíření" : "DLC"}${x.rok ? ` · ${x.rok}` : ""}</span></li>`).join("")}</ul>` : ""}
      <p class="source-note">${puvod("databaze", "IGDB")} ${ig.slug ? `<a href="/databaze/${esc(ig.slug)}">Celý profil hry v databázi</a> · ` : ""}${ig.url ? `<a href="${esc(bezpecnaUrl(ig.url))}" target="_blank" rel="noopener noreferrer">Hra na IGDB</a>` : ""}</p>`;
  }

  // ---------- Galerie hry (oficiální screenshoty a trailery ze Steamu) ----------
  function polozkyGalerie(st) {
    const vid = (st?.videa || []).filter((v) => https(v.nahled) && (https(v.mp4) || https(v.hls))).map((v) => ({ typ: "video", nahled: v.nahled, mp4: https(v.mp4), hls: https(v.hls), nazev: v.nazev || "" }));
    const obr = (st?.screenshoty || []).filter((x) => https(x.male) && https(x.velke)).map((x) => ({ typ: "obr", nahled: x.male, velke: x.velke }));
    return [...vid, ...obr];
  }
  function galerieHry(st, zdroj = "steam") {
    const p = polozkyGalerie(st);
    if (!p.length) return "";
    return `<div class="section-title">Obrázky a trailery</div>
      <div class="galerie" data-galerie>${p.map((x, i) => `<button type="button" class="gal-p${x.typ === "video" ? " gal-video" : ""}" data-i="${i}" aria-label="${x.typ === "video" ? "Přehrát trailer" : `Zvětšit obrázek ${i + 1}`}">
        <img src="${esc(x.nahled)}" alt="" loading="lazy" referrerpolicy="no-referrer">${x.typ === "video" ? `<span class="gal-play" aria-hidden="true"></span>` : ""}</button>`).join("")}</div>
      <p class="source-note">${zdroj === "igdb" ? `Obrázky z databáze IGDB. ${puvod("databaze", "IGDB")}` : `Oficiální obrázky a trailery ze stránky hry na Steamu. ${puvod("oficialni", "Steam")}`}</p>`;
  }
  // Prohlížeč přes celou obrazovku: šipky, Esc, posun prstem. Trailer se načte až po otevření.
  function pripojGalerii(root, st) {
    const el = root.querySelector("[data-galerie]");
    if (!el) return;
    const p = polozkyGalerie(st);
    el.addEventListener("click", (e) => { const b = e.target.closest(".gal-p"); if (b) otevriProhlizec(p, +b.dataset.i, b, st?.url); });
  }
  function otevriProhlizec(p, start, puvodni, steamUrl) {
    let i = start;
    const box = document.createElement("div");
    box.className = "prohlizec"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Obrázky a trailery");
    box.innerHTML = `<div class="pr-obsah"></div>
      <button type="button" class="pr-zavrit" aria-label="Zavřít">✕</button>
      ${p.length > 1 ? `<button type="button" class="pr-sip pr-pred" aria-label="Předchozí">‹</button><button type="button" class="pr-sip pr-dal" aria-label="Další">›</button>` : ""}
      <span class="pr-pocet" aria-live="polite"></span>`;
    const obsah = box.querySelector(".pr-obsah"), pocet = box.querySelector(".pr-pocet");
    const ukaz = () => {
      const x = p[i];
      obsah.textContent = "";
      if (x.typ === "video") {
        const v = document.createElement("video");
        v.controls = true; v.autoplay = true; v.playsInline = true; v.preload = "metadata"; v.poster = x.nahled;
        for (const [src, typ] of [[x.mp4, "video/mp4"], [x.hls, "application/vnd.apple.mpegurl"]]) {
          if (!src) continue;
          const s = document.createElement("source"); s.src = src; s.type = typ; v.appendChild(s);
        }
        // Prohlížeč video neumí přehrát (např. HLS v Chromu na počítači) → odkaz na trailer na Steamu.
        const nejde = () => { obsah.innerHTML = `<div class="pr-nejde"><img src="${esc(x.nahled)}" alt="" referrerpolicy="no-referrer"><p>Tenhle trailer tvůj prohlížeč neumí přehrát přímo.</p>
          ${steamUrl ? `<a class="btn-sek" href="${esc(bezpecnaUrl(steamUrl))}" target="_blank" rel="noopener noreferrer">Přehrát na Steamu</a>` : ""}</div>`; };
        const zdroje = [...v.querySelectorAll("source")];
        if (!zdroje.some((s) => v.canPlayType(s.type))) { nejde(); }
        else { zdroje[zdroje.length - 1].addEventListener("error", nejde); obsah.appendChild(v); }
      } else {
        const img = document.createElement("img");
        img.src = x.velke; img.alt = `Obrázek ${i + 1} z ${p.length}`; img.referrerPolicy = "no-referrer";
        obsah.appendChild(img);
      }
      pocet.textContent = `${i + 1} / ${p.length}`;
    };
    const posun = (d) => { i = (i + d + p.length) % p.length; ukaz(); };
    const zavri = () => {
      box.remove(); document.documentElement.classList.remove("bez-posunu");
      removeEventListener("keydown", klav); removeEventListener("popstate", zavri);
      puvodni?.focus?.();
    };
    const klav = (e) => {
      if (e.key === "Escape") zavri();
      else if (e.key === "ArrowLeft") posun(-1);
      else if (e.key === "ArrowRight") posun(1);
    };
    box.querySelector(".pr-zavrit").onclick = zavri;
    box.querySelector(".pr-pred")?.addEventListener("click", () => posun(-1));
    box.querySelector(".pr-dal")?.addEventListener("click", () => posun(1));
    box.addEventListener("click", (e) => { if (e.target === box || e.target === obsah) zavri(); });
    let x0 = null;
    box.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50 && p.length > 1) posun(dx < 0 ? 1 : -1); });
    addEventListener("keydown", klav); addEventListener("popstate", zavri);
    document.documentElement.classList.add("bez-posunu");
    document.body.appendChild(box);
    ukaz();
    box.querySelector(".pr-zavrit").focus();
  }

  // ---------- Databáze her (IGDB) ----------
  const dbOdkaz = (igdbUrl) => { const m = /igdb\.com\/games\/([a-z0-9-]{1,100})/.exec(String(igdbUrl || "")); return m ? `/databaze/${m[1]}` : ""; };
  const obalHry = (h, cip = "") => `<a class="obal" href="/databaze/${esc(h.slug)}">
      ${https(h.obal) ? `<img src="${esc(h.obal)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="obal-bez">${esc((h.nazev || "?")[0])}</span>`}
      ${cip ? `<span class="obal-cip">${esc(cip)}</span>` : ""}<b>${esc(h.nazev)}</b><small>${h.rok ? esc(String(h.rok)) : ""}${h.platformy?.length ? `${h.rok ? " · " : ""}${esc(h.platformy.slice(0, 3).join(", "))}` : ""}</small></a>`;
  // Chytré hledání: věta česky nebo filtry. Stejné názvy parametrů jako /api/databaze.
  const FILTRY_DB = ["dotaz", "platforma", "zanr", "rezim", "tema", "od", "do", "hodnoceni", "cz", "cena"];
  let nabidkaFiltru = null;
  function formFiltry(p, nab) {
    const vyber = (k, list, prazdne) => `<label><span>${prazdne}</span><select name="${k}"><option value="">${"Jakékoliv"}</option>${(list || []).map((x) =>
      `<option value="${esc(String(x.id))}"${p.get(k) === String(x.id) ? " selected" : ""}>${esc(x.nazev)}</option>`).join("")}</select></label>`;
    const vybrano = FILTRY_DB.slice(1).some((k) => p.get(k));
    return `<form class="db-chytre" id="f-chytre" role="search">
      <label class="db-veta"><span>Chytré hledání – napiš, co hledáš</span>
        <input name="dotaz" type="search" maxlength="160" autocomplete="off" value="${esc(p.get("dotaz") || "")}" placeholder="Např. kooperační horor na PS5 s češtinou do 500 Kč"></label>
      <details class="db-filtry"${vybrano ? " open" : ""}><summary>Filtry</summary><div class="db-filtry-mriz">
        ${vyber("platforma", nab?.platformy, "Platforma")}${vyber("zanr", nab?.zanry, "Žánr")}${vyber("rezim", nab?.rezimy, "Režim")}${vyber("tema", nab?.temata, "Téma")}
        <label><span>Vyšlo od roku</span><input name="od" type="number" min="1970" max="2100" inputmode="numeric" value="${esc(p.get("od") || "")}"></label>
        <label><span>Vyšlo do roku</span><input name="do" type="number" min="1970" max="2100" inputmode="numeric" value="${esc(p.get("do") || "")}"></label>
        <label><span>Hodnocení aspoň</span><select name="hodnoceni"><option value="">Jakékoliv</option>${[60, 70, 80, 90].map((x) => `<option value="${x}"${p.get("hodnoceni") === String(x) ? " selected" : ""}>${x}/100</option>`).join("")}</select></label>
        <label><span>Čeština</span><select name="cz"><option value="">Nezáleží</option><option value="1"${p.get("cz") === "1" ? " selected" : ""}>Aspoň české texty</option><option value="2"${p.get("cz") === "2" ? " selected" : ""}>Český dabing</option></select></label>
        <label><span>Cena na Steamu do (Kč)</span><input name="cena" type="number" min="0" max="10000" inputmode="numeric" value="${esc(p.get("cena") || "")}" placeholder="0 = zdarma"></label>
      </div></details>
      <div class="db-chytre-akce"><button type="submit">Najít hry</button>${vybrano || p.get("dotaz") ? `<a class="btn-sek" href="/databaze">Zrušit filtry</a>` : ""}</div>
    </form>`;
  }
  function pripojFiltry() {
    const f = document.getElementById("f-chytre");
    if (!f) return;
    f.onsubmit = (e) => {
      e.preventDefault();
      const p = new URLSearchParams();
      for (const [k, v] of new FormData(f)) if (String(v).trim() !== "") p.set(k, String(v).trim());
      jdi(p.toString() ? `/databaze?${p}` : "/databaze");
    };
  }
  async function strankaDatabaze() {
    const sp = new URLSearchParams(location.search);
    if (FILTRY_DB.some((k) => sp.get(k))) return strankaDatabazeFiltry(sp);
    const q = (new URLSearchParams(location.search).get("q") || "").trim().slice(0, 60);
    nastavTitulek(q ? `Hledání „${q}“ – databáze her` : "Databáze her – popis česky, platformy, data vydání");
    const hlava = hubHry("databaze", "Databáze her", "Přes 300 tisíc her od klasik po novinky – i hry jen pro konzole. Popis česky, platformy a data vydání, obrázky, hodnocení, série a podobné hry.");
    const form = `<form class="hledat-hru db-hledat" role="search" id="f-db"><input id="q-db" type="search" placeholder="Najdi hru – třeba Zelda, Mafia, Witcher…" autocomplete="off" maxlength="60" aria-label="Název hry" value="${esc(q)}"><button type="submit">Hledat</button></form>`;
    app.innerHTML = `${hlava}${form}${kostra(6, "banner")}`;
    const pripoj = () => {
      const f = document.getElementById("f-db");
      if (f) f.onsubmit = (e) => { e.preventDefault(); const v = document.getElementById("q-db").value.trim(); jdi(v.length >= 2 ? `/databaze?q=${enc(v)}` : "/databaze"); };
    };
    pripoj();
    let d;
    try { d = await nacti(q ? `databaze?q=${enc(q)}` : "databaze"); } catch { app.innerHTML = `${hlava}${form}<p class="empty">Databáze je teď nedostupná, zkus to za chvíli.</p>`; pripoj(); return; }
    if (!location.pathname.startsWith("/databaze")) return;
    app.innerHTML = `${hlava}${form}
      ${q ? `<div class="section-title">Výsledky pro „${esc(q)}“</div>
        ${d.hry.length ? `<div class="police police-mriz db-mriz">${d.hry.map((h) => obalHry(h)).join("")}</div>` : `<p class="empty">Nic jsme nenašli. Zkus anglický nebo původní název hry.</p>`}`
      : `<div class="section-title">Populární hry</div>
        ${d.hry.length ? `<div class="police police-mriz db-mriz">${d.hry.slice(0, 48).map((h, i) => obalHry(h, i < 10 ? `#${i + 1}` : "")).join("")}</div>` : `<p class="dim">Seznam populárních her se připravuje (obnovuje se jednou denně).</p>`}`}
      <p class="source-note">Údaje o hrách jsou z databáze IGDB, kterou doplňuje komunita a vydavatelé. ${puvod("databaze", "IGDB")} Popularita podle návštěvnosti IGDB.</p>`;
    pripoj();
    // Chytré hledání pod běžným hledáním (seznamy filtrů se načtou z IGDB jednou za týden).
    const fe = document.getElementById("f-db");
    if (fe) {
      fe.insertAdjacentHTML("afterend", `<div id="db-chytre-misto">${formFiltry(sp, nabidkaFiltru)}</div>`);
      pripojFiltry();
      if (!nabidkaFiltru) nacti("databaze-filtry").then((n) => { nabidkaFiltru = n; const m = document.getElementById("db-chytre-misto");
        if (m && !m.contains(document.activeElement)) { m.innerHTML = formFiltry(sp, n); pripojFiltry(); } }).catch(() => {});
    }
    if (!q) document.getElementById("q-db")?.focus({ preventScroll: true });
  }

  async function strankaDatabazeFiltry(sp) {
    nastavTitulek("Chytré hledání – databáze her");
    const hlava = hubHry("databaze", "Databáze her", "Najdi hru podle platformy, žánru, režimu, roku, hodnocení, češtiny nebo ceny – nebo to napiš jednou větou.");
    if (!nabidkaFiltru) nabidkaFiltru = await nacti("databaze-filtry").catch(() => null);
    app.innerHTML = `${hlava}${formFiltry(sp, nabidkaFiltru)}${kostra(6, "banner")}`;
    pripojFiltry();
    const p = new URLSearchParams();
    for (const k of FILTRY_DB) if (sp.get(k)) p.set(k, sp.get(k).slice(0, 160));
    let d;
    try { d = await nacti(`databaze?${p}`); } catch { app.innerHTML = `${hlava}${formFiltry(sp, nabidkaFiltru)}<p class="empty">Databáze je teď nedostupná, zkus to za chvíli.</p>`; pripojFiltry(); return; }
    if (!location.pathname.startsWith("/databaze")) return;
    const f = d.filtry || {}, nab = d.nabidka || nabidkaFiltru || {};
    const jm = (list, id) => (list || []).find((x) => x.id === id)?.nazev;
    const rozumim = [f.platforma && jm(nab.platformy, f.platforma), f.zanr && jm(nab.zanry, f.zanr), f.rezim && jm(nab.rezimy, f.rezim), f.tema && jm(nab.temata, f.tema),
      f.od && f.do && f.od === f.do ? `rok ${f.od}` : [f.od && `od ${f.od}`, f.do && `do ${f.do}`].filter(Boolean).join(" "), f.hodnoceni && `hodnocení ${f.hodnoceni}+`,
      f.cz === 2 ? "český dabing" : f.cz === 1 ? "čeština" : "", f.cena === 0 ? "zdarma" : f.cena != null ? `do ${f.cena} Kč` : "", f.q && `název „${f.q}“`].filter(Boolean);
    app.innerHTML = `${hlava}${formFiltry(sp, nab)}
      ${rozumim.length ? `<p class="db-rozumim"><b>Hledám:</b> ${rozumim.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</p>` : ""}
      <div class="section-title">${d.hry.length ? `Nalezeno: ${esc(pl(d.hry.length, "hra", "hry", "her"))}${d.hry.length >= 48 ? " (prvních 48)" : ""}` : "Nic jsme nenašli"}</div>
      ${d.hry.length ? `<div class="police police-mriz db-mriz">${d.hry.map((h) => `<div class="db-vysl">${obalHry(h, h.hodnoceni ? `${h.hodnoceni}/100` : "")}
          ${h.proc?.length ? `<div class="db-proc">${h.proc.map((x) => `<span>✓ ${esc(x)}</span>`).join("")}</div>` : ""}</div>`).join("")}</div>`
        : `<p class="empty">Zkus ubrat některý filtr${f.cz || f.cena != null ? " – čeština a cena jsou známé jen u her, které jsme propojili se Steamem" : ""}.</p>`}
      <p class="source-note">Platforma, žánr, režim, téma, rok a hodnocení podle IGDB. Čeština a cena podle Steamu – jen u her, které máme propojené se Steamem; ostatní hry tyto filtry vyřadí. Větu převádíme na filtry pevnými pravidly (ne AI) – co pravidla nepoznají, hledá se jako název hry. ${puvod("databaze", "IGDB")}</p>`;
    pripojFiltry();
  }

  async function strankaHraDatabaze(slugHry) {
    app.innerHTML = `<div class="profile hra-stranka"><div class="kostra kostra-banner"></div>${kostra(4)}</div>`;
    let d;
    try { d = await nacti(`databaze/${enc(slugHry)}`); }
    catch (e) {
      const nenalezeno = String(e.message) === "404";
      nastavTitulek(nenalezeno ? "Hra nenalezena" : "Databáze her");
      app.innerHTML = `<p class="empty">${nenalezeno ? "Hru jsme v databázi nenašli." : "Databáze her teď neodpovídá – zkus stránku obnovit za chvíli."} <a href="/databaze">Hledat v databázi her</a></p>`;
      return;
    }
    if (!location.pathname.startsWith("/databaze/")) return;
    const rok = d.vydano ? new Date(d.vydano).getFullYear() : "";
    nastavTitulek(`${d.nazev}${rok ? ` (${rok})` : ""} – popis, statistiky, streamy, ceny`);
    const en = document.documentElement.lang === "en";
    const popis = !en && d.preklad?.popis ? d.preklad.popis : d.popis_en;
    const pribeh = !en && d.preklad ? d.preklad.pribeh || "" : d.pribeh_en;
    const prelozeno = !en && !!d.preklad?.popis;
    const st = d.info?.steam || null, gog = d.info?.gog || null, ep = d.info?.epic || null, pas = d.pas || {};
    const sc = d.scena || { statistiky: { dny: [] }, zive: [], nejvic: [], klipy: [], clanky: [] };
    const stat = sc.statistiky || { dny: [] };
    const steamId = st?.id || d.steam?.id || d.steam_id || "";
    // Čeština: Steam (ověřený seznam jazyků obchodu) má přednost, jinak IGDB.
    const czSt = st?.cestina ? (st.cestina.dabing ? 2 : st.cestina.rozhrani ? 1 : 0) : d.steam?.cestina;
    const cz = czSt != null
      ? [czSt === 2 ? "✓ dabing i texty" : czSt === 1 ? "✓ texty" : "✗ bez češtiny", puvod("oficialni", "Steam")]
      : d.cestina ? [[d.cestina.dabing && "dabing", d.cestina.texty && "texty", d.cestina.titulky && !d.cestina.texty && "titulky"].filter(Boolean).join(", ") || "ano", puvod("databaze", "IGDB")] : null;
    const fakta = [
      cz && ["Čeština", `${cz[0]} ${cz[1]}`],
      d.pegi && ["Věkové hodnocení", esc(d.pegi)],
      d.vyvojari?.length && ["Vývojář", esc(d.vyvojari.join(", "))],
      d.vydavatele?.length && ["Vydavatel", esc(d.vydavatele.join(", "))],
      d.serie_jmeno && ["Série", esc(d.serie_jmeno)],
      d.delka?.bezne && ["Délka hraní", `hlavní příběh ≈ ${hodinyHrani(d.delka.bezne)} h${d.delka.vse ? ` · všechno ≈ ${hodinyHrani(d.delka.vse)} h` : ""}`],
      d.rodic && ["Patří ke hře", `<a href="/databaze/${esc(d.rodic.slug)}">${esc(d.rodic.nazev)}</a>`],
    ].filter(Boolean);
    // Statistiky ze všech zdrojů – jen ty, které pro hru opravdu máme.
    const dl = (hodnota, popisek, zdroj) => `<div class="db-stat"><b>${hodnota}</b><span>${popisek}</span>${zdroj}</div>`;
    const statistiky = [
      st?.hraci_ted != null && dl(esc(num(st.hraci_ted)), "hraje právě teď na Steamu (celý svět)", puvod("oficialni", "Steam")),
      d.steam_spicka && dl(esc(num(d.steam_spicka.hracu)), "denní špička hráčů na Steamu", puvod("mereno", "Steam")),
      st?.hodnoceni && dl(`${Number(st.hodnoceni.kladne) || 0} %`, `kladných recenzí na Steamu (${esc(num(st.hodnoceni.recenzi))})`, puvod("oficialni", "Steam")),
      st?.metacritic && dl(String(Number(st.metacritic)), "Metacritic", puvod("oficialni", "Steam")),
      d.kritici && dl(String(Number(d.kritici.skore) || 0), `hodnocení kritiků (${pl(Number(d.kritici.pocet) || 0, "recenze", "recenze", "recenzí")})`, puvod("databaze", "IGDB")),
      d.hraci && dl(String(Number(d.hraci.skore) || 0), `hodnocení hráčů IGDB (${esc(num(d.hraci.pocet))})`, puvod("databaze", "IGDB")),
      gog?.hodnoceni && dl(`${gog.hodnoceni.toLocaleString(LOC)} / 5`, "hodnocení na GOGu", puvod("oficialni", "GOG")),
      (stat.hodin7 || sc.zive.length) && dl(`${esc(num(stat.hodin7 || 0))} h`, "sledování na českých streamech za 7 dní", puvod("mereno", "Twitch + Kick")),
      stat.spicka7 && dl(esc(num(stat.spicka7)), "diváků ve špičce (česká scéna, 7 dní)", puvod("mereno", "Twitch + Kick")),
      pas.puls?.skore != null && dl(`${pas.puls.skore}/100`, "Herní pulsometr", puvod("mereno")),
    ].filter(Boolean);
    const obchod = (nazev, cls, url, radek, venku = true) => `<a class="obchod-r ${cls}" href="${esc(venku ? bezpecnaUrl(url) : url)}"${venku ? ` target="_blank" rel="noopener noreferrer"` : ""}><b>${nazev}</b><span>${radek}</span></a>`;
    const cenaTxt = (o) => o.zdarma || o.cena === 0 ? "Zdarma" : o.cena == null ? "Cena neuvedena"
      : `${o.sleva ? `<s>${esc(cena(o.puvodni, o.mena))}</s> <em>−${Number(o.sleva) || 0} %</em> ` : ""}<strong>${esc(cena(o.cena, o.mena))}</strong>`;
    const zname = new Set();
    const obchody = [
      st && (zname.add("Steam"), obchod("Steam", "ob-steam", st.url, cenaTxt(st))),
      !st && d.steam && (zname.add("Steam"), obchod("Steam", "ob-steam", `/hra/steam/${d.steam.id}`, cenaTxt(d.steam), false)),
      gog && (zname.add("GOG"), obchod("GOG", "ob-gog", gog.url, cenaTxt(gog))),
      ep && (zname.add("Epic Games Store"), obchod("Epic Games", "ob-epic", ep.url, ep.zdarma_ted ? `<strong>Zdarma</strong> ${ep.do ? esc(zbyva(ep.do)) : ""}` : `zdarma od ${esc(new Date(ep.od).toLocaleDateString(LOC))}`)),
      ...(d.obchody || []).filter((o) => !zname.has(o.nazev)).map((o) => obchod(esc(o.nazev), "", o.url, "otevřít obchod")),
    ].filter(Boolean);
    const hist = pas.ceny?.historie || [];
    const maxDen = Math.max(1, ...stat.dny.map((x) => x.hodin));
    const galerieSteam = st && ((st.screenshoty || []).length || (st.videa || []).length);
    const pozadi = https(st?.pozadi) || https(d.pozadi);
    const chipy = (l) => l.map((x) => `<span class="dna-c">${esc(x)}</span>`).join("");
    const dnaIgdb = [["Žánr", d.zanry], ["Témata", d.temata], ["Herní režimy", d.rezimy], ["Pohled", d.pohled]].filter(([, l]) => l?.length);
    const divaku = sc.zive.reduce((a, x) => a + (x.divaci || 0), 0);
    app.innerHTML = `${pozadi ? `<div class="hra-pozadi" aria-hidden="true"><img src="${esc(pozadi)}" alt="" referrerpolicy="no-referrer"></div>` : ""}<div class="profile hra-stranka">
      <a class="back" href="/databaze">← Databáze her</a>
      <div class="db-hlava">${https(d.obal) ? `<img class="db-obal" src="${esc(d.obal)}" alt="" referrerpolicy="no-referrer">` : `<span class="db-obal obal-bez">${esc(d.nazev[0] || "?")}</span>`}
        <div><h1>${esc(d.nazev)}</h1>
          <p class="dim">${rok ? `${esc(String(rok))}` : "Datum vydání zatím neznámé"}${d.vyvojari?.length ? ` · ${esc(d.vyvojari[0])}` : ""}</p>
          ${d.platformy?.length ? `<div class="db-plat">${d.platformy.map((x) => `<span class="plat">${esc(x)}</span>`).join("")}</div>` : ""}
          ${sc.zive.length ? `<a class="db-zive" href="#db-zive"><span class="zivy-bod" aria-hidden="true"></span>${pl(sc.zive.length, "český stream", "české streamy", "českých streamů")} právě živě · ${esc(num(divaku))} diváků</a>` : ""}</div></div>
      <div class="db-o-hre">
        ${popis ? `<div class="section-title">O hře</div><p class="db-popis popis">${esc(popis)}</p>
          <p class="source-note">${prelozeno ? `${puvod("ai", "přeloženo z IGDB")} <details class="db-orig"><summary>Zobrazit originál (anglicky)</summary><p class="popis">${esc(d.popis_en)}</p></details>` : `${puvod("databaze", "IGDB")}${!en ? " Český překlad se připravuje – zkus stránku obnovit za pár minut." : ""}`}</p>` : `<p class="dim">Popis hry v databázi zatím není.</p>`}
        ${pribeh ? `<details class="db-pribeh"><summary>Příběh</summary><p class="popis">${esc(pribeh)}</p></details>` : ""}
      </div>
      ${statistiky.length ? `<div class="section-title">Statistiky ze všech zdrojů</div><div class="db-staty">${statistiky.join("")}</div>` : ""}
      <div class="hra-mriz">
      <aside class="hra-bok" aria-label="Pulsometr, ceny a kde hrát">
        ${pulsBlok(pas.puls)}
        ${obchody.length ? `<div class="section-title">Kde hrát a koupit</div><div class="obchody">${obchody.join("")}</div>${cenovyText(pas.ceny?.rozbor, st)}${poradceBlok(pas.ceny?.rozbor, st)}` : ""}
        ${steamId ? `<p class="db-steam-odkaz"><a href="/hra/steam/${esc(enc(steamId))}">Stránka hry ze Steamu – historie cen, srovnání</a></p>` : ""}
        <div class="hra-hlidat">${tlacitkoSledovat({ slug: slugHry, nazev: d.nazev, steam_id: steamId })}${steamId && !(st?.zdarma || d.steam?.zdarma) ? tlacitkoHlidat({ id: steamId, nazev: d.nazev }) : ""}</div>
        ${fakta.length ? `<dl class="fakta">${fakta.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>` : ""}
        ${steamId ? `<p class="pas-srov"><a class="btn-sek" href="/porovnat-hry?ids=${esc(enc(steamId))}">Porovnat s jinou hrou</a></p>` : ""}
        ${d.oficialni ? `<p class="pas-srov"><a class="btn-sek" href="${esc(bezpecnaUrl(d.oficialni))}" target="_blank" rel="noopener noreferrer">Oficiální web hry</a></p>` : ""}
      </aside>
      <div class="hra-hlavni">
        ${sc.zive.length ? `<div class="section-title" id="db-zive">Právě streamují · Česko</div><div class="live-grid">${sc.zive.slice(0, 6).map(kartaZive).join("")}</div>
          ${sc.zive.length > 6 ? `<p class="dim">a dalších ${sc.zive.length - 6}${d.cesko_slug ? ` – <a href="/hra/${esc(d.cesko_slug)}">všichni</a>` : ""}</p>` : ""}` : ""}
        ${galerieSteam ? galerieHry(st) : galerieHry({ screenshoty: d.obrazky || [], videa: [] }, "igdb")}
        ${!galerieSteam && d.videa?.length ? `<div class="section-title">Trailery</div><div class="db-videa">${d.videa.map((v) => `<a href="https://www.youtube.com/watch?v=${esc(enc(v.id))}" target="_blank" rel="noopener noreferrer">
            <img src="https://i.ytimg.com/vi/${esc(enc(v.id))}/hqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="gal-play" aria-hidden="true"></span><b>${esc(v.nazev || "Trailer")}</b></a>`).join("")}</div>
          <p class="source-note">Trailery se otevřou na YouTube.</p>` : ""}
        ${hist.length >= 2 ? `<div class="section-title">Vývoj ceny na Steamu</div><div class="graf" id="graf-cena"></div>
          <p class="source-note">Nejnižší cena každého dne od ${esc(datumKr(hist[0].den))}, kdy cenu sledujeme (nejvýš 400 dní), v Kč. ${puvod("mereno", "Steam")}</p>` : ""}
        ${d.vydani?.length ? `<div class="section-title">Vydání podle platforem</div><dl class="fakta db-vydani">${d.vydani.map((v) => `<div><dt>${esc(v.platforma)}</dt><dd>${esc(new Date(v.datum).toLocaleDateString(LOC, { day: "numeric", month: "numeric", year: "numeric" }))}</dd></div>`).join("")}</dl>` : ""}
        ${pas.dna ? dnaBlok(pas.dna) : dnaIgdb.length ? `<div class="section-title">Herní DNA</div><dl class="dna">${dnaIgdb.map(([k, l]) => `<div><dt>${k}</dt><dd>${chipy(l)}<span class="dna-p">${puvod("databaze", "IGDB")}</span></dd></div>`).join("")}</dl>` : ""}
        ${(pas.patche || []).length ? `<div class="section-title">Poslední aktualizace · <a href="/aktualizace?hra=${esc(enc(steamId))}">všechny</a></div>
          <ul class="pas-patche">${pas.patche.map((x) => `<li><span class="rr-typ" data-barva="${(TYP_PATCHE[x.typ] || TYP_PATCHE.aktualizace)[1]}">${(TYP_PATCHE[x.typ] || TYP_PATCHE.aktualizace)[0]}</span>
            <a href="${esc(bezpecnaUrl(x.url))}" target="_blank" rel="noopener noreferrer"><b>${esc(x.nadpis)}</b></a><small class="dim">${esc(datumKr(x.datum))}</small>
            ${x.shrnuti ? `<p>${esc(x.shrnuti)} ${puvod("ai", "podle oznámení na Steamu")}</p>` : ""}</li>`).join("")}</ul>` : ""}
        <div class="section-title">Na českých streamech</div>
        ${stat.hodin7 || sc.nejvic.length ? `<div class="rep-dlazdice"><div><b>${esc(num(stat.hodin7 || 0))}</b><span>hodin sledování za 7 dní</span></div><div><b>${esc(num(stat.spicka7 || 0))}</b><span>diváků ve špičce</span></div></div>
          ${stat.dny.length > 1 ? `<div class="sloupce" role="img" aria-label="Hodiny sledování po dnech">${stat.dny.map((x) => `<i data-h="${Math.round((x.hodin / maxDen) * 100)}" title="${esc(datumKr(x.den))}: ${x.hodin} h"></i>`).join("")}</div>
            <p class="source-note">Hodiny sledování po dnech za posledních 30 dní (od začátku měření). ${puvod("mereno", "Twitch + Kick")}</p>` : ""}`
          : `<p class="dim">Tuhle hru zatím nikdo z českých streamerů nevysílal (od začátku našeho měření). Jakmile ji někdo začne hrát, objeví se tu statistiky.</p>`}
        ${sc.nejvic.length ? `<div class="section-title">Kdo ji hraje nejvíc</div><div class="slist">${sc.nejvic.slice(0, 8).map((x, i) => radekStreamera(x, i, "hra")).join("")}</div>` : ""}
        ${(sc.klipy || []).length ? `<div class="section-title">Nejlepší klipy</div><div class="regal">${sc.klipy.map((v) => kartaVidea(v, true)).join("")}</div>` : ""}
        ${(sc.clanky || []).length ? `<div class="section-title">Novinky o hře</div><div class="grid">${sc.clanky.slice(0, 6).map((c) => kartaClanku(c, 1)).join("")}</div>` : ""}
        ${st?.pozadavky && (st.pozadavky.min.length || st.pozadavky.dop.length) ? `<details class="pozadavky"><summary>Systémové požadavky (PC)</summary>
          <div class="poz-sloupce">${st.pozadavky.min.length ? `<div><b>Minimální</b><ul>${st.pozadavky.min.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}
          ${st.pozadavky.dop.length ? `<div><b>Doporučené</b><ul>${st.pozadavky.dop.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}</div>
          <p class="source-note">Podle stránky hry na Steamu.</p></details>
          <div class="hw-na-hre" id="hw-hra"><b>Rozjede se mi to?</b> <a href="/rozjede-se?hra=${esc(st.id)}">Porovnat s mým počítačem</a></div>` : ""}
        ${serieSeznam(d.serie)}
        ${d.dlc?.length ? `<div class="section-title">DLC a rozšíření</div><ul class="dlc">${d.dlc.map((x) => `<li><b>${esc(x.nazev)}</b><span class="dim">${x.druh === "rozsireni" ? "rozšíření" : "DLC"}${x.rok ? ` · ${x.rok}` : ""}</span></li>`).join("")}</ul>` : ""}
        ${d.podobne?.length ? `<div class="section-title">Podobné hry</div><div class="police police-mriz db-mriz">${d.podobne.map((h) => obalHry(h)).join("")}</div>` : ""}
        <p class="source-note">Údaje o hře jsou z databáze IGDB${d.cas ? ` (stav ${esc(kdy(new Date(d.cas)))})` : ""}${st ? ", ceny, hodnocení a počet hráčů ze Steamu" : ""}${gog ? " a GOGu" : ""}; streamy měříme sami z API Twitche a Kicku. ${d.url ? `<a href="${esc(bezpecnaUrl(d.url))}" target="_blank" rel="noopener noreferrer">Hra na IGDB</a>` : ""}</p>
      </div></div></div>`;
    pripojGalerii(app, galerieSteam ? st : { screenshoty: d.obrazky || [], videa: [] });
    const gc = document.getElementById("graf-cena");
    if (gc) graf(gc, hist.map((x) => ({ v: x.cena, d: new Date(x.den + "T12:00:00").toLocaleDateString(LOC, { day: "numeric", month: "numeric" }) })), "Vývoj ceny na Steamu");
    const poz = app.querySelector(".hra-pozadi img");
    if (poz) poz.addEventListener("error", () => poz.parentElement.remove(), { once: true });
    const hwEl = document.getElementById("hw-hra"), pc = mujPc();
    if (hwEl && st?.pozadavky && (pc.gpu || pc.cpu || pc.ram)) nactiHw().then((H) => {
      if (document.getElementById("hw-hra") !== hwEl) return;
      hwEl.innerHTML = `<b>Rozjede se mi to?</b> <span class="dim">(tvůj uložený počítač · <a href="/rozjede-se?hra=${esc(st.id)}">změnit</a>)</span>${vyhodnotHw(H, pc, st.pozadavky)}`;
    }).catch(() => {});
  }

  // ---------- Herní radar ----------
  const TYP_RADARU = {
    aktualizace: ["Aktualizace", "#5cc8ff"], zdarma: ["Zdarma", "#4fd88f"], cena: ["Nejnižší cena", "#ffc04d"],
    rekord: ["Streameři", "#b47cff"], trend: ["Trend", "#ff7a9c"], vydani: ["Vydání", "#39d5ff"], vyroci: ["Výročí", "#8b5cff"],
  };
  function textRadaru(u) {
    if (u.typ === "aktualizace") return [`${u.hra}: ${(TYP_PATCHE[u.podtyp] || TYP_PATCHE.aktualizace)[0]}`, u.text || u.nadpis];
    if (u.typ === "zdarma") return [`${u.hra} je zdarma na Epicu`, u.do ? `Zdarma: ${zbyva(u.do)}` : ""];
    if (u.typ === "cena") return [`${u.hra} za ${cena(u.cena, u.mena)}`, `Nejnižší cena od ${datumKr(u.od)}, kdy ji sledujeme · sleva −${Number(u.sleva) || 0} %`];
    if (u.typ === "rekord") return u.podtyp === "milnik" ? [`${u.streamer.jmeno} překonal ${num(u.hodnota)} sledujících`, "Milník sledujících"] : [`${u.streamer.jmeno}: nový rekord ${num(u.hodnota)} diváků`, "Nejvíc diváků najednou od začátku našeho měření"];
    if (u.typ === "trend" && u.oblast === "steam") return [`${u.hra} prudce roste na Steamu`, `${num(u.hracu)} hráčů ve špičce, před týdnem ${num(u.hracu_pred)} (+${u.zmena} %)`];
    if (u.typ === "trend") return [u.podtyp === "oziva" ? `${u.hra} znovu ožívá na českých streamech` : u.podtyp === "nova" ? `${u.hra} je nově na české scéně` : `${u.hra} prudce roste na českých streamech`,
      `${num(u.hodin)} h sledování za 7 dní, týden předtím ${num(u.hodin_pred)} h${u.zmena != null ? ` (+${u.zmena} %)` : ""}`];
    if (u.typ === "vydani") return [`Vyšlo: ${u.hra}`, [(u.platformy || []).join(", "), u.cestina > 0 ? (u.cestina === 2 ? "CZ dabing" : "CZ texty") : ""].filter(Boolean).join(" · ")];
    if (u.typ === "vyroci") return [`${u.hra} slaví ${pl(Number(u.pred) || 0, "rok", "roky", "let")}`, `Vyšlo v roce ${Number(u.rok) || ""}`];
    return [u.hra || "", ""];
  }
  function radekRadaru(u) {
    const [t, popis] = textRadaru(u), typ = TYP_RADARU[u.typ] || ["", "#888"];
    const venku = /^https?:/i.test(u.odkaz || "");
    const obr = u.typ === "rekord" ? (https(u.streamer?.profilovka) ? `<img class="rr-av" src="${esc(u.streamer.profilovka)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="rr-bez"></span>`)
      : https(u.obrazek) ? `<img src="${esc(u.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="rr-bez"></span>`;
    return `<a class="radar-r" href="${esc(venku ? bezpecnaUrl(u.odkaz) : u.odkaz || "/radar")}"${venku ? ` target="_blank" rel="noopener noreferrer"` : ""}>
      <span class="rr-obr">${obr}</span>
      <span class="rr-t"><span class="rr-typ" data-barva="${typ[1]}">${typ[0]}</span><b>${esc(t)}</b>${popis ? `<span class="rr-p">${esc(popis)}</span>` : ""}
      <small>${puvod(u.ai ? "ai" : u.druh, u.zdroj)} <span class="dim">${esc(kdy(new Date(u.cas)))}</span></small></span></a>`;
  }
  function denRadaru(iso) {
    const d = new Date(iso), dnes = new Date(), vcera = new Date(Date.now() - 864e5);
    const k = (x) => x.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
    return k(d) === k(dnes) ? "Dnes" : k(d) === k(vcera) ? "Včera" : d.toLocaleDateString(LOC, { weekday: "long", day: "numeric", month: "numeric" });
  }
  async function strankaRadar() {
    nastavTitulek("Herní radar – co se právě děje ve hrách");
    const typ = new URLSearchParams(location.search).get("typ") || "";
    const hlava = hubHry("radar", "Herní radar", "Co se právě děje: velké aktualizace, hry zdarma, rekordní ceny, rekordy streamerů, rostoucí hry a vydání – na jednom místě a průběžně.");
    if (!state.radar || Date.now() - state.radarCas > 6e5) {
      app.innerHTML = `${hlava}${kostra(6)}`;
      try { state.radar = await nacti("radar"); state.radarCas = Date.now(); } catch { app.innerHTML = `${hlava}<p class="empty">Radar se nepodařilo načíst. Zkus to za chvíli.</p>`; return; }
    }
    if (!location.pathname.startsWith("/radar")) return;
    const d = state.radar;
    const pocty = {};
    for (const u of d.udalosti) pocty[u.typ] = (pocty[u.typ] || 0) + 1;
    const list = d.udalosti.filter((u) => !typ || u.typ === typ);
    const dny = [];
    for (const u of list) { const den = denRadaru(u.cas); if (!dny.length || dny[dny.length - 1][0] !== den) dny.push([den, []]); dny[dny.length - 1][1].push(u); }
    app.innerHTML = `${hlava}
      <div class="chips chips-barvy">${[["", "Vše"], ...Object.entries(TYP_RADARU).filter(([k]) => pocty[k]).map(([k, v]) => [k, `${v[0]} (${pocty[k]})`])].map(([k, t]) =>
        `<a class="chip${k === typ ? " on" : ""}" href="/radar${k ? `?typ=${k}` : ""}">${t}</a>`).join("")}</div>
      ${!typ && d.brzy.length ? `<section class="radar-brzy"><div class="section-title">Vychází do 7 dní · <a href="/vydani">kalendář</a></div>
        <div class="police police-mriz">${d.brzy.slice(0, 10).map((h) => `<a class="obal" href="${esc(h.odkaz)}">
          ${https(h.obrazek) ? `<img src="${esc(h.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="obal-bez">${esc((h.hra || "?")[0])}</span>`}
          <span class="obal-cip">${esc(dnyDoVydani(h.cas).replace("vychází ", ""))}</span><b>${esc(h.hra)}</b><small>${esc(datumVydani(h.cas))}</small></a>`).join("")}</div></section>` : ""}
      ${dny.length ? dny.map(([den, u]) => `<section class="radar-den"><h2>${esc(den)}</h2><div class="radar-l">${u.map(radekRadaru).join("")}</div></section>`).join("")
        : `<p class="empty">Za posledních 7 dní tu zatím nic není. Radar se plní z aktualizací her, obchodů a našeho měření streamů.</p>`}
      <p class="source-note">Radar nic nevymýšlí – každá položka pochází z dat, která web sbírá (oficiální oznámení na Steamu, obchody Epic a Steam, databáze IGDB, naše měření Twitche a Kicku). Barevný štítek u položky říká, odkud je. <a href="/o-webu#data">Jak počítáme</a></p>`;
    app.querySelectorAll("[data-barva]").forEach((el) => el.style.setProperty("--sk", barva(el.dataset.barva, "#ffc04d")));
  }

  // ---------- Rostoucí a upadající hry ----------
  const STAVY_TRENDU = [
    ["prudce_roste", "Prudce roste", "#4fd88f"], ["oziva", "Znovu ožívá", "#39d5ff"], ["nova", "Nově na české scéně", "#5cc8ff"], ["roste", "Roste", "#9be27a"],
    ["stabilni", "Stabilní", "#b9b3d9"], ["klesa", "Klesá", "#ffb44d"], ["vyrazne_klesa", "Výrazně klesá", "#ff6b6b"],
  ];
  async function strankaTrendy() {
    nastavTitulek("Rostoucí a upadající hry – trendy na Steamu a českých streamech");
    const oParam = new URLSearchParams(location.search).get("o");
    const oblast = oParam === "steam" ? "steam" : oParam === "analytika" ? "analytika" : "cesko";
    const hlava = hubHry("trendy", "Rostoucí a upadající hry", "Které hry nabírají hráče a diváky a které je ztrácejí. Jen z čísel, která opravdu měříme.");
    if (!state.trendy || Date.now() - state.trendyCas > 18e5) {
      app.innerHTML = `${hlava}${kostra(6)}`;
      try { state.trendy = await nacti("trendy"); state.trendyCas = Date.now(); } catch { app.innerHTML = `${hlava}<p class="empty">Trendy se nepodařilo načíst.</p>`; return; }
    }
    if (!location.pathname.startsWith("/trendy")) return;
    const t = state.trendy, x = t[oblast];
    const prepinac = `<nav class="hub-tabs" aria-label="Oblast"><a href="/trendy" class="${oblast === "cesko" ? "on" : ""}">Česká scéna (streamy)</a><a href="/trendy?o=steam" class="${oblast === "steam" ? "on" : ""}">Steam (hráči)</a><a href="/trendy?o=analytika" class="${oblast === "analytika" ? "on" : ""}">Žánry a komunity</a></nav>`;
    if (oblast === "analytika") return strankaAnalytika(hlava, prepinac);
    let obsah;
    if (!x || !x.dostupne) {
      const od = x?.od ? datumKr(x.od) : null;
      obsah = `<p class="info-box">${oblast === "cesko"
        ? `Trend spočítáme, až budeme mít aspoň 14 celých dní záznamů.${od ? ` Měříme od ${od}.` : ""}`
        : `Denní špičku hráčů na Steamu ukládáme${od ? ` od ${od}` : " od teď"}. Srovnání s týdnem předtím bude k dispozici po 8 dnech ukládání.`}</p>`;
    } else {
      const skup = STAVY_TRENDU.map(([k, n, b]) => [k, n, b, x.polozky.filter((p) => p.stav === k)]).filter((s) => s[3].length);
      const hodnota = (p) => oblast === "steam"
        ? `<b>${esc(num(p.hracu))}</b><small>před týdnem ${esc(num(p.hracu_pred))}</small>`
        : `<b>${esc(num(p.hodin))} h</b><small>předtím ${esc(num(p.hodin_pred))} h</small>`;
      const odkaz = (p) => oblast === "steam" ? `/hra/steam/${enc(p.steam_id)}` : `/hra/${enc(p.slug)}`;
      obsah = skup.map(([k, n, b, list]) => `<section class="trend-sk" data-barva="${b}"><h2><i aria-hidden="true"></i>${n} <span class="dim">(${list.length})</span></h2>
        <div class="slist">${list.slice(0, 10).map((p) => `<a class="srow trend-r" href="${esc(odkaz(p))}">
          ${https(p.obrazek) ? `<img class="tr-obr" src="${esc(p.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="tr-obr tr-bez"></span>`}
          <div class="info"><h3>${esc(p.hra)}</h3></div>
          <div class="num tr-num">${hodnota(p)}${p.zmena != null ? `<em class="${p.zmena >= 0 ? "plus" : "minus"}">${p.zmena > 0 ? "+" : ""}${p.zmena} %</em>` : ""}</div></a>`).join("")}</div></section>`).join("")
        || `<p class="empty">Žádná hra zatím nesplňuje podmínky (aspoň 10 h sledování týdně).</p>`;
      obsah += `<p class="source-note">${oblast === "cesko"
        ? `Hodiny sledování na českých streamech (Twitch a Kick) za 7 celých dní ${esc(datumKr(x.obdobi.od))}–${esc(datumKr(x.obdobi.do))} proti 7 dnům předtím. Jen hry s aspoň 10 h týdně. Prudce roste = dvojnásobek a víc, roste = +25 % a víc, klesá = −25 % a víc, výrazně klesá = −60 % a víc. „Znovu ožívá“ = hra se dřív hrála, týden skoro vůbec a teď zase (aspoň 15 h). Jeden velký streamer dokáže číslo hodně pohnout. ${puvod("mereno", "Twitch + Kick", t.cas)}`
        : `Nejvíc hráčů najednou za 24 h podle oficiálního žebříčku Steamu (${esc(datumKr(x.den))}) proti stejnému údaji z ${esc(datumKr(x.srovnani))}. Jen hry z žebříčku zhruba 100 nejhranějších, které v něm byly oba dny a měly aspoň 1 000 hráčů. Prudce roste = +50 % a víc, roste = +15 %, klesá = −15 %, výrazně klesá = −40 %. Hra, která z žebříčku vypadla, tu není – neznamená to, že je „mrtvá“. ${puvod("mereno", "Steam", t.cas)}`}</p>`;
    }
    app.innerHTML = `${hlava}${prepinac}${obsah}`;
    app.querySelectorAll("[data-barva]").forEach((el) => el.style.setProperty("--sk", barva(el.dataset.barva, "#ffc04d")));
  }

  // ---------- Analytika žánrů a komunit (záložka na /trendy) ----------
  async function strankaAnalytika(hlava, prepinac) {
    app.innerHTML = `${hlava}${prepinac}${kostra(5)}`;
    let a;
    try { a = await nacti("analytika"); } catch { app.innerHTML = `${hlava}${prepinac}<p class="empty">Analytiku se nepodařilo načíst.</p>`; return; }
    if (!location.pathname.startsWith("/trendy")) return;
    const zmena = (z) => z == null ? "" : `<em class="${z >= 0 ? "plus" : "minus"}">${z > 0 ? "+" : ""}${z} %</em>`;
    const odkazHryA = (h) => h.igdb_slug ? `/databaze/${enc(h.igdb_slug)}` : h.slug ? `/hra/${enc(h.slug)}` : h.id ? `/hra/steam/${enc(h.id)}` : "/trendy";
    const obr = (h) => https(h.obrazek) ? `<img class="tr-obr" src="${esc(h.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="tr-obr tr-bez"></span>`;
    const maxZ = Math.max(1, ...(a.zanry || []).map((z) => z.hodin));
    const casti = [];
    if (!a.dostupne) casti.push(`<p class="info-box">Žánry a komunity spočítáme, až budeme mít aspoň 14 celých dní záznamů ze streamů.${a.od ? ` Měříme od ${esc(datumKr(a.od))}.` : ""}</p>`);
    else {
      casti.push(`<section class="blok"><div class="section-title">Žánry na české scéně – hodiny sledování za 7 dní</div>
        ${(a.zanry || []).length ? `<div class="an-zanry">${a.zanry.map((z) => `<div class="an-z"><div class="an-z-t"><b>${esc(z.zanr)}</b><span>${esc(num(z.hodin))} h ${zmena(z.zmena)}</span></div>
          <div class="bar"><i data-w="${Math.round((z.hodin / maxZ) * 100)}"></i></div>
          <small class="dim">${esc(pl(z.her, "hra", "hry", "her"))}${z.top?.length ? ` · nejvíc ${esc(z.top.join(", "))}` : ""}</small></div>`).join("")}</div>` : `<p class="dim">Zatím málo spárovaných her.</p>`}
        <p class="source-note">Hodiny sledování na českých streamech (Twitch a Kick) ${esc(datumKr(a.obdobi.od))}–${esc(datumKr(a.obdobi.do))} proti 7 dnům předtím. Žánr podle Steamu; hra může mít víc žánrů, proto se hodiny nesčítají do 100 %. Spárovat se Steamem umíme ${a.pokryti != null ? `${esc(String(a.pokryti))} %` : "část"} sledovaných hodin – zbytek (např. hry jen pro konzole) v žánrech chybí. ${puvod("mereno", "Twitch + Kick + Steam", a.cas)}</p></section>`);
      casti.push(`<section class="blok"><div class="section-title">Rostoucí české komunity</div>
        ${(a.komunity || []).length ? `<div class="slist">${a.komunity.map((h) => `<a class="srow trend-r" href="${esc(odkazHryA(h))}">${obr(h)}<div class="info"><h3>${esc(h.hra)}</h3></div>
          <div class="num tr-num"><b>${esc(pl(h.streamu, "stream", "streamy", "streamů"))}</b><small>minulý týden ${esc(num(h.streamu_pred))}</small></div></a>`).join("")}</div>` : `<p class="dim">Tento týden žádná hra nepřibrala streamy.</p>`}
        <p class="source-note">Nejvíc českých streamů, které hru hrály najednou na jedné platformě – tento týden proti minulému. Jen hry s aspoň 3 streamy. ${puvod("mereno", "Twitch + Kick", a.cas)}</p></section>`);
    }
    casti.push(`<section class="blok"><div class="section-title">Nejčastěji ve slevě (90 dní)</div>
      ${(a.slevy || []).length ? `<div class="slist">${a.slevy.map((h) => `<a class="srow trend-r" href="${esc(odkazHryA(h))}">${obr(h)}<div class="info"><h3>${esc(h.nazev)}</h3></div>
        <div class="num tr-num"><b>${esc(pl(h.dni, "den", "dny", "dní"))}</b><small>až −${esc(String(h.max))} %</small></div></a>`).join("")}</div>` : `<p class="dim">Zatím máme málo historie cen.</p>`}
      <p class="source-note">Počet dní se slevou na Steamu za posledních 90 dní, jen hry, jejichž cenu měříme aspoň 60 dní. ${puvod("mereno", "Steam", a.cas)}</p></section>`);
    casti.push(`<section class="blok"><div class="section-title">Nejvíc aktualizací (30 dní)</div>
      ${(a.aktualizace || []).length ? `<div class="slist">${a.aktualizace.map((h) => `<a class="srow trend-r" href="${esc(odkazHryA(h))}">${obr(h)}<div class="info"><h3>${esc(h.nazev)}</h3><span class="dim">naposledy ${esc(kdy(Date.parse(h.posledni)))}</span></div>
        <div class="num tr-num"><b>${esc(pl(h.pocet, "oznámení", "oznámení", "oznámení"))}</b></div></a>`).join("")}</div>` : `<p class="dim">Zatím žádné aktualizace.</p>`}
      <p class="source-note">Oficiální oznámení vývojářů na Steamu u her, které sledujeme. ${puvod("oficialni", "Steam", a.cas)}</p></section>`);
    app.innerHTML = `${hlava}${prepinac}${casti.join("")}`;
    app.querySelectorAll(".bar i[data-w]").forEach((el) => { el.style.width = `${Math.max(2, Math.min(100, Number(el.dataset.w) || 0))}%`; });
  }

  // ---------- Srovnávač her ----------
  async function strankaSrovnani() {
    nastavTitulek("Srovnávač her – cena, čeština, hráči a pulsometr vedle sebe");
    const ids = [...new Set((new URLSearchParams(location.search).get("ids") || "").split(",").filter((x) => /^\d{1,10}$/.test(x)))].slice(0, 4);
    const hlava = hubHry("porovnat-hry", "Srovnávač her", "Vyber dvě až čtyři hry a uvidíš je vedle sebe: cenu, češtinu, hodnocení, počet hráčů, pulsometr i herní DNA.");
    const nastavIds = (nove) => { history.replaceState(null, "", "/porovnat-hry" + (nove.length ? `?ids=${nove.join(",")}` : "")); strankaSrovnani().then(() => obarvi(app)); };
    const hledani = `<form class="hledat-hru" role="search" id="f-srov"><input id="q-srov" type="search" placeholder="Přidat hru – napiš název…" autocomplete="off" maxlength="60" aria-label="Název hry"${ids.length >= 4 ? " disabled" : ""}><button type="submit"${ids.length >= 4 ? " disabled" : ""}>Najít</button></form><div id="srov-hledani"></div>`;
    app.innerHTML = `${hlava}${hledani}${ids.length ? kostra(5) : `<p class="dim">Začni tím, že najdeš první hru. Hry můžeš přidat i ze stránky hry tlačítkem „Porovnat s jinou hrou“.</p>`}`;
    const pripojHledani = () => {
      const f = document.getElementById("f-srov");
      if (!f) return;
      f.onsubmit = async (e) => {
        e.preventDefault();
        const q = document.getElementById("q-srov").value.trim(), box = document.getElementById("srov-hledani");
        if (q.length < 2) return;
        box.innerHTML = kostra(2);
        let r;
        try { r = await nacti("cestina?q=" + enc(q)); } catch { box.innerHTML = `<p class="dim">Hledání se nepovedlo.</p>`; return; }
        const hry = (r.hry || []).filter((h) => !ids.includes(String(h.id))).slice(0, 8);
        box.innerHTML = hry.length ? `<div class="srov-vysl">${hry.map((h) => `<button type="button" data-id="${esc(h.id)}">${https(h.obrazek) ? `<img src="${esc(h.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<b>${esc(h.nazev)}</b><span>Přidat</span></button>`).join("")}</div>`
          : `<p class="dim">Nic jsme nenašli. Zkus anglický název hry ze Steamu.</p>`;
        box.querySelectorAll("button[data-id]").forEach((b) => b.onclick = () => nastavIds([...ids, b.dataset.id].slice(0, 4)));
      };
    };
    pripojHledani();
    if (!ids.length) return;
    let d;
    try { d = await nacti("srovnani?ids=" + ids.join(",")); } catch { app.innerHTML = `${hlava}${hledani}<p class="empty">Srovnání se nepodařilo načíst.</p>`; pripojHledani(); return; }
    if (!location.pathname.startsWith("/porovnat-hry")) return;
    const hry = d.hry.filter((h) => !h.nenalezeno);
    const czT = (c) => !c ? "–" : c.dabing ? "✓ dabing i texty" : c.rozhrani ? "✓ texty" : "✗ bez češtiny";
    const cenaT = (h) => h.zdarma || h.cena === 0 ? "Zdarma" : h.cena == null ? "–" : `${esc(cena(h.cena, h.mena))}${h.sleva ? ` <em>−${Number(h.sleva) || 0} %</em>` : ""}`;
    const maxHracu = (h) => { const x = h.dna?.igdb?.hraci; if (!x) return "–"; const m = Math.max(x.online_koop_max || 0, x.offline_koop_max || 0, x.online_max || 0); return m ? `až ${m}` : "neuvedeno"; };
    const rezimT = (h) => h.dna?.steam ? [h.dna.steam.sam && "sám", h.dna.steam.koop && "kooperace", h.dna.steam.online && "online"].filter(Boolean).join(", ") || "–" : "–";
    const radky = [
      ["Cena na Steamu", (h) => cenaT(h), puvod("oficialni", "Steam")],
      ["Nákupní poradce", (h) => h.rozbor?.poradce && PORADCE[h.rozbor.poradce.druh] ? `<b>${esc(PORADCE[h.rozbor.poradce.druh][0])}</b>${h.rozbor.poradce.nafouknuta ? `<br><small>nafouknutá „původní“ cena</small>` : ""}` : "–", puvod("mereno", "Steam")],
      ["Cenový radar", (h) => h.rozbor ? (h.rozbor.nejnizsi_ted && h.sleva ? "nejlevnější od začátku měření" : h.rozbor.dni < 30 ? `měříme ${pl(h.rozbor.dni, "den", "dny", "dní")}` : `nejníž ${esc(cena(h.rozbor.min, h.mena))} · slev ${h.rozbor.slevovych_obdobi}×`) : "–", puvod("mereno", "Steam")],
      ["Cena na GOGu", (h) => h.gog?.cena != null ? `${esc(cena(h.gog.cena, h.gog.mena))}${h.gog.sleva ? ` <em>−${Number(h.gog.sleva) || 0} %</em>` : ""}` : "–", puvod("oficialni", "GOG")],
      ["Čeština", (h) => czT(h.cestina), puvod("oficialni", "Steam")],
      ["Hodnocení hráčů", (h) => h.hodnoceni ? `${Number(h.hodnoceni.kladne) || 0} % z ${esc(num(h.hodnoceni.recenzi))}` : "–", puvod("oficialni", "Steam")],
      ["Metacritic", (h) => h.metacritic ? String(Number(h.metacritic)) : "–", puvod("oficialni", "Steam")],
      ["Hraje právě teď", (h) => h.hraci_ted != null ? esc(num(h.hraci_ted)) : "–", puvod("oficialni", "Steam")],
      ["Pulsometr", (h) => h.puls ? pulsBlok(h.puls, true) : "–", puvod("mereno")],
      ["Česká scéna (7 dní)", (h) => { const s = h.puls?.slozky?.find((x) => x.klic === "scena"); return s ? `${esc(num(s.hodnota))} h` : "–"; }, puvod("mereno", "Twitch + Kick")],
      ["Režimy", rezimT, puvod("oficialni", "Steam")],
      ["Počet hráčů", maxHracu, puvod("databaze", "IGDB")],
      ["Pohled", (h) => esc((h.dna?.igdb?.pohled || []).join(", ") || "–"), puvod("databaze", "IGDB")],
      ["Hlavní příběh", (h) => h.dna?.igdb?.delka?.bezne ? `≈ ${hodinyHrani(h.dna.igdb.delka.bezne)} h` : "–", puvod("databaze", "IGDB")],
      ["Aktualizace (90 dní)", (h) => h.dna?.aktivita ? (h.dna.aktivita.dni == null ? "žádná" : `${h.dna.aktivita.pocet90}× · poslední před ${pl(h.dna.aktivita.dni, "dnem", "dny", "dny")}`) : "nesledujeme", puvod("mereno", "Steam")],
      ["DLC a rozšíření", (h) => h.dlc_celkem != null ? String(h.dlc_celkem) : "–", puvod("databaze", "IGDB")],
      ["Vydáno", (h) => esc(h.vydani || "–"), puvod("oficialni", "Steam")],
      ["Vývojář", (h) => esc((h.vyvojari || []).join(", ") || "–"), puvod("oficialni", "Steam")],
    ];
    app.innerHTML = `${hlava}${hledani}
      <div class="srov-wrap"><table class="srov"><thead><tr><th></th>${hry.map((h) => `<th><a href="/hra/steam/${esc(h.id)}">${https(h.obrazek) ? `<img src="${esc(h.obrazek)}" alt="" referrerpolicy="no-referrer">` : ""}<b>${esc(h.nazev)}</b></a>
        <button type="button" class="srov-pryc" data-id="${esc(h.id)}" aria-label="Odebrat ze srovnání">Odebrat</button></th>`).join("")}</tr></thead>
      <tbody>${radky.map(([n, f, p]) => `<tr><th scope="row">${n}<span>${p}</span></th>${hry.map((h) => `<td>${f(h)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      ${hry.length < 2 ? `<p class="dim">Přidej ještě aspoň jednu hru.</p>` : ""}
      ${d.hry.some((h) => h.nenalezeno) ? `<p class="dim">Některou hru jsme na Steamu nenašli, ve srovnání chybí.</p>` : ""}
      <p class="source-note">„–“ znamená, že údaj nemáme – nic nedoplňujeme odhadem. Ceny vždy platí v obchodě. Údaje z obchodů obnovujeme nejvýš po 12 hodinách.</p>`;
    app.querySelectorAll(".srov-pryc").forEach((b) => b.onclick = () => nastavIds(ids.filter((x) => x !== b.dataset.id)));
    pripojHledani();
  }

  // ---------- Cenový radar (Hlídač): hry na nejnižší ceně od začátku měření ----------
  async function blokCenovyRadar(el) {
    let d;
    try { d = await nacti("cenovy-radar"); } catch { return; }
    if (!el.isConnected || !(d.hry || []).length) return;
    el.innerHTML = `<div class="section-title">Cenový radar: nejnižší cena od začátku měření</div>
      <div class="slist">${d.hry.slice(0, 8).map((h, i) => `<a class="srow" href="/hra/steam/${esc(h.id)}"><span class="rank">${i + 1}</span>
        <div class="info"><h3>${esc(h.nazev)}</h3><div class="sub">sledujeme od ${esc(datumKr(h.od))}${h.slevovych_obdobi > 1 ? ` · ve slevě ${h.slevovych_obdobi}×` : ""}</div></div>
        <div class="num"><b>${esc(cena(h.cena, h.mena))}</b>−${Number(h.sleva) || 0} %</div></a>`).join("")}</div>
      <p class="source-note">Jen hry, jejichž cenu sledujeme aspoň 30 dní. „Nejnižší“ znamená nejnižší za dobu našeho měření, ne v celé historii hry. ${puvod("mereno", "Steam", d.cas)} <a href="/radar?typ=cena">Na radaru</a></p>`;
  }

  // ---------- Rozjede se mi to? ----------
  let hwNacteni = null;
  const nactiHw = () => hwNacteni || (hwNacteni = new Promise((ok, chyba) => {
    if (window.HP_HW) return ok(window.HP_HW);
    const sc = document.createElement("script"); sc.src = "/js/hw.js"; sc.onload = () => ok(window.HP_HW); sc.onerror = chyba; document.head.appendChild(sc);
  }));
  const mujPc = () => { try { return JSON.parse(localStorage.getItem("hp_pc") || "{}"); } catch { return {}; } };
  const ulozPc = (pc) => { try { localStorage.setItem("hp_pc", JSON.stringify(pc)); } catch {} };
  const VERDIKT = { dop: ["Doporučené nastavení", "ok"], min: ["Minimální nastavení", "stredne"], ne: ["Nestačí", "ne"] };
  // Vyhodnocení jedné hry: vrací HTML s výsledkem pro grafiku, procesor a paměť.
  function vyhodnotHw(H, pc, poz) {
    const min = H.rozeberPozadavky(poz.min), dop = H.rozeberPozadavky(poz.dop);
    const gpu = H.najdiGpu(pc.gpu || "")[0], cpu = H.najdiCpu(pc.cpu || "")[0], ram = Number(pc.ram) || null;
    const casti = [
      ["Grafika", gpu?.nazev, H.porovnej(gpu?.vykon, min.gpu, dop.gpu), dop.gpuText || min.gpuText],
      ["Procesor", cpu?.nazev, H.porovnej(cpu?.vykon, min.cpu, dop.cpu), dop.cpuText || min.cpuText],
      ["Paměť RAM", ram ? `${ram} GB` : "", H.porovnej(ram, min.ram, dop.ram, 1), dop.ram ? `${dop.ram} GB` : min.ram ? `${min.ram} GB` : ""],
    ];
    const zname = casti.map((c) => c[2]).filter(Boolean);
    const celkem = !zname.length ? null : zname.includes("ne") ? "ne" : zname.includes("min") ? "min" : "dop";
    return `<div class="hw-vysledek hw-${celkem ? VERDIKT[celkem][1] : "nevim"}">
      <p class="hw-verdikt">${celkem === "dop" ? "Mělo by to jet i na doporučené nastavení." : celkem === "min" ? "Mělo by to jet, spíš na nižší nastavení." : celkem === "ne" ? "Některá část nejspíš nestačí." : "Z požadavků hry jsme nedokázali nic porovnat."}</p>
      <ul>${casti.map(([nazev, moje, v, pozad]) => `<li><b>${nazev}</b> <span>${moje ? esc(moje) : `<span class="dim">nezadáno</span>`}</span>
        <i class="hw-${v ? VERDIKT[v][1] : "nevim"}">${v ? VERDIKT[v][0] : "nevíme"}</i>${pozad ? `<small class="dim">hra chce: ${esc(pozad)}</small>` : ""}</li>`).join("")}</ul>
      ${zname.length < 3 ? `<p class="dim">„Nevíme“ = tvoje komponenta nebo text požadavků není v naší tabulce, nebo jsi ji nezadal.</p>` : ""}</div>`;
  }
  function formularPc(pc, H) {
    return `<form class="pc-form" autocomplete="off">
      <label>Grafická karta<input name="gpu" list="hw-gpu" value="${esc(pc.gpu || "")}" placeholder="např. RTX 3060, RX 6600, GTX 1060"></label>
      <label>Procesor<input name="cpu" value="${esc(pc.cpu || "")}" placeholder="např. i5-12400, Ryzen 5 5600"></label>
      <label>Paměť RAM (GB)<input name="ram" type="number" min="1" max="256" inputmode="numeric" value="${esc(pc.ram || "")}" placeholder="16"></label>
      <datalist id="hw-gpu">${H.GPU.map((g) => `<option value="${esc(g.nazev)}">`).join("")}</datalist>
      <button type="submit">Uložit můj počítač</button>
      <p class="dim pc-pozn">Ukládá se jen v tvém prohlížeči, nikam to neposíláme. Nevíš? Windows: Start → „Správce úloh“ → Výkon.</p></form>`;
  }
  function napojFormularPc(el, poUlozeni) {
    el.querySelector(".pc-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      ulozPc({ gpu: String(f.get("gpu") || "").slice(0, 60), cpu: String(f.get("cpu") || "").slice(0, 60), ram: Math.min(256, Math.max(0, parseInt(f.get("ram"), 10) || 0)) || "" });
      poUlozeni();
    });
  }
  async function strankaRozjede() {
    nastavTitulek("Rozjede se mi to? – porovnání počítače s požadavky hry");
    const q = new URLSearchParams(location.search);
    const id = /^\d{1,10}$/.test(q.get("hra") || "") ? q.get("hra") : "";
    app.innerHTML = `${hubHry("rozjede-se", "Rozjede se mi to?", "")}${kostra(3)}`;
    let H;
    try { H = await nactiHw(); } catch { app.innerHTML = `${hubHry("rozjede-se", "Rozjede se mi to?", "")}<p class="empty">Nástroj se nepodařilo načíst. Zkus obnovit stránku.</p>`; return; }
    let hra = null;
    if (id) { try { hra = await nacti("hra-steam/" + id); } catch {} }
    if (!location.pathname.startsWith("/rozjede-se")) return;
    const pc = mujPc();
    const poz = hra?.info?.steam?.pozadavky;
    app.innerHTML = `${hubHry("rozjede-se", "Rozjede se mi to?", "Zadej svůj počítač jednou a u každé hry hned uvidíš, jestli na ni stačí. Porovnáváme s požadavky, které hra uvádí na Steamu.")}
      <div class="rozjede">
        <section><h2 class="h-maly">1. Tvůj počítač</h2>${formularPc(pc, H)}</section>
        <section><h2 class="h-maly">2. Hra</h2>
          <form class="hledat-hru" role="search"><input id="q-hw" type="search" placeholder="Název hry, např. Cyberpunk 2077" autocomplete="off" maxlength="60" aria-label="Název hry"><button type="submit">Hledat</button></form>
          <div id="hw-nalez"></div>
          ${hra ? `<div class="hw-hra">${https(hra.info?.steam?.obrazek) ? `<img src="${esc(hra.info.steam.obrazek)}" alt="" referrerpolicy="no-referrer">` : ""}<a href="/hra/steam/${esc(id)}"><b>${esc(hra.nazev || hra.info?.steam?.nazev || "")}</b></a></div>
            ${poz && (poz.min.length || poz.dop.length) ? (pc.gpu || pc.cpu || pc.ram ? vyhodnotHw(H, pc, poz) : `<p class="dim">Vyplň vlevo svůj počítač a ulož ho.</p>`) : `<p class="dim">Tahle hra na Steamu neuvádí požadavky pro PC.</p>`}` : `<p class="dim">Vyhledej hru a vyber ji ze seznamu.</p>`}
        </section>
      </div>
      <p class="source-note">Výsledek je orientační. Výkon grafik a procesorů porovnáváme podle tabulky sestavené z veřejných herních testů (průměry);
        skutečný výkon závisí na rozlišení, nastavení, ovladačích i chlazení. U požadavků „A / B“ stačí splnit jednu z možností.</p>`;
    napojFormularPc(app, () => { strankaRozjede().then(() => obarvi(app)); achievement("Uloženo", "Tvůj počítač si pamatujeme v tomhle prohlížeči."); });
    app.querySelector(".hledat-hru").addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = document.getElementById("q-hw").value.trim();
      const out = document.getElementById("hw-nalez");
      if (v.length < 2) return;
      out.innerHTML = kostra(2);
      try {
        const r = await nacti(`cestina?q=${enc(v)}`);
        out.innerHTML = (r.hry || []).length ? `<div class="hw-nalez">${r.hry.slice(0, 8).map((h) => `<a href="/rozjede-se?hra=${esc(h.id)}">${esc(h.nazev)}</a>`).join("")}</div>` : `<p class="dim">Nic jsme nenašli.</p>`;
      } catch { out.innerHTML = `<p class="dim">Hledání teď nefunguje, zkus to za chvíli.</p>`; }
    });
  }

  // ---------- Vyšší, nebo nižší? (denní minihra) ----------
  // Stejné pořadí pro všechny v daný den (náhoda ze semínka = datum), ať se dá porovnat skóre s kamarády.
  function nahodaZeDne(den) {
    let x = [...den].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
    return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  }
  const KOL = 10;
  async function strankaVyssiNizsi() {
    nastavTitulek("Vyšší, nebo nižší? – denní herní minihra");
    app.innerHTML = `${hubHry("vyssi-nizsi", "Vyšší, nebo nižší?", "")}${kostra(2)}`;
    let d;
    try { d = await nacti("vyssi-nizsi"); } catch { d = { sady: {} }; }
    if (!location.pathname.startsWith("/vyssi-nizsi")) return;
    const sady = Object.entries(d.sady || {}).filter(([, s]) => (s.hry || []).length >= 6);
    if (!sady.length) { app.innerHTML = `${hubHry("vyssi-nizsi", "Vyšší, nebo nižší?", "")}<p class="empty">Hra potřebuje čerstvá data – zkus to za chvíli.</p>`; return; }
    const volba = new URLSearchParams(location.search).get("sada");
    const [klic, sada] = sady.find(([k]) => k === volba) || sady[0];
    // Sestavení dvojic: řetěz náhodně zamíchaných her, sousedi s různou hodnotou.
    const rnd = nahodaZeDne(d.den + klic);
    const hry = [...sada.hry].sort(() => rnd() - 0.5);
    const kola = [];
    for (let i = 0; i + 1 < hry.length && kola.length < KOL; i++) if (hry[i].hodnota !== hry[i + 1].hodnota) kola.push([hry[i], hry[i + 1]]);
    const ulozKlic = `hp_vn_${d.den}_${klic}`;
    let stav; try { stav = JSON.parse(localStorage.getItem(ulozKlic) || "null"); } catch {}
    stav = stav && Array.isArray(stav.odpovedi) ? stav : { odpovedi: [] };
    let rekord = 0; try { rekord = Number(localStorage.getItem(`hp_vn_rekord_${klic}`)) || 0; } catch {}
    const karta = (h, ukazat) => `<div class="vn-hra">${https(h.obrazek) ? `<img src="${esc(h.obrazek)}" alt="" referrerpolicy="no-referrer">` : `<div class="vn-bez">${esc(h.nazev[0])}</div>`}
      <b>${esc(h.nazev)}</b>${ukazat ? `<span class="vn-cislo">${esc(num(h.hodnota))}<small>${esc(sada.jednotka)}</small></span>` : `<span class="vn-cislo vn-skryte">?</span>`}</div>`;
    const vykresli = () => {
      const k = stav.odpovedi.length, body = stav.odpovedi.filter(Boolean).length, konec = k >= kola.length;
      const [a, b] = kola[Math.min(k, kola.length - 1)];
      app.innerHTML = `${hubHry("vyssi-nizsi", "Vyšší, nebo nižší?", "Denní minihra se skutečnými čísly. Každý den nové kolo – stejné pro všechny, ať můžeš porovnat skóre s kamarády.")}
        ${sady.length > 1 ? `<div class="mini-seg">${sady.map(([kk, s]) => `<a class="ms-b${kk === klic ? " on" : ""}" href="/vyssi-nizsi?sada=${kk}">${esc(s.nazev)}</a>`).join("")}</div>` : ""}
        <div class="vn" aria-live="polite">
          <div class="vn-stav"><span>Kolo ${Math.min(k + 1, kola.length)} / ${kola.length}</span><span>Skóre <b>${body}</b></span>${rekord ? `<span class="dim">rekord ${rekord}</span>` : ""}</div>
          ${konec ? `<div class="vn-konec"><p class="vn-velke">${body} / ${kola.length}</p>
              <p>${body === kola.length ? "Perfektní! Tohle se povede málokomu." : body >= kola.length * 0.7 ? "Výborně, máš přehled." : body >= kola.length * 0.4 ? "Slušné. Zítra to dáš líp." : "Čísla umí překvapit. Zítra nové kolo!"}</p>
              <p class="vn-tecky">${stav.odpovedi.map((x) => (x ? "🟩" : "🟥")).join("")}</p>
              <div class="vyd-akce"><button type="button" class="btn-maly" id="vn-sdilet">Sdílet výsledek</button> ${tlacitkoObrazek("vn-obr")}</div></div>`
            : `<p class="vn-otazka">${esc(sada.otazka)}</p>
              <div class="vn-dvojice">${karta(a, true)}<span class="vn-vs">vs</span>${karta(b, false)}</div>
              <p class="vn-otazka-mala">Má <b>${esc(b.nazev)}</b> víc, nebo míň než <b>${esc(a.nazev)}</b>?</p>
              <div class="vn-tlacitka"><button type="button" data-vn="1">▲ Víc</button><button type="button" data-vn="0">▼ Míň</button></div>`}
        </div>
        <p class="source-note">Čísla: ${esc(sada.zdroj)}.</p>`;
      app.querySelectorAll("[data-vn]").forEach((t) => t.onclick = () => {
        const vic = t.dataset.vn === "1", spravne = vic === (b.hodnota > a.hodnota);
        app.querySelectorAll("[data-vn]").forEach((x) => (x.disabled = true));
        const skryte = app.querySelector(".vn-skryte");
        if (skryte) { skryte.classList.remove("vn-skryte"); skryte.classList.add(spravne ? "vn-dobre" : "vn-spatne"); skryte.innerHTML = `${esc(num(b.hodnota))}<small>${esc(sada.jednotka)}</small>`; }
        stav.odpovedi.push(spravne);
        try { localStorage.setItem(ulozKlic, JSON.stringify(stav)); } catch {}
        if (stav.odpovedi.length >= kola.length) {
          const body = stav.odpovedi.filter(Boolean).length;
          if (body > rekord) { rekord = body; try { localStorage.setItem(`hp_vn_rekord_${klic}`, String(body)); } catch {} }
        }
        setTimeout(vykresli, malyPohyb() ? 300 : 1100);
      });
      const text = () => `Vyšší, nebo nižší? (${sada.nazev}) ${new Date(d.den + "T12:00:00Z").toLocaleDateString(LOC)}: ${stav.odpovedi.filter(Boolean).length}/${kola.length}\n${stav.odpovedi.map((x) => (x ? "🟩" : "🟥")).join("")}\n${location.origin}/vyssi-nizsi`;
      const bs = document.getElementById("vn-sdilet");
      if (bs) bs.onclick = async () => {
        try { if (navigator.share) await navigator.share({ text: text() }); else { await navigator.clipboard.writeText(text()); achievement("Zkopírováno", "Výsledek máš ve schránce."); } } catch {}
      };
      const bo = document.getElementById("vn-obr");
      if (bo) bo.onclick = () => sdilejObrazek({ stitek: "Vyšší, nebo nižší?", nadpis: `${stav.odpovedi.filter(Boolean).length} z ${kola.length}`, odkaz: "/vyssi-nizsi",
        radky: [[sada.nazev, new Date(d.den + "T12:00:00Z").toLocaleDateString(LOC)], [stav.odpovedi.map((x) => (x ? "✓" : "✗")).join(" "), "moje odpovědi"]] });
    };
    vykresli();
  }

  // Odpočet: „12 d 4 h“, pod 1 den „4 h 03 min“, pod 1 h „12 min 05 s“.
  function odpocet(ms) {
    if (ms <= 0) return "teď";
    const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1e3);
    if (d) return `${d} d ${h} h ${String(m).padStart(2, "0")} min`;
    if (h) return `${h} h ${String(m).padStart(2, "0")} min ${String(s).padStart(2, "0")} s`;
    return `${m} min ${String(s).padStart(2, "0")} s`;
  }
  let tikac = null;
  function spustOdpocty() {
    clearInterval(tikac);
    const tik = () => {
      const el = document.querySelectorAll("[data-odpocet]");
      if (!el.length) { clearInterval(tikac); return; }
      el.forEach((e) => { e.textContent = odpocet(Date.parse(e.dataset.odpocet) - Date.now()); });
    };
    tik(); tikac = setInterval(tik, 1000);
  }
  const datumCasCz = (iso, celodenni) => new Date(iso).toLocaleString(LOC, celodenni ? { day: "numeric", month: "numeric", year: "numeric" } : { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const TYP_AKCE = { vyprodej: "Výprodej", festival: "Festival her", prenos: "Přenos", vystava: "Veletrh" };
  const kartaTraileru = (v) => `<a class="hk vk" href="${esc(bezpecnaUrl(v.url))}" target="_blank" rel="noopener noreferrer">
      <div class="hk-obr vk-obr">${https(v.nahled) ? `<img src="${esc(v.nahled)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="obchod ob-yt">YouTube</span></div>
      <div class="hk-t"><b>${esc(v.nazev)}</b><span class="hk-hraci">${esc(v.studio_nazev)} · ${esc(kdy(new Date(v.cas)))}</span></div></a>`;
  const radekZpravy = (z, sStudiem = true) => `<a class="rec zpr-studio" href="${esc(bezpecnaUrl(z.url))}" target="_blank" rel="noopener noreferrer">
      ${https(z.nahled) ? `<img src="${esc(z.nahled)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="rec-bez zpr-ikona">${z.druh === "steam" ? "Steam" : "Blog"}</div>`}
      <div><b>${esc(z.nazev)}</b><span class="dim">${sStudiem ? `${esc(z.studio_nazev)} · ` : ""}${z.hra ? `${esc(z.hra)} · ` : ""}${z.druh === "steam" ? "oznámení na Steamu" : "oficiální blog"} · ${esc(kdy(new Date(z.cas)))}</span></div></a>`;

  // Kalendář vydání
  // IGDB i Steam znají u vydání jen DEN, ne hodinu (tu určuje vývojář a Steam ji v API nedává).
  // Proto žádný odpočet na minuty – jen „dnes / zítra / za N dní“. Datum je půlnoc UTC → bere se kalendářní den v UTC.
  const datumVydani = (iso) => new Date(iso).toLocaleDateString(LOC, { timeZone: "UTC" });
  function dnyDoVydani(iso) {
    const den = new Date(iso).toISOString().slice(0, 10);
    const dnes = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
    const n = Math.round((Date.parse(den + "T12:00:00Z") - Date.parse(dnes + "T12:00:00Z")) / 864e5);
    return n <= 0 ? (n === 0 ? "vychází dnes" : "už vyšlo") : n === 1 ? "vychází zítra" : `vychází za ${pl(n, "den", "dny", "dní")}`;
  }
  async function strankaVydani() {
    nastavTitulek("Kalendář vydání her – co vychází a jestli bude česky");
    const f = new URLSearchParams(location.search).get("f") || "vse";
    app.innerHTML = `${hubHry("vydani", "Kalendář vydání her", "Výběr populárních her z IGDB: co vychází, kdy a na čem – a jestli bude hra v češtině.")}${kostra(6)}`;
    let d;
    try { d = await nacti("vydani"); } catch { d = { hry: [] }; }
    if (!location.pathname.startsWith("/vydani")) return;
    const vsechny = d.hry || [];
    // Výchozí pohled = jen opravdu nové hry. Porty starších her a plné verze po předběžném přístupu mají vlastní záložku.
    let hry = f === "porty" ? vsechny.filter((h) => h.uz_vyslo) : vsechny.filter((h) => !h.uz_vyslo);
    if (f === "cz") hry = hry.filter((h) => h.cestina > 0);
    if (f === "presne") hry = hry.filter((h) => h.presne);
    const pocetPortu = vsechny.filter((h) => h.uz_vyslo).length;
    const mesice = new Map();
    for (const h of hry) {
      const k = h.presne || /^[A-Za-z]{3} \d{4}$/.test(h.human) ? new Date(h.datum).toLocaleDateString(LOC, { month: "long", year: "numeric" }) : (h.human || "Termín neznámý");
      (mesice.get(k) || mesice.set(k, []).get(k)).push(h);
    }
    const czTxt = (h) => h.cestina === 2 ? `<span class="cz cz-dabing">CZ dabing</span>` : h.cestina === 1 ? `<span class="cz">CZ texty</span>`
      : h.cestina === 0 ? `<span class="cz cz-ne">bez češtiny</span>` : `<span class="cz cz-nevim">čeština zatím neoznámena</span>`;
    app.innerHTML = `${hubHry("vydani", "Kalendář vydání her", "Výběr populárních her z IGDB: co vychází, kdy a na čem – a jestli bude hra v češtině.")}
      <div class="mini-seg cz-filtry" role="group">${[["vse", "Nové hry"], ["cz", "Jen s češtinou"], ["presne", "Jen s přesným datem"], ["porty", `Nové platformy a plné verze${pocetPortu ? ` (${pocetPortu})` : ""}`]].map(([k, v]) =>
        `<a class="ms-b${k === f ? " on" : ""}" href="/vydani${k === "vse" ? "" : `?f=${k}`}">${v}</a>`).join("")}</div>
      ${hry.length ? [...mesice].map(([m, list]) => `<div class="section-title">${esc(m.charAt(0).toUpperCase() + m.slice(1))}</div>
        <div class="vydani">${list.map((h) => `<div class="vyd">
          ${https(h.obrazek) ? `<img class="vyd-obr" src="${esc(h.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="vyd-obr"></div>`}
          <div class="vyd-t">${h.steam_id ? `<a href="/hra/steam/${esc(h.steam_id)}"><b>${esc(h.nazev)}</b></a>` : dbOdkaz(h.igdb) ? `<a href="${esc(dbOdkaz(h.igdb))}"><b>${esc(h.nazev)}</b></a>` : `<b>${esc(h.nazev)}</b>`}
            <span class="vyd-datum">${h.presne ? esc(datumVydani(h.datum)) : esc(h.human)}${h.presne ? ` · ${esc(dnyDoVydani(h.datum))}` : ""}</span>
            ${h.uz_vyslo ? `<p class="vyd-uz">${h.prvni ? `Hra už vyšla ${esc(new Date(h.prvni).toLocaleDateString(LOC))}` : "Hra už je k dispozici na Steamu"}${h.prvni && h.na_steamu ? " a je k dispozici na Steamu" : ""}. Tady jde o vydání ${(h.platformy || []).length ? `pro ${esc((h.platformy || []).join(", "))}` : "pro další platformu"}${/early|předběž/i.test(h.stav) ? "" : " nebo plnou verzi"}.</p>` : ""}
            <div class="hrad-meta">${czTxt(h)}${h.cestina_zdroj ? `<span class="dim vyd-zdroj">${esc(h.cestina_zdroj)}</span>` : ""}${(h.platformy || []).map((p) => `<span class="plat">${esc(p)}</span>`).join("")}</div>
            <div class="vyd-akce">${h.steam ? `<a class="btn-maly" href="${esc(bezpecnaUrl(h.steam))}" target="_blank" rel="noopener noreferrer">Steam</a>` : ""}
              ${dbOdkaz(h.igdb) ? `<a class="btn-maly" href="${esc(dbOdkaz(h.igdb))}">Profil hry</a>` : ""}${h.igdb ? `<a class="btn-maly" href="${esc(bezpecnaUrl(h.igdb))}" target="_blank" rel="noopener noreferrer">IGDB</a>` : ""}
              ${h.steam_id ? tlacitkoHlidat({ id: h.steam_id, nazev: h.nazev }) : ""}</div></div></div>`).join("")}</div>`).join("")
        : `<p class="empty">${d.cas ? "Žádná hra neodpovídá filtru." : "Kalendář se načítá z databáze IGDB – zkus to za chvíli."}</p>`}
      <p class="source-note">Termíny a platformy: databáze <a href="https://www.igdb.com/" target="_blank" rel="noopener noreferrer">IGDB.com</a> (Twitch), jen hry, na které se hráči těší. Hry, které už dřív vyšly jinde nebo v předběžném přístupu (podle IGDB nebo Steamu), jsou v záložce „Nové platformy a plné verze“. Čeština podle seznamu jazyků na Steamu, jinak podle IGDB. Termíny se můžou změnit – vývojáři hry často odkládají.${d.cas ? ` Aktualizováno ${esc(kdy(new Date(d.cas)))}.` : ""}</p>`;
    obarvi(app); spustOdpocty();
  }

  // Akce a odpočty
  async function strankaAkce() {
    nastavTitulek("Herní akce s odpočtem – výprodeje, přenosy, veletrhy");
    app.innerHTML = `${hubHry("akce", "Akce a odpočty", "Výprodeje, herní přenosy a veletrhy – s přesným odpočtem podle oficiálních termínů.")}${kostra(4)}`;
    let d;
    try { d = await nacti("akce"); } catch { d = { akce: [], prenosy: [], predplatne: [] }; }
    if (!location.pathname.startsWith("/akce")) return;
    app.innerHTML = `${hubHry("akce", "Akce a odpočty", "Výprodeje, herní přenosy a veletrhy – s přesným odpočtem podle oficiálních termínů.")}
      <div class="akce">${d.akce.map((a) => `<div class="akce-k akce-${esc(a.typ)}${a.bezi ? " bezi" : ""}">
          <a class="akce-obr" href="${esc(bezpecnaUrl(a.web))}" target="_blank" rel="noopener noreferrer"><img src="${esc(https(a.obrazek) || `/og/akce-${a.typ}.png`)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>
          <span class="akce-typ">${esc(TYP_AKCE[a.typ] || a.typ)}</span>
          <h3>${esc(a.nazev)}</h3>
          <p class="akce-cas">${a.bezi ? `Právě probíhá · končí za <b data-odpocet="${esc(a.do)}"></b>` : `Začíná za <b data-odpocet="${esc(a.od)}"></b>`}</p>
          <p class="dim">${esc(datumCasCz(a.od, a.celodenni))}${a.do ? ` – ${esc(datumCasCz(a.do, a.celodenni))}` : ""}${a.misto ? ` · ${esc(a.misto)}` : ""}</p>
          <p>${esc(a.popis)}</p>
          <div class="vyd-akce"><a class="btn-maly" href="${esc(bezpecnaUrl(a.web))}" target="_blank" rel="noopener noreferrer">Oficiální web</a>
            <a class="dim akce-zdroj" href="${esc(bezpecnaUrl(a.zdroj))}" target="_blank" rel="noopener noreferrer">zdroj termínu</a></div></div>`).join("")}
        ${d.epic ? `<div class="akce-k akce-epic">${https(d.epic.obrazek) ? `<a class="akce-obr" href="${esc(bezpecnaUrl(d.epic.url))}" target="_blank" rel="noopener noreferrer"><img src="${esc(d.epic.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>` : ""}<span class="akce-typ">Hra zdarma</span><h3>${esc(d.epic.nazev)}</h3>
          <p class="akce-cas">Zdarma na Epicu za <b data-odpocet="${esc(d.epic.od)}"></b></p><p class="dim">${esc(datumCasCz(d.epic.od))}</p>
          <div class="vyd-akce"><a class="btn-maly" href="${esc(bezpecnaUrl(d.epic.url))}" target="_blank" rel="noopener noreferrer">Obchod Epic</a></div></div>` : ""}</div>
      <div class="section-title">Ohlášené přenosy</div>
      ${d.prenosy.length ? `<div class="rec-list">${d.prenosy.map((z) => radekZpravy(z)).join("")}</div>` : `<p class="dim">Až PlayStation, Xbox nebo Nintendo ohlásí přenos (State of Play, Nintendo Direct, Showcase), objeví se tady z jejich oficiálních kanálů.</p>`}
      <div class="section-title">Předplatné: PS Plus a Game Pass</div>
      ${d.predplatne.length ? `<div class="rec-list">${d.predplatne.map((z) => radekZpravy(z)).join("")}</div>` : `<p class="dim">Novinky o hrách v PlayStation Plus a Xbox Game Pass se načítají z oficiálních blogů PlayStation a Xbox.</p>`}
      <p class="source-note">Termíny akcí jen podle oficiálních oznámení pořadatelů (u každé je odkaz na zdroj). Časy jsou v našem časovém pásmu. Přenosy a předplatné z oficiálních blogů a kanálů platforem.</p>`;
    spustOdpocty();
  }

  // Studia
  const VLAJKY = { CZ: "🇨🇿", US: "🇺🇸", JP: "🇯🇵", PL: "🇵🇱", FR: "🇫🇷", SE: "🇸🇪", BE: "🇧🇪", KR: "🇰🇷", GB: "🇬🇧" };
  async function strankaStudia() {
    nastavTitulek("Herní studia a platformy – novinky a trailery");
    const f = new URLSearchParams(location.search).get("f") || "vse";
    app.innerHTML = `${hubHry("studia", "Studia a platformy", "Oficiální novinky, trailery a oznámení přímo od tvůrců her.")}${kostra(5)}`;
    let d;
    try { d = await nacti("studia"); } catch { d = { studia: [], videa: [], zpravy: [] }; }
    if (location.pathname.replace(/\/+$/, "") !== "/studia") return;
    const studia = d.studia.filter((s) => f === "cz" ? s.cz : f === "platformy" ? s.typ === "platforma" : true);
    app.innerHTML = `${hubHry("studia", "Studia a platformy", "Oficiální novinky, trailery a oznámení přímo od tvůrců her.")}
      <div class="mini-seg cz-filtry" role="group">${[["vse", "Všechna"], ["cz", "Česká studia"], ["platformy", "Platformy"]].map(([k, v]) =>
        `<a class="ms-b${k === f ? " on" : ""}" href="/studia${k === "vse" ? "" : `?f=${k}`}">${v}</a>`).join("")}</div>
      <div class="studia">${studia.map((s) => `<a class="studio-k" href="/studio/${esc(s.slug)}">
          ${https(s.nahled?.obrazek) ? `<div class="studio-obr"><img src="${esc(s.nahled.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>` : ""}
          <div class="studio-h">${ikonaStudia(s)}<div><b>${esc(s.nazev)}</b>
          <span class="dim">${VLAJKY[s.zeme] || ""} ${s.typ === "platforma" ? "platforma" : s.typ === "vydavatel" ? "vydavatel" : "studio"}${s.polozek ? ` · ${pl(s.polozek, "novinka", "novinky", "novinek")}` : ""}</span></div></div>
          <p>${esc(s.popis)}</p></a>`).join("")}</div>
      ${d.videa.length ? `<div class="section-title">Nejnovější trailery a videa</div><div class="regal">${d.videa.map(kartaTraileru).join("")}</div>` : ""}
      ${d.zpravy.length ? `<div class="section-title">Oficiální novinky a oznámení</div><div class="rec-list">${d.zpravy.map((z) => radekZpravy(z)).join("")}</div>`
        : `<p class="dim">Novinky studií se načítají postupně – každé studio zhruba jednou za 3 hodiny.</p>`}
      <p class="source-note">Jen oficiální zdroje: YouTube kanály studií (ověřené podle názvu kanálu), jejich blogy a oznámení vývojářů na Steamu. Kliknutím otevřeš originál.</p>`;
  }
  // Logo/ikona studia z jeho oficiálního webu (apple-touch-icon / icon); když není, první písmeno.
  const ikonaStudia = (s, velke = false) => https(s.nahled?.ikona)
    ? `<span class="studio-ini studio-logo${velke ? " velke" : ""}"><img src="${esc(s.nahled.ikona)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`
    : `<span class="studio-ini${velke ? " velke" : ""}" aria-hidden="true">${esc(s.nazev[0])}</span>`;
  async function strankaStudio(slug) {
    app.innerHTML = kostra(5);
    let s;
    try { s = await nacti("studio/" + enc(slug)); } catch { stranka404(); return; }
    nastavTitulek(`${s.nazev} – novinky, trailery a hry`);
    const videa = s.polozky.filter((p) => p.druh === "video"), zpravy = s.polozky.filter((p) => p.druh !== "video");
    app.innerHTML = `<div class="profile"><a class="back" href="/studia">← Studia a platformy</a>
      <div class="studio-hlava">${ikonaStudia(s, true)}
        <div><h1 class="m0">${esc(s.nazev)}</h1><p class="dim">${VLAJKY[s.zeme] || ""} ${esc(s.popis)}</p></div></div>
      <div class="vyd-akce"><a class="btn-maly" href="${esc(bezpecnaUrl(s.web))}" target="_blank" rel="noopener noreferrer">Oficiální web</a>
        ${s.youtube ? `<a class="btn-maly" href="${esc(bezpecnaUrl(s.youtube))}" target="_blank" rel="noopener noreferrer">YouTube</a>` : ""}</div>
      ${s.nahled && (https(s.nahled.obrazek) || s.nahled.popis) ? `<a class="web-nahled" href="${esc(bezpecnaUrl(s.web))}" target="_blank" rel="noopener noreferrer">
        ${https(s.nahled.obrazek) ? `<img src="${esc(s.nahled.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
        <div><span class="dim">${esc(new URL(s.web).hostname)}</span><b>${esc(s.nahled.titulek || s.nazev)}</b>${s.nahled.popis ? `<p>${esc(s.nahled.popis)}</p>` : ""}<span class="btn-maly">Otevřít web studia</span></div></a>` : ""}
      ${videa.length ? `<div class="section-title">Trailery a videa</div><div class="regal">${videa.map(kartaTraileru).join("")}</div>` : ""}
      <div class="section-title">Novinky a oznámení</div>
      ${zpravy.length ? `<div class="rec-list">${zpravy.map((z) => radekZpravy(z, false)).join("")}</div>` : `<p class="dim">Zatím nic – oficiální zdroje se kontrolují zhruba jednou za 3 hodiny.</p>`}
      ${s.hry.length ? `<div class="section-title">Hry</div><div class="chyba-odkazy">${s.hry.map((h) => `<a class="btn-maly" href="${esc(bezpecnaUrl(h.url))}" target="_blank" rel="noopener noreferrer">${esc(h.hra)}</a>`).join("")}</div>` : ""}
      <p class="source-note">Obsah pochází z oficiálních kanálů studia (YouTube, blog, oznámení na Steamu) a vede na originál.</p></div>`;
  }

  // ---------- Stránka nenalezena (odkaz uvnitř webu) ----------
  function stranka404() {
    nastavTitulek("Stránka nenalezena");
    app.innerHTML = `<div class="chyba-stranka"><p class="chyba-kod" aria-hidden="true">404</p><h1>Tuhle stránku AI nenašla</h1>
      <p class="perex">Odkaz je asi starý nebo má překlep. Zkus začít tady:</p>
      <div class="chyba-odkazy"><a class="btn-maly" href="/">Domů – hry zdarma a slevy</a><a class="btn-maly" href="/novinky">Herní novinky</a>
      <a class="btn-maly" href="/zive">Kdo je živě</a><a class="btn-maly" href="/cestina">Má to češtinu?</a></div></div>`;
  }

  // ---------- Stav systému a deník AI ----------
  const STAV_TXT = { ok: ["Běží", "st-ok"], zpozdeni: ["Zpožděno", "st-pozor"], stoji: ["Stojí", "st-chyba"], chyba: ["Chyba", "st-chyba"], neznamy: ["Čeká na první běh", "st-nic"] };
  async function strankaStav() {
    nastavTitulek("Stav systému a deník AI");
    app.innerHTML = `<div class="cesko-head"><h1>Stav systému a deník AI</h1></div>${kostra(5)}`;
    let d;
    try { d = await nacti("stav-systemu"); } catch { app.innerHTML = `<p class="empty">Stav se nepodařilo načíst.</p>`; return; }
    if (location.pathname.replace(/\/+$/, "") !== "/stav") return;
    app.innerHTML = `<a class="back" href="/">← Domů</a><div class="cesko-head"><h1>Stav systému a deník AI</h1>
        <p>Web provozuje AI. Tady je vidět, co právě dělá a jestli všechno běží – bez přikrášlování, včetně chyb.</p></div>
      <div class="stav-souhrn ${d.vse_ok ? "st-ok" : "st-pozor"}"><span class="ai-jadro" aria-hidden="true"></span>
        <b>${d.vse_ok ? "Všechno běží" : "Něco nejede, jak má"}</b><span>kontrola ${esc(hhmm(d.cas))}</span></div>
      <div class="stav-ulohy">${d.ulohy.map((u) => { const [t, c] = STAV_TXT[u.stav] || STAV_TXT.neznamy; return `<div class="stav-u">
          <div class="stav-u-h"><b>${esc(u.nazev)}</b><span class="stav-st ${c}">${t}</span></div>
          <p>${esc(u.text || (u.interval == null ? "Běží jen v nastavené hodiny." : "Zatím bez záznamu."))}</p>
          <span class="dim">${u.posledni ? `naposledy ${esc(kdy(new Date(u.posledni)))}` : ""}${u.interval ? ` · každých ${Number(u.interval) || 0} min` : ""}${u.chyb24 ? ` · ${pl(u.chyb24, "chyba", "chyby", "chyb")} za 24 h` : ""}</span></div>`; }).join("")}</div>
      <div class="section-title">Deník AI</div>
      ${d.denik.length ? `<ol class="denik">${d.denik.map((z) => `<li class="${z.ok ? "" : "dn-chyba"}"><time>${esc(hhmm(z.cas))}</time>
          <div><b>${esc(z.nazev)}</b><span>${esc(z.text)}</span></div></li>`).join("")}</ol>` : `<p class="dim">Deník se začne plnit s prvním během úloh (do 15 minut).</p>`}
      <p class="source-note">Každá automatická úloha po doběhnutí zapíše jednu větu, co udělala. Deník se drží 7 dní.</p>`;
  }

  // ---------- Aplikace na plochu (PWA) ----------
  let instalace = null;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); instalace = e; document.querySelectorAll(".instalovat").forEach((b) => b.hidden = false); });
  document.querySelectorAll(".instalovat").forEach((b) => b.addEventListener("click", async () => {
    if (!instalace) return;
    instalace.prompt();
    const { outcome } = await instalace.userChoice.catch(() => ({}));
    if (outcome === "accepted") achievement("Nainstalováno", "Herní puls najdeš na ploše.");
    instalace = null; b.hidden = true;
  }));
  if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

  // Jemné 3D naklonění karet za kurzorem (jen počítač s myší).
  if (matchMedia("(pointer: fine)").matches) {
    document.addEventListener("pointermove", (e) => {
      if (malyPohyb()) return;
      const k = e.target.closest?.(".live-card, .card, .srow");
      document.querySelectorAll(".tilt").forEach((x) => { if (x !== k) { x.classList.remove("tilt"); x.style.transform = ""; } });
      if (!k) return;
      const r = k.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      k.classList.add("tilt");
      k.style.transform = `perspective(800px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg) translateY(-2px)`;
      k.style.setProperty("--mx", `${(x + 0.5) * 100}%`); k.style.setProperty("--my", `${(y + 0.5) * 100}%`);
    });
  }

  const datum = (c) => new Date(c.datum || Date.now());
  function kdy(d) {
    const m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return "právě teď";
    if (m < 60) return `před ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `před ${h} h`;
    return d.toLocaleDateString(LOC);
  }
  const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

  async function nacti(cesta) {
    const r = await fetch(`${C.api || "/api"}/${cesta}`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  function nastavTitulek(t) { document.title = t ? `${t} | ${C.nazev || "Herní puls"}` : `${C.nazev || "Herní puls"} – herní novinky a čeští streameři`; }

  // ---------- Články ----------
  function cover(c, glyph) {
    const [a, b] = c.barva || ["#444", "#111"];
    const img = https(c.obrazek) ? `<img class="cover-img" src="${esc(c.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "";
    return `<div class="cover" data-a="${esc(a)}" data-b="${esc(b)}"><span class="glyph">${esc(glyph)}</span>${img}<span class="type">${esc(c.typ || "")}</span></div>`;
  }
  const pfs = (list) => (list || []).map((p) => `<span class="pf pf-${esc(p)}">${esc(p)}</span>`).join("");

  // Bezpečné vykreslení jednoduchého formátování: odstavce, ## mezititulky, **tučně**, [odkaz](https://…).
  function md(text) {
    const inline = (t) => esc(t)
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer nofollow">$1</a>');
    return String(text || "").replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
      .map((b) => b.startsWith("## ") ? `<h2>${inline(b.slice(3))}</h2>` : `<p>${inline(b).replace(/\n/g, "<br>")}</p>`).join("");
  }

  function kartaClanku(c, i) {
    return `<a class="card${i === 0 ? " hero" : ""}" href="/clanek/${esc(enc(c.id))}">
      ${cover(c, c.nadpis[0])}
      <div class="body"><h3>${esc(c.nadpis)}</h3><p>${esc(c.perex)}</p>
      <div class="meta">${c.vlastni ? `<span class="own">Herní puls</span>` : ""}${pfs(c.platformy)}<span>· ${c.vlastni ? "" : esc(c.zdroje?.[0]?.nazev || "") + " · "}${kdy(datum(c))}</span></div></div></a>`;
  }

  // ---------- Streameři ----------
  const PLAT = { twitch: "Twitch", kick: "Kick" };
  const kanalUrl = (s) => s.platforma === "kick" ? "https://kick.com/" + enc(s.login) : "https://www.twitch.tv/" + enc(s.login);
  const profilUrl = (s) => `/streamer/${enc(s.platforma || "twitch")}/${enc(s.login)}`;
  function av(s, velky = false) {
    const cls = `av${velky ? " av-l" : ""}${s.zive ? " av-live" : ""}`;
    return https(s.profilovka)
      ? `<img class="${cls}" src="${esc(s.profilovka)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<div class="${cls} av-text">${esc(String(s.jmeno || "?")[0])}</div>`;
  }
  const partner = (s) => s.partner ? `<span class="partner" title="Twitch partner" aria-label="Twitch partner">✓</span>` : "";
  const platBadge = (s) => `<span class="pbadge pb-${esc(s.platforma || "twitch")}">${esc(PLAT[s.platforma] || "Twitch")}</span>`;
  function delka(zacatek) {
    if (!zacatek) return "";
    const m = Math.max(0, Math.round((Date.now() - new Date(zacatek)) / 60000));
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  }

  // ---------- Tep (EKG monitor) – hlavní motiv webu Herní puls ----------
  // Kreslí se živě jako na skutečném monitoru: svítící bod jde zleva doprava, za sebou nechává stopu
  // a před sebou maže starou. Tvar úderu = součet vln P, Q, R, S, T (model ECGSYN). Každý úder je jiný:
  // proměnlivý rozestup (±12 %), výška a síla hrotu (±18 %), vlnění linky a drobný šum – srdce není metronom.
  // Tempo podle diváků: 0–1 ≈ 60/min, 10 ≈ 75, 100 ≈ 90, 1 000 ≈ 105, 10 000 ≈ 120 (strop 130).
  const tepZDivaku = (d) => Math.min(130, Math.round(60 + 15 * Math.log10((Number(d) || 0) + 1)));
  // Barva podle platformy: Kick zelená, Twitch fialová, „tep herního světa“ růžová (barva webu).
  const BARVY_EKG = { kick: ["#53fc18", "83,252,24"], twitch: ["#a970ff", "169,112,255"], web: ["#ff3d7f", "255,61,127"] };
  const ekg = (divaci, velka = false, platforma = "web") => `<div class="ekg ekg-${BARVY_EKG[platforma] ? platforma : "web"}${velka ? " ekg-velka" : ""}" data-divaci="${Number(divaci) || 0}" aria-hidden="true"><canvas></canvas><canvas class="ekg-hlava"></canvas></div>`;
  const VLNY_EKG = [[0.12, 0.17, 0.028], [-0.14, 0.335, 0.009], [1, 0.36, 0.011], [-0.26, 0.385, 0.011], [0.32, 0.62, 0.05]];
  const monitory = new Set();
  let smycka = 0, viditelne = null;
  function novyUder(m) {
    m.od += m.rr;
    m.rr = (60 / m.tep) * (1 + (Math.random() - 0.5) * 0.24);           // nepravidelný rozestup
    m.sila = 1 + (Math.random() - 0.5) * 0.36;                           // výška a síla hrotu
    m.tvar = [1 + (Math.random() - 0.5) * 0.4, 1 + (Math.random() - 0.5) * 0.3]; // vlna P a T
  }
  function hodnotaEkg(m, t) {
    while (t - m.od > m.rr) novyUder(m);
    const f = (t - m.od) / m.rr;
    let v = 0;
    VLNY_EKG.forEach(([a, mu, sg], i) => { v += a * (i === 0 ? m.tvar[0] : i === 4 ? m.tvar[1] : m.sila) * Math.exp(-((f - mu) ** 2) / (2 * sg * sg)); });
    return v + 0.03 * Math.sin(t * 1.3 + m.faze) + 0.015 * Math.sin(t * 0.4) + (Math.random() - 0.5) * 0.014;
  }
  function snimekEkg(ts) {
    smycka = 0;
    for (const m of monitory) {
      if (!m.el.isConnected) { monitory.delete(m); viditelne?.unobserve(m.el); continue; }
      if (!m.vidim) continue;
      const t = ts / 1000;
      if (m.cas == null) { m.cas = t; m.od = t; m.lastX = (t * m.rych) % m.W; m.lastY = m.Y(0); m.vyhas = 0; }
      const g = m.g, krok = 1 / m.rych;
      // Dohasínání: starší stopa postupně slábne (jako fosfor na monitoru), nový úder svítí naplno.
      m.vyhas += t - m.cas;
      if (m.vyhas >= 0.1) {
        g.globalCompositeOperation = "destination-out";
        g.fillStyle = `rgba(0,0,0,${(1 - Math.exp(-m.vyhas / 1.5)).toFixed(3)})`;
        g.fillRect(0, 0, m.W, m.H);
        g.globalCompositeOperation = "source-over";
        m.vyhas = 0;
      }
      g.lineWidth = m.velka ? 2.4 : 1.8; g.lineJoin = "round"; g.lineCap = "round"; g.strokeStyle = m.barva[0];
      g.shadowColor = `rgba(${m.barva[1]},.85)`; g.shadowBlur = m.velka ? 9 : 5;
      g.beginPath(); g.moveTo(m.lastX, m.lastY);
      let tt = m.cas;
      if (t - tt > 1) tt = t - 1; // po návratu na kartu nedokreslovat dlouhou pauzu
      while (tt < t) {
        tt += krok;
        const x = (tt * m.rych) % m.W, y = m.Y(hodnotaEkg(m, tt));
        if (x < m.lastX) { g.stroke(); g.beginPath(); g.moveTo(x, y); } else g.lineTo(x, y);
        m.lastX = x; m.lastY = y;
      }
      g.stroke(); m.cas = t;
      g.shadowBlur = 0;
      const mez = m.velka ? 16 : 9;
      g.clearRect(m.lastX + 1.5, 0, mez, m.H);
      if (m.lastX + mez > m.W) g.clearRect(0, 0, m.lastX + mez - m.W, m.H);
      const h = m.h;
      h.clearRect(0, 0, m.W, m.H); h.fillStyle = "#fff"; h.shadowColor = m.barva[0]; h.shadowBlur = 16;
      h.beginPath(); h.arc(m.lastX, m.lastY, m.velka ? 3.2 : 2.3, 0, 7); h.fill();
    }
    if (monitory.size) smycka = requestAnimationFrame(snimekEkg);
  }
  // Připraví monitory ve všech .ekg v kořeni (volá se z obarvi). Animují se jen ty, které jsou vidět.
  function nakresliEkg(root) {
    viditelne ||= new IntersectionObserver((z) => z.forEach((e) => { const m = e.target._ekg; if (m) { m.vidim = e.isIntersecting; if (!m.vidim) m.cas = null; } }));
    root.querySelectorAll(".ekg[data-divaci]:not([data-hotovo])").forEach((el) => {
      const W = el.clientWidth, H = el.clientHeight;
      if (!W || !H) return;
      const [c, ch] = el.querySelectorAll("canvas");
      const dpr = Math.min(2, devicePixelRatio || 1);
      for (const x of [c, ch]) { x.width = W * dpr; x.height = H * dpr; }
      const g = c.getContext("2d"), h = ch.getContext("2d");
      g.scale(dpr, dpr); h.scale(dpr, dpr);
      const velka = el.classList.contains("ekg-velka"), tep = tepZDivaku(el.dataset.divaci);
      const barva = BARVY_EKG[(/ekg-(kick|twitch|web)/.exec(el.className) || [])[1] || "web"];
      const m = { el, g, h, W, H, velka, tep, barva, rr: 60 / tep, sila: 1, tvar: [1, 1], faze: Math.random() * 6,
        rych: W / (velka ? 4.2 : 3), Y: (v) => H * 0.64 - v * H * (velka ? 0.42 : 0.46), vidim: false };
      if (malyPohyb()) { // klidný statický záznam bez pohybu
        g.strokeStyle = barva[0]; g.lineWidth = 1.8; g.beginPath();
        m.od = 0;
        for (let x = 0; x <= W; x++) { const y = m.Y(hodnotaEkg(m, x / m.rych)); x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      } else {
        el._ekg = m; monitory.add(m); viditelne.observe(el);
      }
      el.dataset.hotovo = "1";
    });
    if (monitory.size && !smycka) smycka = requestAnimationFrame(snimekEkg);
  }
  // Řádek „tep“ streamera: avatar, jméno, hra, křivka, diváci a tepy za minutu.
  const radekTepu = (s) => `<a class="tep${s.platforma === "kick" ? " kick" : ""}" href="${esc(profilUrl(s))}">${av(s)}
      <div class="tep-t"><b>${esc(s.jmeno)}</b><span>${esc(s.hra || "")}</span></div>${ekg(s.divaci, false, s.platforma === "kick" ? "kick" : "twitch")}
      <div class="tep-n"><b>${num(s.divaci || 0)}</b><span class="tep-min">${tepZDivaku(s.divaci)}/min</span></div></a>`;

  function kartaZive(s) {
    return `<a class="live-card" href="${esc(profilUrl(s))}">
      <div class="live-thumb">${https(s.nahled) ? `<img src="${esc(s.nahled)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-nahled>` : ""}${https(s.profilovka) ? `<img class="live-thumb-zaloha" src="${esc(s.profilovka)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
        <span class="live-badge">ŽIVĚ</span>${platBadge(s)}<span class="live-viewers">${num(s.divaci || 0)} diváků</span>
        ${s.zacatek ? `<span class="live-time">${esc(delka(s.zacatek))}</span>` : ""}</div>
      <div class="live-info">${av(s)}<div class="info"><h3>${esc(s.jmeno)}${partner(s)}</h3>
        <div class="sub">${esc(s.hra || "")}</div><div class="sub dim">${esc(s.titulek || "")}</div></div></div>
      <div class="live-tep live-${s.platforma === "kick" ? "kick" : "twitch"}">${ekg(s.divaci, false, s.platforma === "kick" ? "kick" : "twitch")}<span class="tep-min">${tepZDivaku(s.divaci)}/min</span></div></a>`;
  }

  const RAZENI = { sledujici: "Sledující", divaci: "Rekord diváků", hodiny: "Odvysíláno (naše měření)", rust: "Růst (naše měření)" };
  function hodnota(s, razeni) {
    if (razeni === "divaci") return [num(s.max_divaku), "diváků max."];
    if (razeni === "hodiny") return [Math.round((s.minut30 || 0) / 60) + " h", "za 30 dní"];
    if (razeni === "rust") return [s.rust30 == null ? "–" : (s.rust30 > 0 ? "+" : "") + num(s.rust30), "sledujících"];
    if (razeni === "hra") return [(s.hodin || 0) + " h", "v této hře"];
    return [s.sledujici == null ? "–" : num(s.sledujici), "sledujících"];
  }
  function radekStreamera(s, i, razeni = "sledujici") {
    const [h, popis] = hodnota(s, razeni);
    return `<a class="srow" href="${esc(profilUrl(s))}">
      ${i != null ? `<span class="rank">${i + 1}</span>` : ""}${av(s)}
      <div class="info"><h3>${esc(s.jmeno)}${partner(s)} ${platBadge(s)}</h3>
        <div class="sub">${s.zive ? `<span class="dot-live"></span>Živě: ${esc(s.hra || "")}` : esc(s.posledni_hra ? "Naposledy: " + s.posledni_hra : "")}</div></div>
      <div class="num"><b>${esc(h)}</b>${esc(popis)}</div></a>`;
  }

  // Graf počtu sledujících (vykresluje se podle skutečné šířky kontejneru).
  function graf(el, body, popisek = "Vývoj počtu sledujících") {
    const W = el.clientWidth || 320, H = 160, P = 8;
    const ys = body.map((b) => b.v), min = Math.min(...ys), max = Math.max(...ys), rozsah = max - min || 1;
    const x = (i) => P + (i / Math.max(body.length - 1, 1)) * (W - 2 * P);
    const y = (v) => H - 22 - ((v - min) / rozsah) * (H - 44);
    const cara = body.map((b, i) => `${x(i).toFixed(1)},${y(b.v).toFixed(1)}`).join(" ");
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(popisek)}">
      <polygon class="g-area" points="${x(0)},${H - 22} ${cara} ${x(body.length - 1)},${H - 22}"></polygon>
      <polyline class="g-line" points="${cara}"></polyline>
      <text class="g-txt" x="${P}" y="${H - 6}">${esc(body[0].d)}</text>
      <text class="g-txt" x="${W - P}" y="${H - 6}" text-anchor="end">${esc(body[body.length - 1].d)}</text>
      <text class="g-txt" x="${W - P}" y="14" text-anchor="end">${esc(num(max))}</text></svg>`;
  }

  // ---------- Oblíbení (jen v tomto prohlížeči) ----------
  const klicS = (s) => `${s.platforma || "twitch"}:${String(s.login || "").toLowerCase()}`;
  function oblibeni() { try { return JSON.parse(localStorage.getItem("hp_oblibeni") || "[]"); } catch { return []; } }
  const jeOblibeny = (s) => oblibeni().includes(klicS(s));
  function prepniOblibeny(s) {
    const o = oblibeni(), k = klicS(s), i = o.indexOf(k);
    if (i >= 0) o.splice(i, 1); else o.unshift(k);
    try { localStorage.setItem("hp_oblibeni", JSON.stringify(o.slice(0, 100))); } catch {}
    synchronizujPush();
    return i < 0;
  }

  // ---------- Upozornění „je živě“ (Web Push, bez účtu) ----------
  const pushPodpora = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const pushZapnuto = () => { try { return localStorage.getItem("hp_push") === "1"; } catch { return false; } };
  function b64ToU8(b) {
    const p = "=".repeat((4 - (b.length % 4)) % 4), raw = atob((b + p).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
  async function posliOdber(sub) {
    await fetch("/api/push/odber", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint, oblibeni: oblibeni() }) });
  }
  async function zapniUpozorneni() {
    if (!pushPodpora()) throw new Error("Tvůj prohlížeč upozornění nepodporuje. Na iPhonu si nejdřív přidej web na plochu (Sdílet → Přidat na plochu) a otevři ho odtamtud.");
    const povoleni = await Notification.requestPermission();
    if (povoleni !== "granted") throw new Error("Upozornění jsou v prohlížeči zakázaná. Povol je v nastavení webu a zkus to znovu.");
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const { klic } = await (await fetch("/api/push/klic")).json();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(klic) });
    await posliOdber(sub);
    try { localStorage.setItem("hp_push", "1"); } catch {}
  }
  async function vypniUpozorneni() {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/zrusit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
    } catch {}
    try { localStorage.removeItem("hp_push"); } catch {}
  }
  async function synchronizujPush() {
    if (!pushZapnuto() || !pushPodpora()) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) await posliOdber(sub);
    } catch {}
  }

  // ---------- Kategorie a události ----------
  const KATEGORIE = [
    ["povidani", "Povídání a IRL", /just chatting|irl|talk shows|podcast|pools|asmr|travel|food|i'm only sleeping|special events|music|art|makers/i],
    ["strilecky", "Střílečky", /counter-strike|valorant|call of duty|warzone|apex|fortnite|battlefield|rainbow six|pubg|escape from tarkov|overwatch|the finals|arc raiders|delta force|marvel rivals|rust|dayz|hunt: showdown|halo|destiny/i],
    ["strategie", "Strategie a MMO", /world of tanks|world of warships|world of warcraft|league of legends|dota|hearthstone|teamfight|age of empires|civilization|total war|starcraft|path of exile|lost ark|new world|eve online|warthunder|war thunder|crusader kings|hearts of iron|europa universalis|albion|runescape|final fantasy xiv|guild wars|throne and liberty/i],
    ["zavody", "Závody a sport", /truck simulator|forza|gran turismo|f1|assetto|iracing|euro truck|american truck|ea sports fc|fifa|nba 2k|nhl|rocket league|football manager|trackmania|farming simulator|snowrunner/i],
    ["sandbox", "Sandbox a přežití", /minecraft|grand theft auto|gta|roblox|terraria|ark|valheim|palworld|7 days to die|the forest|sons of the forest|project zomboid|satisfactory|factorio|subnautica|enshrouded|sims/i],
  ];
  const kategorieHry = (hra) => (KATEGORIE.find(([, , re]) => re.test(hra || "")) || ["ostatni"])[0];
  const STOP = new Set("dnes stream streamu streamujeme hrajeme jdeme hraju live zive chill komunita komunitou vecer vecerni ranni nove novy prvni day den lets play with this that from your have just gaming game games mapa drops sleva slevy giveaway".split(" "));
  // Když víc lidí streamuje stejnou hru a v titulcích mají stejné slovo (např. „major“), je to událost.
  function najdiUdalosti(streamy) {
    const podleHry = new Map();
    for (const s of streamy) if (s.hra) (podleHry.get(s.hra) || podleHry.set(s.hra, []).get(s.hra)).push(s);
    const vysledek = [];
    for (const [hra, list] of podleHry) {
      if (list.length < 3) continue;
      const slovaHry = new Set(normal(hra).split(/[^a-z0-9]+/));
      const pocty = new Map();
      for (const s of list) for (const w of new Set(normal(s.titulek).split(/[^a-z0-9]+/)))
        if (w.length >= 4 && !STOP.has(w) && !slovaHry.has(w) && !/^\d+$/.test(w)) pocty.set(w, (pocty.get(w) || 0) + 1);
      const [slovo, n] = [...pocty].sort((a, b) => b[1] - a[1])[0] || [];
      if (slovo && n >= 3) vysledek.push({ hra, slovo, streamy: list.filter((s) => normal(s.titulek).includes(slovo)) });
    }
    return vysledek.sort((a, b) => b.streamy.length - a.streamy.length).slice(0, 3);
  }

  // Hlavička sekce Streameři: kdo je živě (bubliny) + podsekce Živě / Žebříček / Hry.
  function hubHlava(aktivni) {
    const { streamy } = state.zive;
    const divaku = streamy.reduce((a, s) => a + (s.divaci || 0), 0);
    const pod = [["zive", "/zive", "Živě"], ["zebricek", "/streameri", "Žebříček"], ["hry", "/hry", "Co hraje Česko"], ["report", "/report", "Týden na scéně"], ["prehled", "/prehled", "Přehled"]];
    const obl = new Set(oblibeni());
    const mojiZive = streamy.filter((s) => obl.has(klicS(s)));
    return `<div class="live-head"><h1>Čeští streameři</h1>
        <p>${streamy.length ? `Právě ${streamy.length >= 2 && streamy.length <= 4 ? "vysílají" : "vysílá"} ${pl(streamy.length, "streamer", "streameři", "streamerů")} pro <b class="hub-cislo" data-count="${divaku}" data-once="hub">${num(divaku)}</b> diváků.` : "Teď nikdo nevysílá – mrkni na žebříček nebo hry."}</p>
        ${streamy.length ? (() => { const plat = (p) => { const l = streamy.filter((s) => (s.platforma === "kick") === (p === "kick")); return [l.length, l.reduce((a, s) => a + (s.divaci || 0), 0)]; };
          const [tn, td] = plat("twitch"), [kn, kd] = plat("kick");
          return `<p class="plat-rozpad"><span class="pr-tw">Twitch: ${esc(pl(tn, "stream", "streamy", "streamů"))} · ${esc(num(td))} diváků</span><span class="pr-ki">Kick: ${esc(pl(kn, "stream", "streamy", "streamů"))} · ${esc(num(kd))} diváků</span></p>`; })() : ""}</div>
      ${obl.size ? `<div class="oblibeni-pruh"><b>Tvoji oblíbení</b> ${mojiZive.length ? `– právě živě: ${mojiZive.map((s) => `<a href="${esc(profilUrl(s))}">${esc(s.jmeno)}</a>`).join(", ")}` : `– teď nikdo z ${obl.size} nevysílá`}${pushZapnuto() ? ` <span class="dim">· upozornění zapnutá</span>` : ""}</div>` : ""}
      ${streamy.length ? `<div class="stories" aria-label="Právě živě">${[...mojiZive, ...streamy.filter((s) => !obl.has(klicS(s)))].slice(0, 24).map((s) =>
        `<a class="story${s.platforma === "kick" ? " kick" : ""}${obl.has(klicS(s)) ? " fav" : ""}" href="${esc(profilUrl(s))}"><div class="ring">${av(s)}</div><b>${esc(s.jmeno)}</b><span>${num(s.divaci || 0)} diváků</span></a>`).join("")}</div>` : ""}
      <nav class="hub-tabs">${pod.map(([k, h, t]) => `<a href="${h}" class="${k === aktivni ? "on" : ""}">${t}</a>`).join("")}</nav>`;
  }

  // Společné ovládání sekce Streameři: hledání podle jména + přepínač platformy.
  function ovladani() {
    const plat = [["", "Vše"], ["twitch", "Twitch"], ["kick", "Kick"]];
    return `<div class="filtry">
      <input class="search" id="qs" type="search" placeholder="Hledat streamera podle jména" autocomplete="off" value="${esc(state.hledatS)}">
      <div class="seg" role="group" aria-label="Platforma">${plat.map(([k, v]) =>
        `<button type="button" class="seg-b${k === state.platforma ? " on" : ""}${k ? " seg-" + k : ""}" data-p="${k}" aria-pressed="${k === state.platforma}">${v}</button>`).join("")}</div></div>`;
  }
  function napojOvladani(prekresli, zpozdeni) {
    app.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => { state.platforma = b.dataset.p; prekresli(); });
    const inp = document.getElementById("qs");
    if (!inp) return;
    let t;
    inp.oninput = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        state.hledatS = inp.value.trim().slice(0, 40);
        await prekresli();
        const n = document.getElementById("qs");
        if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
      }, zpozdeni);
    };
  }
  const normal = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

  // Kategorie novinek – podle typu zprávy a klíčových slov (funguje i pro starší zprávy).
  const KAT_NOV = [
    ["oznameni", "Oznámení a vydání", /oznámení|announce|reveal|release date|vyjde|vydání|delay|odklad|launch/i],
    ["recenze", "Recenze", /recenze|review/i],
    ["trailery", "Trailery", /trailer|gameplay video|teaser/i],
    ["slevy", "Slevy a hry zdarma", /sleva|zdarma|free|sale|deal|discount|bundle/i],
    ["aktualizace", "Aktualizace", /aktualizace|update|patch|season|sezóna|dlc|expansion/i],
    ["esport", "Esport", /esport|tournament|turnaj|major|championship|grand final/i],
    ["streamovani", "Streamování", /streamování|twitch|kick|streamer|youtuber/i],
    ["hardware", "Hardware", /hardware|gpu|nvidia|geforce|radeon|amd|steam deck|ps5 pro|handheld|rtx|monitor/i],
  ];
  const katClanku = (c) => KAT_NOV.filter(([, , re]) => re.test(`${c.typ || ""} ${c.nadpis} ${c.perex || ""}`)).map(([k]) => k);
  const ceskyClanek = (c) => c.vlastni || c.jazyk === "cs";
  // Jazyk návštěvníka: čeština a slovenština → nejdřív české weby, angličtina → zahraniční.
  const domaciJazyk = () => (window.HP_JAZYK === "en" ? "en" : "cs");
  const vJazyku = (c) => (domaciJazyk() === "cs" ? ceskyClanek(c) : !ceskyClanek(c));
  function zdrojNovinek() {
    if (state.zdrojNov !== null) return state.zdrojNov;
    return state.clanky.some(vJazyku) ? domaciJazyk() : "";
  }

  // ---------- Stránky ----------
  // Novinky: nahoře velké karty, pod nimi plynule archiv – přehledný seznam po dnech (malý obrázek, nadpis, zdroj, čas).
  const VELKYCH_ZPRAV = 12;
  function denZpravy(ms) {
    const d = new Date(ms), dnes = new Date(), vcera = new Date(Date.now() - 864e5);
    const stejny = (a, b) => a.toDateString() === b.toDateString();
    if (stejny(d, dnes)) return "Dnes";
    if (stejny(d, vcera)) return "Včera";
    const t = d.toLocaleDateString(LOC, { weekday: "long", day: "numeric", month: "long" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function archivZprav(list) {
    if (!list.length) return "";
    const dny = new Map();
    for (const c of list) { const k = denZpravy(datum(c)); (dny.get(k) || dny.set(k, []).get(k)).push(c); }
    return `<div class="archiv">${[...dny].map(([den, zpr]) => `<section class="archiv-den"><h2 class="archiv-nadpis">${esc(den)}</h2>
      <ul class="archiv-list">${zpr.map((c) => `<li><a href="/clanek/${esc(enc(c.id))}">
        ${https(c.obrazek) ? `<img src="${esc(c.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="archiv-bez" data-a="${esc((c.barva || [])[0] || "#444")}" data-b="${esc((c.barva || [])[1] || "#111")}">${esc((c.nadpis || "?")[0])}</span>`}
        <span class="archiv-t"><b>${esc(c.nadpis)}</b><small>${c.vlastni ? "Herní puls" : esc(c.zdroje?.[0]?.nazev || "")}${ceskyClanek(c) && !c.vlastni ? " · česky" : ""} · ${esc(new Date(datum(c)).toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit" }))}</small></span></a></li>`).join("")}</ul></section>`).join("")}</div>`;
  }
  function strankaNovinky() {
    nastavTitulek("");
    const platformy = ["Vše", "PC", "PlayStation", "Xbox", "Switch"];
    const q = state.hledat.toLowerCase();
    const zdroj = zdrojNovinek();
    const list = state.clanky
      .filter((c) => !zdroj || (zdroj === "cs" ? ceskyClanek(c) : !ceskyClanek(c)))
      .filter((c) => !state.katNov || katClanku(c).includes(state.katNov))
      .filter((c) => state.filtr === "Vše" || (c.platformy || []).some((x) => x === state.filtr || (state.filtr === "PlayStation" && /^(PS4|PS5)$/.test(x))))
      .filter((c) => !q || (c.nadpis + " " + c.perex).toLowerCase().includes(q))
      .sort((a, b) => datum(b) - datum(a));
    // Nahoru jako hlavní článek dej nejnovější vlastní článek (pokud je z posledních 24 h).
    const hi = list.findIndex((c) => c.vlastni && Date.now() - datum(c) < 864e5);
    if (hi > 0) list.unshift(...list.splice(hi, 1));
    const zive = state.zive.streamy.slice(0, 4);
    const pocetCz = state.clanky.filter(ceskyClanek).length;
    const kat = KAT_NOV.filter(([k]) => state.clanky.some((c) => katClanku(c).includes(k)));
    app.innerHTML = `<div class="news-head"><h1>Novinky</h1><p>Co je nového ve světě her – nejčerstvější zprávy nahoře, obnovuje se samo.</p></div>
      <a class="ranni-odkaz" href="/ranni"><span class="ai-stitek">AI</span><b>Ranní přehled</b><span>5 nejdůležitějších zpráv dne na dvě minuty čtení</span></a>
      <div class="filtry">
        <input class="search" id="q" type="search" placeholder="Hledat ve zprávách" value="${esc(state.hledat)}">
        <div class="seg" role="group" aria-label="Odkud">${[["", "Vše"], ["cs", "České weby"], ["en", "Ze zahraničí"]].map(([k, v]) =>
          `<button type="button" class="seg-b${k === zdroj ? " on" : ""}" data-z="${k}" aria-pressed="${k === zdroj}">${v}</button>`).join("")}</div>
      </div>
      ${zdroj === "cs" && !pocetCz ? `<p class="dim">České herní weby zatím nedodávají zprávy – ověřujeme jejich RSS kanály. Do té doby tu najdeš jen články Herního pulsu.</p>` : ""}
      <div class="chips chips-barvy" role="group" aria-label="Kategorie"><button type="button" class="chip chip-vse${state.katNov ? "" : " on"}" data-kn="" aria-pressed="${!state.katNov}">Všechny kategorie</button>${kat.map(([k, n]) =>
        `<button type="button" class="chip chip-${k}${k === state.katNov ? " on" : ""}" data-kn="${k}" aria-pressed="${k === state.katNov}">${n}</button>`).join("")}</div>
      <div class="chips chips-barvy" role="group" aria-label="Platforma">${platformy.map((p) => `<button type="button" class="chip chip-${p === "Vše" ? "vse" : p.toLowerCase()}${p === state.filtr ? " on" : ""}" data-f="${p}" aria-pressed="${p === state.filtr}">${p === "Vše" ? "Všechny platformy" : p}</button>`).join("")}</div>
      ${list.length ? `<div class="grid">${list.slice(0, VELKYCH_ZPRAV).map(kartaClanku).join("")}</div>${archivZprav(list.slice(VELKYCH_ZPRAV))}`
        : `<p class="empty">${state.clanky.length ? "Nic jsme nenašli." : "Sběr novinek právě běží. První zprávy se objeví do 15 minut."}</p>`}
      ${state.clanky.length && !state.archivKonec ? `<div class="archiv-dalsi"><button type="button" class="btn-maly" id="starsi">Načíst starší zprávy</button></div>` : ""}
      ${zive.length ? `<div class="section-title">Právě živě · <a href="/zive">všichni</a></div><div class="live-grid">${zive.map(kartaZive).join("")}</div>` : ""}`;
    app.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { state.filtr = b.dataset.f; strankaNovinky(); obarvi(app); });
    app.querySelectorAll("[data-kn]").forEach((b) => b.onclick = () => { state.katNov = b.dataset.kn; strankaNovinky(); obarvi(app); });
    app.querySelectorAll("[data-z]").forEach((b) => b.onclick = () => { state.zdrojNov = b.dataset.z; strankaNovinky(); obarvi(app); });
    const bs = document.getElementById("starsi");
    if (bs) bs.onclick = async () => {
      bs.disabled = true; bs.textContent = "Načítám…";
      const nejstarsi = Math.min(...state.clanky.map((c) => datum(c)));
      try {
        const starsi = await nacti(`clanky?limit=100&pred=${Math.floor(nejstarsi)}`);
        const ma = new Set(state.clanky.map((c) => c.id));
        const nove = (Array.isArray(starsi) ? starsi : []).filter((c) => !ma.has(c.id));
        if (!nove.length) state.archivKonec = true;
        state.clanky = [...state.clanky, ...nove];
      } catch { achievement("Nejde to", "Starší zprávy se nepodařilo načíst, zkus to znovu."); }
      const y = scrollY; strankaNovinky(); obarvi(app); scrollTo(0, y);
    };
    const inp = document.getElementById("q");
    inp.oninput = () => { state.hledat = inp.value; const pos = inp.selectionStart; strankaNovinky(); obarvi(app); const n = document.getElementById("q"); n.focus(); n.setSelectionRange(pos, pos); };
  }

  async function strankaClanek(id) {
    let c = state.clanky.find((x) => x.id === id);
    if (!c) { try { c = await nacti("clanek/" + enc(id)); } catch {} }
    if (!c || !c.nadpis) { nastavTitulek("Článek nenalezen"); app.innerHTML = `<p class="empty">Článek nenalezen. <a href="/novinky">Zpět na novinky</a></p>`; return; }
    nastavTitulek(c.nadpis);
    const nadpis = c.nadpis.toLowerCase();
    const streameri = state.zive.streamy.filter((s) => s.hra && s.hra.length > 3 && nadpis.includes(s.hra.toLowerCase())).slice(0, 4);
    const hra = streameri[0]?.hra;
    app.innerHTML = `<article class="article">
      <a class="back" href="/novinky">← Zpět na novinky</a>
      <div class="article-cover">${cover(c, c.nadpis[0])}</div>
      <h1>${esc(c.nadpis)}</h1>
      <div class="meta">${pfs(c.platformy)}<span>· ${kdy(datum(c))}</span></div>
      <p class="perex">${esc(c.perex)}</p>
      <div class="text">${c.md ? md(c.md) : ""}</div>
      ${c.url && !c.vlastni ? `<a class="btn-source" href="${esc(bezpecnaUrl(c.url))}" target="_blank" rel="noopener noreferrer">Číst celý článek na ${esc(c.zdroje?.[0]?.nazev || "zdroji")} →</a>` : ""}
      ${(c.hry || []).length ? `<div class="clanek-hry"><b>Hry v článku:</b> ${c.hry.map((h) => `<a class="chip" href="/databaze/${esc(h.slug)}">${esc(h.nazev)}</a>`).join("")}</div>` : ""}
      <div class="sources"><b>${(c.zdroje || []).length > 1 ? "Zdroje" : "Zdroj"}:</b> ${(c.zdroje || []).map((z) => `<a href="${esc(bezpecnaUrl(z.url))}" target="_blank" rel="noopener noreferrer nofollow">${esc(z.nazev)}</a>`).join(", ")}
        <div class="ai-note">${c.ai ? "Článek napsala AI na základě uvedených zdrojů a prošel automatickou kontrolou faktů." : c.vlastni ? "Článek redakce Herní puls." : "Zpráva byla automaticky převzata z RSS kanálu zdroje. Celý článek najdeš u autora."}</div></div>
      ${streameri.length ? `<div class="section-title">Tuhle hru právě streamují · <a href="/hra/${esc(slug(hra))}">vše o hře</a></div><div class="live-grid">${streameri.map(kartaZive).join("")}</div>` : ""}
    </article>`;
  }

  // Nová videa streamerů z YouTube (dřív na Domů) – načtou se jednou, pak se jen vykreslují.
  function videaStreameru() {
    if (state.obsah === undefined) {
      state.obsah = null;
      nacti("obsah").then((o) => { state.obsah = o || {}; if (location.pathname.replace(/\/+$/, "") === "/zive") { strankaZive(); obarvi(app); } }).catch(() => { state.obsah = {}; });
    }
    const v = state.obsah?.videa || [];
    return v.length ? `<div class="section-title">Nová videa streamerů</div><div class="regal">${v.map((x) => kartaVidea(x)).join("")}</div>
      <p class="source-note">Nejnovější videa z YouTube kanálů českých streamerů (kanály hledáme v jejich popisech na Twitchi a Kicku).</p>` : "";
  }
  function strankaZive() {
    nastavTitulek("Právě živě");
    const { streamy, hry, cas } = state.zive;
    const q = normal(state.hledatS);
    const udalosti = najdiUdalosti(streamy);
    const list = streamy.filter((s) => (!state.hraZive || s.hra === state.hraZive)
      && (!state.kategorie || kategorieHry(s.hra) === state.kategorie)
      && (!state.mali || (s.divaci || 0) <= 50)
      && (!state.udalost || normal(s.titulek).includes(state.udalost))
      && (!state.platforma || s.platforma === state.platforma)
      && (!q || normal(s.jmeno).includes(q) || normal(s.login).includes(q)));
    const katChips = [["", "Všechno"], ...KATEGORIE.map(([k, n]) => [k, n]), ["ostatni", "Ostatní"]]
      .filter(([k]) => !k || streamy.some((s) => kategorieHry(s.hra) === k));
    app.innerHTML = `${hubHlava("zive")}
      ${udalosti.length ? `<div class="udalosti">${udalosti.map((u) => `<button type="button" class="udalost${state.udalost === u.slovo ? " on" : ""}" data-u="${esc(u.slovo)}" data-uh="${esc(u.hra)}">
          <span class="u-zive">Teď se děje</span><b>${esc(u.hra)}: ${esc(u.slovo)}</b><span class="dim">${pl(u.streamy.length, "český stream", "české streamy", "českých streamů")}</span></button>`).join("")}</div>` : ""}
      ${ovladani()}
      <div class="chips">${katChips.map(([k, n]) => `<button class="chip${k === state.kategorie ? " on" : ""}" data-k="${k}">${n}</button>`).join("")}
        <button class="chip${state.mali ? " on" : ""}" data-mali="1">Malí streameři (do 50 diváků)</button></div>
      ${hry.length ? `<div class="chips"><button class="chip${state.hraZive ? "" : " on"}" data-h="">Všechny hry</button>${hry.filter((h) => !state.kategorie || kategorieHry(h.hra) === state.kategorie).map((h) =>
        `<button class="chip${state.hraZive === h.hra ? " on" : ""}" data-h="${esc(h.hra)}">${esc(h.hra)}<span class="cnt">${h.streamu}</span></button>`).join("")}</div>` : ""}
      ${state.hraZive ? `<p><a class="link" href="/hra/${esc(slug(state.hraZive))}">Vše o hře ${esc(state.hraZive)} →</a></p>` : ""}
      ${list.length ? `<div class="live-grid">${list.map(kartaZive).join("")}</div>`
        : `<p class="empty">${streamy.length ? `Nikdo takový teď nevysílá. Zkus <a href="/streameri">Žebříček</a>, kde jsou i streameři offline.` : "Teď nikdo z českých streamerů nevysílá (nebo se seznam teprve načítá)."}</p>`}
      ${videaStreameru()}
      <p class="source-note">Data z oficiálních API Twitche a Kicku${cas ? `, naposledy ${esc(kdy(new Date(cas)))}` : ""}. Obnovují se každých 15 minut a zahrnují streamy s jazykem nastaveným na češtinu.</p>`;
    app.querySelectorAll("[data-h]").forEach((b) => b.onclick = () => { state.hraZive = b.dataset.h; strankaZive(); obarvi(app); });
    app.querySelectorAll("[data-k]").forEach((b) => b.onclick = () => { state.kategorie = b.dataset.k; state.hraZive = ""; strankaZive(); obarvi(app); });
    app.querySelector("[data-mali]").onclick = () => { state.mali = !state.mali; strankaZive(); obarvi(app); };
    app.querySelectorAll("[data-u]").forEach((b) => b.onclick = () => {
      const zap = state.udalost !== b.dataset.u;
      state.udalost = zap ? b.dataset.u : null; state.hraZive = zap ? b.dataset.uh : "";
      strankaZive(); obarvi(app);
    });
    napojOvladani(() => { strankaZive(); obarvi(app); }, 120);
  }

  async function strankaStreameri() {
    nastavTitulek("Čeští streameři");
    const klic = `${state.razeni}|${state.platforma}|${state.hledatS}`;
    if (!state.adresar[klic]) {
      app.innerHTML = `${hubHlava("zebricek")}${kostra(6)}`;
      try { state.adresar[klic] = await nacti(`streameri?razeni=${enc(state.razeni)}&platforma=${enc(state.platforma)}&q=${enc(state.hledatS)}`); }
      catch { app.innerHTML = `<p class="empty">Seznam se nepodařilo načíst.</p>`; return; }
    }
    if (location.pathname.replace(/\/+$/, "") !== "/streameri") return;
    const list = state.adresar[klic];
    app.innerHTML = `${hubHlava("zebricek")}
      ${ovladani()}
      <div class="chips">${Object.entries(RAZENI).map(([k, v]) => `<button class="chip${k === state.razeni ? " on" : ""}" data-r="${k}">${v}</button>`).join("")}</div>
      ${list.length ? `<div class="slist">${list.map((s, i) => radekStreamera(s, i, state.razeni)).join("")}</div>`
        : `<p class="empty">${state.hledatS ? "Nikoho takového jsme nenašli." : "Seznam se právě plní. Streameři se objeví, jakmile je zachytíme živě (do 15 minut)."}</p>`}
      <p class="source-note">Údaje z oficiálních API Twitche a Kicku. Počty sledujících (jen Twitch) se obnovují denně. Růst a odvysílané hodiny počítáme z vlastních denních záznamů.</p>`;
    app.querySelectorAll("[data-r]").forEach((b) => b.onclick = () => { state.razeni = b.dataset.r; strankaStreameri().then(() => obarvi(app)); });
    napojOvladani(() => strankaStreameri().then(() => obarvi(app)), 350);
  }

  // Náhled profilu: vlastní banner kanálu → když streamer žádný nenastavil, živý záběr ze streamu → jinak rozostřená
  // profilovka v barvě platformy s EKG křivkou. (Banner si na Twitchi/Kicku nastavuje každý sám; mnoho kanálů ho nemá.)
  function bannerStreamera(s) {
    const pl = s.platforma === "kick" ? "kick" : "twitch";
    if (https(s.banner)) return `<div class="banner"><img src="${esc(s.banner)}" alt="" referrerpolicy="no-referrer" data-zaloha></div>`;
    const zivy = s.zive && https(s.nahled) ? s.nahled.replace("{width}", "1280").replace("{height}", "720") : "";
    if (zivy) return `<div class="banner banner-zive"><img src="${esc(zivy)}" alt="" referrerpolicy="no-referrer" data-zaloha><span class="banner-stitek">Živý záběr ze streamu</span></div>`;
    return `<div class="banner banner-nahrada banner-${pl}">${https(s.profilovka) ? `<img src="${esc(s.profilovka)}" alt="" referrerpolicy="no-referrer" data-zaloha>` : ""}
      <svg class="banner-ekg" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 70h170l18-40 22 76 20-58 14 22h96l16-34 20 62 18-44 12 16h194"/></svg></div>`;
  }
  async function strankaStreamer(platforma, login) {
    app.innerHTML = `<div class="profile"><div class="kostra kostra-banner"></div>${kostra(3)}</div>`;
    let s;
    try { s = await nacti(`streamer/${enc(platforma)}/${enc(login)}`); }
    catch { nastavTitulek("Streamer nenalezen"); app.innerHTML = `<p class="empty">Streamer nenalezen. <a href="/streameri">Zpět na seznam</a></p>`; return; }
    nastavTitulek(`${s.jmeno} – ${PLAT[s.platforma] || "Twitch"} streamer`);
    const body = (s.snimky || []).filter((x) => x.sledujici != null).map((x) => ({ v: x.sledujici, d: new Date(x.den).toLocaleDateString(LOC, { day: "numeric", month: "numeric" }) }));
    const maxHra = Math.max(1, ...(s.hry || []).map((h) => h.minut));
    const datumCz = (d) => d ? new Date(d).toLocaleDateString(LOC) : "–";
    app.innerHTML = `<div class="profile">
      <a class="back" href="/streameri">← Všichni streameři</a>
      ${bannerStreamera(s)}
      <div class="profile-head">${av(s, true)}
        <div class="ph-text"><h1 class="m0">${esc(s.jmeno)}${partner(s)}</h1>
          <div class="dim">${platBadge(s)} ${s.platforma === "kick" ? "kick.com" : "twitch.tv"}/${esc(s.login)}${s.ucet_od ? ` · účet od ${esc(new Date(s.ucet_od).getFullYear())}` : ""}</div></div></div>
      <a class="btn-twitch${s.platforma === "kick" ? " btn-kick" : ""}" href="${esc(kanalUrl(s))}" target="_blank" rel="noopener noreferrer">${s.zive ? "Sledovat živě" : "Kanál"} na ${esc(PLAT[s.platforma] || "Twitch")}u →</a>
      <div class="profil-akce">
        <button type="button" class="pa-b${jeOblibeny(s) ? " on" : ""}" id="b-obl">${jeOblibeny(s) ? "★ Oblíbený" : "☆ Přidat do oblíbených"}</button>
        <button type="button" class="pa-b" id="b-upoz">${pushZapnuto() && jeOblibeny(s) ? "Upozornění zapnutá" : "Upozornit, až začne vysílat"}</button>
        <a class="pa-b" href="/porovnat?a=${esc(enc(s.platforma || "twitch"))}/${esc(enc(s.login))}">Porovnat</a>
        <button type="button" class="pa-b" id="b-obr">Sdílet jako obrázek</button>
      </div>
      <p class="pa-zprava" id="pa-zprava" role="status" aria-live="polite"></p>
      ${odkazySit(s.odkazy)}
      ${s.zive ? `<div class="section-title">Právě vysílá · tep ${tepZDivaku(s.divaci)}/min</div>${ekg(s.divaci, true, s.platforma === "kick" ? "kick" : "twitch")}${kartaZive(s)}` : ""}
      <div class="stats">
        ${s.platforma === "kick"
          ? `<div class="stat"><b>–</b><span>sledujících<small>Kick je ve svém oficiálním API nezveřejňuje</small></span></div>`
          : `<div class="stat"><b data-count="${s.sledujici ?? ""}">${s.sledujici == null ? "–" : num(s.sledujici)}</b><span>sledujících${s.sledujici == null ? "<small>doplní se do 24 h</small>" : ""}</span></div>`}
        <div class="stat"><b data-count="${s.max_divaku || 0}">${num(s.max_divaku || 0)}</b><span>nejvíc diváků najednou${merenoOd(s) ? `<small>od ${esc(merenoOd(s))}, kdy měříme</small>` : ""}</span></div>
        <div class="stat" id="stat-hodiny"><b data-count="${s.hodin30 || 0}" data-suffix=" h">${s.hodin30 || 0} h</b><span>${merenoOd(s) ? `odvysíláno od ${esc(merenoOd(s))}<small>od té doby ho měříme my</small>` : "odvysíláno za 30 dní"}</span></div>
      </div>
      ${s.popis ? `<p class="popis">${esc(s.popis)}</p>` : ""}
      <div id="extra"></div>
      ${body.length >= 2 ? `<div class="section-title">Vývoj sledujících</div><div class="graf" id="graf"></div>` : ""}
      ${(s.hry || []).length ? `<div class="section-title">Nejčastěji hrané hry</div><div class="hry">${s.hry.map((h) =>
        `<a class="hra" href="${h.igdb_slug ? `/databaze/${esc(h.igdb_slug)}` : `/hra/${esc(h.slug || slug(h.hra))}`}"><div class="hra-t"><span>${esc(h.hra)}</span><span class="dim">${Math.round(h.minut / 60)} h</span></div>
         <div class="bar"><i data-w="${Math.round((h.minut / maxHra) * 100)}"></i></div></a>`).join("")}</div>` : ""}
      <p class="source-note">Údaje z oficiálního API ${s.platforma === "kick" ? "Kicku" : "Twitche"}. Na Herním pulsu sledujeme od ${esc(datumCz(s.prvni_videno))} ·
        profil aktualizován ${esc(datumCz(s.aktualizovano?.profil))}${s.platforma === "kick" ? "" : ` · sledující ${esc(datumCz(s.aktualizovano?.sledujici))}`}.
        Odvysílané hodiny a hry počítáme jen od chvíle, kdy kanál sledujeme.</p>
    </div>`;
    const g = document.getElementById("graf");
    if (g) graf(g, body);
    if (s.platforma !== "kick") nactiExtra(s);
    const zpr = (t) => { document.getElementById("pa-zprava").textContent = t; };
    document.getElementById("b-obr").onclick = () => sdilejObrazek({ stitek: `${PLAT[s.platforma] || "Twitch"} streamer`, nadpis: s.jmeno,
      odkaz: `/streamer/${s.platforma || "twitch"}/${s.login}`,
      radky: [s.sledujici != null && [num(s.sledujici), "sledujících"], [num(s.max_divaku || 0), "rekord diváků najednou"],
        [`${s.hodin30 || 0} h`, "odvysíláno za 30 dní"], (s.hry || [])[0] && [s.hry[0].hra.slice(0, 26), "nejhranější hra"]].filter(Boolean) });
    const bObl = document.getElementById("b-obl"), bUp = document.getElementById("b-upoz");
    bObl.onclick = () => {
      const pridan = prepniOblibeny(s);
      bObl.classList.toggle("on", pridan);
      bObl.textContent = pridan ? "★ Oblíbený" : "☆ Přidat do oblíbených";
      zpr(pridan ? `${s.jmeno} je v oblíbených. Najdeš ho nahoře v sekci Streameři.` : "Odebráno z oblíbených.");
      if (pridan) achievement(oblibeni().length === 1 ? "Achievement: První oblíbený!" : "Nový oblíbený streamer", s.jmeno);
    };
    bUp.onclick = async () => {
      bUp.disabled = true;
      try {
        if (!jeOblibeny(s)) { prepniOblibeny(s); bObl.classList.add("on"); bObl.textContent = "★ Oblíbený"; }
        await zapniUpozorneni();
        bUp.textContent = "Upozornění zapnutá";
        achievement("Achievement: Vždy ve hře", `Dáme vědět, až ${s.jmeno} začne vysílat`);
        zpr(`Hotovo. Dáme ti vědět, až ${s.jmeno} začne vysílat (do 15 minut od začátku streamu).`);
      } catch (e) { zpr(e.message || "Upozornění se nepodařilo zapnout."); }
      bUp.disabled = false;
    };
  }

  // Naše měření tohoto streamera začalo později než před 30 dny → číslo „za 30 dní“ by bylo zavádějící, ukážeme „od data“.
  function merenoOd(s) {
    if (!s.mereno_od) return "";
    const od = new Date(s.mereno_od + "T00:00:00");
    return Date.now() - od < 30 * 864e5 ? od.toLocaleDateString(LOC, { day: "numeric", month: "numeric" }) : "";
  }
  const UCHOVANI = { partner: 60, affiliate: 14 };

  // Rozvrh, klipy a záznamy vysílání (Twitch) – načítají se zvlášť, aby profil nečekal.
  async function nactiExtra(s) {
    let x;
    try { x = await nacti(`streamer-extra/${enc(s.platforma || "twitch")}/${enc(s.login)}`); } catch { return; }
    const el = document.getElementById("extra");
    if (!el) return;
    const den = (d) => new Date(d).toLocaleString(LOC, { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
    const v = x.vysilani;
    // Záznamy na Twitchi pokrývají i dobu před naším měřením → když dávají víc, ukážeme je (s uvedením zdroje).
    const dniZaznamu = Math.min(30, UCHOVANI[s.typ] || 7);
    if (v && v.pocet && v.hodin >= (s.hodin30 || 0)) {
      const st = document.getElementById("stat-hodiny");
      if (st) st.innerHTML = `<b>${esc(String(v.hodin))} h</b><span>odvysíláno za ${dniZaznamu < 30 ? `posledních ${dniZaznamu}` : "30"} dní<small>podle záznamů na Twitchi (${pl(v.pocet, "vysílání", "vysílání", "vysílání")})</small></span>`;
    }
    el.innerHTML = `
      ${v && (v.posledni || []).length ? `<div class="section-title">Poslední vysílání</div><div class="slist">${v.posledni.map((z) =>
        `<a class="srow" href="${esc(bezpecnaUrl(z.url))}" target="_blank" rel="noopener noreferrer"><div class="info"><h3>${esc(z.nazev || "Vysílání")}</h3>
          <div class="sub">${esc(den(z.zacatek))} · ${esc(String(Math.floor(z.minut / 60)))} h ${esc(String(z.minut % 60).padStart(2, "0"))} min</div></div>
          <div class="num"><b>${esc(num(z.zhlednuti))}</b>zhlédnutí</div></a>`).join("")}</div>
        <p class="source-note">Ze záznamů vysílání na Twitchi. Twitch je drží jen omezeně (partneři 60 dní, affiliate 14 dní, ostatní 7 dní) a jen když je má streamer zapnuté – starší vysílání tu proto chybí.</p>` : ""}
      ${v && !v.pocet && s.platforma !== "kick" ? `<p class="source-note">Tenhle streamer nemá na Twitchi uložené záznamy vysílání, takže historii před začátkem našeho měření neznáme.</p>` : ""}
      ${(x.rozvrh || []).length ? `<div class="section-title">Rozvrh streamů</div><div class="rozvrh">${x.rozvrh.slice(0, 7).map((r) =>
        `<div class="termin"><b>${esc(den(r.zacatek))}</b><span>${esc(r.nazev || r.hra || "Stream")}</span>${r.hra ? `<span class="dim">${esc(r.hra)}</span>` : ""}</div>`).join("")}</div>` : ""}
      ${(x.klipy || []).length ? `<div class="section-title">Nejlepší klipy za 30 dní</div><div class="klipy">${x.klipy.map((k) =>
        `<a class="klip" href="${esc(bezpecnaUrl(k.url))}" target="_blank" rel="noopener noreferrer">
          <div class="klip-thumb">${https(k.nahled) ? `<img src="${esc(k.nahled)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="live-time">${Math.round(Number(k.delka) || 0)}s</span></div>
          <div class="klip-t">${esc(k.nazev)}</div><div class="sub">${num(k.zhlednuti)} zhlédnutí</div></a>`).join("")}</div>` : ""}`;
  }

  const BARVY_HER = [["#7c5cff", "#1b1440"], ["#ff7a3d", "#3a1406"], ["#3fbf7f", "#0a2a1a"], ["#2fa8ff", "#06182e"], ["#ff4d9a", "#2a0618"], ["#f2b631", "#2e2104"]];
  const barvaHry = (s) => BARVY_HER[[...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0) % BARVY_HER.length];

  // ---------- Co hraje Česko ----------
  const datumCz = (d) => new Date(d + (String(d).length === 10 ? "T12:00:00" : "")).toLocaleDateString(LOC, { day: "numeric", month: "numeric", year: "numeric" });
  function zmenaStitek(h) {
    if (h.novinka) return `<span class="zm zm-nove">nové</span>`;
    if (h.zmena == null) return "";
    if (h.zmena >= 5) return `<span class="zm zm-nahoru">▲ ${h.zmena} %</span>`;
    if (h.zmena <= -5) return `<span class="zm zm-dolu">▼ ${Math.abs(h.zmena)} %</span>`;
    return `<span class="zm">≈ stejně</span>`;
  }
  function poznamkaDat(od) {
    if (!od) return `<p class="info-box">Statistiky her se začaly sbírat právě teď – první čísla uvidíš do 15 minut.</p>`;
    const dni = Math.floor((Date.now() - new Date(od + "T00:00:00")) / 864e5) + 1;
    return dni < 14 ? `<p class="info-box">Statistiky her sbíráme od ${esc(datumCz(od))} (${pl(dni, "den", "dny", "dní")}). Srovnání s předchozím týdnem bude úplné po 14 dnech.</p>` : "";
  }
  const radekHryCesko = (h, max) => `<a class="srow" href="/hra/${esc(h.slug)}">
      <span class="rank">${h.poradi}</span>
      <div class="info"><h3>${esc(h.hra)} ${zmenaStitek(h)}</h3>
        <div class="sub">${h.streameru ? `${pl(h.streameru, "streamer", "streameři", "streamerů")} · ` : ""}špička ${esc(num(h.spicka))} diváků${h.kick_podil ? ` · Kick ${h.kick_podil} %` : ""}</div>
        <div class="bar"><i data-w="${Math.round((h.hodin / Math.max(1, max)) * 100)}"></i></div></div>
      <div class="num"><b>${esc(num(h.hodin))}</b>hodin</div></a>`;

  async function strankaHry() {
    nastavTitulek("Co hraje Česko – nejsledovanější hry českých streamů");
    if (!state.cesko) {
      app.innerHTML = `${hubHlava("hry")}${kostra(6)}`;
      const [c, h] = await Promise.allSettled([nacti("cesko"), nacti("hry")]);
      state.cesko = c.status === "fulfilled" ? c.value : { hry: [] };
      state.hry = h.status === "fulfilled" ? h.value : [];
    }
    if (location.pathname.replace(/\/+$/, "") !== "/hry") return;
    const c = state.cesko, max = c.hry[0]?.hodin || 1;
    const ted = (state.hry || []).filter((h) => h.zive).slice(0, 12);
    app.innerHTML = `${hubHlava("hry")}
      <div class="cesko-head"><h2>Co hraje Česko</h2>
        <p>Nejsledovanější hry na českých streamech za posledních 7 dní (${esc(datumCz(c.od || new Date()))} – ${esc(datumCz(c.do || new Date()))}).
        ${c.celkem?.hodin ? `Celkem <b>${esc(num(c.celkem.hodin))} hodin</b> sledování${c.celkem.zmena != null && c.celkem.hodin_pred ? `, ${c.celkem.zmena >= 0 ? "+" : ""}${c.celkem.zmena} % proti předchozímu týdnu` : ""}.` : ""}</p>
        <a class="btn-maly" href="/report">Report týdne</a></div>
      ${poznamkaDat(c.data_od)}
      ${(c.nahoru || []).length || (c.novinky || []).length ? `<div class="cesko-boxy">
        ${(c.nahoru || []).length ? `<div class="cbox"><b>Rostou</b>${c.nahoru.map((h) => `<a href="/hra/${esc(h.slug)}">${esc(h.hra)} <span class="zm zm-nahoru">▲ ${h.zmena} %</span></a>`).join("")}</div>` : ""}
        ${(c.novinky || []).length ? `<div class="cbox"><b>Nově se hraje</b>${c.novinky.map((h) => `<a href="/hra/${esc(h.slug)}">${esc(h.hra)} <span class="dim">${esc(num(h.hodin))} h</span></a>`).join("")}</div>` : ""}
      </div>` : ""}
      ${c.hry.length ? `<div class="slist">${c.hry.map((h) => radekHryCesko(h, max)).join("")}</div>` : `<p class="empty">Žebříček se plní – první čísla budou do 15 minut.</p>`}
      ${ted.length ? `<div class="section-title">Právě se hraje</div><div class="slist">${ted.map((h) => { const [a, b] = barvaHry(h.slug); return `<a class="srow" href="/hra/${esc(h.slug)}">
          <div class="hra-ikona" data-a="${esc(a)}" data-b="${esc(b)}">${esc(h.nazev[0] || "?")}</div>
          <div class="info"><h3>${esc(h.nazev)}</h3><div class="sub"><span class="dot-live"></span>${pl(h.zive, "stream", "streamy", "streamů")} živě · ${num(h.divaci)} diváků</div></div>
          <div class="num"><b>${h.streameru}</b>streamerů</div></a>`; }).join("")}</div>` : ""}
      <p class="source-note">Hodiny sledování = součet diváků ze všech českých streamů na Twitchi a Kicku, měřený každých 15 minut z jejich oficiálních API. <a href="/o-webu#data">Jak počítáme</a></p>`;
  }

  // ---------- Týdenní report ----------
  async function strankaReport(id) {
    app.innerHTML = `${hubHlava("report")}${kostra(5)}`;
    let r;
    try { r = await nacti("report" + (id ? `?tyden=${enc(id)}` : "")); }
    catch { app.innerHTML = `${hubHlava("report")}<p class="empty">Report se nepodařilo načíst.</p>`; return; }
    if (!location.pathname.startsWith("/report")) return;
    const s = r.souhrn;
    nastavTitulek(`Týden na české herní scéně ${datumCz(r.od)} – ${datumCz(r.do)}`);
    const strList = (list, jednotka) => list.length ? `<div class="slist">${list.map((x, i) => `<a class="srow" href="${esc(profilUrl(x))}"><span class="rank">${i + 1}</span>${av(x)}
        <div class="info"><h3>${esc(x.jmeno)} ${platBadge(x)}</h3></div><div class="num"><b>${jednotka === "+" ? "+" : ""}${esc(num(x.hodnota))}</b>${jednotka === "+" ? "sledujících" : jednotka}</div></a>`).join("")}</div>` : `<p class="dim">Zatím bez dat.</p>`;
    const max = r.hry[0]?.hodin || 1;
    app.innerHTML = `${hubHlava("report")}
      <article class="report">
        <header class="rep-head"><span class="ht-stitek">Report týdne ${esc(r.tyden.replace("-W", " · týden "))}</span>
          <h2>Týden na české scéně</h2>
          <p class="dim">${esc(datumCz(r.od))} – ${esc(datumCz(r.do))}${r.probiha ? " · týden ještě běží, čísla se průběžně mění" : ""}</p>
          ${r.tydny.length > 1 ? `<div class="rep-tydny">${r.tydny.slice(0, 8).map((t) => `<a class="ms-b${t.id === r.tyden ? " on" : ""}" href="/report/${esc(t.probiha ? "aktualni" : t.id)}">${t.probiha ? "Tento týden" : esc(datumCz(t.od).replace(/\s?\d{4}$/, ""))}</a>`).join("")}</div>` : ""}
        </header>
        ${s.pokryti < 90 ? `<p class="info-box">Za tento týden máme ${Number(s.pokryti) || 0} % měření${r.data_od ? ` – statistiky sbíráme od ${esc(datumCz(r.data_od))}` : ""}. Čísla jsou proto nižší, než by byla za celý týden.</p>` : ""}
        ${r.vety.length ? `<p class="rep-vety">${r.vety.map(esc).join(" ")}</p>` : `<p class="dim">Za tento týden zatím nemáme dost dat.</p>`}
        <div class="rep-dlazdice">
          <div><b>${esc(num(s.hodin))}</b><span>hodin sledování${s.zmena != null && s.hodin_pred ? ` <i class="${s.zmena >= 0 ? "zm-nahoru" : "zm-dolu"}">${s.zmena >= 0 ? "+" : ""}${s.zmena} %</i>` : ""}</span></div>
          <div><b>${esc(num(s.prumer_divaku))}</b><span>diváků v průměru</span></div>
          <div><b>${esc(num(s.spicka?.divaci || 0))}</b><span>diváků ve špičce${s.spicka ? ` (${esc(new Date(s.spicka.cas).toLocaleString(LOC, { weekday: "short", hour: "2-digit", minute: "2-digit" }))})` : ""}</span></div>
          <div><b>${esc(num(s.kanalu))}</b><span>aktivních kanálů</span></div>
        </div>
        ${s.hodin ? `<p class="rep-platformy"><span class="pbadge pb-twitch">Twitch</span> ${esc(num(s.hodin_twitch))} h · <span class="pbadge pb-kick">Kick</span> ${esc(num(s.hodin_kick))} h</p>` : ""}
        <div class="section-title">Nejsledovanější hry</div>
        ${r.hry.length ? `<div class="slist">${r.hry.slice(0, 10).map((h) => radekHryCesko(h, max)).join("")}</div>` : `<p class="dim">Zatím bez dat.</p>`}
        <div class="rep-sloupce">
          <section><div class="section-title">Nejvíc diváků najednou</div>${strList(r.streameri.divaci, "diváků")}</section>
          <section><div class="section-title">Nejdéle vysílali</div>${strList(r.streameri.hodiny, "hodin")}</section>
          <section><div class="section-title">Nejvíc nových sledujících</div>${strList(r.streameri.rust, "+")}</section>
          ${(r.streameri.novacci || []).length ? `<section><div class="section-title">Nově zachycené kanály</div>${strList(r.streameri.novacci, "diváků max.")}
            <p class="source-note">Poprvé jsme je viděli vysílat česky právě tento týden.</p></section>` : ""}
        </div>
        ${(r.klipy || []).length ? `<div class="section-title">Klipy týdne</div>
          <div class="regal">${r.klipy.map((k) => kartaVidea({ ...k, streamer: { jmeno: k.jmeno, login: k.login, platforma: k.platforma, profilovka: k.profilovka } }, true)).join("")}</div>` : ""}
        ${r.udalosti.length ? `<div class="section-title">Rekordy a milníky</div><div class="slist">${r.udalosti.map((u) => `<a class="srow" href="${esc(profilUrl(u))}">${av(u)}
            <div class="info"><h3>${esc(u.jmeno)}</h3><div class="sub">${u.typ === "milnik" ? `překonal(a) ${esc(num(u.hodnota))} sledujících` : `nový rekord: ${esc(num(u.hodnota))} diváků`} · ${esc(kdy(new Date(u.cas)))}</div></div></a>`).join("")}</div>` : ""}
        <div class="rep-sdilet"><button type="button" class="btn-maly" id="sdilet">Sdílet odkaz</button> ${tlacitkoObrazek("sdilet-obr")}</div>
        <p class="source-note">Všechna čísla jsou z vlastních měření oficiálních API Twitche a Kicku každých 15 minut. Aktivní kanál = vysílal aspoň chvíli s 3 a více diváky. <a href="/o-webu#data">Jak počítáme</a></p>
      </article>`;
    const bo = document.getElementById("sdilet-obr");
    if (bo) bo.onclick = () => sdilejObrazek({ stitek: `Report týdne · ${datumCz(r.od).replace(/\s?\d{4}$/, "")}–${datumCz(r.do)}`, nadpis: "Týden na české herní scéně", odkaz: `/report/${r.probiha ? "aktualni" : r.tyden}`,
      radky: [[`${num(s.hodin)} h`, `sledování${s.zmena != null && s.hodin_pred ? ` (${s.zmena >= 0 ? "+" : ""}${s.zmena} % proti minulému týdnu)` : ""}`],
        r.hry[0] && [r.hry[0].hra.slice(0, 26), `nejsledovanější hra · ${num(r.hry[0].hodin)} h`],
        r.streameri.divaci[0] && [r.streameri.divaci[0].jmeno.slice(0, 24), `nejvíc diváků najednou · ${num(r.streameri.divaci[0].hodnota)}`],
        s.spicka && [num(s.spicka.divaci), "diváků českých streamů ve špičce"]].filter(Boolean) });
    const b = document.getElementById("sdilet");
    if (b) b.onclick = async () => {
      const url = `${location.origin}/report/${r.probiha ? "aktualni" : r.tyden}`;
      try { if (navigator.share) await navigator.share({ title: document.title, text: r.vety[0] || "", url }); else { await navigator.clipboard.writeText(url); b.textContent = "Odkaz zkopírován"; } } catch { /* zrušeno */ }
    };
  }

  async function strankaHra(sl, steamId = "") {
    app.innerHTML = `<div class="profile"><div class="kostra kostra-banner"></div>${kostra(4)}</div>`;
    let h;
    try { h = await nacti(steamId ? "hra-steam/" + enc(steamId) : "hra/" + enc(sl)); }
    catch { nastavTitulek("Hra nenalezena"); app.innerHTML = `<p class="empty">Hru jsme nenašli. <a href="/hry">Co hraje Česko</a></p>`; return; }
    nastavTitulek(`${h.nazev} – cena, čeština, hodnocení a čeští streameři`);
    const [a, b] = barvaHry(h.slug || slug(h.nazev));
    const st = h.info?.steam, gog = h.info?.gog, ep = h.info?.epic, stat = h.statistiky || { dny: [] }, pas = h.pas || {};
    const hist = pas.ceny?.historie || [];
    const cz = st?.cestina;
    const maxDen = Math.max(1, ...stat.dny.map((d) => d.hodin));
    const obchod = (nazev, cls, url, radek) => `<a class="obchod-r ${cls}" href="${esc(bezpecnaUrl(url))}" target="_blank" rel="noopener noreferrer"><b>${nazev}</b><span>${radek}</span></a>`;
    const cenaTxt = (o) => o.zdarma || o.cena === 0 ? "Zdarma" : o.cena == null ? "Cena neuvedena"
      : `${o.sleva ? `<s>${esc(cena(o.puvodni, o.mena))}</s> <em>−${Number(o.sleva) || 0} %</em> ` : ""}<strong>${esc(cena(o.cena, o.mena))}</strong>`;
    const obchody = [
      st && obchod("Steam", "ob-steam", st.url, cenaTxt(st) + (st.min90 != null && st.cena > 0 ? `<br><small>${st.cena <= st.min90 ? "nejnižší cena za 90 dní" : `nejníž za 90 dní ${esc(cena(st.min90, st.mena))}`}</small>` : "")),
      gog && obchod("GOG", "ob-gog", gog.url, cenaTxt(gog)),
      ep && obchod("Epic Games", "ob-epic", ep.url, ep.zdarma_ted ? `<strong>Zdarma</strong> ${ep.do ? esc(zbyva(ep.do)) : ""}` : `zdarma od ${esc(new Date(ep.od).toLocaleDateString(LOC))}`),
    ].filter(Boolean);
    const fakta = [
      cz && ["Čeština (podle Steamu)", cz.dabing ? "✓ dabing i titulky" : cz.rozhrani ? "✓ texty (rozhraní nebo titulky)" : "✗ bez češtiny"],
      st?.hodnoceni && ["Hodnocení hráčů", `${hodnoceniHry(st)} <span class="dim">Steam</span>`],
      gog?.hodnoceni && ["Hodnocení GOG", `${gog.hodnoceni.toLocaleString(LOC)} / 5`],
      st?.metacritic && ["Metacritic", String(st.metacritic)],
      st?.hraci_ted != null && ["Hraje právě teď", `${esc(num(st.hraci_ted))} hráčů na Steamu (celý svět)`],
      st?.vydani && [st.chysta_se ? "Vyjde" : "Vydáno", esc(st.vydani)],
      st?.zanry?.length && ["Žánr", esc(st.zanry.join(", "))],
      st?.vyvojari?.length && ["Vývojář", esc(st.vyvojari.join(", "))],
    ].filter(Boolean);
    // Pozadí hry = oficiální pozadí ze Steamu přes celou šířku (ztmavené). Na počítači dva sloupce: vpravo nákup a pulsometr.
    const pozadi = https(st?.pozadi);
    app.innerHTML = `${pozadi ? `<div class="hra-pozadi" aria-hidden="true"><img src="${esc(pozadi)}" alt="" referrerpolicy="no-referrer"></div>` : ""}<div class="profile hra-stranka">
      <a class="back" href="${h.slug ? "/hry" : "/vydani"}">${h.slug ? "← Co hraje Česko" : "← Hry"}</a>
      <div class="hra-hero${https(st?.obrazek) ? " s-obr" : ""}" data-a="${esc(a)}" data-b="${esc(b)}">
        ${https(st?.obrazek) ? `<img class="hra-hero-img" src="${esc(st.obrazek)}" alt="" referrerpolicy="no-referrer">` : ""}
        <div class="hra-hero-t"><h1>${esc(h.nazev)}</h1>
        <p>${h.zive.length ? `${pl(h.zive.length, "český stream", "české streamy", "českých streamů")} právě živě · ${num(h.zive.reduce((x, s) => x + (s.divaci || 0), 0))} diváků` : "Teď nikdo z českých streamerů nevysílá"}</p></div></div>
      ${st?.popis ? `<p class="hra-popis">${esc(st.popis)}</p>` : ""}
      <div class="hra-mriz">
      <aside class="hra-bok" aria-label="Cena a pulsometr">
      ${pulsBlok(pas.puls)}
      ${obchody.length ? `<div class="section-title">Kde koupit</div><div class="obchody">${obchody.join("")}</div>${cenovyText(pas.ceny?.rozbor, st)}${poradceBlok(pas.ceny?.rozbor, st)}` : ""}
      ${st && !st.zdarma ? `<div class="hra-hlidat">${tlacitkoHlidat({ id: st.id, nazev: st.nazev })}${tlacitkoObrazek("hra-obr")}<span class="dim">Pošleme upozornění, až bude ve slevě. <a href="/hlidac">Hlídač cen</a></span></div>` : ""}
      ${fakta.length ? `<dl class="fakta">${fakta.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>` : ""}
      ${h.igdb_slug ? `<div class="hra-hlidat">${tlacitkoSledovat({ slug: h.igdb_slug, nazev: h.nazev, steam_id: st?.id || h.steam_id })}</div><p class="pas-srov"><a class="btn-sek btn-db" href="/databaze/${esc(h.igdb_slug)}">Celý profil hry v databázi</a></p>` : ""}
      ${h.steam_id ? `<p class="pas-srov"><a class="btn-sek" href="/porovnat-hry?ids=${esc(enc(h.steam_id))}">Porovnat s jinou hrou</a></p>` : ""}
      </aside>
      <div class="hra-hlavni">
      ${galerieHry(st)}
      ${hist.length >= 2 ? `<div class="section-title">Vývoj ceny na Steamu</div><div class="graf" id="graf-cena"></div>
        <p class="source-note">Nejnižší cena každého dne od ${esc(datumKr(hist[0].den))}, kdy cenu sledujeme (nejvýš 400 dní), v Kč. ${puvod("mereno", "Steam")}</p>` : ""}
      ${dnaBlok(pas.dna)}
      ${(pas.patche || []).length ? `<div class="section-title">Poslední aktualizace · <a href="/aktualizace?hra=${esc(enc(h.steam_id || ""))}">všechny</a></div>
        <ul class="pas-patche">${pas.patche.map((x) => `<li><span class="rr-typ" data-barva="${(TYP_PATCHE[x.typ] || TYP_PATCHE.aktualizace)[1]}">${(TYP_PATCHE[x.typ] || TYP_PATCHE.aktualizace)[0]}</span>
          <a href="${esc(bezpecnaUrl(x.url))}" target="_blank" rel="noopener noreferrer"><b>${esc(x.nadpis)}</b></a><small class="dim">${esc(datumKr(x.datum))}</small>
          ${x.shrnuti ? `<p>${esc(x.shrnuti)} ${puvod("ai", "podle oznámení na Steamu")}</p>` : ""}</li>`).join("")}</ul>
        <p class="source-note">${puvod("oficialni", "Steam")} Originální poznámky vývojářů jsou v odkazu.</p>` : ""}
      ${serieBlok(pas.igdb)}
      ${st?.pozadavky && (st.pozadavky.min.length || st.pozadavky.dop.length) ? `<details class="pozadavky"><summary>Systémové požadavky (PC)</summary>
        <div class="poz-sloupce">${st.pozadavky.min.length ? `<div><b>Minimální</b><ul>${st.pozadavky.min.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}
        ${st.pozadavky.dop.length ? `<div><b>Doporučené</b><ul>${st.pozadavky.dop.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}</div>
        <p class="source-note">Podle stránky hry na Steamu.</p></details>
        <div class="hw-na-hre" id="hw-hra"><b>Rozjede se mi to?</b> <a href="/rozjede-se?hra=${esc(st.id)}">Porovnat s mým počítačem</a></div>` : ""}
      ${!h.info ? `<p class="dim">Údaje z obchodů se načítají – zkus stránku obnovit za chvíli.</p>` : !st && !gog && !ep ? `<p class="dim">Tuhle hru jsme v obchodech Steam, GOG ani Epic pod stejným názvem nenašli – může jít o hru jen pro konzole (PlayStation, Xbox, Nintendo) nebo o kategorii jako „Just Chatting“.</p>` : ""}

      <div class="section-title">Na českých streamech</div>
      ${!h.slug ? `<p class="dim">Tuhle hru zatím nikdo z českých streamerů nevysílal (od začátku našeho měření). Jakmile ji někdo začne hrát, objeví se tu statistiky.</p>` : ""}
      <div class="rep-dlazdice"><div><b>${esc(num(stat.hodin7 || 0))}</b><span>hodin sledování ${(() => { const od = stat.dny.map((d) => d.den).filter(Boolean).sort()[0]; const dni = od ? Math.round((Date.now() - Date.parse(od + "T12:00:00Z")) / 864e5) : 7; return od && dni < 6 ? `od ${esc(new Date(od + "T12:00:00Z").toLocaleDateString(LOC, { day: "numeric", month: "numeric" }))} (od té doby měříme)` : "za 7 dní"; })()}</span></div><div><b>${esc(num(stat.spicka7 || 0))}</b><span>diváků ve špičce</span></div></div>
      ${stat.dny.length > 1 ? `<div class="sloupce" role="img" aria-label="Hodiny sledování po dnech">${stat.dny.map((d) => `<i data-h="${Math.round((d.hodin / maxDen) * 100)}" title="${esc(datumCz(d.den))}: ${d.hodin} h"></i>`).join("")}</div>
        <p class="source-note">Hodiny sledování po dnech za posledních 30 dní (od začátku měření).</p>` : ""}
      ${h.zive.length ? `<div class="section-title">Právě živě</div><div class="live-grid">${h.zive.map(kartaZive).join("")}</div>` : ""}
      ${(h.klipy || []).length ? `<div class="section-title">Nejlepší klipy</div><div class="regal">${h.klipy.map((v) => kartaVidea(v, true)).join("")}</div>` : ""}
      ${h.nejvic.length ? `<div class="section-title">Kdo hraje nejvíc</div><div class="slist">${h.nejvic.map((s, i) => radekStreamera(s, i, "hra")).join("")}</div>` : ""}
      ${h.clanky.length ? `<div class="section-title">Novinky a recenze</div><div class="grid">${h.clanky.map((c) => kartaClanku(c, 1)).join("")}</div>` : ""}
      <p class="source-note">Ceny, čeština, hodnocení a počet hráčů jsou přímo z obchodů Steam a GOG${h.info?.cas ? ` (stav ${esc(kdy(new Date(h.info.cas)))})` : ""}; vždy platí cena v obchodě. Hodiny na streamech měříme sami z API Twitche a Kicku. <a href="/o-webu#data">Jak počítáme</a></p>

      </div></div>
    </div>`;
    const gc = document.getElementById("graf-cena");
    if (gc) graf(gc, hist.map((x) => ({ v: x.cena, d: new Date(x.den + "T12:00:00").toLocaleDateString(LOC, { day: "numeric", month: "numeric" }) })), "Vývoj ceny na Steamu");
    pripojGalerii(app, st);
    const poz = app.querySelector(".hra-pozadi img");
    if (poz) poz.addEventListener("error", () => poz.parentElement.remove(), { once: true });
    app.querySelectorAll("[data-barva]").forEach((el) => el.style.setProperty("--sk", barva(el.dataset.barva, "#ffc04d")));
    // Rozjede se mi to? – když má návštěvník uložený počítač, výsledek se ukáže rovnou.
    const hwEl = document.getElementById("hw-hra"), pc = mujPc();
    if (hwEl && st?.pozadavky && (pc.gpu || pc.cpu || pc.ram)) nactiHw().then((H) => {
      if (document.getElementById("hw-hra") !== hwEl) return;
      hwEl.innerHTML = `<b>Rozjede se mi to?</b> <span class="dim">(tvůj uložený počítač · <a href="/rozjede-se?hra=${esc(st.id)}">změnit</a>)</span>${vyhodnotHw(H, pc, st.pozadavky)}`;
    }).catch(() => {});
    const ho = document.getElementById("hra-obr");
    if (ho) ho.onclick = () => sdilejObrazek({ stitek: "Hra", nadpis: h.nazev, odkaz: location.pathname,
      radky: [st?.cena != null && [st.zdarma || st.cena === 0 ? "Zdarma" : cena(st.cena, st.mena), st.sleva ? `na Steamu, sleva −${Number(st.sleva) || 0} %` : "na Steamu"],
        cz && [cz.dabing ? "CZ dabing" : cz.rozhrani ? "CZ texty" : "Bez češtiny", "čeština podle Steamu"],
        st?.hodnoceni && [`${st.hodnoceni.kladne} %`, `kladných recenzí z ${num(st.hodnoceni.recenzi)}`],
        stat.hodin7 && [`${num(stat.hodin7)} h`, "sledování na českých streamech za 7 dní"]].filter(Boolean) });
  }

  const SITE = { web: "Web", youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", x: "X", discord: "Discord" };
  function odkazySit(o) {
    const list = Object.entries(o || {}).filter(([k, v]) => SITE[k] && https(v));
    return list.length ? `<div class="site">${list.map(([k, v]) => `<a class="sit sit-${esc(k)}" href="${esc(v)}" target="_blank" rel="noopener noreferrer nofollow">${SITE[k]}</a>`).join("")}</div>` : "";
  }

  // ---------- Přehled scény ----------
  function grafSceny(el, body) {
    const W = el.clientWidth || 320, H = 190, P = 10;
    const max = Math.max(1, ...body.map((b) => b.divaci));
    const x = (i) => P + (i / Math.max(body.length - 1, 1)) * (W - 2 * P);
    const y = (v) => H - 24 - (v / max) * (H - 48);
    const cara = body.map((b, i) => `${x(i).toFixed(1)},${y(b.divaci).toFixed(1)}`).join(" ");
    const dny = [];
    body.forEach((b, i) => { const d = new Date(b.cas); if (d.getHours() === 0) dny.push([i, d.toLocaleDateString(LOC, { weekday: "short" })]); });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Počet diváků českých streamů za 7 dní">
      ${dny.map(([i]) => `<line class="g-grid" x1="${x(i)}" x2="${x(i)}" y1="12" y2="${H - 24}"></line>`).join("")}
      <polygon class="g-area" points="${x(0)},${H - 24} ${cara} ${x(body.length - 1)},${H - 24}"></polygon>
      <polyline class="g-line" points="${cara}"></polyline>
      ${dny.filter((_, k) => W > 420 || k % 2 === 0).map(([i, t]) => `<text class="g-txt" x="${x(i) + 3}" y="${H - 8}">${esc(t)}</text>`).join("")}
      <text class="g-txt" x="${W - P}" y="12" text-anchor="end">max. ${esc(num(max))} diváků</text></svg>`;
  }
  async function strankaPrehled() {
    nastavTitulek("Přehled české scény");
    if (!state.prehled) {
      app.innerHTML = `${hubHlava("prehled")}<div class="kostra kostra-graf"></div>${kostra(4)}`;
      try { state.prehled = await nacti("prehled"); } catch { app.innerHTML = `${hubHlava("prehled")}<p class="empty">Přehled se nepodařilo načíst.</p>`; return; }
    }
    if (location.pathname.replace(/\/+$/, "") !== "/prehled") return;
    const d = state.prehled, t = d.tyden;
    const mini = (list, f) => list.length ? `<div class="slist">${list.map((s, i) => `<a class="srow" href="${esc(profilUrl(s))}"><span class="rank">${i + 1}</span>${av(s)}
        <div class="info"><h3>${esc(s.jmeno)} ${platBadge(s)}</h3></div><div class="num"><b>${esc(f(s))}</b></div></a>`).join("")}</div>` : `<p class="dim">Zatím málo dat – vrať se za pár dní.</p>`;
    const den = (iso) => new Date(iso).toLocaleString(LOC, { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
    app.innerHTML = `${hubHlava("prehled")}
      <div class="section-title">Diváci českých streamů za 7 dní</div>
      ${d.graf.length >= 2 ? `<div class="graf" id="graf-scena"></div>` : `<p class="dim">Graf se začne plnit s každým během sběru (každých 15 minut).</p>`}
      <div class="prehled-grid">
        <section><div class="section-title">Nejvíc vyrostli</div>${mini(t.rust, (s) => "+" + num(s.hodnota))}</section>
        <section><div class="section-title">Rekord diváků týdne</div>${mini(t.divaci, (s) => num(s.hodnota))}</section>
        <section><div class="section-title">Nejvíc odvysílali</div>${mini(t.hodiny, (s) => s.hodnota + " h")}</section>
        <section><div class="section-title">Nejhranější hry</div>${t.hry.length ? `<div class="slist">${t.hry.map((h, i) => `<a class="srow" href="/hra/${esc(slug(h.hra))}"><span class="rank">${i + 1}</span>
          <div class="info"><h3>${esc(h.hra)}</h3><div class="sub">${pl(h.streameru, "streamer", "streameři", "streamerů")}</div></div><div class="num"><b>${h.hodin} h</b></div></a>`).join("")}</div>` : `<p class="dim">Zatím málo dat.</p>`}</section>
      </div>
      <div class="section-title">Milníky a rekordy</div>
      ${d.milniky.length ? `<div class="milniky">${d.milniky.map((m) => `<a class="milnik" href="${esc(profilUrl(m.streamer))}">${av(m.streamer)}
          <div><b>${esc(m.streamer.jmeno)}</b> ${m.typ === "milnik" ? `překonal ${esc(num(m.hodnota))} sledujících` : `má nový rekord: ${esc(num(m.hodnota))} diváků`}
          <div class="sub">${esc(kdy(new Date(m.cas)))}</div></div></a>`).join("")}</div>` : `<p class="dim">Až někdo překoná rekord nebo milník sledujících, uvidíš to tady.</p>`}
      <div class="section-title">Kalendář: dnes a zítra</div>
      ${d.kalendar.length ? `<div class="rozvrh">${d.kalendar.map((k) => `<a class="termin" href="${esc(profilUrl(k.streamer))}"><b>${esc(den(k.zacatek))}</b>
          <span>${esc(k.streamer.jmeno)} – ${esc(k.nazev || k.hra || "stream")}</span>${k.hra ? `<span class="dim">${esc(k.hra)}</span>` : ""}</a>`).join("")}</div>`
        : `<p class="dim">Kalendář bere rozvrhy, které si streameři nastavili na Twitchi. Plní se postupně.</p>`}
      <p class="source-note">Přehled počítáme z vlastních záznamů od začátku provozu webu. Čím déle web běží, tím přesnější je.</p>`;
    const g = document.getElementById("graf-scena");
    if (g) grafSceny(g, d.graf);
  }

  // ---------- Porovnání dvou streamerů ----------
  async function strankaPorovnat() {
    nastavTitulek("Porovnat streamery");
    const par = new URLSearchParams(location.search);
    const strany = await Promise.all(["a", "b"].map(async (k) => {
      const v = par.get(k);
      if (!v || !/^(twitch|kick)\/[a-z0-9_-]{1,30}$/i.test(v)) return null;
      try { return await nacti("streamer/" + v.split("/").map(enc).join("/")); } catch { return null; }
    }));
    const slot = (s, k) => s
      ? `<div class="por-slot">${av(s, true)}<b>${esc(s.jmeno)}</b>${platBadge(s)}<a class="link" href="${esc(profilUrl(s))}">Profil</a>
          <button type="button" class="chip" data-zmenit="${k}">Změnit</button></div>`
      : `<div class="por-slot por-prazdny"><input class="search" data-hledat="${k}" type="search" placeholder="Najdi streamera" autocomplete="off"><div class="por-vysledky" id="vys-${k}"></div></div>`;
    const [a, b] = strany;
    const radky = a && b ? [
      ["Sledující", a.sledujici, b.sledujici, (v) => v == null ? "–" : num(v)],
      ["Rekord diváků", a.max_divaku, b.max_divaku, num],
      ["Odvysíláno (naše měření, max. 30 dní)", a.hodin30, b.hodin30, (v) => (v || 0) + " h"],
      ["Streamů od začátku sledování", a.streamu, b.streamu, (v) => v || 0],
      ["Právě", a.zive ? 1 : 0, b.zive ? 1 : 0, (v) => v ? "živě" : "offline"],
    ] : [];
    app.innerHTML = `${hubHlava("")}
      <div class="live-head"><h1>Porovnat streamery</h1><p>Vyber dva streamery a porovnej je vedle sebe.</p></div>
      <div class="por">${slot(a, "a")}<div class="por-vs">vs</div>${slot(b, "b")}</div>
      ${radky.length ? `<table class="por-tab"><tbody>${radky.map(([n, x, y, f]) => {
          const vx = x ?? -1, vy = y ?? -1;
          return `<tr><td class="${vx > vy ? "vyhra" : ""}">${esc(f(x))}</td><th>${n}</th><td class="${vy > vx ? "vyhra" : ""}">${esc(f(y))}</td></tr>`; }).join("")}
        <tr><td>${esc(a.hry?.[0]?.hra || "–")}</td><th>Nejhranější hra</th><td>${esc(b.hry?.[0]?.hra || "–")}</td></tr></tbody></table>` : ""}`;
    const nastav = (k, v) => { const q = new URLSearchParams(location.search); v ? q.set(k, v) : q.delete(k); jdi("/porovnat?" + q.toString()); };
    app.querySelectorAll("[data-zmenit]").forEach((btn) => btn.onclick = () => nastav(btn.dataset.zmenit, ""));
    app.querySelectorAll("[data-hledat]").forEach((inp) => {
      let t;
      inp.oninput = () => { clearTimeout(t); t = setTimeout(async () => {
        const q = inp.value.trim();
        const el = document.getElementById("vys-" + inp.dataset.hledat);
        if (q.length < 2) { el.innerHTML = ""; return; }
        let list = [];
        try { list = await nacti("streameri?q=" + enc(q)); } catch {}
        el.innerHTML = list.slice(0, 6).map((s) => `<button type="button" class="por-vyber" data-v="${esc(s.platforma)}/${esc(s.login)}">${av(s)} ${esc(s.jmeno)} ${platBadge(s)}</button>`).join("") || `<p class="dim">Nikoho jsme nenašli.</p>`;
        el.querySelectorAll("[data-v]").forEach((b2) => b2.onclick = () => nastav(inp.dataset.hledat, b2.dataset.v));
      }, 300); };
    });
  }

  // ---------- Domů: herní katalog (Steam, Epic, GOG) ----------
  const OBCHOD = { steam: "Steam", epic: "Epic Games", gog: "GOG" };
  function cena(c, mena) {
    if (c == null) return "";
    if (c === 0) return "Zdarma";
    try { return new Intl.NumberFormat(LOC, { style: "currency", currency: mena || "CZK", maximumFractionDigits: c % 1 ? 2 : 0 }).format(c); }
    catch { return `${c} ${mena || ""}`; }
  }
  function zbyva(iso) {
    const ms = new Date(iso) - Date.now();
    if (!(ms > 0)) return "";
    const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
    return d ? `ještě ${d} d ${h} h` : `ještě ${h} h ${Math.floor((ms % 36e5) / 6e4)} min`;
  }
  const obchodStitek = (o) => `<span class="obchod ob-${esc(o)}">${esc(OBCHOD[o] || o)}</span>`;
  function kartaHry(h, { velka = false, odpocet = null, poradi = null } = {}) {
    return `<a class="hk${velka ? " hk-velka" : ""}" ${odkazHry(h)}>
      <div class="hk-obr">${https(h.obrazek) ? `<img src="${esc(h.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
        ${obchodStitek(h.obchod)}${h.sleva > 0 ? `<span class="hk-sleva">−${Number(h.sleva) || 0} %</span>` : ""}${poradi ? `<span class="hk-poradi">${poradi}</span>` : ""}</div>
      <div class="hk-t"><b>${esc(h.nazev)}</b>${czStitek(h)}
        ${odpocet ? `<span class="hk-odpocet">${esc(odpocet)}</span>` : ""}
        ${h.cena != null ? `<span class="hk-cena">${h.puvodni && h.puvodni > h.cena ? `<s>${esc(cena(h.puvodni, h.mena))}</s> ` : ""}<b>${esc(cena(h.cena, h.mena))}</b></span>` : ""}
        ${h.hracu ? `<span class="hk-hraci" title="Nejvíc hráčů najednou za posledních 24 h (Steam)">${esc(num(h.hracu))} hráčů ve špičce</span>` : ""}${hodnoceniHry(h)}</div></a>`;
  }
  // Hodnocení hráčů ze Steamu – jen skutečná čísla ze Steamu, nic dopočítaného navíc.
  const hodnoceniHry = (h) => h.hodnoceni ? `<span class="hk-hod${h.hodnoceni.kladne >= 80 ? " hod-dobre" : h.hodnoceni.kladne < 50 ? " hod-spatne" : ""}">👍 ${h.hodnoceni.kladne} % z ${esc(num(h.hodnoceni.recenzi))} recenzí</span>` : "";
  const normNazev = (s) => String(s || "").toLowerCase().replace(/[™®©]/g, "").replace(/[^a-z0-9á-ž]+/g, " ").trim();
  function kartaVidea(v, klip = false) {
    return `<a class="hk vk" href="${esc(bezpecnaUrl(v.url))}" target="_blank" rel="noopener noreferrer">
      <div class="hk-obr vk-obr">${https(v.nahled) ? `<img src="${esc(v.nahled)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
        <span class="obchod ${klip ? "ob-twitch" : "ob-yt"}">${klip ? "Klip" : "YouTube"}</span>${klip && v.delka ? `<span class="hk-sleva vk-delka">${Math.round(Number(v.delka) || 0)} s</span>` : ""}</div>
      <div class="hk-t"><b>${esc(v.nazev)}</b>
        <span class="vk-autor">${av(v.streamer)}${esc(v.streamer.jmeno)}</span>
        <span class="hk-hraci">${klip ? `${esc(num(v.zhlednuti || 0))} zhlédnutí · ` : ""}${esc(kdy(new Date(v.cas)))}</span></div></a>`;
  }
  const vyberHruTydne = (k) => (k.epic_zdarma || [])[0] || (k.steam_zdarma || [])[0] || (k.steam_slevy || [])[0] || null;
  function hraTydne(k, h, dalsi) {
    if (!h) return "";
    const n = normNazev(h.nazev);
    const vsechnyHry = [...(k.steam_top || []), ...(k.steam_hrane || []), ...(k.steam_slevy || [])];
    const hod = h.hodnoceni || vsechnyHry.find((x) => x.hodnoceni && normNazev(x.nazev) === n)?.hodnoceni;
    const hrajou = n.length > 3 ? state.zive.streamy.filter((s) => s.hra && normNazev(s.hra) === n) : [];
    const pise = n.length > 3 ? state.clanky.filter((c) => normNazev(c.nadpis).includes(n)).slice(0, 3) : [];
    const proc = h.cena === 0 || h.do ? `Zdarma na ${OBCHOD[h.obchod] || h.obchod}${h.do ? ` – ${zbyva(h.do)}` : ""}` : `Sleva −${Number(h.sleva) || 0} % na ${OBCHOD[h.obchod] || h.obchod}`;
    return `<section id="hra-tydne" class="sekce hra-tydne">
      <a class="ht-obr" ${odkazHry(h)}>${https(h.obrazek) ? `<img src="${esc(h.obrazek)}" alt="" referrerpolicy="no-referrer">` : ""}</a>
      <div class="ht-t"><span class="ht-stitek">Hra týdne</span>
        <h2><a ${odkazHry(h)}>${esc(h.nazev)}</a></h2>
        <p class="ht-proc">${esc(proc)}</p>
        ${hod ? `<p>${hodnoceniHry({ hodnoceni: hod })} <span class="dim">(Steam)</span></p>` : ""}
        <p>${hrajou.length ? `Právě ji hraje: ${hrajou.slice(0, 4).map((s) => `<a href="${esc(profilUrl(s))}">${esc(s.jmeno)}</a>`).join(", ")}` : `<span class="dim">Teď ji nikdo z českých streamerů nehraje.</span>`}</p>
        ${dalsi ? `<p class="ht-pise">${dalsi}</p>` : ""}
        ${pise.length ? `<p class="ht-pise">Píše se o ní: ${pise.map((c) => `<a href="/clanek/${esc(enc(c.id))}">${esc(c.nadpis)}</a>`).join(" · ")}</p>` : ""}
      </div></section>`;
  }
  const regal = (list, opt) => list.length ? `<div class="regal">${list.map((h, i) => kartaHry(h, typeof opt === "function" ? opt(h, i) : opt)).join("")}</div>` : `<p class="dim">Teď tu nic není – obchody se načítají, zkus to za chvíli.</p>`;
  const prepinac = (id, volby, akt) => `<div class="mini-seg" role="group">${volby.map(([k, v]) => `<button type="button" class="ms-b${k === akt ? " on" : ""}" data-${id}="${k}">${v}</button>`).join("")}</div>`;

  // ---------- Domů: rozcestník – co je nového dnes, kdo je živě, nástroje. Obchody jsou na /obchody. ----------
  const IKONY = {
    hrat: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="12" rx="4"/><path d="M7 13h4M9 11v4M15.5 12.5h.01M17.5 14.5h.01"/></svg>',
    pc: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    vn: '<svg viewBox="0 0 24 24"><path d="M12 4v16M6 10l6-6 6 6M6 14l6 6 6-6"/></svg>',
    cz: '<svg viewBox="0 0 24 24"><path d="M4 21V9l8-5 8 5v12M9 21v-6h6v6"/></svg>',
    radar: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="1"/></svg>',
    trendy: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
    srovnani: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="16" rx="2"/><rect x="14" y="4" width="7" height="16" rx="2"/></svg>',
    jazyk: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/></svg>',
    slevy: '<svg viewBox="0 0 24 24"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/></svg>',
    hlidac: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>',
    kalendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    aktualizace: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14-5l-2 2M4 13a8 8 0 0 0 14 5l2-2"/><path d="M4 4v4h4M20 20v-4h-4"/></svg>',
    akce: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>',
    studia: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 6l2 4M12 6l2 4M17 6l2 4"/></svg>',
    databaze: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
  };
  // Ikona každé stránky v rozcestníku Hry a v hlavičce stránky.
  const IKONA_STRANKY = { radar: "radar", trendy: "trendy", "porovnat-hry": "srovnani", "co-hrat": "hrat", "rozjede-se": "pc", cestina: "jazyk",
    obchody: "slevy", hlidac: "hlidac", vydani: "kalendar", aktualizace: "aktualizace", akce: "akce", "ceska-scena": "cz", studia: "studia", "vyssi-nizsi": "vn", databaze: "databaze" };
  const NASTROJE_DOMU = [
    ["/co-hrat", "Co dnes hrát?", "Pár ťuknutí a máš tip na hru.", "#ffc04d", "hrat"],
    ["/rozjede-se", "Rozjede se mi to?", "Porovnej svůj počítač s hrou.", "#39d5ff", "pc"],
    ["/vyssi-nizsi", "Vyšší, nebo nižší?", "Denní minihra se skutečnými čísly.", "#8b5cff", "vn"],
    ["/ceska-scena", "Česká herní scéna", "Co je nového u českých studií.", "#ff3d7f", "cz"],
  ];
  async function strankaDomu() {
    nastavTitulek("");
    if (!state.domu) {
      app.innerHTML = `<section class="uvod"><h1>Hry mají tep.<br>My ho <em>měříme.</em></h1></section>${kostra(3)}`;
      const [ra, vd, vy, ak, pa, , rd] = await Promise.allSettled([nacti("ranni"), nacti("vydani?limit=10"), nacti("vyroci"), state.akce ? state.akce : nacti("akce"), nacti("aktualizace"), nactiKatalog(), nacti("radar")]);
      const ok = (x) => (x.status === "fulfilled" ? x.value : null);
      state.domu = { ranni: ok(ra), vydani: ok(vd), vyroci: ok(vy), aktualizace: ok(pa) };
      if (ok(rd)) { state.radar = rd.value; state.radarCas = Date.now(); }
      if (ak.status === "fulfilled") state.akce = ak.value;
    }
    if (location.pathname !== "/" && location.pathname !== "") return;
    const { ranni, vydani, vyroci, aktualizace } = state.domu;
    const k = state.katalog || {};
    const tydne = vyberHruTydne(k);
    const zdarmaVse = [...(k.epic_zdarma || []), ...(k.steam_zdarma || [])];
    const maxSleva = Math.max(0, ...(k.steam_slevy || []).map((h) => h.sleva || 0), ...(k.gog_slevy || []).map((h) => h.sleva || 0));
    const prednost = (c) => (vJazyku(c) && Date.now() - datum(c) < 2 * 864e5 ? 1 : 0); // čerstvé zprávy v jazyce návštěvníka první
    const zpravy = [...state.clanky].sort((a, b) => (prednost(b) - prednost(a)) || (datum(b) - datum(a))).slice(0, 4);
    const dnesRanni = ranni?.body?.length && ranni.den === new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
    const akce = (state.akce?.akce || [])[0];
    const zpravDnes = state.clanky.filter((c) => Date.now() - datum(c) < 864e5).length;
    const brzy = (vydani?.hry || []).slice(0, 10);
    const patchu24 = (aktualizace?.polozky || []).filter((p) => Date.now() - Date.parse(p.datum) < 864e5).length;
    // Nejdřív aktualizace se shrnutím, nejpopulárnější hry první; jedna hra jen jednou.
    const patche = (() => { const vid = new Set(); return [...(aktualizace?.polozky || [])].filter((p) => Date.now() - Date.parse(p.datum) < 7 * 864e5)
      .sort((a, b) => (b.stav === "hotovo") - (a.stav === "hotovo") || (a.poradi || 9999) - (b.poradi || 9999)).filter((p) => !vid.has(p.hra) && vid.add(p.hra)).slice(0, 4); })();
    // Radar na Domů: 5 nejčerstvějších událostí kromě aktualizací (ty mají vlastní blok níž), z každého druhu nejvýš 2.
    const radarDomu = (() => { const n = {}; return (state.radar?.udalosti || []).filter((u) => u.typ !== "aktualizace" && (n[u.typ] = (n[u.typ] || 0) + 1) <= 2).slice(0, 5); })();
    app.innerHTML = `
      <section class="uvod">
        <div class="uvod-text">
          <h1>Hry mají tep.<br>My ho <em>měříme.</em></h1>
          <p class="uvod-perex">Herní novinky, slevy, aktualizace a vydání – každý den, česky a s čísly, která se dají ověřit.</p>
          <div class="uvod-cisla">
            <a href="/novinky"><b>${esc(num(zpravDnes))}</b><span>zpráv za 24 h</span></a>
            <a href="/obchody"><b>${esc(num(zdarmaVse.length))}</b><span>${zdarmaVse.length === 1 ? "hra zdarma" : zdarmaVse.length >= 2 && zdarmaVse.length <= 4 ? "hry zdarma" : "her zdarma"}</span></a>
            <a href="/aktualizace"><b>${esc(num(patchu24))}</b><span>aktualizací za 24 h</span></a>
          </div>
        </div>
        <div class="uvod-monitor">
          ${ekg(zpravDnes, true)}
          <p class="uvod-veta"><span class="zivy-bod" aria-hidden="true"></span>Tep herního světa <b>${tepZDivaku(zpravDnes)}/min</b>${brzy[0] ? ` · příští velké vydání: <a href="${brzy[0].steam_id ? `/hra/steam/${esc(brzy[0].steam_id)}` : "/vydani"}"><b>${esc(brzy[0].nazev)}</b></a>` : ""}</p>
        </div>
      </section>
      ${akce ? `<a class="pristi-akce" href="/akce"><span class="akce-typ">${esc(TYP_AKCE[akce.typ] || "")}</span>
        <b>${esc(akce.nazev)}</b><span>${akce.bezi ? "probíhá · končí za" : "za"} <b data-odpocet="${esc(akce.bezi ? akce.do : akce.od)}"></b></span></a>` : ""}

      <div class="mozaika">
        <section class="blok m12 domu-moje" id="moje-hry" hidden></section>
        ${ranni?.body?.length ? `<section class="ranni-karta ${tydne ? "m7" : "m12"}">
            <header><span class="ai-stitek">Sestavila AI</span><h2><a href="/ranni">${dnesRanni ? "Ranní přehled" : "Poslední ranní přehled"}</a></h2><span class="dim">${esc(denCz(ranni.den))}</span></header>
            ${bodyRanni(ranni, 5)}
            <a class="dalsi-odkaz" href="/novinky">Všechny novinky</a>
          </section>` : ""}

        ${tydne ? `<a class="hra-velka ${ranni?.body?.length ? "m5" : "m12"}" ${odkazHry(tydne)}>${https(tydne.obrazek) ? `<img src="${esc(tydne.obrazek)}" alt="" referrerpolicy="no-referrer">` : ""}
          <div class="hv-t"><span class="hv-pill">${tydne.cena === 0 || tydne.do ? `Zdarma na ${esc(OBCHOD[tydne.obchod] || tydne.obchod)}${tydne.do ? ` · ${esc(zbyva(tydne.do))}` : ""}` : `Sleva −${Number(tydne.sleva) || 0} % na ${esc(OBCHOD[tydne.obchod] || tydne.obchod)}`}</span>
            <h2>${esc(tydne.nazev)}</h2>
            <p>Hra týdne${zdarmaVse.length > 1 ? ` · další ${pl(zdarmaVse.length - 1, "hra", "hry", "her")} zdarma` : ""}${maxSleva ? ` · slevy až −${maxSleva} %` : ""}</p></div></a>` : ""}

        ${radarDomu.length ? `<section class="blok m12 domu-radar">
          <div class="section-title">Na radaru · <a href="/radar">všechno, co se děje</a></div>
          <div class="radar-l radar-kratky">${radarDomu.map(radekRadaru).join("")}</div>
        </section>` : ""}

        ${patche.length ? `<section class="blok m12 domu-patche">
          <div class="section-title">Co je nového ve hrách · <a href="/aktualizace">všechny aktualizace</a></div>
          <div class="patche-mrizka">${patche.map((p) => kartaPatche(p, true)).join("")}</div>
          <p class="source-note">Oficiální poznámky vývojářů ze Steamu, česky vysvětlené AI. Klikni na hru pro detail.</p>
        </section>` : ""}

        ${brzy.length ? `<section class="blok m12">
          <div class="section-title">Brzy vyjde · <a href="/vydani">celý kalendář</a></div>
          <div class="police police-mriz rada">${brzy.slice(0, 8).map((h) => `<a class="obal" ${h.steam_id ? `href="/hra/steam/${esc(h.steam_id)}"` : `href="${esc(dbOdkaz(h.igdb) || "/vydani")}"`}>
              ${https(h.obrazek) ? `<img src="${esc(h.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="obal-bez">${esc(h.nazev[0])}</span>`}
              ${h.presne ? `<span class="obal-cip">${esc(dnyDoVydani(h.datum).replace("vychází ", ""))}</span>` : ""}
              <b>${esc(h.nazev)}</b><small>${h.presne ? esc(datumVydani(h.datum)) : esc(h.human)}${h.cestina > 0 ? ` · <span class="cz">${h.cestina === 2 ? "CZ dabing" : "CZ texty"}</span>` : ""}</small></a>`).join("")}</div>
        </section>` : ""}

        <section class="blok m12">
          <div class="section-title">Nejnovější zprávy · <a href="/novinky">všechny</a></div>
          ${zpravy.length ? `<div class="rec-list">${zpravy.map((c) => `<a class="rec" href="/clanek/${esc(enc(c.id))}">
              ${https(c.obrazek) ? `<img src="${esc(c.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="rec-bez"></div>`}
              <div><b>${esc(c.nadpis)}</b><span class="dim">${esc(c.zdroje?.[0]?.nazev || "Herní puls")} · ${esc(kdy(datum(c)))}</span></div></a>`).join("")}</div>`
            : `<p class="dim">Zprávy se načítají.</p>`}
        </section>

        <section class="blok m12">
          <div class="section-title">Vyzkoušej · <a href="/pruvodce">všechno o hrách</a></div>
          <div class="nastroje">${NASTROJE_DOMU.map(([h, t, p, b, ik]) => `<a class="nastroj" href="${h}" data-barva="${b}"><span class="n-ikona" aria-hidden="true">${IKONY[ik]}</span><div><b>${t}</b><span>${p}</span></div></a>`).join("")}</div>
        </section>

        ${vyroci?.hry?.length ? `<section class="blok m12">
          <div class="section-title">Dnes před lety vyšlo</div>
          <div class="police police-mriz rada">${vyroci.hry.slice(0, 8).map((h) => `<a class="obal" ${h.steam ? `href="/hra/steam/${esc(h.steam)}"` : dbOdkaz(h.igdb) ? `href="${esc(dbOdkaz(h.igdb))}"` : `href="${esc(bezpecnaUrl(h.igdb))}" target="_blank" rel="noopener noreferrer"`}>
              ${https(h.obrazek) ? `<img src="${esc(h.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="obal-bez">${esc(h.nazev[0])}</span>`}
              <span class="obal-cip">před ${pl(Number(h.pred) || 0, "rokem", "lety", "lety")}</span><b>${esc(h.nazev)}</b><small>${Number(h.rok) || ""}</small></a>`).join("")}</div>
        </section>` : ""}
      </div>

      <a class="ai-stav" href="/stav" role="status"><span class="ai-jadro" aria-hidden="true"></span>
        <div><b>AI správce webu</b>
        <span>${(() => { const n = new Set(state.clanky.map((c) => c.zdroje?.[0]?.nazev).filter(Boolean)).size; return n ? `čtu zprávy z ${pl(n, "webu", "webů", "webů")}` : "čtu herní weby"; })()}
        ${k.cas ? ` · obchody zkontrolovány v ${esc(hhmm(k.cas))}` : ""} · <u>deník AI</u></span></div></a>`;
    app.querySelectorAll("[data-barva]").forEach((el) => el.style.setProperty("--sk", barva(el.dataset.barva, "#ffc04d")));
    blokMojeHry(app.querySelector("#moje-hry"));
    spustOdpocty();
  }

  // Slevy a hry zdarma: všechno z obchodů Steam, Epic a GOG na jedné stránce (dřív na Domů).
  async function nactiKatalog() {
    if (state.katalog) return;
    const [k, cz] = await Promise.allSettled([nacti("katalog"), nacti("cestina?filtr=sleva")]);
    state.czSlevy = cz.status === "fulfilled" ? cz.value.hry || [] : [];
    state.katalog = k.status === "fulfilled" ? k.value : {};
  }
  async function strankaObchody() {
    nastavTitulek("Slevy a hry zdarma – Steam, Epic, GOG");
    if (!state.katalog || !state.studia) {
      app.innerHTML = `${hubHry("obchody", "Slevy a hry zdarma", "")}${kostra(3)}`;
      const [, stu] = await Promise.allSettled([nactiKatalog(), state.studia ? state.studia : nacti("studia")]);
      if (stu.status === "fulfilled") state.studia = stu.value;
    }
    if (location.pathname.replace(/\/+$/, "") !== "/obchody") return;
    const k = state.katalog;
    const zdarmaVse = [...(k.epic_zdarma || []), ...(k.steam_zdarma || [])];
    const tydne = vyberHruTydne(k);
    // Hra týdne se v sekci „Hry zdarma“ neopakuje; když jiná hra zdarma není, sekce se skryje.
    const zdarma = zdarmaVse.filter((h) => h !== tydne);
    const pristi = (k.epic_brzy || []).length ? `Příští týden zdarma na Epicu: ${k.epic_brzy.map((h) => `<b>${esc(h.nazev)}</b>`).join(", ")}` : "";
    const slevy = state.slevyObchod === "gog" ? (k.gog_slevy || []) : (k.steam_slevy || []);
    const top = state.topObchod === "gog" ? (k.gog_trend || []) : (k.steam_top || []);
    const noveBrzy = state.noveBrzy === "brzy" ? (k.steam_brzy || []) : (k.steam_nove || []);
    const hrane = k.steam_hrane || [];
    const maxSleva = Math.max(0, ...(k.steam_slevy || []).map((h) => h.sleva), ...(k.gog_slevy || []).map((h) => h.sleva));
    app.innerHTML = `
      ${hubHry("obchody", "Slevy a hry zdarma", "Hry zdarma na Epicu a Steamu, největší slevy na Steamu a GOGu a co se právě hraje. Ceny bereme přímo z obchodů.")}
      <p class="home-shrnuti">${zdarmaVse.length ? `<a href="#hra-tydne"><b>${pl(zdarmaVse.length, "hra", "hry", "her")} zdarma</b></a>` : ""}
        ${maxSleva ? `<a href="#slevy">slevy až <b>−${maxSleva} %</b></a>` : ""}
        ${hrane[0] ? `<a href="#hrane">nejhranější: <b>${esc(hrane[0].nazev)}</b></a>` : ""}</p>

      ${hraTydne(k, tydne, zdarma.length ? "" : pristi)}
      ${zdarma.length ? `<section id="zdarma" class="sekce sekce-zdarma">
        <div class="section-title">Další hry zdarma ${aiCip("Epic · Steam", k.cas)}</div>
        <div class="regal regal-velky">${zdarma.map((h) => kartaHry(h, { velka: true, odpocet: h.do ? zbyva(h.do) : "trvale" })).join("")}</div>
        ${pristi ? `<p class="dalsi-zdarma">${pristi}</p>` : ""}
      </section>` : ""}

      <section id="slevy" class="sekce">
        <div class="section-title">Největší slevy ${aiCip(state.slevyObchod === "gog" ? "GOG" : "Steam", k.cas)} ${prepinac("so", [["steam", "Steam"], ["gog", "GOG"]], state.slevyObchod)}</div>
        ${regal(slevy, {})}
      </section>

      ${(state.czSlevy || []).length ? `<section class="sekce">
        <div class="section-title">Ve slevě a česky · <a href="/cestina">Má to češtinu?</a></div>
        ${regal(state.czSlevy.slice(0, 15), {})}
        <p class="source-note">Hry s českým textem nebo dabingem (podle údajů na Steamu), které jsou právě ve slevě. Chceš upozornit na slevu konkrétní hry? <a href="/hlidac">Hlídač cen</a></p>
      </section>` : ""}

      <section id="hrane" class="sekce">
        <div class="section-title">Nejhranější na Steamu ${aiCip("Steam API", k.cas)}</div>
        ${hrane.length ? `<div class="slist">${hrane.slice(0, 10).map((h, i) => `<a class="srow" ${odkazHry(h)}>
            <span class="rank">${i + 1}</span>${https(h.obrazek) ? `<img class="hra-cap" src="${esc(h.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="hra-cap"></div>`}
            <div class="info"><h3>${esc(h.nazev)}</h3>${hodnoceniHry(h)}<div class="bar"><i data-w="${Math.round((h.hracu || 0) / Math.max(1, hrane[0].hracu || 1) * 100)}"></i></div></div>
            <div class="num"><b>${esc(num(h.hracu || 0))}</b>hráčů</div></a>`).join("")}</div>
          <p class="source-note">Denní špička: nejvíc hráčů najednou za posledních 24 hodin podle Steamu (ne aktuální počet).</p>` : `<p class="dim">Žebříček se načítá.</p>`}
      </section>

      <section class="sekce">
        <div class="section-title">${state.topObchod === "gog" ? "Trendy na GOGu" : "Nejprodávanější na Steamu"} ${prepinac("to", [["steam", "Steam"], ["gog", "GOG"]], state.topObchod)}</div>
        ${regal(top, (h, i) => ({ poradi: i + 1 }))}
      </section>

      <section class="sekce">
        <div class="section-title">${state.noveBrzy === "brzy" ? "Brzy vyjde" : "Nově vydané"} ${prepinac("nb", [["nove", "Nové"], ["brzy", "Brzy"]], state.noveBrzy)}</div>
        ${regal(noveBrzy, {})}
      </section>

      ${(() => { const v = (state.studia?.videa || []); const t = v.filter((x) => /trailer|teaser|reveal|gameplay|launch|announce/i.test(x.nazev)); const l = (t.length >= 4 ? t : v).slice(0, 15);
        return l.length ? `<section class="sekce"><div class="section-title">Nové trailery · <a href="/studia">studia a platformy</a></div>
          <div class="regal">${l.map(kartaTraileru).join("")}</div><p class="source-note">Z oficiálních YouTube kanálů platforem a studií.</p></section>` : ""; })()}

      <p class="source-note">Ceny a nabídky jsou z veřejných stránek obchodů Steam, Epic Games Store a GOG${k.cas ? `, aktualizováno ${esc(kdy(new Date(k.cas)))}` : ""}. Ceny se můžou lišit – vždy platí cena v obchodě. Kliknutím přejdeš do obchodu.</p>`;
    spustOdpocty();
    const prekresli = () => { strankaObchody().then(() => obarvi(app)); };
    app.querySelectorAll("[data-so]").forEach((b) => b.onclick = () => { state.slevyObchod = b.dataset.so; prekresli(); });
    app.querySelectorAll("[data-to]").forEach((b) => b.onclick = () => { state.topObchod = b.dataset.to; prekresli(); });
    app.querySelectorAll("[data-nb]").forEach((b) => b.onclick = () => { state.noveBrzy = b.dataset.nb; prekresli(); });
  }

  // ---------- Navigace (skutečné adresy, bez # v URL) ----------
  function route() {
    const casti = location.pathname.replace(/\/+$/, "").split("/").map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
    const sekce = casti[1] || "";
    // Sekce, které mají vlastní položku v liště (Radar, Slevy, Kalendář, Aktualizace), se rozsvítí samy; ostatní herní stránky pod „Hry“.
    const vlastni = { radar: "radar", obchody: "slevy", hlidac: "slevy", vydani: "kalendar", aktualizace: "aktualizace", databaze: "databaze" };
    const tab = vlastni[sekce] ? vlastni[sekce] : ["zive", "streameri", "streamer", "hry", "prehled", "porovnat", "report"].includes(sekce) ? "streameri"
      : ["pruvodce", "vydani", "akce", "studia", "studio", "cestina", "hlidac", "hra", "obchody", "co-hrat", "rozjede-se", "vyssi-nizsi", "aktualizace", "ceska-scena", "radar", "trendy", "porovnat-hry", "databaze"].includes(sekce) ? "hry"
      : ["", "stav"].includes(sekce) ? "domu" : ["novinky", "clanek", "ranni"].includes(sekce) ? "novinky" : "";
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
    let p;
    if (sekce === "clanek") p = strankaClanek(casti[2] || "");
    else if (sekce === "zive") strankaZive();
    else if (sekce === "streameri") p = strankaStreameri();
    else if (sekce === "streamer") p = casti.length > 3 ? strankaStreamer(casti[2], casti[3]) : strankaStreamer("twitch", casti[2] || "");
    else if (sekce === "hry") p = strankaHry();
    else if (sekce === "hra") p = casti[2] === "steam" ? strankaHra("", casti[3] || "") : strankaHra(casti[2] || "");
    else if (sekce === "prehled") p = strankaPrehled();
    else if (sekce === "report") p = strankaReport(casti[2] || "");
    else if (sekce === "porovnat") p = strankaPorovnat();
    else if (sekce === "novinky") strankaNovinky();
    else if (sekce === "cestina") p = strankaCestina();
    else if (sekce === "hlidac") p = strankaHlidac();
    else if (sekce === "stav") p = strankaStav();
    else if (sekce === "vydani") p = strankaVydani();
    else if (sekce === "akce") p = strankaAkce();
    else if (sekce === "studia") p = strankaStudia();
    else if (sekce === "studio") p = strankaStudio(casti[2] || "");
    else if (sekce === "pruvodce") strankaPruvodce();
    else if (sekce === "obchody") p = strankaObchody();
    else if (sekce === "ranni") p = strankaRanni();
    else if (sekce === "aktualizace") p = strankaAktualizace();
    else if (sekce === "ceska-scena") p = strankaCeskaScena();
    else if (sekce === "co-hrat") p = strankaCoHrat();
    else if (sekce === "rozjede-se") p = strankaRozjede();
    else if (sekce === "vyssi-nizsi") p = strankaVyssiNizsi();
    else if (sekce === "radar") p = strankaRadar();
    else if (sekce === "databaze") p = casti[2] ? strankaHraDatabaze(casti[2]) : strankaDatabaze();
    else if (sekce === "trendy") p = strankaTrendy();
    else if (sekce === "porovnat-hry") p = strankaSrovnani();
    else if (sekce === "") p = strankaDomu();
    else stranka404();
    Promise.resolve(p).then(() => obarvi(app));
  }
  // Hloubka procházení v rámci webu (history.state.n) – tlačítka „← Zpět“ pak vrací na opravdu předchozí stránku.
  function jdi(href) {
    history.pushState({ n: (history.state?.n || 0) + 1 }, "", href);
    route();
    scrollTo(0, 0);
  }
  // Rozbalovací nabídka „Hry“ v hlavní liště: seznam všech stránek o hrách (stejné skupiny jako rozcestník /pruvodce).
  // Na mobilu vyjede nad spodní lištou. Rozcestník zůstává – první položka „Všechno o hrách“.
  const tabHry = document.querySelector('.tabs a[data-tab="hry"]');
  function zavriMenuHry() {
    document.getElementById("menu-hry")?.remove();
    tabHry?.setAttribute("aria-expanded", "false");
  }
  if (tabHry) {
    tabHry.setAttribute("aria-haspopup", "true");
    tabHry.setAttribute("aria-expanded", "false");
    tabHry.classList.add("ma-menu");
    tabHry.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      if (document.getElementById("menu-hry")) { zavriMenuHry(); return; }
      const m = document.createElement("div");
      m.id = "menu-hry"; m.className = "menu-hry"; m.setAttribute("role", "menu");
      m.innerHTML = `<a class="mh-vse" role="menuitem" href="/pruvodce"><span class="mh-ik" aria-hidden="true">${IKONY.hrat}</span><b>Všechno o hrách</b><span>Rozcestník se všemi stránkami</span></a>
        <div class="mh-skupiny">${SKUPINY_HER.map((g) => `<div class="mh-sk" data-barva="${esc(g.barva)}"><div class="mh-sk-n">${esc(g.nazev)}</div>
          ${g.polozky.map(([k, h, t]) => `<a role="menuitem" href="${esc(h)}"${location.pathname === h ? ' class="on"' : ""}><span class="mh-ik" aria-hidden="true">${IKONY[IKONA_STRANKY[k]] || ""}</span>${esc(t)}</a>`).join("")}</div>`).join("")}</div>`;
      document.body.appendChild(m);
      m.querySelectorAll("[data-barva]").forEach((el) => el.style.setProperty("--sk", barva(el.dataset.barva, "#ffc04d")));
      // Na počítači pod tlačítkem Hry (zarovnané, aby nevyjelo z obrazovky).
      if (!matchMedia("(max-width:760px)").matches) {
        const r = tabHry.getBoundingClientRect();
        m.style.top = `${Math.round(r.bottom + 8)}px`;
        m.style.left = `${Math.round(Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)))}px`;
      }
      tabHry.setAttribute("aria-expanded", "true");
      m.querySelector("a")?.focus({ preventScroll: true });
    });
    document.addEventListener("click", (e) => {
      const m = document.getElementById("menu-hry");
      if (!m) return;
      if (e.target.closest("#menu-hry a")) { setTimeout(zavriMenuHry, 0); return; }
      if (!m.contains(e.target)) zavriMenuHry();
    });
    addEventListener("keydown", (e) => { if (e.key === "Escape" && document.getElementById("menu-hry")) { zavriMenuHry(); tabHry.focus(); } });
    addEventListener("resize", zavriMenuHry);
    addEventListener("popstate", zavriMenuHry);
  }

  // Odkazy v rámci webu se otevírají bez načítání celé stránky.
  document.addEventListener("click", (e) => {
    // Zpětná tlačítka: když návštěvník přišel z jiné stránky webu, vrátí ho přesně tam (i se stavem filtrů a posunem).
    const zpet = e.target.closest("a.back, a.zpet-hub");
    if (zpet && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0 && (history.state?.n || 0) > 0) { e.preventDefault(); history.back(); return; }
    const a = e.target.closest("a[href]");
    if (!a || a.target || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || /^\/(api|admin|o-webu|soukromi)(\/|$|\.)/.test(url.pathname) || /\.[a-z0-9]+$/i.test(url.pathname)) return;
    if (url.hash && url.pathname === location.pathname) return; // kotva na stejné stránce
    e.preventDefault();
    if (url.pathname + url.search !== location.pathname + location.search) jdi(url.pathname + url.search);
  });
  addEventListener("popstate", route);

  async function nactiZive() {
    try { const z = await nacti("zive"); if (z && Array.isArray(z.streamy)) state.zive = z; } catch {}
    document.getElementById("live-count").textContent = state.zive.streamy.length || "";
  }

  // Uvítání při první návštěvě: web otevřeně říká, že ho dělá AI.
  function uvitani() {
    const el = document.getElementById("uvitani");
    if (!el) return;
    let videno = false;
    try { videno = localStorage.getItem("hp_uvitani") === "1"; } catch {}
    if (videno) return;
    el.innerHTML = `<section class="welcome" aria-labelledby="welcome-t">
      <div class="welcome-bot" aria-hidden="true"><span></span><span></span></div>
      <div class="welcome-text">
        <h2 id="welcome-t">Herní internet je roztroušený. My ho skládáme dohromady.</h2>
        <p>Ceny na Steamu, hry zdarma na Epicu, zprávy na desítkách webů, streamy na Twitchi a Kicku – každé je jinde.
          Umělá inteligence to za tebe hlídá nonstop a skládá přehledně na jedno místo, <b>abys už nemusel nic hledat</b>.</p>
        <p class="welcome-pozn">Web navrhla, naprogramovala a provozuje AI. Čísla bere přímo z oficiálních zdrojů, ale občas se splete – když něco nesedí, dej nám vědět.</p>
        <div class="welcome-akce">
          <button type="button" class="welcome-ok">Jasně, jdu se podívat</button>
          <a href="/o-webu" class="welcome-vice">Jak to funguje</a>
        </div>
      </div></section>`;
    el.querySelector(".welcome-ok").addEventListener("click", () => {
      try { localStorage.setItem("hp_uvitani", "1"); } catch {}
      el.innerHTML = "";
    });
  }

  async function start() {
    uvitani();
    if (C.nazev) {
      document.getElementById("site-name").textContent = C.nazev;
      document.querySelectorAll(".site-name-foot").forEach((e) => (e.textContent = C.nazev));
    }
    document.getElementById("year").textContent = new Date().getFullYear();
    // Staré odkazy typu /#/streamer/… převedeme na nové adresy.
    if (location.hash.startsWith("#/")) {
      let h = location.hash.slice(1);
      if (/^\/streamer\/[^/]+$/.test(h)) h = h.replace("/streamer/", "/streamer/twitch/");
      history.replaceState(null, "", h || "/");
    }
    const [clanky] = await Promise.allSettled([nacti("clanky?limit=100"), nactiZive()]);
    if (clanky.status === "fulfilled" && Array.isArray(clanky.value)) state.clanky = clanky.value;
    route();
    // Pokud ještě nejsou data o streamerech, zkus to znovu za 25 s (web je mezitím stáhne).
    if (!state.zive.streamy.length) setTimeout(async () => {
      await nactiZive();
      state.adresar = {}; state.hry = null;
      if (/^\/(zive|streameri|hry)/.test(location.pathname)) route();
    }, 25000);
    // Živé streamy se obnovují každé 2 minuty (jen pokud je stránka vidět).
    setInterval(async () => {
      if (document.hidden) return;
      await nactiZive();
      if (location.pathname.replace(/\/+$/, "") === "/zive") { strankaZive(); obarvi(app); }
    }, 120000);
    // Novinky se obnovují každých 5 minut (překreslí se jen, když uživatel zrovna nehledá).
    setInterval(async () => {
      if (document.hidden) return;
      try {
        const c = await nacti("clanky?limit=100");
        // Nové zprávy přidat, načtený archiv (starší zprávy) ponechat.
        if (Array.isArray(c)) { const ids = new Set(c.map((x) => x.id)); state.clanky = [...c, ...state.clanky.filter((x) => !ids.has(x.id) && datum(x) < Math.min(...c.map(datum)))]; }
      } catch { return; }
      if (location.pathname.replace(/\/+$/, "") === "/novinky" && document.activeElement?.id !== "q") { strankaNovinky(); obarvi(app); }
    }, 300000);
  }
  start();
})();
