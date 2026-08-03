class Blob {
    public x: number;
    public y: number;
    public mass: number;
    public vx: number;
    public vy: number;
    public color: number;

    constructor(x: number, y: number, mass: number, vx: number, vy: number, color: number) {
        this.x = x;
        this.y = y;
        this.mass = mass;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
    }

    public radius(): number {
        return Math.max(3, Math.floor(Math.sqrt(this.mass) * 1.8));
    }
}

class Game {
    private blobs: Blob[] = [];
    private foods: Blob[] = [];
    private player!: Blob;
    private score = 0;
    private best = 0;

    private state = { initial: 0, playing: 1, paused: 2, gameOver: 3 };
    private phase = this.state.initial;

    private arenaW = 180;
    private arenaH = 140;
    private ox = 0;
    private oy = 0;

    private tickCs = 3;
    private lastTick = 0;
    private soundEnabled = true;

    constructor(private w: number, private h: number) {
        this.ox = Math.floor((w - this.arenaW) / 2);
        this.oy = Math.floor((h - this.arenaH) / 2);
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

    private spawnFood() {
        const x = this.rand(10, this.arenaW - 10);
        const y = this.rand(10, this.arenaH - 10);
        const m = this.rand(2, 5);
        this.foods.push(new Blob(x, y, m, 0, 0, COLOR_THEME_WARNING));
    }

    private spawnEnemy(baseMass: number) {
        const x = this.rand(15, this.arenaW - 15);
        const y = this.rand(15, this.arenaH - 15);
        const mass = baseMass;
        const vx = this.rand(-0.6, 0.6);
        const vy = this.rand(-0.6, 0.6);
        const color = mass < this.player.mass ? COLOR_THEME_SECONDARY1 : COLOR_THEME_PRIMARY1;
        this.blobs.push(new Blob(x, y, mass, vx, vy, color));
    }

    private restart() {
        this.score = 0;
        this.blobs = [];
        this.foods = [];

        this.player = new Blob(this.arenaW / 2, this.arenaH / 2, 28, 0, 0, COLOR_THEME_SECONDARY2);

        for (let i = 0; i < 25; i++) {
            this.spawnFood();
        }

        for (let i = 0; i < 8; i++) {
            this.spawnEnemy(this.rand(10, 38));
        }

        this.phase = this.state.playing;
        this.lastTick = getTime();
        this.playSfx(880, 80, 0);
    }

    private clamp(v: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, v));
    }

    private dist(ax: number, ay: number, bx: number, by: number): number {
        const dx = ax - bx;
        const dy = ay - by;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private absorb(a: Blob, b: Blob): boolean {
        const d = this.dist(a.x, a.y, b.x, b.y);
        return d < Math.max(1, a.radius() - b.radius() * 0.4);
    }

    private updatePlayerMotion() {
        const stickX = getValue('ail') / 1024;
        const stickY = getValue('ele') / 1024;

        const speed = 1.9 - Math.min(1.2, this.player.mass / 120);
        this.player.vx = stickX * speed;
        this.player.vy = -stickY * speed;

        this.player.x += this.player.vx;
        this.player.y += this.player.vy;

        const r = this.player.radius();
        this.player.x = this.clamp(this.player.x, r, this.arenaW - r);
        this.player.y = this.clamp(this.player.y, r, this.arenaH - r);
    }

    private updateEnemies() {
        for (let i = 0; i < this.blobs.length; i++) {
            const e = this.blobs[i];
            e.x += e.vx;
            e.y += e.vy;

            const r = e.radius();
            if (e.x < r || e.x > this.arenaW - r) {
                e.vx *= -1;
            }
            if (e.y < r || e.y > this.arenaH - r) {
                e.vy *= -1;
            }

            e.x = this.clamp(e.x, r, this.arenaW - r);
            e.y = this.clamp(e.y, r, this.arenaH - r);

            if (Math.random() < 0.02) {
                e.vx += this.rand(-0.15, 0.15);
                e.vy += this.rand(-0.15, 0.15);
                e.vx = this.clamp(e.vx, -0.9, 0.9);
                e.vy = this.clamp(e.vy, -0.9, 0.9);
            }

            e.color = e.mass < this.player.mass ? COLOR_THEME_SECONDARY1 : COLOR_THEME_PRIMARY1;
        }
    }

    private handleFoodCollisions() {
        const remaining: Blob[] = [];
        for (let i = 0; i < this.foods.length; i++) {
            const f = this.foods[i];
            const d = this.dist(this.player.x, this.player.y, f.x, f.y);
            if (d <= this.player.radius()) {
                this.player.mass += f.mass * 0.5;
                this.score += 1;
                this.playSfx(600, 20, 0);
                this.spawnFood();
            } else {
                remaining.push(f);
            }
        }
        this.foods = remaining;
    }

    private handleBlobCollisions() {
        const survivors: Blob[] = [];
        for (let i = 0; i < this.blobs.length; i++) {
            const b = this.blobs[i];
            const d = this.dist(this.player.x, this.player.y, b.x, b.y);
            if (d > this.player.radius() + b.radius()) {
                survivors.push(b);
                continue;
            }

            if (this.player.mass > b.mass * 1.1 && this.absorb(this.player, b)) {
                this.player.mass += b.mass * 0.65;
                this.score += Math.floor(b.mass);
                this.playSfx(500, 70, 0);
                this.spawnEnemy(this.rand(10, Math.min(this.player.mass * 1.1, 52)));
            } else if (b.mass > this.player.mass * 1.05 && this.absorb(b, this.player)) {
                this.phase = this.state.gameOver;
                this.best = Math.max(this.best, this.score);
                this.playSfx(180, 260, 0);
                return;
            } else {
                survivors.push(b);
            }
        }
        this.blobs = survivors;
    }

    private balanceWorld() {
        if (this.foods.length < 20) {
            this.spawnFood();
        }
        if (this.blobs.length < 6) {
            this.spawnEnemy(this.rand(10, Math.min(this.player.mass * 1.2, 56)));
        }
    }

    private updateGame() {
        this.updatePlayerMotion();
        this.updateEnemies();
        this.handleFoodCollisions();
        this.handleBlobCollisions();
        if (this.phase == this.state.playing) {
            this.balanceWorld();
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
        }
    }

    private drawBlob(b: Blob) {
        const x = this.ox + b.x;
        const y = this.oy + b.y;
        lcd.drawFilledCircle(x, y, b.radius(), b.color);
    }

    private drawHud() {
        lcd.drawText(4, 4, `Score: ${this.score}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(4, 18, `Mass: ${Math.floor(this.player.mass)}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w - 4, 4, `Best: ${this.best}`, SMLSIZE | COLOR_THEME_PRIMARY1 | RIGHT);
    }

    private drawOverlay(msg: string) {
        lcd.drawFilledRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_SECONDARY1, 1);
        lcd.drawRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_PRIMARY1, 2);
        lcd.drawText(this.w / 2, this.h / 2, msg, COLOR_THEME_PRIMARY1 | CENTER | VCENTER | DBLSIZE);
    }

    private draw() {
        lcd.clear(COLOR_THEME_PRIMARY2);
        lcd.drawFilledRectangle(this.ox, this.oy, this.arenaW, this.arenaH, COLOR_THEME_SECONDARY3);
        lcd.drawRectangle(this.ox, this.oy, this.arenaW, this.arenaH, COLOR_THEME_PRIMARY1);

        for (let i = 0; i < this.foods.length; i++) {
            this.drawBlob(this.foods[i]);
        }
        for (let i = 0; i < this.blobs.length; i++) {
            this.drawBlob(this.blobs[i]);
        }
        if (this.phase != this.state.initial) {
            this.drawBlob(this.player);
        }

        this.drawHud();

        if (this.phase == this.state.initial) {
            this.drawOverlay('AGAR LITE\nPress SYS');
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

        const now = getTime();
        if (this.phase == this.state.playing && now - this.lastTick >= this.tickCs) {
            this.updateGame();
            this.lastTick = now;
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
