class Point {
    public x: number;
    public y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }
}

type Dir = { x: number; y: number };

declare function getLastPos(): LuaMultiReturn<[unknown, unknown]>;

class Game {
    private cols = 30;
    private rows = 20;
    private cell = 0;
    private xOffset = 0;
    private yOffset = 0;

    private snake: Point[] = [];
    private food = new Point(0, 0);
    private dir: Dir = { x: 1, y: 0 };
    private nextDir: Dir = { x: 1, y: 0 };

    private score = 0;
    private lastTick = 0;
    private tick = 18; // centiseconds
    private soundEnabled = true;

    private phase = { initial: 0, playing: 1, paused: 2, gameOver: 3 };
    private state = this.phase.initial;

    constructor(private w: number, private h: number) {
        this.computeGrid();
        this.lastTick = getTime();
    }

    private playSfx(freq: number, duration: number, pause: number = 0) {
        if (!this.soundEnabled) {
            return;
        }
        (playTone as unknown as (f: number, d: number, p: number) => void)(freq, duration, pause);
    }

    private computeGrid() {
        // Use a 30x20 baseline so 480x320 maps to exact full-screen cells (16px each).
        const baselineCols = 30;
        const baselineRows = 20;
        const baseCell = Math.max(8, Math.floor(Math.min(this.w / baselineCols, this.h / baselineRows)));

        this.cell = baseCell;
        this.cols = Math.max(12, Math.floor(this.w / this.cell));
        this.rows = Math.max(10, Math.floor(this.h / this.cell));
        this.xOffset = Math.floor((this.w - this.cell * this.cols) / 2);
        this.yOffset = Math.floor((this.h - this.cell * this.rows) / 2);
    }

    private reset() {
        const cx = Math.floor(this.cols / 2);
        const cy = Math.floor(this.rows / 2);

        this.snake = [
            new Point(cx, cy),
            new Point(cx - 1, cy),
            new Point(cx - 2, cy),
        ];
        this.dir = { x: 1, y: 0 };
        this.nextDir = { x: 1, y: 0 };
        this.score = 0;
        this.tick = 18;
        this.state = this.phase.playing;
        this.lastTick = getTime();
        this.spawnFood();
        this.playSfx(900, 90, 0);
    }

    private spawnFood() {
        let ok = false;
        while (!ok) {
            const x = Math.floor(Math.random() * this.cols);
            const y = Math.floor(Math.random() * this.rows);
            ok = true;
            for (let i = 0; i < this.snake.length; i++) {
                if (this.snake[i].x == x && this.snake[i].y == y) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                this.food = new Point(x, y);
            }
        }
    }

    private isOpposite(a: Dir, b: Dir): boolean {
        return a.x + b.x == 0 && a.y + b.y == 0;
    }

    private isSameDir(a: Dir, b: Dir): boolean {
        return a.x == b.x && a.y == b.y;
    }

    private setDirection(d: Dir) {
        if (!this.isOpposite(this.dir, d) && !this.isSameDir(this.nextDir, d)) {
            this.nextDir = d;
            this.playSfx(700, 10, 0);
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

    private readTouchPosition(): Point | null {
        if (type(getLastPos as unknown) != "function") {
            return null;
        }

        const [xRaw, yRaw] = getLastPos();
        if (type(xRaw) == "number" && type(yRaw) == "number") {
            return new Point(xRaw as number, yRaw as number);
        }

        if (type(xRaw) == "table") {
            const t = xRaw as { x?: unknown; y?: unknown; [k: number]: unknown };
            const tx = (t.x as number) ?? (t[1] as number);
            const ty = (t.y as number) ?? (t[2] as number);
            if (type(tx) == "number" && type(ty) == "number") {
                return new Point(tx, ty);
            }
        }

        return null;
    }

    private applyTouchControl(event: number): void {
        if (!this.isTouchEvent(event)) {
            return;
        }

        if (event == EVT_TOUCH_TAP) {
            if (this.state == this.phase.initial || this.state == this.phase.gameOver) {
                this.reset();
                return;
            }
            if (this.state == this.phase.paused) {
                this.state = this.phase.playing;
                this.playSfx(820, 40, 0);
                return;
            }
        }

        if (this.state != this.phase.playing || this.snake.length == 0) {
            return;
        }

        const touch = this.readTouchPosition();
        if (touch == null) {
            return;
        }

        const head = this.snake[0];
        const headX = this.xOffset + head.x * this.cell + this.cell / 2;
        const headY = this.yOffset + head.y * this.cell + this.cell / 2;
        const dx = touch.x - headX;
        const dy = touch.y - headY;

        if (math.abs(dx) < this.cell * 0.4 && math.abs(dy) < this.cell * 0.4) {
            return;
        }

        if (math.abs(dx) >= math.abs(dy)) {
            this.setDirection({ x: dx >= 0 ? 1 : -1, y: 0 });
        } else {
            this.setDirection({ x: 0, y: dy >= 0 ? 1 : -1 });
        }
    }

    private applyStickControl() {
        if (this.state != this.phase.playing) {
            return;
        }

        const sx = getValue("ail") / 1024;
        const sy = getValue("ele") / 1024;
        const deadzone = 0.35;

        if (math.abs(sx) < deadzone && math.abs(sy) < deadzone) {
            return;
        }

        if (math.abs(sx) >= math.abs(sy)) {
            this.setDirection({ x: sx >= 0 ? 1 : -1, y: 0 });
        } else {
            this.setDirection({ x: 0, y: sy >= 0 ? -1 : 1 });
        }
    }

    private onEvent(event: number) {
        if (event == EVT_SYS_BREAK) {
            this.reset();
            return;
        }

        if (event == EVT_MODEL_FIRST) {
            if (this.state == this.phase.paused) {
                this.state = this.phase.playing;
                this.playSfx(820, 40, 0);
            } else if (this.state == this.phase.playing) {
                this.state = this.phase.paused;
                this.playSfx(420, 60, 0);
            }
            return;
        }

        if (this.state != this.phase.playing) {
            return;
        }

        if (event == EVT_VIRTUAL_NEXT) {
            this.setDirection({ x: 1, y: 0 });
        } else if (event == EVT_VIRTUAL_PREV) {
            this.setDirection({ x: -1, y: 0 });
        } else if (event == EVT_TELEM_FIRST) {
            this.setDirection({ x: 0, y: -1 });
        } else if (event == EVT_VIRTUAL_NEXT_PAGE || event == EVT_VIRTUAL_PREV_PAGE) {
            this.setDirection({ x: 0, y: 1 });
        }
    }

    private step() {
        this.dir = this.nextDir;
        const head = this.snake[0];
        const next = new Point(head.x + this.dir.x, head.y + this.dir.y);

        if (next.x < 0 || next.y < 0 || next.x >= this.cols || next.y >= this.rows) {
            this.state = this.phase.gameOver;
            this.playSfx(160, 240, 0);
            return;
        }

        for (let i = 0; i < this.snake.length; i++) {
            if (this.snake[i].x == next.x && this.snake[i].y == next.y) {
                this.state = this.phase.gameOver;
                this.playSfx(160, 240, 0);
                return;
            }
        }

        this.snake.unshift(next);

        if (next.x == this.food.x && next.y == this.food.y) {
            this.score += 10;
            this.playSfx(520, 70, 0);
            if (this.tick > 8) {
                this.tick -= 1;
            }
            this.spawnFood();
        } else {
            this.snake.pop();
        }
    }

    private drawGrid() {
        lcd.clear(COLOR_THEME_PRIMARY2);

        const gridW = this.cell * this.cols;
        const gridH = this.cell * this.rows;

        lcd.drawFilledRectangle(
            this.xOffset + this.food.x * this.cell + 1,
            this.yOffset + this.food.y * this.cell + 1,
            this.cell - 2,
            this.cell - 2,
            COLOR_THEME_WARNING
        );

        for (let i = 0; i < this.snake.length; i++) {
            const color = i == 0 ? COLOR_THEME_SECONDARY1 : COLOR_THEME_PRIMARY1;
            lcd.drawFilledRectangle(
                this.xOffset + this.snake[i].x * this.cell + 1,
                this.yOffset + this.snake[i].y * this.cell + 1,
                this.cell - 2,
                this.cell - 2,
                color
            );
        }

        lcd.drawText(4, 4, `Score: ${this.score}`, SMLSIZE | COLOR_THEME_PRIMARY1);
    }

    private drawOverlay(text: string) {
        lcd.drawFilledRectangle(18, 18, this.w - 36, this.h - 36, COLOR_THEME_SECONDARY1, 1);
        lcd.drawRectangle(18, 18, this.w - 36, this.h - 36, COLOR_THEME_PRIMARY1, 2);
        lcd.drawText(this.w / 2, this.h / 2, text, COLOR_THEME_PRIMARY1 | CENTER | VCENTER | DBLSIZE);
    }

    public run(event: number, touchState: any): number {
        if (event != null) {
            this.applyTouchControl(event);
            this.onEvent(event);
        }

        this.applyStickControl();

        if (this.state == this.phase.playing) {
            const now = getTime();
            if (now - this.lastTick >= this.tick) {
                this.step();
                this.lastTick = now;
            }
        }

        this.drawGrid();

        if (this.state == this.phase.initial) {
            this.drawOverlay("SNAKE\nPress SYS");
        } else if (this.state == this.phase.paused) {
            this.drawOverlay("PAUSED");
        } else if (this.state == this.phase.gameOver) {
            this.drawOverlay("GAME OVER\nPress SYS");
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
