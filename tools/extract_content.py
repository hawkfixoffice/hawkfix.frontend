#!/usr/bin/env python3
"""Разбирает зеркало старого hawkfix.pl в структурированный контент.

Вход:  ../old-site/hawkfix.pl  (зеркало, снято 2026-09-07)
Выход: ../content/*.json       (нормализованный контент по 4 языкам)

Ничего не выдумывает: всё, что попадает в JSON, реально есть на старом сайте.
"""
import json, re, pathlib, html
from html.parser import HTMLParser
from collections import OrderedDict

HERE = pathlib.Path(__file__).resolve().parent
MIRROR = HERE.parent.parent / "old-site" / "hawkfix.pl"
OUT = HERE.parent / "content"
OUT.mkdir(parents=True, exist_ok=True)

LOCALES = ["pl", "uk", "ru", "en"]
PREFIX = {"pl": "", "uk": "uk/", "ru": "ru/", "en": "en/"}

SKIP_TAGS = {"script", "style", "noscript", "template", "svg", "path"}
INLINE = {"b","strong","i","em","span","a","br","small","sup","sub","code","u","mark"}


class Doc(HTMLParser):
    """Собирает голову (мета) и тело в виде дерева простых блоков."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.metas, self.links = [], []
        self.title, self.html_attrs = "", {}
        self.ld = []
        self.blocks = []            # плоский список: {"t": tag, "text": ..., "items": [...], "attrs": {...}}
        self._stack = []
        self._skip = 0
        self._in_title = self._in_ld = False
        self._buf = None            # накопитель текста текущего блока
        self._buf_tag = None
        self._list = None           # накопитель <ul>/<ol>
        self._main = 0              # внутри <main>?

    # --- служебное ---
    def _flush(self):
        if self._buf is not None:
            txt = re.sub(r"\s+", " ", "".join(self._buf)).strip()
            if txt:
                if self._list is not None:
                    self._list.append(txt)
                else:
                    self.blocks.append({"t": self._buf_tag, "text": txt})
            self._buf, self._buf_tag = None, None

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "html" and not self.html_attrs:
            self.html_attrs = a
        elif tag == "meta":
            self.metas.append(a)
        elif tag == "link":
            self.links.append(a)
        elif tag == "title":
            self._in_title = True
        elif tag == "script":
            if a.get("type", "").lower() == "application/ld+json":
                self._in_ld = True
            self._skip += 1
        elif tag in SKIP_TAGS:
            self._skip += 1

        if self._skip or not (self._main or tag == "main"):
            if tag == "main":
                self._main += 1
            return

        if tag == "main":
            self._main += 1
            return
        if tag in INLINE:
            return

        self._flush()
        if tag in ("ul", "ol"):
            self._list = []
            self._list_tag = tag
        elif tag == "li":
            self._buf, self._buf_tag = [], "li"
        elif re.fullmatch(r"h[1-6]", tag) or tag == "p":
            self._buf, self._buf_tag = [], tag
        elif tag == "img":
            self.blocks.append({"t": "img", "src": a.get("src", ""), "alt": a.get("alt", ""),
                                "w": a.get("width", ""), "h": a.get("height", "")})
        elif tag == "source":
            self.blocks.append({"t": "source", "srcset": a.get("srcset", "")})
        elif tag in ("section", "article", "div", "aside", "nav"):
            cls = a.get("class", "")
            if cls:
                self.blocks.append({"t": "open", "tag": tag, "class": cls, "id": a.get("id", "")})

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False; return
        if tag == "script":
            self._in_ld = False; self._skip = max(0, self._skip - 1); return
        if tag in SKIP_TAGS:
            self._skip = max(0, self._skip - 1); return
        if tag == "main":
            self._flush(); self._main = max(0, self._main - 1); return
        if self._skip or not self._main or tag in INLINE:
            return
        if tag in ("ul", "ol"):
            self._flush()
            if self._list:
                self.blocks.append({"t": "list", "items": self._list})
            self._list = None
        elif tag == "li" or re.fullmatch(r"h[1-6]", tag) or tag == "p":
            self._flush()
        elif tag in ("section", "article", "div", "aside", "nav"):
            self._flush()
            self.blocks.append({"t": "close", "tag": tag})

    def handle_data(self, d):
        if self._in_title: self.title += d; return
        if self._in_ld:    self.ld.append(d); return
        if self._skip:     return
        if self._buf is not None: self._buf.append(d)

    # --- доступ ---
    def meta(self, key, val):
        for m in self.metas:
            if m.get(key, "").lower() == val.lower():
                return m.get("content", "").strip()
        return ""

    def link(self, rel):
        for l in self.links:
            if l.get("rel", "").lower() == rel:
                return l.get("href", "").strip()
        return ""

    def alternates(self):
        return {l.get("hreflang"): l.get("href")
                for l in self.links
                if l.get("rel", "").lower() == "alternate" and l.get("hreflang")}


def load(path: pathlib.Path) -> Doc:
    d = Doc(); d.feed(path.read_text(encoding="utf-8", errors="replace")); d._flush()
    return d


def page_meta(d: Doc, path: str) -> dict:
    return OrderedDict(
        path=path,
        title=re.sub(r"\s+", " ", d.title).strip(),
        description=d.meta("name", "description"),
        canonical=d.link("canonical"),
        ogImage=d.meta("property", "og:image").split("?")[0],
        ogLocale=d.meta("property", "og:locale"),
    )


def headings_and_text(d: Doc):
    """Плоский поток контента: заголовки, абзацы, списки — без вёрсточного мусора."""
    out = []
    for b in d.blocks:
        if b["t"] in ("open", "close", "source"):
            continue
        if b["t"] == "img":
            out.append({"type": "image", "src": b["src"], "alt": b["alt"]})
        elif b["t"] == "list":
            out.append({"type": "list", "items": b["items"]})
        elif b["t"] == "p":
            out.append({"type": "p", "text": b["text"]})
        elif re.fullmatch(r"h[1-6]", b["t"]):
            out.append({"type": b["t"], "text": b["text"]})
    return out


# ---------------------------------------------------------------- сбор
sitemap = (MIRROR / "sitemap.xml").read_text(encoding="utf-8")
urls = re.findall(r"<loc>(.*?)</loc>", sitemap)
paths = [u.replace("https://hawkfix.pl", "") for u in urls]

# 1) конфиг калькулятора — по одному на язык
calc = {}
for loc in LOCALES:
    f = MIRROR / (PREFIX[loc] + "index.html")
    s = f.read_text(encoding="utf-8")
    calc[loc] = json.loads(re.search(
        r'<script id="majstro-config" type="application/json">(.*?)</script>', s, re.S).group(1))

# прайс: цены общие, названия по языкам
items = OrderedDict()
for loc in LOCALES:
    for it in calc[loc]["items"]:
        row = items.setdefault(it["id"], OrderedDict(
            key=it["id"], group=it.get("g", ""), dept=it.get("d", ""),
            price=it.get("p"), hours=it.get("h"), unit=it.get("u", ""),
            min=it.get("mn"), max=it.get("mx"), name={}))
        for extra in ("a", "au", "s", "su", "wet", "dry"):
            if extra in it:
                row[extra] = it[extra]
        row["name"][loc] = it["n"]

chains = OrderedDict()
for loc in LOCALES:
    for c in calc[loc]["chains"]:
        row = chains.setdefault(c["id"], OrderedDict(
            key=c["id"], trigger=c["trigger"], visits=c.get("visits"),
            minPrice=c.get("minPrice"), steps=c["steps"], name={}, unless={}))
        row["name"][loc] = c.get("name", "")
        row["unless"][loc] = c.get("unless", "")

settings = OrderedDict(
    minVisit=calc["pl"]["minVisit"], minVisitBy=calc["pl"]["minVisitBy"],
    urgentPct=calc["pl"]["urgentPct"], urgentMax=calc["pl"]["urgentMax"],
    workDays=calc["pl"]["workDays"], currency=calc["pl"]["currency"],
    units={loc: calc[loc]["units"] for loc in LOCALES},
    strings={loc: calc[loc]["e"] for loc in LOCALES},
    theme={loc: calc[loc]["t"] for loc in LOCALES},
)

# 2) страницы: кластеризуем по pl-версии
clusters = OrderedDict()
docs = {}
for p in paths:
    f = MIRROR / (p.lstrip("/") + "index.html")
    d = load(f); docs[p] = d
    alt = d.alternates()
    key = alt.get("pl-PL", "").replace("https://hawkfix.pl", "")
    loc = d.html_attrs.get("lang", "").split("-")[0]
    clusters.setdefault(key, {})[loc] = p

def kind(pl_path):
    if pl_path == "/": return "home"
    if pl_path == "/uslugi/": return "services"
    if pl_path == "/cennik/": return "prices"
    if pl_path == "/o-nas/": return "about"
    if pl_path == "/kontakt/": return "contact"
    if pl_path.startswith("/uslugi/"): return "service"
    return "legal"

pages, services = [], []
for pl_path, byloc in clusters.items():
    t = kind(pl_path)
    rec = OrderedDict(key=pl_path.strip("/").replace("/", "-") or "home", type=t,
                      paths={l: byloc.get(l, "") for l in LOCALES}, tr=OrderedDict())
    for loc in LOCALES:
        p = byloc.get(loc)
        if not p: continue
        d = docs[p]
        flow = headings_and_text(d)
        h1 = next((b["text"] for b in flow if b["type"] == "h1"), "")
        tr = OrderedDict(page_meta(d, p))
        tr["h1"] = h1
        tr["blocks"] = [b for b in flow if b["type"] != "h1"]
        rec["tr"][loc] = tr
    (services if t == "service" else pages).append(rec)

# у услуг вытаскиваем картинку, вводный абзац, чек-лист и якорь группы
for s in services:
    pl_html = (MIRROR / (s["paths"]["pl"].lstrip("/") + "index.html")).read_text(encoding="utf-8")
    m = re.search(r'srcset="/assets/img/services/([^."]+)\.webp"', pl_html)
    s["image"] = m.group(1) if m else ""
    a = re.search(r'href="/#(g-[a-z-]+)"', pl_html)
    s["group"] = a.group(1) if a else ""
    for loc, tr in s["tr"].items():
        blocks = tr["blocks"]
        tr["blurb"] = next((b["text"] for b in blocks if b["type"] == "p"), "")
        tr["checklist"] = next((b["items"] for b in blocks if b["type"] == "list"), [])

# 3) группы прайса — названия берём из хаба услуг (там они как заголовки карточек)
groups = OrderedDict()
for it in items.values():
    groups.setdefault(it["group"], OrderedDict(key=it["group"], name={}))
for s in services:
    if s["group"] and s["group"] in groups:
        for loc, tr in s["tr"].items():
            groups[s["group"]]["name"].setdefault(loc, tr["h1"])

def dump(name, data):
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  {name:<18} {len(data) if isinstance(data,(list,dict)) else ''}")

print("извлечено:")
dump("settings.json", settings)
dump("items.json", list(items.values()))
dump("chains.json", list(chains.values()))
dump("groups.json", list(groups.values()))
dump("services.json", services)
dump("pages.json", pages)
print(f"\nуслуг: {len(services)}  прочих страниц: {len(pages)}  всего кластеров: {len(clusters)}")
print("типы страниц:", {p['type']: sum(1 for x in pages if x['type']==p['type']) for p in pages})
