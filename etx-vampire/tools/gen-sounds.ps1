# Generates small WAV sound effects for Vampire Survivors into ../assets/SOUNDS.
# 16-bit PCM mono, 22050 Hz. Run from the etx-vampire folder.
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

function Add-Silence($list, [double]$dur) {
  $n = [int]($dur * $SR)
  for ($i = 0; $i -lt $n; $i++) {
    $list.Add([int16]0) | Out-Null
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
  $s = Add-Tone $s 220 0.12 0.5 0
  $s = Add-Tone $s 330 0.12 0.5 0
  $s = Add-Tone $s 440 0.24 0.5 0
  $s
}

Make-Sound "hurt.wav" {
  $s = New-Samples
  $s = Add-Tone $s 200 0.12 0.6 10
  $s = Add-Tone $s 120 0.2 0.6 7
  $s = Add-Noise $s 0.15 0.3 12
  $s
}

Make-Sound "levelup.wav" {
  $s = New-Samples
  $s = Add-Tone $s 523 0.1 0.5 0
  $s = Add-Tone $s 659 0.1 0.5 0
  $s = Add-Tone $s 784 0.1 0.5 0
  $s = Add-Tone $s 1047 0.3 0.55 0
  $s
}

Make-Sound "fail.wav" {
  $s = New-Samples
  $s = Add-Tone $s 392 0.18 0.5 0
  $s = Add-Tone $s 330 0.18 0.5 0
  $s = Add-Tone $s 262 0.4 0.5 0
  $s
}

# dark looping melody (A minor, ~2.4s) for the background music
Make-Sound "bgm.wav" {
  $s = New-Samples
  $notes = @(
    @(110.0, 0.30), @(0.0, 0.12),
    @(130.8, 0.30), @(0.0, 0.12),
    @(164.8, 0.36), @(146.8, 0.30),
    @(0.0, 0.12), @(98.0, 0.60), @(0.0, 0.18)
  )
  foreach ($n in $notes) {
    if ($n[0] -gt 0) {
      $s = Add-Tone $s $n[0] $n[1] 0.38 0.9
      $s = Add-Tone $s ($n[0] * 2) $n[1] 0.1 1.4
    } else {
      $s = Add-Silence $s $n[1]
    }
  }
  $s
}

Write-Host "Generated:"; Get-ChildItem $outDir | Select-Object Name, Length
