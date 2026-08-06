# Generates the PNGs used by Jump Jump (跳一跳): a 3D-looking blocky
# character (jump-player.png) and a soft drop shadow (jump-shadow.png).
# Run from the etx-jumpjump folder.
Add-Type -AssemblyName System.Drawing

$dir = Join-Path $PSScriptRoot "..\assets"
New-Item -ItemType Directory -Force $dir | Out-Null

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $bmp.SetResolution(96, 96)
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

function Add-RoundedRect([System.Drawing.Drawing2D.GraphicsPath]$path, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
}

function Draw-Character([System.Drawing.Graphics]$g, [int]$W, [int]$H) {
  # reference-style 跳一跳 character: small white/gray rounded figure
  $light = [System.Drawing.Color]::FromArgb(255, 250, 250, 252)
  $dark  = [System.Drawing.Color]::FromArgb(255, 200, 201, 208)
  $out   = [System.Drawing.Color]::FromArgb(255, 140, 141, 152)
  $shade = [System.Drawing.Color]::FromArgb(60, 120, 122, 140)

  $outPen  = New-Object System.Drawing.Pen($out, 2.0)
  $outPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  # ---- legs / feet ----
  $leg = [System.Drawing.Color]::FromArgb(255, 208, 209, 216)
  foreach ($lx in @(15.0, 25.0)) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    Add-RoundedRect $p $lx 50 8 9 4
    $b = New-Object System.Drawing.SolidBrush($leg)
    $g.FillPath($b, $p)
    $g.DrawPath($outPen, $p)
    $b.Dispose(); $p.Dispose()
  }

  # ---- body (rounded, vertical 3D gradient) ----
  $bodyPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  Add-RoundedRect $bodyPath 12 24 24 28 10
  $bodyRect = New-Object System.Drawing.RectangleF(12, 24, 24, 28)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bodyRect, $light, $dark, 90.0)
  $g.FillPath($grad, $bodyPath)
  $g.DrawPath($outPen, $bodyPath)
  # right-side shade for 3D roundness
  $sh = New-Object System.Drawing.SolidBrush($shade)
  $shPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  Add-RoundedRect $shPath 30 26 4 24 2
  $g.FillPath($sh, $shPath)
  # left highlight
  $hi = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(80, 255, 255, 255))
  $hiPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  Add-RoundedRect $hiPath 15 26 4 24 2
  $g.FillPath($hi, $hiPath)
  $grad.Dispose(); $sh.Dispose(); $shPath.Dispose(); $hi.Dispose(); $hiPath.Dispose(); $bodyPath.Dispose()

  # ---- head ----
  $headPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $headPath.AddEllipse(13, 2, 22, 22)
  $headRect = New-Object System.Drawing.RectangleF(13, 2, 22, 22)
  $hgrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($headRect, $light, $dark, 90.0)
  $g.FillPath($hgrad, $headPath)
  $g.DrawPath($outPen, $headPath)
  # head right shade + highlight
  $hsh = New-Object System.Drawing.SolidBrush($shade)
  $g.FillEllipse($hsh, [float]28, [float]5, [float]4, [float]14)
  $hhi = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(110, 255, 255, 255))
  $g.FillEllipse($hhi, [float]17, [float]4, [float]7, [float]7)
  # eyes (small, subtle)
  $eb = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 90, 92, 105))
  $g.FillEllipse($eb, [float]20, [float]10, [float]2.6, [float]3.6)
  $g.FillEllipse($eb, [float]25.4, [float]10, [float]2.6, [float]3.6)
  $hgrad.Dispose(); $hsh.Dispose(); $hhi.Dispose(); $eb.Dispose(); $headPath.Dispose()

  $outPen.Dispose()
}

function Draw-JumpCharacter([System.Drawing.Graphics]$g, [int]$W, [int]$H) {
  # same white/gray figure, in a leaping pose: stretched body, arms up, legs spread
  $light = [System.Drawing.Color]::FromArgb(255, 250, 250, 252)
  $dark  = [System.Drawing.Color]::FromArgb(255, 200, 201, 208)
  $out   = [System.Drawing.Color]::FromArgb(255, 140, 141, 152)
  $shade = [System.Drawing.Color]::FromArgb(60, 120, 122, 140)
  $outPen = New-Object System.Drawing.Pen($out, 2.0)
  $outPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  # arms raised
  foreach ($ax in @(6.0, 36.0)) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    Add-RoundedRect $p $ax 18 6 12 3
    $b = New-Object System.Drawing.SolidBrush($dark)
    $g.FillPath($b, $p); $g.DrawPath($outPen, $p)
    $b.Dispose(); $p.Dispose()
  }

  # legs spread (leaping)
  foreach ($lx in @(13.0, 27.0)) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    Add-RoundedRect $p $lx 48 8 12 4
    $b = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 208, 209, 216))
    $g.FillPath($b, $p); $g.DrawPath($outPen, $p)
    $b.Dispose(); $p.Dispose()
  }

  # body stretched
  $bodyPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  Add-RoundedRect $bodyPath 15 20 18 30 8
  $bodyRect = New-Object System.Drawing.RectangleF(15, 20, 18, 30)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bodyRect, $light, $dark, 90.0)
  $g.FillPath($grad, $bodyPath); $g.DrawPath($outPen, $bodyPath)
  $sh = New-Object System.Drawing.SolidBrush($shade)
  $shPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  Add-RoundedRect $shPath 30 22 3.5 26 2
  $g.FillPath($sh, $shPath)
  $hi = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(80, 255, 255, 255))
  $hiPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  Add-RoundedRect $hiPath 17 22 3.5 26 2
  $g.FillPath($hi, $hiPath)
  $grad.Dispose(); $sh.Dispose(); $shPath.Dispose(); $hi.Dispose(); $hiPath.Dispose(); $bodyPath.Dispose()

  # head (raised)
  $headPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $headPath.AddEllipse(14, 1, 20, 20)
  $headRect = New-Object System.Drawing.RectangleF(14, 1, 20, 20)
  $hgrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($headRect, $light, $dark, 90.0)
  $g.FillPath($hgrad, $headPath); $g.DrawPath($outPen, $headPath)
  $hhi = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(110, 255, 255, 255))
  $g.FillEllipse($hhi, [float]17, [float]3, [float]6, [float]6)
  $hgrad.Dispose(); $hhi.Dispose(); $headPath.Dispose()

  $outPen.Dispose()
}

function Draw-Shadow([System.Drawing.Graphics]$g, [int]$W, [int]$H) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse(0, 0, $W, $H)
  $pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
  $pgb.CenterColor = [System.Drawing.Color]::FromArgb(150, 0, 0, 0)
  $pgb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  $g.FillPath($pgb, $path)
  $pgb.Dispose(); $path.Dispose()
}

# player: 48 x 62
$c1 = New-Canvas 48 62
Draw-Character $c1[1] 48 62
Save-Png $c1[0] $c1[1] (Join-Path $dir "jump-player.png")

# shadow: 64 x 22 soft ellipse
$c2 = New-Canvas 64 22
Draw-Shadow $c2[1] 64 22
Save-Png $c2[0] $c2[1] (Join-Path $dir "jump-shadow.png")

# jumping pose (shown during flight)
$c4 = New-Canvas 48 62
Draw-JumpCharacter $c4[1] 48 62
Save-Png $c4[0] $c4[1] (Join-Path $dir "jump-player-jump.png")

Write-Host "Generated:"; Get-ChildItem $dir -Filter *.png | Select-Object Name, Length
