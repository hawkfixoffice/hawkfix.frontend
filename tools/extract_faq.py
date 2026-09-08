#!/usr/bin/env python3
"""Достаёт из страницы «О нас» блок «четыре вещи, которые обычно беспокоят»
(чередование вопрос/ответ) в content/faq.json — под разметку FAQPage."""
import json, pathlib
HERE = pathlib.Path(__file__).resolve().parent
C = HERE.parent / "content"
pages = json.loads((C / "pages.json").read_text(encoding="utf-8"))
about = next(p for p in pages if p["type"] == "about")

out = {}
for loc, tr in about["tr"].items():
    blocks = tr["blocks"]
    pairs, head = [], ""
    for i, b in enumerate(blocks):
        if b["type"] != "h2":
            continue
        nxt = next((x for x in blocks[i + 1:i + 4] if x["type"] == "list"), None)
        # нужный список — чётной длины ≥8, где нечётные элементы длиннее (это ответы)
        if not nxt or len(nxt["items"]) < 8 or len(nxt["items"]) % 2:
            continue
        it = nxt["items"]
        if all(len(it[k + 1]) > len(it[k]) for k in range(0, len(it), 2)):
            head = b["text"]
            pairs = [{"q": it[k], "a": it[k + 1]} for k in range(0, len(it), 2)]
            break
    out[loc] = {"heading": head, "items": pairs}
    print(f"  {loc}: «{head}» → {len(pairs)} пар")

(C / "faq.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
