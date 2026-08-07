"""Import the xS X-Tris sound effects (from C:\\Users\\caizhenxin\\Desktop\\xS)
into etx-tetris/assets/SOUNDS, resampled to 22050Hz.

Usage:  python tools/import-xs-sounds.py
"""
import os
import wave

import numpy as np

SRC = r"C:\Users\caizhenxin\Desktop\xS\X-TRIS\snd"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "assets", "SOUNDS"))
TARGET_SR = 32000

FILES = [
    "move.wav",      # moving left/right/down
    "rot.wav",       # rotating the brick
    "shift.wav",     # auto-drop one line
    "set.wav",       # brick placed
    "filled1.wav",   # 1 line cleared
    "filled2.wav",   # 2 lines cleared
    "filled3.wav",   # 3+ lines cleared
    "levelup.wav",   # leveled up
    "ready.wav",     # ready / new game
    "gover.wav",     # game over
    "splash.wav",    # start screen
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
        raise ValueError(f"unsupported width {width} in {path}")
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
    for name in FILES:
        a, sr = read_wav(os.path.join(SRC, name))
        write_wav(os.path.join(OUT, name), resample(a, sr, TARGET_SR))
        print(f"OK   {name:14s} {a.size/TARGET_SR:6.2f}s")
    print("done")


if __name__ == "__main__":
    main()
