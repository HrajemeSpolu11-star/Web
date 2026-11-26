// „Rozjede se mi to?“ – orientační porovnání počítače se systémovými požadavky hry.
// Výkon je relativní číslo (GeForce RTX 3060 = 100, procesory: Core i5-12400 = 100) sestavené z veřejných testů výkonu
// (průměry herních testů). Je to ORIENTAČNÍ – skutečný výkon závisí na rozlišení, nastavení, ovladačích i chlazení.
// Načítá se jen na stránkách, které ho potřebují (public/js/app.js → nactiHw()).
(() => {
  "use strict";
  // [název, výkon, klíčová slova pro rozpoznání v textu požadavků]
  const GPU = [
    // NVIDIA GeForce
    ["GeForce GT 730", 6], ["GeForce GT 1030", 10], ["GeForce GTX 460", 12], ["GeForce GTX 560", 14], ["GeForce GTX 560 Ti", 15], ["GeForce GTX 570", 18], ["GeForce GTX 580", 20],
    ["GeForce GTX 650", 12], ["GeForce GTX 650 Ti", 16], ["GeForce GTX 660", 22], ["GeForce GTX 660 Ti", 25], ["GeForce GTX 670", 28], ["GeForce GTX 680", 31],
    ["GeForce GTX 750", 15], ["GeForce GTX 750 Ti", 18], ["GeForce GTX 760", 27], ["GeForce GTX 770", 33], ["GeForce GTX 780", 38], ["GeForce GTX 780 Ti", 45],
    ["GeForce GTX 950", 26], ["GeForce GTX 960", 30], ["GeForce GTX 970", 42], ["GeForce GTX 980", 50], ["GeForce GTX 980 Ti", 62],
    ["GeForce GTX 1050", 27], ["GeForce GTX 1050 Ti", 32], ["GeForce GTX 1060", 48], ["GeForce GTX 1070", 62], ["GeForce GTX 1070 Ti", 70], ["GeForce GTX 1080", 75], ["GeForce GTX 1080 Ti", 92],
    ["GeForce GTX 1630", 26], ["GeForce GTX 1650", 40], ["GeForce GTX 1650 Super", 50], ["GeForce GTX 1660", 57], ["GeForce GTX 1660 Super", 63], ["GeForce GTX 1660 Ti", 64],
    ["GeForce RTX 2060", 72], ["GeForce RTX 2060 Super", 83], ["GeForce RTX 2070", 88], ["GeForce RTX 2070 Super", 98], ["GeForce RTX 2080", 104], ["GeForce RTX 2080 Super", 109], ["GeForce RTX 2080 Ti", 125],
    ["GeForce RTX 3050", 60], ["GeForce RTX 3060", 100], ["GeForce RTX 3060 Ti", 120], ["GeForce RTX 3070", 135], ["GeForce RTX 3070 Ti", 142], ["GeForce RTX 3080", 165], ["GeForce RTX 3080 Ti", 180], ["GeForce RTX 3090", 185], ["GeForce RTX 3090 Ti", 200],
    ["GeForce RTX 4060", 120], ["GeForce RTX 4060 Ti", 140], ["GeForce RTX 4070", 175], ["GeForce RTX 4070 Super", 195], ["GeForce RTX 4070 Ti", 205], ["GeForce RTX 4070 Ti Super", 220], ["GeForce RTX 4080", 250], ["GeForce RTX 4080 Super", 255], ["GeForce RTX 4090", 310],
    ["GeForce RTX 5060", 145], ["GeForce RTX 5060 Ti", 165], ["GeForce RTX 5070", 215], ["GeForce RTX 5070 Ti", 260], ["GeForce RTX 5080", 285], ["GeForce RTX 5090", 380],
    // AMD Radeon
    ["Radeon HD 7750", 12], ["Radeon HD 7770", 15], ["Radeon HD 7850", 22], ["Radeon HD 7870", 26], ["Radeon HD 7950", 30], ["Radeon HD 7970", 33],
    ["Radeon R7 260X", 16], ["Radeon R7 265", 22], ["Radeon R7 370", 22], ["Radeon R9 270", 25], ["Radeon R9 270X", 27], ["Radeon R9 280", 30], ["Radeon R9 280X", 33],
    ["Radeon R9 290", 40], ["Radeon R9 290X", 43], ["Radeon R9 380", 32], ["Radeon R9 380X", 35], ["Radeon R9 390", 45], ["Radeon R9 390X", 48], ["Radeon R9 Fury", 52], ["Radeon R9 Fury X", 56],
    ["Radeon RX 460", 20], ["Radeon RX 470", 40], ["Radeon RX 480", 46], ["Radeon RX 550", 16], ["Radeon RX 560", 22], ["Radeon RX 570", 43], ["Radeon RX 580", 48], ["Radeon RX 590", 52],
    ["Radeon RX Vega 56", 62], ["Radeon RX Vega 64", 68], ["Radeon VII", 85],
    ["Radeon RX 5500 XT", 50], ["Radeon RX 5600 XT", 72], ["Radeon RX 5700", 80], ["Radeon RX 5700 XT", 90],
    ["Radeon RX 6400", 28], ["Radeon RX 6500 XT", 38], ["Radeon RX 6600", 93], ["Radeon RX 6600 XT", 105], ["Radeon RX 6650 XT", 110], ["Radeon RX 6700 XT", 128], ["Radeon RX 6750 XT", 135],
    ["Radeon RX 6800", 165], ["Radeon RX 6800 XT", 190], ["Radeon RX 6900 XT", 205], ["Radeon RX 6950 XT", 215],
    ["Radeon RX 7600", 110], ["Radeon RX 7600 XT", 115], ["Radeon RX 7700 XT", 160], ["Radeon RX 7800 XT", 185], ["Radeon RX 7900 GRE", 205], ["Radeon RX 7900 XT", 240], ["Radeon RX 7900 XTX", 275],
    ["Radeon RX 9060 XT", 160], ["Radeon RX 9070", 230], ["Radeon RX 9070 XT", 255],
    // Intel Arc
    ["Intel Arc A380", 30], ["Intel Arc A580", 85], ["Intel Arc A750", 100], ["Intel Arc A770", 108], ["Intel Arc B570", 115], ["Intel Arc B580", 125],
  ];

  // Klíč pro porovnání: jen podstatné části názvu („gtx 1060“, „rx 6600 xt“, „r9 290x“, „arc a770“).
  const norm = (s) => String(s || "").toLowerCase().replace(/geforce|nvidia|amd|radeon|intel|graphics|®|™|\(r\)|\(tm\)/g, " ")
    .replace(/(\d)\s*(gb|g)\b/g, "$1gb").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const GPU_K = GPU.map(([n, v]) => ({ nazev: n, vykon: v, klic: norm(n).replace(/\bhd\b /, "hd ") }))
    .sort((a, b) => b.klic.length - a.klic.length); // delší klíče první („rtx 4070 ti super“ před „rtx 4070“)

  // Najde grafiky v textu (v požadavcích bývá „GTX 1060 / RX 580“). Vrací seznam nalezených.
  function najdiGpu(text) {
    let t = " " + norm(text) + " ";
    const nalez = [];
    for (const g of GPU_K) {
      // Mezery kolem – „rtx 3060“ nesmí najít „rtx 3060 ti“ (to už by se našlo dřív a vyřízlo).
      const k = " " + g.klic + " ";
      if (t.includes(k)) { nalez.push(g); t = t.split(k).join(" | "); }
    }
    // Zkrácené zápisy bez řady: „1060“, „580“ s výrobcem v textu
    return nalez;
  }

  // Procesory: odhad podle řady a generace (Intel Core i3–i9, Core Ultra, AMD Ryzen 3–9, FX, starší).
  const INTEL = { // generace → [i3, i5, i7, i9]
    2: [30, 40, 48, 48], 3: [33, 44, 52, 52], 4: [37, 48, 57, 57], 5: [38, 50, 60, 60], 6: [42, 55, 65, 65], 7: [46, 58, 70, 70],
    8: [55, 70, 80, 90], 9: [57, 72, 85, 92], 10: [62, 76, 90, 95], 11: [64, 85, 95, 100], 12: [75, 100, 115, 125], 13: [80, 115, 130, 140], 14: [82, 118, 135, 145],
  };
  const RYZEN = { // řada → [Ryzen 3, 5, 7, 9]
    1: [40, 55, 62, 62], 2: [45, 60, 68, 68], 3: [55, 75, 85, 92], 4: [60, 82, 90, 90], 5: [70, 95, 105, 112], 7: [85, 115, 125, 135], 8: [80, 108, 118, 118], 9: [90, 122, 132, 142],
  };
  const TIER = { 3: 0, 5: 1, 7: 2, 9: 3 };
  function najdiCpu(text) {
    const t = String(text || "").toLowerCase().replace(/®|™|\(r\)|\(tm\)/g, "");
    const nalez = [];
    let m;
    const reI = /\bi([3579])[\s-]?(\d{4,5})([a-z]{0,2})\b/g;
    while ((m = reI.exec(t))) {
      const cislo = m[2], gen = cislo.length === 5 ? Number(cislo.slice(0, 2)) : Number(cislo[0]);
      const g = INTEL[Math.min(14, Math.max(2, gen))];
      if (!g) continue;
      let v = g[TIER[m[1]]];
      if (/u|y/.test(m[3])) v *= 0.75; else if (/h/.test(m[3])) v *= 0.92;
      nalez.push({ nazev: `Core i${m[1]}-${cislo}${m[3].toUpperCase()}`, vykon: Math.round(v) });
    }
    const reU = /\bultra\s*([579])\s*(\d{3})([a-z]?)\b/g;
    while ((m = reU.exec(t))) nalez.push({ nazev: `Core Ultra ${m[1]} ${m[2]}${m[3].toUpperCase()}`, vykon: { 5: 112, 7: 128, 9: 140 }[m[1]] * (m[3] === "u" ? 0.75 : m[3] === "h" ? 0.92 : 1) | 0 });
    const reR = /ryzen\s*([3579])\s*(?:pro\s*)?(\d)(\d{3})(x3d|xt|x|g|ge|h|hs|u)?\b/g;
    while ((m = reR.exec(t))) {
      const g = RYZEN[Number(m[2])];
      if (!g) continue;
      let v = g[TIER[m[1]]];
      if (m[4] === "x3d") v *= 1.15; else if (m[4] === "u") v *= 0.75; else if (/^h/.test(m[4] || "")) v *= 0.9; else if (/^g/.test(m[4] || "")) v *= 0.95;
      nalez.push({ nazev: `Ryzen ${m[1]} ${m[2]}${m[3]}${(m[4] || "").toUpperCase()}`, vykon: Math.round(v) });
    }
    const reFx = /\bfx[\s-]?(\d)(\d{3})\b/g;
    while ((m = reFx.exec(t))) nalez.push({ nazev: `AMD FX-${m[1]}${m[2]}`, vykon: { 4: 25, 6: 30, 8: 35, 9: 38 }[m[1]] || 28 });
    if (/core\s*2\s*duo/.test(t)) nalez.push({ nazev: "Core 2 Duo", vykon: 12 });
    if (/core\s*2\s*quad/.test(t)) nalez.push({ nazev: "Core 2 Quad", vykon: 18 });
    if (/phenom/.test(t)) nalez.push({ nazev: "Phenom II", vykon: 22 });
    return nalez;
  }

  // RAM v GB z textu („8 GB RAM“, „16GB“).
  function najdiRam(text) {
    const m = /(\d{1,3})\s*(gb|g)\b/i.exec(String(text || ""));
    return m ? Number(m[1]) : null;
  }

  // Z řádků požadavků vytáhne hodnoty pro grafiku, procesor, paměť (bere slabší z alternativ „A / B“ – stačí splnit jednu).
  function rozeberPozadavky(radky) {
    const out = { gpu: null, cpu: null, ram: null, gpuText: "", cpuText: "" };
    for (const r of radky || []) {
      const [klic, ...zbytek] = String(r).split(":");
      const k = klic.toLowerCase(), hod = zbytek.join(":");
      if (!hod) continue;
      if (/grafi|graphics|video|gpu/.test(k)) { const g = najdiGpu(hod); if (g.length) out.gpu = Math.min(...g.map((x) => x.vykon)); out.gpuText = hod.trim(); }
      else if (/procesor|processor|cpu/.test(k)) { const c = najdiCpu(hod); if (c.length) out.cpu = Math.min(...c.map((x) => x.vykon)); out.cpuText = hod.trim(); }
      else if (/pamě|memory|ram/.test(k) && !/úložiště|storage|místo/.test(k)) out.ram = najdiRam(hod);
    }
    return out;
  }

  // Porovnání jedné části: „dop“ = splňuje doporučené, „min“ = splňuje minimální, „ne“ = nestačí, null = nevíme.
  function porovnej(moje, min, dop, tolerance = 0.92) {
    if (moje == null || (min == null && dop == null)) return null;
    if (dop != null && moje >= dop * tolerance) return "dop";
    if (min != null && moje >= min * tolerance) return "min";
    if (min == null && dop != null && moje >= dop * 0.6) return "min";
    return "ne";
  }

  window.HP_HW = { GPU: GPU.map(([n, v]) => ({ nazev: n, vykon: v })), najdiGpu, najdiCpu, najdiRam, rozeberPozadavky, porovnej };
})();
