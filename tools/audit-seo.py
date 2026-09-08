import re, html, json, csv, pathlib
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent / "dist"
OUT  = pathlib.Path(__file__).resolve().parent.parent / "_audit"
(OUT/"text").mkdir(parents=True, exist_ok=True)

SKIP = {"script","style","noscript","template","svg"}
BLOCK = {"p","div","li","tr","section","article","header","footer","nav","br",
         "h1","h2","h3","h4","h5","h6","td","th","dt","dd","option","button","label"}

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.html_attrs = {}; self.title = ""; self.metas = []; self.links = []
        self.ld = []; self.heads = {f"h{i}": [] for i in range(1,7)}
        self.text = []; self._skip = 0; self._cap = None; self._buf = []
        self._in_title = False; self._in_ld = False

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "html" and not self.html_attrs: self.html_attrs = a
        elif tag == "meta": self.metas.append(a)
        elif tag == "link": self.links.append(a)
        elif tag == "title": self._in_title = True
        elif tag == "script":
            if a.get("type","").lower() == "application/ld+json": self._in_ld = True
            self._skip += 1
        elif tag in SKIP: self._skip += 1
        elif tag in self.heads and self._cap is None: self._cap = tag; self._buf = []
        if tag in BLOCK: self.text.append("\n")

    def handle_endtag(self, tag):
        if tag == "title": self._in_title = False
        elif tag == "script":
            self._in_ld = False; self._skip = max(0, self._skip-1)
        elif tag in SKIP: self._skip = max(0, self._skip-1)
        elif tag == self._cap:
            self.heads[tag].append(re.sub(r"\s+"," ","".join(self._buf)).strip())
            self._cap = None; self._buf = []
        if tag in BLOCK: self.text.append("\n")

    def handle_data(self, d):
        if self._in_title: self.title += d; return
        if self._in_ld: self.ld.append(d); return
        if self._skip: return
        if self._cap: self._buf.append(d)
        self.text.append(d)

def meta_of(p, key, val):
    for m in p.metas:
        if m.get(key,"").lower() == val.lower(): return m.get("content","").strip()
    return ""

def link_href(p, rel):
    for l in p.links:
        if l.get("rel","").lower() == rel: return l.get("href","").strip()
    return ""

def schema_types(p):
    types = []
    for blob in p.ld:
        try: d = json.loads(blob)
        except Exception: continue
        stack = [d]
        while stack:
            x = stack.pop()
            if isinstance(x, dict):
                t = x.get("@type")
                if isinstance(t, list): types.extend(t)
                elif t: types.append(t)
                stack.extend(x.values())
            elif isinstance(x, list): stack.extend(x)
    return sorted(set(types))

rows = []
for f in sorted(ROOT.rglob("index.html")):
    if "404" in f.parts: continue
    p = Page(); p.feed(f.read_text(encoding="utf-8", errors="replace"))
    rel = f.parent.relative_to(ROOT).as_posix()
    path = "/" + ("" if rel == "." else rel + "/")
    url  = "https://hawkfix.pl" + path

    txt = re.sub(r"[ \t]+", " ", "".join(p.text))
    txt = re.sub(r"\n[ \t]+", "\n", txt)
    txt = re.sub(r"\n{3,}", "\n\n", txt).strip()
    (OUT/"text"/((rel if rel != "." else "_home").replace("/","__") + ".txt")).write_text(
        url + "\n" + "=" * len(url) + "\n\n" + txt, encoding="utf-8")

    hl = [(l.get("hreflang",""), l.get("href","")) for l in p.links if l.get("rel","").lower()=="alternate" and l.get("hreflang")]
    title = re.sub(r"\s+"," ", p.title).strip()
    desc  = meta_of(p, "name", "description")
    rows.append({
        "path": path, "url": url, "lang": p.html_attrs.get("lang",""),
        "title": title, "title_len": len(title),
        "description": desc, "desc_len": len(desc),
        "canonical": link_href(p, "canonical"), "robots": meta_of(p,"name","robots"),
        "h1": " | ".join(p.heads["h1"]), "h1_count": len(p.heads["h1"]),
        "h2_count": len(p.heads["h2"]), "h3_count": len(p.heads["h3"]),
        "og_title": meta_of(p,"property","og:title"),
        "og_description": meta_of(p,"property","og:description"),
        "og_image": meta_of(p,"property","og:image"),
        "og_locale": meta_of(p,"property","og:locale"),
        "og_type": meta_of(p,"property","og:type"),
        "twitter_card": meta_of(p,"name","twitter:card"),
        "theme_color": meta_of(p,"name","theme-color"),
        "hreflang_count": len(hl), "hreflangs": " ".join(h for h,_ in hl),
        "schema_types": " ".join(schema_types(p)),
        "words": len(txt.split()), "bytes": f.stat().st_size,
    })

with open(OUT/"seo-index.csv","w",newline="",encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
json.dump(rows, open(OUT/"seo-index.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)

def bad(pred): return [r["url"] for r in rows if pred(r)]
print("pages:", len(rows))
print("title len min/max:", min(r["title_len"] for r in rows), max(r["title_len"] for r in rows))
print("desc  len min/max:", min(r["desc_len"] for r in rows), max(r["desc_len"] for r in rows))
print("words min/avg/max:", min(r["words"] for r in rows), sum(r["words"] for r in rows)//len(rows), max(r["words"] for r in rows))
for label, pred in [
    ("h1 != 1", lambda r: r["h1_count"] != 1),
    ("нет canonical", lambda r: not r["canonical"]),
    ("canonical != url", lambda r: r["canonical"] != r["url"]),
    ("нет description", lambda r: not r["description"]),
    ("title > 60", lambda r: r["title_len"] > 60),
    ("desc > 160", lambda r: r["desc_len"] > 160),
    ("desc < 70", lambda r: r["desc_len"] < 70),
    ("hreflang != 5", lambda r: r["hreflang_count"] != 5),
    ("robots != index, follow", lambda r: r["robots"] != "index, follow"),
    ("нет og:image", lambda r: not r["og_image"]),
]:
    b = bad(pred); print(f"{label}: {len(b)}" + (" -> " + ", ".join(b[:5]) if b else ""))
for field in ("title","description","h1"):
    d = {}
    for r in rows: d.setdefault(r[field], []).append(r["url"])
    dup = {k: v for k, v in d.items() if len(v) > 1}
    print(f"дубли {field}: {len(dup)}" + (f" -> {list(dup)[:3]}" if dup else ""))
print("schema types:", sorted({t for r in rows for t in r["schema_types"].split()}))
