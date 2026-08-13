"""Verify the etx-famidash game by running the compiled Lua against a mock
EdgeTX API. Checks:
  1. The game boots and renders frames without crashing.
  2. A scripted AI player can clear the whole level (LEVEL COMPLETE),
     proving the level is beatable in both cube and ship sections.
  3. Dying increments attempts and respawns the player.
  4. Practice mode: a checkpoint can be placed and respawn uses it.

Run from the etx-famidash directory:
    python tools/verify-game.py
"""
import sys
from lupa import LuaRuntime

LCD_W, LCD_H = 480, 320
TS = 32
CS = 30
GROUND_Y = LCD_H - 48
CUBE_X = 96
SPEED = 300


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
    "SMLSIZE": 8, "DBLSIZE": 16,
    "COLOR_THEME_PRIMARY1": 0x10000,
    "COLOR_THEME_PRIMARY2": 0x20000,
    "COLOR_THEME_SECONDARY1": 0x30000,
    "COLOR_THEME_WARNING": 0x40000,
    "EVT_EXIT_BREAK": 1, "EVT_VIRTUAL_EXIT": 2, "EVT_SYS_BREAK": 3,
    "EVT_ENTER_BREAK": 4, "EVT_VIRTUAL_ENTER": 5,
    "EVT_ENTER_LONG": 6, "EVT_VIRTUAL_ENTER_LONG": 7,
    "EVT_TOUCH_FIRST": 8, "EVT_TOUCH_SLIDE": 9, "EVT_TOUCH_TAP": 10,
    "EVT_TOUCH_BREAK": 11,
    "EVT_PLUS_FIRST": 12, "EVT_MINUS_FIRST": 13,
    # MDL / TELE keys act as jump buttons (same as the other games).
    "EVT_MODEL_FIRST": 20, "EVT_MODEL_BREAK": 21,
    "EVT_TELEM_FIRST": 22, "EVT_TELEM_BREAK": 23,
}


def make_runtime(lcd=None):
    lua = LuaRuntime(unpack_returned_tuples=True)
    if lcd is None:
        lcd = MockLCD()
    t = [0.0]

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
    lua.globals().getTime = getTime
    lua.globals().playTone = playTone
    lua.globals().flushAudio = flushAudio
    lua.execute(
        "bit32 = {}\n"
        "function bit32.band(a,b) return a & b end\n"
        "function bit32.bor(a,b) return a | b end\n"
        "function bit32.bxor(a,b) return a ~ b end\n"
        "function bit32.bnot(a) return ~a end\n"
        "function bit32.lshift(a,n) return a << n end\n"
        "function bit32.rshift(a,n) return a >> n end\n"
    )
    with open("src/famidash.lua", "r", encoding="utf-8") as f:
        code = f.read()
    script = lua.execute(code)
    script.init(LCD_W, LCD_H)
    lua.globals()._init_fn = script.init
    lua.execute(
        "function _grab_game()\n"
        "  for i = 1, 5 do\n"
        "    local n, v = debug.getupvalue(_init_fn, i)\n"
        "    if type(v) == 'table' then return v end\n"
        "    if not n then break end\n"
        "  end\n"
        "  return nil\n"
        "end"
    )
    game = lua.globals()._grab_game()
    lua.globals()._game = game

    # Cube-mode sensing: distance + type of the nearest obstacle that must
    # be jumped over. 0 = ground spike (wide timing window), 2 = spike-block
    # (needs a later, taller jump).
    lua.execute(
        "function _cube_threat()\n"
        "  local px = _game.camX + 96\n"
        "  local best = 99999\n"
        "  local bt = 0\n"
        "  local objs = _game.objects\n"
        "  for i = 1, #objs do\n"
        "    local o = objs[i]\n"
        "    if o.t == 0 or o.t == 2 then\n"
        "      local front = o.x + 0.22*32\n"
        "      local d = front - px\n"
        "      if d > -60 and d < best then\n"
        "        best = d\n"
        "        bt = o.t\n"
        "      end\n"
        "    end\n"
        "  end\n"
        "  return best, bt\n"
        "end"
    )
    # Ship-mode sensing: distance to the next floor spike, distance to the
    # next hanging ceiling block, and that block's bottom edge.
    lua.execute(
        "function _ship_sense()\n"
        "  local px = _game.camX + 96\n"
        "  local spikeD = 99999\n"
        "  local ceilD = 99999\n"
        "  local ceilBot = 0\n"
        "  local objs = _game.objects\n"
        "  for i = 1, #objs do\n"
        "    local o = objs[i]\n"
        "    local d = o.x - px\n"
        "    if o.t == 0 and d > -40 and d < spikeD then\n"
        "      spikeD = d\n"
        "    elseif o.t == 8 and d > -40 and d < ceilD then\n"
        "      ceilD = d\n"
        "      ceilBot = o.y + o.hh\n"
        "    end\n"
        "  end\n"
        "  return spikeD, ceilD, ceilBot\n"
        "end"
    )
    return lua, script, t


def start_game(script, t):
    # run some title frames then confirm to start
    for _ in range(30):
        script.run(None, None)
        t[0] += 1.0
    script.run(CONSTS["EVT_ENTER_LONG"], None)
    t[0] += 1.0
    script.run(CONSTS["EVT_ENTER_BREAK"], None)
    t[0] += 1.0


def test_boot():
    lua, script, t = make_runtime()
    for _ in range(400):
        script.run(None, None)
        t[0] += 1.0
    print("  [1] boot + 400 frames OK")
    return lua, script, t


def play_ai(lua, script, t, max_frames=9000):
    """Drive the AI until LEVEL COMPLETE (state 2). Returns True on success."""
    start_game(script, t)
    for i in range(max_frames):
        st = int(lua.eval("_game.state"))
        if st == 2:
            return True, i
        if int(lua.eval("_game.dead")):
            # death animation runs inside the game; just keep stepping
            script.run(None, None)
            t[0] += 1.0
            continue
        mode = int(lua.eval("_game.mode"))
        if mode == 0:
            grounded = bool(lua.eval("_game.grounded"))
            d, bt = lua.globals()._cube_threat()
            if bt == 2:
                jump = grounded and d < 85 and d > 35
            else:
                jump = grounded and d < 100 and d > 20
            if jump:
                script.run(CONSTS["EVT_ENTER_LONG"], None)
            else:
                script.run(None, None)
        else:
            # ship: PD-style controller. Hover the ship top around y=195
            # (safe band roughly 162..222 between the ceiling blocks and the
            # floor spikes). Thrust when too low or falling, release when
            # too high or climbing; damp the velocity to stop oscillation.
            spikeD, ceilD, ceilBot = lua.globals()._ship_sense()
            py = float(lua.eval("_game.py"))
            vy = float(lua.eval("_game.vy"))
            if py < 130:
                script.run(CONSTS["EVT_ENTER_BREAK"], None)
            elif spikeD < 110 and py + 30 > 240:
                script.run(CONSTS["EVT_ENTER_LONG"], None)
            else:
                target = 195.0
                kp = 1.6
                kd = 0.5
                ades = -kp * (py - target) - kd * vy
                if ades <= 0:
                    script.run(CONSTS["EVT_ENTER_LONG"], None)
                else:
                    script.run(CONSTS["EVT_ENTER_BREAK"], None)
        t[0] += 1.0
    return False, max_frames


def test_ai_clears():
    lua, script, t = test_boot()
    ok, frames = play_ai(lua, script, t)
    if ok:
        att = int(lua.eval("_game.attempts"))
        coins = int(lua.eval("_game.coins"))
        print(f"  [2] AI cleared the level at frame {frames}, attempts={att}, coins={coins}")
        return True
    else:
        pct = int(lua.eval("_game.camX")) / int(lua.eval("_game.levelLen")) * 100
        att = int(lua.eval("_game.attempts"))
        print(f"  [2] FAIL: AI stuck (progress ~{pct:.0f}%, attempts={att})")
        return False


def test_death_respawn():
    lua, script, t = make_runtime()
    start_game(script, t)
    a0 = int(lua.eval("_game.attempts"))
    # force a death by dropping the player far below ground
    lua.execute("_game.py = 500\n_game.vy = 0\n_game.mode = 0\n_game.dead = false")
    for _ in range(200):
        script.run(None, None)
        t[0] += 1.0
        if int(lua.eval("_game.attempts")) > a0 and not int(lua.eval("_game.dead")):
            break
    a1 = int(lua.eval("_game.attempts"))
    if a1 <= a0:
        print(f"  [3] FAIL: attempts did not increment ({a0} -> {a1})")
        return False
    print("  [3] death respawn increments attempts OK")
    return True


def test_practice():
    lua, script, t = make_runtime()
    start_game(script, t)
    # advance a bit
    for _ in range(300):
        script.run(None, None)
        t[0] += 1.0
    lua.execute("_game.py = 500\n_game.vy = 0\n_game.mode = 0\n_game.dead = false")
    # toggle practice mode via PLUS
    script.run(CONSTS["EVT_PLUS_FIRST"], None)
    t[0] += 1.0
    if not bool(lua.eval("_game.practice")):
        print("  [4] FAIL: PLUS did not enable practice mode")
        return False
    # place a checkpoint
    script.run(CONSTS["EVT_TOUCH_TAP"], None)
    t[0] += 1.0
    ck = float(lua.eval("_game.ckX"))
    if ck <= 0:
        print("  [4] FAIL: touch tap did not place a checkpoint")
        return False
    # die (drop below ground)
    lua.execute("_game.py = 900\n_game.vy = 0\n_game.dead = false")
    for _ in range(200):
        script.run(None, None)
        t[0] += 1.0
        if not int(lua.eval("_game.dead")) and float(lua.eval("_game.camX")) > 0:
            break
    cam2 = float(lua.eval("_game.camX"))
    if cam2 < ck - 40 or cam2 > ck + 40:
        print(f"  [4] FAIL: respawn did not use checkpoint (ck={ck:.0f}, cam={cam2:.0f})")
        return False
    print("  [4] practice mode checkpoint respawn OK")
    return True


def test_mdl_tele_jump():
    """MDL / TELE keys must jump the cube (same mapping as the other games).
    We plant the player on the ground, press MDL, and check he rises."""
    lua, script, t = make_runtime()
    start_game(script, t)
    lua.execute("_game.py = 242\n_game.vy = 0\n_game.mode = 0\n_game.dead = false\n_game.grounded = true")
    script.run(CONSTS["EVT_MODEL_FIRST"], None)
    t[0] += 1.0
    pvy = float(lua.eval("_game.vy"))
    if pvy >= 0:
        print(f"  [5] FAIL: MDL did not jump (pvy={pvy})")
        return False
    script.run(CONSTS["EVT_MODEL_BREAK"], None)
    t[0] += 1.0
    # reset and try TELE
    lua.execute("_game.py = 242\n_game.vy = 0\n_game.grounded = true")
    script.run(CONSTS["EVT_TELEM_FIRST"], None)
    t[0] += 1.0
    pvy = float(lua.eval("_game.vy"))
    if pvy >= 0:
        print(f"  [5] FAIL: TELE did not jump (pvy={pvy})")
        return False
    script.run(CONSTS["EVT_TELEM_BREAK"], None)
    print("  [5] MDL / TELE keys jump the player OK")
    return True


if __name__ == "__main__":
    ok = True
    ok = test_ai_clears() and ok
    ok = test_death_respawn() and ok
    ok = test_practice() and ok
    ok = test_mdl_tele_jump() and ok
    if ok:
        print("ALL VERIFY CHECKS PASSED")
    else:
        print("VERIFY FAILED")
        sys.exit(1)
