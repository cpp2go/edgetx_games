"""Render frames of the famidash game to PNG images for a visual sanity
check. Uses a rasterizing mock of the EdgeTX lcd API (PIL-backed) and the
lupa runtime from verify-game.py.

Run from the etx-famidash directory:
    python tools/render.py
Writes PNGs into tools/_render/.
"""
import os
from PIL import Image, ImageDraw, ImageFont

import importlib.util
spec = importlib.util.spec_from_file_location('vg', 'tools/verify-game.py')
vg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vg)

LCD_W, LCD_H = 480, 320
OUT = os.path.join(os.path.dirname(__file__), '_render')
os.makedirs(OUT, exist_ok=True)

# Theme colours used by EdgeTX text flags (approximate, for rendering only)
THEME = {
    "COLOR_THEME_PRIMARY1": (240, 244, 255),
    "COLOR_THEME_PRIMARY2": (180, 190, 220),
    "COLOR_THEME_PRIMARY3": (120, 135, 175),
    "COLOR_THEME_SECONDARY1": (255, 210, 90),
    "COLOR_THEME_SECONDARY2": (130, 180, 255),
    "COLOR_THEME_WARNING": (255, 120, 90),
}


class RasterLCD:
    def __init__(self):
        self.img = Image.new('RGB', (LCD_W, LCD_H), (8, 10, 22))
        self.d = ImageDraw.Draw(self.img)
        self.r = 255
        self.g = 255
        self.b = 255
        self.small = ImageFont.load_default()
        self.big = ImageFont.load_default()

    def RGB(self, r, g, b):
        self.r, self.g, self.b = r, g, b
        return (r << 16) | (g << 8) | b

    def _fill(self):
        return (self.r, self.g, self.b)

    def clear(self, color=None):
        self.d.rectangle([0, 0, LCD_W, LCD_H], fill=(0, 0, 0))

    def drawFilledRectangle(self, x, y, w, h, flags=None, opacity=None):
        self.d.rectangle([x, y, x + w, y + h], fill=self._fill())

    def drawRectangle(self, x, y, w, h, flags=None, thickness=None):
        self.d.rectangle([x, y, x + w, y + h], outline=self._fill(),
                         width=thickness or 1)

    def drawLine(self, x1, y1, x2, y2, pattern=None, flags=None):
        self.d.line([x1, y1, x2, y2], fill=self._fill())

    def drawFilledCircle(self, x, y, radius, flags=None, opacity=None):
        self.d.ellipse([x - radius, y - radius, x + radius, y + radius],
                       fill=self._fill())

    def drawText(self, x, y, text, flags=None, inversColor=None):
        flags = flags or 0
        # resolve theme colour from flags
        col = self._fill()
        for k, v in THEME.items():
            g = vg.CONSTS.get(k)
            if g is not None and (flags & g) == g:
                col = v
        if (flags & vg.CONSTS.get('DBLSIZE', 0)) != 0:
            font = self.big
        else:
            font = self.small
        if (flags & vg.CONSTS.get('CENTER', 0)) != 0:
            bbox = self.d.textbbox((0, 0), text, font=font)
            x = x - (bbox[2] - bbox[0]) // 2
        self.d.text((x, y), text, fill=col, font=font)

    def save(self, name):
        self.img.save(os.path.join(OUT, name))
        print('saved', name)


def main():
    lcd = RasterLCD()
    lua, script, t = vg.make_runtime(lcd)

    # title screen
    for _ in range(20):
        script.run(None, None)
        t[0] += 1.0
    lcd.save('title.png')

    # start and play into the cube section using the verify AI
    script.run(vg.CONSTS['EVT_ENTER_LONG'], None)
    t[0] += 1.0
    script.run(vg.CONSTS['EVT_ENTER_BREAK'], None)
    t[0] += 1.0
    for _ in range(160):
        dead = bool(lua.eval('_game.dead'))
        if dead:
            script.run(None, None)
            t[0] += 1.0
            continue
        mode = int(lua.eval('_game.mode'))
        if mode == 0:
            grounded = bool(lua.eval('_game.grounded'))
            d, bt = lua.globals()._cube_threat()
            if bt == 2:
                jump = grounded and d < 85 and d > 35
            else:
                jump = grounded and d < 100 and d > 20
            script.run(vg.CONSTS['EVT_ENTER_LONG'] if jump else None, None)
        else:
            spikeD, ceilD, ceilBot = lua.globals()._ship_sense()
            py = float(lua.eval('_game.py'))
            vy = float(lua.eval('_game.vy'))
            if py < 130:
                script.run(vg.CONSTS['EVT_ENTER_BREAK'], None)
            elif spikeD < 110 and py + 30 > 240:
                script.run(vg.CONSTS['EVT_ENTER_LONG'], None)
            else:
                ades = -1.6 * (py - 195.0) - 0.5 * vy
                script.run(vg.CONSTS['EVT_ENTER_LONG'] if ades <= 0 else vg.CONSTS['EVT_ENTER_BREAK'], None)
        t[0] += 1.0
    lcd.save('cube.png')

    # teleport to the ship section (within the level)
    lua.execute('_game.camX = 250 * 32\n_game.mode = 1\n_game.py = 195\n_game.vy = 0\n_game.dead = false\n_game.state = 1')
    for _ in range(3):
        script.run(None, None)
        t[0] += 1.0
    lcd.save('ship.png')

    # complete screen
    lua.execute('_game.state = 2\n_game.attempts = 7\n_game.coins = 3\n_game.best = 100')
    script.run(None, None)
    t[0] += 1.0
    lcd.save('complete.png')


if __name__ == '__main__':
    main()
