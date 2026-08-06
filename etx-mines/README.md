# etx-mines

扫雷（Minesweeper）游戏，适用于 EdgeTX / OpenTX 彩色遥控器（Radiomaster TX16S 等，480×320）。

用 TypeScript 编写，通过 TypeScriptToLua 编译成最小化的 Lua 脚本。

## 玩法

- 经典扫雷：翻开所有不含雷的格子即获胜，踩到雷则游戏结束。
- 数字表示周围 8 格中的雷数，用不同颜色区分（1 蓝 / 2 绿 / 3 红 / 4 橙 / 5 深红 / 6 黄 / 7 白 / 8 灰）。
- 首次点击的 3×3 区域保证安全。
- 三种难度：EASY（9×9，10 雷）/ MEDIUM（12×9，20 雷）/ HARD（15×9，32 雷）。
- 顶部显示剩余雷数、用时和最佳成绩（Best 按难度分别记录）。

## 操作

**触屏**
- 点格子翻开；点顶部 `F` 按钮切换插旗模式，再点格子插旗/拔旗；`N` 按钮开新局。

**按键**
- `+ / -`：初始界面切换难度
- 滚轮左右：光标横移；`TEL` 上移；`PAGE` 下移
- `ENTER`：翻开光标处格子（插旗模式下为插旗）
- `RTN`：给光标处格子插旗/拔旗
- `+` 或 `MDL`：切换插旗模式
- `SYS`：新局

## 构建

```sh
npm install
npm run build
```

## 复制到遥控器

- 把 `_site/SCRIPTS/Mines.lua` 复制到遥控器 SD 卡 `/SCRIPTS/Mines.lua`
- 在遥控器 SYS → Scripts 里选择运行 `Mines.lua`

（`_site/mines.lua` 是给 Widget 用的加载器；如不用 Widget 可忽略。）

## 文件

```
src/mines.ts          游戏逻辑（TypeScript 源）
src/mines.lua         编译产物
src/mines-widget.lua  Widget 加载器
src/edgetx/           EdgeTX Lua API 类型定义
plugins/minify.ts     luamin 压缩插件
```
