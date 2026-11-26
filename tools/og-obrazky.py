#!/usr/bin/env python3
"""Vyrobí obrázky pro sdílení (og:image, 1200×630) do public/og/.
Spuštění: pip install pillow fonttools brotli && python3 tools/og-obrazky.py
Font Rubik se převede z public/fonts (woff2 → ttf) do dočasné složky."""
import math, os, tempfile
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.merge import Merger
from PIL import Image, ImageDraw, ImageFilter, ImageFont

KOREN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp()

def font(vaha):
    cesty = []
    for sada in ("latin", "latin-ext"):
        f = TTFont(f"{KOREN}/public/fonts/rubik-{sada}-wght-normal.woff2"); f.flavor = None
        instancer.instantiateVariableFont(f, {"wght": vaha}, inplace=True)
        c = f"{TMP}/{sada}-{vaha}.ttf"; f.save(c); cesty.append(c)
    vystup = f"{TMP}/rubik-{vaha}.ttf"
    Merger().merge(cesty).save(vystup)
    return vystup

TUCNY, NORMAL = font(800), font(500)
BG, KARTA, MANGO, FIALOVA, TEXT, SEDA = "#16132e", "#211d42", "#ffc04d", "#9b5cff", "#f4f1ff", "#b9b2dc"
W, H = 1200, 630

def sit(d, cx, cy, r, sila):
    """Šestiúhelníková neuronová síť z loga."""
    body = [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in range(-90, 270, 60)]
    barva = (155, 92, 255, int(110 * sila))
    for i, p in enumerate(body):
        d.line([p, body[(i + 1) % 6]], fill=barva, width=max(2, int(r / 40)))
        d.line([p, (cx, cy)], fill=barva, width=max(2, int(r / 45)))
    for p in body:
        rr = r / 9
        d.ellipse([p[0] - rr, p[1] - rr, p[0] + rr, p[1] + rr], fill=(155, 92, 255, int(255 * sila)))
    rr = r / 4.5
    d.ellipse([cx - rr * 1.6, cy - rr * 1.6, cx + rr * 1.6, cy + rr * 1.6], fill=(255, 192, 77, int(60 * sila)))
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(255, 192, 77, int(255 * sila)))

def zalom(text, f, max_sirka, d):
    radky, radek = [], ""
    slova = text.split()
    # Česká typografie: jednopísmenné předložky (v, k, s, z, o, u, a, i) nenecháváme na konci řádku.
    spojena = []
    for sl in slova:
        if spojena and len(spojena[-1]) == 1: spojena[-1] += " " + sl
        else: spojena.append(sl)
    for slovo in spojena:
        zkus = (radek + " " + slovo).strip()
        if d.textlength(zkus, font=f) <= max_sirka: radek = zkus
        else: radky.append(radek); radek = slovo
    return radky + [radek]

def obrazek(soubor, stitek, nadpis, podnadpis):
    img = Image.new("RGBA", (W, H), BG)
    # jemná záře vpravo
    zar = Image.new("RGBA", (W, H), (0, 0, 0, 0)); dz = ImageDraw.Draw(zar)
    dz.ellipse([700, -100, 1400, 600], fill=(155, 92, 255, 70)); dz.ellipse([850, 300, 1300, 750], fill=(255, 192, 77, 35))
    img = Image.alpha_composite(img, zar.filter(ImageFilter.GaussianBlur(120)))
    vrstva = Image.new("RGBA", (W, H), (0, 0, 0, 0)); sit(ImageDraw.Draw(vrstva), 960, 330, 190, 0.55)
    img = Image.alpha_composite(img, vrstva)
    d = ImageDraw.Draw(img)
    # značka
    logo = Image.new("RGBA", (W, H), (0, 0, 0, 0)); sit(ImageDraw.Draw(logo), 92, 92, 30, 1)
    img = Image.alpha_composite(img, logo); d = ImageDraw.Draw(img)
    d.text((140, 70), "Herní puls", font=ImageFont.truetype(TUCNY, 40), fill=TEXT)
    fs = ImageFont.truetype(TUCNY, 24)
    sx = 140 + d.textlength("Herní puls", font=ImageFont.truetype(TUCNY, 40)) + 20
    d.rounded_rectangle([sx, 74, sx + d.textlength("AI web", font=fs) + 28, 112], radius=19, outline=FIALOVA, width=2, fill=(155, 92, 255, 50))
    d.text((sx + 14, 78), "AI web", font=fs, fill=TEXT)
    # štítek
    fst = ImageFont.truetype(TUCNY, 28)
    sw = d.textlength(stitek, font=fst)
    d.rounded_rectangle([72, 200, 72 + sw + 36, 248], radius=24, fill=MANGO)
    d.text((90, 207), stitek, font=fst, fill="#2a1d00")
    # nadpis
    fn = ImageFont.truetype(TUCNY, 76)
    radky = zalom(nadpis, fn, 780, d)
    if len(radky) > 2:
        fn = ImageFont.truetype(TUCNY, 62); radky = zalom(nadpis, fn, 800, d)
    y = 272
    for r in radky[:3]:
        d.text((72, y), r, font=fn, fill=TEXT); y += int(fn.size * 1.13)
    fp = ImageFont.truetype(NORMAL, 32)
    for r in zalom(podnadpis, fp, 760, d)[:2]:
        d.text((72, y + 12), r, font=fp, fill=SEDA); y += 42
    d.rectangle([0, H - 10, W, H], fill=MANGO)
    img.convert("RGB").save(f"{KOREN}/public/og/{soubor}.png", optimize=True)

OBRAZKY = [
    ("domu", "Hry · ceny · streamy", "Všechno o hrách na jednom místě", "Hry zdarma, slevy, čeština, zprávy a čeští streameři – AI to hlídá za tebe."),
    ("novinky", "Novinky", "Herní zprávy z Česka i ze světa", "Nejčerstvější novinky z desítek herních webů na jednom místě."),
    ("streameri", "Živě", "Čeští streameři na Twitchi a Kicku", "Kdo je právě živě, žebříčky, rekordy a milníky – přesně z oficiálních API."),
    ("cesko", "Co hraje Česko", "Nejsledovanější hry českých streamů", "Hodiny sledování za 7 dní, co roste a co je nového."),
    ("report", "Report týdne", "Týden na české herní scéně v číslech", "Hodiny sledování, top hry, rekordy a streameři, kteří nejvíc rostli."),
    ("cestina", "Má to češtinu?", "Hry s češtinou ve slevě i zdarma", "Titulky, dabing a ceny v Kč na jednom místě."),
    ("hlidac", "Hlídač cen", "Upozorníme tě, až bude hra ve slevě", "Bez registrace a bez e-mailu – jen povolíš upozornění."),
    ("hra", "Hra", "Cena, čeština, hodnocení a streamy", "Všechno o hře z obchodů Steam, GOG a Epic a z českých streamů."),
]
for o in OBRAZKY:
    obrazek(*o)
print("hotovo:", ", ".join(o[0] for o in OBRAZKY))

# Ikony aplikace (PWA): 192, 512, maskovatelná 512 (s okrajem) a apple-touch-icon 180.
def ikona(soubor, velikost, okraj):
    img = Image.new("RGBA", (velikost, velikost), BG)
    v = Image.new("RGBA", (velikost, velikost), (0, 0, 0, 0))
    sit(ImageDraw.Draw(v), velikost / 2, velikost / 2, velikost * (0.36 - okraj), 1)
    img = Image.alpha_composite(img, v)
    img.convert("RGB").save(f"{KOREN}/public/{soubor}", optimize=True)
ikona("ikona-192.png", 192, 0)
ikona("ikona-512.png", 512, 0)
ikona("ikona-maskable-512.png", 512, 0.1)
ikona("apple-touch-icon.png", 180, 0.02)
print("ikony hotové")
