"""Smoke-test the built vampire.lua rendering with a mock LCD.

Runs the real compiled Lua (src/vampire.lua) through init()/run() for enough
frames to cross the theme boundary at t=45s, exercising the new tiled
drawBitmap background + theme-shift flash without crashing.
"""
import sys

import lupa
from lupa import LuaRuntime

lua = LuaRuntime(unpack_returned_tuples=True)

# ---- bit32 shim (lupa Lua 5.5 has no bit32) ----
lua.execute("""
bit32 = bit32 or {}
if not bit32.band then
  local floor = math.floor
  bit32 = {
    band = function(a,b) return a & b end,
    bor  = function(a,b) return a | b end,
    bxor = function(a,b) return a ~ b end,
    bnot = function(a) return ~a end,
    lshift = function(a,n) return a << n end,
    rshift = function(a,n) return a >> n end,
  }
end
""")

# ---- mock EdgeTX globals ----
state = {"now": 0, "tiles": 0, "bitmaps": 0, "lines": 0, "texts": 0}


def _lcd_rgb(r, g, b):
    return (int(r) << 16) | (int(g) << 8) | int(b)


lcd = {}
for name in ("drawFilledRectangle", "drawFilledCircle", "drawRectangle",
             "drawCircle", "drawLine", "drawPoint", "drawBitmap",
             "drawText", "drawFilledTriangle", "drawPixmap", "clear",
             "setColor", "setBgColor", "drawGauge", "invertRect",
             "drawScreenTitle"):
    lcd[name] = lambda *a, **k: None
lcd["RGB"] = _lcd_rgb

# drawBitmap actually counts calls so we can assert the tiling path ran
def _drawBitmap(bmp, x, y, scale, *_):
    state["bitmaps"] += 1


lcd["drawBitmap"] = _drawBitmap
lcd["drawLine"] = lambda *a, **k: state.__setitem__("lines", state["lines"] + 1)
lcd["drawText"] = lambda *a, **k: state.__setitem__("texts", state["texts"] + 1)
lua.globals().lcd = lcd
lua.globals().SOLID = 0
lua.globals().DOTTED = 1
lua.globals().LCD_W = 480
lua.globals().LCD_H = 320
# EdgeTX text-flag / theme-color constants used by the compiled Lua
for name, val in {
    "SMLSIZE": 0x01, "DBLSIZE": 0x02, "MIDSIZE": 0x04, "XXLSIZE": 0x08,
    "CENTER": 0x80, "RIGHT": 0x40, "VCENTER": 0x20, "INVERS": 0x10,
    "BLINK": 0x200,
    "COLOR_THEME_PRIMARY1": 0xFF00FF, "COLOR_THEME_SECONDARY1": 0x00FFFF,
    "COLOR_THEME_PRIMARY2": 0xFF00FF, "COLOR_THEME_SECONDARY2": 0x00FFFF,
    "COLOR_THEME_PRIMARY3": 0xFF00FF, "COLOR_THEME_FOCUSED": 0xFF00FF,
}.items():
    lua.globals()[name] = val
lua.globals().getTime = lambda: state["now"]
lua.globals().getValue = lambda *a: 0.0
lua.globals().playTone = lambda *a: None
lua.globals().playFile = lambda *a: None
lua.globals().flushAudio = lambda *a: None
lua.globals().fstat = lambda *a: None
lua.globals().Bitmap = {"open": lambda *a: {"w": 256, "h": 256},
                        "getSize": lambda b: (b["w"], b["h"])}
for name in ("EVT_ENTER_FIRST", "EVT_ENTER_BREAK", "EVT_PLUS_FIRST",
             "EVT_MINUS_FIRST", "EVT_MODEL_FIRST", "EVT_MODEL_BREAK",
             "EVT_TELEM_FIRST", "EVT_TELEM_BREAK", "EVT_EXIT_BREAK",
             "EVT_EXIT_FIRST", "EVT_TOUCH_FIRST", "EVT_TOUCH_SLIDE",
             "EVT_ROT_LEFT", "EVT_ROT_RIGHT", "EVT_PAGE_FIRST",
             "EVT_PAGE_BREAK", "EVT_PAGE_LONG"):
    lua.globals()[name] = 1

lua.globals().math.randomseed(7)

# ---- load the built script ----
with open("src/vampire.lua", encoding="utf-8") as f:
    src = f.read()
mod = lua.execute(src)
assert mod and mod.init and mod.run, "vampire.lua did not return {init, run}"

mod.init(480, 320)
# a few idle frames to settle
for _ in range(5):
    state["now"] += 8  # 0.08s per frame
    mod.run(None, None)

before = state["bitmaps"]
print(f"background frames settled; drawBitmap calls so far: {before}")

# advance to t=50s (crosses theme boundary at 45s)
frames = 0
while state["now"] / 100 < 50.0 and frames < 2000:
    state["now"] += 8  # dt capped at 0.08 -> ~8 centis per frame
    mod.run(None, None)
    frames += 1

after = state["bitmaps"]
print(f"advanced {frames} frames to t={state['now']/100:.1f}s "
      f"(theme switched at 45s)")
print(f"total drawBitmap calls: {after} (tiled background path exercised: {after > before})")

# also verify the game object survived (still returns 0 and no crash)
rc = mod.run(None, None)
print(f"final run() returned {rc}")
print("SMOKE OK" if after > before and rc == 0 else "SMOKE FAIL")
