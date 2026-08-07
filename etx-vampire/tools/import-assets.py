"""Import the Survivor Unity asset sounds (AIFF) as small 22050Hz WAVs for the
vampire game, and extract the scavenger sprite frames as enemy PNGs.

Usage:  python tools/import-assets.py
Input:  D:\\dev\\unity3d\\Survivor\\Assets\\Audio\\*.aif
        D:\\dev\\unity3d\\Survivor\\Assets\\Sprites\\Scavengers_SpriteSheet.png
Output: assets\\SOUNDS\\*.wav, assets\\IMAGES\\*.png
"""
import os
import struct
import wave

import numpy as np
from PIL import Image

SRC_AUDIO = r"D:\dev\unity3d\Survivor\Assets\Audio"
SRC_SPRITE = r"D:\dev\unity3d\Survivor\Assets\Sprites\Scavengers_SpriteSheet.png"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_SND = os.path.normpath(os.path.join(HERE, "..", "assets", "SOUNDS"))
OUT_IMG = os.path.normpath(os.path.join(HERE, "..", "assets", "IMAGES"))
TARGET_SR = 32000
FRAME = 64  # 4x4 grid of 64x64 frames on the sheet


# ---------------- sprite frame helpers ----------------
def sheet_frame(im, idx):
    gx, gy = idx % 4, idx // 4
    return im.crop((gx * FRAME, gy * FRAME, gx * FRAME + FRAME, gy * FRAME + FRAME))


def trim(img):
    bb = img.split()[3].getbbox()
    return img.crop(bb) if bb else img


def save_scaled(img, name, size):
    """Fit a sprite into a box keeping aspect ratio, save pre-scaled."""
    bw, bh = size
    ratio = min(bw / img.width, bh / img.height)
    nw = max(1, int(round(img.width * ratio)))
    nh = max(1, int(round(img.height * ratio)))
    img = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    canvas.paste(img, ((bw - nw) // 2, (bh - nh) // 2), img)
    canvas.save(os.path.join(OUT_IMG, name))
    print(f"OK   {name:20s} -> {bw}x{bh}")


# ---------------- AIFF -> float32 mono ----------------
def read_aiff(path):
    with open(path, "rb") as f:
        data = f.read()
    assert data[:4] == b"FORM" and data[8:12] == b"AIFF", "not AIFF: " + path
    pos = 12
    nch = 1
    bits = 16
    pcm = None
    while pos + 8 <= len(data):
        cid = data[pos : pos + 4]
        size = struct.unpack(">I", data[pos + 4 : pos + 8])[0]
        body = data[pos + 8 : pos + 8 + size]
        if cid == b"COMM":
            nch = struct.unpack(">H", body[0:2])[0]
            bits = struct.unpack(">H", body[6:8])[0]
            exp = struct.unpack(">H", body[8:10])[0]
            mant = struct.unpack(">Q", body[10:18])[0]
            sr = mant * 2.0 ** -63 * (2.0 ** (exp - 16383)) if exp else 0.0
        elif cid == b"SSND":
            off = struct.unpack(">I", body[0:4])[0]
            pcm = body[8 + off :]
        pos += 8 + size + (size % 2)
    if bits == 16:
        a = np.frombuffer(pcm, dtype=">i2").astype(np.float32) / 32768.0
    elif bits == 24:
        raw = np.frombuffer(pcm, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        val = (raw[:, 0] << 16) | (raw[:, 1] << 8) | raw[:, 2]
        val = np.where(val & 0x800000, val - 0x1000000, val)
        a = val.astype(np.float32) / 8388608.0
    elif bits == 8:
        a = np.frombuffer(pcm, dtype=np.uint8).astype(np.float32) / 128.0 - 1.0
    else:
        raise ValueError(f"unsupported bits {bits} in {path}")
    if nch > 1:
        a = a[: len(a) - len(a) % nch].reshape(-1, nch).mean(axis=1)
    return a, sr


def resample(a, sr, target):
    if sr == target or sr <= 0:
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


def import_sound(src, dst, max_sec=None):
    a, sr = read_aiff(os.path.join(SRC_AUDIO, src))
    if max_sec:
        a = a[: int(max_sec * sr)]
    a = resample(a, sr, TARGET_SR)
    write_wav(os.path.join(OUT_SND, dst), a)
    print(f"OK   {dst:14s} <- {src:24s} {a.size/TARGET_SR:6.2f}s")


# ---------------- sprite frames -> enemy PNGs ----------------
def tint_rgba(im, rgb):
    """Recolor the non-transparent pixels toward rgb while keeping the shape."""
    a = np.array(im).astype(np.float32)
    r, g, b = rgb
    out = a.copy()
    mask = a[..., 3] > 8
    out[..., 0] = np.where(mask, r, 0)
    out[..., 1] = np.where(mask, g, 0)
    out[..., 2] = np.where(mask, b, 0)
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def export_frames():
    sheet = Image.open(SRC_SPRITE).convert("RGBA")
    IH = sheet.size[1]
    meta = open(SRC_SPRITE + ".meta", encoding="utf-8").read()
    import re

    def rect(idx):
        m = re.search(
            r"- name: Scavengers_SpriteSheet_" + str(idx)
            + r"\s+rect:\s+serializedVersion: 2\s+x: (\d+)\s+y: (\d+)\s+width: (\d+)\s+height: (\d+)",
            meta,
        )
        x, y, w, h = map(int, m.groups())
        return (x, IH - (y + h), w, h)  # unity y (from bottom) -> image y

    def sprite(idx):
        x, y, w, h = rect(idx)
        return sheet.crop((x, y, x + w, y + h))

    # sprite layout: 0-5 player walk, 6-11 enemy A, 12-17 enemy B, 19 projectile
    # use 4 frames each for a smaller asset set
    player_walk = [trim(sprite(i)) for i in range(4)]
    enemyA = [trim(sprite(i)) for i in range(6, 10)]
    enemyB = [trim(sprite(i)) for i in range(12, 16)]

    # player sprites (original colors)
    for i, f in enumerate(player_walk):
        save_scaled(f, f"vamp-pw{i}.png", (27, 29))

    # enemies: kinds 0/1 use enemy A, kinds 2/3 use enemy B, tinted
    pals = [(206, 62, 62), (226, 138, 42), (74, 170, 94), (160, 84, 226)]
    bases = [enemyA, enemyA, enemyB, enemyB]
    sizes = [(24, 26), (20, 22), (38, 41), (22, 24)]
    for k in range(4):
        for i, f in enumerate(bases[k]):
            save_scaled(tint_rgba(f, pals[k]), f"vamp-e{k}-{i}.png", sizes[k])

    # projectile from sprite 19
    save_scaled(trim(sprite(19)), "vamp-bullet.png", (10, 10))


if __name__ == "__main__":
    os.makedirs(OUT_SND, exist_ok=True)
    os.makedirs(OUT_IMG, exist_ok=True)
    import_sound("scavengers_footstep1.aif", "move1.wav")
    import_sound("scavengers_footstep2.aif", "move2.wav")
    import_sound("scavengers_fruit1.aif", "food.wav")
    import_sound("scavengers_fruit2.aif", "dayup.wav")
    import_sound("scavengers_soda1.aif", "soda.wav")
    import_sound("scavengers_chop1.aif", "chop1.wav")
    import_sound("scavengers_chop2.aif", "chop2.wav")
    import_sound("scavengers_enemy1.aif", "ehurt1.wav")
    import_sound("scavengers_enemy2.aif", "ehurt2.wav")
    import_sound("scavengers_die.aif", "die.wav")
    import_sound("scavengers_music.aif", "bgm.wav", max_sec=12)
    import_sound("scavengers_music.aif", "start.wav", max_sec=2.5)
    export_frames()
    print("done")
