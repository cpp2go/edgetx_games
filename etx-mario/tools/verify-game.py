"""Verify the etx-mario game by running the compiled Lua against a mock EdgeTX
API. Checks:
  1. The game boots and renders hundreds of frames without crashing.
  2. A scripted AI player (reading the level grid) can actually reach the flag
     and trigger LEVEL CLEAR — proving the level is beatable.
  3. Bumping a ? block spawns a mushroom and collecting it grows the player.
  4. Losing all lives reaches GAME OVER, and ENTER restarts.

Run from the etx-mario directory:
    python tools/verify-game.py
"""
import sys
from lupa import LuaRuntime

LCD_W, LCD_H = 480, 320
TS = 40
PH = 30  # small player height
SOLID = set("GB?MUP")


class MockLCD:
    def RGB(self, r, g, b):
        return (r << 16) | (g << 8) | b

    def _any(self, *a):
        pass

    drawFilledRectangle = _any
    drawRectangle = _any
    drawLine = _any
    drawText = _any
    drawFilledCircle = _any
    clear = _any


CONSTS = {
    "BLINK": 1, "SOLID": 0, "CENTER": 1, "RIGHT": 2, "VCENTER": 4,
    "SMLSIZE": 8, "DBLSIZE": 16, "COLOR_THEME_PRIMARY1": 0x10000,
    "COLOR_THEME_SECONDARY1": 0x20000,
    "EVT_EXIT_BREAK": 1, "EVT_VIRTUAL_EXIT": 2, "EVT_SYS_BREAK": 3,
    "EVT_ENTER_BREAK": 4, "EVT_VIRTUAL_ENTER": 5,
    "EVT_ENTER_LONG": 6, "EVT_VIRTUAL_ENTER_LONG": 7,
    "EVT_TOUCH_FIRST": 8, "EVT_TOUCH_SLIDE": 9, "EVT_TOUCH_TAP": 10,
    "EVT_TOUCH_BREAK": 11,
    # MDL / TELE keys act as jump buttons on Mario (same as other games use
    # these keys as action keys, e.g. Tetris rotate, Racer nitro).
    "EVT_MODEL_FIRST": 20, "EVT_MODEL_BREAK": 21,
    "EVT_TELEM_FIRST": 22, "EVT_TELEM_BREAK": 23,
}

STICK = [0.0]


def make_runtime():
    lua = LuaRuntime(unpack_returned_tuples=True)
    lcd = MockLCD()
    t = [0.0]

    def getValue(name):
        return STICK[0] * 1024 if name == "ail" else 0.0

    def getTime():
        return t[0]

    def playTone(*a):
        pass

    def flushAudio():
        pass

    lua.globals().LCD_W = LCD_W
    lua.globals().LCD_H = LCD_H
    for k, v in CONSTS.items():
        lua.globals()[k] = v
    lua.globals().lcd = lcd
    lua.globals().getValue = getValue
    lua.globals().getTime = getTime
    lua.globals().playTone = playTone
    lua.globals().flushAudio = flushAudio
    # Lua 5.5 (lupa) dropped bit32; the game targets Lua 5.2 (EdgeTX) which has it.
    lua.execute(
        "bit32 = {}\n"
        "function bit32.band(a,b) return a & b end\n"
        "function bit32.bor(a,b) return a | b end\n"
        "function bit32.bxor(a,b) return a ~ b end\n"
        "function bit32.bnot(a) return ~a end\n"
        "function bit32.lshift(a,n) return a << n end\n"
        "function bit32.rshift(a,n) return a >> n end\n"
    )
    with open("src/mario.lua", "r", encoding="utf-8") as f:
        code = f.read()
    script = lua.execute(code)
    script.init(LCD_W, LCD_H)
    lua.globals()._init_fn = script.init
    lua.execute(
        "function _grab_game()\n"
        "  local n2, v2 = debug.getupvalue(_init_fn, 2)\n"
        "  local n3, v3 = debug.getupvalue(_init_fn, 3)\n"
        "  if type(v2) == 'table' then return v2 end\n"
        "  if type(v3) == 'table' then return v3 end\n"
        "  return nil\n"
        "end"
    )
    game = lua.globals()._grab_game()
    lua.globals()._game = game
    lua.execute(
        "function _tile(c, r)\n"
        "  local lv = _game.level\n"
        "  if r < 0 or r >= #lv then return ' ' end\n"
        "  local row = lv[r + 1]\n"
        "  if c < 0 or c >= #row then return ' ' end\n"
        "  return row:sub(c + 1, c + 1)\n"
        "end\n"
        "function _enemy_ahead(px, look)\n"
        "  local gs = _game.goombas\n"
        "  if not gs then return false end\n"
        "  for i = 1, #gs do\n"
        "    local g = gs[i]\n"
        "    if g.alive and g.squashed == 0 then\n"
        "      if g.x - px < look and g.x - px > 0 then return true end\n"
        "    end\n"
        "  end\n"
        "  return false\n"
        "end"
    )
    return lua, script, game, t


def grid_at(lua, c, r):
    return str(lua.globals()._tile(c, r))


def enemy_ahead(lua, px, look):
    return bool(lua.globals()._enemy_ahead(px, look))


def run_frames(script, t, n):
    for _ in range(n):
        script.run(None, None)
        t[0] += 1.0


def test_boot():
    lua, script, game, t = make_runtime()
    for _ in range(120):  # title screen
        script.run(None, None)
        t[0] += 1.0
    script.run(CONSTS["EVT_ENTER_BREAK"], None)
    t[0] += 1.0
    for _ in range(300):
        script.run(None, None)
        t[0] += 1.0
    print("  [1] boot + 400 frames OK")
    return lua, script, game, t


def test_ai_clears():
    lua, script, game, t = test_boot()
    STICK[0] = 1.0
    jumping = 0
    max_col = 0
    cleared = False
    for i in range(8000):
        st = int(lua.eval("_game.state"))
        if st == 2:
            cleared = True
            score = int(lua.eval("_game.score"))
            print(f"  [2] AI reached LEVEL CLEAR at frame {i}, col {int(lua.eval('_game.px')) // TS}, score={score}")
            break
        if st == 3:
            print(f"  [2] FAIL: GAME OVER at frame {i}, col {int(lua.eval('_game.px')) // TS}")
            return False

        col = int(lua.eval("_game.px")) // TS
        max_col = max(max_col, col)
        if bool(lua.eval("_game.dead")):
            script.run(None, None)
            t[0] += 1.0
            continue

        py = float(lua.eval("_game.py"))
        foot_row = int((py + PH) // TS)
        body_row = int((py + 10) // TS)
        head_row = int((py - 4) // TS)
        ahead_pit = False
        ahead_wall = False
        for d in (1, 2, 3):
            c = col + d
            if grid_at(lua, c, foot_row) == ' ' and grid_at(lua, c, foot_row + 1) == ' ':
                ahead_pit = True
            if grid_at(lua, c, body_row) in SOLID and grid_at(lua, c, head_row) in SOLID:
                ahead_wall = True
        ahead_enemy = enemy_ahead(lua, float(lua.eval("_game.px")), TS * 2.5)
        on_ground = bool(lua.eval("_game.onGround"))

        if jumping > 0:
            jumping -= 1
            if jumping == 0:
                script.run(CONSTS["EVT_ENTER_BREAK"], None)
        elif (ahead_pit or ahead_wall or ahead_enemy) and on_ground:
            script.run(CONSTS["EVT_ENTER_LONG"], None)
            jumping = 30

        script.run(None, None)
        t[0] += 1.0

    if not cleared:
        print(f"  [2] FAIL: AI stuck at col {max_col}")
        return False
    return True


def test_powerup():
    lua, script, game, t = make_runtime()
    script.run(CONSTS["EVT_ENTER_BREAK"], None)
    t[0] += 1.0
    lua.execute(
        "_game.px = 305\n"
        "_game.py = 210\n"
        "_game.pvx = 0\n"
        "_game.pvy = 0\n"
        "_game.onGround = true\n"
        "_game.dead = false\n"
    )
    script.run(CONSTS["EVT_ENTER_LONG"], None)  # real jump into the ? block
    run_frames(script, t, 40)
    script.run(CONSTS["EVT_ENTER_BREAK"], None)
    run_frames(script, t, 20)
    nitems = int(lua.eval("#_game.items"))
    if nitems < 1:
        print("  [3] FAIL: mushroom did not spawn")
        return False
    lua.execute(
        "_game.items[1].x = _game.px + 40\n"
        "_game.items[1].y = _game.py + 40\n"
        "_game.items[1].t = 0.5\n"
    )
    run_frames(script, t, 30)
    big = bool(lua.eval("_game.big"))
    ph = int(lua.eval("_game.ph"))
    if not big or ph != 56:
        print(f"  [3] FAIL: big={big} ph={ph}")
        return False
    print("  [3] mushroom grows the player (ph=56, +1000) OK")
    return True


def test_gameover():
    lua, script, game, t = make_runtime()
    script.run(CONSTS["EVT_ENTER_BREAK"], None)
    t[0] += 1.0
    lua.execute("_game.lives = 1\n_game.state = 1\n_game.dead = false")
    for _ in range(3):
        lua.execute("_game.py = 1000\n_game.px = 200\n_game.pvy = 0\n_game.dead = false\n_game.state = 1")
        run_frames(script, t, 40)
    if int(lua.eval("_game.state")) != 3:
        print("  [4] FAIL: did not reach GAME OVER")
        return False
    script.run(CONSTS["EVT_ENTER_BREAK"], None)
    t[0] += 1.0
    if int(lua.eval("_game.state")) != 1:
        print("  [4] FAIL: ENTER did not restart")
        return False
    print("  [4] GAME OVER -> ENTER restart OK")
    return True


def test_model_tele_jump():
    """MDL / TELE keys must jump the player (like other games use these keys
    as action keys, e.g. Tetris rotate, Racer nitro, Snake turn). We plant
    Mario on the ground, press MDL, check he starts moving up; then do the
    same for TELE."""
    lua, script, game, t = make_runtime()
    script.run(CONSTS["EVT_ENTER_BREAK"], None)  # start the game
    t[0] += 1.0
    lua.execute(
        "_game.px = 200\n"
        "_game.py = 210\n"
        "_game.pvx = 0\n"
        "_game.pvy = 0\n"
        "_game.onGround = true\n"
        "_game.dead = false\n"
        "_game.state = 1\n"
    )

    # MDL press -> jump (upward velocity)
    script.run(CONSTS["EVT_MODEL_FIRST"], None)
    pvy_mdl = float(lua.eval("_game.pvy"))
    if pvy_mdl >= 0:
        print(f"  [5] FAIL: MDL did not jump (pvy={pvy_mdl})")
        return False
    run_frames(script, t, 10)
    py_mid = float(lua.eval("_game.py"))
    script.run(CONSTS["EVT_MODEL_BREAK"], None)  # release -> variable-jump cut
    run_frames(script, t, 5)
    py_after = float(lua.eval("_game.py"))
    if py_after >= py_mid:
        print("  [5] FAIL: Mario did not rise during MDL jump")
        return False

    # TELE press -> jump (plant back on the ground)
    lua.execute("_game.py = 210\n_game.pvy = 0\n_game.onGround = true")
    script.run(CONSTS["EVT_TELEM_FIRST"], None)
    pvy_tele = float(lua.eval("_game.pvy"))
    if pvy_tele >= 0:
        print(f"  [5] FAIL: TELE did not jump (pvy={pvy_tele})")
        return False
    script.run(CONSTS["EVT_TELEM_BREAK"], None)
    print("  [5] MDL / TELE keys jump the player OK")
    return True


def main():
    ok = True
    ok = test_ai_clears() and ok
    ok = test_powerup() and ok
    ok = test_gameover() and ok
    ok = test_model_tele_jump() and ok
    if ok:
        print("ALL VERIFY CHECKS PASSED")
    else:
        print("VERIFY FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
