# etx-mario — 超级玛丽 (Super Mario)

A side-scrolling platformer for EdgeTX / OpenTX color transmitters (480×320),
written in TypeScript and compiled to Lua.

## Gameplay

Run right with the stick, jump with ENTER / touch / MDL / TELE. Stomp
goombas, bump `?` blocks for coins, grab a mushroom to grow big (then you can
smash bricks), avoid pits and time, and reach the flag pole to clear the level.

- 3 lives; losing one shrinks you back if you were big
- score, coins, level timer, and best-score tracking
- mid-level checkpoint so you don't restart from the very beginning

## Controls

| Action        | Input                                      |
|---------------|--------------------------------------------|
| Move          | Stick horizontal (ail)                     |
| Jump          | ENTER / touch / MDL / TELE (hold = higher) |
| Start/retry   | ENTER / touch / MDL / TELE                 |

The MDL and TELE keys work as jump buttons just like in the other games in
this collection (e.g. Tetris uses TELE to rotate, Racer uses TELE for nitro).
Press to jump; release early to cut the jump short.

## Building

```
make            # -> _site/SCRIPTS/Mario.lua + _site/mario.lua (widget)
```

or from the repo root:

```
powershell -ExecutionPolicy Bypass -File .\build-all.ps1
```

## Verifying

Requires Python + `lupa`. Runs the compiled Lua against a mock EdgeTX API and
checks the level is beatable plus the power-up / game-over paths:

```
python tools/verify-game.py
```

## Deploy

| SD card path                  | Source                          |
|-------------------------------|---------------------------------|
| `/GAMES/mario/mario.lua`      | `_site/mario.lua`               |
| `/GAMES/mario/SCRIPTS/Mario.lua` | `_site/SCRIPTS/Mario.lua`    |

Both files are required — the widget loads the standalone script at runtime.
