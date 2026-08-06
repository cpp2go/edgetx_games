# etx-sudoku

数独（Sudoku）游戏，适用于 EdgeTX / OpenTX 彩色遥控器（Radiomaster TX16S 等，480×320）。

用 TypeScript 编写，通过 TypeScriptToLua 编译成最小化的 Lua 脚本。

## 玩法

- 标准 9×9 数独，填入 1~9，保证每行、每列、每个 3×3 宫不重复。
- 填错会累计错误次数（Errors），正确填完所有空格即获胜。
- 三种难度：EASY（40 个提示数）/ MEDIUM（32）/ HARD（26）。

## 操作

**触屏**
- 点格子选中，点右侧数字键盘填入，`C` 清除当前格，`H` 提示，`N` 新局。

**按键**
- `+ / -`（或滚轮）：初始界面切换难度；游戏中选中格子时 +1 / -1 循环填数
- 滚轮左右 / `+ -` 方向：移动光标（横）
- `TEL`：光标上移
- `PAGE`：光标下移
- `ENTER`：选中/取消当前格
- `RTN`：清除当前格
- `SYS`：新局

## 构建

```sh
npm install
npm run build
```

## 复制到遥控器

- 把 `_site/SCRIPTS/Sudoku.lua` 复制到遥控器 SD 卡 `/SCRIPTS/Sudoku.lua`
- 在遥控器 SYS → Scripts 里选择运行 `Sudoku.lua`

（`_site/sudoku.lua` 是给 Widget 用的加载器，运行 `/SCRIPTS/Sudoku.lua`；如不用 Widget 可忽略。）

## 文件

```
src/sudoku.ts          游戏逻辑（TypeScript 源）
src/sudoku.lua         编译产物
src/sudoku-widget.lua  Widget 加载器
src/edgetx/            EdgeTX Lua API 类型定义
plugins/minify.ts      luamin 压缩插件
```
