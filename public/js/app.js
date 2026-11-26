(() => {
  const C = window.CONFIG || {};
  const app = document.getElementById("app");
  const state = {
    clanky: [], zive: { streamy: [], hry: [] }, adresar: {}, hry: null,
    razeni: "sledujici", platforma: "", hledatS: "", hraZive: "", filtr: "Vše", hledat: "",
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
    root.querySelectorAll("img.cover-img").forEach((img) => img.addEventListener("error", () => img.remove(), { once: true }));
    root.querySelectorAll("[data-a]").forEach((el) => {
      el.style.background = `linear-gradient(135deg,${barva(el.dataset.a, "#444")},${barva(el.dataset.b, "#111")})`;
    });
    root.querySelectorAll(".bar i[data-w]").forEach((i) => (i.style.width = Math.max(2, Math.min(100, +i.dataset.w || 0)) + "%"));
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

  function kartaZive(s) {
    return `<a class="live-card" href="${esc(profilUrl(s))}">
      <div class="live-thumb">${https(s.nahled) ? `<img src="${esc(s.nahled)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
        <span class="live-badge">ŽIVĚ</span>${platBadge(s)}<span class="live-viewers">${num(s.divaci || 0)} diváků</span>
        ${s.zacatek ? `<span class="live-time">${esc(delka(s.zacatek))}</span>` : ""}</div>
      <div class="live-info">${av(s)}<div class="info"><h3>${esc(s.jmeno)}${partner(s)}</h3>
        <div class="sub">${esc(s.hra || "")}</div><div class="sub dim">${esc(s.titulek || "")}</div></div></div></a>`;
  }

  const RAZENI = { sledujici: "Sledující", divaci: "Rekord diváků", hodiny: "Odvysíláno (30 dní)", rust: "Růst (30 dní)" };
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
  function graf(el, body) {
    const W = el.clientWidth || 320, H = 160, P = 8;
    const ys = body.map((b) => b.v), min = Math.min(...ys), max = Math.max(...ys), rozsah = max - min || 1;
    const x = (i) => P + (i / Math.max(body.length - 1, 1)) * (W - 2 * P);
    const y = (v) => H - 22 - ((v - min) / rozsah) * (H - 44);
    const cara = body.map((b, i) => `${x(i).toFixed(1)},${y(b.v).toFixed(1)}`).join(" ");
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Vývoj počtu sledujících">
      <polygon class="g-area" points="${x(0)},${H - 22} ${cara} ${x(body.length - 1)},${H - 22}"></polygon>
      <polyline class="g-line" points="${cara}"></polyline>
      <text class="g-txt" x="${P}" y="${H - 6}">${esc(body[0].d)}</text>
      <text class="g-txt" x="${W - P}" y="${H - 6}" text-anchor="end">${esc(body[body.length - 1].d)}</text>
      <text class="g-txt" x="${W - P}" y="14" text-anchor="end">${esc(num(max))}</text></svg>`;
  }

  // ---------- Stránky ----------
  function strankaNovinky() {
    nastavTitulek("");
    const platformy = ["Vše", "PC", "PS5", "Xbox", "Switch"];
    const q = state.hledat.toLowerCase();
    const list = state.clanky
      .filter((c) => state.filtr === "Vše" || (c.platformy || []).includes(state.filtr))
      .filter((c) => !q || (c.nadpis + " " + c.perex).toLowerCase().includes(q))
      .sort((a, b) => datum(b) - datum(a));
    // Nahoru jako hlavní článek dej nejnovější vlastní článek (pokud je z posledních 24 h).
    const hi = list.findIndex((c) => c.vlastni && Date.now() - datum(c) < 864e5);
    if (hi > 0) list.unshift(...list.splice(hi, 1));
    const zive = state.zive.streamy.slice(0, 4);
    app.innerHTML = `
      <input class="search" id="q" type="search" placeholder="Hledat ve zprávách" value="${esc(state.hledat)}">
      <div class="chips">${platformy.map((p) => `<button class="chip${p === state.filtr ? " on" : ""}" data-f="${p}">${p}</button>`).join("")}</div>
      ${list.length ? `<div class="grid">${list.map(kartaClanku).join("")}</div>`
        : `<p class="empty">${state.clanky.length ? "Nic jsme nenašli." : "Sběr novinek právě běží. První zprávy se objeví do 15 minut."}</p>`}
      ${zive.length ? `<div class="section-title">Právě živě · <a href="/zive">všichni</a></div><div class="live-grid">${zive.map(kartaZive).join("")}</div>` : ""}`;
    app.querySelectorAll(".chip").forEach((b) => b.onclick = () => { state.filtr = b.dataset.f; strankaNovinky(); obarvi(app); });
    const inp = document.getElementById("q");
    inp.oninput = () => { state.hledat = inp.value; const pos = inp.selectionStart; strankaNovinky(); obarvi(app); const n = document.getElementById("q"); n.focus(); n.setSelectionRange(pos, pos); };
  }

  async function strankaClanek(id) {
    let c = state.clanky.find((x) => x.id === id);
    if (!c) { try { c = await nacti("clanek/" + enc(id)); } catch {} }
    if (!c || !c.nadpis) { nastavTitulek("Článek nenalezen"); app.innerHTML = `<p class="empty">Článek nenalezen. <a href="/">Zpět na novinky</a></p>`; return; }
    nastavTitulek(c.nadpis);
    const nadpis = c.nadpis.toLowerCase();
    const streameri = state.zive.streamy.filter((s) => s.hra && s.hra.length > 3 && nadpis.includes(s.hra.toLowerCase())).slice(0, 4);
    const hra = streameri[0]?.hra;
    app.innerHTML = `<article class="article">
      <a class="back" href="/">← Zpět na novinky</a>
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

  function strankaZive() {
    nastavTitulek("Právě živě");
    const { streamy, hry, cas } = state.zive;
    const list = state.hraZive ? streamy.filter((s) => s.hra === state.hraZive) : streamy;
    const divaku = streamy.reduce((a, s) => a + (s.divaci || 0), 0);
    app.innerHTML = `<div class="live-head"><h1>Právě živě</h1>
        <p class="dim">${pl(streamy.length, "český stream", "české streamy", "českých streamů")} · ${num(divaku)} diváků${cas ? ` · aktualizováno ${esc(kdy(new Date(cas)))}` : ""}</p></div>
      ${hry.length ? `<div class="chips"><button class="chip${state.hraZive ? "" : " on"}" data-h="">Vše</button>${hry.map((h) =>
        `<button class="chip${state.hraZive === h.hra ? " on" : ""}" data-h="${esc(h.hra)}">${esc(h.hra)}<span class="cnt">${h.streamu}</span></button>`).join("")}</div>` : ""}
      ${state.hraZive ? `<p><a class="link" href="/hra/${esc(slug(state.hraZive))}">Vše o hře ${esc(state.hraZive)} →</a></p>` : ""}
      ${list.length ? `<div class="live-grid">${list.map(kartaZive).join("")}</div>`
        : `<p class="empty">Teď nikdo z českých streamerů nevysílá (nebo se seznam teprve načítá).</p>`}
      <p class="source-note">Údaje z oficiálních API Twitche a Kicku, obnovují se každých 15 minut. Zahrnuty jsou streamy s jazykem nastaveným na češtinu.</p>`;
    app.querySelectorAll("[data-h]").forEach((b) => b.onclick = () => { state.hraZive = b.dataset.h; strankaZive(); obarvi(app); });
  }

  let hledaniTimer;
  async function strankaStreameri() {
    nastavTitulek("Čeští streameři");
    const klic = `${state.razeni}|${state.platforma}|${state.hledatS}`;
    if (!state.adresar[klic]) {
      app.innerHTML = `<p class="loading">Načítám streamery…</p>`;
      try { state.adresar[klic] = await nacti(`streameri?razeni=${enc(state.razeni)}&platforma=${enc(state.platforma)}&q=${enc(state.hledatS)}`); }
      catch { app.innerHTML = `<p class="empty">Seznam se nepodařilo načíst.</p>`; return; }
    }
    if (location.pathname.replace(/\/+$/, "") !== "/streameri") return;
    const list = state.adresar[klic];
    const plat = { "": "Všechny platformy", twitch: "Twitch", kick: "Kick" };
    app.innerHTML = `<div class="live-head"><h1>Čeští streameři</h1>
        <p class="dim">Všichni čeští streameři z Twitche a Kicku. Kdo je právě živě, je nahoře.</p></div>
      <input class="search" id="qs" type="search" placeholder="Hledat streamera" value="${esc(state.hledatS)}">
      <div class="chips">${Object.entries(plat).map(([k, v]) => `<button class="chip${k === state.platforma ? " on" : ""}" data-p="${k}">${v}</button>`).join("")}</div>
      <div class="chips">${Object.entries(RAZENI).map(([k, v]) => `<button class="chip${k === state.razeni ? " on" : ""}" data-r="${k}">${v}</button>`).join("")}</div>
      ${list.length ? `<div class="slist">${list.map((s, i) => radekStreamera(s, i, state.razeni)).join("")}</div>`
        : `<p class="empty">${state.hledatS ? "Nikoho takového jsme nenašli." : "Seznam se právě plní. Streameři se objeví, jakmile je zachytíme živě (do 15 minut)."}</p>`}
      <p class="source-note">Údaje z oficiálních API Twitche a Kicku. Počty sledujících (jen Twitch) se obnovují denně. Růst a odvysílané hodiny počítáme z vlastních denních záznamů.</p>`;
    app.querySelectorAll("[data-r]").forEach((b) => b.onclick = () => { state.razeni = b.dataset.r; strankaStreameri().then(() => obarvi(app)); });
    app.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => { state.platforma = b.dataset.p; strankaStreameri().then(() => obarvi(app)); });
    const inp = document.getElementById("qs");
    inp.oninput = () => {
      clearTimeout(hledaniTimer);
      hledaniTimer = setTimeout(async () => {
        state.hledatS = inp.value.trim().slice(0, 40);
        await strankaStreameri();
        const n = document.getElementById("qs");
        if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
      }, 350);
    };
  }

  async function strankaStreamer(platforma, login) {
    app.innerHTML = `<p class="loading">Načítám profil…</p>`;
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
      ${s.zive ? `<div class="section-title">Právě vysílá</div>${kartaZive(s)}` : ""}
      <div class="stats">
        <div class="stat"><b>${s.sledujici == null ? "–" : num(s.sledujici)}</b><span>sledujících</span></div>
        <div class="stat"><b>${num(s.max_divaku || 0)}</b><span>rekord diváků</span></div>
        <div class="stat"><b>${s.hodin30 || 0} h</b><span>odvysíláno za 30 dní</span></div>
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
  }

  // Rozvrh a klipy (Twitch) – načítají se zvlášť, aby profil nečekal.
  async function nactiExtra(s) {
    let x;
    try { x = await nacti(`streamer-extra/${enc(s.platforma || "twitch")}/${enc(s.login)}`); } catch { return; }
    const el = document.getElementById("extra");
    if (!el) return;
    const den = (d) => new Date(d).toLocaleString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
    el.innerHTML = `
      ${(x.rozvrh || []).length ? `<div class="section-title">Rozvrh streamů</div><div class="rozvrh">${x.rozvrh.slice(0, 7).map((r) =>
        `<div class="termin"><b>${esc(den(r.zacatek))}</b><span>${esc(r.nazev || r.hra || "Stream")}</span>${r.hra ? `<span class="dim">${esc(r.hra)}</span>` : ""}</div>`).join("")}</div>` : ""}
      ${(x.klipy || []).length ? `<div class="section-title">Nejlepší klipy za 30 dní</div><div class="klipy">${x.klipy.map((k) =>
        `<a class="klip" href="${esc(bezpecnaUrl(k.url))}" target="_blank" rel="noopener noreferrer">
          <div class="klip-thumb">${https(k.nahled) ? `<img src="${esc(k.nahled)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="live-time">${k.delka}s</span></div>
          <div class="klip-t">${esc(k.nazev)}</div><div class="sub">${num(k.zhlednuti)} zhlédnutí</div></a>`).join("")}</div>` : ""}`;
  }

  const BARVY_HER = [["#7c5cff", "#1b1440"], ["#ff7a3d", "#3a1406"], ["#3fbf7f", "#0a2a1a"], ["#2fa8ff", "#06182e"], ["#ff4d9a", "#2a0618"], ["#f2b631", "#2e2104"]];
  const barvaHry = (s) => BARVY_HER[[...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0) % BARVY_HER.length];

  async function strankaHry() {
    nastavTitulek("Hry českých streamerů");
    if (!state.hry) {
      app.innerHTML = `<p class="loading">Načítám hry…</p>`;
      try { state.hry = await nacti("hry"); } catch { app.innerHTML = `<p class="empty">Hry se nepodařilo načíst.</p>`; return; }
    }
    app.innerHTML = `<div class="live-head"><h1>Hry</h1><p class="dim">Co teď hrají čeští streameři. Klepni na hru pro detail.</p></div>
      ${state.hry.length ? `<div class="slist">${state.hry.map((h) => { const [a, b] = barvaHry(h.slug); return `<a class="srow" href="/hra/${esc(h.slug)}">
          <div class="hra-ikona" data-a="${esc(a)}" data-b="${esc(b)}">${esc(h.nazev[0] || "?")}</div>
          <div class="info"><h3>${esc(h.nazev)}</h3><div class="sub">${h.zive ? `<span class="dot-live"></span>${pl(h.zive, "stream", "streamy", "streamů")} živě · ${num(h.divaci)} diváků` : "teď nikdo nevysílá"}</div></div>
          <div class="num"><b>${h.streameru}</b>streamerů</div></a>`; }).join("")}</div>`
        : `<p class="empty">Seznam her se plní spolu se streamery.</p>`}`;
  }

  async function strankaHra(sl) {
    app.innerHTML = `<p class="loading">Načítám hru…</p>`;
    let h;
    try { h = await nacti("hra/" + enc(sl)); }
    catch { nastavTitulek("Hra nenalezena"); app.innerHTML = `<p class="empty">Hru jsme nenašli. <a href="/hry">Všechny hry</a></p>`; return; }
    nastavTitulek(`${h.nazev} – čeští streameři a novinky`);
    const [a, b] = barvaHry(h.slug);
    app.innerHTML = `<div class="profile">
      <a class="back" href="/hry">← Všechny hry</a>
      <div class="hra-hero" data-a="${esc(a)}" data-b="${esc(b)}"><h1>${esc(h.nazev)}</h1>
        <p>${h.zive.length ? `${pl(h.zive.length, "český stream", "české streamy", "českých streamů")} právě živě · ${num(h.zive.reduce((x, s) => x + (s.divaci || 0), 0))} diváků` : "Teď nikdo z českých streamerů nevysílá"}</p></div>
      ${h.zive.length ? `<div class="section-title">Právě živě</div><div class="live-grid">${h.zive.map(kartaZive).join("")}</div>` : ""}
      ${h.nejvic.length ? `<div class="section-title">Kdo hraje nejvíc</div><div class="slist">${h.nejvic.map((s, i) => radekStreamera(s, i, "hra")).join("")}</div>` : ""}
      ${h.clanky.length ? `<div class="section-title">Novinky</div><div class="grid">${h.clanky.map((c) => kartaClanku(c, 1)).join("")}</div>` : ""}
      <p class="source-note">Hodiny ve hře počítáme z vlastních záznamů od chvíle, kdy streamera sledujeme.</p>
    </div>`;
  }

  // ---------- Navigace (skutečné adresy, bez # v URL) ----------
  function route() {
    const casti = location.pathname.replace(/\/+$/, "").split("/").map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
    const sekce = casti[1] || "";
    const tab = { zive: "zive", streameri: "streameri", streamer: "streameri", hry: "hry", hra: "hry" }[sekce] || "novinky";
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
    let p;
    if (sekce === "clanek") p = strankaClanek(casti[2] || "");
    else if (sekce === "zive") strankaZive();
    else if (sekce === "streameri") p = strankaStreameri();
    else if (sekce === "streamer") p = casti.length > 3 ? strankaStreamer(casti[2], casti[3]) : strankaStreamer("twitch", casti[2] || "");
    else if (sekce === "hry") p = strankaHry();
    else if (sekce === "hra") p = strankaHra(casti[2] || "");
    else strankaNovinky();
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
    if (url.origin !== location.origin || /^\/(api|admin)(\/|$)/.test(url.pathname) || /\.[a-z0-9]+$/i.test(url.pathname)) return;
    e.preventDefault();
    if (url.pathname !== location.pathname) jdi(url.pathname);
  });
  addEventListener("popstate", route);

  async function nactiZive() {
    try { const z = await nacti("zive"); if (z && Array.isArray(z.streamy)) state.zive = z; } catch {}
    document.getElementById("live-count").textContent = state.zive.streamy.length || "";
  }

  async function start() {
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
    const [clanky] = await Promise.allSettled([nacti("clanky"), nactiZive()]);
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
  }
  start();
})();
