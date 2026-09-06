import os
from playwright.sync_api import sync_playwright
OUT=r"C:/Work/scratch/ephemeral/visores_2026-09/paletas_verifica/web_workers/shots"
BASE="http://127.0.0.1:8791/06_dev/visores/web_workers/visor.html"
with sync_playwright() as pw:
    b=pw.chromium.launch(); ctx=b.new_context(viewport={"width":1440,"height":900}); pg=ctx.new_page()
    for cat,ind in [("labour","hours_total"),("productivity","h_per_functional_unit"),("conditions","monthly_wage")]:
        pg.goto(f"{BASE}?view=map&cat={cat}&ind={ind}&year=2020",wait_until="load",timeout=90000)
        pg.wait_for_timeout(4200)
        el=pg.query_selector("#map-legend")
        if el: el.screenshot(path=f"{OUT}/fixed_{ind}_legend.png")
    b.close()
print("ok")
