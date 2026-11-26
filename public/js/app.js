(() => {
  const C = window.CONFIG || {};
  const app = document.getElementById("app");
  const state = {
    clanky: [], zive: { streamy: [], hry: [] }, adresar: {}, hry: null,
    razeni: "sledujici", platforma: "", hledatS: "", hraZive: "", filtr: "Vše", hledat: "",
    kategorie: "", mali: false, udalost: null, prehled: null, zdrojNov: "", katNov: "",
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
    const pod = [["zive", "/zive", "Živě"], ["zebricek", "/streameri", "Žebříček"], ["hry", "/hry", "Hry"], ["prehled", "/prehled", "Přehled"]];
    const obl = new Set(oblibeni());
    const mojiZive = streamy.filter((s) => obl.has(klicS(s)));
    return `<div class="live-head"><h1>Čeští streameři</h1>
        <p>${streamy.length ? `Právě ${streamy.length >= 2 && streamy.length <= 4 ? "vysílají" : "vysílá"} ${pl(streamy.length, "streamer", "streameři", "streamerů")} pro ${num(divaku)} diváků.` : "Teď nikdo nevysílá – mrkni na žebříček nebo hry."}</p></div>
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

  // ---------- Stránky ----------
  function strankaNovinky() {
    nastavTitulek("");
    const platformy = ["Vše", "PC", "PS5", "Xbox", "Switch"];
    const q = state.hledat.toLowerCase();
    const list = state.clanky
      .filter((c) => !state.zdrojNov || (state.zdrojNov === "cs" ? ceskyClanek(c) : !ceskyClanek(c)))
      .filter((c) => !state.katNov || katClanku(c).includes(state.katNov))
      .filter((c) => state.filtr === "Vše" || (c.platformy || []).includes(state.filtr))
      .filter((c) => !q || (c.nadpis + " " + c.perex).toLowerCase().includes(q))
      .sort((a, b) => datum(b) - datum(a));
    // Nahoru jako hlavní článek dej nejnovější vlastní článek (pokud je z posledních 24 h).
    const hi = list.findIndex((c) => c.vlastni && Date.now() - datum(c) < 864e5);
    if (hi > 0) list.unshift(...list.splice(hi, 1));
    const zive = state.zive.streamy.slice(0, 4);
    const pocetCz = state.clanky.filter(ceskyClanek).length;
    const kat = KAT_NOV.filter(([k]) => state.clanky.some((c) => katClanku(c).includes(k)));
    app.innerHTML = `<div class="news-head"><h1>Novinky</h1><p>Co je nového ve světě her – nejčerstvější zprávy nahoře, obnovuje se samo.</p></div>
      <div class="filtry">
        <input class="search" id="q" type="search" placeholder="Hledat ve zprávách" value="${esc(state.hledat)}">
        <div class="seg" role="group" aria-label="Odkud">${[["", "Vše"], ["cs", "České weby"], ["en", "Ze zahraničí"]].map(([k, v]) =>
          `<button type="button" class="seg-b${k === state.zdrojNov ? " on" : ""}" data-z="${k}" aria-pressed="${k === state.zdrojNov}">${v}</button>`).join("")}</div>
      </div>
      ${state.zdrojNov === "cs" && !pocetCz ? `<p class="dim">České herní weby zatím nedodávají zprávy – ověřujeme jejich RSS kanály. Do té doby tu najdeš jen články Herního pulsu.</p>` : ""}
      <div class="chips"><button class="chip${state.katNov ? "" : " on"}" data-kn="">Všechny kategorie</button>${kat.map(([k, n]) =>
        `<button class="chip${k === state.katNov ? " on" : ""}" data-kn="${k}">${n}</button>`).join("")}</div>
      <div class="chips">${platformy.map((p) => `<button class="chip${p === state.filtr ? " on" : ""}" data-f="${p}">${p === "Vše" ? "Všechny platformy" : p}</button>`).join("")}</div>
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
      app.innerHTML = `<p class="loading">Načítám streamery…</p>`;
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
      <div class="profil-akce">
        <button type="button" class="pa-b${jeOblibeny(s) ? " on" : ""}" id="b-obl">${jeOblibeny(s) ? "★ Oblíbený" : "☆ Přidat do oblíbených"}</button>
        <button type="button" class="pa-b" id="b-upoz">${pushZapnuto() && jeOblibeny(s) ? "Upozornění zapnutá" : "Upozornit, až začne vysílat"}</button>
        <a class="pa-b" href="/porovnat?a=${esc(enc(s.platforma || "twitch"))}/${esc(enc(s.login))}">Porovnat</a>
      </div>
      <p class="pa-zprava" id="pa-zprava" role="status" aria-live="polite"></p>
      ${odkazySit(s.odkazy)}
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
    const zpr = (t) => { document.getElementById("pa-zprava").textContent = t; };
    const bObl = document.getElementById("b-obl"), bUp = document.getElementById("b-upoz");
    bObl.onclick = () => {
      const pridan = prepniOblibeny(s);
      bObl.classList.toggle("on", pridan);
      bObl.textContent = pridan ? "★ Oblíbený" : "☆ Přidat do oblíbených";
      zpr(pridan ? `${s.jmeno} je v oblíbených. Najdeš ho nahoře v sekci Streameři.` : "Odebráno z oblíbených.");
    };
    bUp.onclick = async () => {
      bUp.disabled = true;
      try {
        if (!jeOblibeny(s)) { prepniOblibeny(s); bObl.classList.add("on"); bObl.textContent = "★ Oblíbený"; }
        await zapniUpozorneni();
        bUp.textContent = "Upozornění zapnutá";
        zpr(`Hotovo. Dáme ti vědět, až ${s.jmeno} začne vysílat (do 15 minut od začátku streamu).`);
      } catch (e) { zpr(e.message || "Upozornění se nepodařilo zapnout."); }
      bUp.disabled = false;
    };
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
    app.innerHTML = `${hubHlava("hry")}
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
      app.innerHTML = `${hubHlava("prehled")}<p class="loading">Počítám přehled…</p>`;
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
      ["Odvysíláno za 30 dní", a.hodin30, b.hodin30, (v) => (v || 0) + " h"],
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

  // ---------- Navigace (skutečné adresy, bez # v URL) ----------
  function route() {
    const casti = location.pathname.replace(/\/+$/, "").split("/").map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
    const sekce = casti[1] || "";
    const tab = ["zive", "streameri", "streamer", "hry", "hra", "prehled", "porovnat"].includes(sekce) ? "streameri" : "novinky";
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
    let p;
    if (sekce === "clanek") p = strankaClanek(casti[2] || "");
    else if (sekce === "zive") strankaZive();
    else if (sekce === "streameri") p = strankaStreameri();
    else if (sekce === "streamer") p = casti.length > 3 ? strankaStreamer(casti[2], casti[3]) : strankaStreamer("twitch", casti[2] || "");
    else if (sekce === "hry") p = strankaHry();
    else if (sekce === "hra") p = strankaHra(casti[2] || "");
    else if (sekce === "prehled") p = strankaPrehled();
    else if (sekce === "porovnat") p = strankaPorovnat();
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
        <h2 id="welcome-t">Ahoj! Tenhle web dělá umělá inteligence.</h2>
        <p>Herní puls navrhla, naprogramovala a provozuje AI. Novinky sbírá sama a čísla o streamerech bere přímo z Twitche a Kicku. Je rychlá, ale občas se splete – dej jí prosím chvilku pozornosti a trochu důvěry. Když něco nesedí, dej nám vědět.</p>
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
      if ((location.pathname === "/" || location.pathname === "") && document.activeElement?.id !== "q") { strankaNovinky(); obarvi(app); }
    }, 300000);
  }
  start();
})();
