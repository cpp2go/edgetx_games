// MDL / TELE keys also have break (release) events on EdgeTX; the shared
// edgetx_general.d.ts only declares the _FIRST variants.
declare const EVT_MODEL_BREAK: number;
declare const EVT_TELEM_BREAK: number;

interface Goomba {
    x: number;
    y: number;
    vx: number;
    alive: boolean;
    squashed: number; // >0 = squashed animation timer
    t: number;
}

interface Item {
    x: number;
    y: number;
    vx: number;
    vy: number;
    type: number; // 0 = mushroom (grow up)
    t: number;
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    t: number;
    type: number; // 0 = brick debris, 1 = coin pop, 2 = sparkle
}

interface Bump {
    col: number;
    row: number;
    t: number;
}

interface Decor {
    x: number;
    y: number;
    s: number; // cloud size
    v: number; // parallax speed
}

// 超级玛丽 (Super Mario): a side-scrolling platformer for EdgeTX. Run and jump
// with the stick + ENTER/touch, stomp goombas, break bricks, bump question
// blocks for coins and mushrooms, grab the flag to clear the level.
class Game {
    private w: number;
    private h: number;

    // world (tile map). 8 rows tall = exactly one screen of 40px tiles.
    private TS = 40;
    private levelRows = 8;
    private levelW = 150; // columns
    private level: string[] = [];
    private camX = 0;

    // player
    private px = 0;
    private py = 0;
    private pvx = 0;
    private pvy = 0;
    private pw = 24;
    private ph = 30;
    private big = false; // mushroom power-up
    private facing = 1;
    private onGround = false;
    private inv = 0; // invincibility timer
    private anim = 0;
    private animT = 0;

    // run stats
    private score = 0;
    private best = 0;
    private coins = 0;
    private lives = 3;
    private time = 300;
    private combo = 0;

    // entities
    private goombas: Goomba[] = [];
    private items: Item[] = [];
    private particles: Particle[] = [];
    private bumps: Bump[] = [];
    private decor: Decor[] = [];

    // input
    private jumpHeld = false;
    private jumpCut = false;
    private respawnX = 1;

    // game flow
    private phase = { title: 0, playing: 1, clear: 2, over: 3 };
    private state = this.phase.title;
    private clearT = 0;
    private overT = 0;
    private overY = 0; // death fall animation
    private dead = false;

    private lastTick = 0;
    private soundEnabled = true;
    private bgmNext = 0;
    private sfxCd = 0;

    // physics tuning (px/s)
    private GRAV = 1500;
    private JUMPV = 620;
    private MAXSPD = 240;
    private ACCEL = 1500;
    private FRICT = 1900;
    private MAXFALL = 900;

    // palette
    private sky1 = lcd.RGB(48, 120, 220);
    private sky2 = lcd.RGB(120, 190, 255);
    private grassC = lcd.RGB(90, 190, 60);
    private dirtC = lcd.RGB(150, 95, 45);
    private dirtD = lcd.RGB(120, 72, 34);
    private brickC = lcd.RGB(190, 82, 40);
    private brickD = lcd.RGB(140, 52, 24);
    private qC = lcd.RGB(250, 176, 40);
    private qD = lcd.RGB(200, 120, 20);
    private pipeC = lcd.RGB(60, 180, 70);
    private pipeD = lcd.RGB(36, 130, 50);
    private coinC = lcd.RGB(255, 210, 60);
    private capC = lcd.RGB(220, 40, 40);
    private skinC = lcd.RGB(250, 190, 140);
    private overallC = lcd.RGB(40, 70, 200);
    private shoeC = lcd.RGB(120, 60, 30);
    private goombaC = lcd.RGB(150, 90, 40);

    constructor(w: number, h: number) {
        this.w = w;
        this.h = h;
        this.lastTick = getTime();
        this.buildDecor();
        this.buildLevel();
        this.newGame();
        this.state = this.phase.title;
    }

    // ---------- audio ----------
    private playSfx(freq: number, duration: number, pause: number = 0) {
        if (!this.soundEnabled) {
            return;
        }
        (playTone as unknown as (f: number, d: number, p: number) => void)(freq, duration, pause);
    }

    private stopAudio() {
        (flushAudio as unknown as () => void)();
    }

    // ---------- level ----------
    private buildDecor() {
        this.decor = [];
        for (let i = 0; i < 12; i++) {
            this.decor.push({
                x: i * 900 + (i % 5) * 120,
                y: 20 + (i % 4) * 46,
                s: 1 + (i % 3) * 0.6,
                v: 0.25 + (i % 3) * 0.12,
            });
        }
    }

    private buildLevel() {
        const W = this.levelW;
        const H = this.levelRows;
        this.level = [];
        for (let r = 0; r < H; r++) {
            let s = '';
            for (let c = 0; c < W; c++) {
                s += ' ';
            }
            this.level.push(s);
        }
        const put = (c: number, r: number, ch: string) => {
            if (c >= 0 && c < W && r >= 0 && r < H) {
                this.level[r] = this.level[r].substring(0, c) + ch + this.level[r].substring(c + 1);
            }
        };
        const rect = (c0: number, r0: number, c1: number, r1: number, ch: string) => {
            for (let r = r0; r <= r1; r++) {
                for (let c = c0; c <= c1; c++) {
                    put(c, r, ch);
                }
            }
        };
        // ground segments (gaps are pits)
        const segs: [number, number][] = [
            [0, 18],
            [20, 31],
            [33, 46],
            [49, 62],
            [64, 72],
            [74, 92],
            [95, 112],
            [113, W - 1],
        ];
        for (let i = 0; i < segs.length; i++) {
            const s0 = segs[i][0];
            const s1 = segs[i][1];
            rect(s0, 6, s1, 7, 'G');
        }
        // pipes: (col, topRow) height = top..6
        const pipes: [number, number][] = [
            [22, 5],
            [52, 5],
            [76, 4],
            [105, 5],
        ];
        for (let i = 0; i < pipes.length; i++) {
            const pc = pipes[i][0];
            const pt = pipes[i][1];
            rect(pc, pt, pc + 1, 6, 'P');
        }
        // question blocks (coin): (col, row). Row 3 so both small mario (head
        // ~y210) and big mario (head ~y184) pass freely underneath; a jump
        // (head reaches ~y82) bumps the block from below.
        const qCoins: [number, number][] = [
            [12, 3],
            [15, 3],
            [37, 3],
            [39, 3],
            [41, 3],
            [88, 3],
            [106, 3],
        ];
        for (let i = 0; i < qCoins.length; i++) {
            put(qCoins[i][0], qCoins[i][1], '?');
        }
        // question blocks (mushroom)
        const qMush: [number, number][] = [
            [8, 3],
            [27, 3],
            [65, 3],
            [96, 3],
        ];
        for (let i = 0; i < qMush.length; i++) {
            put(qMush[i][0], qMush[i][1], 'M');
        }
        // bricks
        const bricks: [number, number][] = [
            [13, 3],
            [14, 3],
            [36, 3],
            [38, 3],
            [40, 3],
            [66, 3],
            [67, 3],
            [87, 3],
            [89, 3],
            [97, 3],
            [98, 3],
            [99, 3],
        ];
        for (let i = 0; i < bricks.length; i++) {
            put(bricks[i][0], bricks[i][1], 'B');
        }
        // floating coins
        const coins: [number, number][] = [
            [10, 3],
            [11, 3],
            [24, 4],
            [25, 4],
            [26, 4],
            [34, 3],
            [35, 3],
            [43, 3],
            [44, 3],
            [54, 4],
            [55, 4],
            [57, 4],
            [58, 4],
            [80, 3],
            [81, 3],
            [82, 3],
            [90, 3],
            [100, 3],
            [101, 3],
            [108, 4],
            [109, 4],
        ];
        for (let i = 0; i < coins.length; i++) {
            put(coins[i][0], coins[i][1], 'o');
        }
        // flag pole column
        rect(116, 1, 116, 6, 'F');
    }

    private charAt(c: number, r: number): string {
        if (c < 0 || c >= this.levelW || r < 0 || r >= this.levelRows) {
            return ' ';
        }
        return this.level[r].charAt(c);
    }

    private isSolid(ch: string): boolean {
        return ch == 'G' || ch == 'B' || ch == '?' || ch == 'M' || ch == 'U' || ch == 'P';
    }

    private setTile(c: number, r: number, ch: string) {
        if (c >= 0 && c < this.levelW && r >= 0 && r < this.levelRows) {
            this.level[r] = this.level[r].substring(0, c) + ch + this.level[r].substring(c + 1);
        }
    }

    // ---------- run setup ----------
    private newGame() {
        this.score = 0;
        this.coins = 0;
        this.lives = 3;
        this.time = 300;
        this.goombas = [];
        this.items = [];
        this.particles = [];
        this.bumps = [];
        this.dead = false;
        // rebuild level (un-bump blocks)
        this.buildLevel();
        // goombas (col positions on the ground)
        const spots = [24, 29, 43, 55, 57, 69, 82, 100, 107, 119];
        for (let i = 0; i < spots.length; i++) {
            this.goombas.push({
                x: spots[i] * this.TS,
                y: 6 * this.TS - 26,
                vx: (i % 2 == 0 ? 1 : -1) * 48,
                alive: true,
                squashed: 0,
                t: i * 0.1,
            });
        }
        this.respawnX = 1;
        this.respawn();
        this.state = this.phase.playing;
        this.playSfx(660, 90, 20);
        this.playSfx(880, 90, 0);
    }

    private respawn() {
        this.px = this.respawnX * this.TS + 6;
        this.py = 5 * this.TS;
        this.pvx = 0;
        this.pvy = 0;
        this.big = false;
        this.ph = 30;
        this.inv = 1.5;
        this.dead = false;
        this.camX = Math.max(0, Math.min(this.px - this.w / 2, this.levelW * this.TS - this.w));
    }

    // ---------- input ----------
    private startJump() {
        if (this.jumpHeld) {
            return;
        }
        this.jumpHeld = true;
        this.jumpCut = false;
        if (this.onGround && !this.dead) {
            this.pvy = -this.JUMPV;
            this.onGround = false;
            this.playSfx(560, 70, 10);
        }
    }

    private releaseJump() {
        this.jumpHeld = false;
        if (this.pvy < 0 && !this.jumpCut) {
            this.pvy *= 0.5;
            this.jumpCut = true;
        }
    }

    private onEvent(event: number) {
        if (event == EVT_EXIT_BREAK || event == EVT_VIRTUAL_EXIT) {
            this.stopAudio();
            return;
        }
        if (event == EVT_SYS_BREAK) {
            this.newGame();
            return;
        }
        if (this.state == this.phase.title || this.state == this.phase.over) {
            if (
                event == EVT_ENTER_BREAK ||
                event == EVT_VIRTUAL_ENTER ||
                event == EVT_MODEL_FIRST ||
                event == EVT_TELEM_FIRST
            ) {
                this.newGame();
            }
            return;
        }
        if (this.state == this.phase.clear) {
            if (
                event == EVT_ENTER_BREAK ||
                event == EVT_VIRTUAL_ENTER ||
                event == EVT_MODEL_FIRST ||
                event == EVT_TELEM_FIRST
            ) {
                this.newGame();
            }
            return;
        }
        if (this.state == this.phase.playing) {
            if (
                event == EVT_ENTER_LONG ||
                event == EVT_VIRTUAL_ENTER_LONG ||
                event == EVT_MODEL_FIRST ||
                event == EVT_TELEM_FIRST
            ) {
                this.startJump();
            } else if (
                event == EVT_ENTER_BREAK ||
                event == EVT_VIRTUAL_ENTER ||
                event == EVT_MODEL_BREAK ||
                event == EVT_TELEM_BREAK
            ) {
                this.releaseJump();
            }
        }
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
        if (this.state == this.phase.title || this.state == this.phase.over || this.state == this.phase.clear) {
            if (event == EVT_TOUCH_TAP || event == EVT_TOUCH_FIRST) {
                this.newGame();
            }
            return;
        }
        if (this.state == this.phase.playing) {
            if (event == EVT_TOUCH_FIRST) {
                this.startJump();
            } else if (event == EVT_TOUCH_BREAK) {
                this.releaseJump();
            }
        }
    }

    // ---------- physics ----------
    private update(dt: number) {
        this.time -= dt;
        this.animT += dt;
        if (this.animT >= 0.15) {
            this.animT -= 0.15;
            this.anim = (this.anim + 1) % 2;
        }
        if (this.inv > 0) {
            this.inv -= dt;
        }
        this.sfxCd -= dt;

        // horizontal control
        const sx = getValue('ail') / 1024;
        if (this.dead) {
            this.pvx = 0;
        } else if (sx > 0.12) {
            this.pvx += this.ACCEL * dt;
            this.facing = 1;
        } else if (sx < -0.12) {
            this.pvx -= this.ACCEL * dt;
            this.facing = -1;
        } else {
            const fr = this.onGround ? this.FRICT : 600;
            if (this.pvx > 0) {
                this.pvx = Math.max(0, this.pvx - fr * dt);
            } else {
                this.pvx = Math.min(0, this.pvx + fr * dt);
            }
        }
        this.pvx = Math.max(-this.MAXSPD, Math.min(this.MAXSPD, this.pvx));

        if (!this.dead) {
            // gravity + variable jump
            if (this.pvy < 0 && !this.jumpHeld && !this.jumpCut) {
                this.pvy *= 0.5;
                this.jumpCut = true;
            }
            this.pvy = Math.min(this.MAXFALL, this.pvy + this.GRAV * dt);
        } else {
            this.pvy = Math.min(this.MAXFALL, this.pvy + this.GRAV * dt);
        }

        this.moveAndCollide(dt);

        // fell into a pit
        if (this.py > this.levelRows * this.TS + 10) {
            this.die(false);
        }

        // time out
        if (this.time <= 0) {
            this.time = 0;
            this.die(false);
        }

        // mid-level checkpoint so death doesn't restart from the beginning
        if (this.respawnX < 58 && this.px > 58 * this.TS) {
            this.respawnX = 58;
        }

        // flag reached -> level clear
        const flagX = 116 * this.TS;
        if (this.state == this.phase.playing && !this.dead && this.px + this.pw > flagX + 6) {
            this.levelClear();
        }

        this.updateGoombas(dt);
        this.updateItems(dt);
        this.updateParticles(dt);
        this.updateBumps(dt);

        // camera (smooth-ish follow)
        const target = this.px - this.w / 2;
        this.camX = Math.max(0, Math.min(target, this.levelW * this.TS - this.w));
    }

    private moveAndCollide(dt: number) {
        const ts = this.TS;
        // horizontal
        let nx = this.px + this.pvx * dt;
        if (this.pvx > 0) {
            const col = Math.floor((nx + this.pw - 1) / ts);
            const r0 = Math.floor(this.py / ts);
            const r1 = Math.floor((this.py + this.ph - 1) / ts);
            for (let r = r0; r <= r1; r++) {
                if (this.isSolid(this.charAt(col, r))) {
                    nx = col * ts - this.pw;
                    this.pvx = 0;
                    break;
                }
            }
        } else if (this.pvx < 0) {
            const col = Math.floor(nx / ts);
            const r0 = Math.floor(this.py / ts);
            const r1 = Math.floor((this.py + this.ph - 1) / ts);
            for (let r = r0; r <= r1; r++) {
                if (this.isSolid(this.charAt(col, r))) {
                    nx = (col + 1) * ts;
                    this.pvx = 0;
                    break;
                }
            }
        }
        this.px = nx;

        // vertical
        this.onGround = false;
        let ny = this.py + this.pvy * dt;
        if (this.pvy > 0) {
            const row = Math.floor((ny + this.ph - 1) / ts);
            const c0 = Math.floor(this.px / ts);
            const c1 = Math.floor((this.px + this.pw - 1) / ts);
            for (let c = c0; c <= c1; c++) {
                if (this.isSolid(this.charAt(c, row))) {
                    ny = row * ts - this.ph;
                    this.pvy = 0;
                    this.onGround = true;
                    break;
                }
            }
        } else if (this.pvy < 0) {
            const row = Math.floor(ny / ts);
            const c0 = Math.floor(this.px / ts);
            const c1 = Math.floor((this.px + this.pw - 1) / ts);
            for (let c = c0; c <= c1; c++) {
                const ch = this.charAt(c, row);
                if (this.isSolid(ch)) {
                    ny = (row + 1) * ts;
                    this.pvy = 0;
                    this.bumpBlock(c, row, ch);
                    break;
                }
            }
        }
        this.py = ny;
    }

    private bumpBlock(c: number, r: number, ch: string) {
        // small mario can't break bricks, just bumps them
        if (ch == 'B' && !this.big) {
            this.bumps.push({ col: c, row: r, t: 0.25 });
            this.playSfx(200, 50, 0);
            return;
        }
        if (ch == 'B') {
            // big mario breaks bricks
            this.setTile(c, r, ' ');
            this.score += 50;
            this.spawnBrickDebris(c, r);
            this.playSfx(300, 40, 5);
            this.playSfx(180, 60, 0);
            return;
        }
        if (ch == '?') {
            this.setTile(c, r, 'U');
            this.coins++;
            this.score += 200;
            this.bumps.push({ col: c, row: r, t: 0.25 });
            this.spawnCoinPop(c, r);
            this.playSfx(988, 40, 5);
            this.playSfx(1319, 70, 0);
            return;
        }
        if (ch == 'M') {
            this.setTile(c, r, 'U');
            this.bumps.push({ col: c, row: r, t: 0.25 });
            // spawn mushroom above the block
            this.items.push({
                x: c * this.TS + this.TS / 2 - 12,
                y: r * this.TS - 24,
                vx: 0,
                vy: 0,
                type: 0,
                t: 0,
            });
            this.playSfx(400, 50, 10);
            this.playSfx(500, 50, 0);
        }
    }

    private spawnBrickDebris(c: number, r: number) {
        const cx = c * this.TS + this.TS / 2;
        const cy = r * this.TS + this.TS / 2;
        const dirs: [number, number][] = [
            [-90, -320],
            [90, -320],
            [-60, -200],
            [60, -200],
        ];
        for (let i = 0; i < dirs.length; i++) {
            this.particles.push({ x: cx, y: cy, vx: dirs[i][0], vy: dirs[i][1], t: 0.7, type: 0 });
        }
    }

    private spawnCoinPop(c: number, r: number) {
        this.particles.push({
            x: c * this.TS + this.TS / 2,
            y: r * this.TS - 10,
            vx: 0,
            vy: -260,
            t: 0.55,
            type: 1,
        });
    }

    // ---------- entities ----------
    private updateGoombas(dt: number) {
        for (let i = this.goombas.length - 1; i >= 0; i--) {
            const g = this.goombas[i];
            if (!g.alive) {
                if (g.squashed > 0) {
                    g.squashed -= dt;
                }
                if (g.squashed <= 0) {
                    this.goombas.splice(i, 1);
                }
                continue;
            }
            g.t += dt;
            g.x += g.vx * dt;
            // turn at walls
            const footR = Math.floor((g.y + 26) / this.TS);
            const headR = Math.floor((g.y + 4) / this.TS);
            if (g.vx > 0) {
                const c = Math.floor((g.x + 26) / this.TS);
                if (this.isSolid(this.charAt(c, headR)) || this.isSolid(this.charAt(c, footR))) {
                    g.vx = -Math.abs(g.vx);
                }
            } else {
                const c = Math.floor(g.x / this.TS);
                if (this.isSolid(this.charAt(c, headR)) || this.isSolid(this.charAt(c, footR))) {
                    g.vx = Math.abs(g.vx);
                }
            }
            // turn at ledges (no ground ahead)
            if (g.alive) {
                const ahead = g.vx > 0 ? Math.floor((g.x + 26) / this.TS) : Math.floor(g.x / this.TS);
                const belowR = Math.floor((g.y + 28) / this.TS);
                if (!this.isSolid(this.charAt(ahead, belowR))) {
                    g.vx = -g.vx;
                }
            }

            // collide with player
            if (!this.dead && this.inv <= 0) {
                const overlap =
                    this.px < g.x + 24 &&
                    this.px + this.pw > g.x &&
                    this.py < g.y + 26 &&
                    this.py + this.ph > g.y + 2;
                if (overlap) {
                    const falling = this.pvy > 0 && this.py + this.ph - g.y < 16;
                    if (falling) {
                        // stomp!
                        g.alive = false;
                        g.squashed = 0.45;
                        this.pvy = -380;
                        this.combo++;
                        this.score += 100 * this.combo;
                        this.sparkle(g.x + 12, g.y + 10);
                        this.playSfx(520, 40, 8);
                        this.playSfx(300, 40, 0);
                    } else {
                        this.hurt();
                    }
                }
            }
        }
    }

    private updateItems(dt: number) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const it = this.items[i];
            it.t += dt;
            if (it.t < 0.4) {
                // pop out of the block
                it.y -= 40 * dt;
                continue;
            }
            if (it.vx == 0) {
                it.vx = 70;
            }
            it.vy = Math.min(this.MAXFALL, it.vy + this.GRAV * dt);
            let nx = it.x + it.vx * dt;
            if (it.vx > 0) {
                const c = Math.floor((nx + 24) / this.TS);
                const r = Math.floor((it.y + 20) / this.TS);
                if (this.isSolid(this.charAt(c, r))) {
                    it.vx = -70;
                }
            } else {
                const c = Math.floor(nx / this.TS);
                const r = Math.floor((it.y + 20) / this.TS);
                if (this.isSolid(this.charAt(c, r))) {
                    it.vx = 70;
                }
            }
            it.x = nx;
            let ny = it.y + it.vy * dt;
            if (it.vy > 0) {
                const row = Math.floor((ny + 24) / this.TS);
                const c0 = Math.floor(it.x / this.TS);
                const c1 = Math.floor((it.x + 24) / this.TS);
                for (let c = c0; c <= c1; c++) {
                    if (this.isSolid(this.charAt(c, row))) {
                        ny = row * this.TS - 24;
                        it.vy = 0;
                        break;
                    }
                }
            }
            it.y = ny;

            // collect
            if (
                !this.dead &&
                this.px < it.x + 24 &&
                this.px + this.pw > it.x &&
                this.py < it.y + 24 &&
                this.py + this.ph > it.y
            ) {
                if (it.type == 0) {
                    this.big = true;
                    this.ph = 56;
                    this.score += 1000;
                    this.inv = 0;
                    this.sparkle(it.x + 12, it.y + 12);
                    this.playSfx(700, 50, 8);
                    this.playSfx(900, 50, 8);
                    this.playSfx(1200, 80, 0);
                }
                this.items.splice(i, 1);
            }
            // fell off screen
            if (it.y > this.levelRows * this.TS + 20) {
                this.items.splice(i, 1);
            }
        }
    }

    private updateParticles(dt: number) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.t -= dt;
            if (p.t <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            if (p.type == 0) {
                p.vy += 1200 * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
            } else if (p.type == 1) {
                p.y += p.vy * dt;
            }
        }
    }

    private updateBumps(dt: number) {
        for (let i = this.bumps.length - 1; i >= 0; i--) {
            this.bumps[i].t -= dt;
            if (this.bumps[i].t <= 0) {
                this.bumps.splice(i, 1);
            }
        }
    }

    private sparkle(x: number, y: number) {
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            this.particles.push({
                x,
                y,
                vx: Math.cos(a) * 120,
                vy: Math.sin(a) * 120,
                t: 0.35,
                type: 2,
            });
        }
    }

    private hurt() {
        if (this.inv > 0 || this.dead) {
            return;
        }
        if (this.big) {
            this.big = false;
            this.ph = 30;
            this.inv = 2.0;
            this.playSfx(200, 60, 0);
        } else {
            this.die(true);
        }
    }

    private die(byEnemy: boolean) {
        if (this.dead) {
            return;
        }
        this.dead = true;
        this.lives--;
        if (byEnemy) {
            this.pvy = -500;
            this.playSfx(300, 50, 5);
            this.playSfx(180, 80, 0);
        }
        this.playSfx(900, 40, 5);
        this.playSfx(600, 40, 5);
        this.playSfx(300, 120, 0);
        if (this.lives <= 0) {
            this.state = this.phase.over;
            this.overT = 0;
        } else {
            // small respawn delay handled by waiting for py to fall off-screen
        }
    }

    private levelClear() {
        this.state = this.phase.clear;
        this.clearT = 0;
        this.score += Math.floor(this.time) * 5 + 1000;
        if (this.score > this.best) {
            this.best = this.score;
        }
        this.playSfx(660, 60, 10);
        this.playSfx(880, 60, 10);
        this.playSfx(1100, 60, 10);
        this.playSfx(880, 60, 10);
        this.playSfx(1320, 140, 0);
    }

    // ---------- draw ----------
    private drawBackground() {
        lcd.drawFilledRectangle(0, 0, this.w, this.h, this.sky1);
        // vertical sky gradient bands
        for (let i = 0; i < 8; i++) {
            const y0 = Math.floor((i * this.h) / 8);
            const y1 = Math.floor(((i + 1) * this.h) / 8);
            const t = i / 7;
            const r = Math.floor(48 + t * 72);
            const g = Math.floor(120 + t * 70);
            const b = Math.floor(220 - t * 20);
            lcd.drawFilledRectangle(0, y0, this.w, y1 - y0, lcd.RGB(r, g, b));
        }
        // parallax clouds
        const fc = lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void;
        for (let i = 0; i < this.decor.length; i++) {
            const d = this.decor[i];
            const dx = Math.floor(d.x - this.camX * d.v) % (this.w + 200);
            let sx = dx;
            if (sx < -100) {
                sx += this.w + 200;
            }
            const sy = d.y;
            lcd.drawFilledRectangle(Math.floor(sx - 22 * d.s), sy, Math.floor(44 * d.s), 10, lcd.RGB(255, 255, 255), 60);
            fc(Math.floor(sx - 18 * d.s), sy + 4, Math.floor(10 * d.s), lcd.RGB(255, 255, 255));
            fc(Math.floor(sx), sy + 2, Math.floor(14 * d.s), lcd.RGB(255, 255, 255));
            fc(Math.floor(sx + 18 * d.s), sy + 4, Math.floor(10 * d.s), lcd.RGB(255, 255, 255));
        }
    }

    private drawTiles() {
        const c0 = Math.max(0, Math.floor(this.camX / this.TS) - 1);
        const c1 = Math.min(this.levelW - 1, Math.floor((this.camX + this.w) / this.TS) + 1);
        for (let r = 0; r < this.levelRows; r++) {
            for (let c = c0; c <= c1; c++) {
                const ch = this.charAt(c, r);
                if (ch == ' ') {
                    continue;
                }
                const x = Math.floor(c * this.TS - this.camX);
                const y = r * this.TS;
                // bumped block offset
                let off = 0;
                for (let i = 0; i < this.bumps.length; i++) {
                    if (this.bumps[i].col == c && this.bumps[i].row == r) {
                        off = -Math.floor(Math.sin(this.bumps[i].t * 40) * 5);
                    }
                }
                this.drawTile(ch, x, y + off, c, r);
            }
        }
    }

    private drawTile(ch: string, x: number, y: number, c: number, r: number) {
        const ts = this.TS;
        if (ch == 'G') {
            // ground: grass top + dirt
            lcd.drawFilledRectangle(x, y, ts, ts, this.dirtC);
            lcd.drawFilledRectangle(x, y, ts, 10, this.grassC);
            lcd.drawFilledRectangle(x, y + 10, ts, 3, lcd.RGB(70, 160, 46));
            lcd.drawFilledRectangle(x + 6, y + 16, ts - 12, 4, this.dirtD);
            lcd.drawFilledRectangle(x + 14, y + 26, ts - 18, 4, this.dirtD);
        } else if (ch == 'B') {
            lcd.drawFilledRectangle(x, y, ts, ts, this.brickC);
            lcd.drawFilledRectangle(x + 2, y + 2, ts - 4, ts - 4, lcd.RGB(214, 100, 52));
            lcd.drawLine(x + ts / 2, y + 2, x + ts / 2, y + ts - 2, SOLID, this.brickD);
            lcd.drawLine(x + 2, y + ts / 2, x + ts - 2, y + ts / 2, SOLID, this.brickD);
            lcd.drawLine(x + 2, y + ts / 2, x + ts / 2 - 2, y + ts / 2, SOLID, this.brickD);
        } else if (ch == '?' || ch == 'M' || ch == 'U') {
            const isQ = ch == '?' || ch == 'M';
            lcd.drawFilledRectangle(x, y, ts, ts, isQ ? this.qC : this.brickC);
            lcd.drawFilledRectangle(x + 2, y + 2, ts - 4, ts - 4, isQ ? lcd.RGB(255, 200, 60) : lcd.RGB(214, 100, 52));
            if (isQ) {
                lcd.drawText(x + ts / 2, y + 4, ch == 'M' ? 'M' : '?', SMLSIZE | CENTER | lcd.RGB(150, 80, 10));
            }
            lcd.drawLine(x + 2, y + ts - 6, x + ts - 2, y + ts - 6, SOLID, isQ ? this.qD : this.brickD);
        } else if (ch == 'P') {
            // pipe: top cell has cap rim
            const isTop = !this.isSolid(this.charAt(c, r - 1));
            lcd.drawFilledRectangle(x, y, ts, ts, this.pipeC);
            if (isTop) {
                lcd.drawFilledRectangle(x - 4, y, ts + 8, 12, this.pipeD);
                lcd.drawFilledRectangle(x - 4, y, ts + 8, 4, lcd.RGB(120, 220, 130));
            }
            lcd.drawFilledRectangle(x + ts - 8, y + (isTop ? 14 : 0), 8, ts, this.pipeD);
            lcd.drawFilledRectangle(x + ts - 14, y + (isTop ? 14 : 0), 3, ts, lcd.RGB(120, 220, 130));
        }
    }

    private drawCoins() {
        const c0 = Math.max(0, Math.floor(this.camX / this.TS) - 1);
        const c1 = Math.min(this.levelW - 1, Math.floor((this.camX + this.w) / this.TS) + 1);
        const fc = lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void;
        for (let r = 0; r < this.levelRows; r++) {
            for (let c = c0; c <= c1; c++) {
                if (this.charAt(c, r) != 'o') {
                    continue;
                }
                const x = Math.floor(c * this.TS - this.camX) + this.TS / 2;
                const y = r * this.TS + this.TS / 2 + Math.floor(Math.sin(this.animT * 6 + c) * 3);
                const spin = Math.abs(Math.sin(this.animT * 5 + c * 0.5));
                const rw = Math.max(3, Math.floor(9 * spin));
                fc(x, y, 9, this.coinC);
                lcd.drawFilledRectangle(x - rw, y - 7, rw * 2, 14, this.coinC);
                lcd.drawFilledRectangle(x - rw, y - 7, rw * 2, 4, lcd.RGB(255, 235, 140));
                fc(x, y, 5, this.coinC);
            }
        }
    }

    private drawGoombas() {
        const fc = lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void;
        for (let i = 0; i < this.goombas.length; i++) {
            const g = this.goombas[i];
            const x = Math.floor(g.x - this.camX);
            const y = Math.floor(g.y);
            if (x < -40 || x > this.w + 40) {
                continue;
            }
            if (g.alive) {
                // body (mushroom dome)
                const waddle = Math.sin(g.t * 10) * 2;
                fc(x + 12 + waddle, y + 14, 14, this.goombaC);
                fc(x + 10, y + 6, 8, this.goombaC);
                fc(x + 14, y + 4, 8, this.goombaC);
                lcd.drawFilledRectangle(x + 4, y + 14, 16, 8, this.goombaC);
                // feet
                lcd.drawFilledRectangle(x + 4, y + 20, 7, 6, lcd.RGB(80, 45, 20));
                lcd.drawFilledRectangle(x + 13, y + 20, 7, 6, lcd.RGB(80, 45, 20));
                // eyes
                fc(x + 8, y + 10, 4, lcd.RGB(255, 255, 255));
                fc(x + 16, y + 10, 4, lcd.RGB(255, 255, 255));
                fc(x + 9, y + 10, 2, lcd.RGB(30, 30, 30));
                fc(x + 17, y + 10, 2, lcd.RGB(30, 30, 30));
                // angry brow
                lcd.drawLine(x + 6, y + 6, x + 12, y + 8, SOLID, lcd.RGB(60, 30, 15));
                lcd.drawLine(x + 14, y + 8, x + 20, y + 6, SOLID, lcd.RGB(60, 30, 15));
            } else {
                // squashed
                lcd.drawFilledRectangle(x + 2, y + 16, 20, 8, this.goombaC);
                lcd.drawFilledRectangle(x + 6, y + 22, 5, 4, lcd.RGB(80, 45, 20));
                lcd.drawFilledRectangle(x + 13, y + 22, 5, 4, lcd.RGB(80, 45, 20));
            }
        }
    }

    private drawItems() {
        const fc = lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void;
        for (let i = 0; i < this.items.length; i++) {
            const it = this.items[i];
            const x = Math.floor(it.x - this.camX);
            const y = Math.floor(it.y);
            if (it.type == 0) {
                // mushroom: red cap, white dots, cream stem
                fc(x + 12, y + 12, 11, lcd.RGB(210, 40, 40));
                fc(x + 7, y + 6, 5, lcd.RGB(210, 40, 40));
                lcd.drawFilledRectangle(x + 5, y + 11, 14, 10, lcd.RGB(250, 230, 200));
                lcd.drawFilledRectangle(x + 10, y + 20, 4, 4, lcd.RGB(250, 230, 200));
                fc(x + 8, y + 9, 2.5, lcd.RGB(255, 255, 255));
                fc(x + 16, y + 9, 2.5, lcd.RGB(255, 255, 255));
                lcd.drawFilledRectangle(x + 4, y + 5, 3, 3, lcd.RGB(60, 30, 15));
                lcd.drawFilledRectangle(x + 16, y + 5, 3, 3, lcd.RGB(60, 30, 15));
            }
        }
    }

    private drawParticles() {
        const fc = lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            const x = Math.floor(p.x - this.camX);
            const y = Math.floor(p.y);
            if (p.type == 0) {
                lcd.drawFilledRectangle(x - 4, y - 4, 8, 8, this.brickC);
            } else if (p.type == 1) {
                fc(x, y, 7, this.coinC);
                lcd.drawFilledRectangle(x - 3, y - 5, 6, 10, this.coinC);
            } else {
                fc(x, y, 3, lcd.RGB(255, 255, 255));
            }
        }
    }

    private drawPlayer() {
        if (this.inv > 0 && !this.dead && Math.floor(this.inv * 10) % 2 == 0) {
            // blink when invincible
            return;
        }
        const x = Math.floor(this.px - this.camX);
        const y = Math.floor(this.py);
        if (this.dead) {
            // dying flip animation
            this.drawMario(x, y, false);
            return;
        }
        const running = Math.abs(this.pvx) > 10 && this.onGround;
        const airborne = !this.onGround;
        this.drawMario(x, y, airborne, running);
    }

    private drawMario(x: number, y: number, airborne: boolean, running: boolean = false) {
        const f = this.facing;
        const h = this.big ? 56 : 30;
        // shoes
        lcd.drawFilledRectangle(x + 2, y + h - 6, 9, 6, this.shoeC);
        lcd.drawFilledRectangle(x + 13, y + h - 6, 9, 6, this.shoeC);
        if (airborne) {
            lcd.drawFilledRectangle(x + 4, y + h - 8, 8, 4, this.shoeC);
            lcd.drawFilledRectangle(x + 13, y + h - 10, 8, 4, this.shoeC);
        }
        // legs/overalls
        lcd.drawFilledRectangle(x + 4, y + h - 14, 7, 8, this.overallC);
        lcd.drawFilledRectangle(x + 13, y + h - 14, 7, 8, this.overallC);
        // torso
        const torsoH = this.big ? 22 : 12;
        lcd.drawFilledRectangle(x + 3, y + h - 14 - torsoH + 4, 18, torsoH - 4, this.capC);
        lcd.drawFilledRectangle(x + 3, y + h - 12, 18, 6, this.overallC);
        // overalls straps
        lcd.drawLine(x + 6, y + h - 12, x + 6, y + h - 8, SOLID, this.overallC);
        lcd.drawLine(x + 18, y + h - 12, x + 18, y + h - 8, SOLID, this.overallC);
        // arms
        lcd.drawFilledRectangle(x - 1, y + h - 22, 5, 9, this.skinC);
        lcd.drawFilledRectangle(x + 20, y + h - 22, 5, 9, this.skinC);
        // head
        const hy = y + h - 30;
        lcd.drawFilledRectangle(x + 3, hy + 4, 18, 14, this.skinC);
        // hair
        lcd.drawFilledRectangle(x + 3, hy + 2, 18, 6, lcd.RGB(100, 60, 20));
        // cap
        lcd.drawFilledRectangle(x + 1, hy, 22, 6, this.capC);
        lcd.drawFilledRectangle(x + 1, hy + 4, 22, 3, this.capC);
        // cap brim (facing)
        if (f > 0) {
            lcd.drawFilledRectangle(x + 20, hy + 2, 6, 4, this.capC);
        } else {
            lcd.drawFilledRectangle(x - 2, hy + 2, 6, 4, this.capC);
        }
        // nose
        if (f > 0) {
            lcd.drawFilledRectangle(x + 20, hy + 9, 3, 4, this.skinC);
        } else {
            lcd.drawFilledRectangle(x + 1, hy + 9, 3, 4, this.skinC);
        }
        // eye
        if (f > 0) {
            lcd.drawFilledRectangle(x + 14, hy + 8, 3, 3, lcd.RGB(30, 30, 30));
        } else {
            lcd.drawFilledRectangle(x + 7, hy + 8, 3, 3, lcd.RGB(30, 30, 30));
        }
        // mustache
        lcd.drawFilledRectangle(x + 5, hy + 14, 14, 2, lcd.RGB(90, 50, 20));
        // button
        lcd.drawFilledRectangle(x + 10, y + h - 10, 4, 4, lcd.RGB(255, 220, 60));
        if (this.big) {
            // taller cap tuft
            lcd.drawFilledRectangle(x + 14, hy - 4, 4, 5, lcd.RGB(100, 60, 20));
        }
    }

    private drawHud() {
        lcd.drawFilledRectangle(0, 0, this.w, 22, lcd.RGB(0, 0, 0), 55);
        lcd.drawText(6, 4, `SCORE ${this.score}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w / 2 - 40, 4, `×${this.coins}`, SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        // coin icon
        const fc = lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void;
        fc(this.w / 2 - 52, 11, 5, this.coinC);
        lcd.drawFilledRectangle(this.w / 2 - 53, 7, 3, 8, this.coinC);
        lcd.drawText(this.w / 2 + 60, 4, `TIME ${Math.max(0, Math.ceil(this.time))}`, SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        // lives (with a mini mario icon on the far right)
        const lx = this.w - 30;
        lcd.drawText(lx, 4, `${Math.max(0, this.lives)}`, SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        fc(lx - 14, 11, 5, this.capC);
        lcd.drawFilledRectangle(lx - 18, 10, 8, 4, this.capC);
        lcd.drawFilledRectangle(lx - 16, 15, 4, 4, this.overallC);
    }

    private drawOverlay(title: string, sub: string) {
        lcd.drawFilledRectangle(18, 18, this.w - 36, this.h - 36, COLOR_THEME_SECONDARY1, 1);
        lcd.drawRectangle(18, 18, this.w - 36, this.h - 36, COLOR_THEME_PRIMARY1, 2);
        lcd.drawText(this.w / 2, this.h / 2 - 30, title, COLOR_THEME_PRIMARY1 | CENTER | VCENTER | DBLSIZE);
        lcd.drawText(this.w / 2, this.h / 2 + 20, sub, SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
    }

    private draw() {
        this.drawBackground();
        this.drawTiles();
        this.drawCoins();
        this.drawItems();
        this.drawGoombas();
        this.drawParticles();
        this.drawPlayer();
        this.drawFlag();
        this.drawHud();

        if (this.state == this.phase.title) {
            const bestLine = this.best > 0 ? `\nbest ${this.best}` : '';
            this.drawOverlay('SUPER MARIO', `stick: run   ENTER / MDL / TELE: jump\n\nENTER / touch / MDL / TELE: start${bestLine}`);
        } else if (this.state == this.phase.over) {
            this.drawOverlay('GAME OVER', `score ${this.score}   best ${this.best}\n\nENTER / touch / MDL / TELE: retry`);
        } else if (this.state == this.phase.clear) {
            this.drawOverlay('LEVEL CLEAR!', `score ${this.score}   best ${this.best}\n\nENTER / touch / MDL / TELE: next`);
        }
    }

    private drawFlag() {
        const x = Math.floor(116 * this.TS - this.camX);
        // pole
        lcd.drawLine(x + 10, 40, x + 10, 240, SOLID, lcd.RGB(200, 200, 210));
        // ball on top
        const fc = lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void;
        fc(x + 10, 40, 5, lcd.RGB(240, 240, 240));
        // flag (waving)
        lcd.drawFilledRectangle(x + 10, 46, 30, 18, lcd.RGB(220, 40, 40));
        lcd.drawFilledRectangle(x + 26, 46, 14, 18, lcd.RGB(120, 20, 20));
        fc(x + 20, 55, 4, lcd.RGB(255, 255, 255));
        // base
        lcd.drawFilledRectangle(x + 2, 240, 17, 10, this.dirtC);
        lcd.drawFilledRectangle(x - 2, 250, 25, 10, this.dirtC);
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
            if (this.dead) {
                // death animation: wait until off-screen then respawn or game over
                if (this.py > this.levelRows * this.TS + 30) {
                    if (this.lives < 0) {
                        this.state = this.phase.over;
                        this.overT = 0;
                    } else {
                        this.respawn();
                    }
                } else {
                    this.update(dt);
                }
            } else {
                this.update(dt);
            }
        } else if (this.state == this.phase.clear) {
            this.clearT += dt;
            this.animT += dt;
        } else if (this.state == this.phase.over) {
            this.overT += dt;
            this.animT += dt;
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
