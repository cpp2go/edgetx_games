# Generates the 32x32 PNGs used by Bomberman: enemy (red person),
# player (green person) and bomb. Run from the etx-bomber folder.
Add-Type -AssemblyName System.Drawing

$dir = Join-Path $PSScriptRoot "..\assets"
New-Item -ItemType Directory -Force $dir | Out-Null

function New-Canvas([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  return @($bmp, $g)
}

function Save-Png($bmp, $g, [string]$path) {
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

function Draw-Person([System.Drawing.Graphics]$g, [int]$s, [System.Drawing.Color]$body) {
  $b = New-Object System.Drawing.SolidBrush($body)
  # head
  $g.FillEllipse($b, [float]($s * 0.30), [float]($s * 0.08), [float]($s * 0.40), [float]($s * 0.34))
  # body
  $g.FillRectangle($b, [float]($s * 0.33), [float]($s * 0.40), [float]($s * 0.34), [float]($s * 0.24))
  # arms
  $g.FillRectangle($b, [float]($s * 0.16), [float]($s * 0.40), [float]($s * 0.12), [float]($s * 0.24))
  $g.FillRectangle($b, [float]($s * 0.72), [float]($s * 0.40), [float]($s * 0.12), [float]($s * 0.24))
  # legs
  $g.FillRectangle($b, [float]($s * 0.34), [float]($s * 0.64), [float]($s * 0.13), [float]($s * 0.26))
  $g.FillRectangle($b, [float]($s * 0.53), [float]($s * 0.64), [float]($s * 0.13), [float]($s * 0.26))
  # eyes
  $w = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $g.FillEllipse($w, [float]($s * 0.36), [float]($s * 0.17), [float]($s * 0.08), [float]($s * 0.10))
  $g.FillEllipse($w, [float]($s * 0.56), [float]($s * 0.17), [float]($s * 0.08), [float]($s * 0.10))
  $b.Dispose(); $w.Dispose()
}

function Draw-Bomb([System.Drawing.Graphics]$g, [int]$s) {
  $dark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 35, 35, 40))
  $hi = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 130, 130, 140))
  $fuse = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 150, 95, 45))
  $spark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 205, 60))
  # body
  $g.FillEllipse($dark, [float]($s * 0.16), [float]($s * 0.24), [float]($s * 0.68), [float]($s * 0.68))
  # highlight
  $g.FillEllipse($hi, [float]($s * 0.28), [float]($s * 0.36), [float]($s * 0.16), [float]($s * 0.16))
  # fuse
  $g.FillRectangle($fuse, [float]($s * 0.50), [float]($s * 0.06), [float]($s * 0.07), [float]($s * 0.20))
  # spark
  $g.FillEllipse($spark, [float]($s * 0.54), [float]($s * 0.00), [float]($s * 0.22), [float]($s * 0.22))
  $dark.Dispose(); $hi.Dispose(); $fuse.Dispose(); $spark.Dispose()
}

$c1 = New-Canvas 32
Draw-Person $c1[1] 32 ([System.Drawing.Color]::FromArgb(255, 230, 60, 60))
Save-Png $c1[0] $c1[1] (Join-Path $dir "enemy.png")

$c2 = New-Canvas 32
Draw-Person $c2[1] 32 ([System.Drawing.Color]::FromArgb(255, 60, 210, 90))
Save-Png $c2[0] $c2[1] (Join-Path $dir "player.png")

$c3 = New-Canvas 32
Draw-Bomb $c3[1] 32
Save-Png $c3[0] $c3[1] (Join-Path $dir "bomb.png")

Write-Host "Generated:"; Get-ChildItem $dir | Select-Object Name, Length
