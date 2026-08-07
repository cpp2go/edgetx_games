"""Import the xS Breakout sound effects (from C:\\Users\\caizhenxin\\Desktop\\xS)
into etx-breakout/SOUNDS, resampled to 22050Hz and renamed to the game's
expected file names.

Usage:  python tools/import-xs-sounds.py
"""
import os
import wave

import numpy as np

SRC = r"C:\Users\caizhenxin\Desktop\xS\BREAKOUT\snd"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "SOUNDS"))
TARGET_SR = 32000

# xS source file -> etx-breakout file name (event)
MAP = [
    ("throw.wav", "launch.wav"),    # launching the ball
    ("splash.wav", "start.wav"),    # game start
    ("up.wav", "level.wav"),        # level cleared
    ("bat.wav", "move.wav"),        # paddle movement
    ("bat.wav", "bounce.wav"),      # ball bounces off the paddle
    ("crush.wav", "brick.wav"),     # brick destroyed
    ("brick.wav", "brickhit.wav"),  # brick hit (not broken)
    ("killed.wav", "lose.wav"),     # lost a life
]


def read_wav(path):
    w = wave.open(path, "rb")
    sr = w.getframerate()
    ch = w.getnchannels()
    width = w.getsampwidth()
    n = w.getnframes()
    raw = w.readframes(n)
    w.close()
    if width == 2:
        a = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    elif width == 1:
        a = np.frombuffer(raw, dtype=np.uint8).astype(np.float32) / 128.0 - 1.0
    else:
        raise ValueError(f"unsupported sample width {width} in {path}")
    if ch > 1:
        a = a[: len(a) - len(a) % ch].reshape(-1, ch).mean(axis=1)
    return a, sr


def resample(a, sr, target):
    if sr == target:
        return a
    n = int(round(len(a) * target / sr))
    x = np.linspace(0, len(a) - 1, n)
    return np.interp(x, np.arange(len(a)), a).astype(np.float32)


def write_wav(path, a, sr=TARGET_SR):
    a = np.clip(a, -1.0, 1.0)
    pcm = (a * 32767.0).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def main():
    os.makedirs(OUT, exist_ok=True)
    cache = {}
    for src, dst in MAP:
        if src not in cache:
            a, sr = read_wav(os.path.join(SRC, src))
            cache[src] = resample(a, sr, TARGET_SR)
        write_wav(os.path.join(OUT, dst), cache[src])
        print(f"OK   {dst:14s} <- {src:14s} {cache[src].size/TARGET_SR:6.2f}s")
    print("done")


if __name__ == "__main__":
    main()
