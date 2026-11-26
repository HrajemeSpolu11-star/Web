{
  const PLATFORMY = ["PC", "PS5", "Xbox", "Switch"];
  const TYPY = ["Zpráva", "Oznámení", "Recenze", "Trailer", "Sleva", "Aktualizace"];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let polozky = [];

  // --- komunikace s API ---
  async function api(cesta, data) {
    const opt = data === undefined
      ? { credentials: "same-origin" }
      : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Admin": "1" }, body: JSON.stringify(data) };
    const r = await fetch("/api/admin" + cesta, opt);
    let d = {};
    try { d = await r.json(); } catch {}
    if (!r.ok) throw new Error(d.chyba || `Chyba ${r.status}`);
    return d;
  }
  function zprava(text, typ = "ok") {
    const z = $("zprava");
    z.textContent = text;
    z.className = "adm-zprava " + (text ? typ : "");
    if (text && typ === "ok") setTimeout(() => { if (z.textContent === text) zprava(""); }, 5000);
  }
  const kdy = (ms) => ms ? new Date(ms).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  // --- seznam ---
  async function nactiSeznam(stav) {
    $("seznam").innerHTML = `<p class="empty">Načítám…</p>`;
    try {
      polozky = await api("/prispevky?stav=" + encodeURIComponent(stav));
    } catch (e) {
      $("seznam").innerHTML = `<p class="empty">${esc(e.message)}</p>`;
      return;
    }
    if (!polozky.length) {
      $("seznam").innerHTML = `<p class="empty">${stav === "koncept" ? "Nic nečeká na schválení." : "Zatím žádné zveřejněné články."}</p>`;
      return;
    }
    $("seznam").innerHTML = polozky.map((p) => `
      <article class="adm-polozka">
        <h3>${esc(p.nadpis)}</h3>
        <div class="meta"><span class="adm-autor">${p.autor === "ai" ? "AI" : "Ručně"}</span>
          <span>${esc(kdy(p.publikovano || p.vytvoreno))}</span>${p.platformy.map((x) => `<span class="pf pf-${esc(x)}">${esc(x)}</span>`).join("")}</div>
        <p class="adm-help">${esc(p.perex)}</p>
        ${p.poznamka ? `<div class="adm-poznamka">Kontrola našla: \n${esc(p.poznamka)}</div>` : ""}
        <div class="tlacitka">
          <button class="adm-btn" data-akce="upravit" data-id="${esc(p.id)}">Upravit</button>
          ${p.stav === "publikovano"
            ? `<a class="adm-btn" href="/#/clanek/${esc(p.id)}" target="_blank" rel="noopener">Zobrazit</a>
               <button class="adm-btn" data-akce="koncept" data-id="${esc(p.id)}">Stáhnout z webu</button>`
            : `<button class="adm-btn adm-btn-primary" data-akce="publikovano" data-id="${esc(p.id)}">Zveřejnit</button>
               <button class="adm-btn" data-akce="zamitnuto" data-id="${esc(p.id)}">Zahodit</button>`}
        </div>
      </article>`).join("");
  }

  $("seznam").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-akce]");
    if (!b) return;
    const { akce, id } = b.dataset;
    if (akce === "upravit") { location.hash = "novy"; otevriEditor(polozky.find((p) => p.id === id)); return; }
    b.disabled = true;
    try {
      await api(`/prispevek/${encodeURIComponent(id)}/stav`, { stav: akce });
      zprava(akce === "publikovano" ? "Článek je zveřejněný." : akce === "zamitnuto" ? "Článek byl zahozen." : "Článek byl stažen z webu.");
      route();
    } catch (err) { zprava(err.message, "chyba"); b.disabled = false; }
  });

  $("napis-ted").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.textContent = "AI píše článek… (může to trvat až minutu)";
    try {
      const v = await api("/napis-ted", {});
      zprava(v.nadpis ? `${v.stav}: ${v.nadpis}` : `AI nenapsala článek: ${v.stav}`, v.nadpis ? "ok" : "chyba");
      route();
    } catch (err) { zprava(err.message, "chyba"); }
    b.disabled = false;
    b.textContent = "Nechat AI napsat článek teď";
  });

  // --- editor ---
  $("f-platformy").innerHTML = PLATFORMY.map((p) => `<label><input type="checkbox" value="${p}"> ${p}</label>`).join("");
  $("f-typ").innerHTML = TYPY.map((t) => `<option>${t}</option>`).join("");

  function otevriEditor(p) {
    p = p || {};
    $("f-id").value = p.id || "";
    $("f-nadpis").value = p.nadpis || "";
    $("f-perex").value = p.perex || "";
    $("f-text").value = p.text || "";
    $("f-typ").value = TYPY.includes(p.typ) ? p.typ : "Zpráva";
    $("f-obrazek").value = p.obrazek || "";
    $("f-zdroje").value = (p.zdroje || []).map((z) => `${z.nazev} | ${z.url}`).join("\n");
    $("f-platformy").querySelectorAll("input").forEach((i) => (i.checked = (p.platformy || []).includes(i.value)));
    $("f-poznamka").hidden = !p.poznamka;
    $("f-poznamka").textContent = p.poznamka ? "Kontrola našla:\n" + p.poznamka : "";
  }

  function nactiZdroje(text) {
    return text.split("\n").map((r) => r.trim()).filter(Boolean).map((r) => {
      const [nazev, url] = r.split("|").map((s) => s.trim());
      return { nazev, url };
    });
  }

  $("editor").addEventListener("submit", async (e) => {
    e.preventDefault();
    const stav = e.submitter?.dataset.stav || "koncept";
    const data = {
      nadpis: $("f-nadpis").value, perex: $("f-perex").value, text: $("f-text").value,
      typ: $("f-typ").value, obrazek: $("f-obrazek").value.trim(),
      platformy: [...$("f-platformy").querySelectorAll("input:checked")].map((i) => i.value),
      zdroje: nactiZdroje($("f-zdroje").value), stav,
    };
    if (data.nadpis.trim().length < 5) { zprava("Doplň nadpis (aspoň 5 znaků).", "chyba"); $("f-nadpis").focus(); return; }
    const spatne = data.zdroje.find((z) => !z.nazev || !/^https:\/\//.test(z.url || ""));
    if (spatne) { zprava("Každý zdroj musí mít tvar: Název | https://odkaz", "chyba"); $("f-zdroje").focus(); return; }
    const id = $("f-id").value;
    try {
      const v = await api(id ? `/prispevek/${encodeURIComponent(id)}` : "/prispevek", data);
      $("f-id").value = v.id;
      zprava(stav === "publikovano" ? "Článek je zveřejněný na webu." : "Koncept je uložený.");
      if (stav === "publikovano") { otevriEditor(); location.hash = "publikovano"; }
    } catch (err) { zprava(err.message, "chyba"); }
  });

  // Rozdělení vloženého textu: 1. řádek nadpis, 1. odstavec perex, zbytek text, řádky „Zdroj:“ jako zdroje.
  $("import-btn").addEventListener("click", () => {
    const zdroje = [];
    const radky = $("import-text").value.replace(/\r/g, "").split("\n").filter((r) => {
      const m = r.match(/^\s*zdroj(?:e)?\s*:\s*(.+)$/i);
      if (m) { zdroje.push(m[1].trim()); return false; }
      return true;
    });
    const bloky = radky.join("\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    if (!bloky.length) { zprava("Vlož nejdřív text článku.", "chyba"); return; }
    let [prvni, ...zbytek] = bloky;
    const radkyPrvni = prvni.split("\n");
    const nadpis = radkyPrvni.shift().replace(/^#+\s*/, "").replace(/^\*\*(.*)\*\*$/, "$1").trim();
    if (radkyPrvni.length) zbytek.unshift(radkyPrvni.join(" "));
    $("f-nadpis").value = nadpis;
    $("f-perex").value = (zbytek.shift() || "").replace(/\n/g, " ");
    $("f-text").value = zbytek.join("\n\n");
    if (zdroje.length) $("f-zdroje").value = zdroje.join("\n");
    zprava("Text je rozdělený do polí. Zkontroluj ho a ulož.");
  });

  // --- navigace ---
  function route() {
    const tab = ["koncept", "publikovano", "novy"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "koncept";
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
    $("seznam-sekce").hidden = tab === "novy";
    $("editor-sekce").hidden = tab !== "novy";
    if (tab !== "novy") nactiSeznam(tab);
  }
  addEventListener("hashchange", route);
  document.querySelector('.tabs a[data-tab="novy"]').addEventListener("click", () => otevriEditor());

  api("/ja").then((j) => {
    $("info").textContent = `Přihlášen: ${j.email || "?"} · AI: ${j.groq ? "Groq" : "jen záloha (Workers AI)"} · Zveřejňování: ${j.publikovat === "auto" ? "automaticky po kontrole" : "jen se schválením"}`;
  }).catch((e) => { $("info").textContent = e.message; });
  route();
}
