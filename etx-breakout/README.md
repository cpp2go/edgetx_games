# etx-breakout

Arcade Breakout game for EdgeTX/OpenTX.

## Controls

- Aileron stick (left/right): move paddle
- Touch slide: move paddle
- Touch tap or TELEM: launch ball
- MODEL: pause/resume
- SYS: start/restart

## Build

- `npm i`
- `npm run build`

Packaged runtime files:

- `_site/breakout.lua`
- `_site/SCRIPTS/Breakout.lua`
- `_site/IMAGES/`
- `_site/SOUNDS/`

## Sounds

The game plays WAV sound effects from a `SOUNDS` folder (with tone fallback if missing):
`move` (paddle), `launch`, `bounce` (paddle/wall), `brick` (break), `brickhit` (hard brick),
`level` (next level / win), `lose` (ball lost).

Copy `_site/SOUNDS/` to the SD card so the game finds them (e.g. `/SCRIPTS/SOUNDS/` when
`Breakout.lua` is at `/SCRIPTS/Breakout.lua`).
