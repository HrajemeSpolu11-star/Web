# Kontrola překladů: najde texty rozhraní, které po přepnutí na EN/SK zůstaly česky.
# Použití: python3 tools/testovaci-server.py &  →  python3 tools/kontrola-prekladu.py en   (nebo sk)
# Obsah (nadpisy zpráv, názvy her a klipů) se záměrně nepřekládá – ten ve výpisu ignoruj.
import json,sys
from playwright.sync_api import sync_playwright
STRANKY=['/','/novinky','/pruvodce','/co-hrat','/rozjede-se','/rozjede-se?hra=1091500','/vyssi-nizsi','/aktualizace','/ceska-scena','/ranni','/obchody','/vydani','/akce','/studia','/cestina','/hlidac','/zive','/streameri','/hry','/report','/prehled','/stav','/hra/steam/1091500','/hra/minecraft','/streamer/twitch/alfa','/porovnat','/neexistuje','/clanek/'+'a'*24]
JS=r"""() => {
 const ven = '.archiv-t b, .patch h3, .ranni-body, .obal b, .tep-t, .patch-shrnuti, .patch-skupina li, .patch-komu, .live-info .sub, .story b, .story span, h3, .rec b, .hk-t > b, .hrad-t b, .uvod-veta b, .vyd-t b, .ch-t b, .vn-hra b, .cz-studio span, .cz-studio b, [data-nepreklad], .titulek, .popis, article .text, .rep-vety, .ekg, svg, script, style, code, .pa-zprava, .hw-vysledek small, .brzy-h b, .zpr-studio b, .card p, .perex, .patch-hra, .welcome-bot';
 const re=(localStorage.getItem('hp_jazyk')==='sk')?/[ěřůĚŘŮ]|\b(se|jen|nebo|pro|zpráv|her|také|když|který|která|které|jsou|není|tady|zkontrol\w*|hodin|diváků|sledujících|streamů|dnes ve|během|právě|teď|nyní|vše|všechny|všechno|zatím|jestli|až|můžeš|chceš|hledat|načíst|odkaz|kdo|co)\b/:/[ěščřžůťďňĚŠČŘŽŮŤĎŇ]|\b(a|je|na|za|se|pro|jen|nebo|hra|hry|her|zpráv|dní|hodin)\b/;
 const out=new Set(); const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(w.nextNode()){const n=w.currentNode,t=n.textContent.replace(/\s+/g,' ').trim(); if(!t||!n.parentElement) continue;
   if(n.parentElement.closest(ven)) continue; const st=getComputedStyle(n.parentElement); if(st.display==='none'||st.visibility==='hidden') continue;
   if(re.test(t)) out.add(t.slice(0,160));}
 document.querySelectorAll('[placeholder],[aria-label],[title]').forEach(e=>{for(const a of ['placeholder','aria-label','title']){const v=e.getAttribute(a); if(v&&re.test(v)) out.add('@'+a+': '+v.slice(0,120));}});
 return [...out];}"""
jaz=sys.argv[1] if len(sys.argv)>1 else 'en'
with sync_playwright() as p:
    b=p.chromium.launch(); vse={}
    pg=b.new_page(viewport={'width':1280,'height':900})
    pg.add_init_script(f"localStorage.setItem('hp_uvitani','1');localStorage.setItem('hp_jazyk','{jaz}');localStorage.setItem('hp_pc',JSON.stringify({{gpu:'GeForce RTX 3060',cpu:'Ryzen 5 5600',ram:16}}))")
    for s in STRANKY:
        pg.goto('http://localhost:8775'+s); pg.wait_for_timeout(1300)
        for t in pg.evaluate(JS): vse.setdefault(t,[]).append(s)
    b.close()
for t,s in sorted(vse.items(), key=lambda x:x[1][0]): print(f"{s[0]:<22} {t}")
print(len(vse), file=sys.stderr)
