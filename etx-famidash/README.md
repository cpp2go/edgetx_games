# etx-famidash — Famidash (Geometry Dash for EdgeTX / OpenTX)

A Geometry Dash-style auto-runner for EdgeTX / OpenTX color transmitters
(480×320), written in TypeScript and compiled to Lua. Inspired by
[Famidash](https://github.com/tfdsoft/famidash) (the NES demake of
Geometry Dash).

## Gameplay

Your cube runs right on its own. Tap to jump — clear spikes, ride the rhythm,
bounce, then switch to the ship and thread a corridor. One hit and you
explode and restart from the beginning (or your practice checkpoint).

- **Cube mode** — jump over spikes, tall spike-blocks and blocks
- **Ship mode** — hold to thrust up, release to descend through the corridor
- **Practice mode** — place checkpoints with a touch, respawn there
- **Progress %** and **attempts** tracking, best-score, secret coins to grab

## Controls

| Action             | Input                                        |
|--------------------|----------------------------------------------|
| Jump / thrust      | ENTER / touch / MDL / TELE (hold in ship)    |
| Practice mode      | PLUS                                          |
| Place checkpoint   | touch (while in practice)                     |
| Start / menu       | ENTER / touch / MDL / TELE                    |

Jump is buffered (press slightly before landing) like in Geometry Dash.

## Building

```
make            # -> _site/SCRIPTS/Famidash.lua + _site/famidash.lua (widget)
```

or from the repo root:

```
powershell -ExecutionPolicy Bypass -File .\build-all.ps1
```

## Verifying

Requires Python + `lupa` (+ `Pillow` for the optional render tool). Runs the
compiled Lua against a mock EdgeTX API:

- an AI player clears the whole level (both cube and ship sections),
- death/respawn and practice checkpoints work,
- MDL / TELE keys jump.

```
python tools/verify-game.py
python tools/render.py        # writes PNG snapshots to tools/_render/
```

## Deploy

| SD card path                        | Source                              |
|-------------------------------------|-------------------------------------|
| `/GAMES/famidash/famidash.lua`      | `_site/famidash.lua`                |
| `/GAMES/famidash/SCRIPTS/Famidash.lua` | `_site/SCRIPTS/Famidash.lua`     |

Both files are required — the widget loads the standalone script at runtime.
