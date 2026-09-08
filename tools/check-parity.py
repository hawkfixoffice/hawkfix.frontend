#!/usr/bin/env python3
"""Сверяет новый сайт со старым: весь ли уникальный текст перенесён.

Берёт для каждой страницы ключевые куски со старого сайта (описание, чек-лист,
примечания) и ищет их в HTML новой сборки. Заголовки и мета сверяет точно.
"""
import json, pathlib, re, html, sys

SITE = pathlib.Path(__file__).resolve().parent.parent
OLD = SITE.parent / "old-site" / "hawkfix.pl"
NEW = SITE / "dist"

def text_of(p: pathlib.Path) -> str:
    s = p.read_text(encoding="utf-8", errors="replace")
    s = re.sub(r"(?s)<script.*?</script>|<style.*?</style>", " ", s)
    t = html.unescape(re.sub(r"(?s)<[^>]+>", " ", s))
    return re.sub(r"\s+", " ", t)

index = json.loads((SITE / "content" / "index.json").read_text(encoding="utf-8"))
missing, checked = [], 0

for page in index:
    for loc, tr in page["tr"].items():
        path = tr["path"].lstrip("/")
        old_f, new_f = OLD / path / "index.html", NEW / path / "index.html"
        if not old_f.exists() or not new_f.exists():
            missing.append((tr["path"], "нет файла"))
            continue
        new_text = text_of(new_f)

        # 1. title и description должны совпадать со старым сайтом дословно
        old_html = old_f.read_text(encoding="utf-8", errors="replace")
        old_title = re.search(r"<title>(.*?)</title>", old_html, re.S)
        old_desc = re.search(r'<meta name="description" content="([^"]*)"', old_html)
        if old_title and html.unescape(old_title.group(1)).strip() != tr["title"]:
            missing.append((tr["path"], f"title разошёлся"))
        if old_desc and html.unescape(old_desc.group(1)).strip() != tr["description"]:
            missing.append((tr["path"], "description разошёлся"))

        # 2. содержательные фрагменты старой страницы должны быть в новой
        body_f = SITE / "content" / "bodies" / f"{page['key']}__{loc}.json"
        if body_f.exists():
            body = json.loads(body_f.read_text(encoding="utf-8"))
            chunks = []
            if tr.get("blurb"): chunks.append(tr["blurb"])
            chunks += body.get("checklist", []) or []
            chunks += body.get("intro", []) or []
            chunks += body.get("note", []) or []
            if page["type"] in ("legal", "about", "contact", "prices"):
                chunks += [b["text"] for b in body["blocks"] if b["type"] == "p" and len(b["text"]) > 60]
                chunks += [i for b in body["blocks"] if b["type"] == "list" for i in b["items"]]
            for c in chunks:
                probe = re.sub(r"\s+", " ", c).strip()[:80]
                if probe and probe not in new_text:
                    missing.append((tr["path"], f"нет текста: «{probe[:60]}…»"))
                checked += 1

print(f"проверено фрагментов: {checked}")
if missing:
    print(f"РАСХОЖДЕНИЙ: {len(missing)}")
    for p, why in missing[:25]:
        print(f"  {p:<46} {why}")
    sys.exit(1)
print("весь уникальный текст старого сайта присутствует в новом")
