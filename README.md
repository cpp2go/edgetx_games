# EdgeTX Games

A collection of arcade games for EdgeTX / OpenTX transmitters with a color display.

## Games

| Folder | Game | Description |
|--------|------|-------------|
| `etx-agar` | **Agar** | Simplified agar.io — your blob eats smaller blobs to grow |
| `etx-asteroids` | **Asteroids** | Classic arcade Asteroids |
| `etx-breakout` | **Breakout** | Brick-breaking game with multiple levels and increasing difficulty |
| `etx-galuaxian` | **GaLuaxian** | Galaga-style space shooter (standalone script, no widget) |
| `etx-link` | **Link** | Tile-matching puzzle game (LianLianKan / Mahjong Connect style) |
| `etx-racer` | **Racer** | Arcade lane racer |
| `etx-snake` | **Snake** | Classic Snake |
| `etx-tetris` | **Tetris** | Classic Tetris |

## Supported Transmitters

All games require a **color display** running EdgeTX or OpenTX. Tested on:

- Radiomaster TX16S / TX16S MAX (480×320)
- Jumper T16 / T18 (480×320)
- Any EdgeTX-compatible radio with a 480×320 color display

Black-and-white / grayscale screens are **not supported**.

## Installation

Each game can be run as a **full-screen widget** on the main screen, or as a **standalone script** from the SYS menu.

### As a Widget

Copy three files to the transmitter's SD card:

| SD card path | Source file |
|---|---|
| `/SCRIPTS/GAMES/IMAGES/*.png` | `etx-<name>/_site/IMAGES/<name>.lua` |
| `/SCRIPTS/GAMES/SCRIPTS/*.lua` | `etx-<name>/_site/SCRIPTS/<name>.lua` |
| `/SCRIPTS/GAMES/<Name>.lua` | `etx-<name>/_site/SCRIPTS/<Name>.lua` |

The widget loads the standalone script at runtime, so **both files are required**.

Example for Breakout:

```
SD card:
  SCRIPTS/
    GAMES/
      SCRIPTS/
        main.lua          ← _site/breakout.lua
  SCRIPTS/
    GAMES/
      Breakout.lua      ← _site/SCRIPTS/Breakout.lua
```

Then on the transmitter: long-press main screen → **Edit** → **Add Widget** → select the game.

### As a Standalone Script

Copy only the script file:

| SD card path | Source file |
|---|---|
| `/SCRIPTS/GAMES/<Name>.lua` | `etx-<name>/_site/SCRIPTS/<Name>.lua` |

Then: **SYS** → **Scripts** → select the game.


