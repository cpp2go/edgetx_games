interface Bullet {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
}

interface Rock {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
}

declare function getLastPos(): LuaMultiReturn<[unknown, unknown]>;

class Game {
    private shipX = 0;
    private shipY = 0;
    private shipVx = 0;
    private shipVy = 0;
    private shipAngle = -90;

    private bullets: Bullet[] = [];
    private rocks: Rock[] = [];

    private score = 0;
    private best = 0;
    private lives = 3;
    private wave = 1;

    private fireCooldownUntil = 0;
    private invulUntil = 0;

    private state = { initial: 0, playing: 1, paused: 2, gameOver: 3 };
    private phase = this.state.initial;

    private lastTick = 0;
    private soundEnabled = true;

    constructor(private w: number, private h: number) {
        this.resetShip(true);
        this.lastTick = getTime();
    }

    private playSfx(freq: number, duration: number, pause: number = 0) {
        if (!this.soundEnabled) {
            return;
        }
        (playTone as unknown as (f: number, d: number, p: number) => void)(freq, duration, pause);
    }

    private clamp(v: number, minV: number, maxV: number): number {
        return Math.max(minV, Math.min(maxV, v));
    }

    private wrapX(x: number): number {
        if (x < 0) {
            return this.w;
        }
        if (x > this.w) {
            return 0;
        }
        return x;
    }

    private wrapY(y: number): number {
        if (y < 0) {
            return this.h;
        }
        if (y > this.h) {
            return 0;
        }
        return y;
    }

    private toRad(deg: number): number {
        return (deg * math.pi) / 180;
    }

    private rand(min: number, max: number): number {
        return min + math.random() * (max - min);
    }

    private rockRadius(size: number): number {
        if (size == 3) {
            return 20;
        }
        if (size == 2) {
            return 13;
        }
        return 8;
    }

    private isTouchEvent(event: number): boolean {
        return event == EVT_TOUCH_FIRST || event == EVT_TOUCH_SLIDE || event == EVT_TOUCH_TAP || event == EVT_TOUCH_BREAK;
    }

    private readTouchPosition(): { x: number; y: number } | null {
        if (type(getLastPos as unknown) != 'function') {
            return null;
        }

        const [xRaw, yRaw] = getLastPos();
        if (type(xRaw) == 'number' && type(yRaw) == 'number') {
            return { x: xRaw as number, y: yRaw as number };
        }

        if (type(xRaw) == 'table') {
            const t = xRaw as { x?: unknown; y?: unknown; [k: number]: unknown };
            const tx = (t.x as number) ?? (t[1] as number);
            const ty = (t.y as number) ?? (t[2] as number);
            if (type(tx) == 'number' && type(ty) == 'number') {
                return { x: tx, y: ty };
            }
        }

        return null;
    }

    private resetShip(clearVelocity: boolean) {
        this.shipX = this.w / 2;
        this.shipY = this.h * 0.7;
        this.shipAngle = -90;
        if (clearVelocity) {
            this.shipVx = 0;
            this.shipVy = 0;
        }
    }

    private spawnRock(size: number, avoidCenter: boolean) {
        let x = this.rand(0, this.w);
        let y = this.rand(0, this.h * 0.55);
        if (avoidCenter) {
            let tries = 0;
            while (tries < 12) {
                const dx = x - this.w / 2;
                const dy = y - this.h * 0.7;
                if (dx * dx + dy * dy > 120 * 120) {
                    break;
                }
                x = this.rand(0, this.w);
                y = this.rand(0, this.h * 0.55);
                tries++;
            }
        }

        const speed = this.rand(0.45, 1.25);
        const a = this.toRad(this.rand(0, 360));
        this.rocks.push({ x: x, y: y, vx: math.cos(a) * speed, vy: math.sin(a) * speed, size: size });
    }

    private startWave() {
        const count = 4 + this.wave;
        for (let i = 0; i < count; i++) {
            this.spawnRock(3, true);
        }
    }

    private restart() {
        this.score = 0;
        this.lives = 3;
        this.wave = 1;
        this.bullets = [];
        this.rocks = [];
        this.resetShip(true);
        this.startWave();
        this.fireCooldownUntil = 0;
        this.invulUntil = getTime() + 80;
        this.phase = this.state.playing;
        this.lastTick = getTime();
        this.playSfx(860, 90, 0);
    }

    private shoot() {
        if (this.phase != this.state.playing) {
            return;
        }
        const now = getTime();
        if (now < this.fireCooldownUntil) {
            return;
        }

        const a = this.toRad(this.shipAngle);
        const tipX = this.shipX + math.cos(a) * 12;
        const tipY = this.shipY + math.sin(a) * 12;
        const bulletSpeed = 4.9;

        this.bullets.push({
            x: tipX,
            y: tipY,
            vx: math.cos(a) * bulletSpeed + this.shipVx,
            vy: math.sin(a) * bulletSpeed + this.shipVy,
            life: 95,
        });

        this.fireCooldownUntil = now + 5;
        this.playSfx(920, 18, 0);
    }

    private controlShipFromStick(dt: number) {
        const turn = getValue('ail') / 1024;
        const thrustAxis = -getValue('ele') / 1024;

        this.shipAngle += turn * 4.2 * dt;

        if (thrustAxis > 0.18) {
            const force = 0.12 * thrustAxis;
            const a = this.toRad(this.shipAngle);
            this.shipVx += math.cos(a) * force * dt;
            this.shipVy += math.sin(a) * force * dt;
        }
    }

    private controlShipFromTouch(event: number, dt: number) {
        if (!this.isTouchEvent(event)) {
            return;
        }

        if (event == EVT_TOUCH_TAP) {
            if (this.phase == this.state.initial || this.phase == this.state.gameOver) {
                this.restart();
                return;
            }
            this.shoot();
            return;
        }

        const p = this.readTouchPosition();
        if (p == null) {
            return;
        }

        if (p.x < this.w * 0.33) {
            this.shipAngle -= 5.0 * dt;
        } else if (p.x > this.w * 0.67) {
            this.shipAngle += 5.0 * dt;
        } else {
            const a = this.toRad(this.shipAngle);
            this.shipVx += math.cos(a) * 0.11 * dt;
            this.shipVy += math.sin(a) * 0.11 * dt;
        }
    }

    private updateShip(dt: number) {
        this.shipVx = this.clamp(this.shipVx, -3.2, 3.2);
        this.shipVy = this.clamp(this.shipVy, -3.2, 3.2);

        this.shipX += this.shipVx * dt;
        this.shipY += this.shipVy * dt;

        this.shipVx *= 0.992;
        this.shipVy *= 0.992;

        this.shipX = this.wrapX(this.shipX);
        this.shipY = this.wrapY(this.shipY);
    }

    private updateBullets(dt: number) {
        let i = 0;
        while (i < this.bullets.length) {
            const b = this.bullets[i];
            b.x = this.wrapX(b.x + b.vx * dt);
            b.y = this.wrapY(b.y + b.vy * dt);
            b.life -= dt;

            if (b.life <= 0) {
                this.bullets.splice(i, 1);
            } else {
                i++;
            }
        }
    }

    private updateRocks(dt: number) {
        for (let i = 0; i < this.rocks.length; i++) {
            const r = this.rocks[i];
            r.x = this.wrapX(r.x + r.vx * dt);
            r.y = this.wrapY(r.y + r.vy * dt);
        }
    }

    private splitRock(index: number) {
        const r = this.rocks[index];
        const size = r.size;
        this.rocks.splice(index, 1);

        if (size > 1) {
            for (let i = 0; i < 2; i++) {
                const a = this.toRad(this.rand(0, 360));
                const s = this.rand(0.9, 1.8) * (size == 3 ? 1.0 : 1.18);
                this.rocks.push({
                    x: r.x,
                    y: r.y,
                    vx: math.cos(a) * s,
                    vy: math.sin(a) * s,
                    size: size - 1,
                });
            }
        }

        const add = size == 3 ? 20 : size == 2 ? 35 : 50;
        this.score += add;
        this.playSfx(540 + size * 120, 30, 0);
    }

    private dist2(ax: number, ay: number, bx: number, by: number): number {
        const dx = ax - bx;
        const dy = ay - by;
        return dx * dx + dy * dy;
    }

    private handleBulletRockCollisions() {
        let bi = 0;
        while (bi < this.bullets.length) {
            const b = this.bullets[bi];
            let hit = false;

            for (let ri = 0; ri < this.rocks.length; ri++) {
                const r = this.rocks[ri];
                const rr = this.rockRadius(r.size);
                if (this.dist2(b.x, b.y, r.x, r.y) <= rr * rr) {
                    this.bullets.splice(bi, 1);
                    this.splitRock(ri);
                    hit = true;
                    break;
                }
            }

            if (!hit) {
                bi++;
            }
        }
    }

    private handleShipRockCollision(now: number) {
        if (now < this.invulUntil) {
            return;
        }

        for (let i = 0; i < this.rocks.length; i++) {
            const r = this.rocks[i];
            const rr = this.rockRadius(r.size) + 7;
            if (this.dist2(this.shipX, this.shipY, r.x, r.y) <= rr * rr) {
                this.lives -= 1;
                this.playSfx(170, 240, 0);
                if (this.lives <= 0) {
                    this.best = Math.max(this.best, this.score);
                    this.phase = this.state.gameOver;
                    return;
                }

                this.resetShip(true);
                this.invulUntil = now + 90;
                return;
            }
        }
    }

    private onEvent(event: number) {
        if (event == EVT_SYS_BREAK) {
            this.restart();
            return;
        }

        if (event == EVT_MODEL_FIRST) {
            if (this.phase == this.state.playing) {
                this.phase = this.state.paused;
                this.playSfx(420, 60, 0);
            } else if (this.phase == this.state.paused) {
                this.phase = this.state.playing;
                this.playSfx(820, 40, 0);
            }
            return;
        }

        if (event == EVT_TELEM_FIRST || event == EVT_ENTER_BREAK || event == EVT_VIRTUAL_ENTER) {
            if (this.phase == this.state.initial || this.phase == this.state.gameOver) {
                this.restart();
            } else {
                this.shoot();
            }
        }
    }

    private update(event: number) {
        if (this.phase != this.state.playing) {
            return;
        }

        const now = getTime();
        let dt = now - this.lastTick;
        if (dt <= 0) {
            dt = 1;
        }
        if (dt > 4) {
            dt = 4;
        }

        this.controlShipFromStick(dt);
        this.controlShipFromTouch(event, dt);
        this.updateShip(dt);
        this.updateBullets(dt);
        this.updateRocks(dt);
        this.handleBulletRockCollisions();
        this.handleShipRockCollision(now);

        if (this.rocks.length == 0) {
            this.wave += 1;
            this.startWave();
            this.playSfx(980, 80, 0);
        }

        this.lastTick = now;
    }

    private drawShip() {
        if (this.phase == this.state.initial) {
            return;
        }

        const now = getTime();
        if (now < this.invulUntil && (math.floor(now / 4) % 2 == 0)) {
            return;
        }

        const a = this.toRad(this.shipAngle);
        const n0 = this.toRad(this.shipAngle + 135);
        const n1 = this.toRad(this.shipAngle - 135);

        const noseX = this.shipX + math.cos(a) * 11;
        const noseY = this.shipY + math.sin(a) * 11;
        const lX = this.shipX + math.cos(n0) * 9;
        const lY = this.shipY + math.sin(n0) * 9;
        const rX = this.shipX + math.cos(n1) * 9;
        const rY = this.shipY + math.sin(n1) * 9;

        lcd.drawLine(noseX, noseY, lX, lY, SOLID, COLOR_THEME_SECONDARY2);
        lcd.drawLine(lX, lY, rX, rY, SOLID, COLOR_THEME_SECONDARY2);
        lcd.drawLine(rX, rY, noseX, noseY, SOLID, COLOR_THEME_SECONDARY2);
    }

    private drawBullets() {
        for (let i = 0; i < this.bullets.length; i++) {
            const b = this.bullets[i];
            lcd.drawFilledRectangle(b.x - 1, b.y - 1, 3, 3, COLOR_THEME_WARNING);
        }
    }

    private drawRocks() {
        for (let i = 0; i < this.rocks.length; i++) {
            const r = this.rocks[i];
            const rad = this.rockRadius(r.size);
            lcd.drawRectangle(r.x - rad, r.y - rad, rad * 2, rad * 2, COLOR_THEME_PRIMARY1);
            lcd.drawLine(r.x - rad, r.y, r.x + rad, r.y, DOTTED, COLOR_THEME_PRIMARY1);
            lcd.drawLine(r.x, r.y - rad, r.x, r.y + rad, DOTTED, COLOR_THEME_PRIMARY1);
        }
    }

    private drawHud() {
        lcd.drawText(4, 3, `S:${this.score}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(56, 3, `L:${this.lives}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(100, 3, `W:${this.wave}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w - 4, 3, `Best:${this.best}`, SMLSIZE | RIGHT | COLOR_THEME_PRIMARY1);
    }

    private drawOverlay(text: string) {
        lcd.drawFilledRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_SECONDARY1, 1);
        lcd.drawRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_PRIMARY1, 2);
        lcd.drawText(this.w / 2, this.h / 2, text, COLOR_THEME_PRIMARY1 | CENTER | VCENTER | DBLSIZE);
    }

    private draw() {
        lcd.clear(COLOR_THEME_PRIMARY2);

        // stars
        for (let i = 0; i < 44; i++) {
            const x = (i * 71 + this.wave * 13) % this.w;
            const y = (i * 47 + this.wave * 17) % this.h;
            lcd.drawPoint(x, y, COLOR_THEME_SECONDARY3);
        }

        this.drawRocks();
        this.drawBullets();
        this.drawShip();
        this.drawHud();

        if (this.phase == this.state.initial) {
            this.drawOverlay('ASTEROIDS\nPress SYS');
        } else if (this.phase == this.state.paused) {
            this.drawOverlay('PAUSED');
        } else if (this.phase == this.state.gameOver) {
            this.drawOverlay('GAME OVER\nPress SYS');
        }
    }

    public run(event: number, touchState: any): number {
        if (event != null) {
            this.onEvent(event);
        }

        this.update(event);
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
