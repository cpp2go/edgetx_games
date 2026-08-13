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

interface Obstacle {
    x: number;
    y: number;
    r: number; // collision radius
    t: number; // sprite index 0..5
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
    private obstacles: Obstacle[] = [];

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

    // boss events (Survivor.io style: walls close in around the player)
    private bossActive = false;
    private nextBoss = 150;
    private bossFlash = 0;

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

    // sprites (pre-scaled, drawn at 100%)
    private pwImgs: (Bitmap | null)[] = [];
    private eImgs: (Bitmap | null)[][] = [];
    private uImgs: (Bitmap | null)[] = [];
    private oImgs: (Bitmap | null)[] = [];
    private bulletImg: Bitmap | null = null;
    private animTimer = 0;
    private animFrame = 0;

    // palette (original)
    private bg1 = lcd.RGB(22, 15, 32);
    private bg2 = lcd.RGB(40, 32, 54);
    private gridC = lcd.RGB(54, 44, 68);
    private bulletC = lcd.RGB(255, 226, 118);
    private gemC = lcd.RGB(96, 224, 255);
    private playerC = lcd.RGB(245, 240, 255);

    constructor(w: number, h: number) {
        this.w = w;
        this.h = h;
        // effectively infinite open map (no reachable boundary)
        this.worldW = 200000;
        this.worldH = 200000;
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

    private buildArena(cx: number, cy: number) {
        // boss event: a solid ring of walls closes in around the player
        this.obstacles = [];
        const n = 16;
        const R = 140;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const x = Math.max(70, Math.min(this.worldW - 70, cx + Math.cos(a) * R));
            const y = Math.max(70, Math.min(this.worldH - 70, cy + Math.sin(a) * R));
            this.obstacles.push({ x, y, r: 27, t: 5 });
        }
    }

    private startBoss() {
        // Survivor.io style: walls close in, boss drops inside the arena
        this.bossActive = true;
        this.buildArena(this.px, this.py);
        const ang = this.randRange(0, Math.PI * 2);
        const bx = Math.max(40, Math.min(this.worldW - 40, this.px + Math.cos(ang) * 70));
        const by = Math.max(40, Math.min(this.worldH - 40, this.py + Math.sin(ang) * 70));
        const boss: Enemy = { x: bx, y: by, hp: 200, maxHp: 200, speed: 18, r: 24, kind: 11, hit: 0, exp: 25 };
        boss.hp = Math.floor(boss.hp * this.scale);
        boss.maxHp = boss.hp;
        this.enemies.push(boss);
        this.bossFlash = 3.0;
        this.playSfx(320, 260, 180);
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
        // play ONLY the first path that actually exists. Playing both candidate
        // paths (when both files are on the SD) plays every sound twice and
        // makes firing and audio sound out of sync.
        for (let i = 0; i < tries.length; i++) {
            let exists = false;
            try {
                exists = (fstat as unknown as (p: string) => any)(tries[i]) != null;
            } catch (e) {
                exists = false;
            }
            if (exists) {
                (playFile as unknown as (p: string) => void)(tries[i]);
                return;
            }
        }
        // fallback: try the first candidate anyway
        (playFile as unknown as (p: string) => void)(tries[0]);
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

    private stopAudio() {
        // EdgeTX: stops all currently playing audio (used on exit / game over so
        // the BGM doesn't keep playing after leaving the widget)
        (flushAudio as unknown as () => void)();
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
        for (let k = 0; k < 16; k++) {
            this.eImgs[k] = [];
            for (let f = 0; f < 4; f++) {
                this.eImgs[k][f] = this.loadImage(`vamp-e${k}-${f}.png`);
            }
        }
        this.bulletImg = this.loadImage('vamp-bullet.png');
        for (let u = 0; u < 9; u++) {
            this.uImgs[u] = this.loadImage(`vamp-u${u}.png`);
        }
        this.oImgs[5] = this.loadImage('vamp-o5.png'); // boss-arena wall
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
        this.bossActive = false;
        this.nextBoss = 150;
        this.bossFlash = 0;
        this.obstacles = [];
        this.killSndCd = 0;
        this.gemSndCd = 0;
        this.state = this.phase.playing;
        this.playSfxFile('start.wav', 660, 120);
    }

    private spawnEnemy() {
        // spawn just outside the camera view, in a random direction around the player
        const R = Math.max(this.w, this.h) * 0.8;
        const ang = this.randRange(0, Math.PI * 2);
        let x = this.px + Math.cos(ang) * R;
        let y = this.py + Math.sin(ang) * R;
        x = Math.max(30, Math.min(this.worldW - 30, x));
        y = Math.max(30, Math.min(this.worldH - 30, y));
        // 16 enemy kinds from danke, one per "关", unlocking over time
        let maxKind = 0;
        const unlock = [0, 25, 50, 80, 110, 145, 180, 220, 265, 320, 380, 450, 520, 600, 690, 790];
        for (let k = 0; k < unlock.length; k++) {
            if (this.time > unlock[k]) {
                maxKind = k;
            }
        }
        let kind = Math.floor(this.randRange(0, maxKind + 1));
        if (kind == 11) {
            kind = 10; // kind 11 is the boss, spawned by boss events only
        }
        const base: Enemy = { x, y, hp: 10, maxHp: 10, speed: 40, r: 12, kind, hit: 0, exp: 1 };
        // kind: hp, speed, r, exp  (sprite size grows with kind)
        const stat: [number, number, number, number][] = [
            [10, 42, 14, 1],   // 0  僵尸 Zombie
            [7, 78, 16, 2],    // 1  小熊 Xiaoxiong
            [6, 90, 16, 2],    // 2  尖翅飞虫 Jiancifeichong
            [14, 55, 16, 3],   // 3  保安 Baoan
            [38, 24, 17, 5],   // 4  炮弹 Baolei (tank)
            [22, 40, 17, 4],   // 5  脉冲塔 Maichongta
            [30, 60, 19, 6],   // 6  单行机器人 Danxingjiqiren
            [55, 22, 19, 8],   // 7  导弹塔 Daodanta
            [26, 95, 19, 7],   // 8  晶石虫 Jingshichong
            [70, 35, 19, 10],  // 9  沙人 Sharen
            [90, 26, 21, 12],  // 10 迫击炮 Morenpao03 (elite mortar)
            [200, 18, 24, 25], // 11 飞碟 Boss FeiDieBoss
            [140, 30, 21, 16], // 12 红色炮弹 Super Baolei
            [120, 68, 21, 18], // 13 金色机器人 Super Robot
            [180, 26, 21, 20], // 14 红色导弹塔 Super Daodanta
            [150, 44, 21, 22], // 15 金色沙人 Super Sharen
        ];
        const s = stat[Math.min(kind, stat.length - 1)];
        base.hp = s[0]; base.maxHp = s[0]; base.speed = s[1]; base.r = s[2]; base.exp = s[3];
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
            // short punchy shot: distinct per-shot (no continuous drone), and
            // short enough to play every shot without piling up the queue
            this.playSfxFile('shoot.wav', 1600, 8);
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

        // boss event: walls close in when the timer hits
        if (this.bossFlash > 0) {
            this.bossFlash -= dt;
        }
        if (!this.bossActive && this.time >= this.nextBoss) {
            this.startBoss();
        }

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
        // clamp to the big world (no visible walls, open grass field)
        this.px = Math.max(12, Math.min(this.worldW - 12, this.px));
        this.py = Math.max(12, Math.min(this.worldH - 12, this.py));
        // collide with solid obstacles (push out, like danke walls)
        for (let i = 0; i < this.obstacles.length; i++) {
            const o = this.obstacles[i];
            const dx = this.px - o.x;
            const dy = this.py - o.y;
            const rr = o.r + 11;
            const d2 = dx * dx + dy * dy;
            if (d2 < rr * rr) {
                const d = Math.sqrt(d2) || 1;
                this.px = o.x + (dx / d) * rr;
                this.py = o.y + (dy / d) * rr;
            }
        }
        // camera locked to the player (no lag, no jitter — the whole world moves together)
        this.camX = this.px - this.w / 2;
        this.camY = this.py - this.h / 2;
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
            if (b.life <= 0 || b.x < this.camX - 40 || b.x > this.camX + this.w + 40 || b.y < this.camY - 40 || b.y > this.camY + this.h + 40 || b.x < 0 || b.x > this.worldW || b.y < 0 || b.y > this.worldH) {
                this.bullets.splice(i, 1);
                continue;
            }
            // blocked by solid obstacles (walls stop bullets)
            let blocked = false;
            for (let k = 0; k < this.obstacles.length; k++) {
                const o = this.obstacles[k];
                const dx = b.x - o.x;
                const dy = b.y - o.y;
                const rr = o.r + 2;
                if (dx * dx + dy * dy < rr * rr) {
                    this.sparks.push({ x: b.x, y: b.y, t: 0.1, c: this.bulletC });
                    blocked = true;
                    break;
                }
            }
            if (blocked) {
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
                    // food.wav is ~0.52s: throttle so the queue doesn't pile up
                    this.gemSndCd = 0.6;
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
            // short kill sound: a long die.wav (2.17s) blocks the audio queue
            // and delays the per-shot sound, desyncing fire from sound
            this.killSndCd = 0.5;
            this.playSfxFile('kill.wav', 500 + e.kind * 120, 16);
        }
        // killing the boss opens the arena walls and schedules the next one
        if (e.kind == 11 && this.bossActive) {
            this.bossActive = false;
            this.obstacles = [];
            this.nextBoss = this.time + 150;
            this.bossFlash = 2.0;
            this.playSfx(600, 220, 120);
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
        this.stopAudio();
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
        // leaving the game / widget: stop all audio so the BGM doesn't linger
        if (event == EVT_EXIT_BREAK || event == EVT_VIRTUAL_EXIT) {
            this.stopAudio();
            return;
        }
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

    private drawObstacles() {
        const fc = lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void;
        const colors = [
            lcd.RGB(150, 110, 60), lcd.RGB(62, 110, 52), lcd.RGB(70, 120, 60),
            lcd.RGB(180, 160, 90), lcd.RGB(120, 130, 150), lcd.RGB(130, 130, 140),
        ];
        for (let i = 0; i < this.obstacles.length; i++) {
            const o = this.obstacles[i];
            const ox = Math.floor(o.x - this.camX);
            const oy = Math.floor(o.y - this.camY);
            if (ox < -50 || ox > this.w + 50 || oy < -50 || oy > this.h + 50) {
                continue;
            }
            const img = this.oImgs[o.t];
            if (img != null) {
                this.drawSprite(img, ox, oy);
            } else {
                fc(ox, oy, o.r, colors[o.t]);
            }
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
            const kind = e.kind % 16;
            const ex = e.x - this.camX;
            const ey = e.y - this.camY;
            const img = this.eImgs[kind][this.animFrame];
            if (img != null) {
                this.drawSprite(img, ex, ey);
                if (e.hit > 0) {
                    this.drawCircle(ex, ey, e.r * 0.5, lcd.RGB(255, 90, 90));
                }
            } else {
                const c = [
                    lcd.RGB(150, 150, 150), lcd.RGB(190, 120, 60), lcd.RGB(140, 200, 90),
                    lcd.RGB(90, 150, 220), lcd.RGB(60, 200, 160), lcd.RGB(230, 170, 40),
                    lcd.RGB(200, 80, 220), lcd.RGB(60, 120, 220), lcd.RGB(120, 220, 120),
                    lcd.RGB(240, 80, 80), lcd.RGB(160, 120, 80), lcd.RGB(120, 120, 130),
                    lcd.RGB(255, 80, 80), lcd.RGB(255, 210, 60), lcd.RGB(255, 80, 80),
                    lcd.RGB(255, 210, 60),
                ][kind];
                this.drawCircle(ex, ey, e.r, e.hit > 0 ? lcd.RGB(255, 90, 90) : c);
            }
            // tiny hp ring for big enemies
            if (e.r >= 17 && e.hp < e.maxHp) {
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
        if (this.bossFlash > 0 && Math.floor(this.bossFlash * 4) % 2 == 0) {
            lcd.drawText(this.w / 2, this.h / 2 - 34, 'BOSS!', DBLSIZE | CENTER | lcd.RGB(220, 60, 60));
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
            const uimg = this.uImgs[u.id];
            if (uimg != null) {
                this.drawSprite(uimg, x + cw / 2, y0 + 50);
            } else {
                lcd.drawText(x + cw / 2, y0 + 30, u.icon, DBLSIZE | CENTER | this.gemC);
            }
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
        this.drawObstacles();
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
