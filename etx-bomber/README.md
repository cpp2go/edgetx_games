# etx-bomber

炸弹人（Bomberman）游戏，适用于 EdgeTX / OpenTX 彩色遥控器（Radiomaster TX16S 等，480×320）。

用 TypeScript 编写，通过 TypeScriptToLua 编译成最小化的 Lua 脚本。

## 玩法

- **放炸弹**：在格子路上放置定时炸弹，炸弹倒计时后炸出十字形火焰。
- **消灭敌人**：用火焰烧毁砖块、清除怪物，清光所有怪物即获胜。
- **吃道具**：炸毁砖块会随机掉落道具——
  - `S`（黄）：加速
  - `B`（橙）：炸弹数量 +1
  - `P`（绿）：炸弹威力 +1（火焰十字更长，最多 6 格）
- 炸弹火焰可以连锁引爆其它炸弹；踩到火焰或被敌人碰到都会失败。

## 操作

**摇杆**：左右摇杆移动（十字方向）。
**按键**
- `+ / -`：初始界面切换难度（EASY/MEDIUM/HARD，敌人 3/4/5 个，速度递增）
- 滚轮左右 / `TEL` 上 / `PAGE` 下：移动
- `ENTER`：放炸弹
- `SYS`：新局
**触屏**：点相邻格子移动；点自己所在的格子放炸弹。

## 构建

```sh
npm install
npm run build
```

## 复制到遥控器

- 把 `_site/SCRIPTS/Bomber.lua` 复制到遥控器 SD 卡 `/SCRIPTS/Bomber.lua`
- 把 `_site/IMAGES/` 文件夹整体复制到 SD 卡 `/SCRIPTS/IMAGES/`（敌人、炸弹、玩家图片）
- 把 `_site/SOUNDS/` 文件夹整体复制到 SD 卡 `/SCRIPTS/SOUNDS/`（音效 WAV）
- 在遥控器 SYS → Scripts 里选择运行 `Bomber.lua`

如果没放图片/音效，游戏会自动用图形和蜂鸣声代替，但建议都放上效果更好。

（`_site/bomber.lua` 是给 Widget 用的加载器；如不用 Widget 可忽略。）

## 文件

```
src/bomber.ts          游戏逻辑（TypeScript 源）
src/bomber.lua         编译产物
src/bomber-widget.lua  Widget 加载器
src/edgetx/            EdgeTX Lua API 类型定义
assets/                敌人/炸弹/玩家图片
assets/SOUNDS/         音效 WAV
tools/gen-assets.ps1   图片生成脚本
tools/gen-sounds.ps1   音效生成脚本
plugins/minify.ts      luamin 压缩插件
```
