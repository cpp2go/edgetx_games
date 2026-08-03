interface Car {
    lane: number;
    z: number;
    kind: number;
}

class Game {
    private lanes = [-1, 0, 1];
    private playerLane = 0;
    private cars: Car[] = [];

    private phase = { initial: 0, playing: 1, paused: 2, gameOver: 3 };
    private state = this.phase.initial;

    private score = 0;
    private best = 0;
    private level = 1;

    private speed = 0.012;
    private baseSpeed = 0.012;
    private maxSpeed = 0.03;
    private nitro = 100;
    private nitroActiveUntil = 0;

    private horizon = 0;
    private roadBottom = 0;
    private centerX = 0;
    private roadCurve = 0;

    private lastTick = 0;
    private soundEnabled = true;

    constructor(private w: number, private h: number) {
        this.horizon = Math.floor(this.h * 0.26);
        this.roadBottom = this.h - 12;
        this.centerX = Math.floor(this.w / 2);
        this.lastTick = getTime();
    }

    private playSfx(freq: number, duration: number, pause: number = 0) {
        if (!this.soundEnabled) {
            return;
        }
        (playTone as unknown as (f: number, d: number, p: number) => void)(freq, duration, pause);
    }

    private rand(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    private newCar(z: number): Car {
        const lane = this.lanes[Math.floor(this.rand(0, this.lanes.length))];
        return {
            lane: lane,
            z: z,
            kind: Math.floor(this.rand(0, 3)),
        };
    }

    private restart() {
        this.playerLane = 0;
        this.score = 0;
        this.level = 1;
        this.baseSpeed = 0.012;
        this.speed = this.baseSpeed;
        this.nitro = 100;
        this.nitroActiveUntil = 0;
        this.roadCurve = 0;

        this.cars = [];
        for (let i = 0; i < 8; i++) {
            this.cars.push(this.newCar(i * 0.14 + this.rand(0, 0.1)));
        }

        this.state = this.phase.playing;
        this.lastTick = getTime();
        this.playSfx(860, 90, 0);
    }

    private activateNitro() {
        if (this.state != this.phase.playing || this.nitro < 15) {
            return;
        }
        this.nitro -= 15;
        this.nitroActiveUntil = getTime() + 45;
        this.playSfx(980, 70, 0);
    }

    private moveLane(delta: number) {
        if (this.state != this.phase.playing) {
            return;
        }
        const next = this.playerLane + delta;
        this.playerLane = Math.max(-1, Math.min(1, next));
        this.playSfx(700, 10, 0);
    }

    private onEvent(event: number) {
        if (event == EVT_SYS_BREAK) {
            this.restart();
            return;
        }

        if (event == EVT_MODEL_FIRST) {
            if (this.state == this.phase.playing) {
                this.state = this.phase.paused;
                this.playSfx(420, 60, 0);
            } else if (this.state == this.phase.paused) {
                this.state = this.phase.playing;
                this.playSfx(820, 40, 0);
            }
            return;
        }

        if (event == EVT_TELEM_FIRST) {
            this.activateNitro();
            return;
        }

        if (event == EVT_VIRTUAL_PREV) {
            this.moveLane(-1);
        } else if (event == EVT_VIRTUAL_NEXT) {
            this.moveLane(1);
        }
    }

    private laneToX(lane: number, z: number): number {
        const perspective = 0.18 + z * 0.82;
        const laneSpan = 14 + perspective * 56;
        return this.centerX + this.roadCurve * perspective + lane * laneSpan;
    }

    private zToY(z: number): number {
        return this.horizon + z * (this.roadBottom - this.horizon);
    }

    private updatePhysics() {
        const now = getTime();

        const nitroOn = now <= this.nitroActiveUntil;
        const boost = nitroOn ? 0.012 : 0;
        this.speed = Math.min(this.maxSpeed, this.baseSpeed + boost);

        if (this.state != this.phase.playing) {
            return;
        }

        // gentle road waving to emulate arcade track feel
        this.roadCurve = Math.sin(this.score / 110) * 16;

        for (let i = 0; i < this.cars.length; i++) {
            const c = this.cars[i];
            c.z += this.speed;

            if (c.z >= 1.03) {
                const nearSameLane = c.lane == this.playerLane;
                if (nearSameLane) {
                    this.state = this.phase.gameOver;
                    this.best = Math.max(this.best, this.score);
                    this.playSfx(170, 260, 0);
                    return;
                }
                c.z = 0;
                c.lane = this.lanes[Math.floor(this.rand(0, this.lanes.length))];
                c.kind = Math.floor(this.rand(0, 3));
                this.score += 8;
            }
        }

        this.score += nitroOn ? 2 : 1;

        if (nitroOn) {
            this.nitro = Math.max(0, this.nitro - 0.35);
        } else {
            this.nitro = Math.min(100, this.nitro + 0.08);
        }

        const lv = Math.floor(this.score / 240) + 1;
        if (lv > this.level) {
            this.level = lv;
            this.baseSpeed = Math.min(this.maxSpeed - 0.004, this.baseSpeed + 0.0013);
            this.playSfx(930, 65, 0);
        }
    }

    private drawRoad() {
        lcd.clear(COLOR_THEME_PRIMARY2);

        // sky
        lcd.drawFilledRectangle(0, 0, this.w, this.horizon, COLOR_THEME_SECONDARY1);

        // road body
        for (let y = this.horizon; y < this.roadBottom; y += 2) {
            const t = (y - this.horizon) / (this.roadBottom - this.horizon);
            const halfW = 20 + t * (this.w * 0.42);
            const cx = this.centerX + this.roadCurve * t;
            lcd.drawFilledRectangle(cx - halfW, y, halfW * 2, 2, COLOR_THEME_SECONDARY3);

            // center dashed line
            if ((Math.floor((y + this.score) / 12) % 2) == 0) {
                lcd.drawFilledRectangle(cx - 1, y, 2, 2, COLOR_THEME_WARNING);
            }
        }

        // lane guides
        for (let i = -1; i <= 1; i++) {
            const x0 = this.laneToX(i, 0);
            const x1 = this.laneToX(i, 1);
            lcd.drawLine(x0, this.horizon, x1, this.roadBottom, SOLID, COLOR_THEME_PRIMARY1);
        }
    }

    private drawTraffic() {
        for (let i = 0; i < this.cars.length; i++) {
            const c = this.cars[i];
            const y = this.zToY(c.z);
            const x = this.laneToX(c.lane, c.z);
            const size = Math.floor(4 + c.z * 18);
            const w = size;
            const h = Math.floor(size * 1.4);
            const color = c.kind == 0 ? COLOR_THEME_PRIMARY1 : (c.kind == 1 ? COLOR_THEME_WARNING : COLOR_THEME_SECONDARY2);
            lcd.drawFilledRectangle(x - Math.floor(w / 2), y - h, w, h, color);
            lcd.drawRectangle(x - Math.floor(w / 2), y - h, w, h, COLOR_THEME_PRIMARY2);
        }
    }

    private drawPlayer() {
        const x = this.laneToX(this.playerLane, 1);
        const y = this.roadBottom;
        const w = 18;
        const h = 22;

        lcd.drawFilledRectangle(x - Math.floor(w / 2), y - h, w, h, COLOR_THEME_SECONDARY2);
        lcd.drawRectangle(x - Math.floor(w / 2), y - h, w, h, COLOR_THEME_PRIMARY1);
        lcd.drawFilledRectangle(x - 4, y - 5, 8, 3, COLOR_THEME_WARNING);
    }

    private drawHud() {
        const nitroW = 86;
        lcd.drawText(4, 3, `S:${this.score}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(70, 3, `Lv:${this.level}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w - 4, 3, `Best:${this.best}`, SMLSIZE | RIGHT | COLOR_THEME_PRIMARY1);

        lcd.drawRectangle(4, this.h - 12, nitroW, 8, COLOR_THEME_PRIMARY1);
        lcd.drawFilledRectangle(5, this.h - 11, Math.floor((nitroW - 2) * this.nitro / 100), 6, COLOR_THEME_WARNING);
        lcd.drawText(94, this.h - 14, 'NITRO', SMLSIZE | COLOR_THEME_PRIMARY1);
    }

    private drawOverlay(msg: string) {
        lcd.drawFilledRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_SECONDARY1, 1);
        lcd.drawRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_PRIMARY1, 2);
        lcd.drawText(this.w / 2, this.h / 2, msg, COLOR_THEME_PRIMARY1 | CENTER | VCENTER | DBLSIZE);
    }

    public run(event: number, touchState: any): number {
        if (event != null) {
            this.onEvent(event);
        }

        const now = getTime();
        if (now > this.lastTick) {
            this.updatePhysics();
            this.lastTick = now;
        }

        this.drawRoad();
        this.drawTraffic();
        if (this.state != this.phase.initial) {
            this.drawPlayer();
        }
        this.drawHud();

        if (this.state == this.phase.initial) {
            this.drawOverlay('RACER\nPress SYS');
        } else if (this.state == this.phase.paused) {
            this.drawOverlay('PAUSED');
        } else if (this.state == this.phase.gameOver) {
            this.drawOverlay('CRASH!\nPress SYS');
        }

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
