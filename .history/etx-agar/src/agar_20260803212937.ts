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
    private playerCells: Blob[] = [];
    private score = 0;
    private best = 0;

    private state = { initial: 0, playing: 1, paused: 2, gameOver: 3 };
    private phase = this.state.initial;

    private arenaW = 180;
    private arenaH = 140;
    private ox = 0;
    private oy = 0;
    private hudTop = 40;
    private border = 6;

    private tickCs = 3;
    private lastTick = 0;
    private soundEnabled = true;
    private splitCooldownUntil = 0;
    private ejectCooldownUntil = 0;
    private mergeAllowedAt = 0;
    private maxPlayerCells = 8;

    constructor(private w: number, private h: number) {
        this.setupViewport();
        this.lastTick = getTime();
    }

    private setupViewport() {
        this.arenaW = Math.max(120, this.w - this.border * 2);
        this.arenaH = Math.max(100, this.h - this.hudTop - this.border);
        this.ox = Math.floor((this.w - this.arenaW) / 2);
        this.oy = this.hudTop;
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
        const color = mass < this.totalPlayerMass() ? COLOR_THEME_SECONDARY1 : COLOR_THEME_PRIMARY1;
        this.blobs.push(new Blob(x, y, mass, vx, vy, color));
    }

    private totalPlayerMass(): number {
        let total = 0;
        for (let i = 0; i < this.playerCells.length; i++) {
            total += this.playerCells[i].mass;
        }
        return total;
    }

    private getLargestPlayerCell(): Blob | null {
        if (this.playerCells.length == 0) {
            return null;
        }
        let largest = this.playerCells[0];
        for (let i = 1; i < this.playerCells.length; i++) {
            if (this.playerCells[i].mass > largest.mass) {
                largest = this.playerCells[i];
            }
        }
        return largest;
    }

    private movementDirection(): { x: number; y: number } {
        const sx = getValue('ail') / 1024;
        const sy = -getValue('ele') / 1024;
        const len = Math.sqrt(sx * sx + sy * sy);
        if (len > 0.15) {
            return { x: sx / len, y: sy / len };
        }

        const lead = this.getLargestPlayerCell();
        if (lead != null) {
            const vLen = Math.sqrt(lead.vx * lead.vx + lead.vy * lead.vy);
            if (vLen > 0.05) {
                return { x: lead.vx / vLen, y: lead.vy / vLen };
            }
        }
        return { x: 1, y: 0 };
    }

    private splitPlayer() {
        if (this.phase != this.state.playing) {
            return;
        }
        const now = getTime();
        if (now < this.splitCooldownUntil || this.playerCells.length >= this.maxPlayerCells) {
            return;
        }

        const source = this.getLargestPlayerCell();
        if (source == null || source.mass < 18) {
            return;
        }

        const dir = this.movementDirection();
        const newMass = source.mass / 2;
        source.mass = newMass;

        const newCell = new Blob(
            source.x + dir.x * (source.radius() + 4),
            source.y + dir.y * (source.radius() + 4),
            newMass,
            dir.x * 2.4,
            dir.y * 2.4,
            COLOR_THEME_SECONDARY2
        );

        source.vx -= dir.x * 0.8;
        source.vy -= dir.y * 0.8;

        const r = newCell.radius();
        newCell.x = this.clamp(newCell.x, r, this.arenaW - r);
        newCell.y = this.clamp(newCell.y, r, this.arenaH - r);

        this.playerCells.push(newCell);
        this.splitCooldownUntil = now + 12;
        this.mergeAllowedAt = now + 90;
        this.playSfx(960, 65, 0);
    }

    private ejectMass() {
        if (this.phase != this.state.playing) {
            return;
        }
        const now = getTime();
        if (now < this.ejectCooldownUntil) {
            return;
        }

        const source = this.getLargestPlayerCell();
        if (source == null || source.mass < 14) {
            return;
        }

        const dir = this.movementDirection();
        const ejectMass = 2.2;
        source.mass -= ejectMass;

        const spore = new Blob(
            source.x + dir.x * (source.radius() + 3),
            source.y + dir.y * (source.radius() + 3),
            1.9,
            dir.x * 2.8,
            dir.y * 2.8,
            COLOR_THEME_WARNING
        );
        this.foods.push(spore);

        this.ejectCooldownUntil = now + 3;
        this.playSfx(700, 16, 0);
    }

    private restart() {
        this.score = 0;
        this.blobs = [];
        this.foods = [];
        this.playerCells = [new Blob(this.arenaW / 2, this.arenaH / 2, 28, 0, 0, COLOR_THEME_SECONDARY2)];
        this.splitCooldownUntil = 0;
        this.ejectCooldownUntil = 0;
        this.mergeAllowedAt = 0;

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

        for (let i = 0; i < this.playerCells.length; i++) {
            const p = this.playerCells[i];
            const speed = 1.9 - Math.min(1.2, p.mass / 120);
            p.vx = p.vx * 0.75 + stickX * speed * 0.25;
            p.vy = p.vy * 0.75 + (-stickY) * speed * 0.25;

            p.x += p.vx;
            p.y += p.vy;

            const r = p.radius();
            p.x = this.clamp(p.x, r, this.arenaW - r);
            p.y = this.clamp(p.y, r, this.arenaH - r);
        }
    }

    private updateFoods() {
        for (let i = 0; i < this.foods.length; i++) {
            const f = this.foods[i];
            if (Math.abs(f.vx) < 0.01 && Math.abs(f.vy) < 0.01) {
                f.vx = 0;
                f.vy = 0;
                continue;
            }

            f.x += f.vx;
            f.y += f.vy;

            const r = f.radius();
            if (f.x < r || f.x > this.arenaW - r) {
                f.vx *= -0.4;
            }
            if (f.y < r || f.y > this.arenaH - r) {
                f.vy *= -0.4;
            }

            f.x = this.clamp(f.x, r, this.arenaW - r);
            f.y = this.clamp(f.y, r, this.arenaH - r);
            f.vx *= 0.88;
            f.vy *= 0.88;
        }
    }

    private mergePlayerCells() {
        if (this.playerCells.length <= 1 || getTime() < this.mergeAllowedAt) {
            return;
        }

        let mergedAny = false;
        let i = 0;
        while (i < this.playerCells.length) {
            let merged = false;
            let j = i + 1;
            while (j < this.playerCells.length) {
                const a = this.playerCells[i];
                const b = this.playerCells[j];
                const d = this.dist(a.x, a.y, b.x, b.y);
                if (d <= Math.max(2, a.radius() + b.radius() - 2)) {
                    const totalMass = a.mass + b.mass;
                    a.x = (a.x * a.mass + b.x * b.mass) / totalMass;
                    a.y = (a.y * a.mass + b.y * b.mass) / totalMass;
                    a.vx = (a.vx * a.mass + b.vx * b.mass) / totalMass;
                    a.vy = (a.vy * a.mass + b.vy * b.mass) / totalMass;
                    a.mass = totalMass;
                    this.playerCells.splice(j, 1);
                    mergedAny = true;
                    merged = true;
                    break;
                }
                j++;
            }
            if (!merged) {
                i++;
            }
        }

        if (mergedAny) {
            this.playSfx(740, 25, 0);
        }
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

            e.color = e.mass < this.totalPlayerMass() ? COLOR_THEME_SECONDARY1 : COLOR_THEME_PRIMARY1;
        }
    }

    private handleFoodCollisions() {
        const remaining: Blob[] = [];
        for (let i = 0; i < this.foods.length; i++) {
            const f = this.foods[i];
            let eaten = false;
            for (let j = 0; j < this.playerCells.length; j++) {
                const p = this.playerCells[j];
                const d = this.dist(p.x, p.y, f.x, f.y);
                if (d <= p.radius()) {
                    p.mass += f.mass * 0.5;
                    this.score += 1;
                    this.playSfx(600, 20, 0);
                    this.spawnFood();
                    eaten = true;
                    break;
                }
            }
            if (!eaten) {
                remaining.push(f);
            }
        }
        this.foods = remaining;
    }

    private handleBlobCollisions() {
        const survivors: Blob[] = [];
        for (let i = 0; i < this.blobs.length; i++) {
            const b = this.blobs[i];
            let colliding = false;
            for (let j = 0; j < this.playerCells.length; j++) {
                const p = this.playerCells[j];
                const d = this.dist(p.x, p.y, b.x, b.y);
                if (d <= p.radius() + b.radius()) {
                    colliding = true;
                    break;
                }
            }
            if (!colliding) {
                survivors.push(b);
                continue;
            }

            let eatenByPlayer = false;
            for (let j = 0; j < this.playerCells.length; j++) {
                const p = this.playerCells[j];
                if (p.mass > b.mass * 1.1 && this.absorb(p, b)) {
                    p.mass += b.mass * 0.65;
                    this.score += Math.floor(b.mass);
                    this.playSfx(500, 70, 0);
                    this.spawnEnemy(this.rand(10, Math.min(this.totalPlayerMass() * 1.1, 52)));
                    eatenByPlayer = true;
                    break;
                }
            }
            if (eatenByPlayer) {
                continue;
            }

            let eatenCellIndex = -1;
            for (let j = 0; j < this.playerCells.length; j++) {
                const p = this.playerCells[j];
                if (b.mass > p.mass * 1.05 && this.absorb(b, p)) {
                    eatenCellIndex = j;
                    break;
                }
            }

            if (eatenCellIndex >= 0) {
                const eatenCellMass = this.playerCells[eatenCellIndex].mass;
                b.mass += eatenCellMass * 0.55;
                this.playerCells.splice(eatenCellIndex, 1);
                this.playSfx(230, 70, 0);
                if (this.playerCells.length == 0) {
                    this.phase = this.state.gameOver;
                    this.best = Math.max(this.best, this.score);
                    this.playSfx(180, 260, 0);
                    return;
                }
            }
            survivors.push(b);
        }
        this.blobs = survivors;
    }

    private balanceWorld() {
        if (this.foods.length < 20) {
            this.spawnFood();
        }
        if (this.blobs.length < 6) {
            this.spawnEnemy(this.rand(10, Math.min(this.totalPlayerMass() * 1.2, 56)));
        }
    }

    private updateGame() {
        this.updatePlayerMotion();
        this.mergePlayerCells();
        this.updateFoods();
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

        if ((event == EVT_ENTER_BREAK || event == EVT_VIRTUAL_ENTER) && this.phase == this.state.playing) {
            this.splitPlayer();
            return;
        }

        if ((event == EVT_PLUS_FIRST || event == EVT_TELEM_FIRST || event == EVT_VIRTUAL_MENU) && this.phase == this.state.playing) {
            this.ejectMass();
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
        const r = b.radius();
        (lcd.drawFilledCircle as unknown as (cx: number, cy: number, radius: number, flags?: number) => void)(x, y, r, b.color);
        (lcd.drawCircle as unknown as (cx: number, cy: number, radius: number, flags?: number) => void)(x, y, r, COLOR_THEME_PRIMARY2);
    }

    private drawHud() {
        lcd.drawText(4, 4, `Score: ${this.score}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(4, 18, `Mass: ${Math.floor(this.totalPlayerMass())}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(4, 32, `Cells: ${this.playerCells.length}`, SMLSIZE | COLOR_THEME_PRIMARY1);
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
            for (let i = 0; i < this.playerCells.length; i++) {
                this.drawBlob(this.playerCells[i]);
            }
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
    const gameW = LCD_W >= 480 ? LCD_W : w;
    const gameH = LCD_H >= 320 ? LCD_H : h;
    game = new Game(gameW, gameH);
}

function run(event: number, touchState: any): number {
    return game.run(event, touchState);
}

export { init, run };
