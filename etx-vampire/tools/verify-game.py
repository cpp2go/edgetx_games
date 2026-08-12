"""Simulate the Vampire Survivors core loop to validate it runs sanely:
enemies chase the player, auto-fire kills them, gems are magnetized and level
the player up, contact damages the player until game over."""
import math
import random

W, H = 480, 320
WW, WH = W * 3, H * 3
random.seed(7)

# --- player state (mirror vampire.ts defaults) ---
px, py = WW / 2, WH / 2
hp, max_hp = 100, 100
speed = 155
inv = 0.0
dmg, fire_rate, bullet_speed, bullet_count, pierce = 12, 2.6, 275, 1, 0
fire_timer = 0.3
level, exp, exp_next, kills = 1, 0, 6, 0
t = 0.0
magnet = 85
spawn_timer = 0.6
spawn_interval = 1.0
scale = 1.0
enemies = []
bullets = []
gems = []
levelups = 0
max_enemies = 0
stat = {"shots": 0, "hit": 0, "killed": 0, "hurt": 0}


def spawn_enemy():
    global scale
    # spawn just outside the camera view, in a random direction around the player
    R = max(W, H) * 0.8
    ang = random.uniform(0, 2 * math.pi)
    x = max(10, min(WW - 10, px + math.cos(ang) * R))
    y = max(10, min(WH - 10, py + math.sin(ang) * R))
    unlock = [0, 25, 50, 80, 110, 145, 180, 220, 265, 320, 380, 450, 520, 600, 690, 790]
    max_kind = 0
    for k, u in enumerate(unlock):
        if t > u:
            max_kind = k
    kind = random.randrange(max_kind + 1)
    stats = {
        0: (10, 42, 8, 1),
        1: (7, 78, 9, 2),
        2: (6, 90, 9, 2),
        3: (14, 55, 9, 3),
        4: (38, 24, 10, 5),
        5: (22, 40, 10, 4),
        6: (30, 60, 12, 6),
        7: (55, 22, 12, 8),
        8: (26, 95, 12, 7),
        9: (70, 35, 12, 10),
        10: (90, 26, 14, 12),
        11: (200, 18, 17, 25),
        12: (140, 30, 14, 16),
        13: (120, 68, 14, 18),
        14: (180, 26, 14, 20),
        15: (150, 44, 14, 22),
    }[kind]
    h = math.floor(stats[0] * scale)
    enemies.append({"x": x, "y": y, "hp": h, "max": h, "speed": stats[1] * (1 + (scale - 1) * 0.5),
                    "r": stats[2], "exp": stats[3]})


def fire():
    global enemies, bullets
    if not enemies:
        return
    e = min(enemies, key=lambda e: (e["x"] - px) ** 2 + (e["y"] - py) ** 2)
    base = math.atan2(e["y"] - py, e["x"] - px)
    spread = 0.42
    for i in range(bullet_count):
        ang = base + (i - (bullet_count - 1) / 2) * spread
        bullets.append({"x": px + math.cos(ang) * 14, "y": py + math.sin(ang) * 14,
                        "vx": math.cos(ang) * bullet_speed, "vy": math.sin(ang) * bullet_speed,
                        "dmg": dmg, "pierce": pierce, "life": 1.6})
    stat["shots"] += bullet_count
    if len(bullets) > 70:
        del bullets[:len(bullets) - 70]


def kill_enemy(j):
    global kills, gems
    e = enemies[j]
    del enemies[j]
    kills += 1
    stat["killed"] += 1
    gems.append({"x": e["x"], "y": e["y"], "val": e["exp"]})
    if len(gems) > 90:
        del gems[:len(gems) - 90]


def gain_exp(v):
    global exp, level, exp_next, levelups
    exp += v
    while exp >= exp_next:
        exp -= exp_next
        level += 1
        exp_next = math.floor(6 + level * 2.5)
        levelups += 1


def hurt(d):
    global hp, inv
    hp -= d
    inv = 1.0
    stat["hurt"] += 1
    if hp <= 0:
        return False
    return True


DT = 1 / 240
while t < 300 and hp > 0:
    dt = DT
    t += dt
    spawn_interval = max(0.28, 1.0 * 0.92 ** (t / 10))
    scale = 1 + t / 15 * 0.15

    if inv > 0:
        inv -= dt

    fire_timer -= dt
    if fire_timer <= 0:
        fire_timer = 1 / fire_rate
        fire()

    for b in list(bullets):
        b["x"] += b["vx"] * dt
        b["y"] += b["vy"] * dt
        b["life"] -= dt
        camx, camy = px - W / 2, py - H / 2
        if b["life"] <= 0 or not (camx - 40 <= b["x"] <= camx + W + 40 and camy - 40 <= b["y"] <= camy + H + 40):
            bullets.remove(b)
            continue
        for j in range(len(enemies) - 1, -1, -1):
            e = enemies[j]
            rr = e["r"] + 3
            if (e["x"] - b["x"]) ** 2 + (e["y"] - b["y"]) ** 2 <= rr * rr:
                stat["hit"] += 1
                e["hp"] -= b["dmg"]
                if e["hp"] <= 0:
                    kill_enemy(j)
                if b["pierce"] > 0:
                    b["pierce"] -= 1
                else:
                    bullets.remove(b)
                    break

    for i in range(len(enemies) - 1, -1, -1):
        e = enemies[i]
        dx = px - e["x"]
        dy = py - e["y"]
        d = math.hypot(dx, dy)
        if d > 1:
            e["x"] += dx / d * e["speed"] * dt
            e["y"] += dy / d * e["speed"] * dt
        if d <= e["r"] + 11 and inv <= 0:
            if not hurt(14):
                break
            if d > 1:
                e["x"] -= dx / d * 26
                e["y"] -= dy / d * 26

    for i in range(len(gems) - 1, -1, -1):
        g = gems[i]
        dx = px - g["x"]
        dy = py - g["y"]
        d = math.hypot(dx, dy)
        pull = 320 if d < magnet else 90
        if d > 6:
            g["x"] += dx / d * pull * dt
            g["y"] += dy / d * pull * dt
        else:
            gain_exp(g["val"])
            del gems[i]

    spawn_timer -= dt
    if spawn_timer <= 0:
        spawn_timer = spawn_interval
        if len(enemies) < 80:
            spawn_enemy()
    max_enemies = max(max_enemies, len(enemies))

print(f"simulated {t:.0f}s  hp={hp:.0f}  level={level}  levelups={levelups}")
print(f"kills={kills}  max_enemies_on_screen={max_enemies}  gems={len(gems)}  bullets={len(bullets)}")
print(f"stats: shots={stat['shots']} hit={stat['hit']} killed={stat['killed']} hurt={stat['hurt']}")
print("player survived:", "survived 300s" if hp > 0 else f"died at {t:.0f}s")
