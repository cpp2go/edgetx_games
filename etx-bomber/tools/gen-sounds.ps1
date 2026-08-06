# Generates small WAV sound effects used by Bomberman into ../assets/SOUNDS.
# 16-bit PCM mono, 22050 Hz. Run from the etx-bomber folder.
$outDir = Join-Path $PSScriptRoot "..\assets\SOUNDS"
New-Item -ItemType Directory -Force $outDir | Out-Null
$SR = 22050

function New-Samples {
  return ,[System.Collections.Generic.List[Int16]]@()
}

function Add-Tone($list, [double]$freq, [double]$dur, [double]$vol, [double]$decay) {
  $n = [int]($dur * $SR)
  for ($i = 0; $i -lt $n; $i++) {
    $t = $i / $SR
    $env = 1.0
    if ($decay -gt 0) { $env = [Math]::Exp(-$decay * $t) }
    $v = [Math]::Sin(2 * [Math]::PI * $freq * $t) * $env * $vol
    $v = [Math]::Max(-1.0, [Math]::Min(1.0, $v))
    $list.Add([int16]([Math]::Round($v * 32767))) | Out-Null
  }
  return ,$list
}

function Add-Noise($list, [double]$dur, [double]$vol, [double]$decay) {
  $rng = New-Object System.Random
  $n = [int]($dur * $SR)
  for ($i = 0; $i -lt $n; $i++) {
    $t = $i / $SR
    $env = [Math]::Exp(-$decay * $t)
    $v = ($rng.NextDouble() * 2 - 1) * $env * $vol
    $list.Add([int16]([Math]::Round($v * 32767))) | Out-Null
  }
  return ,$list
}

function Write-Wav([string]$path, $samples) {
  $dataSize = $samples.Count * 2
  $byteRate = $SR * 2
  $fs = [System.IO.File]::Create($path)
  $bw = New-Object System.IO.BinaryWriter($fs)
  $bw.Write([System.Text.Encoding]::ASCII.GetBytes("RIFF"))
  $bw.Write([int](36 + $dataSize))
  $bw.Write([System.Text.Encoding]::ASCII.GetBytes("WAVE"))
  $bw.Write([System.Text.Encoding]::ASCII.GetBytes("fmt "))
  $bw.Write([int]16)
  $bw.Write([int16]1)   # PCM
  $bw.Write([int16]1)   # mono
  $bw.Write([int]$SR)
  $bw.Write([int]$byteRate)
  $bw.Write([int16]2)   # block align
  $bw.Write([int16]16)  # bits per sample
  $bw.Write([System.Text.Encoding]::ASCII.GetBytes("data"))
  $bw.Write([int]$dataSize)
  for ($i = 0; $i -lt $samples.Count; $i++) { $bw.Write($samples[$i]) }
  $bw.Close()
  $fs.Close()
}

function Make-Sound([string]$name, [scriptblock]$build) {
  try {
    $s = & $build
    Write-Wav (Join-Path $outDir $name) $s
    Write-Host ("OK   " + $name)
  } catch {
    Write-Host ("FAIL " + $name + " : " + $_.Exception.Message)
  }
}

Make-Sound "start.wav" {
  $s = New-Samples
  $s = Add-Tone $s 440 0.12 0.5 0
  $s = Add-Tone $s 660 0.22 0.5 0
  $s
}

Make-Sound "place.wav" {
  $s = New-Samples
  $s = Add-Tone $s 320 0.14 0.6 12
  $s
}

Make-Sound "boom.wav" {
  $s = New-Samples
  $s = Add-Noise $s 0.5 0.7 9
  $s = Add-Tone $s 110 0.3 0.5 8
  $s
}

Make-Sound "kill.wav" {
  $s = New-Samples
  $s = Add-Tone $s 950 0.08 0.6 20
  $s = Add-Tone $s 700 0.12 0.6 14
  $s
}

Make-Sound "power.wav" {
  $s = New-Samples
  $s = Add-Tone $s 520 0.12 0.55 0
  $s = Add-Tone $s 780 0.18 0.55 0
  $s
}

Make-Sound "win.wav" {
  $s = New-Samples
  $s = Add-Tone $s 523 0.12 0.55 0
  $s = Add-Tone $s 659 0.12 0.55 0
  $s = Add-Tone $s 784 0.12 0.55 0
  $s = Add-Tone $s 1047 0.3 0.6 0
  $s
}

Make-Sound "lose.wav" {
  $s = New-Samples
  $s = Add-Tone $s 392 0.2 0.5 0
  $s = Add-Tone $s 330 0.2 0.5 0
  $s = Add-Tone $s 262 0.35 0.5 0
  $s
}

Write-Host "Generated:"; Get-ChildItem $outDir | Select-Object Name, Length
