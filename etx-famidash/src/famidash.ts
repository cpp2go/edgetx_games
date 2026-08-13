// Famidash — a Geometry Dash-style auto-runner for EdgeTX / OpenTX color
// transmitters (480x320). The cube runs right on its own; jump over spikes,
// ride blocks, bounce on pads, tap orbs for mid-air jumps, then fly the ship
// through a corridor. Practice mode (PLUS) with touch-tap checkpoints.
//
// Written in TypeScript, compiled to Lua 5.2 (see package.json / tsconfig).

// EdgeTX declares only the _FIRST variants for the MDL / TELE keys; the
// _BREAK (release) events exist too, so we declare them locally (same as
// the mario game in this collection).
declare const EVT_MODEL_BREAK: number;
declare const EVT_TELEM_BREAK: number;

interface Obj {
    x: number; // left edge in world px
    t: number; // type: 0 spike, 1 block, 2 spike-on-block, 3 pad, 4 orb, 5 ship portal, 6 cube portal, 7 coin
    h: number; // block height in tiles, or screen-y for orb/coin
    y: number; // top screen y (blocks) / center y (orb, coin)
    w: number; // width px
    hh: number; // solid height px
    used: boolean; // consumed (orb / coin)
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    t: number;
    life: number;
    col: number;
}

const OBJ_SPIKE = 0;
const OBJ_BLOCK = 1;
const OBJ_SB = 2;
const OBJ_PAD = 3;
const OBJ_ORB = 4;
const OBJ_SHIP = 5;
const OBJ_CUBE = 6;
const OBJ_COIN = 7;
const OBJ_CEIL = 8; // ceiling block hanging from the top (ship obstacle)

class Game {
    private w = 480;
    private h = 320;
    private TS = 32;
    private CS = 30; // player size
    private cubeX = 96; // fixed screen x of the player
    private groundY = 272; // top of the floor
    private ceilY = 40; // ceiling (ship)
    private SPEED = 300;
    private GRAV = 3400;
    private JUMPV = 760;
    private MAXFALL = 1300;
    private SHIPG = 700; // gravity in ship mode
    private THRUST = 1900;

    private phase = { title: 0, play: 1, complete: 2 };
    private state = 0;

    // player
    private py = 0; // screen top
    private vy = 0;
    private prevBottom = 0;
    private grounded = true;
    private mode = 0; // 0 cube, 1 ship
    private jumpHeld = false;
    private jumpPressed = false;
    private bufT = 0; // jump buffering
    private rot = 0;
    private dead = false;
    private deathT = 0;

    // world
    private camX = 0;
    private objects: Obj[] = [];
    private levelLen = 0;
    private bgX = 0;

    // run data
    private attempts = 0;
    private coins = 0;
    private best = 0;
    private practice = false;
    private ckX = 0;
    private ckMode = 0;
    private ckFlash = 0;
    private particles: Particle[] = [];
    private last = 0;
    private anim = 0;
    private titleT = 0;

    // ---------- run setup ----------
    private addObj(x: number, t: number, h: number, y: number, w: number, hh: number) {
        this.objects.push({ x: x, t: t, h: h, y: y, w: w, hh: hh, used: false });
    }
    private spike(x: number) {
        this.addObj(x, OBJ_SPIKE, 0, 0, this.TS, 0);
    }
    private spikeRow(x: number, n: number, gap: number) {
        for (let i = 0; i < n; i++) this.spike(x + i * (this.TS + gap));
    }
    private block(x: number, h: number) {
        this.addObj(x, OBJ_BLOCK, h, this.groundY - h * this.TS, this.TS, h * this.TS);
    }
    private spikeBlock(x: number, h: number) {
        this.addObj(x, OBJ_SB, h, this.groundY - h * this.TS, this.TS, h * this.TS);
    }
    private pad(x: number) {
        this.addObj(x, OBJ_PAD, 0, 0, this.TS, 0);
    }
    private orb(x: number, y: number) {
        this.addObj(x, OBJ_ORB, 0, y, 0, 0);
    }
    private shipP(x: number) {
        this.addObj(x, OBJ_SHIP, 0, 0, 8, 0);
    }
    private cubeP(x: number) {
        this.addObj(x, OBJ_CUBE, 0, 0, 8, 0);
    }
    private coin(x: number, y: number) {
        this.addObj(x, OBJ_COIN, 0, y, 0, 0);
    }
    private ceilBlock(x: number, hh: number) {
        this.addObj(x, OBJ_CEIL, 0, this.ceilY, this.TS, hh);
    }

    private buildLevel() {
        this.objects = [];
        const T = this.TS;
        // ---- Cube section: rhythm single jumps + tall spike-blocks ----
        this.spike(8 * T);
        this.spike(15 * T);
        this.spike(22 * T);
        this.spikeBlock(29 * T, 1);
        this.coin(32 * T, 140);
        this.spike(38 * T);
        this.spike(45 * T);
        this.spikeBlock(52 * T, 1);
        this.spike(61 * T);
        this.spike(68 * T);
        this.spike(75 * T);
        this.spike(82 * T);
        this.spikeBlock(89 * T, 1);
        this.coin(93 * T, 120);
        this.spike(98 * T);
        this.spike(105 * T);
        this.spike(112 * T);
        this.spike(119 * T);
        this.spikeBlock(126 * T, 1);
        this.spike(135 * T);
        this.spike(142 * T);
        this.spike(149 * T);
        this.spike(156 * T);
        this.spikeBlock(163 * T, 1);
        this.coin(168 * T, 100);
        this.spike(172 * T);
        this.spike(179 * T);
        this.spike(186 * T);
        this.spike(193 * T);
        this.spikeBlock(200 * T, 1);
        this.spike(209 * T);
        this.spike(216 * T);
        this.spike(223 * T);
        this.spike(230 * T);
        this.spikeBlock(237 * T, 1);

        // ---- Ship portal into the corridor ----
        this.shipP(244 * T);
        // floor spikes + hanging ceiling blocks form an S-shaped corridor:
        // the ship must thread the band between the ceiling-block bottoms
        // (~195) and the floor spikes.
        this.spike(250 * T);
        this.ceilBlock(254 * T, 122);
        this.spike(260 * T);
        this.ceilBlock(264 * T, 122);
        this.spike(270 * T);
        this.spike(272 * T);
        this.ceilBlock(276 * T, 122);
        this.spike(282 * T);
        this.ceilBlock(286 * T, 122);
        this.coin(290 * T, 200);
        this.spike(292 * T);
        this.spike(294 * T);
        this.spike(296 * T);
        this.ceilBlock(302 * T, 122);
        this.spike(308 * T);
        this.ceilBlock(312 * T, 122);
        this.cubeP(318 * T);

        // ---- Back to cube ----
        this.spike(324 * T);
        this.spike(331 * T);
        this.spikeBlock(338 * T, 1);
        this.coin(344 * T, 150);
        this.spike(347 * T);
        this.spike(354 * T);
        this.spike(361 * T);
        this.spike(368 * T);
        this.spikeBlock(375 * T, 1);
        this.spike(384 * T);
        this.spike(391 * T);
        this.spike(398 * T);
        this.spike(405 * T);
        this.spikeBlock(412 * T, 1);

        this.levelLen = 430 * T;
    }

    private resetPlayer() {
        this.py = this.groundY - this.CS;
        this.vy = 0;
        this.grounded = true;
        this.mode = 0;
        this.rot = 0;
        this.dead = false;
        this.deathT = 0;
        this.bufT = 0;
        this.jumpHeld = false;
    }

    private startRun() {
        this.buildLevel();
        this.attempts = 1;
        this.coins = 0;
        this.practice = false;
        this.ckX = 0;
        this.ckMode = 0;
        this.ckFlash = 0;
        this.camX = 0;
        this.particles = [];
        this.resetPlayer();
        this.state = this.phase.play;
        this.playSfx(720, 40, 0);
    }

    private toTitle() {
        this.state = this.phase.title;
        this.camX = 0;
        this.particles = [];
        this.resetPlayer();
    }

    // ---------- input ----------
    private isConfirm(event: number): boolean {
        return (
            event == EVT_ENTER_BREAK ||
            event == EVT_VIRTUAL_ENTER ||
            event == EVT_MODEL_FIRST ||
            event == EVT_TELEM_FIRST ||
            event == EVT_TOUCH_FIRST
        );
    }
    private isJumpPress(event: number): boolean {
        return (
            event == EVT_ENTER_LONG ||
            event == EVT_VIRTUAL_ENTER_LONG ||
            event == EVT_MODEL_FIRST ||
            event == EVT_TELEM_FIRST ||
            event == EVT_TOUCH_FIRST
        );
    }
    private isJumpRelease(event: number): boolean {
        return (
            event == EVT_ENTER_BREAK ||
            event == EVT_VIRTUAL_ENTER ||
            event == EVT_MODEL_BREAK ||
            event == EVT_TELEM_BREAK ||
            event == EVT_TOUCH_BREAK
        );
    }

    private onEvent(event: number) {
        if (event == EVT_EXIT_BREAK || event == EVT_VIRTUAL_EXIT) {
            return;
        }
        if (event == EVT_SYS_BREAK) {
            this.toTitle();
            return;
        }
        if (this.state == this.phase.title || this.state == this.phase.complete) {
            if (this.isConfirm(event)) {
                if (this.state == this.phase.title) {
                    this.startRun();
                } else {
                    this.toTitle();
                }
            }
            return;
        }
        // playing
        if (event == EVT_PLUS_FIRST) {
            this.togglePractice();
            return;
        }
        if (event == EVT_TOUCH_TAP) {
            if (this.practice) {
                this.placeCheckpoint();
            }
            return;
        }
        if (this.isJumpPress(event)) {
            this.pressJump();
        } else if (this.isJumpRelease(event)) {
            this.jumpHeld = false;
        }
    }

    private pressJump() {
        this.jumpHeld = true;
        this.jumpPressed = true;
        this.bufT = 0.12;
    }

    private togglePractice() {
        this.practice = !this.practice;
        if (!this.practice) {
            this.ckX = 0;
            this.ckMode = 0;
        }
        this.playSfx(this.practice ? 880 : 480, 40, 0);
    }

    private placeCheckpoint() {
        this.ckX = this.camX;
        this.ckMode = this.mode;
        this.ckFlash = 1.2;
        this.playSfx(1000, 50, 0);
    }

    private doJump() {
        this.vy = -this.JUMPV;
        this.grounded = false;
        this.bufT = 0;
        this.playSfx(560, 60, 8);
    }

    private explode() {
        const cx = this.camX + this.cubeX + this.CS / 2;
        const cy = this.py + this.CS / 2;
        const cols = [0xf8c030, 0xf87020, 0xffffff];
        for (let i = 0; i < 20; i++) {
            const a = (i / 20) * 6.2832;
            const sp = 60 + Math.random() * 220;
            this.particles.push({
                x: cx,
                y: cy,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 60,
                t: 0,
                life: 0.6 + Math.random() * 0.5,
                col: cols[i % 3],
            });
        }
        this.playSfx(120, 300, 0);
    }

    private respawn() {
        this.attempts++;
        this.dead = false;
        this.deathT = 0;
        if (this.practice && this.ckX > 0) {
            this.camX = this.ckX;
            this.mode = this.ckMode;
        } else {
            this.camX = 0;
            this.mode = 0;
        }
        this.py = this.groundY - this.CS;
        this.vy = 0;
        this.grounded = true;
        this.rot = 0;
        this.bufT = 0;
        this.jumpHeld = false;
    }

    // ---------- update ----------
    private updateParticles(dt: number) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.t += dt;
            p.vy += 1500 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.t >= p.life) {
                this.particles.splice(i, 1);
            }
        }
    }

    private kill() {
        if (this.dead) return;
        this.dead = true;
        this.deathT = 0.95;
        this.explode();
    }

    private update(dt: number) {
        this.anim += dt;
        this.titleT += dt;
        if (this.ckFlash > 0) this.ckFlash -= dt;
        if (this.dead) {
            this.deathT -= dt;
            this.updateParticles(dt);
            if (this.deathT <= 0) {
                this.respawn();
            }
            return;
        }

        this.camX += this.SPEED * dt;
        if (this.camX >= this.levelLen) {
            this.state = this.phase.complete;
            this.playSfx(700, 60, 0);
            this.playSfx(900, 60, 0);
            this.playSfx(1200, 80, 0);
            if (this.best < 100) this.best = 100;
            return;
        }

        const wx = this.camX + this.cubeX;
        const wxc = wx + this.CS / 2;

        // jump buffer
        if (this.bufT > 0) {
            this.bufT -= dt;
            if (this.bufT < 0) this.bufT = 0;
        }

        // --- physics per mode ---
        if (this.mode == 0) {
            this.vy += this.GRAV * dt;
            if (this.vy > this.MAXFALL) this.vy = this.MAXFALL;
            this.prevBottom = this.py + this.CS;
            this.py += this.vy * dt;
            const bottom = this.py + this.CS;

            this.grounded = false;
            if (bottom >= this.groundY) {
                this.py = this.groundY - this.CS;
                this.vy = 0;
                this.grounded = true;
            }
            if (this.bufT > 0 && this.grounded) {
                this.doJump();
                this.bufT = 0;
            }

            // collide with objects
            for (let i = 0; i < this.objects.length; i++) {
                const o = this.objects[i];
                if (o.t == OBJ_BLOCK || o.t == OBJ_SB) {
                    const top = o.y;
                    const bot = top + o.hh;
                    const overlap =
                        wx + this.CS > o.x && wx < o.x + o.w;
                    if (overlap) {
                        // landed on top this frame?
                        if (this.vy >= 0 && this.prevBottom <= top && this.py + this.CS >= top) {
                            this.py = top - this.CS;
                            this.vy = 0;
                            this.grounded = true;
                            if (this.bufT > 0) {
                                this.doJump();
                                this.bufT = 0;
                            }
                        } else if (this.py + this.CS > top + 4 && this.py < bot) {
                            // hit the side
                            this.kill();
                            return;
                        }
                    }
                    // spike sitting on top of a block
                    if (o.t == OBJ_SB && !this.dead) {
                        const st = top - this.TS * 0.62;
                        const sl = o.x + this.TS * 0.22;
                        const sr = o.x + this.TS * 0.78;
                        if (
                            this.py + this.CS > st &&
                            wx + this.CS > sl &&
                            wx < sr
                        ) {
                            this.kill();
                            return;
                        }
                    }
                } else if (o.t == OBJ_SPIKE) {
                    const st = this.groundY - this.TS * 0.62;
                    const sl = o.x + this.TS * 0.22;
                    const sr = o.x + this.TS * 0.78;
                    if (
                        this.py + this.CS > st &&
                        wx + this.CS > sl &&
                        wx < sr
                    ) {
                        this.kill();
                        return;
                    }
                } else if (o.t == OBJ_PAD) {
                    const pl = o.x + this.TS * 0.1;
                    const pr = o.x + this.TS * 0.9;
                    if (this.grounded && this.vy >= -100 && wx + this.CS > pl && wx < pr) {
                        this.vy = -this.JUMPV * 1.5;
                        this.grounded = false;
                        this.playSfx(520, 60, 8);
                    }
                } else if (o.t == OBJ_ORB) {
                    if (!o.used && this.jumpPressed) {
                        const dx = wxc - o.x;
                        const dy = this.py + this.CS / 2 - o.h;
                        if (dx * dx + dy * dy < (this.TS * 1.15) * (this.TS * 1.15)) {
                            o.used = true;
                            this.vy = -this.JUMPV * 0.85;
                            this.grounded = false;
                            this.bufT = 0;
                            this.playSfx(880, 50, 4);
                        }
                    }
                } else if (o.t == OBJ_COIN) {
                    if (!o.used) {
                        const dx = wxc - o.x;
                        const dy = this.py + this.CS / 2 - o.h;
                        if (dx * dx + dy * dy < 24 * 24) {
                            o.used = true;
                            this.coins++;
                            this.playSfx(1400, 40, 0);
                            // sparkle
                            for (let k = 0; k < 8; k++) {
                                const a = (k / 8) * 6.2832;
                                this.particles.push({
                                    x: o.x,
                                    y: o.h,
                                    vx: Math.cos(a) * 90,
                                    vy: Math.sin(a) * 90,
                                    t: 0,
                                    life: 0.4,
                                    col: 0xffe040,
                                });
                            }
                        }
                    }
                } else if (o.t == OBJ_SHIP || o.t == OBJ_CUBE) {
                    // portal: switch when the player's centre crosses its x
                    const prev = this.camX + this.cubeX - this.SPEED * dt;
                    if (wxc >= o.x && prev < o.x) {
                        this.mode = o.t == OBJ_SHIP ? 1 : 0;
                        this.playSfx(650, 50, 0);
                    }
                }
            }

            // airborne rotation
            if (!this.grounded) {
                this.rot += this.vy * 0.02 * dt * 60;
            } else {
                this.rot = 0;
            }
        } else {
            // ---- ship mode ----
            this.vy += this.SHIPG * dt;
            if (this.jumpHeld) {
                this.vy -= this.THRUST * dt;
            }
            if (this.vy > 660) this.vy = 660;
            if (this.vy < -560) this.vy = -560;
            this.py += this.vy * dt;
            this.rot = Math.sin(this.anim * 6) * 0.12;

            // boundaries
            if (this.py < this.ceilY || this.py + this.CS > this.groundY) {
                this.kill();
                return;
            }

            for (let i = 0; i < this.objects.length; i++) {
                const o = this.objects[i];
                if (o.t == OBJ_BLOCK || o.t == OBJ_SB) {
                    const top = o.y;
                    const bot = top + o.hh;
                    const overlap = wx + this.CS > o.x && wx < o.x + o.w;
                    if (overlap && this.py + this.CS > top && this.py < bot) {
                        this.kill();
                        return;
                    }
                    if (o.t == OBJ_SB && !this.dead) {
                        const st = top - this.TS * 0.62;
                        const sl = o.x + this.TS * 0.22;
                        const sr = o.x + this.TS * 0.78;
                        if (
                            this.py + this.CS > st &&
                            wx + this.CS > sl &&
                            wx < sr
                        ) {
                            this.kill();
                            return;
                        }
                    }
                } else if (o.t == OBJ_SPIKE) {
                    const st = this.groundY - this.TS * 0.62;
                    const sl = o.x + this.TS * 0.22;
                    const sr = o.x + this.TS * 0.78;
                    if (
                        this.py + this.CS > st &&
                        wx + this.CS > sl &&
                        wx < sr
                    ) {
                        this.kill();
                        return;
                    }
                } else if (o.t == OBJ_CEIL) {
                    const overlap = wx + this.CS > o.x && wx < o.x + o.w;
                    if (overlap && this.py < o.y + o.hh && this.py + this.CS > o.y) {
                        this.kill();
                        return;
                    }
                } else if (o.t == OBJ_ORB) {
                    if (!o.used && this.jumpPressed) {
                        const dx = wxc - o.x;
                        const dy = this.py + this.CS / 2 - o.h;
                        if (dx * dx + dy * dy < (this.TS * 1.3) * (this.TS * 1.3)) {
                            o.used = true;
                            this.vy = -this.JUMPV * 1.0;
                            this.playSfx(880, 50, 4);
                        }
                    }
                } else if (o.t == OBJ_COIN) {
                    if (!o.used) {
                        const dx = wxc - o.x;
                        const dy = this.py + this.CS / 2 - o.h;
                        if (dx * dx + dy * dy < 24 * 24) {
                            o.used = true;
                            this.coins++;
                            this.playSfx(1400, 40, 0);
                        }
                    }
                } else if (o.t == OBJ_SHIP || o.t == OBJ_CUBE) {
                    const prev = this.camX + this.cubeX - this.SPEED * dt;
                    if (wxc >= o.x && prev < o.x) {
                        this.mode = o.t == OBJ_SHIP ? 1 : 0;
                        this.playSfx(650, 50, 0);
                    }
                }
            }
        }

        this.jumpPressed = false;
        this.updateParticles(dt);
    }
    private playSfx(freq: number, dur: number, pause: number) {
        (playTone as unknown as (f: number, d: number, p: number) => void)(freq, dur, pause);
    }
    private flushSfx() {
        (flushAudio as unknown as () => void)();
    }

    // ---------- drawing ----------
    private drawBg() {
        // sky gradient bands
        const bands = [
            [0, 80, lcd.RGB(8, 12, 26)],
            [80, 160, lcd.RGB(12, 20, 40)],
            [160, this.groundY, lcd.RGB(18, 32, 58)],
        ];
        for (let i = 0; i < bands.length; i++) {
            lcd.drawFilledRectangle(0, bands[i][0] as number, this.w, (bands[i][1] as number) - (bands[i][0] as number), bands[i][2] as number);
        }

        // parallax pixels (background "blocks")
        const layer1 = (this.camX * 0.25) % 64;
        for (let x = -64; x < this.w + 64; x += 64) {
            const sx = x - layer1;
            const col = lcd.RGB(30, 46, 78);
            lcd.drawFilledRectangle(sx, this.groundY - 90, 22, 14, col);
            lcd.drawFilledRectangle(sx + 30, this.groundY - 130, 16, 10, col);
        }
        const layer2 = (this.camX * 0.5) % 96;
        const col2 = lcd.RGB(40, 60, 96);
        for (let x = -96; x < this.w + 96; x += 96) {
            const sx = x - layer2;
            lcd.drawFilledRectangle(sx, this.groundY - 52, 30, 12, col2);
        }

        // ground
        lcd.drawFilledRectangle(0, this.groundY, this.w, this.h - this.groundY, lcd.RGB(24, 28, 40));
        lcd.drawFilledRectangle(0, this.groundY, this.w, 4, lcd.RGB(56, 92, 140));
        // scrolling ground dashes
        const gx = this.camX % 48;
        for (let x = -48; x < this.w + 48; x += 48) {
            const sx = x - gx;
            lcd.drawFilledRectangle(sx, this.groundY + 14, 22, 5, lcd.RGB(40, 48, 66));
        }
    }

    private drawSpike(sx: number, baseY: number) {
        const s = this.TS;
        lcd.drawLine(sx, baseY, sx + s / 2, baseY - s, SOLID, lcd.RGB(240, 240, 255));
        lcd.drawLine(sx + s / 2, baseY - s, sx + s, baseY, SOLID, lcd.RGB(240, 240, 255));
        lcd.drawLine(sx + s, baseY, sx, baseY, SOLID, lcd.RGB(240, 240, 255));
        lcd.drawLine(sx, baseY - 1, sx + s / 2, baseY - s + 1, SOLID, lcd.RGB(120, 150, 220));
        lcd.drawLine(sx + s / 2, baseY - s + 1, sx + s, baseY - 1, SOLID, lcd.RGB(120, 150, 220));
    }

    private drawBlock(sx: number, top: number, w: number, hh: number) {
        lcd.drawFilledRectangle(sx, top, w, hh, lcd.RGB(60, 70, 110));
        lcd.drawRectangle(sx, top, w, hh, lcd.RGB(170, 190, 255));
        lcd.drawFilledRectangle(sx + 3, top + 3, w - 6, 4, lcd.RGB(110, 130, 200));
        lcd.drawFilledRectangle(sx + 3, top + hh - 7, w - 6, 4, lcd.RGB(40, 46, 80));
    }

    private drawPad(sx: number) {
        const s = this.TS;
        lcd.drawFilledRectangle(sx + 4, this.groundY - 12, s - 8, 12, lcd.RGB(255, 220, 60));
        lcd.drawFilledCircle(sx + s / 2, this.groundY - 12, 10, lcd.RGB(255, 220, 60));
        lcd.drawFilledCircle(sx + s / 2, this.groundY - 12, 6, lcd.RGB(255, 245, 160));
    }

    private drawOrb(sx: number, cy: number) {
        const r = 9 + Math.sin(this.anim * 8) * 2;
        lcd.drawFilledCircle(sx, cy, r, lcd.RGB(255, 220, 60));
        lcd.drawFilledCircle(sx, cy, r - 4, lcd.RGB(20, 30, 60));
        lcd.drawFilledCircle(sx, cy, r - 6, lcd.RGB(255, 235, 130));
    }

    private drawPortal(sx: number, ship: boolean) {
        const col = ship ? lcd.RGB(80, 200, 255) : lcd.RGB(90, 255, 130);
        const col2 = ship ? lcd.RGB(30, 120, 180) : lcd.RGB(30, 160, 70);
        lcd.drawFilledRectangle(sx, this.ceilY, 8, this.groundY - this.ceilY, col2);
        // swirl
        const yy = this.groundY - ((this.anim * 120) % (this.groundY - this.ceilY)) - this.ceilY;
        lcd.drawFilledCircle(sx + 4, this.ceilY + yy, 4, col);
    }

    private drawCoin(sx: number, cy: number) {
        const sc = Math.abs(Math.sin(this.anim * 4));
        const w = 6 + sc * 7;
        lcd.drawFilledCircle(sx, cy, 10, lcd.RGB(255, 200, 40));
        lcd.drawFilledRectangle(sx - w / 2, cy - 3, w, 6, lcd.RGB(255, 225, 110));
    }

    private drawCube(sx: number, top: number) {
        const c = this.CS;
        const cx = sx + c / 2;
        const cy = top + c / 2;
        const half = c / 2 - 1;
        const a = this.rot;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        // rotated corners
        const c1 = [cx - half * ca + half * sa, cy - half * sa - half * ca];
        const c2 = [cx + half * ca + half * sa, cy + half * sa - half * ca];
        const c3 = [cx + half * ca - half * sa, cy + half * sa + half * ca];
        const c4 = [cx - half * ca - half * sa, cy - half * sa + half * ca];
        const col = lcd.RGB(96, 190, 120);
        const colD = lcd.RGB(50, 120, 70);
        lcd.drawLine(c1[0] as number, c1[1] as number, c2[0] as number, c2[1] as number, SOLID, colD);
        lcd.drawLine(c2[0] as number, c2[1] as number, c3[0] as number, c3[1] as number, SOLID, col);
        lcd.drawLine(c3[0] as number, c3[1] as number, c4[0] as number, c4[1] as number, SOLID, col);
        lcd.drawLine(c4[0] as number, c4[1] as number, c1[0] as number, c1[1] as number, SOLID, colD);
        // face
        lcd.drawFilledRectangle(sx + 5, top + 6, c - 10, c - 12, col);
        lcd.drawRectangle(sx + 5, top + 6, c - 10, c - 12, lcd.RGB(180, 255, 200));
        // eyes
        const ex = sx + 8;
        lcd.drawFilledRectangle(ex, top + 11, 5, 6, lcd.RGB(20, 30, 40));
        lcd.drawFilledRectangle(ex + c - 21, top + 11, 5, 6, lcd.RGB(20, 30, 40));
        // mouth
        lcd.drawFilledRectangle(ex + 3, top + c - 12, 9, 3, lcd.RGB(20, 30, 40));
        lcd.drawFilledRectangle(ex + c - 20, top + c - 12, 9, 3, lcd.RGB(20, 30, 40));
    }

    private drawShip(sx: number, top: number) {
        const c = this.CS;
        const cx = sx + c / 2;
        const cy = top + c / 2;
        // engine flame
        if (this.jumpHeld) {
            lcd.drawFilledCircle(cx, top + c + 4, 5, lcd.RGB(255, 160, 40));
            lcd.drawFilledCircle(cx, top + c + 7, 3, lcd.RGB(255, 240, 120));
        }
        // body (triangle ship)
        lcd.drawLine(cx - c / 2, cy + 6, cx + c / 2, cy + 6, SOLID, lcd.RGB(80, 190, 255));
        lcd.drawLine(cx + c / 2, cy + 6, cx - 2, cy - c / 2 + 4, SOLID, lcd.RGB(80, 190, 255));
        lcd.drawLine(cx - 2, cy - c / 2 + 4, cx - c / 2, cy + 6, SOLID, lcd.RGB(80, 190, 255));
        // cockpit
        lcd.drawFilledCircle(cx - 4, cy - 2, 4, lcd.RGB(220, 250, 255));
        // window
        lcd.drawFilledCircle(cx - 5, cy - 2, 2, lcd.RGB(20, 40, 70));
    }

    private drawPlayer() {
        const sx = this.cubeX;
        if (this.dead) return;
        if (this.mode == 0) {
            this.drawCube(sx, this.py);
        } else {
            this.drawShip(sx, this.py);
        }
    }

    private drawObjects() {
        for (let i = 0; i < this.objects.length; i++) {
            const o = this.objects[i];
            if (o.used) continue;
            const sx = o.x - this.camX;
            if (sx < -40 || sx > this.w + 40) continue;
            if (o.t == OBJ_SPIKE) {
                this.drawSpike(sx, this.groundY);
            } else if (o.t == OBJ_BLOCK) {
                this.drawBlock(sx, o.y, o.w, o.hh);
            } else if (o.t == OBJ_SB) {
                this.drawBlock(sx, o.y, o.w, o.hh);
                this.drawSpike(sx, o.y);
            } else if (o.t == OBJ_PAD) {
                this.drawPad(sx);
            } else if (o.t == OBJ_CEIL) {
                this.drawBlock(sx, o.y, o.w, o.hh);
            } else if (o.t == OBJ_ORB) {
                this.drawOrb(sx + this.TS / 2, o.h);
            } else if (o.t == OBJ_SHIP) {
                this.drawPortal(sx, true);
            } else if (o.t == OBJ_CUBE) {
                this.drawPortal(sx, false);
            } else if (o.t == OBJ_COIN) {
                this.drawCoin(sx, o.h);
            }
        }
    }

    private drawParticles() {
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            const a = 1 - p.t / p.life;
            lcd.drawFilledCircle(p.x, p.y, 3 + 3 * a, p.col);
        }
    }

    private drawHud() {
        const pct = Math.max(0, Math.min(100, Math.floor((this.camX / this.levelLen) * 100)));
        lcd.drawText(8, 4, `${this.attempts}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w / 2, 4, `${pct}%`, SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w - 8, 4, `x${this.coins}`, SMLSIZE | RIGHT | COLOR_THEME_SECONDARY1);
        if (this.practice) {
            lcd.drawText(this.w / 2, 16, 'PRACTICE', SMLSIZE | CENTER | COLOR_THEME_WARNING);
        }
        // progress bar under HUD
        lcd.drawRectangle(4, 20, this.w - 8, 4, COLOR_THEME_PRIMARY1);
        lcd.drawFilledRectangle(4, 20, Math.max(0, (this.w - 8) * (pct / 100)), 4, COLOR_THEME_PRIMARY1);
    }

    private drawCheckpoint() {
        if (this.ckFlash > 0 && this.ckX > 0) {
            const sx = this.ckX - this.camX;
            if (sx > 0 && sx < this.w) {
                lcd.drawFilledRectangle(sx - 2, this.groundY - 90, 4, 90, lcd.RGB(255, 255, 120));
                lcd.drawText(this.w / 2, this.groundY - 120, 'CHECKPOINT', SMLSIZE | CENTER | COLOR_THEME_WARNING);
            }
        }
    }

    private drawTitle() {
        lcd.drawFilledRectangle(0, 0, this.w, this.h, lcd.RGB(8, 10, 22));
        lcd.drawText(this.w / 2, 60, 'FAMIDASH', DBLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w / 2, 100, 'Geometry Dash for your radio', SMLSIZE | CENTER | COLOR_THEME_PRIMARY2);
        lcd.drawText(this.w / 2, 130, 'auto-run - jump over spikes', SMLSIZE | CENTER | COLOR_THEME_PRIMARY2);
        lcd.drawText(this.w / 2, 150, 'ride blocks / pads / orbs / ship', SMLSIZE | CENTER | COLOR_THEME_PRIMARY2);
        lcd.drawText(this.w / 2, 190, 'ENTER / MDL / TELE / touch: jump', SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w / 2, 210, 'PLUS: practice mode   touch: checkpoint', SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        if (this.best > 0) {
            lcd.drawText(this.w / 2, 240, `best ${this.best}%`, SMLSIZE | CENTER | COLOR_THEME_SECONDARY1);
        }
        lcd.drawText(this.w / 2, 285, 'ENTER / touch: start', SMLSIZE | CENTER | COLOR_THEME_WARNING);
        // a little demo cube bobbing
        this.py = this.groundY - this.CS;
        this.rot = Math.sin(this.titleT * 4) * 0.3;
        this.drawCube(this.cubeX - 60, this.py);
    }

    private drawComplete() {
        lcd.drawFilledRectangle(0, 0, this.w, this.h, lcd.RGB(8, 20, 14));
        lcd.drawText(this.w / 2, 70, 'LEVEL COMPLETE!', DBLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w / 2, 140, `attempts ${this.attempts}`, SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w / 2, 165, `coins ${this.coins}`, SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w / 2, 190, `best ${this.best}%`, SMLSIZE | CENTER | COLOR_THEME_SECONDARY1);
        lcd.drawText(this.w / 2, 260, 'ENTER / touch: menu', SMLSIZE | CENTER | COLOR_THEME_WARNING);
    }

    private draw() {
        if (this.state == this.phase.title) {
            this.drawTitle();
            return;
        }
        if (this.state == this.phase.complete) {
            this.drawComplete();
            return;
        }
        this.drawBg();
        this.drawCheckpoint();
        this.drawObjects();
        this.drawPlayer();
        this.drawParticles();
        this.drawHud();
    }

    public init(w: number, h: number) {
        this.w = w;
        this.h = h;
        this.groundY = h - 48;
        this.buildLevel();
        this.camX = 0;
        this.resetPlayer();
        this.state = this.phase.title;
        this.last = getTime();
    }

    public run(event: number, touchState: any): number {
        const now = getTime();
        let dt = (now - this.last) / 100;
        this.last = now;
        if (dt > 0.08) dt = 0.08;
        if (dt < 0) dt = 0.02;

        this.onEvent(event);

        if (this.state == this.phase.play) {
            this.update(dt);
        } else {
            this.anim += dt;
            this.titleT += dt;
        }

        this.draw();
        this.flushSfx();
        return 0;
    }
}

const game = new Game();

function init(w: number, h: number) {
    game.init(w, h);
}

function run(event: number, touchState: any): number {
    return game.run(event, touchState);
}

export { init, run };
