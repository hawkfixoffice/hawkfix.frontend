#!/usr/bin/env python3
"""Полный SEO-аудит сборки: мета, hreflang, JSON-LD, alt, служебные файлы."""
import json, pathlib, re, html, sys
from html.parser import HTMLParser

DIST = pathlib.Path(__file__).resolve().parent.parent / "dist"
import os
# Адрес берём из той же переменной, что и сборка (см. src/lib/types.ts).
SITE = (os.environ.get("VITE_SITE") or "https://hawkfix.pl").rstrip("/")
IS_STAGING = SITE != "https://hawkfix.pl"
problems, notes = [], []

class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.metas, self.links, self.imgs, self.ld = [], [], [], []
        self.title, self.htmlattrs = "", {}
        self.h = {f"h{i}": [] for i in range(1, 7)}
        self._t = self._l = False; self._cap = None; self._buf = []
    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "html" and not self.htmlattrs: self.htmlattrs = a
        elif tag == "meta": self.metas.append(a)
        elif tag == "link": self.links.append(a)
        elif tag == "img": self.imgs.append(a)
        elif tag == "title": self._t = True
        elif tag == "script" and a.get("type", "").lower() == "application/ld+json": self._l = True
        elif tag in self.h and self._cap is None: self._cap = tag; self._buf = []
    def handle_endtag(self, tag):
        if tag == "title": self._t = False
        elif tag == "script": self._l = False
        elif tag == self._cap:
            self.h[tag].append(re.sub(r"\s+", " ", "".join(self._buf)).strip()); self._cap = None
    def handle_data(self, d):
        if self._t: self.title += d
        elif self._l: self.ld.append(d)
        elif self._cap: self._buf.append(d)
    def meta(self, k, v):
        for m in self.metas:
            if m.get(k, "").lower() == v.lower(): return m.get("content", "").strip()
        return ""
    def link(self, rel):
        for l in self.links:
            if l.get("rel", "").lower() == rel: return l.get("href", "").strip()
        return ""

pages = sorted(p for p in DIST.rglob("index.html") if "404" not in p.parts)
stats = {"kw": 0, "img": 0, "img_no_alt": 0, "img_empty": 0, "schema": set()}

for f in pages:
    rel = "/" + (f.parent.relative_to(DIST).as_posix() + "/").replace("./", "")
    d = P(); d.feed(f.read_text(encoding="utf-8", errors="replace"))
    where = rel

    title, desc = re.sub(r"\s+", " ", d.title).strip(), d.meta("name", "description")
    if not (10 <= len(title) <= 60): problems.append(f"{where}: title {len(title)} знаков")
    if not (70 <= len(desc) <= 160): problems.append(f"{where}: description {len(desc)} знаков")
    if d.link("canonical") != SITE + rel: problems.append(f"{where}: canonical ≠ URL")
    if len(d.h["h1"]) != 1: problems.append(f"{where}: h1 = {len(d.h['h1'])}")
    if not d.htmlattrs.get("lang"): problems.append(f"{where}: нет lang у <html>")
    alts = [l for l in d.links if l.get("rel", "").lower() == "alternate" and l.get("hreflang")]
    if len(alts) != 5: problems.append(f"{where}: hreflang = {len(alts)}")
    if "x-default" not in [a.get("hreflang") for a in alts]: problems.append(f"{where}: нет x-default")
    if not d.meta("property", "og:image"): problems.append(f"{where}: нет og:image")
    # На витрине для проверки robots ровно противоположный: её задача — не
    # попасть в индекс, поэтому там ждём noindex, а не директивы превью.
    robots = d.meta("name", "robots")
    if IS_STAGING:
        if "noindex" not in robots: problems.append(f"{where}: витрина без noindex")
    elif "max-image-preview:large" not in robots:
        problems.append(f"{where}: robots без max-image-preview")
    if d.meta("name", "keywords"): stats["kw"] += 1

    for img in d.imgs:
        stats["img"] += 1
        if "alt" not in img: stats["img_no_alt"] += 1; problems.append(f"{where}: <img> без атрибута alt — {img.get('src','')[:50]}")
        elif not img["alt"].strip(): stats["img_empty"] += 1

    if not d.ld: problems.append(f"{where}: нет JSON-LD")
    else:
        try: g = json.loads("".join(d.ld))["@graph"]
        except Exception as e: problems.append(f"{where}: JSON-LD не парсится ({e})"); continue
        for n in g:
            t = n.get("@type"); stats["schema"].add(t if isinstance(t, str) else "+".join(t))
        types = {n.get("@type") if isinstance(n.get("@type"), str) else "+".join(n.get("@type")) for n in g}
        if not any("LocalBusiness" in t for t in types): problems.append(f"{where}: нет LocalBusiness")
        if not any(t.endswith("Page") for t in types): problems.append(f"{where}: нет узла *Page")

# ---- служебные файлы ----
HOST = SITE.split("//", 1)[1]
# На витрине robots закрыт целиком и строки Sitemap в нём нет — это норма,
# а CNAME совпадает с адресом сборки, а не с боевым доменом.
for name, must in [("robots.txt", ["User-agent"] if IS_STAGING else ["Sitemap:", "User-agent"]),
                   ("sitemap.xml", ["<loc>", "hreflang", "image:image"]),
                   ("llms.txt", ["# HAWK.FIX", "## Usługi"]), ("manifest.webmanifest", ["short_name", "theme_color"]),
                   ("humans.txt", ["TEAM"]), (".well-known/security.txt", ["Contact:", "Expires:"]),
                   ("404.html", ["noindex"]), ("CNAME", [HOST])]:
    p = DIST / name
    if not p.exists(): problems.append(f"нет файла {name}"); continue
    txt = p.read_text(encoding="utf-8", errors="replace")
    for m in must:
        if m not in txt: problems.append(f"{name}: нет «{m}»")

sm = (DIST / "sitemap.xml").read_text(encoding="utf-8")
locs = re.findall(r"<loc>(.*?)</loc>", sm)
if len(locs) != len(pages): problems.append(f"sitemap: {len(locs)} URL против {len(pages)} страниц")
for u in locs:
    if not (DIST / u.replace(SITE + "/", "") / "index.html").exists() and u != SITE + "/":
        problems.append(f"sitemap: {u} — нет такой страницы")

print(f"страниц проверено: {len(pages)}")
print(f"с мета-ключами:    {stats['kw']}")
print(f"картинок:          {stats['img']}  (без атрибута alt: {stats['img_no_alt']}, декоративных с alt=\"\": {stats['img_empty']})")
print(f"типы schema.org:   {', '.join(sorted(stats['schema']))}")
print(f"sitemap:           {len(locs)} URL, {sm.count('<image:image>')} с картинкой")
print()
if problems:
    print(f"ПРОБЛЕМ: {len(problems)}")
    for x in problems[:30]: print("  ✗", x)
    sys.exit(1)
print("замечаний нет")
