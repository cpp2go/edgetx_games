# etx-match3

Match-3 puzzle game (消消乐) for EdgeTX / OpenTX color radios.

## How to Play

- **Move adjacent tiles** so that 3+ same-colored tiles line up (horizontal or vertical) to clear them.
- No pathfinding needed — just line up the colors.
- **4 in a line** → drops a bomb (clears a 3×3 area when matched).
- **5 in a line** → drops a color bomb (clears all tiles of one color).
- Clearing cascades (falling + refill) can chain, scoring combo points.

## Goal

Reach the **target score** within the **limited moves** to win. Out of moves → game over.

## Controls

| Input | Action |
|-------|--------|
| Touch tap | Select a tile, then tap an adjacent tile to swap |
| D-pad / PAGE | Move cursor |
| ENTER | Select / swap |
| SYS | Restart |

## Build

```sh
npm i
npm run build
```

Packaged runtime files:

- `_site/match3.lua` — widget
- `_site/SCRIPTS/Match3.lua` — standalone script
