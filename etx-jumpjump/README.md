# etx-jumpjump

跳一跳（Jump Jump）游戏，适用于 EdgeTX / OpenTX 彩色遥控器（Radiomaster TX16S 等，480×320）。

用 TypeScript 编写，通过 TypeScriptToLua 编译成最小化的 Lua 脚本。

## 玩法

- 小人在方块上，前方有一个目标方块。
- **按住**摇杆（任意方向）或触摸屏幕**蓄力**，**松开**起跳。
- 按住越久跳得越远；跳到目标方块上得 1 分，方块会不断向右延伸。
- 跳过头、跳太近掉下去都算失败。

## 操作

**蓄力 / 起跳**
- 摇杆：任意方向推住 = 蓄力，回到中位 = 起跳（推荐）
- 触摸：按住 = 蓄力，松开 = 起跳
- `ENTER`：长按 = 蓄力，松开 = 起跳

**开始 / 重开**
- `SYS`：新局
- 初始 / 结束界面按 `ENTER` 或点屏幕

## 构建

```sh
npm install
npm run build
```

## 复制到遥控器

- 把 `_site/SCRIPTS/JumpJump.lua` 复制到遥控器 SD 卡 `/SCRIPTS/JumpJump.lua`
- 把 `_site/IMAGES/` 下的 `jump-player.png`、`jump-player-jump.png`、`jump-shadow.png` 复制到 `/SCRIPTS/IMAGES/`（3D 角色 / 跳跃动作 / 影子，缺省时用图形代替）
- 把 `_site/SOUNDS/jumpjump/` 下的 WAV 复制到 `/SCRIPTS/SOUNDS/jumpjump/`（跳跃 / 落地 / 得分 / 失败 / 开始音效 + 背景音乐，缺省时用蜂鸣音代替）
- 在遥控器 SYS → Scripts 里选择运行 `JumpJump.lua`

（`_site/jumpjump.lua` 是给 Widget 用的加载器；如不用 Widget 可忽略。）

## 画面

- **等距 3D 视角**（和经典跳一跳一致）：彩色立方体方块沿对角线延伸，高低起伏，有地面网格和地平线
- 方块 = 亮色顶面 + 左右两个带明暗的侧立面，目标方块有高亮描边
- 角色动画：蓄力时**压缩蹲下** → 起跳瞬间**拉伸**并切换成跳跃动作（`jump-player-jump.png`，张手伸腿）→ 落地回弹压缩，抛物线很明显
- 跳起时地面有动态投影 `jump-shadow.png`，越高越淡越小，判断落点
- 镜头随跳跃沿对角线平滑跟随

美术资源由 `tools/gen-assets.ps1` 生成（System.Drawing 画 PNG），可在 `etx-jumpjump` 目录重新运行。

## 声音

- 背景音乐 `bgm.wav`（约 2.4s 的轻快循环，游戏进行时循环播放）
- 音效：`jump.wav`（起跳）、`land.wav`（落地）、`score.wav`（得分）、`fail.wav`（失败）、`start.wav`（开始）
- WAV 缺失时自动退回蜂鸣音；音乐文件缺失时静音
- 由 `tools/gen-sounds.ps1` 生成（合成 16-bit 单声道 WAV）

## 文件

```
src/jumpjump.ts          游戏逻辑（TypeScript 源）
src/jumpjump.lua         编译产物
src/jumpjump-widget.lua  Widget 加载器
src/edgetx/              EdgeTX Lua API 类型定义
assets/                  3D 角色 / 影子 PNG
assets/SOUNDS/           音效 + 背景音乐 WAV
plugins/minify.ts        luamin 压缩插件
tools/gen-assets.ps1     美术资源生成脚本
tools/gen-sounds.ps1     音效 / 音乐生成脚本
```
