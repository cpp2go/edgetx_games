declare function getLastPos(): LuaMultiReturn<[unknown, unknown]>;

interface Block {
    u: number; // position along the u axis (screen down-right)
    v: number; // position along the v axis (screen up-right)
    top: number; // height of the top surface above the ground
    color: number; // palette index
    dir: number; // direction from the previous block to this one: 0 = +u, 1 = +v
}

interface Palette {
    top: number;
    left: number;
    right: number;
    edge: number;
}

// 跳一跳 (Jump Jump): isometric 3D, hold to charge, release to jump.
class Game {
    private w: number;
    private h: number;

    // direction axis constants: 0 = +u (straight ahead, screen up-right),
    // 1 = v (turning axis; turning goes up-left, i.e. -v)
    private DIR_U = 0;
    private DIR_V = 1;

    // isometric projection constants
    private A = 0.866;
    private B = 0.5;
    private C = 1.0;
    private s = 60; // block footprint size

    private OX = 150;
    private OY = 275;

    private camU = 0;
    private camV = 0; // camera pan along the v axis (turning)
    private nextSlide = 0; // visual offset while a new block slides in
    private nextSlideV = 0; // lateral slide offset when turning
    private leaving: Block | null = null; // old block sliding out
    private leaveSlide = 0;
    private leaveSlideV = 0;
    private cur: Block = { u: 0, v: 0, top: 40, color: 0, dir: 0 };
    private next: Block = { u: 120, v: 0, top: 40, color: 1, dir: 0 };

    private cu = 0; // character world u
    private cv = 0; // character world v
    private ch = 0; // character height above the ground (feet)
    private vx = 0;
    private vh = 0; // vertical velocity (positive = up)
    private airborne = false;

    private charging = false;
    private charge = 0;
    private stickActive = false;

    private score = 0;
    private best = 0;
    private squash = 0; // squash/stretch animation value

    private phase = { initial: 0, playing: 1, gameOver: 2 };
    private state = this.phase.initial;

    private lastTick = 0;
    private soundEnabled = true;
    private bgmNext = 0;

    private playerImg: Bitmap | null = null;
    private jumpImg: Bitmap | null = null;
    private shadowImg: Bitmap | null = null;

    // physics tuning
    private g = 900;
    private jumpVy = 420;
    private minVx = 20;
    private maxVx = 220;
    private chargeRate = 1.2;

    private palette: Palette[] = [];

    constructor(w: number, h: number) {
        this.w = w;
        this.h = h;
        this.OX = Math.floor(w * 0.5); // centered so up-left turning blocks stay on screen
        this.OY = h - 70; // raised so turning blocks stay fully on screen
        this.palette = [
            { top: lcd.RGB(255, 222, 150), left: lcd.RGB(236, 152, 82), right: lcd.RGB(198, 104, 46), edge: lcd.RGB(140, 80, 30) },
            { top: lcd.RGB(205, 242, 150), left: lcd.RGB(130, 205, 95), right: lcd.RGB(78, 150, 52), edge: lcd.RGB(45, 95, 30) },
            { top: lcd.RGB(178, 222, 255), left: lcd.RGB(95, 162, 230), right: lcd.RGB(52, 112, 190), edge: lcd.RGB(30, 70, 130) },
            { top: lcd.RGB(255, 184, 168), left: lcd.RGB(232, 104, 86), right: lcd.RGB(190, 62, 46), edge: lcd.RGB(130, 35, 25) },
            { top: lcd.RGB(222, 196, 255), left: lcd.RGB(164, 124, 230), right: lcd.RGB(118, 82, 190), edge: lcd.RGB(70, 45, 130) },
        ];
        this.playerImg = this.loadImage('jump-player.png');
        this.jumpImg = this.loadImage('jump-player-jump.png');
        this.shadowImg = this.loadImage('jump-shadow.png');
        this.lastTick = getTime();
        this.newGame();
        this.state = this.phase.initial;
    }

    private playSfx(freq: number, duration: number, pause: number = 0) {
        if (!this.soundEnabled) {
            return;
        }
        (playTone as unknown as (f: number, d: number, p: number) => void)(freq, duration, pause);
    }

    // The sound files live in /GAMES/SOUND/<game>/ on the radio; /SOUNDS/<game>/
    // is a fallback (both verified to play). playFile is silent for missing
    // files, so only the path that exists produces sound.
    private playSound(dir: string, file: string) {
        if (!this.soundEnabled) {
            return;
        }
        const tries = [
            `/GAMES/SOUNDS/${dir}/${file}`,
            `/SOUNDS/${dir}/${file}`,
        ];
        for (let i = 0; i < tries.length; i++) {
            (playFile as unknown as (p: string) => void)(tries[i]);
        }
    }

    private tryPlayFile(file: string): boolean {
        this.playSound('jumpjump', file);
        return true;
    }

    // play a WAV from the SOUNDS folder; fall back to a tone if not found
    private playSfxFile(file: string, freq: number, duration: number) {
        if (!this.soundEnabled) {
            return;
        }
        if (this.tryPlayFile(file)) {
            return;
        }
        this.playSfx(freq, duration, 0);
    }

    // background music: re-trigger a short music WAV (no tone fallback)
    private playBgm() {
        if (!this.soundEnabled) {
            return;
        }
        this.tryPlayFile('bgm.wav');
    }

    private randRange(a: number, b: number): number {
        return a + Math.random() * (b - a);
    }

    private loadImage(name: string): Bitmap | null {
        const tries = [
            `./IMAGES/${name}`,
            `/SCRIPTS/IMAGES/${name}`,
            `/IMAGES/${name}`,
        ];
        for (let i = 0; i < tries.length; i++) {
            const b = Bitmap.open(tries[i]);
            if (b != null) {
                return b;
            }
        }
        return null;
    }

    private newGame() {
        this.score = 0;
        this.squash = 0;
        this.leaving = null;
        this.leaveSlide = 0;
        this.leaveSlideV = 0;
        this.camU = 0;
        this.camV = 0;
        this.cur = { u: 0, v: 0, top: this.randRange(30, 55), color: 0, dir: 0 };
        this.spawnNext();
        this.cu = this.cur.u;
        this.cv = this.cur.v;
        this.ch = this.cur.top;
        this.vx = 0;
        this.vh = 0;
        this.airborne = false;
        this.charging = false;
        this.charge = 0;
        this.stickActive = false;
        this.bgmNext = getTime() + 100;
        this.state = this.phase.playing;
        this.playSfxFile('start.wav', 900, 80);
    }

    private spawnNext() {
        // randomly continue straight ahead or turn 90 degrees (up-left)
        let dir = this.cur.dir;
        if (Math.random() < 0.45) {
            dir = 1 - dir; // turn onto the other axis
        }
        // gap grows a little with score so the game gets harder
        const ramp = Math.min(this.score * 1.2, 50);
        const gap = this.randRange(70 + ramp, 150 + ramp);
        this.next = {
            u: this.cur.u + (dir == this.DIR_U ? gap : 0),
            v: this.cur.v + (dir == this.DIR_V ? -gap : 0), // turn up-left (-v)
            top: this.randRange(30, 55),
            color: Math.floor(Math.random() * this.palette.length),
            dir: dir,
        };
        // new block starts off-screen and slides into place
        this.nextSlide = dir == this.DIR_U ? 330 : 0;
        this.nextSlideV = dir == this.DIR_V ? 330 : 0;
    }

    private startCharge() {
        if (this.state != this.phase.playing || this.airborne || this.charging) {
            return;
        }
        this.charging = true;
        this.charge = 0;
    }

    private releaseJump() {
        if (this.state != this.phase.playing || !this.charging) {
            return;
        }
        this.charging = false;
        const c = this.charge;
        this.charge = 0;
        this.vx = this.minVx + (this.maxVx - this.minVx) * c;
        this.vh = this.jumpVy;
        this.airborne = true;
        this.squash = 0.3;
        this.playSfxFile('jump.wav', 420 + Math.floor(c * 500), 60);
    }

    // stick: push to charge, release to jump
    private updateControl(dt: number) {
        const sx = getValue('ail') / 1024;
        const sy = getValue('ele') / 1024;
        const active = Math.max(Math.abs(sx), Math.abs(sy)) > 0.3;
        if (active) {
            if (!this.stickActive) {
                this.stickActive = true;
                this.startCharge();
            }
        } else if (this.stickActive) {
            this.stickActive = false;
            this.releaseJump();
        }
        if (this.charging) {
            this.charge = Math.min(1, this.charge + dt * this.chargeRate);
        }
    }

    private update(dt: number) {
        if (this.nextSlide > 0) {
            this.nextSlide = Math.max(0, this.nextSlide - dt * 800);
        }
        if (this.nextSlideV > 0) {
            this.nextSlideV = Math.max(0, this.nextSlideV - dt * 800);
        }
        if (this.leaving != null) {
            // the old block slides out the OPPOSITE way the CURRENT block slid
            // in (regardless of how the old block itself originally arrived):
            // new block up-right (+u) in  -> old slides down-left out
            // new block up-left  (-v) in  -> old slides down-right out
            if (this.next.dir == this.DIR_U) {
                this.leaveSlide += dt * 800;
            } else {
                this.leaveSlideV += dt * 800;
            }
            if (this.leaveSlide > 380 || this.leaveSlideV > 380) {
                this.leaving = null;
            }
        }
        if (!this.airborne) {
            return;
        }
        const prevCh = this.ch;
        // fly along the direction toward the target block (straight or turned)
        if (this.next.dir == this.DIR_U) {
            this.cu += this.vx * dt;
        } else {
            this.cv -= this.vx * dt; // turn up-left (-v)
        }
        this.vh -= this.g * dt;
        this.ch += this.vh * dt;
        // smooth camera pan during the jump (both axes, for turns)
        this.camU += (this.cu - this.camU) * Math.min(1, dt * 5);
        this.camV += (this.cv - this.camV) * Math.min(1, dt * 5);
        if (this.vh > 0) {
            return; // still rising
        }
        const m = 6;
        // only count as landing when the character reaches the TOP surface
        // of the block from above (not when it sinks into the side)
        if (
            Math.abs(this.cu - this.next.u) <= this.s / 2 - m &&
            Math.abs(this.cv - this.next.v) <= this.s / 2 - m &&
            prevCh > this.next.top &&
            this.ch <= this.next.top
        ) {
            this.landOn(this.next, true);
            return;
        }
        if (
            Math.abs(this.cu - this.cur.u) <= this.s / 2 - m &&
            Math.abs(this.cv - this.cur.v) <= this.s / 2 - m &&
            prevCh > this.cur.top &&
            this.ch <= this.cur.top
        ) {
            this.landOn(this.cur, false);
            return;
        }
        if (this.ch < -20) {
            this.gameOver();
        }
    }

    private landOn(p: Block, advance: boolean) {
        this.cu = p.u;
        this.cv = p.v;
        this.ch = p.top;
        this.vx = 0;
        this.vh = 0;
        this.airborne = false;
        this.charging = false;
        this.charge = 0;
        this.camU = p.u;
        this.camV = p.v;
        this.squash = 0.3;
        if (advance) {
            this.leaving = this.cur;
            this.leaveSlide = 0;
            this.leaveSlideV = 0;
            this.score++;
            if (this.score > this.best) {
                this.best = this.score;
            }
            this.playSfxFile('score.wav', 880, 40);
            this.cur = p;
            this.spawnNext();
        } else {
            this.playSfxFile('land.wav', 500, 20);
        }
    }

    private gameOver() {
        this.state = this.phase.gameOver;
        this.airborne = false;
        this.charging = false;
        this.stickActive = false;
        if (this.score > this.best) {
            this.best = this.score;
        }
        this.playSfxFile('fail.wav', 160, 260);
    }

    private isTouchEvent(event: number): boolean {
        return (
            event == EVT_TOUCH_FIRST ||
            event == EVT_TOUCH_SLIDE ||
            event == EVT_TOUCH_TAP ||
            event == EVT_TOUCH_BREAK
        );
    }

    private applyTouchControl(event: number): void {
        if (!this.isTouchEvent(event)) {
            return;
        }
        if (this.state == this.phase.initial || this.state == this.phase.gameOver) {
            if (event == EVT_TOUCH_TAP || event == EVT_TOUCH_FIRST) {
                this.newGame();
            }
            return;
        }
        if (this.state != this.phase.playing) {
            return;
        }
        // touch: press to charge, release to jump (EVT_TOUCH_TAP alone is ignored)
        if (event == EVT_TOUCH_FIRST) {
            this.startCharge();
        } else if (event == EVT_TOUCH_BREAK) {
            this.releaseJump();
        }
    }

    private onEvent(event: number) {
        if (event == EVT_SYS_BREAK) {
            this.newGame();
            return;
        }
        if (this.state == this.phase.initial || this.state == this.phase.gameOver) {
            if (event == EVT_ENTER_BREAK || event == EVT_VIRTUAL_ENTER) {
                this.newGame();
            }
            return;
        }
        if (this.state == this.phase.playing) {
            // button: hold ENTER (long press) to charge, release to jump
            if (event == EVT_ENTER_LONG || event == EVT_VIRTUAL_ENTER_LONG) {
                this.startCharge();
            } else if (event == EVT_ENTER_BREAK || event == EVT_VIRTUAL_ENTER) {
                this.releaseJump();
            }
        }
    }

    // y of the surface at a given world position (used for the shadow)
    private surfaceAt(u: number, v: number): number {
        if (
            Math.abs(u - this.next.u) <= this.s / 2 &&
            Math.abs(v - this.next.v) <= this.s / 2
        ) {
            return this.next.top;
        }
        if (
            Math.abs(u - this.cur.u) <= this.s / 2 &&
            Math.abs(v - this.cur.v) <= this.s / 2
        ) {
            return this.cur.top;
        }
        return 0;
    }

    // isometric projection: screen = OX + ((u-camU) + (v-camV)) * A,
    //                        OY + ((v-camV) - (u-camU)) * B - h * C
    private projX(u: number, v: number): number {
        return this.OX + ((u - this.camU) + (v - this.camV)) * this.A;
    }

    private projY(u: number, v: number, h: number): number {
        return this.OY + ((v - this.camV) - (u - this.camU)) * this.B - h * this.C;
    }

    private drawGround() {
        // light ground plane
        lcd.drawFilledRectangle(0, 0, this.w, this.h, lcd.RGB(228, 219, 202));
        // horizon
        lcd.drawFilledRectangle(0, 56, this.w, 2, lcd.RGB(202, 190, 170));
        // grid lines on the ground (h = 0), following the camera
        const col = lcd.RGB(198, 185, 164);
        const step = this.s;
        const u0 = Math.floor(this.camU / step) - 6;
        const u1 = Math.floor(this.camU / step) + 12;
        const v0 = Math.floor(this.camV / step) - 4;
        const v1 = Math.floor(this.camV / step) + 4;
        for (let ku = u0; ku <= u1; ku++) {
            const u = ku * step;
            lcd.drawLine(
                this.projX(u, (v0 - 1) * step),
                this.projY(u, (v0 - 1) * step, 0),
                this.projX(u, (v1 + 1) * step),
                this.projY(u, (v1 + 1) * step, 0),
                SOLID,
                col
            );
        }
        for (let kv = v0; kv <= v1; kv++) {
            const v = kv * step;
            lcd.drawLine(
                this.projX((u0 - 1) * step, v),
                this.projY((u0 - 1) * step, v, 0),
                this.projX((u1 + 1) * step, v),
                this.projY((u1 + 1) * step, v, 0),
                SOLID,
                col
            );
        }
    }

    // draw a directional ground shadow for a cube: the footprint diamond plus
    // a cast extension toward the bottom-right (matching the cube shape)
    private drawShadowHex(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        x3: number,
        y3: number,
        x4: number,
        y4: number,
        vx: number,
        vy: number,
        color: number
    ) {
        const topP = y1 <= y2 && y1 <= y3 && y1 <= y4 ? 1 : y2 <= y3 && y2 <= y4 ? 2 : y3 <= y4 ? 3 : 4;
        const botP = y1 >= y2 && y1 >= y3 && y1 >= y4 ? 1 : y2 >= y3 && y2 >= y4 ? 2 : y3 >= y4 ? 3 : 4;
        const leftP = x1 <= x2 && x1 <= x3 && x1 <= x4 ? 1 : x2 <= x3 && x2 <= x4 ? 2 : x3 <= x4 ? 3 : 4;
        const rightP = x1 >= x2 && x1 >= x3 && x1 >= x4 ? 1 : x2 >= x3 && x2 >= x4 ? 2 : x3 >= x4 ? 3 : 4;
        const PX = [x1, x2, x3, x4];
        const PY = [y1, y2, y3, y4];
        const tx = PX[topP - 1];
        const ty = PY[topP - 1];
        const bx = PX[botP - 1];
        const by = PY[botP - 1];
        const lx = PX[leftP - 1];
        const ly = PY[leftP - 1];
        const rx = PX[rightP - 1];
        const ry = PY[rightP - 1];
        const tri = lcd.drawFilledTriangle as unknown as (
            x1: number,
            y1: number,
            x2: number,
            y2: number,
            x3: number,
            y3: number,
            flags?: number
        ) => void;
        // hexagon L -> T -> R -> R+v -> B+v -> B (fan from L)
        tri(lx, ly, tx, ty, rx, ry, color);
        tri(lx, ly, rx, ry, rx + vx, ry + vy, color);
        tri(lx, ly, rx + vx, ry + vy, bx + vx, by + vy, color);
        tri(lx, ly, bx + vx, by + vy, bx, by, color);
    }

    // soft 3D cast shadow under a cube (matches the cube footprint)
    private drawBlockShadow(b: Block, uOff = 0, vOff = 0) {
        const u = b.u + uOff;
        const v = b.v + vOff;
        const x1 = this.projX(u - this.s / 2, v - this.s / 2);
        const y1 = this.projY(u - this.s / 2, v - this.s / 2, 0);
        const x2 = this.projX(u + this.s / 2, v - this.s / 2);
        const y2 = this.projY(u + this.s / 2, v - this.s / 2, 0);
        const x3 = this.projX(u + this.s / 2, v + this.s / 2);
        const y3 = this.projY(u + this.s / 2, v + this.s / 2, 0);
        const x4 = this.projX(u - this.s / 2, v + this.s / 2);
        const y4 = this.projY(u - this.s / 2, v + this.s / 2, 0);
        // two layers: soft outer + darker core, both cast down-right
        this.drawShadowHex(x1, y1, x2, y2, x3, y3, x4, y4, this.s * 0.75, this.s * 0.42, lcd.RGB(205, 193, 173));
        this.drawShadowHex(x1, y1, x2, y2, x3, y3, x4, y4, this.s * 0.5, this.s * 0.28, lcd.RGB(186, 172, 151));
    }

    // isometric cube: bright top face + two shaded side faces
    private drawBlock(b: Block, isNext: boolean, uOff = 0, vOff = 0) {
        const p = this.palette[b.color % this.palette.length];
        const u = b.u + uOff;
        const v = b.v + vOff;
        const x1 = this.projX(u - this.s / 2, v - this.s / 2);
        const y1 = this.projY(u - this.s / 2, v - this.s / 2, b.top);
        const x2 = this.projX(u + this.s / 2, v - this.s / 2);
        const y2 = this.projY(u + this.s / 2, v - this.s / 2, b.top);
        const x3 = this.projX(u + this.s / 2, v + this.s / 2);
        const y3 = this.projY(u + this.s / 2, v + this.s / 2, b.top);
        const x4 = this.projX(u - this.s / 2, v + this.s / 2);
        const y4 = this.projY(u - this.s / 2, v + this.s / 2, b.top);

        // screen extremes of the top diamond
        const topP = y1 <= y2 && y1 <= y3 && y1 <= y4 ? 1 : y2 <= y3 && y2 <= y4 ? 2 : y3 <= y4 ? 3 : 4;
        const botP = y1 >= y2 && y1 >= y3 && y1 >= y4 ? 1 : y2 >= y3 && y2 >= y4 ? 2 : y3 >= y4 ? 3 : 4;
        const leftP = x1 <= x2 && x1 <= x3 && x1 <= x4 ? 1 : x2 <= x3 && x2 <= x4 ? 2 : x3 <= x4 ? 3 : 4;
        const rightP = x1 >= x2 && x1 >= x3 && x1 >= x4 ? 1 : x2 >= x3 && x2 >= x4 ? 2 : x3 >= x4 ? 3 : 4;
        const PX = [x1, x2, x3, x4];
        const PY = [y1, y2, y3, y4];
        const tx = PX[topP - 1];
        const ty = PY[topP - 1];
        const bx = PX[botP - 1];
        const by = PY[botP - 1];
        const lx = PX[leftP - 1];
        const ly = PY[leftP - 1];
        const rx = PX[rightP - 1];
        const ry = PY[rightP - 1];
        const shift = b.top; // side-face height on screen (C = 1)
        const tri = lcd.drawFilledTriangle as unknown as (
            x1: number,
            y1: number,
            x2: number,
            y2: number,
            x3: number,
            y3: number,
            flags?: number
        ) => void;

        // left side face
        tri(lx, ly, bx, by, lx, ly + shift, p.left);
        tri(lx, ly + shift, bx, by, bx, by + shift, p.left);
        // right side face
        tri(rx, ry, bx, by, rx, ry + shift, p.right);
        tri(rx, ry + shift, bx, by, bx, by + shift, p.right);
        // top face
        tri(tx, ty, rx, ry, bx, by, p.top);
        tri(tx, ty, bx, by, lx, ly, p.top);
        // crisp top edges
        lcd.drawLine(tx, ty, rx, ry, SOLID, isNext ? lcd.RGB(255, 245, 180) : p.edge);
        lcd.drawLine(rx, ry, bx, by, SOLID, p.edge);
        lcd.drawLine(bx, by, lx, ly, SOLID, p.edge);
        lcd.drawLine(lx, ly, tx, ty, SOLID, p.edge);
    }

    private drawCharacter() {
        const sx = this.projX(this.cu, this.cv);
        const sy = this.projY(this.cu, this.cv, this.ch);
        const surf = this.surfaceAt(this.cu, this.cv);
        const rise = Math.max(0, surf - this.ch);

        // 3D drop shadow on the surface directly below the character
        if (this.shadowImg != null) {
            const shScale = this.airborne ? Math.max(40, 120 - rise * 1.2) : 120;
            const [sw, sh] = Bitmap.getSize(this.shadowImg);
            const shw = Math.floor((sw * shScale) / 100);
            const shh = Math.floor((sh * shScale) / 100);
            const sxs = this.projX(this.cu, this.cv);
            const sys = this.projY(this.cu, this.cv, surf);
            lcd.drawBitmap(this.shadowImg, Math.floor(sxs - shw / 2), Math.floor(sys - shh / 2), shScale);
        }

        // animation: crouch while charging, leap pose + stretch while flying,
        // squash on landing
        let scale = 100;
        if (this.airborne) {
            if (this.squash > 0) {
                scale = 100 + 14 * this.squash; // stretch on takeoff
            }
        } else if (this.charging) {
            scale = 100 * (1 - this.charge * 0.22); // crouch
        } else if (this.squash > 0) {
            scale = 100 - 18 * this.squash; // landing squash
        }
        scale = Math.max(58, Math.floor(scale));

        const img = this.airborne && this.jumpImg != null ? this.jumpImg : this.playerImg;
        if (img != null) {
            const [iw, ih] = Bitmap.getSize(img);
            lcd.drawBitmap(
                img,
                Math.floor(sx - (iw * scale) / 200),
                Math.floor(sy - (ih * scale) / 100),
                scale
            );
            return;
        }

        // fallback: primitive character (image missing on the radio)
        const s = this.charging ? this.charge : 0;
        const bodyW = 34 * (1 + s * 0.5);
        const bodyH = 46 * (1 - s * 0.3);
        const headR = 13;
        if (!this.airborne) {
            lcd.drawFilledRectangle(sx - 12, sy - 1, 24, 4, COLOR_THEME_SECONDARY2);
        }
        lcd.drawFilledRectangle(sx - bodyW / 2, sy - bodyH, bodyW, bodyH, COLOR_THEME_PRIMARY1);
        (lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void)(
            sx,
            sy - bodyH - headR,
            headR,
            COLOR_THEME_ACTIVE
        );
    }

    private drawOverlay(text: string) {
        lcd.drawFilledRectangle(18, 18, this.w - 36, this.h - 36, COLOR_THEME_SECONDARY1, 1);
        lcd.drawRectangle(18, 18, this.w - 36, this.h - 36, COLOR_THEME_PRIMARY1, 2);
        lcd.drawText(this.w / 2, this.h / 2, text, COLOR_THEME_PRIMARY1 | CENTER | VCENTER | DBLSIZE);
    }

    private draw() {
        lcd.clear(COLOR_THEME_PRIMARY2);
        this.drawGround();
        // the next block slides in from its own direction: straight blocks come
        // from up-right (+u), turning blocks slide out from up-left (-v)
        this.drawBlockShadow(this.next, this.nextSlide, -this.nextSlideV);
        this.drawBlock(this.next, true, this.nextSlide, -this.nextSlideV);
        if (this.leaving != null) {
            // old block slides out the opposite way it came in:
            // up-right (+u) in -> down-left out, up-left (-v) in -> down-right out
            this.drawBlockShadow(this.leaving, -this.leaveSlide, this.leaveSlideV);
            this.drawBlock(this.leaving, false, -this.leaveSlide, this.leaveSlideV);
        }
        this.drawBlockShadow(this.cur, 0, 0);
        this.drawBlock(this.cur, false, 0, 0);

        this.drawCharacter();

        lcd.drawText(6, 4, `Score: ${this.score}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w - 6, 4, `Best: ${this.best}`, SMLSIZE | RIGHT | COLOR_THEME_PRIMARY1);

        if (this.charging) {
            const bw = 90;
            const bx = this.w / 2 - bw / 2;
            lcd.drawFilledRectangle(bx, this.h - 16, bw, 8, COLOR_THEME_SECONDARY3);
            lcd.drawFilledRectangle(bx, this.h - 16, Math.floor(bw * this.charge), 8, COLOR_THEME_WARNING);
        }

        if (this.state == this.phase.initial) {
            this.drawOverlay('JUMP JUMP\n\nHold stick / touch to charge,\nrelease to jump!\n\nENTER or SYS to start');
        } else if (this.state == this.phase.gameOver) {
            this.drawOverlay(`GAME OVER\nScore: ${this.score}  Best: ${this.best}\n\nENTER or SYS to retry`);
        }
    }

    public run(event: number, touchState: any): number {
        if (event != null) {
            this.applyTouchControl(event);
            this.onEvent(event);
        }
        const now = getTime();
        let dt = (now - this.lastTick) / 100;
        this.lastTick = now;
        if (dt > 0.08) {
            dt = 0.08;
        }
        if (this.state == this.phase.playing) {
            this.updateControl(dt);
            this.update(dt);
        }
        if (this.squash > 0) {
            this.squash -= dt * 4;
            if (this.squash < 0) {
                this.squash = 0;
            }
        }
        // background music loop (re-trigger a short music WAV)
        if ((this.state == this.phase.initial || this.state == this.phase.playing) && now >= this.bgmNext) {
            this.bgmNext = now + 245;
            this.playBgm();
        }
        this.draw();
        return 0;
    }
}

let game: Game;

function init(w: number = LCD_W, h: number = LCD_H): void {
    game = new Game(w, h);
}

function run(event: number, touchState: any): number {
    return game.run(event, touchState);
}

export { init, run };
