declare function getLastPos(): LuaMultiReturn<[unknown, unknown]>;

interface Shot {
    x: number;
    y: number;
    vx: number;
    vy: number;
}

interface Comet {
    px: number[];
    py: number[];
    size: number;
    x: number;
    y: number;
    rot: number;
    vr: number;
    vx: number;
    vy: number;
    rad: number[]; // per-vertex radius factor -> irregular rocky shape
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    killTime: number;
}

interface Player {
    x: number;
    y: number;
    accel: number;
    maxSpeed: number;
    lastThrust: number;
    fuel: number;
    energy: number;
    rot: number;
    vx: number;
    vy: number;
    size: number;
    level: number;
    score: number;
    kills: number;
    invisible: number;
    lastEnergy: number;
    killTime: number;
    x1: number; y1: number; x2: number; y2: number;
    x3: number; y3: number; x4: number; y4: number;
}

// A faithful TypeScript port of the xS "Game-Asteroids" (X-Lite) game:
// ail rotates, thr (throttle) thrusts with fuel, the weapon auto-fires, and
// the stats screen continues with ele up. All sounds come from the xS WAVs.
class Game {
    private w: number;
    private h: number;

    private now = 0;
    private frame = 1;
    private oldTime = 0;
    private deltaTime = 1;

    private SPLASH = 0;
    private GAME = 1;
    private STATS = 2;
    private state = this.SPLASH;
    private splashStart = 0;
    private level = 0;

    private shots: Shot[] = [];
    private shotInterval = 65; // centiseconds
    private lastShot = 0;
    private shotSpeed = 0.9;

    private comets: Comet[] = [];
    private cometSize = 24; // 2x the original xS size
    private minCometSize = 6;
    private cometDots = 7; // more vertices for a rocky look
    private cometSpeed = 0.1;

    private particles: Particle[] = [];

    private player: Player = {
        x: 0, y: 0, accel: 0.005, maxSpeed: 0.65, lastThrust: 0,
        fuel: 100, energy: 100, rot: 0, vx: 0, vy: 0, size: 8,
        level: 0, score: 0, kills: 0, invisible: 0, lastEnergy: 0, killTime: 0,
        x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0, x4: 0, y4: 0,
    };

    private soundEnabled = true;
    private white = lcd.RGB(255, 255, 255);
    private grey = lcd.RGB(120, 120, 120);

    constructor(w: number, h: number) {
        this.w = w;
        this.h = h;
        this.player.x = Math.floor(w / 2);
        this.player.y = Math.floor(h / 2);
        this.oldTime = getTime();
        this.playSnd('splash.wav', 700, 60);
    }

    // ---------- audio ----------
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

    private playSnd(file: string, freq: number, duration: number) {
        this.playSound('asteroids', file);
    }

    // ---------- helpers ----------
    private newExplosion(x: number, y: number, size: number, steps: number = 20) {
        for (let i = 0; i < 360; i += steps) {
            this.particles.push({
                x: x + Math.floor(Math.random() * size * 2 - size),
                y: y + Math.floor(Math.random() * size * 2 - size),
                vx: Math.cos((i * Math.PI) / 180) * (Math.random() * 1 + 1) / 5,
                vy: Math.sin((i * Math.PI) / 180) * (Math.random() * 1 + 1) / 5,
                killTime: this.now + 150,
            });
        }
        if (this.particles.length > 140) {
            this.particles.splice(0, this.particles.length - 140);
        }
    }

    private newThrust() {
        for (let i = 0; i < 2; i++) {
            const r = this.player.rot + 180 + Math.floor(Math.random() * 11 - 5);
            this.particles.push({
                x: this.player.x,
                y: this.player.y,
                vx: Math.cos((r * Math.PI) / 180) * (Math.random() * 1 + 1) / 5,
                vy: Math.sin((r * Math.PI) / 180) * (Math.random() * 1 + 1) / 5,
                killTime: this.now + 50,
            });
        }
        if (this.particles.length > 140) {
            this.particles.splice(0, this.particles.length - 140);
        }
    }

    private updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * this.deltaTime;
            p.y += p.vy * this.deltaTime;
            if (p.x < 1 || p.x > this.w - 1 || p.y < 1 || p.y > this.h - 1 || p.killTime <= this.now) {
                this.particles.splice(i, 1);
            }
        }
    }

    private updatePlayer() {
        const P = this.player;
        if (P.energy <= 0) {
            return;
        }
        // invisibility
        if (P.invisible > 0 && P.invisible + 200 <= this.now) {
            P.invisible = 0;
        }
        // rotate with ail
        P.rot = P.rot + (getValue('ail') / 400) * this.deltaTime;
        // ship vertices (nose at rot, others at +120/+180/+240)
        P.x1 = P.x + Math.cos(((0 + P.rot) * Math.PI) / 180) * P.size;
        P.y1 = P.y + Math.sin(((0 + P.rot) * Math.PI) / 180) * P.size;
        P.x2 = P.x + Math.cos(((120 + P.rot) * Math.PI) / 180) * P.size;
        P.y2 = P.y + Math.sin(((120 + P.rot) * Math.PI) / 180) * P.size;
        P.x3 = P.x + Math.cos(((180 + P.rot) * Math.PI) / 180) * P.size * 0.2;
        P.y3 = P.y + Math.sin(((180 + P.rot) * Math.PI) / 180) * P.size * 0.2;
        P.x4 = P.x + Math.cos(((240 + P.rot) * Math.PI) / 180) * P.size;
        P.y4 = P.y + Math.sin(((240 + P.rot) * Math.PI) / 180) * P.size;
        // thrust with the throttle channel
        const thr = (getValue('thr') + 1024) / 2048;
        const accel = P.accel * thr;
        if (accel > 0 && P.fuel > 0) {
            this.newThrust();
            if (P.lastThrust + 50 <= this.now) {
                P.lastThrust = this.now;
                P.fuel = P.fuel - thr * 3;
                if (P.fuel <= 0) {
                    P.fuel = 0;
                    this.playSnd('empty.wav', 300, 60);
                } else {
                    this.playSnd('thrust.wav', 160, 90);
                }
            }
            P.vx = P.vx + Math.cos((P.rot * Math.PI) / 180) * accel * this.deltaTime;
            P.vy = P.vy + Math.sin((P.rot * Math.PI) / 180) * accel * this.deltaTime;
        }
        // max speed
        const totalvel = Math.sqrt(P.vx * P.vx + P.vy * P.vy);
        if (totalvel >= P.maxSpeed) {
            P.vx = P.vx * P.maxSpeed / totalvel;
            P.vy = P.vy * P.maxSpeed / totalvel;
        }
        // move + wrap
        P.x = P.x + P.vx * this.deltaTime;
        P.y = P.y + P.vy * this.deltaTime;
        if (P.x < 0) {
            P.x = this.w;
        } else if (P.x > this.w) {
            P.x = 0;
        }
        if (P.y < 0) {
            P.y = this.h;
        } else if (P.y > this.h) {
            P.y = 0;
        }
    }

    private updateShots() {
        const P = this.player;
        // auto-fire
        if (P.energy > 0 && this.lastShot + this.shotInterval <= this.now) {
            this.lastShot = this.now;
            this.playSnd('shot.wav', 1400, 20);
            this.shots.push({
                x: P.x1,
                y: P.y1,
                vx: Math.cos((P.rot * Math.PI) / 180) * this.shotSpeed,
                vy: Math.sin((P.rot * Math.PI) / 180) * this.shotSpeed,
            });
        }
        // move shots
        for (let i = this.shots.length - 1; i >= 0; i--) {
            const s = this.shots[i];
            s.x += s.vx * this.deltaTime;
            s.y += s.vy * this.deltaTime;
            if (s.x < 2 || s.x > this.w - 2 || s.y < 2 || s.y > this.h - 2) {
                this.shots.splice(i, 1);
            }
        }
    }

    private newComet(x?: number, y?: number, vx?: number, vy?: number, size?: number) {
        const rot = Math.floor(Math.random() * 360) + 1;
        const rad: number[] = [];
        for (let i = 0; i < this.cometDots; i++) {
            rad.push(0.72 + Math.random() * 0.56); // 0.72 .. 1.28 irregularity
        }
        const c: Comet = {
            px: [],
            py: [],
            rad: rad,
            size: size != null ? size : this.cometSize,
            x: x != null ? x : this.cometSize,
            y: y != null ? y : Math.floor(Math.random() * (this.h - this.cometSize * 2)) + this.cometSize,
            rot: rot,
            vr: Math.random() * 2 / 5,
            vx: vx != null ? vx : Math.cos((rot * Math.PI) / 180) * this.cometSpeed,
            vy: vy != null ? vy : Math.sin((rot * Math.PI) / 180) * this.cometSpeed,
        };
        this.comets.push(c);
    }

    private updateComets() {
        const P = this.player;
        for (let i = this.comets.length - 1; i >= 0; i--) {
            const C = this.comets[i];
            C.x += C.vx * this.deltaTime;
            C.y += C.vy * this.deltaTime;
            C.rot += C.vr * this.deltaTime;
            if (C.x < 0) {
                C.x = this.w;
            } else if (C.x > this.w) {
                C.x = 0;
            }
            if (C.y < 0) {
                C.y = this.h;
            } else if (C.y > this.h) {
                C.y = 0;
            }
            // hit by a shot?
            let hit = false;
            for (let j = this.shots.length - 1; j >= 0; j--) {
                const s = this.shots[j];
                if (s != null && this.pointInsideCircle(s.x, s.y, C.x, C.y, C.size)) {
                    this.playSnd('explos.wav', 90, 80);
                    this.shots.splice(j, 1);
                    this.comets.splice(i, 1);
                    P.score += 20;
                    this.newExplosion(C.x, C.y, C.size);
                    if (C.size > this.minCometSize) {
                        this.newComet(C.x + C.vx, C.y + C.vy, C.vx, C.vy, C.size / 2);
                        this.newComet(C.x - C.vx, C.y - C.vy, -C.vx, -C.vy, C.size / 2);
                    } else {
                        P.kills++;
                    }
                    hit = true;
                    break;
                }
            }
            if (hit) {
                continue;
            }
            // hits the player?
            if (
                this.comets[i] != null &&
                P.energy > 0 &&
                P.invisible == 0 &&
                this.circlesIntersect(P.x, P.y, P.size, C.x, C.y, C.size)
            ) {
                P.energy -= 20;
                P.lastEnergy = this.now;
                if (P.energy <= 0) {
                    this.playSnd('gover.wav', 262, 200);
                    P.energy = 0;
                    P.killTime = this.now;
                    this.newExplosion(P.x, P.y, P.size, 5);
                } else {
                    this.playSnd('damage.wav', 200, 100);
                    P.invisible = this.now;
                    let vx = P.vx;
                    let vy = P.vy;
                    if (vx == 0 && vy == 0) {
                        vx = -C.vx;
                        vy = -C.vy;
                    }
                    P.vx = C.vx * 1.3;
                    P.vy = C.vy * 1.3;
                    C.vx = vx * 1.3;
                    C.vy = vy * 1.3;
                    this.newExplosion(P.x, P.y, P.size);
                }
            }
        }
    }

    private pointInsideCircle(x: number, y: number, a: number, b: number, r: number): boolean {
        return (x - a) * (x - a) + (y - b) * (y - b) < r * r;
    }

    private circlesIntersect(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number): boolean {
        const distSq = (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
        const radSumSq = (r1 + r2) * (r1 + r2);
        return distSq <= radSumSq;
    }

    private newLevel() {
        const P = this.player;
        this.comets = [];
        this.shots = [];
        this.particles = [];
        P.x = Math.floor(this.w / 2);
        P.y = Math.floor(this.h / 2);
        P.invisible = this.now;
        P.lastThrust = this.now;
        P.fuel = 100;
        P.energy = P.energy + 40;
        if (P.energy > 100) {
            P.energy = 100;
        }
        P.rot = -90;
        P.vx = 0;
        P.vy = 0;
        P.level++;
        this.newComet(0);
        this.newComet(this.w);
        if (P.level > 2) {
            this.newComet(0);
        }
        if (P.level > 4) {
            this.newComet(this.w);
        }
        this.playSnd('ready.wav', 523, 40);
        this.state = this.GAME;
    }

    private update() {
        this.updatePlayer();
        this.updateShots();
        this.updateComets();
        this.updateParticles();
        if (this.comets.length < 1 && this.player.energy > 0) {
            this.newLevel();
        }
    }

    // ---------- draw ----------
    private draw() {
        const P = this.player;
        lcd.clear(lcd.RGB(0, 0, 0));

        // ship
        if (P.energy > 0) {
            if (P.invisible == 0 || this.frame % 2 == 0) {
                lcd.drawLine(P.x1, P.y1, P.x2, P.y2, SOLID, this.white);
                lcd.drawLine(P.x2, P.y2, P.x3, P.y3, SOLID, this.white);
                lcd.drawLine(P.x3, P.y3, P.x4, P.y4, SOLID, this.white);
                lcd.drawLine(P.x4, P.y4, P.x1, P.y1, SOLID, this.white);
            }
        }

        // comets (irregular rotating polygons)
        const step = Math.floor(360 / this.cometDots);
        for (let i = 0; i < this.comets.length; i++) {
            const C = this.comets[i];
            let n = 0;
            for (let j = 1; j <= 360; j += step) {
                const f = C.rad[n % C.rad.length];
                C.px[n] = C.x + Math.cos(((C.rot + j) * Math.PI) / 180) * C.size * f;
                C.py[n] = C.y + Math.sin(((C.rot + j) * Math.PI) / 180) * C.size * f;
                n++;
            }
            for (let j = 0; j < C.px.length - 1; j++) {
                lcd.drawLine(C.px[j], C.py[j], C.px[j + 1], C.py[j + 1], SOLID, this.white);
            }
            if (C.px.length > 1) {
                lcd.drawLine(C.px[C.px.length - 1], C.py[C.px.length - 1], C.px[0], C.py[0], SOLID, this.white);
            }
        }

        // shots
        for (let i = 0; i < this.shots.length; i++) {
            const s = this.shots[i];
            if (s != null) {
                lcd.drawFilledRectangle(s.x - 1, s.y - 1, 3, 3, this.white);
            }
        }

        // particles
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            if (p != null) {
                lcd.drawPoint(p.x, p.y, this.white);
            }
        }

        // fuel bar (left)
        lcd.drawRectangle(1, 1, 3, this.h - 2, this.white);
        if (P.fuel > 0) {
            lcd.drawLine(2, this.h - 2 - ((this.h - 4) / 100) * P.fuel, 2, this.h - 3, SOLID, this.white);
        }
        lcd.drawText(5, 1, 'F', SMLSIZE | this.white);

        // energy bar (right)
        if (P.lastEnergy < this.now - 150 || this.frame % 2 == 0) {
            lcd.drawRectangle(this.w - 4, 1, 3, this.h - 2, this.white);
            if (P.energy > 0) {
                lcd.drawLine(this.w - 3, this.h - 2 - ((this.h - 4) / 100) * P.energy, this.w - 3, this.h - 3, SOLID, this.white);
            }
        }
        lcd.drawText(this.w - 9, 1, 'E', SMLSIZE | this.white);

        // score / level / kills
        lcd.drawText(10, 1, `S:${P.score}`, SMLSIZE | this.grey);
        lcd.drawText(60, 1, `L:${P.level}`, SMLSIZE | this.grey);
        lcd.drawText(100, 1, `K:${P.kills}`, SMLSIZE | this.grey);

        // game over banner
        if (P.energy <= 0) {
            lcd.drawText(26, this.h / 2 - 7, 'GAME OVER', MIDSIZE | this.white);
            if (P.killTime < this.now - 500) {
                this.playSnd('stats.wav', 440, 60);
                this.state = this.STATS;
            }
        }
    }

    private drawStats() {
        const P = this.player;
        lcd.clear(lcd.RGB(0, 0, 0));
        lcd.drawText(7, 2, '    GAME OVER    ', MIDSIZE + INVERS + this.white);
        lcd.drawText(28, 20, 'SCORE:', SMLSIZE | this.white);
        lcd.drawText(28, 30, 'STAGE:', SMLSIZE | this.white);
        lcd.drawText(28, 40, 'KILLS:', SMLSIZE | this.white);
        lcd.drawText(70, 20, `${P.score}`, SMLSIZE | this.white);
        lcd.drawText(70, 30, `${P.level}`, SMLSIZE | this.white);
        lcd.drawText(70, 40, `${P.kills}`, SMLSIZE | this.white);
        lcd.drawText(6, this.h - 9, '   -STICK UP TO CONTINUE-   ', SMLSIZE | this.white);
        lcd.drawRectangle(5, 1, this.w - 10, this.h - 2, this.white);
        if (getValue('ele') > 500) {
            this.playSnd('splash.wav', 550, 60);
            P.level = 0;
            P.score = 0;
            P.kills = 0;
            this.splashStart = this.now;
            this.state = this.SPLASH;
        }
    }

    private drawSplash() {
        lcd.clear(lcd.RGB(0, 0, 0));
        lcd.drawText(this.w / 2, this.h / 2 - 20, 'ASTEROIDS', DBLSIZE | CENTER | this.white);
        lcd.drawText(this.w / 2, this.h / 2 + 10, 'ail: turn   thr: thrust', SMLSIZE | CENTER | this.grey);
        lcd.drawText(this.w / 2, this.h / 2 + 26, 'weapon fires automatically', SMLSIZE | CENTER | this.grey);
        if (this.now > this.splashStart + 300) {
            this.newLevel();
        }
    }

    public run(event: number, touchState: any): number {
        if (event == EVT_EXIT_BREAK) {
            return 2;
        }
        this.frame++;
        this.now = getTime();
        this.deltaTime = this.now - this.oldTime;
        if (this.deltaTime <= 0 || this.deltaTime > 60) {
            this.deltaTime = 1;
        }

        if (this.state == this.SPLASH) {
            this.drawSplash();
        } else if (this.state == this.GAME) {
            this.update();
            this.draw();
        } else {
            this.drawStats();
        }

        this.oldTime = this.now;
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
