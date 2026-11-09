"""Pôsteres do telão de LED da landing v3 (apps/web/public/landing/v3/led-*.webp).

O primeiro quadro de cada grade de `led.json`, parado, do jeito que o `draw()`
de `apps/web/src/components/landing/v3/led.ts` pinta: fica de fundo do canvas e
aparece antes do JavaScript; quando o telão acende, o canvas tira o fundo.
Rodar depois de mudar `led.json`: python3 led-posters.py (precisa do Pillow).
"""
import base64, json, pathlib
from PIL import Image, ImageDraw

PUB = pathlib.Path(__file__).resolve().parents[4] / 'apps/web/public/landing/v3'
PITCH = 8  # px por quadrado; o CSS ajusta o tamanho como o canvas (cover)
# arquivo: (grade, modo "soft"), como os canvas da landing
POSTERS = {'hero': ('hero', False), 'hero-soft': ('hero', True), 'crowd': ('crowd', True), 'scarf': ('scarf', True)}

grids = json.loads((PUB / 'led.json').read_text())
for name, (grid, soft) in POSTERS.items():
    g = grids[grid]
    cols, rows = g['c'], g['r']
    lum, flag = base64.b64decode(g['l']), base64.b64decode(g['f'])
    im = Image.new('RGBA', (cols * PITCH, rows * PITCH), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    side = PITCH * 0.78
    pad = (PITCH - side) / 2
    for j in range(rows):
        for i in range(cols):
            k = j * cols + i
            v = (lum[k] / 255) ** 0.9
            if soft:
                v *= 0.72
            level = min(9, int(v * 10))
            if level < 1:
                continue
            a = level / 9
            if flag[k] or v > 0.93:
                color = (201, 241, 53, round(min(1, a * 1.05 + 0.1) * 255))
            else:
                color = (241, 238, 230, round(a * 0.82 * 255))
            x, y = i * PITCH + pad, j * PITCH + pad
            dr.rectangle([round(x), round(y), round(x + side) - 1, round(y + side) - 1], fill=color)
    out = PUB / f'led-{name}.webp'
    im.save(out, lossless=True, method=6)
    print(out.name, out.stat().st_size)
