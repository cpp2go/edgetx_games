"""Render previews of the 6 themed backgrounds the way drawBackground() draws
them on a 480x320 screen: tiled seamless texture, 40px grid, decorations.

Output: tools/_render/theme0..5.png (gitignored) + theme_montage.png
"""
import os
import random
from PIL import Image, ImageDraw

W, H = 480, 320
IMG = "assets/IMAGES"
OUT = "tools/_render"
os.makedirs(OUT, exist_ok=True)

# fallback base fills (mirror Game.THEME in vampire.ts)
BASE = [(30, 28, 40), (22, 30, 22), (30, 28, 20), (38, 30, 20), (34, 24, 18), (16, 28, 32)]

random.seed(7)


def tile(img, tex, camx, camy):
    tw, th = tex.size
    tx0, tx1 = camx // tw, (camx + W) // tw
    ty0, ty1 = camy // th, (camy + H) // th
    for gx in range(tx0, tx1 + 1):
        sx = gx * tw - camx
        for gy in range(ty0, ty1 + 1):
            sy = gy * th - camy
            img.paste(tex, (sx, sy))


def grid(draw, camx, camy, base):
    gc = tuple(min(255, c + 26) for c in base)
    step = 40
    for gx in range(camx // step, (camx + W) // step + 1):
        sx = gx * step - camx
        draw.line([(sx, 0), (sx, H)], fill=gc, width=1)
    for gy in range(camy // step, (camy + H) // step + 1):
        sy = gy * step - camy
        draw.line([(0, sy), (W, sy)], fill=gc, width=1)


def decor(draw, camx, camy):
    for _ in range(70):
        dx = random.uniform(0, 200000) - camx
        dy = random.uniform(0, 200000) - camy
        if not (-10 <= dx <= W + 10 and -10 <= dy <= H + 10):
            continue
        t = random.randrange(3)
        x, y = int(dx), int(dy)
        if t == 0:
            draw.line([(x, y), (x - 4, y - 5)], fill=(62, 92, 52), width=1)
            draw.line([(x, y), (x + 4, y - 5)], fill=(62, 92, 52), width=1)
            draw.line([(x, y), (x, y - 6)], fill=(72, 104, 58), width=1)
        elif t == 1:
            draw.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(72, 62, 56))
        else:
            draw.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(178, 96, 130))


ROAD_SIZE, ROAD_W, SW = 256, 46, 10
ASPHALT = (48, 50, 58)
SIDEWALK = (150, 153, 160)
BUILDING_C = [(118, 122, 146), (148, 148, 168), (98, 108, 136),
              (152, 134, 114), (128, 112, 96), (112, 104, 126)]
BUILDING_EDGE = (52, 54, 66)


def buildings(draw, camx, camy, theme):
    s, half = ROAD_SIZE, ROAD_W // 2
    isz = s - ROAD_W
    gap = 10
    cell = (isz - gap) // 2
    for gx in range(camx // s, (camx + W) // s + 1):
        for gy in range(camy // s, (camy + H) // s + 1):
            ix, iy = gx * s + half, gy * s + half
            seed = (gx * 131 + gy * 977) & 0xffff
            for a in range(2):
                for b in range(2):
                    h = (seed + a * 7 + b * 11) & 0xf
                    bw = cell - (4 if h & 1 else 10)
                    bh = cell - (4 if h & 2 else 10)
                    ox = (h >> 2) & 2
                    oy = (h >> 4) & 2
                    x0 = ix + a * (cell + gap) + ox - camx
                    y0 = iy + b * (cell + gap) + oy - camy
                    if x0 + bw < 0 or x0 > W or y0 + bh < 0 or y0 > H:
                        continue
                    col = BUILDING_C[(h + theme) % len(BUILDING_C)]
                    draw.rectangle([x0, y0, x0 + bw, y0 + bh], fill=col)
                    draw.rectangle([x0, y0, x0 + bw, y0 + bh], outline=BUILDING_EDGE, width=1)


def roads(draw, camx, camy):
    hw = ROAD_W // 2
    for rx in range(camx // ROAD_SIZE, (camx + W) // ROAD_SIZE + 1):
        l = rx * ROAD_SIZE - hw - camx
        draw.rectangle([l, 0, l + SW, H], fill=SIDEWALK)
        draw.rectangle([l + SW, 0, l + ROAD_W - SW, H], fill=ASPHALT)
        draw.rectangle([l + ROAD_W - SW, 0, l + ROAD_W, H], fill=SIDEWALK)
    for ry in range(camy // ROAD_SIZE, (camy + H) // ROAD_SIZE + 1):
        t = ry * ROAD_SIZE - hw - camy
        draw.rectangle([0, t, W, t + SW], fill=SIDEWALK)
        draw.rectangle([0, t + SW, W, t + ROAD_W - SW], fill=ASPHALT)
        draw.rectangle([0, t + ROAD_W - SW, W, t + ROAD_W], fill=SIDEWALK)


camx, camy = 100000 % 256, 100000 % 256  # world center, camera scrolled

mont = Image.new("RGB", (W * 2, H * 3), (0, 0, 0))
for theme in range(6):
    tex = Image.open(os.path.join(IMG, f"vamp-bg{theme}.png")).convert("RGB")
    base = BASE[theme]
    img = Image.new("RGB", (W, H), base)
    d = ImageDraw.Draw(img)
    tile(img, tex, camx, camy)
    grid(d, camx, camy, base)
    buildings(d, camx, camy, theme)
    decor(d, camx, camy)
    roads(d, camx, camy)
    img.save(os.path.join(OUT, f"theme{theme}.png"))
    mont.paste(img, ((theme % 2) * W, (theme // 2) * H))
    print(f"theme{theme}: base{BASE[theme]} -> {OUT}/theme{theme}.png")

mont.save(os.path.join(OUT, "theme_montage.png"))
print("montage:", os.path.join(OUT, "theme_montage.png"))
