(() => {
  const C = window.CONFIG || {};
  const app = document.getElementById("app");
  const state = { clanky: [], streameri: [], filtr: "Vše", hledat: "" };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " mil." : n >= 1e3 ? Math.round(n / 100) / 10 + " tis." : String(n);

  // Bezpečnost: barvy pouze ve tvaru #abc / #aabbcc, odkazy pouze http(s).
  const barva = (v, zaloha) => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(v)) ? v : zaloha;
  function bezpecnaUrl(u) {
    try {
      const x = new URL(u, location.href);
      return x.protocol === "https:" || x.protocol === "http:" ? x.href : "#";
    } catch { return "#"; }
  }
  // Barvy se nastavují přes JS (CSSOM), takže CSP může zakázat inline styly.
  function obarvi(root) {
    root.querySelectorAll("img.cover-img").forEach((img) => {
      img.addEventListener("error", () => img.remove(), { once: true });
    });
    root.querySelectorAll("[data-a]").forEach((el) => {
      el.style.background = `linear-gradient(135deg,${barva(el.dataset.a, "#444")},${barva(el.dataset.b, "#111")})`;
    });
    root.querySelectorAll("[data-col]").forEach((el) => {
      const c = barva(el.dataset.col, "#888888");
      el.style.background = c + "33";
      el.style.color = c;
    });
  }

  function datum(c) {
    if (c.datum) return new Date(c.datum);
    return new Date(Date.now() - (c.pred_hodinami || 0) * 3600e3);
  }
  function kdy(d) {
    const m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return "právě teď";
    if (m < 60) return `před ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `před ${h} h`;
    return d.toLocaleDateString("cs-CZ");
  }

  async function nacti(cesta) {
    const url = C.api ? `${C.api}/${cesta}` : `data/${cesta}.json`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }

  function cover(c, glyph) {
    const [a, b] = c.barva || ["#444", "#111"];
    const img = c.obrazek && /^https:\/\//.test(c.obrazek)
      ? `<img class="cover-img" src="${esc(c.obrazek)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "";
    return `<div class="cover" data-a="${esc(a)}" data-b="${esc(b)}">
      <span class="glyph">${esc(glyph)}</span>${img}<span class="type">${esc(c.typ || "")}</span></div>`;
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
    return `<a class="card${c.hlavni || i === 0 ? " hero" : ""}" href="#/clanek/${esc(c.id)}">
      ${cover(c, c.nadpis[0])}
      <div class="body"><h3>${esc(c.nadpis)}</h3><p>${esc(c.perex)}</p>
      <div class="meta">${c.vlastni ? `<span class="own">Herní puls</span>` : ""}${pfs(c.platformy)}<span>· ${c.vlastni ? "" : esc(c.zdroje?.[0]?.nazev || "") + " · "}${kdy(datum(c))}</span></div></div></a>`;
  }

  function avatar(s, extra = "") {
    return `<div class="avatar${s.zive ? " live" : ""} ${extra}" data-col="${esc(s.barva)}">${esc(String(s.jmeno || "?")[0])}</div>`;
  }
  function radekStreamera(s) {
    return `<a class="streamer" href="#/streamer/${esc(s.id)}">
      ${avatar(s)}
      <div class="info"><h3>${esc(s.jmeno)} <span class="plat plat-${esc(s.platforma)}">${esc(s.platforma)}</span></h3>
      <div class="sub">${s.zive ? "Hraje " + esc(s.hra) : "Naposledy: " + esc(s.hra)}</div></div>
      <div class="num">${s.zive ? `<b>${num(s.divaci)}</b>diváků` : `<b>${num(s.sledujici)}</b>sledujících`}</div></a>`;
  }

  function strankaNovinky() {
    const platformy = ["Vše", "PC", "PS5", "Xbox", "Switch"];
    const q = state.hledat.toLowerCase();
    const list = state.clanky
      .filter((c) => state.filtr === "Vše" || (c.platformy || []).includes(state.filtr))
      .filter((c) => !q || (c.nadpis + " " + c.perex).toLowerCase().includes(q))
      .sort((a, b) => datum(b) - datum(a));
    // Nahoru jako hlavní článek dej nejnovější vlastní článek (pokud je z posledních 24 h).
    const hi = list.findIndex((c) => c.vlastni && Date.now() - datum(c) < 864e5);
    if (hi > 0) list.unshift(...list.splice(hi, 1));
    const zive = state.streameri.filter((s) => s.zive).sort((a, b) => b.divaci - a.divaci).slice(0, 3);
    app.innerHTML = `
      <input class="search" id="q" type="search" placeholder="Hledat ve zprávách" value="${esc(state.hledat)}">
      <div class="chips">${platformy.map((p) => `<button class="chip${p === state.filtr ? " on" : ""}" data-f="${p}">${p}</button>`).join("")}</div>
      ${list.length ? `<div class="grid">${list.map(kartaClanku).join("")}</div>`
        : `<p class="empty">${state.clanky.length ? "Nic jsme nenašli." : "Sběr novinek právě běží. První zprávy se objeví do 15 minut."}</p>`}
      ${zive.length ? `<div class="section-title">Právě živě</div><div class="grid">${zive.map(radekStreamera).join("")}</div>` : ""}`;
    app.querySelectorAll(".chip").forEach((b) => b.onclick = () => { state.filtr = b.dataset.f; strankaNovinky(); });
    const inp = document.getElementById("q");
    obarvi(app);
    inp.oninput = () => { state.hledat = inp.value; const pos = inp.selectionStart; strankaNovinky(); const n = document.getElementById("q"); n.focus(); n.setSelectionRange(pos, pos); };
  }

  async function strankaClanek(id) {
    let c = state.clanky.find((x) => x.id === id);
    if (!c && C.api) { try { c = await nacti("clanek/" + encodeURIComponent(id)); } catch {} }
    if (!c) return (app.innerHTML = `<p class="empty">Článek nenalezen. <a href="#/">Zpět</a></p>`);
    const streameri = state.streameri.filter((s) => (s.hry || []).some((h) => c.nadpis.includes(h)));
    app.innerHTML = `<article class="article">
      <a class="back" href="#/">← Zpět na novinky</a>
      <div class="article-cover">${cover(c, c.nadpis[0])}</div>
      <h1>${esc(c.nadpis)}</h1>
      <div class="meta">${pfs(c.platformy)}<span>· ${kdy(datum(c))}</span></div>
      <p class="perex">${esc(c.perex)}</p>
      <div class="text">${c.md ? md(c.md) : (c.text || []).map((p) => `<p>${esc(p)}</p>`).join("")}</div>
      ${c.url && !c.vlastni ? `<a class="btn-source" href="${esc(bezpecnaUrl(c.url))}" target="_blank" rel="noopener noreferrer">Číst celý článek na ${esc(c.zdroje?.[0]?.nazev || "zdroji")} →</a>` : ""}
      <div class="sources"><b>${(c.zdroje || []).length > 1 ? "Zdroje" : "Zdroj"}:</b> ${(c.zdroje || []).map((z) => `<a href="${esc(bezpecnaUrl(z.url))}" target="_blank" rel="noopener noreferrer nofollow">${esc(z.nazev)}</a>`).join(", ")}
        <div class="ai-note">${c.ai ? "Článek napsala AI na základě uvedených zdrojů a prošel automatickou kontrolou faktů." : c.vlastni ? "Článek redakce Herní puls." : "Zpráva byla automaticky převzata z RSS kanálu zdroje. Celý článek najdeš u autora."}</div></div>
      ${streameri.length ? `<div class="section-title">Kdo tuhle hru streamuje</div><div class="grid">${streameri.map(radekStreamera).join("")}</div>` : ""}
    </article>`;
    scrollTo(0, 0);
  }

  function strankaZive() {
    const list = state.streameri.filter((s) => s.zive).sort((a, b) => b.divaci - a.divaci);
    app.innerHTML = `<div class="section-title">Právě vysílají</div>
      ${list.length ? `<div class="grid">${list.map(radekStreamera).join("")}</div>` : `<p class="empty">Teď nikdo nevysílá.</p>`}`;
  }

  function strankaStreameri() {
    const list = [...state.streameri].sort((a, b) => b.sledujici - a.sledujici);
    app.innerHTML = `<div class="section-title">Nejsledovanější streameři</div>
      <div class="grid">${list.map(radekStreamera).join("")}</div>`;
  }

  function strankaStreamer(id) {
    const s = state.streameri.find((x) => x.id === id);
    if (!s) return (app.innerHTML = `<p class="empty">Streamer nenalezen.</p>`);
    const clanky = state.clanky.filter((c) => (s.hry || []).some((h) => c.nadpis.includes(h)));
    app.innerHTML = `<div class="article">
      <a class="back" href="#/streameri">← Všichni streameři</a>
      <div class="profile-head">${avatar(s)}<div><h1 class="m0">${esc(s.jmeno)}</h1>
        <span class="plat plat-${esc(s.platforma)}">${esc(s.platforma)}</span> <span class="back">${s.jazyk === "sk" ? "slovensky" : "česky"}</span></div></div>
      <div class="stats">
        <div class="stat"><b>${num(s.sledujici)}</b><span>sledujících</span></div>
        <div class="stat"><b>${s.zive ? num(s.divaci) : "–"}</b><span>${s.zive ? "diváků teď" : "offline"}</span></div>
        <div class="stat"><b>${(s.hry || []).length}</b><span>her</span></div></div>
      <p>${esc(s.bio)}</p>
      ${clanky.length ? `<div class="section-title">Novinky k jeho hrám</div><div class="grid">${clanky.map((c) => kartaClanku(c, 1)).join("")}</div>` : ""}
    </div>`;
    scrollTo(0, 0);
  }

  function route() {
    const [, sekce, id] = (location.hash || "#/").split("/");
    const tab = sekce === "zive" ? "zive" : sekce === "streameri" || sekce === "streamer" ? "streameri" : "novinky";
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
    if (sekce === "clanek") return strankaClanek(decodeURIComponent(id)).then(() => obarvi(app));
    else if (sekce === "zive") strankaZive();
    else if (sekce === "streameri") strankaStreameri();
    else if (sekce === "streamer") strankaStreamer(decodeURIComponent(id));
    else strankaNovinky();
    obarvi(app);
  }

  async function start() {
    if (C.nazev) {
      document.getElementById("site-name").textContent = C.nazev;
      document.querySelectorAll(".site-name-foot").forEach((e) => (e.textContent = C.nazev));
      document.title = `${C.nazev} – novinky a streameři`;
    }
    document.getElementById("year").textContent = new Date().getFullYear();
    try {
      [state.clanky, state.streameri] = await Promise.all([nacti("clanky"), nacti("streameri")]);
    } catch (e) {
      app.innerHTML = `<p class="empty">Data se nepodařilo načíst.</p>`;
      return;
    }
    const n = state.streameri.filter((s) => s.zive).length;
    document.getElementById("live-count").textContent = n || "";
    addEventListener("hashchange", route);
    route();
  }
  start();
})();
