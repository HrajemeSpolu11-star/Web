# Naplní lokální D1 daty o objemu ~1 roku provozu (náhodná, ale realistická rozložení).
import sqlite3, glob, random, datetime, time, sys, os
random.seed(42)
os.chdir(glob.glob('/tmp/zatez/web/.wrangler/state/v3/d1/*/')[0])
c = sqlite3.connect([x for x in glob.glob('*.sqlite') if not x.startswith('metadata')][0])
DNI = 365; dnes = datetime.date(2026, 11, 27)
dny = [(dnes - datetime.timedelta(days=i)).isoformat() for i in range(DNI)]
ted = int(time.time() * 1000)
HRY = [f"Hra {i}" for i in range(600)] + ["Counter-Strike 2", "Minecraft", "Rust", "Fortnite", "League of Legends", "World of Warcraft", "Just Chatting"]
# streameři: 5000 (Twitch 3500, Kick 1500), velikost podle Paretova rozložení
st = []
for i in range(5000):
    pl = "twitch" if i < 3500 else "kick"
    vel = int(min(30000, random.paretovariate(1.1) * 3))
    st.append((f"u{i}", f"stream{i}", f"Stream {i}", pl, vel))
c.executemany("INSERT OR REPLACE INTO streameri (id, login, jmeno, platforma, max_divaku, skryty, zive_cas, zive_divaci, zive_hra, sledujici) VALUES (?,?,?,?,?,0,?,?,?,?)",
  [(u, l, j, p, v, ted - 60000 if random.random() < .06 else None, v, random.choice(HRY), v * 20) for (u, l, j, p, v) in st])
# snímky: každý den vysílá ~30 % kanálů
rows = []
for d in dny:
    for (u, l, j, p, v) in st:
        if random.random() < 0.3:
            rows.append((u, d, v * 20, max(1, int(v * random.uniform(.4, 1.3))), random.randint(30, 480)))
c.executemany("INSERT OR REPLACE INTO snimky (user_id, den, sledujici, max_divaku, minut) VALUES (?,?,?,?,?)", rows)
print("snimky", len(rows))
# hry_den: každý den ~250 her na obou platformách
rows = []
for d in dny:
    for h in random.sample(HRY, 250):
        for p in ("twitch", "kick"):
            if random.random() < .7:
                rows.append((d, h, p, random.randint(10, 200000), random.randint(10, 5000), random.randint(1, 5000), random.randint(1, 40)))
c.executemany("INSERT OR REPLACE INTO hry_den (den, hra, platforma, divako_minut, minut, max_divaku, max_streamu) VALUES (?,?,?,?,?,?,?)", rows)
print("hry_den", len(rows))
c.executemany("INSERT OR REPLACE INTO hry (slug, nazev, posledni, twitch_id) VALUES (?,?,?,?)", [(h.lower().replace(" ", "-"), h, ted, str(1000 + i)) for i, h in enumerate(HRY)])
# scéna: každých 15 min, 2 platformy
rows = []
t0 = ted - DNI * 86400000
for k in range(DNI * 96):
    for p in ("twitch", "kick"):
        rows.append((t0 + k * 900000, p, random.randint(100, 400), random.randint(5000, 25000)))
c.executemany("INSERT OR REPLACE INTO scena (cas, platforma, streamu, divaci) VALUES (?,?,?,?)", rows)
print("scena", len(rows))
# steam hry 2000 + historie cen 365 dní
c.executemany("INSERT OR REPLACE INTO steam_hry (id, nazev, norm, cestina, cena, puvodni, sleva, mena, zanry, doporuceni) VALUES (?,?,?,?,?,?,?,?,?,?)",
  [(str(10 + i), HRY[i % len(HRY)] if i < len(HRY) else f"Steam {i}", (HRY[i % len(HRY)] if i < len(HRY) else f"Steam {i}").lower(), random.randint(0, 2), 499.0, 499.0,
    random.choice([0, 0, 0, 50]), "CZK", ",".join(str(x) for x in random.sample([1, 2, 3, 4, 9, 18, 23, 25, 28, 29], 2)), random.randint(0, 100000)) for i in range(2000)])
rows = []
for i in range(2000):
    for d in dny:
        s = 50 if random.random() < .15 else 0
        rows.append((str(10 + i), d, 499 * (1 - s / 100), s))
c.executemany("INSERT OR REPLACE INTO ceny_historie (id, den, cena, sleva) VALUES (?,?,?,?)", rows)
print("ceny_historie", len(rows))
c.executemany("INSERT OR REPLACE INTO patche (gid, appid, hra, nadpis, url, datum, stav) VALUES (?,?,?,?,?,?,'hotovo')",
  [(f"g{i}", str(10 + random.randint(0, 1999)), "Hra", f"Patch {i}", "https://x", ted - random.randint(0, 120 * 86400000)) for i in range(20000)])
c.executemany("INSERT OR REPLACE INTO clanky (id, url, nadpis, perex, zdroj_id, datum, ziskano) VALUES (?,?,?,?,?,?,?)",
  [(f"c{i}", f"https://x/{i}", f"Novinka o {random.choice(HRY)} číslo {i}", "Perex", "z", ted - random.randint(0, 90 * 86400000), ted) for i in range(30000)])
c.executemany("INSERT OR REPLACE INTO hry_streamera (user_id, hra, minut, posledni) VALUES (?,?,?,?)",
  [(f"u{random.randint(0, 4999)}", random.choice(HRY), random.randint(10, 50000), ted) for i in range(60000)])
c.commit()
for t in ["snimky", "hry_den", "scena", "ceny_historie", "patche", "clanky", "streameri", "steam_hry"]:
    print(t, c.execute(f"select count(*) from {t}").fetchone()[0])
print("velikost MB", os.path.getsize([x for x in glob.glob('*.sqlite') if not x.startswith('metadata')][0]) / 1e6)
