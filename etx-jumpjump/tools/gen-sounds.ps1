# Generates small WAV sound effects + a short background music loop for Jump Jump.
# 16-bit PCM mono, 22050 Hz. Run from the etx-jumpjump folder.
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

# a melody note followed by a short silence gap
function Add-Note($list, [double]$freq, [double]$dur, [double]$vol = 0.42) {
  $s = Add-Tone $list $freq $dur $vol 4
  $gapN = [int](0.03 * $SR)
  for ($i = 0; $i -lt $gapN; $i++) { $s.Add([int16]0) | Out-Null }
  return ,$s
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
  $s = Add-Tone $s 523 0.10 0.5 0
  $s = Add-Tone $s 784 0.10 0.5 0
  $s = Add-Tone $s 1046 0.20 0.5 0
  $s
}

# springy ascending arpeggio
Make-Sound "jump.wav" {
  $s = New-Samples
  $s = Add-Tone $s 523 0.06 0.5 16
  $s = Add-Tone $s 659 0.06 0.5 16
  $s = Add-Tone $s 784 0.10 0.5 18
  $s
}

# soft thud
Make-Sound "land.wav" {
  $s = New-Samples
  $s = Add-Tone $s 190 0.07 0.6 22
  $s
}

# happy two-note ding
Make-Sound "score.wav" {
  $s = New-Samples
  $s = Add-Tone $s 784 0.08 0.5 10
  $s = Add-Tone $s 1174 0.14 0.5 10
  $s
}

# falling fail
Make-Sound "fail.wav" {
  $s = New-Samples
  $s = Add-Tone $s 392 0.18 0.5 6
  $s = Add-Tone $s 262 0.28 0.5 5
  $s = Add-Tone $s 196 0.34 0.5 4
  $s
}

# short cheerful background music loop
Make-Sound "bgm.wav" {
  $s = New-Samples
  $s = Add-Note $s 523 0.15; $s = Add-Note $s 659 0.15; $s = Add-Note $s 784 0.15
  $s = Add-Note $s 1046 0.22; $s = Add-Note $s 784 0.15; $s = Add-Note $s 659 0.15
  $s = Add-Note $s 587 0.15;  $s = Add-Note $s 659 0.20
  $s = Add-Note $s 523 0.15;  $s = Add-Note $s 587 0.15; $s = Add-Note $s 659 0.15
  $s = Add-Note $s 784 0.22;  $s = Add-Note $s 659 0.15; $s = Add-Note $s 587 0.15
  $s = Add-Note $s 523 0.32
  $s
}

Write-Host "Generated:"; Get-ChildItem $outDir | Select-Object Name, Length
