declare function getLastPos(): LuaMultiReturn<[unknown, unknown]>;

interface Enemy {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    speed: number;
    r: number;
    kind: number;
    hit: number; // hit-flash timer
    exp: number;
}

interface Bullet {
    x: number;
    y: number;
    vx: number;
    vy: number;
    damage: number;
    pierce: number;
    life: number;
}

interface Gem {
    x: number;
    y: number;
    val: number;
}

interface Spark {
    x: number;
    y: number;
    t: number;
    c: number;
}

interface Upg {
    id: number;
    name: string;
    icon: string;
}

// Vampire Survivors (EdgeTX): real-time bullet-hell survival. Move with the
// stick, weapons fire automatically at the nearest enemy, enemies pour in from
// the edges, gems level you up and you pick one of three power-ups. Sprites and
// sounds come from the Unity "Survivor" project.
class Game {
    private w: number;
    private h: number;

    // big world + scrolling camera
    private worldW = 0;
    private worldH = 0;
    private camX = 0;
    private camY = 0;
    private decor: { x: number; y: number; t: number }[] = [];

    // player
    private px = 0;
    private py = 0;
    private hp = 100;
    private maxHp = 100;
    private speed = 155;
    private inv = 0; // invulnerability timer (seconds)
    private face = 0; // facing angle

    // weapon (fully automatic)
    private dmg = 12;
    private fireRate = 2.6; // shots per second
    private bulletSpeed = 275;
    private bulletCount = 1;
    private pierce = 0;
    private fireTimer = 0;

    // run stats
    private level = 1;
    private exp = 0;
    private expNext = 6;
    private kills = 0;
    private time = 0;
    private magnet = 85;

    // entities
    private enemies: Enemy[] = [];
    private bullets: Bullet[] = [];
    private gems: Gem[] = [];
    private sparks: Spark[] = [];

    // difficulty
    private spawnTimer = 0;
    private spawnInterval = 1.0;
    private scale = 1;

    // level-up picker
    private upgChoices: Upg[] = [];
    private upgSel = 0;
    private upgFlash = 0;
    private upgradeFlash = '';

    private phase = { initial: 0, playing: 1, levelup: 2, gameOver: 3 };
    private state = this.phase.initial;

    private lastTick = 0;
    private soundEnabled = true;
    private shootSndCd = 0;
    private killSndCd = 0;
    private gemSndCd = 0;
    private bgmNext = 0;

    // sprites (pre-scaled, drawn at 100%)
    private pwImgs: (Bitmap | null)[] = [];
    private eImgs: (Bitmap | null)[][] = [];
    private bulletImg: Bitmap | null = null;
    private animTimer = 0;
    private animFrame = 0;

    // palette
    private bg1 = lcd.RGB(22, 15, 32);
    private bg2 = lcd.RGB(40, 32, 54);
    private gridC = lcd.RGB(54, 44, 68);
    private bulletC = lcd.RGB(255, 226, 118);
    private gemC = lcd.RGB(96, 224, 255);
    private playerC = lcd.RGB(245, 240, 255);

    constructor(w: number, h: number) {
        this.w = w;
        this.h = h;
        this.worldW = w * 3;
        this.worldH = h * 3;
        this.px = this.worldW / 2;
        this.py = this.worldH / 2;
        this.camX = this.px - w / 2;
        this.camY = this.py - h / 2;
        this.buildDecor();
        this.lastTick = getTime();
        this.loadSprites();
        this.newGame();
        this.state = this.phase.initial;
    }

    private buildDecor() {
        this.decor = [];
        for (let i = 0; i < 70; i++) {
            this.decor.push({
                x: this.randRange(0, this.worldW),
                y: this.randRange(0, this.worldH),
                t: Math.floor(Math.random() * 3),
            });
        }
    }

    // ---------- audio ----------
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
        this.playSound('vampire', file);
        return true;
    }

    private playSfxFile(file: string, freq: number, duration: number) {
        if (!this.soundEnabled) {
            return;
        }
        if (this.tryPlayFile(file)) {
            return;
        }
        this.playSfx(freq, duration, 0);
    }

    private playBgm() {
        if (!this.soundEnabled) {
            return;
        }
        this.tryPlayFile('bgm.wav');
    }

    private loadImage(name: string): Bitmap | null {
        const tries = [
            `./IMAGES/${name}`,
            `./SCRIPTS/IMAGES/${name}`,
            `/SCRIPTS/IMAGES/${name}`,
            `/SCRIPTS/GAMES/IMAGES/${name}`,
            `/SCRIPTS/GAMES/SCRIPTS/IMAGES/${name}`,
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

    private loadSprites() {
        for (let i = 0; i < 4; i++) {
            this.pwImgs[i] = this.loadImage(`vamp-pw${i}.png`);
        }
        for (let k = 0; k < 4; k++) {
            this.eImgs[k] = [];
            for (let f = 0; f < 4; f++) {
                this.eImgs[k][f] = this.loadImage(`vamp-e${k}-${f}.png`);
            }
        }
        this.bulletImg = this.loadImage('vamp-bullet.png');
    }

    private randRange(a: number, b: number): number {
        return a + Math.random() * (b - a);
    }

    // ---------- run setup ----------
    private newGame() {
        this.px = this.worldW / 2;
        this.py = this.worldH / 2;
        this.camX = this.px - this.w / 2;
        this.camY = this.py - this.h / 2;
        this.hp = this.maxHp;
        this.inv = 2.0; // brief spawn protection
        this.dmg = 12;
        this.fireRate = 2.6;
        this.bulletSpeed = 275;
        this.bulletCount = 1;
        this.pierce = 0;
        this.level = 1;
        this.exp = 0;
        this.expNext = 6;
        this.kills = 0;
        this.time = 0;
        this.magnet = 85;
        this.enemies = [];
        this.bullets = [];
        this.gems = [];
        this.sparks = [];
        this.spawnInterval = 1.0;
        this.scale = 1;
        this.spawnTimer = 0.6;
        this.fireTimer = 0.3;
        this.animTimer = 0;
        this.animFrame = 0;
        this.upgradeFlash = '';
        this.killSndCd = 0;
        this.gemSndCd = 0;
        this.bgmNext = getTime() + 60;
        this.state = this.phase.playing;
        this.playSfxFile('start.wav', 660, 120);
    }

    private spawnEnemy() {
        // spawn just outside the camera view, in a random direction around the player
        const R = Math.max(this.w, this.h) * 0.8;
        const ang = this.randRange(0, Math.PI * 2);
        let x = this.px + Math.cos(ang) * R;
        let y = this.py + Math.sin(ang) * R;
        x = Math.max(10, Math.min(this.worldW - 10, x));
        y = Math.max(10, Math.min(this.worldH - 10, y));
        let maxKind = 0;
        if (this.time > 30) {
            maxKind = 1;
        }
        if (this.time > 70) {
            maxKind = 2;
        }
        if (this.time > 120) {
            maxKind = 3;
        }
        const kind = Math.floor(this.randRange(0, maxKind + 1));
        const base: Enemy = { x, y, hp: 10, maxHp: 10, speed: 40, r: 8, kind, hit: 0, exp: 1 };
        if (kind == 0) {
            base.hp = 10; base.maxHp = 10; base.speed = 42; base.r = 8; base.exp = 1;
        } else if (kind == 1) {
            base.hp = 6; base.maxHp = 6; base.speed = 74; base.r = 6; base.exp = 2;
        } else if (kind == 2) {
            base.hp = 32; base.maxHp = 32; base.speed = 26; base.r = 14; base.exp = 5;
        } else {
            base.hp = 9; base.maxHp = 9; base.speed = 98; base.r = 7; base.exp = 3;
        }
        base.hp = Math.floor(base.hp * this.scale);
        base.maxHp = base.hp;
        base.speed = base.speed * (1 + (this.scale - 1) * 0.5);
        this.enemies.push(base);
    }

    private nearestEnemy(): Enemy | null {
        let best: Enemy | null = null;
        let bd = 1e9;
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            const dx = e.x - this.px;
            const dy = e.y - this.py;
            const d = dx * dx + dy * dy;
            if (d < bd) {
                bd = d;
                best = e;
            }
        }
        return best;
    }

    private fire() {
        const t = this.nearestEnemy();
        if (t == null) {
            return;
        }
        const base = Math.atan2(t.y - this.py, t.x - this.px);
        this.face = base;
        const spread = 0.42;
        for (let i = 0; i < this.bulletCount; i++) {
            const ang = base + (i - (this.bulletCount - 1) / 2) * spread;
            this.bullets.push({
                x: this.px + Math.cos(ang) * 14,
                y: this.py + Math.sin(ang) * 14,
                vx: Math.cos(ang) * this.bulletSpeed,
                vy: Math.sin(ang) * this.bulletSpeed,
                damage: this.dmg,
                pierce: this.pierce,
                life: 1.6,
            });
        }
        if (this.bullets.length > 70) {
            this.bullets.splice(0, this.bullets.length - 70);
        }
        if (this.shootSndCd <= 0) {
            this.playSfxFile('chop1.wav', 1600, 8);
            this.shootSndCd = 0.16;
        }
    }

    // ---------- upgrade pool ----------
    private allUpgrades(): Upg[] {
        return [
            { id: 0, name: 'DMG UP', icon: '✚' },
            { id: 1, name: 'RAPID', icon: '»' },
            { id: 2, name: 'SPD UP', icon: '➤' },
            { id: 3, name: 'MULTI', icon: '✣' },
            { id: 4, name: 'MAX HP', icon: '♥' },
            { id: 5, name: 'MOVE+', icon: '◈' },
            { id: 6, name: 'MAGNET', icon: '◉' },
            { id: 7, name: 'PIERCE', icon: '⚡' },
            { id: 8, name: 'HEAL', icon: '✚' },
        ];
    }

    private rollUpgrades() {
        const pool = this.allUpgrades();
        const picks: Upg[] = [];
        const n = pool.length;
        for (let i = 0; i < 3; i++) {
            const idx = Math.floor(Math.random() * (n - i));
            picks.push(pool[idx]);
            pool[idx] = pool[n - 1 - i];
        }
        this.upgChoices = picks;
        this.upgSel = 0;
    }

    private applyUpgrade(id: number) {
        let name = '';
        if (id == 0) {
            this.dmg = Math.floor(this.dmg * 1.25); name = 'DMG UP';
        } else if (id == 1) {
            this.fireRate *= 1.15; name = 'RAPID';
        } else if (id == 2) {
            this.bulletSpeed = Math.floor(this.bulletSpeed * 1.1); name = 'SPD UP';
        } else if (id == 3) {
            if (this.bulletCount < 5) this.bulletCount++; name = 'MULTI';
        } else if (id == 4) {
            this.maxHp += 25; this.hp = this.maxHp; name = 'MAX HP';
        } else if (id == 5) {
            this.speed = Math.floor(this.speed * 1.1); name = 'MOVE+';
        } else if (id == 6) {
            this.magnet += 25; name = 'MAGNET';
        } else if (id == 7) {
            if (this.pierce < 3) this.pierce++; name = 'PIERCE';
        } else if (id == 8) {
            this.hp = Math.min(this.maxHp, this.hp + 30); name = 'HEAL';
        }
        this.upgradeFlash = name;
        this.upgFlash = 2.0;
        this.playSfxFile('dayup.wav', 880, 120);
    }

    private gainExp(v: number) {
        this.exp += v;
        while (this.exp >= this.expNext) {
            this.exp -= this.expNext;
            this.level++;
            this.expNext = Math.floor(6 + this.level * 2.5);
            if (this.state == this.phase.playing) {
                this.rollUpgrades();
                this.state = this.phase.levelup;
            }
        }
    }

    // ---------- update ----------
    private update(dt: number) {
        this.time += dt;
        this.shootSndCd -= dt;
        this.killSndCd -= dt;
        this.gemSndCd -= dt;
        this.animTimer += dt;
        if (this.animTimer >= 0.18) {
            this.animTimer -= 0.18;
            this.animFrame = (this.animFrame + 1) % 4;
        }
        if (this.upgFlash > 0) {
            this.upgFlash -= dt;
        }
        // difficulty ramps up over time
        this.spawnInterval = Math.max(0.28, 1.0 * Math.pow(0.92, this.time / 10));
        this.scale = 1 + this.time / 15 * 0.15;

        this.updatePlayer(dt);
        this.updateFire(dt);
        this.updateBullets(dt);
        this.updateEnemies(dt);
        this.updateGems(dt);
        this.updateSparks(dt);

        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this.spawnTimer = this.spawnInterval;
            if (this.enemies.length < 80) {
                this.spawnEnemy();
            }
        }
    }

    private updatePlayer(dt: number) {
        const sx = getValue('ail') / 1024;
        const sy = -getValue('ele') / 1024; // ele forward = up on screen
        const mag = Math.sqrt(sx * sx + sy * sy);
        if (mag > 0.18) {
            const nx = sx / mag;
            const ny = sy / mag;
            this.px += nx * this.speed * dt;
            this.py += ny * this.speed * dt;
            this.face = Math.atan2(ny, nx);
        }
        // clamp to the big world and smooth-follow the camera
        this.px = Math.max(20, Math.min(this.worldW - 20, this.px));
        this.py = Math.max(20, Math.min(this.worldH - 20, this.py));
        this.camX += (this.px - this.w / 2 - this.camX) * Math.min(1, dt * 8);
        this.camY += (this.py - this.h / 2 - this.camY) * Math.min(1, dt * 8);
        if (this.inv > 0) {
            this.inv -= dt;
        }
    }

    private updateFire(dt: number) {
        this.fireTimer -= dt;
        if (this.fireTimer <= 0) {
            this.fireTimer = 1 / this.fireRate;
            this.fire();
        }
    }

    private updateBullets(dt: number) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;
            if (b.life <= 0 || b.x < this.camX - 40 || b.x > this.camX + this.w + 40 || b.y < this.camY - 40 || b.y > this.camY + this.h + 40) {
                this.bullets.splice(i, 1);
                continue;
            }
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                const dx = e.x - b.x;
                const dy = e.y - b.y;
                const rr = e.r + 3;
                if (dx * dx + dy * dy <= rr * rr) {
                    e.hp -= b.damage;
                    e.hit = 0.12;
                    this.sparks.push({ x: e.x, y: e.y, t: 0.12, c: this.bulletC });
                    if (this.sparks.length > 40) {
                        this.sparks.splice(0, this.sparks.length - 40);
                    }
                    if (e.hp <= 0) {
                        this.killEnemy(j);
                    }
                    if (b.pierce > 0) {
                        b.pierce--;
                    } else {
                        this.bullets.splice(i, 1);
                        break;
                    }
                }
            }
        }
    }

    private updateEnemies(dt: number) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (e.hit > 0) {
                e.hit -= dt;
            }
            const dx = this.px - e.x;
            const dy = this.py - e.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > 1) {
                e.x += (dx / d) * e.speed * dt;
                e.y += (dy / d) * e.speed * dt;
            }
            const rr = e.r + 11;
            if (d <= rr && this.inv <= 0) {
                this.hurt(14);
                if (d > 1) {
                    e.x -= (dx / d) * 26;
                    e.y -= (dy / d) * 26;
                }
            }
        }
    }

    private updateGems(dt: number) {
        for (let i = this.gems.length - 1; i >= 0; i--) {
            const g = this.gems[i];
            const dx = this.px - g.x;
            const dy = this.py - g.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            const pull = d < this.magnet ? 320 : 90;
            if (d > 6) {
                g.x += (dx / d) * pull * dt;
                g.y += (dy / d) * pull * dt;
            } else {
                this.gainExp(g.val);
                this.gems.splice(i, 1);
                if (this.state == this.phase.playing && this.gemSndCd <= 0) {
                    this.gemSndCd = 0.12;
                    this.playSfxFile('food.wav', 1200, 10);
                }
                continue;
            }
        }
    }

    private updateSparks(dt: number) {
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.t -= dt;
            if (s.t <= 0) {
                this.sparks.splice(i, 1);
            }
        }
    }

    private killEnemy(idx: number) {
        const e = this.enemies[idx];
        this.enemies.splice(idx, 1);
        this.kills++;
        this.gems.push({ x: e.x, y: e.y, val: e.exp });
        if (this.gems.length > 90) {
            this.gems.splice(0, this.gems.length - 90);
        }
        this.sparks.push({ x: e.x, y: e.y, t: 0.18, c: lcd.RGB(230, 200, 120) });
        if (this.sparks.length > 40) {
            this.sparks.splice(0, this.sparks.length - 40);
        }
        if (this.killSndCd <= 0) {
            this.killSndCd = 0.1;
            this.playSfxFile('die.wav', 500 + e.kind * 120, 16);
        }
    }

    private hurt(dmg: number) {
        this.hp -= dmg;
        this.inv = 1.0;
        this.sparks.push({ x: this.px, y: this.py, t: 0.3, c: lcd.RGB(255, 80, 80) });
        if (this.sparks.length > 40) {
            this.sparks.splice(0, this.sparks.length - 40);
        }
        this.playSfxFile('ehurt1.wav', 200, 140);
        if (this.hp <= 0) {
            this.hp = 0;
            this.gameOver();
        }
    }

    private gameOver() {
        this.state = this.phase.gameOver;
        this.playSfxFile('ehurt2.wav', 160, 260);
    }

    // ---------- controls ----------
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
        if (this.state == this.phase.levelup) {
            if (event == EVT_TOUCH_TAP || event == EVT_TOUCH_FIRST) {
                this.confirmUpgrade(this.upgSel);
            }
            return;
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
        if (this.state == this.phase.levelup) {
            if (event == EVT_PLUS_BREAK || event == EVT_VIRTUAL_INC) {
                this.upgSel = (this.upgSel + 1) % this.upgChoices.length;
                this.playSfx(700, 8, 0);
            } else if (event == EVT_MINUS_BREAK || event == EVT_VIRTUAL_DEC) {
                this.upgSel = (this.upgSel + this.upgChoices.length - 1) % this.upgChoices.length;
                this.playSfx(700, 8, 0);
            } else if (event == EVT_ENTER_BREAK || event == EVT_VIRTUAL_ENTER) {
                this.confirmUpgrade(this.upgSel);
            }
            return;
        }
    }

    private confirmUpgrade(idx: number) {
        if (idx < 0 || idx >= this.upgChoices.length) {
            idx = 0;
        }
        this.applyUpgrade(this.upgChoices[idx].id);
        this.state = this.phase.playing;
    }

    // ---------- draw ----------
    private drawBackground() {
        lcd.drawFilledRectangle(0, 0, this.w, this.h, this.bg1);
        // world grid, scrolled with the camera
        const step = 40;
        const gx0 = Math.floor(this.camX / step);
        const gx1 = Math.floor((this.camX + this.w) / step);
        const gy0 = Math.floor(this.camY / step);
        const gy1 = Math.floor((this.camY + this.h) / step);
        for (let gx = gx0; gx <= gx1; gx++) {
            const sx = Math.floor(gx * step - this.camX);
            lcd.drawLine(sx, 0, sx, this.h, SOLID, this.gridC);
        }
        for (let gy = gy0; gy <= gy1; gy++) {
            const sy = Math.floor(gy * step - this.camY);
            lcd.drawLine(0, sy, this.w, sy, SOLID, this.gridC);
        }
        // static world decorations (grass tufts / rocks / flowers)
        const fc = lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void;
        for (let i = 0; i < this.decor.length; i++) {
            const d = this.decor[i];
            const dx = Math.floor(d.x - this.camX);
            const dy = Math.floor(d.y - this.camY);
            if (dx < -10 || dx > this.w + 10 || dy < -10 || dy > this.h + 10) {
                continue;
            }
            if (d.t == 0) {
                // grass tuft
                lcd.drawLine(dx, dy, dx - 4, dy - 5, SOLID, lcd.RGB(62, 92, 52));
                lcd.drawLine(dx, dy, dx + 4, dy - 5, SOLID, lcd.RGB(62, 92, 52));
                lcd.drawLine(dx, dy, dx, dy - 6, SOLID, lcd.RGB(72, 104, 58));
            } else if (d.t == 1) {
                // rock
                fc(dx, dy, 4, lcd.RGB(72, 62, 56));
            } else {
                // small flower
                fc(dx, dy, 2, lcd.RGB(178, 96, 130));
            }
        }
    }

    private drawCircle(x: number, y: number, r: number, c: number) {
        (lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void)(
            Math.floor(x),
            Math.floor(y),
            Math.floor(r),
            c
        );
    }

    private drawSprite(img: Bitmap | null, x: number, y: number) {
        if (img != null) {
            const [iw, ih] = Bitmap.getSize(img);
            lcd.drawBitmap(img, Math.floor(x - iw / 2), Math.floor(y - ih / 2), 100);
        }
    }

    private drawGems() {
        for (let i = 0; i < this.gems.length; i++) {
            const g = this.gems[i];
            const x = Math.floor(g.x - this.camX);
            const y = Math.floor(g.y - this.camY);
            const tri = lcd.drawFilledTriangle as unknown as (
                x1: number,
                y1: number,
                x2: number,
                y2: number,
                x3: number,
                y3: number,
                flags?: number
            ) => void;
            tri(x, y - 5, x + 4, y, x, y + 5, this.gemC);
            tri(x, y - 5, x - 4, y, x, y + 5, this.gemC);
        }
    }

    private drawEnemies() {
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            const kind = e.kind % 4;
            const ex = e.x - this.camX;
            const ey = e.y - this.camY;
            const img = this.eImgs[kind][this.animFrame];
            if (img != null) {
                this.drawSprite(img, ex, ey);
                if (e.hit > 0) {
                    this.drawCircle(ex, ey, e.r * 0.5, lcd.RGB(255, 255, 255));
                }
            } else {
                const c = [lcd.RGB(190, 58, 58), lcd.RGB(228, 138, 42), lcd.RGB(74, 170, 94), lcd.RGB(160, 84, 226)][kind];
                this.drawCircle(ex, ey, e.r, e.hit > 0 ? lcd.RGB(255, 255, 255) : c);
            }
            // tiny hp ring for tanks
            if (e.kind == 2 && e.hp < e.maxHp) {
                const frac = Math.max(0, e.hp / e.maxHp);
                lcd.drawRectangle(
                    Math.floor(ex - e.r),
                    Math.floor(ey - e.r - 6),
                    Math.floor(e.r * 2 * frac),
                    2,
                    lcd.RGB(255, 90, 90)
                );
            }
        }
    }

    private drawBullets() {
        for (let i = 0; i < this.bullets.length; i++) {
            const b = this.bullets[i];
            if (this.bulletImg != null) {
                this.drawSprite(this.bulletImg, b.x - this.camX, b.y - this.camY);
            } else {
                this.drawCircle(b.x - this.camX, b.y - this.camY, 3, this.bulletC);
            }
        }
    }

    private drawPlayer() {
        // invincibility blink: skip drawing every other 0.2s slice
        const blink = this.inv > 0 && Math.floor(getTime() / 20) % 2 == 0;
        const px = this.px - this.camX;
        const py = this.py - this.camY;
        if (!blink) {
            const img = this.pwImgs[this.animFrame];
            if (img != null) {
                this.drawSprite(img, px, py);
            } else {
                this.drawCircle(px, py, 11, this.playerC);
            }
        }
        // facing notch
        const fx = px + Math.cos(this.face) * 10;
        const fy = py + Math.sin(this.face) * 10;
        lcd.drawLine(Math.floor(px), Math.floor(py), Math.floor(fx), Math.floor(fy), SOLID, lcd.RGB(255, 255, 255));
    }

    private drawSparks() {
        for (let i = 0; i < this.sparks.length; i++) {
            const s = this.sparks[i];
            this.drawCircle(s.x - this.camX, s.y - this.camY, 4 + Math.floor((0.2 - s.t) * 20), s.c);
        }
    }

    private drawHud() {
        lcd.drawText(6, 4, `LV ${this.level}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        const mm = Math.floor(this.time / 60);
        const ss = Math.floor(this.time) % 60;
        lcd.drawText(this.w / 2, 4, `${mm}:${ss < 10 ? '0' : ''}${ss}`, SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w - 6, 4, `KILL ${this.kills}`, SMLSIZE | RIGHT | COLOR_THEME_PRIMARY1);

        // exp bar (full width) at the very top
        const bw = this.w - 12;
        const bx = 6;
        lcd.drawFilledRectangle(bx, 16, bw, 3, this.bg2);
        lcd.drawFilledRectangle(bx, 16, Math.floor(bw * Math.min(1, this.exp / this.expNext)), 3, this.gemC);

        // short hp bar below it, top-left
        const hbw = Math.floor(this.w * 0.4);
        lcd.drawFilledRectangle(bx, 22, hbw, 8, this.bg2);
        const hpFrac = this.hp / this.maxHp;
        const hpCol = hpFrac > 0.4 ? lcd.RGB(70, 200, 90) : lcd.RGB(230, 60, 60);
        lcd.drawFilledRectangle(bx, 22, Math.floor(hbw * hpFrac), 8, hpCol);
        lcd.drawText(bx + hbw + 4, 22, `${Math.ceil(this.hp)}`, SMLSIZE | lcd.RGB(255, 255, 255));

        if (this.upgFlash > 0) {
            lcd.drawFilledRectangle(this.w / 2 - 55, 34, 110, 18, lcd.RGB(30, 22, 44));
            lcd.drawText(this.w / 2, 38, `+ ${this.upgradeFlash}`, SMLSIZE | CENTER | lcd.RGB(255, 226, 118));
        }
    }

    private drawLevelUp() {
        lcd.drawFilledRectangle(0, 0, this.w, this.h, lcd.RGB(0, 0, 0), 0x08);
        lcd.drawText(this.w / 2, 34, `LEVEL UP!`, DBLSIZE | CENTER | lcd.RGB(255, 226, 118));
        lcd.drawText(this.w / 2, 60, 'choose a power', SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);

        const cw = 96;
        const chh = 74;
        const gap = 12;
        const total = cw * 3 + gap * 2;
        const x0 = (this.w - total) / 2;
        const y0 = 96;
        for (let i = 0; i < this.upgChoices.length; i++) {
            const x = x0 + i * (cw + gap);
            const sel = i == this.upgSel;
            lcd.drawFilledRectangle(x, y0, cw, chh, sel ? lcd.RGB(70, 54, 96) : lcd.RGB(40, 32, 54));
            lcd.drawRectangle(x, y0, cw, chh, sel ? lcd.RGB(255, 226, 118) : lcd.RGB(90, 78, 120), 2);
            const u = this.upgChoices[i];
            lcd.drawText(x + cw / 2, y0 + 8, u.name, SMLSIZE | CENTER | lcd.RGB(255, 255, 255));
            lcd.drawText(x + cw / 2, y0 + 30, u.icon, DBLSIZE | CENTER | this.gemC);
        }
        lcd.drawText(this.w / 2, y0 + chh + 12, 'up/down: move   ENTER: pick', SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
    }

    private drawOverlay(title: string, sub: string) {
        lcd.drawFilledRectangle(18, 18, this.w - 36, this.h - 36, COLOR_THEME_SECONDARY1, 1);
        lcd.drawRectangle(18, 18, this.w - 36, this.h - 36, COLOR_THEME_PRIMARY1, 2);
        lcd.drawText(this.w / 2, this.h / 2 - 30, title, COLOR_THEME_PRIMARY1 | CENTER | VCENTER | DBLSIZE);
        lcd.drawText(this.w / 2, this.h / 2 + 20, sub, SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
    }

    private draw() {
        this.drawBackground();
        this.drawGems();
        this.drawEnemies();
        this.drawBullets();
        this.drawPlayer();
        this.drawSparks();
        this.drawHud();

        if (this.state == this.phase.initial) {
            this.drawOverlay('VAMPIRE', 'stick: move\nweapon fires on its own\n\nENTER / touch: start');
        } else if (this.state == this.phase.levelup) {
            this.drawLevelUp();
        } else if (this.state == this.phase.gameOver) {
            const mm = Math.floor(this.time / 60);
            const ss = Math.floor(this.time) % 60;
            this.drawOverlay('GAME OVER', `time ${mm}:${ss < 10 ? '0' : ''}${ss}   level ${this.level}   kills ${this.kills}\n\nENTER / touch: retry`);
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
            this.update(dt);
        }
        if ((this.state == this.phase.playing || this.state == this.phase.initial) && now >= this.bgmNext) {
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
