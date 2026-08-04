interface Brick {
    x: number;
    y: number;
    w: number;
    h: number;
    hp: number;
    color: number;
}

declare function getLastPos(): LuaMultiReturn<[unknown, unknown]>;

class Game {
    private paddleX = 0;
    private paddleY = 0;
    private paddleW = 0;
    private paddleH = 0;

    private ballX = 0;
    private ballY = 0;
    private ballVx = 0;
    private ballVy = 0;
    private ballR = 6;
    private ballStuck = true;

    private bricks: Brick[] = [];
    private bricksRemaining = 0;

    private score = 0;
    private best = 0;
    private lives = 3;
    private level = 1;

    private state = { initial: 0, playing: 1, paused: 2, gameOver: 3, win: 4 };
    private phase = this.state.initial;

    private lastTick = 0;
    private soundEnabled = true;

    constructor(private w: number, private h: number) {
        this.computeLayout();
        this.lastTick = getTime();
    }

    private computeLayout() {
        const baseW = Math.max(58, Math.floor(this.w * 0.16));
        // shrink paddle 6% per level, minimum 55% of base
        const reduction = Math.max(0.55, 1.0 - (this.level - 1) * 0.06);
        this.paddleW = Math.floor(baseW * reduction);
        this.paddleH = Math.max(8, Math.floor(this.h * 0.025));
        this.paddleY = this.h - Math.max(16, Math.floor(this.h * 0.06));
        this.ballR = Math.max(5, Math.floor(this.w * 0.011));
        this.paddleX = Math.floor(this.w / 2);
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

    private isTouchEvent(event: number): boolean {
        return (
            event == EVT_TOUCH_FIRST ||
            event == EVT_TOUCH_SLIDE ||
            event == EVT_TOUCH_TAP ||
            event == EVT_TOUCH_BREAK
        );
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

    private buildLevel() {
        this.bricks = [];

        const rows = Math.min(8 + Math.floor((this.level - 1) / 2), 12);
        const cols = 10;
        const gapY = 3;
        const top = Math.max(14, Math.floor(this.h * 0.05));
        const brickH = Math.max(10, Math.floor(this.h * 0.045));
        // more rows of hard (hp=2) bricks at higher levels
        const hardRows = Math.min(1 + this.level, Math.ceil(rows / 2));

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x0 = Math.floor((c * this.w) / cols);
                const x1 = Math.floor(((c + 1) * this.w) / cols);
                const x = x0;
                const y = top + r * (brickH + gapY);
                const brickW = Math.max(3, x1 - x0 - 1);
                const hp = r < hardRows ? 2 : 1;
                const color = hp == 2 ? COLOR_THEME_WARNING : COLOR_THEME_SECONDARY2;
                this.bricks.push({ x: x, y: y, w: brickW, h: brickH, hp: hp, color: color });
            }
        }
        this.bricksRemaining = this.bricks.length;
    }

    private resetBall(stuck: boolean) {
        this.ballStuck = stuck;
        this.ballX = this.paddleX;
        this.ballY = this.paddleY - this.paddleH - this.ballR - 1;
        this.ballVx = 0;
        this.ballVy = 0;
    }

    private launchBall() {
        if (!this.ballStuck || this.phase != this.state.playing) {
            return;
        }
        this.ballStuck = false;
        const speed = 1.0 + (this.level - 1) * 0.15;
        this.ballVx = 3.2 * speed;
        this.ballVy = -4.8 * speed;
        this.playSfx(880, 60, 0);
    }

    private restart() {
        this.level = 1;
        this.computeLayout();
        this.score = 0;
        this.lives = 3;
        this.buildLevel();
        this.resetBall(true);
        this.phase = this.state.playing;
        this.lastTick = getTime();
        this.playSfx(860, 90, 0);
    }

    private nextLevel() {
        this.level += 1;
        this.computeLayout();
        this.buildLevel();
        this.resetBall(true);
        this.phase = this.state.playing;
        this.lastTick = getTime();
        this.playSfx(980, 200, 0);
    }

    private updatePaddle() {
        const stick = getValue('ail') / 1024;
        const maxStep = Math.max(4, Math.floor(this.w * 0.02));
        this.paddleX += stick * maxStep;
        this.paddleX = this.clamp(this.paddleX, this.paddleW / 2, this.w - this.paddleW / 2);

        if (this.ballStuck) {
            this.ballX = this.paddleX;
            this.ballY = this.paddleY - this.paddleH - this.ballR - 1;
        }
    }

    private handlePaddleCollision(prevY: number) {
        if (this.ballVy <= 0) {
            return;
        }

        const px0 = this.paddleX - this.paddleW / 2;
        const px1 = this.paddleX + this.paddleW / 2;
        const py0 = this.paddleY - this.paddleH / 2;

        const crossed = prevY + this.ballR <= py0 && this.ballY + this.ballR >= py0;
        const withinX = this.ballX >= px0 - this.ballR && this.ballX <= px1 + this.ballR;
        if (!crossed || !withinX) {
            return;
        }

        const ratio = (this.ballX - this.paddleX) / (this.paddleW / 2);
        this.ballVy = -Math.abs(this.ballVy);
        this.ballVx = ratio * 3.4;
        this.ballY = py0 - this.ballR - 1;
        this.playSfx(640, 20, 0);
    }

    private hitBrick(b: Brick) {
        b.hp -= 1;
        if (b.hp <= 0) {
            this.bricksRemaining -= 1;
            this.score += 10;
            this.playSfx(520, 35, 0);
        } else {
            b.color = COLOR_THEME_SECONDARY1;
            this.score += 4;
            this.playSfx(760, 18, 0);
        }

        if (this.bricksRemaining <= 0) {
            this.best = Math.max(this.best, this.score);
            this.phase = this.state.win;
            this.playSfx(980, 130, 0);
        }
    }

    private handleBrickCollision(prevX: number, prevY: number): boolean {
        for (let i = 0; i < this.bricks.length; i++) {
            const b = this.bricks[i];
            if (b.hp <= 0) {
                continue;
            }

            const nearestX = this.clamp(this.ballX, b.x, b.x + b.w);
            const nearestY = this.clamp(this.ballY, b.y, b.y + b.h);
            const dx = this.ballX - nearestX;
            const dy = this.ballY - nearestY;
            if (dx * dx + dy * dy > this.ballR * this.ballR) {
                continue;
            }

            this.hitBrick(b);

            const fromLeft = prevX <= b.x - this.ballR;
            const fromRight = prevX >= b.x + b.w + this.ballR;
            const fromTop = prevY <= b.y - this.ballR;
            const fromBottom = prevY >= b.y + b.h + this.ballR;

            if (fromLeft || fromRight) {
                this.ballVx = -this.ballVx;
            }
            if (fromTop || fromBottom || (!fromLeft && !fromRight)) {
                this.ballVy = -this.ballVy;
            }

            return true;
        }

        return false;
    }

    private updateBall() {
        if (this.ballStuck || this.phase != this.state.playing) {
            return;
        }

        // substeps prevent the ball tunneling through bricks at high speed
        const maxStep = Math.max(Math.abs(this.ballVx), Math.abs(this.ballVy));
        const stepCount = Math.max(2, Math.min(8, Math.ceil(maxStep / 3)));

        for (let s = 0; s < stepCount; s++) {
            const prevX = this.ballX;
            const prevY = this.ballY;

            this.ballX += this.ballVx / stepCount;
            this.ballY += this.ballVy / stepCount;

            if (this.ballX - this.ballR <= 0) {
                this.ballX = this.ballR;
                this.ballVx = Math.abs(this.ballVx);
                this.playSfx(420, 12, 0);
            } else if (this.ballX + this.ballR >= this.w) {
                this.ballX = this.w - this.ballR;
                this.ballVx = -Math.abs(this.ballVx);
                this.playSfx(420, 12, 0);
            }

            if (this.ballY - this.ballR <= 0) {
                this.ballY = this.ballR;
                this.ballVy = Math.abs(this.ballVy);
                this.playSfx(420, 12, 0);
            }

            this.handlePaddleCollision(prevY);
            this.handleBrickCollision(prevX, prevY);

            if (this.ballY - this.ballR > this.h) {
                this.lives -= 1;
                this.playSfx(180, 180, 0);
                if (this.lives <= 0) {
                    this.best = Math.max(this.best, this.score);
                    this.phase = this.state.gameOver;
                } else {
                    this.resetBall(true);
                }
                break;
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

        if (event == EVT_TELEM_FIRST || event == EVT_VIRTUAL_ENTER || event == EVT_ENTER_BREAK) {
            if (this.phase == this.state.win) {
                this.nextLevel();
            } else {
                this.launchBall();
            }
            return;
        }

        if (!this.isTouchEvent(event)) {
            return;
        }

        if (this.phase == this.state.initial || this.phase == this.state.gameOver || this.phase == this.state.win) {
            if (event == EVT_TOUCH_TAP || event == EVT_TOUCH_FIRST) {
                if (this.phase == this.state.win) {
                    this.nextLevel();
                } else {
                    this.restart();
                }
            }
            return;
        }

        const pos = this.readTouchPosition();
        if (pos) {
            this.paddleX = this.clamp(pos.x, this.paddleW / 2, this.w - this.paddleW / 2);
        }

        if (event == EVT_TOUCH_TAP || event == EVT_TOUCH_FIRST) {
            this.launchBall();
        }
    }

    private drawBricks() {
        for (let i = 0; i < this.bricks.length; i++) {
            const b = this.bricks[i];
            if (b.hp <= 0) {
                continue;
            }
            lcd.drawFilledRectangle(b.x, b.y, b.w, b.h, b.color);
            lcd.drawRectangle(b.x, b.y, b.w, b.h, COLOR_THEME_PRIMARY1);
        }
    }

    private drawPaddle() {
        const x = this.paddleX - this.paddleW / 2;
        const y = this.paddleY - this.paddleH / 2;
        lcd.drawFilledRectangle(x, y, this.paddleW, this.paddleH, COLOR_THEME_SECONDARY2);
        lcd.drawRectangle(x, y, this.paddleW, this.paddleH, COLOR_THEME_PRIMARY1);
    }

    private drawBall() {
        const size = this.ballR * 2;
        lcd.drawFilledRectangle(this.ballX - this.ballR, this.ballY - this.ballR, size, size, COLOR_THEME_WARNING);
    }

    private drawHud() {
        lcd.drawText(4, 0, `S:${this.score}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(56, 0, `Li:${this.lives}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w / 2, 0, `Lv:${this.level}`, SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w - 4, 0, `Best:${this.best}`, SMLSIZE | RIGHT | COLOR_THEME_PRIMARY1);
        if (this.ballStuck && this.phase == this.state.playing) {
            lcd.drawText(this.w / 2, this.h - 14, 'Tap/TELEM to launch', SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        }
    }

    private drawOverlay(text: string) {
        lcd.drawFilledRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_SECONDARY1, 1);
        lcd.drawRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_PRIMARY1, 2);
        lcd.drawText(this.w / 2, this.h / 2, text, COLOR_THEME_PRIMARY1 | CENTER | VCENTER | DBLSIZE);
    }

    private draw() {
        lcd.clear(COLOR_THEME_PRIMARY2);
        this.drawBricks();
        if (this.phase != this.state.initial) {
            this.drawPaddle();
            this.drawBall();
        }
        this.drawHud();

        if (this.phase == this.state.initial) {
            this.drawOverlay('BREAKOUT\nPress SYS');
        } else if (this.phase == this.state.paused) {
            this.drawOverlay('PAUSED');
        } else if (this.phase == this.state.gameOver) {
            this.drawOverlay('GAME OVER\nPress SYS');
        } else if (this.phase == this.state.win) {
            this.drawOverlay(`Lv.${this.level} Clear!\nTap for Lv.${this.level + 1}`);
        }
    }

    public run(event: number, touchState: any): number {
        if (event != null) {
            this.onEvent(event);
        }

        const now = getTime();
        if (now > this.lastTick) {
            this.updatePaddle();
            this.updateBall();
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
