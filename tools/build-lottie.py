#!/usr/bin/env python3
"""Собирает Lottie-анимации сайта из общего мотива логотипа: точка,
раскрывающаяся в шестилучевую звёздочку, и линия, которая прочерчивается.

Файлы пишем руками (а не экспортом из After Effects), чтобы они оставались
крошечными — весь набор меньше 10 КБ и грузится динамически.
Цвет здесь опорный: в рантайме компонент Lottie перекрашивает шейпы
под фон, на котором стоит анимация.
"""
import json, math, pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'lottie'
ACCENT = [0.431, 0.937, 0.627, 1]
FOREST = [0.102, 0.290, 0.180, 1]

EI = {'x': [0.4], 'y': [1]}   # плавный вход
EO = {'x': [0.3], 'y': [0]}   # плавный выход


def kf(pairs):
    """[(кадр, значение)] → массив ключей Lottie с общим сглаживанием."""
    out = []
    for i, (t, v) in enumerate(pairs):
        k = {'t': t, 's': v if isinstance(v, list) else [v]}
        if i < len(pairs) - 1:
            k['i'], k['o'] = EI, EO
        out.append(k)
    return out


def layer(ind, nm, shapes, op, p=(50, 50), st=0):
    return {
        'ddd': 0, 'ind': ind, 'ty': 4, 'nm': nm, 'sr': 1,
        'ks': {'o': {'a': 0, 'k': 100}, 'r': {'a': 0, 'k': 0},
               'p': {'a': 0, 'k': [p[0], p[1], 0]}, 'a': {'a': 0, 'k': [0, 0, 0]},
               's': {'a': 0, 'k': [100, 100, 100]}},
        'ao': 0, 'shapes': shapes, 'ip': 0, 'op': op, 'st': st, 'bm': 0,
    }


def tr(scale=None, rot=None, op=None, pos=(0, 0)):
    t = {'ty': 'tr', 'p': {'a': 0, 'k': list(pos)}, 'a': {'a': 0, 'k': [0, 0]},
         'o': {'a': 1, 'k': kf(op)} if op else {'a': 0, 'k': 100},
         's': {'a': 1, 'k': kf(scale)} if scale else {'a': 0, 'k': [100, 100]},
         'r': {'a': 1, 'k': kf(rot)} if rot else {'a': 0, 'k': 0}}
    return t


def rays(r, width, color):
    """Шесть лучей звёздочки — три отрезка через центр под 60°."""
    out = []
    for a in (0, 60, 120):
        dx, dy = r * math.cos(math.radians(a)), r * math.sin(math.radians(a))
        out.append({'ty': 'sh', 'ks': {'a': 0, 'k': {
            'i': [[0, 0], [0, 0]], 'o': [[0, 0], [0, 0]],
            'v': [[round(-dx, 3), round(-dy, 3)], [round(dx, 3), round(dy, 3)]], 'c': False}}})
    out.append({'ty': 'st', 'c': {'a': 0, 'k': color}, 'o': {'a': 0, 'k': 100},
                'w': {'a': 0, 'k': width}, 'lc': 2, 'lj': 2})
    return out


def doc(nm, w, h, op, layers, fr=60):
    return {'v': '5.9.0', 'fr': fr, 'ip': 0, 'op': op, 'w': w, 'h': h,
            'nm': nm, 'ddd': 0, 'assets': [], 'layers': layers}


def write(name, data):
    p = OUT / f'{name}.json'
    p.write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
    print(f'{name}.json  {p.stat().st_size} B')


# ── spark: точка раскрывается в звёздочку и остаётся ─────────────────────────
spark = doc('spark', 100, 100, 44, [
    layer(1, 'ring', [{'ty': 'gr', 'nm': 'ring', 'it': [
        {'ty': 'el', 'p': {'a': 0, 'k': [0, 0]}, 's': {'a': 0, 'k': [40, 40]}},
        {'ty': 'st', 'c': {'a': 0, 'k': FOREST}, 'o': {'a': 1, 'k': kf([(4, 90), (34, 0)])},
         'w': {'a': 0, 'k': 5}},
        tr(scale=[(4, [60, 60]), (34, [225, 225])]),
    ]}], 44),
    layer(2, 'star', [{'ty': 'gr', 'nm': 'star', 'it': rays(22, 7, FOREST) + [
        tr(scale=[(0, [0, 0]), (16, [115, 115]), (26, [100, 100])],
           rot=[(0, -90), (28, 0)]),
    ]}], 44),
    layer(3, 'dot', [{'ty': 'gr', 'nm': 'dot', 'it': [
        {'ty': 'el', 'p': {'a': 0, 'k': [0, 0]}, 's': {'a': 0, 'k': [34, 34]}},
        {'ty': 'fl', 'c': {'a': 0, 'k': FOREST}, 'o': {'a': 0, 'k': 100}},
        tr(scale=[(0, [100, 100]), (13, [0, 0])]),
    ]}], 44),
])
write('spark', spark)

# ── rule: линия прочерчивается слева направо ────────────────────────────────
# Холст нарочно плоский (300×16) и рисуется с preserveAspectRatio: none —
# по горизонтали линию можно тянуть на любую ширину, а толщина обводки
# зависит только от вертикального масштаба и остаётся ровно 2px.
rule = doc('rule', 300, 16, 40, [
    layer(1, 'line', [{'ty': 'gr', 'nm': 'line', 'it': [
        {'ty': 'sh', 'ks': {'a': 0, 'k': {'i': [[0, 0], [0, 0]], 'o': [[0, 0], [0, 0]],
                                          'v': [[-150, 0], [150, 0]], 'c': False}}},
        {'ty': 'st', 'c': {'a': 0, 'k': FOREST}, 'o': {'a': 0, 'k': 100},
         'w': {'a': 0, 'k': 2}, 'lc': 1, 'lj': 1},
        {'ty': 'tm', 'nm': 'trim', 's': {'a': 0, 'k': 0},
         'e': {'a': 1, 'k': kf([(0, 0), (36, 100)])}, 'o': {'a': 0, 'k': 0}, 'm': 1},
        tr(),
    ]}], 40, p=(150, 8)),
])
write('rule', rule)

# ── pulse: точка с расходящимся кольцом, зацикленная ─────────────────────────
pulse = doc('pulse', 40, 40, 60, [
    layer(1, 'ring', [{'ty': 'gr', 'nm': 'ring', 'it': [
        {'ty': 'el', 'p': {'a': 0, 'k': [0, 0]}, 's': {'a': 0, 'k': [12, 12]}},
        {'ty': 'st', 'c': {'a': 0, 'k': ACCENT}, 'o': {'a': 1, 'k': kf([(0, 75), (48, 0), (60, 0)])},
         'w': {'a': 0, 'k': 2}},
        tr(scale=[(0, [100, 100]), (48, [270, 270]), (60, [270, 270])]),
    ]}], 60, p=(20, 20)),
    layer(2, 'dot', [{'ty': 'gr', 'nm': 'dot', 'it': [
        {'ty': 'el', 'p': {'a': 0, 'k': [0, 0]}, 's': {'a': 0, 'k': [12, 12]}},
        {'ty': 'fl', 'c': {'a': 0, 'k': ACCENT}, 'o': {'a': 0, 'k': 100}},
        tr(scale=[(0, [100, 100]), (10, [86, 86]), (26, [100, 100]), (60, [100, 100])]),
    ]}], 60, p=(20, 20)),
])
write('pulse', pulse)
