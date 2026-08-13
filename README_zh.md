# EdgeTX Games 遥控器小游戏合集

[![English](https://img.shields.io/badge/English-English-blue)](README.md)

为 EdgeTX / OpenTX 彩色屏遥控器打造的一系列街机小游戏合集。

## 下载

打包好的全部游戏（脚本 + 图片 + 音效）：

[📦 下载 GAMES.zip（v1.0）](https://github.com/cpp2go/edgetx_games/releases/download/v1.0/GAMES.zip)

解压后，把每个游戏文件夹拷贝到遥控器 SD 卡的 `/GAMES/<游戏名>/` 即可（见下方安装说明）。

## 游戏列表

| 文件夹 | 游戏 | 说明 |
|--------|------|------|
| `etx-agar` | **Agar** | 大鱼吃小鱼，越吃越大 |
| `etx-asteroids` | **Asteroids** | 经典太空小行星射击 |
| `etx-bomber` | **Bomberman 炸弹人** | 放置定时炸弹，十字形火焰，砸砖掉落道具 |
| `etx-breakout` | **Breakout 打砖块** | 多关卡打砖块，难度递增 |
| `etx-famidash` | **Famidash 几何冲刺** | 几何冲刺式自动跑酷：点按跳刺、上平台，再驾驶飞船穿越通道 |
| `etx-galuaxian` | **GaLuaxian 太空射击** | Galaga 风格太空射击（带 widget 和音效） |
| `etx-jumpjump` | **Jump Jump 跳一跳** | 等距 3D 跳跃游戏，带图片、动画、音效和音乐 |
| `etx-link` | **Link 连连看** | 连连看 / 麻将连线消除 |
| `etx-mario` | **Super Mario 超级玛丽** | 横版平台跳跃：跑跳踩怪、顶砖吃金币蘑菇、夺旗过关 |
| `etx-match3` | **Match3 消消乐** | 三消游戏：交换方块连成 3 个以上同色，含炸弹道具 |
| `etx-mines` | **Minesweeper 扫雷** | 经典扫雷，3 种难度，支持标记旗子和各难度最佳时间 |
| `etx-racer` | **Racer 竞速赛车** | 街机风格车道赛车 |
| `etx-snake` | **Snake 贪吃蛇** | 经典贪吃蛇 |
| `etx-sudoku` | **Sudoku 数独** | 经典 9×9 数独，3 种难度，支持触屏数字键盘和提示 |
| `etx-tetris` | **Tetris 俄罗斯方块** | 经典俄罗斯方块 |
| `etx-vampire` | **Vampire 吸血鬼幸存者** | 吸血鬼幸存者风格：自动攻击、无尽波次、升级选强化 |

## 支持的遥控器

所有游戏都需要**彩色屏**，运行 EdgeTX 或 OpenTX。已在以下设备测试：

- Radiomaster TX16S / TX16S MAX (480×320)
- Jumper T16 / T18 (480×320)
- 任何支持 480×320 彩色屏的 EdgeTX 遥控器

黑白 / 灰度屏不支持。

## 安装

每个游戏部署在 SD 卡 `/GAMES/<游戏名>/` 自己的文件夹里，可以作为主屏**全屏 Widget** 运行，或从 SYS 菜单作为**独立脚本**运行。

### 作为 Widget 运行

把游戏文件夹拷贝到遥控器 SD 卡：

| SD 卡路径 | 源文件 |
|---|---|
| `/GAMES/<游戏名>/<游戏名>.lua` | `etx-<name>/_site/<name>.lua` |
| `/GAMES/<游戏名>/SCRIPTS/<Name>.lua` | `etx-<name>/_site/SCRIPTS/<Name>.lua` |
| `/GAMES/<游戏名>/IMAGES/*.png` | `etx-<name>/_site/IMAGES/*.png` |
| `/GAMES/SOUNDS/<游戏名>/*.wav` | `etx-<name>/_site/SOUNDS/<name>/*.wav` |

Widget 在运行时加载独立脚本，所以**两个 Lua 文件都需要**。

例如 Breakout（示例）:

```
SD 卡:
  GAMES/
    breakout/
      breakout.lua          ← _site/breakout.lua
      SCRIPTS/
        Breakout.lua        ← _site/SCRIPTS/Breakout.lua
      IMAGES/               ← _site/IMAGES/ (如有)
    SOUNDS/
      breakout/             ← _site/SOUNDS/breakout/
```

然后在遥控器上：长按主屏 → **Edit** → **Add Widget** → 选择游戏。

### 作为独立脚本运行

只拷贝脚本文件：

| SD 卡路径 | 源文件 |
|---|---|
| `/GAMES/<游戏名>/SCRIPTS/<Name>.lua` | `etx-<name>/_site/SCRIPTS/<Name>.lua` |

然后：**SYS** → **Scripts** → 选择游戏。

## 支持一下

如果这些游戏对你有帮助，欢迎扫码支持一下 ☕

![微信赞赏码](docs/donate.png)
