"""Validate the jumpjump turning physics: simulate jumps along u/v axes and
check that landing detection (the same rules as the game) works symmetrically
after a 90-degree turn."""
import math
import random

# Game constants (mirror of jumpjump.ts)
G = 900
JUMP_VY = 420
MIN_VX = 20
MAX_VX = 220
S = 60
M = 6
FLIGHT = 2 * JUMP_VY / G  # total air time (seconds)
DIR_U, DIR_V = 0, 1

def distance_for(vx):
    return vx * FLIGHT

def vx_for_distance(d):
    return min(MAX_VX, max(MIN_VX, d / FLIGHT))

random.seed(12345)
fail = 0
total = 0
# Simulate a long run with random turns; for each jump we aim at a specific
# gap (choose a vx that puts us in the landing window) and check the landing
# check passes for the target block on whichever axis it is on.
for trial in range(2000):
    # random state
    cu, cv = 0.0, 0.0
    cur_dir = DIR_U
    for jump in range(6):
        # spawn next (45% turn like the game)
        nd = cur_dir
        if random.random() < 0.45:
            nd = 1 - nd
        ramp = min((jump) * 1.2, 50)  # score ~ jump count
        gap = random.uniform(70 + ramp, 150 + ramp)
        nu = cu + (gap if nd == DIR_U else 0)
        nv = cv - (gap if nd == DIR_V else 0)  # turn up-left (-v)
        # choose vx to land inside the target block window
        # landing window distance: [gap - S/2 + M, gap + S/2 - M]
        target = gap  # aim center
        vx = vx_for_distance(target)
        d = distance_for(vx)
        # integrate flight
        ch = 40.0
        vh = JUMP_VY
        t = 0.0
        dt = 1 / 240
        landed = False
        while t < FLIGHT + 0.05:
            if nd == DIR_U:
                cu += vx * dt
            else:
                cv -= vx * dt  # up-left (-v)
            vh -= G * dt
            ch += vh * dt
            t += dt
            if vh <= 0:
                # landing checks (top-surface crossing)
                on_next = (abs(cu - nu) <= S / 2 - M and abs(cv - nv) <= S / 2 - M)
                if on_next:
                    landed = True
                    break
        total += 1
        if not landed:
            fail += 1
        # advance state
        cur_dir = nd
        cu, cv = nu, nv

print(f"simulated {total} jumps, {fail} missed (want 0)")

# Also verify the visual turn: a path u->v->u produces a polyline in screen space
def projX(u, v, camU, camV, OX=240, A=0.866):
    return OX + ((u - camU) + (v - camV)) * A

def projY(u, v, h, camU, camV, OY=250, B=0.5, C=1.0):
    return OY + ((v - camV) - (u - camU)) * B - h * C

print("\nPath check (world -> screen):")
cu, cv, camU, camV = 0, 0, 0, 0
print(f"start  (u={cu:5.0f}, v={cv:5.0f}) screen=({projX(cu,cv,camU,camV):5.0f},{projY(cu,cv,40,camU,camV):5.0f})")
d = 120
cu += d  # straight along u (up-right)
camU += d
print(f"after +u (u={cu:5.0f}, v={cv:5.0f}) screen=({projX(cu,cv,camU,camV):5.0f},{projY(cu,cv,40,camU,camV):5.0f})")
cv -= d  # turn up-left (-v)
camV += cv
print(f"after -v (u={cu:5.0f}, v={cv:5.0f}) screen=({projX(cu,cv,camU,camV):5.0f},{projY(cu,cv,40,camU,camV):5.0f})")
