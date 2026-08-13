# EdgeTX Games

[![简体中文](https://img.shields.io/badge/%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-%E4%B8%AD%E6%96%87%E7%89%88-blue)](README_zh.md)

A collection of arcade games for EdgeTX / OpenTX transmitters with a color display.

## Download

All games are pre-packaged (scripts + images + sounds):

[📦 Download GAMES.zip (v1.0)](https://github.com/cpp2go/edgetx_games/releases/download/v1.0/GAMES.zip)

After unzipping, copy each game's folder into `/GAMES/<name>/` on the radio's SD card (see install steps below).

## Games

| Folder | Game | Description |
|--------|------|-------------|
| `etx-agar` | **Agar** | Simplified agar.io — your blob eats smaller blobs to grow |
| `etx-asteroids` | **Asteroids** | Classic arcade Asteroids |
| `etx-bomber` | **Bomberman** | Bomberman: place timed bombs, cross-shaped flames, brick-dropped power-ups |
| `etx-breakout` | **Breakout** | Brick-breaking game with multiple levels and increasing difficulty |
| `etx-famidash` | **Famidash 几何冲刺** | Geometry Dash-style auto-runner: tap to jump spikes, ride blocks, then fly the ship through a corridor |
| `etx-galuaxian` | **GaLuaxian** | Galaga-style space shooter (TypeScript-built, with widget + sounds) |
| `etx-jumpjump` | **Jump Jump** | Isometric 3D jump game with images, animations, SFX & music |
| `etx-link` | **Link** | Tile-matching puzzle game (LianLianKan / Mahjong Connect style) |
| `etx-mario` | **Super Mario 超级玛丽** | Side-scrolling platformer: run & jump, stomp goombas, break bricks, grab the flag |
| `etx-match3` | **Match3** | Match-3 puzzle: swap tiles to line up 3+ same colors, with bomb specials |
| `etx-mines` | **Minesweeper** | Classic Minesweeper with 3 difficulties, flag mode and per-difficulty best times |
| `etx-racer` | **Racer** | Arcade lane racer |
| `etx-snake` | **Snake** | Classic Snake |
| `etx-sudoku` | **Sudoku** | Classic 9×9 Sudoku with 3 difficulties, touch number pad + hints |
| `etx-tetris` | **Tetris** | Classic Tetris |
| `etx-vampire` | **Vampire** | Vampire Survivors-style survival: auto-attack, endless waves, level-up power picks |

## Supported Transmitters

All games require a **color display** running EdgeTX or OpenTX. Tested on:

- Radiomaster TX16S / TX16S MAX (480×320)
- Jumper T16 / T18 (480×320)
- Any EdgeTX-compatible radio with a 480×320 color display

Black-and-white / grayscale screens are **not supported**.

## Installation

Each game deploys into its own folder `/GAMES/<name>/` on the SD card, and can be run as a **full-screen widget** on the main screen, or as a **standalone script** from the SYS menu.

### As a Widget

Copy the game folder to the transmitter's SD card:

| SD card path | Source file |
|---|---|
| `/GAMES/<name>/<name>.lua` | `etx-<name>/_site/<name>.lua` |
| `/GAMES/<name>/SCRIPTS/<Name>.lua` | `etx-<name>/_site/SCRIPTS/<Name>.lua` |
| `/GAMES/<name>/IMAGES/*.png` | `etx-<name>/_site/IMAGES/*.png` |
| `/GAMES/SOUNDS/<name>/*.wav` | `etx-<name>/_site/SOUNDS/<name>/*.wav` |

The widget loads the standalone script at runtime, so **both Lua files are required**.

Example for Breakout:

```
SD card:
  GAMES/
    breakout/
      breakout.lua          ← _site/breakout.lua
      SCRIPTS/
        Breakout.lua        ← _site/SCRIPTS/Breakout.lua
      IMAGES/               ← _site/IMAGES/ (if any)
    SOUNDS/
      breakout/             ← _site/SOUNDS/breakout/
```

Then on the transmitter: long-press main screen → **Edit** → **Add Widget** → select the game.

### As a Standalone Script

Copy only the script file:

| SD card path | Source file |
|---|---|
| `/GAMES/<name>/SCRIPTS/<Name>.lua` | `etx-<name>/_site/SCRIPTS/<Name>.lua` |

Then: **SYS** → **Scripts** → select the game.

## Donate

If these games are helpful to you, feel free to buy me a coffee ☕

![WeChat donate QR](docs/donate.png)



