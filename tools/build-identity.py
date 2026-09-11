#!/usr/bin/env python3
"""Пакет фирменных файлов HAWK.FIX для папки Identy.

Из чего собирается:
  • вордмарк — контуры Manrope wght 600 (те же, что на сайте), переведённые
    в кривые: файл не зависит от установленного шрифта;
  • знак — «h» со звёздочкой из public/favicon.svg;
  • анимация — тот же мотив, что у логотипа на сайте: точка раскрывается
    в шестилучевую звёздочку, проворачивается и схлопывается обратно.

Растр и видео делает rsvg-convert + ffmpeg, Lottie собирается кодом.
Запуск:  python3 tools/build-identity.py [<каталог назначения>]
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / 'Identy'

# --- фирменные цвета (те же токены, что в src/styles/tokens.css) ---
INK = '#1c1c1c'          # основной тёмный
INK_DEEP = '#111312'     # тёмный фон знака, письма, og
ACCENT = '#6eefa0'       # мята — заливки и точка на тёмном
ACCENT_TEXT = '#146b3c'  # зелёный для точки на светлом (контраст 4.84)
WHITE = '#ffffff'

WORD = 'HAWK.FIX'
WEIGHT = 600             # как .brand на сайте
TRACKING = -0.02         # letter-spacing: -0.02em
DOT_GAP = 0.05           # воздух вокруг точки: она крупнее глифа
# На сайте точка — не глиф, а кружок Lottie заметно крупнее точки шрифта.
# Держим ту же пропорцию, иначе логотип в файле и логотип на сайте разные.
DOT_SCALE = 1.9


def font_paths():
    """Контуры вордмарка в координатах em, плюс геометрия точки.

    Точку вынимаем отдельно: в анимации она превращается в звёздочку,
    поэтому нужны её центр и радиус, а не готовый контур глифа.
    """
    src = ROOT / 'public' / 'fonts' / 'manrope-latin.woff2'
    font = instantiateVariableFont(TTFont(src), {'wght': WEIGHT}, updateFontNames=False)
    upem = font['head'].unitsPerEm
    cmap, gs = font.getBestCmap(), font.getGlyphSet()
    hmtx = font['hmtx']

    x = 0.0
    letters: list[str] = []
    dot = None
    for ch in WORD:
        name = cmap[ord(ch)]
        adv = hmtx[name][0] / upem
        if ch == '.':
            # bbox точки → центр и радиус для круга-заготовки под анимацию
            rec = RecordingPen()
            gs[name].draw(rec)
            xs, ys = [], []
            for _, args in rec.value:
                for pt in args:
                    if isinstance(pt, tuple):
                        xs.append(pt[0] / upem)
                        ys.append(pt[1] / upem)
            r = (max(xs) - min(xs)) / 2 * DOT_SCALE
            dot = {
                'cx': x + DOT_GAP + (min(xs) + max(xs)) / 2,
                # низ кружка ставим на базовую линию, как у точки в шрифте
                'cy': -r * 0.92,
                'r': r,
            }
            x += adv + 2 * DOT_GAP + TRACKING
            continue

        pen = SVGPathPen(gs)
        # Y в шрифте растёт вверх, в SVG — вниз; заодно переводим в em
        gs[name].draw(TransformPen(pen, (1 / upem, 0, 0, -1 / upem, x, 0)))
        d = pen.getCommands()
        if d:
            letters.append(d)
        x += adv + TRACKING

    metrics = {
        'width': x - TRACKING,
        'cap': font['OS/2'].sCapHeight / upem if hasattr(font['OS/2'], 'sCapHeight') else 0.72,
        'desc': abs(font['hhea'].descent) / upem,
    }
    return letters, dot, metrics


def wordmark_svg(letters, dot, m, ink: str, accent: str, scale=1000, pad=0.08) -> str:
    """Вордмарк одним куском: буквы — кривые, точка — круг."""
    h = m['cap'] + 2 * pad
    w = m['width'] + 2 * pad
    body = '\n'.join(f'    <path d="{d}"/>' for d in letters)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w * scale:.1f} {h * scale:.1f}" '
        f'width="{w * scale:.0f}" height="{h * scale:.0f}" role="img" aria-label="HAWK.FIX">\n'
        f'  <g transform="translate({pad * scale:.1f} {(pad + m["cap"]) * scale:.1f}) scale({scale})">\n'
        f'  <g fill="{ink}">\n{body}\n  </g>\n'
        f'    <circle cx="{dot["cx"]:.4f}" cy="{dot["cy"]:.4f}" r="{dot["r"]:.4f}" fill="{accent}"/>\n'
        f'  </g>\n</svg>\n'
    )


def star_svg_group(dot, accent: str, spread: float, spin: float, opacity: float) -> str:
    """Шестилучевая звёздочка вместо точки: три отрезка через центр.

    `spread` — 0 (точка) … 1 (полностью раскрытая звёздочка).
    """
    if spread <= 0.001:
        return f'<circle cx="{dot["cx"]:.4f}" cy="{dot["cy"]:.4f}" r="{dot["r"]:.4f}" fill="{accent}"/>'
    # Пропорции взяты из src/lottie/logo.json: там точка d=34, а луч 22,
    # то есть звёздочка лишь немного больше самой точки — она деликатная
    # и не должна налезать на «K» и «F».
    ray = dot['r'] * (1 + 0.35 * spread)
    w = dot['r'] * 2 * (1 - 0.58 * spread)
    lines = []
    for i in range(3):
        a = math.radians(spin + i * 60)
        dx, dy = math.cos(a) * ray, math.sin(a) * ray
        lines.append(
            f'<path d="M{dot["cx"] - dx:.4f} {dot["cy"] - dy:.4f}L{dot["cx"] + dx:.4f} {dot["cy"] + dy:.4f}"/>'
        )
    return (
        f'<g stroke="{accent}" stroke-width="{w:.4f}" stroke-linecap="round" '
        f'fill="none" opacity="{opacity:.3f}">' + ''.join(lines) + '</g>'
    )


def frame_svg(letters, dot, m, ink: str, accent: str, t: float, scale=1000, pad=0.08) -> str:
    """Кадр анимации: буквы стоят, точка раскрывается и проворачивается."""
    h, w = m['cap'] + 2 * pad, m['width'] + 2 * pad
    # 0…0.18 — раскрытие, 0.18…0.62 — оборот, 0.62…0.8 — схлопывание, дальше пауза
    if t < 0.18:
        spread = ease_out(t / 0.18)
    elif t < 0.62:
        spread = 1.0
    elif t < 0.80:
        spread = 1 - ease_in((t - 0.62) / 0.18)
    else:
        spread = 0.0
    spin = 180 * ease_in_out(min(1.0, max(0.0, (t - 0.10) / 0.60)))
    body = '\n'.join(f'    <path d="{d}"/>' for d in letters)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w * scale:.1f} {h * scale:.1f}" '
        f'width="{w * scale:.0f}" height="{h * scale:.0f}">\n'
        f'  <g transform="translate({pad * scale:.1f} {(pad + m["cap"]) * scale:.1f}) scale({scale})">\n'
        f'  <g fill="{ink}">\n{body}\n  </g>\n'
        f'    {star_svg_group(dot, accent, spread, spin, 1.0)}\n'
        f'  </g>\n</svg>\n'
    )


ease_out = lambda x: 1 - (1 - x) ** 3
ease_in = lambda x: x ** 3
ease_in_out = lambda x: 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def run(cmd: list[str]):
    subprocess.run(cmd, check=True, capture_output=True)


def png(svg: Path, dst: Path, width: int):
    run(['rsvg-convert', '-w', str(width), '-o', str(dst), str(svg)])



# ==========================================================================
#  Lottie: тот же вордмарк, но точка живёт — берём готовую анимацию точки
#  из src/lottie/logo.json и ставим её на место точки в слове.
# ==========================================================================
def hex_rgb(h: str):
    h = h.lstrip('#')
    return [round(int(h[i:i + 2], 16) / 255, 4) for i in (0, 2, 4)] + [1]


def letters_shapes(glyphs, ink: str):
    """Буквы как shape-слой Lottie: по группе на глиф, заливка одна."""
    groups = []
    for contours in glyphs:
        items = [{'ty': 'sh', 'ks': {'a': 0, 'k': c}} for c in contours]
        items.append({'ty': 'fl', 'c': {'a': 0, 'k': hex_rgb(ink)}, 'o': {'a': 0, 'k': 100}, 'r': 1})
        items.append({'ty': 'tr', 'p': {'a': 0, 'k': [0, 0]}, 'a': {'a': 0, 'k': [0, 0]},
                      's': {'a': 0, 'k': [100, 100]}, 'r': {'a': 0, 'k': 0}, 'o': {'a': 0, 'k': 100}})
        groups.append({'ty': 'gr', 'nm': 'glyph', 'it': items})
    return groups


def glyph_contours(scale: float):
    """Контуры букв в координатах Lottie (Y вниз, единицы холста).

    Manrope — TrueType, то есть квадратичные кривые, а Lottie понимает
    только кубические: переводим Qu2CuPen'ом.
    """
    from fontTools.pens.basePen import BasePen
    from fontTools.pens.qu2cuPen import Qu2CuPen

    class LottiePen(BasePen):
        """Контур в формате Lottie: вершины v плюс тангенсы i/o к ним."""

        def __init__(self, glyphSet):
            super().__init__(glyphSet)
            self.contours = []
            self._cur = None

        def _moveTo(self, pt):
            self._cur = {'i': [[0, 0]], 'o': [[0, 0]], 'v': [list(pt)], 'c': True}

        def _lineTo(self, pt):
            self._cur['v'].append(list(pt))
            self._cur['i'].append([0, 0])
            self._cur['o'].append([0, 0])

        def _curveToOne(self, c1, c2, pt):
            prev = self._cur['v'][-1]
            self._cur['o'][-1] = [c1[0] - prev[0], c1[1] - prev[1]]
            self._cur['v'].append(list(pt))
            self._cur['i'].append([c2[0] - pt[0], c2[1] - pt[1]])
            self._cur['o'].append([0, 0])

        def _closePath(self):
            c = self._cur
            # Последняя вершина, совпавшая с первой, даёт залом в Lottie
            if len(c['v']) > 1 and c['v'][0] == c['v'][-1]:
                c['o'][0] = c['o'][-1]
                for k in ('v', 'i', 'o'):
                    c[k].pop()
            self.contours.append(c)
            self._cur = None

        def _endPath(self):
            if self._cur:
                self.contours.append(self._cur)
                self._cur = None

    src = ROOT / 'public' / 'fonts' / 'manrope-latin.woff2'
    font = instantiateVariableFont(TTFont(src), {'wght': WEIGHT}, updateFontNames=False)
    upem = font['head'].unitsPerEm
    cmap, gs, hmtx = font.getBestCmap(), font.getGlyphSet(), font['hmtx']

    out, x = [], 0.0
    for ch in WORD:
        name = cmap[ord(ch)]
        adv = hmtx[name][0] / upem
        if ch == '.':
            x += adv + 2 * DOT_GAP + TRACKING
            continue
        pen = LottiePen(gs)
        tp = TransformPen(Qu2CuPen(pen, max_err=0.4), (scale / upem, 0, 0, -scale / upem, x * scale, 0))
        gs[name].draw(tp)
        out.append(pen.contours)
        x += adv + TRACKING
    return out


def wordmark_lottie(dot, m, ink: str, dot_json: dict, scale=1000, pad=0.08) -> dict:
    """Вордмарк с живой точкой. Слои точки берём из логотипа сайта как есть,
    только ставим на место и масштабируем: анимация в файле и на сайте —
    буквально одна и та же."""
    w, h = (m['width'] + 2 * pad) * scale, (m['cap'] + 2 * pad) * scale
    ox, oy = pad * scale, (pad + m['cap']) * scale
    # В logo.json точка нарисована диаметром 34 на холсте 100
    k = (dot['r'] * 2 * scale) / 34 * 100

    layers = []
    for i, layer in enumerate(dot_json['layers']):
        lay = json.loads(json.dumps(layer))
        lay['ind'] = i + 1
        lay['ks']['p'] = {'a': 0, 'k': [ox + dot['cx'] * scale, oy + dot['cy'] * scale, 0]}
        lay['ks']['s'] = {'a': 0, 'k': [k, k, 100]}
        layers.append(lay)

    layers.append({
        'ddd': 0, 'ind': len(layers) + 1, 'ty': 4, 'nm': 'wordmark', 'sr': 1,
        'ks': {'o': {'a': 0, 'k': 100}, 'r': {'a': 0, 'k': 0},
               'p': {'a': 0, 'k': [ox, oy, 0]}, 'a': {'a': 0, 'k': [0, 0, 0]},
               's': {'a': 0, 'k': [100, 100, 100]}},
        'ao': 0, 'shapes': letters_shapes(glyph_contours(scale), ink),
        'ip': 0, 'op': dot_json['op'], 'st': 0, 'bm': 0,
    })

    return {'v': '5.9.0', 'fr': dot_json['fr'], 'ip': 0, 'op': dot_json['op'],
            'w': round(w), 'h': round(h), 'nm': 'hawkfix-logo', 'ddd': 0,
            'assets': [], 'layers': layers}


# ==========================================================================
#  Плоские анимации: кадры → apng / webp / gif / webm / mov
# ==========================================================================
FPS = 30
SECONDS = 2.4


def render_frames(letters, dot, m, ink: str, accent: str, tmp: Path, width: int) -> int:
    n = int(FPS * SECONDS)
    for i in range(n):
        svg = tmp / ('f%03d.svg' % i)
        svg.write_text(frame_svg(letters, dot, m, ink, accent, i / n), encoding='utf-8')
        png(svg, tmp / ('f%03d.png' % i), width)
        svg.unlink()
    return n


def animated_files(tmp: Path, dst: Path, name: str):
    frames = str(tmp / 'f%03d.png')
    # APNG — честная альфа, открывается в браузере и в Keynote
    run(['ffmpeg', '-y', '-framerate', str(FPS), '-i', frames,
         '-plays', '0', '-f', 'apng', str(dst / (name + '.apng'))])
    # анимированный WebP — тоже с альфой и заметно легче APNG
    run(['img2webp', '-loop', '0', '-d', str(round(1000 / FPS)), '-lossy', '-q', '90',
         *sorted(str(p) for p in tmp.glob('f*.png')), '-o', str(dst / (name + '.webp'))])
    # GIF — прозрачность однобитная, края ступеньками: запасной вариант
    run(['ffmpeg', '-y', '-framerate', str(FPS), '-i', frames,
         '-vf', 'split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=alpha_threshold=128',
         '-loop', '0', str(dst / (name + '.gif'))])
    # WebM VP9 с альфой — для веба и монтажа
    run(['ffmpeg', '-y', '-framerate', str(FPS), '-i', frames,
         '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '24',
         '-auto-alt-ref', '0', str(dst / (name + '-alpha.webm'))])
    # ProRes 4444 — для Premiere / Resolve / After Effects, альфа без потерь
    run(['ffmpeg', '-y', '-framerate', str(FPS), '-i', frames,
         '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le',
         str(dst / (name + '-alpha.mov'))])


def animated_svg(letters, dot, m, ink: str, accent: str, scale=1000, pad=0.08) -> str:
    """Самодостаточный SVG с анимацией (SMIL): годится как <img> и инлайном."""
    h, w = (m['cap'] + 2 * pad) * scale, (m['width'] + 2 * pad) * scale
    body = '\n'.join('      <path d="%s"/>' % d for d in letters)
    cx, cy, r = dot['cx'], dot['cy'], dot['r']
    ray, dur = r * 1.35, '%ss' % SECONDS
    rays = []
    for i in range(3):
        a = math.radians(i * 60)
        dx, dy = math.cos(a) * ray, math.sin(a) * ray
        rays.append('<path d="M%.4f %.4fL%.4f %.4f"/>' % (cx - dx, cy - dy, cx + dx, cy + dy))

    tpl = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.1f} {h:.1f}" width="{w:.0f}" height="{h:.0f}" role="img" aria-label="HAWK.FIX">
  <g transform="translate({ox:.1f} {oy:.1f}) scale({scale})">
    <g fill="{ink}">
{body}
    </g>
    <circle cx="{cx:.4f}" cy="{cy:.4f}" r="{r:.4f}" fill="{accent}">
      <animate attributeName="r" dur="{dur}" repeatCount="indefinite"
               keyTimes="0;0.12;0.70;0.82;1" values="{r:.4f};0;0;{r:.4f};{r:.4f}"
               calcMode="spline" keySplines="0.3 0 0.4 1;0 0 1 1;0.3 0 0.4 1;0 0 1 1"/>
    </circle>
    <g stroke="{accent}" stroke-width="{sw:.4f}" stroke-linecap="round" fill="none" opacity="0">
      <animate attributeName="opacity" dur="{dur}" repeatCount="indefinite"
               keyTimes="0;0.10;0.13;0.70;0.80;1" values="0;0;1;1;0;0"/>
      <g transform="translate({cx:.4f} {cy:.4f})">
        <animateTransform attributeName="transform" type="rotate" dur="{dur}" repeatCount="indefinite"
                          additive="sum" keyTimes="0;0.12;0.70;1" values="0;0;180;180"
                          calcMode="spline" keySplines="0 0 1 1;0.4 0 0.2 1;0 0 1 1"/>
        <g transform="translate({mcx:.4f} {mcy:.4f})">{rays}</g>
      </g>
    </g>
  </g>
</svg>
'''
    return tpl.format(w=w, h=h, ox=pad * scale, oy=(pad + m['cap']) * scale, scale=scale,
                      ink=ink, accent=accent, body=body, cx=cx, cy=cy, r=r,
                      sw=r * 0.84, dur=dur, rays=''.join(rays), mcx=-cx, mcy=-cy)



def readme(m) -> str:
    return f"""# HAWK.FIX — фирменные файлы

Собрано скриптом `hawkfix.frontend/tools/build-identity.py` из тех же
исходников, что и сайт: контуры вордмарка сняты с Manrope wght {WEIGHT}
и переведены в кривые, анимация точки — тот же Lottie, что играет
в шапке сайта. Пересобрать: `python3 tools/build-identity.py`.

## Цвета

| Роль | HEX | Где |
|---|---|---|
| Тёмный (текст логотипа) | `{INK}` | светлый фон |
| Тёмный фон знака | `{INK_DEEP}` | плашка фавикона, письма, og |
| Мята | `{ACCENT}` | точка и звёздочка на тёмном |
| Зелёный | `{ACCENT_TEXT}` | точка на светлом (контраст 4.84) |
| Белый | `{WHITE}` | выворотка |

Белого текста на мяте не бывает: контраст 1.47. На мятной плашке текст
всегда тёмный.

## logo/ — вордмарк

- `hawkfix-logo.svg` — основной, для светлого фона
- `hawkfix-logo-light.svg` — для тёмного фона (белые буквы, мятная точка)
- `hawkfix-logo-black.svg` / `-white.svg` — одноцветные, для печати и тиснения
- `png/*-600|1200|2400.png` — растр с прозрачным фоном

Буквы — кривые, шрифт для просмотра не нужен. Пропорции: ширина примерно
{m['width'] / m['cap']:.2f} высоты прописных.

## mark/ — знак

- `hawkfix-mark.svg` — «h» и звёздочка на тёмной плашке со скруглением
- `hawkfix-mark-transparent.svg` — то же без плашки, для тёмного фона
- `hawkfix-mark-dark.svg` — для светлого фона: тёмная «h», зелёная звёздочка
- `png/` — 64…1024 px, все три версии
- `favicon.ico`, `favicon-96.png`, `apple-touch-icon.png` — то, что стоит на сайте

## animated/ — анимация

Мотив один: точка логотипа раскрывается в шестилучевую звёздочку,
проворачивается на 180° и схлопывается обратно. Длительность {SECONDS} с, {FPS} fps.

| Файл | Для чего |
|---|---|
| `hawkfix-logo.json`, `hawkfix-logo-light.json` | Lottie для сайта и приложений — вектор, любой размер |
| `hawkfix-dot.json` | только точка-звёздочка, без слова |
| `hawkfix-logo-animated.svg`, `…-light.svg` | самодостаточный SVG (SMIL): вставляется как `<img>` |
| `*.apng` | прозрачный растр, понимают браузеры и Keynote |
| `*.webp` | то же, но в 3–5 раз легче APNG |
| `*.gif` | для мест, где ничего другого не принимают; прозрачность однобитная, края ступеньками |
| `*-alpha.webm` | VP9 с альфой — веб и монтаж |
| `*-alpha.mov` | ProRes 4444 с альфой — Premiere, Resolve, After Effects |

Версии без суффикса — для светлого фона, `-light` — для тёмного.

## Как не портить логотип

- Не растягивать по одной оси и не перекрашивать точку в другие цвета.
- Свободное поле вокруг — не меньше высоты буквы «H».
- Минимальная ширина вордмарка: 90 px на экране, 24 мм в печати.
- На фото логотип ставить только на однородный участок; если фон пёстрый —
  подложка `{INK_DEEP}` или белая.
"""

# --------------------------------------------------------------------------
def main():
    if shutil.which('rsvg-convert') is None or shutil.which('ffmpeg') is None:
        sys.exit('нужны rsvg-convert и ffmpeg')

    letters, dot, m = font_paths()
    for sub in ('logo', 'logo/png', 'mark', 'mark/png', 'animated', 'animated/frames'):
        (OUT / sub).mkdir(parents=True, exist_ok=True)

    # ---------------- вордмарк ----------------
    variants = {
        'hawkfix-logo':        (INK, ACCENT_TEXT),   # для светлого фона
        'hawkfix-logo-light':  (WHITE, ACCENT),      # для тёмного фона
        'hawkfix-logo-black':  (INK, INK),           # одноцветный
        'hawkfix-logo-white':  (WHITE, WHITE),       # одноцветный выворотка
    }
    for name, (ink, accent) in variants.items():
        svg = OUT / 'logo' / f'{name}.svg'
        svg.write_text(wordmark_svg(letters, dot, m, ink, accent), encoding='utf-8')
        for w in (600, 1200, 2400):
            png(svg, OUT / 'logo' / 'png' / f'{name}-{w}.png', w)

    # ---------------- знак ----------------
    mark_src = (ROOT / 'public' / 'favicon.svg').read_text(encoding='utf-8')
    (OUT / 'mark' / 'hawkfix-mark.svg').write_text(mark_src, encoding='utf-8')
    # тот же знак без подложки — для наложения на свой фон
    bare = mark_src.replace(f'<rect width="64" height="64" rx="14" fill="{INK_DEEP}"/>', '')
    (OUT / 'mark' / 'hawkfix-mark-transparent.svg').write_text(bare, encoding='utf-8')
    # и версия для светлого фона: белая «h» на белом не видна, а мята на белом
    # даёт контраст 1.4 — поэтому «h» тёмная, звёздочка зелёная
    dark = bare.replace(f'stroke="{WHITE}"', f'stroke="{INK}"').replace(f'stroke="{ACCENT}"', f'stroke="{ACCENT_TEXT}"')
    (OUT / 'mark' / 'hawkfix-mark-dark.svg').write_text(dark, encoding='utf-8')
    for w in (64, 128, 256, 512, 1024):
        png(OUT / 'mark' / 'hawkfix-mark.svg', OUT / 'mark' / 'png' / f'hawkfix-mark-{w}.png', w)
        png(OUT / 'mark' / 'hawkfix-mark-transparent.svg',
            OUT / 'mark' / 'png' / f'hawkfix-mark-transparent-{w}.png', w)
        png(OUT / 'mark' / 'hawkfix-mark-dark.svg', OUT / 'mark' / 'png' / f'hawkfix-mark-dark-{w}.png', w)
    for src, dst in (('favicon.ico', 'favicon.ico'),
                     ('favicon-96.png', 'favicon-96.png'),
                     ('apple-touch-icon.png', 'apple-touch-icon.png')):
        shutil.copy(ROOT / 'public' / src, OUT / 'mark' / dst)

    print('вордмарк и знак собраны')

    # ---------------- Lottie ----------------
    dot_json = json.loads((ROOT / 'src' / 'lottie' / 'logo.json').read_text())
    for name, ink in (('hawkfix-logo', INK), ('hawkfix-logo-light', WHITE)):
        data = wordmark_lottie(dot, m, ink, dot_json)
        (OUT / 'animated' / f'{name}.json').write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
    # знак-точка отдельно: та же анимация без слова
    (OUT / 'animated' / 'hawkfix-dot.json').write_text(json.dumps(dot_json, separators=(',', ':')), encoding='utf-8')

    # ---------------- анимация: SVG и плоские форматы ----------------
    for name, (ink, accent) in (('hawkfix-logo-animated', (INK, ACCENT_TEXT)),
                                ('hawkfix-logo-animated-light', (WHITE, ACCENT))):
        (OUT / 'animated' / f'{name}.svg').write_text(
            animated_svg(letters, dot, m, ink, accent), encoding='utf-8')

    tmp = OUT / 'animated' / 'frames'
    for name, (ink, accent) in (('hawkfix-logo-animated', (INK, ACCENT_TEXT)),
                                ('hawkfix-logo-animated-light', (WHITE, ACCENT))):
        for f in tmp.glob('f*.png'):
            f.unlink()
        render_frames(letters, dot, m, ink, accent, tmp, 1600)
        animated_files(tmp, OUT / 'animated', name)
    shutil.rmtree(tmp)

    (OUT / 'README.md').write_text(readme(m), encoding='utf-8')
    print(f'готово: {OUT}')



if __name__ == '__main__':
    main()
