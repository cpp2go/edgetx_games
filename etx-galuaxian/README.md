# etx-galuaxian

GaLuaxian（Galaga 风格太空射击）游戏，适用于 EdgeTX / OpenTX 彩色遥控器（Radiomaster TX16S 等，480×320）。

原为纯 Lua 脚本，现已改为与其它游戏一致的 **TypeScript → Lua** 构建工程（TypeScriptToLua + luamin 压缩）。

## 玩法

- 移动战机躲避/迎击下方飞来的敌人目标，用子弹击中敌人得分。
- 敌人碰到战机即游戏结束；结算最佳成绩（保存在 `/galuaxian-results.txt`）。
- 设置菜单（长按 Enter 进入）：Low FPS、目标左右晃动、华丽弹道、Easy 模式、声音开关、Low Quality。

## 操作

- 摇杆（ail/ele）或触屏：移动战机
- `ENTER`（或触屏点按）：开始游戏
- `ENTER` 长按：设置菜单
- `RTN`：退出到菜单

## 声音

游戏从 `SOUNDS` 目录播放 WAV（找不到时回退蜂鸣）：
`shoot`（射击）、`hit`（击中）、`flight`（目标飞行，节流）、`start`、`boom`（被撞）、`escape`（目标溜走）、`exit`。

图片从 `IMAGES` 目录加载：`ship.png`、`back.png`、`target.png`（缺失时用图形代替）。

## 构建

```sh
npm install
npm run build
```

## 复制到遥控器

- `_site/SCRIPTS/GaLuaxian.lua` → `/SCRIPTS/GaLuaxian.lua`
- `_site/IMAGES/`（3 张 png）→ `/SCRIPTS/IMAGES/`
- `_site/SOUNDS/`（7 个 wav）→ `/SCRIPTS/SOUNDS/`
- SYS → Scripts 运行 `GaLuaxian.lua`

（`_site/galuaxian.lua` 是给 Widget 用的加载器；如不用 Widget 可忽略。）

## 文件

```
src/galuaxian.ts          游戏逻辑（TypeScript 源）
src/galuaxian.lua         编译产物
src/galuaxian-widget.lua  Widget 加载器
src/edgetx/               EdgeTX Lua API 类型定义
assets/IMAGES/            战机/背景/目标图片
assets/SOUNDS/            音效 WAV
tools/gen-sounds.ps1      音效生成脚本
plugins/minify.ts         luamin 压缩插件
```
