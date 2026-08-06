<#
build-all.ps1
=============
编译当前目录下所有 etx-* 游戏（TypeScript -> Lua），并把最终成品收集到一个
目录（默认 ./_site）里。

两种布局:
  -Layout merged   (默认) 所有游戏平铺合并:  SCRIPTS\ + *.lua + IMAGES\ + SOUNDS\<游戏>\
                          （音效按游戏分子目录，避免 boom.wav/start.wav 等同名冲突）
  -Layout separate       每个游戏一个独立子目录: <游戏>\SCRIPTS\ ...
                         每个子目录可直接拷到 SD 卡

用法:
    powershell -ExecutionPolicy Bypass -File .\build-all.ps1
    powershell -ExecutionPolicy Bypass -File .\build-all.ps1 -OutDir release
    powershell -ExecutionPolicy Bypass -File .\build-all.ps1 -Layout separate

依赖: node + npm（每个游戏首次构建时自动 npm install）
#>

param(
    [string]$OutDir = "_site",
    # merged  = 所有游戏平铺合并到一个目录（音效放 SOUNDS\<游戏>\ 避免冲突，默认）
    # separate = 每个游戏一个独立子目录
    [ValidateSet("merged", "separate")]
    [string]$Layout = "merged"
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Out  = Join-Path $Root $OutDir

# 游戏目录后缀 -> 运行时脚本名（SCRIPTS/<Name>.lua）
$GameNames = @{
    "agar"      = "Agar"
    "asteroids" = "Asteroids"
    "bomber"    = "Bomber"
    "breakout"  = "Breakout"
    "galuaxian" = "GaLuaxian"
    "link"      = "Link"
    "match3"    = "Match3"
    "mines"     = "Mines"
    "racer"     = "Racer"
    "snake"     = "Snake"
    "sudoku"    = "Sudoku"
    "tetris"    = "Tetris"
}

# 清空并重建输出目录
if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
New-Item -ItemType Directory $Out | Out-Null

$games = Get-ChildItem -Directory -Path $Root |
    Where-Object { $_.Name -like "etx-*" } |
    Sort-Object Name

$built   = 0
$skipped = @()

# merged 布局的共享目录
$destScripts = Join-Path $Out "SCRIPTS"
$destImages  = Join-Path $Out "IMAGES"
$destSounds  = Join-Path $Out "SOUNDS"
New-Item -ItemType Directory $destScripts -Force | Out-Null

foreach ($game in $games) {
    $slug = $game.Name -replace "^etx-", ""
    if (-not $GameNames.ContainsKey($slug)) {
        $skipped += $game.Name
        continue
    }
    $Name   = $GameNames[$slug]
    $srcDir = Join-Path $game.FullName "src"

    Write-Host ""
    Write-Host "=== $($game.Name) ==="

    # 1) 编译 TS -> Lua
    Push-Location $game.FullName
    try {
        if (-not (Test-Path (Join-Path $game.FullName "node_modules"))) {
            Write-Host "  [deps] npm install ..."
            npm install --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw "npm install 失败: $($game.Name)" }
        }
        Write-Host "  [build] tstl ..."
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "编译失败: $($game.Name)" }
    }
    finally { Pop-Location }

    # 2) 目标位置：merged 平铺 / separate 每游戏子目录
    if ($Layout -eq "merged") {
        $dest = $Out
    }
    else {
        $dest        = Join-Path $Out $Name
        $destScripts = Join-Path $dest "SCRIPTS"
    }
    New-Item -ItemType Directory $destScripts -Force | Out-Null

    # 运行时主脚本
    Copy-Item (Join-Path $srcDir "$slug.lua") (Join-Path $destScripts "$Name.lua") -Force

    # widget 脚本（<game>-widget.lua -> <game>.lua）
    $widget = Join-Path $srcDir "$slug-widget.lua"
    if (Test-Path $widget) {
        Copy-Item $widget (Join-Path $dest "$slug.lua") -Force
    }

    # 其它辅助脚本（如 tetris 的 gauge/timer/outputs/...）
    Get-ChildItem $srcDir -Filter *.lua -File |
        Where-Object { $_.Name -ne "$slug.lua" -and $_.Name -ne "$slug-widget.lua" } |
        ForEach-Object { Copy-Item $_.FullName (Join-Path $destScripts $_.Name) -Force }

    # 图片: assets\*.png / assets\IMAGES\*.png / IMAGES\*.png
    $images = @()
    foreach ($d in @(
        (Join-Path $game.FullName "assets"),
        (Join-Path $game.FullName "assets\IMAGES"),
        (Join-Path $game.FullName "IMAGES")
    )) {
        if (Test-Path $d) { $images += Get-ChildItem $d -Filter *.png -File }
    }
    if ($images.Count -gt 0) {
        $destImg = if ($Layout -eq "merged") { $destImages } else { Join-Path $dest "IMAGES" }
        New-Item -ItemType Directory $destImg -Force | Out-Null
        $images | Sort-Object FullName -Unique |
            ForEach-Object { Copy-Item $_.FullName $destImg -Force }
    }

    # 音效: assets\SOUNDS\*.wav / SOUNDS\*.wav
    $sounds = @()
    foreach ($d in @(
        (Join-Path $game.FullName "assets\SOUNDS"),
        (Join-Path $game.FullName "SOUNDS")
    )) {
        if (Test-Path $d) { $sounds += Get-ChildItem $d -Filter *.wav -File }
    }
    if ($sounds.Count -gt 0) {
        # merged: 放 SOUNDS\<slug>\ 避免同名 wav 互相覆盖; separate: SOUNDS\ 平铺
        $destSnd = if ($Layout -eq "merged") { Join-Path $destSounds $slug } else { Join-Path $dest "SOUNDS" }
        New-Item -ItemType Directory $destSnd -Force | Out-Null
        $sounds | Sort-Object FullName -Unique |
            ForEach-Object { Copy-Item $_.FullName $destSnd -Force }
    }

    if ($Layout -eq "merged") {
        Write-Host "  -> SCRIPTS\$Name.lua + $slug.lua (widget) + $($images.Count + $sounds.Count) 个资源"
    }
    else {
        Write-Host "  -> $Name\  (SCRIPTS, widget, $($images.Count + $sounds.Count) 个资源)"
    }
    $built++
}

Write-Host ""
if ($Layout -eq "merged") {
    Write-Host "完成: 平铺合并 $built 个游戏 -> $Out  (SCRIPTS\, *.lua, IMAGES\, SOUNDS\<游戏>\)"
}
else {
    Write-Host "完成: 编译并收集 $built 个游戏 -> $Out (每游戏一个子目录)"
}
if ($skipped.Count -gt 0) {
    Write-Warning "跳过（无映射的目录）: $($skipped -join ', ')"
}
