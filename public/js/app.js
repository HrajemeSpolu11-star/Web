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
    root.querySelectorAll("img.cover-img").forEach((img) => img.addEventListener("error", () => img.remove(), { once: true }));
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
  const hhmm = (d) => new Date(d).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  function dalsiKontrola(minuta) {
    const d = new Date(); d.setSeconds(0, 0);
    if (d.getMinutes() >= minuta) d.setHours(d.getHours() + 1);
    d.setMinutes(minuta);
    return d;
  }
  const aiCip = (zdroj, cas) => cas ? `<span class="ai-cip" title="Data ověřila AI z oficiálního zdroje"><i></i>${esc(zdroj)} · ${esc(hhmm(cas))}</span>` : "";
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
    // neuronová síť z loga
    const sit = (cx, cy, r, a) => {
      const b = [-90, -30, 30, 90, 150, 210].map((u) => [cx + r * Math.cos(u * Math.PI / 180), cy + r * Math.sin(u * Math.PI / 180)]);
      g.strokeStyle = `rgba(155,92,255,${0.45 * a})`; g.lineWidth = Math.max(2, r / 40);
      b.forEach((p, i) => { g.beginPath(); g.moveTo(...p); g.lineTo(...b[(i + 1) % 6]); g.moveTo(...p); g.lineTo(cx, cy); g.stroke(); });
      g.fillStyle = `rgba(155,92,255,${a})`; b.forEach((p) => { g.beginPath(); g.arc(...p, r / 9, 0, 7); g.fill(); });
      g.fillStyle = `rgba(255,192,77,${a})`; g.beginPath(); g.arc(cx, cy, r / 4.5, 0, 7); g.fill();
    };
    sit(880, 210, 150, 0.35); sit(110, 110, 34, 1);
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
  const ulozHlidane = (l) => { try { localStorage.setItem("hp_hlidam", JSON.stringify(l.slice(0, 50))); } catch {} };
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
      <div class="section-title">Moje hlídané hry</div>
      <div id="hl-seznam">${l.length ? kostra(Math.min(4, l.length)) : `<p class="empty">Zatím nic nehlídáš. Najdi hru výše nebo klikni na „Hlídat cenu“ u kterékoliv hry na webu.</p>`}</div>
      <p class="source-note">Ceny hlídaných her kontrolujeme každou hodinu přímo na Steamu (v Kč). Upozornění přijde jednou za slevu – a znovu, jen když cena klesne ještě níž. Hlídané hry jsou uložené u tvého odběru upozornění; vypnutím upozornění se smažou. <a href="/soukromi.html">Soukromí</a></p>`;
    app.querySelector(".hledat-hru").onsubmit = async (e) => {
      e.preventDefault();
      const v = app.querySelector("#q-hra").value.trim(), out = document.getElementById("hl-hledani");
      if (v.length < 2) return;
      out.innerHTML = kostra(3);
      try { const d = await nacti(`cestina?q=${enc(v)}`); out.innerHTML = d.hry.length ? `<div class="hrady">${d.hry.slice(0, 6).map((h) => radekHry(h)).join("")}</div>` : `<p class="dim">Nic jsme nenašli – zkus anglický název ze Steamu.</p>`; }
      catch { out.innerHTML = `<p class="dim">Hledání se nepovedlo, zkus to znovu.</p>`; }
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
    { id: "najit", nazev: "Najdi si hru", barva: "#ffc04d", polozky: [
      ["co-hrat", "/co-hrat", "Co dnes hrát?", "Vyber, s kým, za kolik a jaký žánr – doporučíme hry, které hráči nejvíc chválí."],
      ["rozjede-se", "/rozjede-se", "Rozjede se mi to?", "Zadej grafiku a procesor, porovnáme je s požadavky hry."],
      ["cestina", "/cestina", "Má to češtinu?", "Zjisti, jestli má hra český text nebo dabing."]] },
    { id: "usetri", nazev: "Ušetři", barva: "#4fd88f", polozky: [
      ["obchody", "/obchody", "Slevy a hry zdarma", "Hry zdarma na Epicu a Steamu, největší slevy a žebříčky obchodů."],
      ["hlidac", "/hlidac", "Hlídač cen", "Dáme ti vědět, až bude hra, kterou chceš, ve slevě."]] },
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
    return `<a class="zpet-hub" href="/pruvodce">← Všechno o hrách</a>
      <div class="cesko-head"><h1>${esc(nadpis)}</h1>${perex ? `<p>${perex}</p>` : ""}</div>
      ${sk && sk.polozky.length > 1 ? `<nav class="hub-tabs" aria-label="${esc(sk.nazev)}">${sk.polozky.map(([k, h, t]) => `<a href="${h}" class="${k === aktivni ? "on" : ""}">${t}</a>`).join("")}</nav>` : ""}`;
  }
  function strankaPruvodce() {
    nastavTitulek("Všechno o hrách – nástroje, slevy, kalendář, studia");
    app.innerHTML = `<div class="cesko-head"><h1>Všechno o hrách</h1><p>Vyber, co tě zajímá. Každá stránka dělá jednu věc a dělá ji pořádně.</p></div>
      <div class="pruvodce">${SKUPINY_HER.map((g) => `<section class="pr-skupina" data-barva="${g.barva}">
        <h2>${esc(g.nazev)}</h2>
        <div class="pr-dlazdice">${g.polozky.map(([, h, t, popis]) => `<a class="pr-dl" href="${h}"><b>${t}</b><span>${popis}</span></a>`).join("")}</div>
      </section>`).join("")}</div>
      <p class="source-note">Hledáš streamery? Jsou v sekci <a href="/zive">Streameři</a>.</p>`;
    app.querySelectorAll("[data-barva]").forEach((el) => el.style.setProperty("--sk", barva(el.dataset.barva, "#ffc04d")));
  }
  // ---------- Ranní přehled (AI) ----------
  const denCz = (den) => new Date(den + "T12:00:00Z").toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" });
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
        `<a class="ms-b${d === r.den ? " on" : ""}" href="/ranni${d === r.dny[0] ? "" : `?den=${esc(d)}`}">${esc(new Date(d + "T12:00:00Z").toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" }))}</a>`).join("")}</div>` : ""}`;
  }

  // ---------- Aktualizace her ----------
  async function strankaAktualizace() {
    nastavTitulek("Aktualizace her česky – co přinesly nové patche");
    app.innerHTML = `${hubHry("aktualizace", "Aktualizace her", "")}${kostra(4)}`;
    let d;
    try { d = await nacti("aktualizace"); } catch { d = { polozky: [] }; }
    if (!location.pathname.startsWith("/aktualizace")) return;
    const hra = new URLSearchParams(location.search).get("hra") || "";
    const hry = [...new Set(d.polozky.map((p) => p.hra))];
    const list = hra ? d.polozky.filter((p) => p.hra === hra) : d.polozky;
    app.innerHTML = `${hubHry("aktualizace", "Aktualizace her", "Vývojáři píšou poznámky k aktualizacím dlouze a anglicky. AI z nich vybere to podstatné a napíše to česky.")}
      ${hry.length > 1 ? `<div class="chips"><a class="chip${hra ? "" : " on"}" href="/aktualizace">Všechny hry</a>${hry.map((h) => `<a class="chip${h === hra ? " on" : ""}" href="/aktualizace?hra=${enc(h)}">${esc(h)}</a>`).join("")}</div>` : ""}
      ${list.length ? `<div class="patche">${list.map((p) => `<article class="patch">
          <header><a class="patch-hra" href="/hra/steam/${esc(p.steam_id)}">${esc(p.hra)}</a><span class="dim">${esc(kdy(new Date(p.datum)))}</span></header>
          <h3>${esc(p.nadpis)}</h3>
          <p>${esc(p.shrnuti)}</p>
          ${p.zmeny.length ? `<ul>${p.zmeny.map((z) => `<li>${esc(z)}</li>`).join("")}</ul>` : ""}
          <footer><span class="ai-stitek">Shrnula AI</span><a href="${esc(bezpecnaUrl(p.url))}" target="_blank" rel="noopener noreferrer">Celé poznámky na Steamu</a></footer>
        </article>`).join("")}</div>`
        : `<p class="empty">Zatím tu nic není. Web každou hodinu kontroluje oficiální oznámení nejhranějších her na Steamu a nové aktualizace postupně shrnuje.</p>`}
      <p class="source-note">Zdroj: oficiální oznámení vývojářů na Steamu (jen nejhranější hry). Shrnutí píše AI a web ho zveřejní, jen když v něm nejsou čísla, která v originále chybí. Přesné znění vždy najdeš v odkazu na Steam.</p>`;
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
    const cenaHry = (h) => h.zdarma || h.cena === 0 ? "Zdarma" : h.cena != null ? `${h.sleva ? `<s>${esc(cena(h.puvodni, h.mena))}</s> ` : ""}<b>${esc(cena(h.cena, h.mena))}</b>${h.sleva ? ` <em>−${Number(h.sleva) || 0} %</em>` : ""}` : "";
    app.innerHTML = `${hubHry("co-hrat", "Co dnes hrát?", "Ťukni na pár voleb a ukážeme hry, které hráči na Steamu nejvíc chválí. Výsledek se mění hned.")}${formular}
      <div class="section-title">${d.hry.length ? "Doporučujeme" : "Nic jsme nenašli"}</div>
      ${d.hry.length ? `<div class="ch-vysledky">${d.hry.map((h, i) => `<a class="ch-hra" href="/hra/steam/${esc(h.id)}">
          ${https(h.obrazek) ? `<img src="${esc(h.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ch-bez"></div>`}
          <div class="ch-t"><b>${i + 1}. ${esc(h.nazev)}</b>
            <span class="ch-meta">${czStitek(h)}${h.zanry.slice(0, 2).map((z) => `<span class="plat">${esc(z)}</span>`).join("")}</span>
            <span class="dim">${esc(rezim(h.rezim))}</span>
            <span class="ch-proc">${h.hodnoceni ? `👍 ${Number(h.hodnoceni.kladne) || 0} % hráčů doporučuje` : h.metacritic ? `Metacritic ${Number(h.metacritic) || 0}` : ""}${h.doporuceni ? ` · ${esc(num(h.doporuceni))} doporučení` : ""}</span>
            <span class="ch-cena">${cenaHry(h)}</span></div></a>`).join("")}</div>`
        : `<p class="empty">S těmihle volbami jsme nic nenašli. Zkus jednu volbu povolit (třeba cenu nebo češtinu).</p>`}
      <p class="source-note">Vybíráme z ${pl(d.databaze || 0, "hry", "her", "her")} ze Steamu, u kterých máme ověřené žánry, režimy hraní, češtinu a cenu (databáze každou hodinu roste).
        Pořadí: hodnocení hráčů nebo Metacritic a počet doporučení na Steamu. Nic nám nikdo neplatí.</p>`;
    app.querySelector(".cohrat").addEventListener("change", () => {
      const f = new FormData(app.querySelector(".cohrat"));
      const nove = new URLSearchParams([...f.entries()].filter(([, v]) => v));
      history.replaceState(null, "", "/co-hrat" + (nove.toString() ? "?" + nove : ""));
      strankaCoHrat().then(() => obarvi(app));
    });
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
      const text = () => `Vyšší, nebo nižší? (${sada.nazev}) ${new Date(d.den + "T12:00:00Z").toLocaleDateString("cs-CZ")}: ${stav.odpovedi.filter(Boolean).length}/${kola.length}\n${stav.odpovedi.map((x) => (x ? "🟩" : "🟥")).join("")}\n${location.origin}/vyssi-nizsi`;
      const bs = document.getElementById("vn-sdilet");
      if (bs) bs.onclick = async () => {
        try { if (navigator.share) await navigator.share({ text: text() }); else { await navigator.clipboard.writeText(text()); achievement("Zkopírováno", "Výsledek máš ve schránce."); } } catch {}
      };
      const bo = document.getElementById("vn-obr");
      if (bo) bo.onclick = () => sdilejObrazek({ stitek: "Vyšší, nebo nižší?", nadpis: `${stav.odpovedi.filter(Boolean).length} z ${kola.length}`, odkaz: "/vyssi-nizsi",
        radky: [[sada.nazev, new Date(d.den + "T12:00:00Z").toLocaleDateString("cs-CZ")], [stav.odpovedi.map((x) => (x ? "✓" : "✗")).join(" "), "moje odpovědi"]] });
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
  const datumCasCz = (iso, celodenni) => new Date(iso).toLocaleString("cs-CZ", celodenni ? { day: "numeric", month: "numeric", year: "numeric" } : { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const TYP_AKCE = { vyprodej: "Výprodej", festival: "Festival her", prenos: "Přenos", vystava: "Veletrh" };
  const kartaTraileru = (v) => `<a class="hk vk" href="${esc(bezpecnaUrl(v.url))}" target="_blank" rel="noopener noreferrer">
      <div class="hk-obr vk-obr">${https(v.nahled) ? `<img src="${esc(v.nahled)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="obchod ob-yt">YouTube</span></div>
      <div class="hk-t"><b>${esc(v.nazev)}</b><span class="hk-hraci">${esc(v.studio_nazev)} · ${esc(kdy(new Date(v.cas)))}</span></div></a>`;
  const radekZpravy = (z, sStudiem = true) => `<a class="rec zpr-studio" href="${esc(bezpecnaUrl(z.url))}" target="_blank" rel="noopener noreferrer">
      ${https(z.nahled) ? `<img src="${esc(z.nahled)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="rec-bez zpr-ikona">${z.druh === "steam" ? "Steam" : "Blog"}</div>`}
      <div><b>${esc(z.nazev)}</b><span class="dim">${sStudiem ? `${esc(z.studio_nazev)} · ` : ""}${z.hra ? `${esc(z.hra)} · ` : ""}${z.druh === "steam" ? "oznámení na Steamu" : "oficiální blog"} · ${esc(kdy(new Date(z.cas)))}</span></div></a>`;

  // Kalendář vydání
  async function strankaVydani() {
    nastavTitulek("Kalendář vydání her – co vychází a jestli bude česky");
    const f = new URLSearchParams(location.search).get("f") || "vse";
    app.innerHTML = `${hubHry("vydani", "Kalendář vydání her", "Co vychází, kdy a na čem – a jestli bude hra v češtině.")}${kostra(6)}`;
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
      const k = h.presne || /^[A-Za-z]{3} \d{4}$/.test(h.human) ? new Date(h.datum).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" }) : (h.human || "Termín neznámý");
      (mesice.get(k) || mesice.set(k, []).get(k)).push(h);
    }
    const czTxt = (h) => h.cestina === 2 ? `<span class="cz cz-dabing">CZ dabing</span>` : h.cestina === 1 ? `<span class="cz">CZ texty</span>`
      : h.cestina === 0 ? `<span class="cz cz-ne">bez češtiny</span>` : `<span class="cz cz-nevim">čeština zatím neoznámena</span>`;
    app.innerHTML = `${hubHry("vydani", "Kalendář vydání her", "Co vychází, kdy a na čem – a jestli bude hra v češtině.")}
      <div class="mini-seg cz-filtry" role="group">${[["vse", "Nové hry"], ["cz", "Jen s češtinou"], ["presne", "Jen s přesným datem"], ["porty", `Nové platformy a plné verze${pocetPortu ? ` (${pocetPortu})` : ""}`]].map(([k, v]) =>
        `<a class="ms-b${k === f ? " on" : ""}" href="/vydani${k === "vse" ? "" : `?f=${k}`}">${v}</a>`).join("")}</div>
      ${hry.length ? [...mesice].map(([m, list]) => `<div class="section-title">${esc(m.charAt(0).toUpperCase() + m.slice(1))}</div>
        <div class="vydani">${list.map((h) => `<div class="vyd">
          ${https(h.obrazek) ? `<img class="vyd-obr" src="${esc(h.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="vyd-obr"></div>`}
          <div class="vyd-t">${h.steam_id ? `<a href="/hra/steam/${esc(h.steam_id)}"><b>${esc(h.nazev)}</b></a>` : `<b>${esc(h.nazev)}</b>`}
            <span class="vyd-datum">${h.presne ? esc(new Date(h.datum).toLocaleDateString("cs-CZ")) : esc(h.human)}${h.presne && Date.parse(h.datum) > Date.now() ? ` · za <span data-odpocet="${esc(h.datum)}"></span>` : h.presne ? " · právě vychází" : ""}</span>
            ${h.uz_vyslo ? `<p class="vyd-uz">${h.prvni ? `Hra už vyšla ${esc(new Date(h.prvni).toLocaleDateString("cs-CZ"))}` : "Hra už je k dispozici na Steamu"}${h.prvni && h.na_steamu ? " a je k dispozici na Steamu" : ""}. Tady jde o vydání ${(h.platformy || []).length ? `pro ${esc((h.platformy || []).join(", "))}` : "pro další platformu"}${/early|předběž/i.test(h.stav) ? "" : " nebo plnou verzi"}.</p>` : ""}
            <div class="hrad-meta">${czTxt(h)}${h.cestina_zdroj ? `<span class="dim vyd-zdroj">${esc(h.cestina_zdroj)}</span>` : ""}${(h.platformy || []).map((p) => `<span class="plat">${esc(p)}</span>`).join("")}</div>
            <div class="vyd-akce">${h.steam ? `<a class="btn-maly" href="${esc(bezpecnaUrl(h.steam))}" target="_blank" rel="noopener noreferrer">Steam</a>` : ""}
              ${h.igdb ? `<a class="btn-maly" href="${esc(bezpecnaUrl(h.igdb))}" target="_blank" rel="noopener noreferrer">IGDB</a>` : ""}
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
    app.innerHTML = `<div class="cesko-head"><h1>Stav systému a deník AI</h1>
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
    return d.toLocaleDateString("cs-CZ");
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

  // ---------- Tep (EKG křivka) – hlavní motiv webu Herní puls ----------
  // Tvar jako na skutečném EKG: rovná linka, malá vlna P, ostrý komplex QRS, širší vlna T.
  // Tempo jako skutečný tep v klidu až při vzrušení – čím víc diváků, tím rychleji, ale pořád uvěřitelně:
  // 0–1 divák ≈ 60 tepů/min, 10 ≈ 75, 100 ≈ 90, 1 000 ≈ 105, 10 000 ≈ 120 (strop 130).
  const tepZDivaku = (d) => Math.min(130, Math.round(60 + 15 * Math.log10((Number(d) || 0) + 1)));
  const ekg = (divaci, velka = false) => `<div class="ekg${velka ? " ekg-velka" : ""}" data-divaci="${Number(divaci) || 0}" aria-hidden="true"></div>`;
  // Jeden úder široký P px (na monitoru jde papír stálou rychlostí – rychlejší tep = údery blíž u sebe).
  function uderEkg(x, P, m, a) {
    const k = (t) => x + P * t; // pozice v rámci úderu (0–1)
    return `L${k(0.12)},${m} Q${k(0.17)},${m - a * 0.16} ${k(0.22)},${m}` +                      // vlna P
      ` L${k(0.3)},${m} L${k(0.325)},${m + a * 0.12} L${k(0.36)},${m - a} L${k(0.395)},${m + a * 0.32} L${k(0.42)},${m}` + // QRS
      ` L${k(0.52)},${m} Q${k(0.6)},${m - a * 0.3} ${k(0.68)},${m} L${k(1)},${m}`;                  // vlna T a klid
  }
  // Nakreslí křivky do všech .ekg v kořeni (volá se z obarvi). Papír jede stálou rychlostí (px/s);
  // šířka úderu = rychlost × 60 / tep, takže při vyšším tepu jsou údery hustěji – přesně jako na monitoru.
  function nakresliEkg(root) {
    root.querySelectorAll(".ekg[data-divaci]:not([data-hotovo])").forEach((el) => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      const velka = el.classList.contains("ekg-velka");
      const tep = tepZDivaku(el.dataset.divaci), rychlost = velka ? 140 : 60; // px za sekundu
      const P = Math.round((rychlost * 60) / tep), a = h * (velka ? 0.42 : 0.4), m = h * 0.58;
      const n = Math.ceil(w / P) + 2;
      let d = `M0,${m}`;
      for (let i = 0; i < n; i++) d += " " + uderEkg(i * P, P, m, a);
      el.innerHTML = `<svg width="${n * P}" height="${h}" viewBox="0 0 ${n * P} ${h}"><g><path d="${d}"/></g></svg>`;
      const g = el.querySelector("g");
      g.style.setProperty("--p", P + "px");
      g.style.animationDuration = (60 / tep).toFixed(3) + "s";
      el.dataset.hotovo = "1";
    });
  }
  // Řádek „tep“ streamera: avatar, jméno, hra, křivka, diváci a tepy za minutu.
  const radekTepu = (s) => `<a class="tep${s.platforma === "kick" ? " kick" : ""}" href="${esc(profilUrl(s))}">${av(s)}
      <div class="tep-t"><b>${esc(s.jmeno)}</b><span>${esc(s.hra || "")}</span></div>${ekg(s.divaci)}
      <div class="tep-n"><b>${num(s.divaci || 0)}</b><span class="tep-min">${tepZDivaku(s.divaci)}/min</span></div></a>`;

  function kartaZive(s) {
    return `<a class="live-card" href="${esc(profilUrl(s))}">
      <div class="live-thumb">${https(s.nahled) ? `<img src="${esc(s.nahled)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
        <span class="live-badge">ŽIVĚ</span>${platBadge(s)}<span class="live-viewers">${num(s.divaci || 0)} diváků</span>
        ${s.zacatek ? `<span class="live-time">${esc(delka(s.zacatek))}</span>` : ""}</div>
      <div class="live-info">${av(s)}<div class="info"><h3>${esc(s.jmeno)}${partner(s)}</h3>
        <div class="sub">${esc(s.hra || "")}</div><div class="sub dim">${esc(s.titulek || "")}</div></div></div>
      <div class="live-tep">${ekg(s.divaci)}<span class="tep-min">${tepZDivaku(s.divaci)}/min</span></div></a>`;
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
        <p>${streamy.length ? `Právě ${streamy.length >= 2 && streamy.length <= 4 ? "vysílají" : "vysílá"} ${pl(streamy.length, "streamer", "streameři", "streamerů")} pro <b class="hub-cislo" data-count="${divaku}" data-once="hub">${num(divaku)}</b> diváků.` : "Teď nikdo nevysílá – mrkni na žebříček nebo hry."}</p></div>
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
      ${list.length ? `<div class="grid">${list.map(kartaClanku).join("")}</div>`
        : `<p class="empty">${state.clanky.length ? "Nic jsme nenašli." : "Sběr novinek právě běží. První zprávy se objeví do 15 minut."}</p>`}
      ${zive.length ? `<div class="section-title">Právě živě · <a href="/zive">všichni</a></div><div class="live-grid">${zive.map(kartaZive).join("")}</div>` : ""}`;
    app.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { state.filtr = b.dataset.f; strankaNovinky(); obarvi(app); });
    app.querySelectorAll("[data-kn]").forEach((b) => b.onclick = () => { state.katNov = b.dataset.kn; strankaNovinky(); obarvi(app); });
    app.querySelectorAll("[data-z]").forEach((b) => b.onclick = () => { state.zdrojNov = b.dataset.z; strankaNovinky(); obarvi(app); });
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

  async function strankaStreamer(platforma, login) {
    app.innerHTML = `<div class="profile"><div class="kostra kostra-banner"></div>${kostra(3)}</div>`;
    let s;
    try { s = await nacti(`streamer/${enc(platforma)}/${enc(login)}`); }
    catch { nastavTitulek("Streamer nenalezen"); app.innerHTML = `<p class="empty">Streamer nenalezen. <a href="/streameri">Zpět na seznam</a></p>`; return; }
    nastavTitulek(`${s.jmeno} – ${PLAT[s.platforma] || "Twitch"} streamer`);
    const body = (s.snimky || []).filter((x) => x.sledujici != null).map((x) => ({ v: x.sledujici, d: new Date(x.den).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" }) }));
    const maxHra = Math.max(1, ...(s.hry || []).map((h) => h.minut));
    const datumCz = (d) => d ? new Date(d).toLocaleDateString("cs-CZ") : "–";
    app.innerHTML = `<div class="profile">
      <a class="back" href="/streameri">← Všichni streameři</a>
      <div class="banner">${https(s.banner) ? `<img src="${esc(s.banner)}" alt="" referrerpolicy="no-referrer">` : ""}</div>
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
      ${s.zive ? `<div class="section-title">Právě vysílá · tep ${tepZDivaku(s.divaci)}/min</div>${ekg(s.divaci, true)}${kartaZive(s)}` : ""}
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
        `<a class="hra" href="/hra/${esc(h.slug || slug(h.hra))}"><div class="hra-t"><span>${esc(h.hra)}</span><span class="dim">${Math.round(h.minut / 60)} h</span></div>
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
    return Date.now() - od < 30 * 864e5 ? od.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" }) : "";
  }
  const UCHOVANI = { partner: 60, affiliate: 14 };

  // Rozvrh, klipy a záznamy vysílání (Twitch) – načítají se zvlášť, aby profil nečekal.
  async function nactiExtra(s) {
    let x;
    try { x = await nacti(`streamer-extra/${enc(s.platforma || "twitch")}/${enc(s.login)}`); } catch { return; }
    const el = document.getElementById("extra");
    if (!el) return;
    const den = (d) => new Date(d).toLocaleString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
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
  const datumCz = (d) => new Date(d + (String(d).length === 10 ? "T12:00:00" : "")).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
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
          <div><b>${esc(num(s.spicka?.divaci || 0))}</b><span>diváků ve špičce${s.spicka ? ` (${esc(new Date(s.spicka.cas).toLocaleString("cs-CZ", { weekday: "short", hour: "2-digit", minute: "2-digit" }))})` : ""}</span></div>
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
    const st = h.info?.steam, gog = h.info?.gog, ep = h.info?.epic, stat = h.statistiky || { dny: [] };
    const cz = st?.cestina;
    const maxDen = Math.max(1, ...stat.dny.map((d) => d.hodin));
    const obchod = (nazev, cls, url, radek) => `<a class="obchod-r ${cls}" href="${esc(bezpecnaUrl(url))}" target="_blank" rel="noopener noreferrer"><b>${nazev}</b><span>${radek}</span></a>`;
    const cenaTxt = (o) => o.zdarma || o.cena === 0 ? "Zdarma" : o.cena == null ? "Cena neuvedena"
      : `${o.sleva ? `<s>${esc(cena(o.puvodni, o.mena))}</s> <em>−${Number(o.sleva) || 0} %</em> ` : ""}<strong>${esc(cena(o.cena, o.mena))}</strong>`;
    const obchody = [
      st && obchod("Steam", "ob-steam", st.url, cenaTxt(st) + (st.min90 != null && st.cena > 0 ? `<br><small>${st.cena <= st.min90 ? "nejnižší cena za 90 dní" : `nejníž za 90 dní ${esc(cena(st.min90, st.mena))}`}</small>` : "")),
      gog && obchod("GOG", "ob-gog", gog.url, cenaTxt(gog)),
      ep && obchod("Epic Games", "ob-epic", ep.url, ep.zdarma_ted ? `<strong>Zdarma</strong> ${ep.do ? esc(zbyva(ep.do)) : ""}` : `zdarma od ${esc(new Date(ep.od).toLocaleDateString("cs-CZ"))}`),
    ].filter(Boolean);
    const fakta = [
      cz && ["Čeština (podle Steamu)", cz.dabing ? "✓ dabing i titulky" : cz.rozhrani ? "✓ texty (rozhraní nebo titulky)" : "✗ bez češtiny"],
      st?.hodnoceni && ["Hodnocení hráčů", `${hodnoceniHry(st)} <span class="dim">Steam</span>`],
      gog?.hodnoceni && ["Hodnocení GOG", `${gog.hodnoceni.toLocaleString("cs-CZ")} / 5`],
      st?.metacritic && ["Metacritic", String(st.metacritic)],
      st?.hraci_ted != null && ["Hraje právě teď", `${esc(num(st.hraci_ted))} hráčů na Steamu (celý svět)`],
      st?.vydani && [st.chysta_se ? "Vyjde" : "Vydáno", esc(st.vydani)],
      st?.zanry?.length && ["Žánr", esc(st.zanry.join(", "))],
      st?.vyvojari?.length && ["Vývojář", esc(st.vyvojari.join(", "))],
    ].filter(Boolean);
    app.innerHTML = `<div class="profile">
      <a class="back" href="${h.slug ? "/hry" : "/vydani"}">${h.slug ? "← Co hraje Česko" : "← Hry"}</a>
      <div class="hra-hero${https(st?.obrazek) ? " s-obr" : ""}" data-a="${esc(a)}" data-b="${esc(b)}">
        ${https(st?.obrazek) ? `<img class="hra-hero-img" src="${esc(st.obrazek)}" alt="" referrerpolicy="no-referrer">` : ""}
        <div class="hra-hero-t"><h1>${esc(h.nazev)}</h1>
        <p>${h.zive.length ? `${pl(h.zive.length, "český stream", "české streamy", "českých streamů")} právě živě · ${num(h.zive.reduce((x, s) => x + (s.divaci || 0), 0))} diváků` : "Teď nikdo z českých streamerů nevysílá"}</p></div></div>
      ${st?.popis ? `<p class="hra-popis">${esc(st.popis)}</p>` : ""}
      ${obchody.length ? `<div class="section-title">Kde koupit</div><div class="obchody">${obchody.join("")}</div>` : ""}
      ${st && !st.zdarma ? `<div class="hra-hlidat">${tlacitkoHlidat({ id: st.id, nazev: st.nazev })}${tlacitkoObrazek("hra-obr")}<span class="dim">Pošleme upozornění, až bude ve slevě. <a href="/hlidac">Hlídač cen</a></span></div>` : ""}
      ${fakta.length ? `<dl class="fakta">${fakta.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>` : ""}
      ${(st?.historie || []).length >= 2 ? `<div class="section-title">Vývoj ceny na Steamu</div><div class="graf" id="graf-cena"></div>
        <p class="source-note">Nejnižší cena každého dne za posledních 90 dní (od začátku sledování), v Kč.</p>` : ""}
      ${st?.pozadavky && (st.pozadavky.min.length || st.pozadavky.dop.length) ? `<details class="pozadavky"><summary>Systémové požadavky (PC)</summary>
        <div class="poz-sloupce">${st.pozadavky.min.length ? `<div><b>Minimální</b><ul>${st.pozadavky.min.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}
        ${st.pozadavky.dop.length ? `<div><b>Doporučené</b><ul>${st.pozadavky.dop.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}</div>
        <p class="source-note">Podle stránky hry na Steamu.</p></details>
        <div class="hw-na-hre" id="hw-hra"><b>Rozjede se mi to?</b> <a href="/rozjede-se?hra=${esc(st.id)}">Porovnat s mým počítačem</a></div>` : ""}
      ${!h.info ? `<p class="dim">Údaje z obchodů se načítají – zkus stránku obnovit za chvíli.</p>` : !st && !gog && !ep ? `<p class="dim">Tuhle hru jsme v obchodech Steam, GOG ani Epic pod stejným názvem nenašli (může jít o kategorii jako „Just Chatting“ nebo hru z jiného obchodu).</p>` : ""}

      <div class="section-title">Na českých streamech</div>
      ${!h.slug ? `<p class="dim">Tuhle hru zatím nikdo z českých streamerů nevysílal (od začátku našeho měření). Jakmile ji někdo začne hrát, objeví se tu statistiky.</p>` : ""}
      <div class="rep-dlazdice"><div><b>${esc(num(stat.hodin7 || 0))}</b><span>hodin sledování za 7 dní</span></div><div><b>${esc(num(stat.spicka7 || 0))}</b><span>diváků ve špičce</span></div></div>
      ${stat.dny.length > 1 ? `<div class="sloupce" role="img" aria-label="Hodiny sledování po dnech">${stat.dny.map((d) => `<i data-h="${Math.round((d.hodin / maxDen) * 100)}" title="${esc(datumCz(d.den))}: ${d.hodin} h"></i>`).join("")}</div>
        <p class="source-note">Hodiny sledování po dnech za posledních 30 dní (od začátku měření).</p>` : ""}
      ${h.zive.length ? `<div class="section-title">Právě živě</div><div class="live-grid">${h.zive.map(kartaZive).join("")}</div>` : ""}
      ${(h.klipy || []).length ? `<div class="section-title">Nejlepší klipy</div><div class="regal">${h.klipy.map((v) => kartaVidea(v, true)).join("")}</div>` : ""}
      ${h.nejvic.length ? `<div class="section-title">Kdo hraje nejvíc</div><div class="slist">${h.nejvic.map((s, i) => radekStreamera(s, i, "hra")).join("")}</div>` : ""}
      ${h.clanky.length ? `<div class="section-title">Novinky a recenze</div><div class="grid">${h.clanky.map((c) => kartaClanku(c, 1)).join("")}</div>` : ""}
      <p class="source-note">Ceny, čeština, hodnocení a počet hráčů jsou přímo z obchodů Steam a GOG${h.info?.cas ? ` (stav ${esc(kdy(new Date(h.info.cas)))})` : ""}; vždy platí cena v obchodě. Hodiny na streamech měříme sami z API Twitche a Kicku. <a href="/o-webu#data">Jak počítáme</a></p>
    </div>`;
    const gc = document.getElementById("graf-cena");
    if (gc) graf(gc, st.historie.map((x) => ({ v: x.cena, d: new Date(x.den + "T12:00:00").toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" }) })), "Vývoj ceny na Steamu");
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
    body.forEach((b, i) => { const d = new Date(b.cas); if (d.getHours() === 0) dny.push([i, d.toLocaleDateString("cs-CZ", { weekday: "short" })]); });
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
    const den = (iso) => new Date(iso).toLocaleString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
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
    try { return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: mena || "CZK", maximumFractionDigits: c % 1 ? 2 : 0 }).format(c); }
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
        ${h.hracu ? `<span class="hk-hraci">${esc(num(h.hracu))} hráčů</span>` : ""}${hodnoceniHry(h)}</div></a>`;
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
  };
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
      const [ra, vd, vy, ak, pa] = await Promise.allSettled([nacti("ranni"), nacti("vydani?limit=5"), nacti("vyroci"), state.akce ? state.akce : nacti("akce"), nacti("aktualizace"), nactiKatalog()]);
      const ok = (x) => (x.status === "fulfilled" ? x.value : null);
      state.domu = { ranni: ok(ra), vydani: ok(vd), vyroci: ok(vy), aktualizace: ok(pa) };
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
    const brzy = (vydani?.hry || []).slice(0, 5);
    const patche = (aktualizace?.polozky || []).slice(0, 3);
    app.innerHTML = `
      <section class="uvod">
        <h1>Hry mají tep.<br>My ho <em>měříme.</em></h1>
        ${ekg(zpravDnes, true)}
        <p class="uvod-veta"><span class="zivy-bod" aria-hidden="true"></span>Tep herního světa <b>${tepZDivaku(zpravDnes)}/min</b>${zpravDnes ? ` · <b>${zpravDnes}</b> zpráv za 24 h` : ""}${zdarmaVse.length ? ` · <b>${pl(zdarmaVse.length, "hra", "hry", "her")}</b> zdarma` : ""}${brzy[0] ? ` · příští velké vydání: <b>${esc(brzy[0].nazev)}</b>` : ""}</p>
        ${akce ? `<a class="pristi-akce" href="/akce"><span class="akce-typ">${esc(TYP_AKCE[akce.typ] || "")}</span>
          <b>${esc(akce.nazev)}</b><span>${akce.bezi ? "probíhá · končí za" : "za"} <b data-odpocet="${esc(akce.bezi ? akce.do : akce.od)}"></b></span></a>` : ""}
      </section>

      <div class="mozaika">
        ${ranni?.body?.length ? `<section class="ranni-karta m7">
            <header><span class="ai-stitek">Sestavila AI</span><h2><a href="/ranni">${dnesRanni ? "Ranní přehled" : "Poslední ranní přehled"}</a></h2><span class="dim">${esc(denCz(ranni.den))}</span></header>
            ${bodyRanni(ranni, 5)}
            <a class="dalsi-odkaz" href="/novinky">Všechny novinky</a>
          </section>` : ""}

        ${brzy.length ? `<section class="blok ${ranni?.body?.length ? "m5" : "m12"}">
          <div class="section-title">Brzy vyjde · <a href="/vydani">kalendář</a></div>
          <div class="brzy">${brzy.map((h) => `<a class="brzy-h" ${h.steam_id ? `href="/hra/steam/${esc(h.steam_id)}"` : `href="/vydani"`}>
              ${https(h.obrazek) ? `<img src="${esc(h.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="brzy-bez"></div>`}
              <div><b>${esc(h.nazev)}</b><span>${h.presne ? esc(new Date(h.datum).toLocaleDateString("cs-CZ")) : esc(h.human)}${h.cestina > 0 ? ` · <span class="cz">${h.cestina === 2 ? "CZ dabing" : "CZ texty"}</span>` : ""}</span>
              ${h.presne && Date.parse(h.datum) > Date.now() ? `<span class="brzy-za">za <span data-odpocet="${esc(h.datum)}"></span></span>` : ""}</div></a>`).join("")}</div>
        </section>` : ""}

        ${tydne ? `<a class="hra-velka m5" ${odkazHry(tydne)}>${https(tydne.obrazek) ? `<img src="${esc(tydne.obrazek)}" alt="" referrerpolicy="no-referrer">` : ""}
          <div class="hv-t"><span class="hv-pill">${tydne.cena === 0 || tydne.do ? `Zdarma na ${esc(OBCHOD[tydne.obchod] || tydne.obchod)}${tydne.do ? ` · ${esc(zbyva(tydne.do))}` : ""}` : `Sleva −${Number(tydne.sleva) || 0} % na ${esc(OBCHOD[tydne.obchod] || tydne.obchod)}`}</span>
            <h2>${esc(tydne.nazev)}</h2>
            <p>Hra týdne${zdarmaVse.length > 1 ? ` · další ${pl(zdarmaVse.length - 1, "hra", "hry", "her")} zdarma` : ""}${maxSleva ? ` · slevy až −${maxSleva} %` : ""}</p></div></a>` : ""}

        <section class="blok ${tydne ? "m7" : "m12"}">
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

        ${patche.length ? `<section class="blok ${vyroci?.hry?.length ? "m6" : "m12"}">
          <div class="section-title">Nové aktualizace her · <a href="/aktualizace">všechny</a></div>
          <div class="patche-mini">${patche.map((p) => `<a href="/aktualizace?hra=${enc(p.hra)}"><b>${esc(p.hra)}</b><span>${esc(p.shrnuti)}</span><small class="dim">${esc(kdy(new Date(p.datum)))} · shrnula AI</small></a>`).join("")}</div>
        </section>` : ""}

        ${vyroci?.hry?.length ? `<section class="blok ${patche.length ? "m6" : "m12"}">
          <div class="section-title">Dnes před lety vyšlo</div>
          <div class="vyroci">${vyroci.hry.slice(0, 4).map((h) => `<a class="vyr" ${h.steam ? `href="/hra/steam/${esc(h.steam)}"` : `href="${esc(bezpecnaUrl(h.igdb))}" target="_blank" rel="noopener noreferrer"`}>
              ${https(h.obrazek) ? `<img src="${esc(h.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="vyr-bez">${esc(h.nazev[0])}</div>`}
              <span class="vyr-pred">před ${pl(Number(h.pred) || 0, "rokem", "lety", "lety")}</span><b>${esc(h.nazev)}</b><span class="dim">${Number(h.rok) || ""}</span></a>`).join("")}</div>
        </section>` : ""}
      </div>

      <a class="ai-stav" href="/stav" role="status"><span class="ai-jadro" aria-hidden="true"></span>
        <div><b>AI správce webu</b>
        <span>${(() => { const n = new Set(state.clanky.map((c) => c.zdroje?.[0]?.nazev).filter(Boolean)).size; return n ? `čtu zprávy z ${pl(n, "webu", "webů", "webů")}` : "čtu herní weby"; })()}
        ${k.cas ? ` · obchody zkontrolovány v ${esc(hhmm(k.cas))}` : ""} · <u>deník AI</u></span></div></a>`;
    app.querySelectorAll("[data-barva]").forEach((el) => el.style.setProperty("--sk", barva(el.dataset.barva, "#ffc04d")));
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
          <p class="source-note">Nejvyšší počet hráčů současně za poslední týden podle Steamu.</p>` : `<p class="dim">Žebříček se načítá.</p>`}
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
    const tab = ["zive", "streameri", "streamer", "hry", "prehled", "porovnat", "report"].includes(sekce) ? "streameri"
      : ["pruvodce", "vydani", "akce", "studia", "studio", "cestina", "hlidac", "hra", "obchody", "co-hrat", "rozjede-se", "vyssi-nizsi", "aktualizace", "ceska-scena"].includes(sekce) ? "hry"
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
    else if (sekce === "") p = strankaDomu();
    else stranka404();
    Promise.resolve(p).then(() => obarvi(app));
  }
  function jdi(href) {
    history.pushState(null, "", href);
    route();
    scrollTo(0, 0);
  }
  // Odkazy v rámci webu se otevírají bez načítání celé stránky.
  document.addEventListener("click", (e) => {
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
      try { const c = await nacti("clanky?limit=100"); if (Array.isArray(c)) state.clanky = c; } catch { return; }
      if (location.pathname.replace(/\/+$/, "") === "/novinky" && document.activeElement?.id !== "q") { strankaNovinky(); obarvi(app); }
    }, 300000);
  }
  start();
})();
