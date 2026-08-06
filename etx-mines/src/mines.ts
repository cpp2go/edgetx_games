declare function getLastPos(): LuaMultiReturn<[unknown, unknown]>;

class Game {
    private cols = 12;
    private rows = 9;
    private mines = 20;
    private cell = 32;

    private mineGrid: boolean[][] = [];
    private revealed: boolean[][] = [];
    private flagged: boolean[][] = [];

    private diffNames = ['EASY', 'MEDIUM', 'HARD'];
    private diffCols = [9, 12, 15];
    private diffRows = [9, 9, 9];
    private diffMines = [10, 20, 32];
    private difficulty = 1;

    private flagsPlaced = 0;
    private elapsed = 0;
    private best: number[] = [-1, -1, -1];
    private firstReveal = false;
    private startTime = 0;
    private flagMode = false;
    private cursor = 0;
    private pressed = false;
    private soundEnabled = true;

    private state = { initial: 0, playing: 1, win: 2, gameOver: 3 };
    private phase = this.state.initial;

    private ox = 0;
    private oy = 0;
    private btnW = 30;
    private btnH = 16;

    private numColors = [0, BLUE, GREEN, RED, ORANGE, DARKRED, YELLOW, WHITE, GREY];

    constructor(private w: number, private h: number) {
        this.newGame();
        this.phase = this.state.initial;
    }

    private playSfx(freq: number, duration: number, pause: number = 0) {
        if (!this.soundEnabled) {
            return;
        }
        (playTone as unknown as (f: number, d: number, p: number) => void)(freq, duration, pause);
    }

    private numSize(): number {
        if (this.cell >= 28) {
            return DBLSIZE;
        }
        if (this.cell >= 20) {
            return MIDSIZE;
        }
        return SMLSIZE;
    }

    private layout() {
        // full screen: the board fills the display below a thin status strip,
        // so the top row of cells is never covered by the overlay
        const cols = this.diffCols[this.difficulty];
        const rows = this.diffRows[this.difficulty];
        const availH = this.h - this.btnH - 4;
        const cellW = Math.floor((this.w - 4) / cols);
        const cellH = Math.floor(availH / rows);
        this.cell = Math.max(12, Math.min(cellW, cellH, 40));
        this.ox = Math.floor((this.w - this.cell * cols) / 2);
        this.oy = this.btnH + 2 + Math.floor((availH - this.cell * rows) / 2);
    }

    private newGame() {
        this.layout();
        this.cols = this.diffCols[this.difficulty];
        this.rows = this.diffRows[this.difficulty];
        this.mines = this.diffMines[this.difficulty];

        this.mineGrid = [];
        this.revealed = [];
        this.flagged = [];
        for (let r = 0; r < this.rows; r++) {
            const mg: boolean[] = [];
            const rv: boolean[] = [];
            const fg: boolean[] = [];
            for (let c = 0; c < this.cols; c++) {
                mg.push(false);
                rv.push(false);
                fg.push(false);
            }
            this.mineGrid.push(mg);
            this.revealed.push(rv);
            this.flagged.push(fg);
        }

        this.flagsPlaced = 0;
        this.elapsed = 0;
        this.firstReveal = false;
        this.flagMode = false;
        this.cursor = 0;
        this.pressed = false;
        this.phase = this.state.playing;
        this.playSfx(880, 80, 0);
    }

    // place mines after the first click, keeping the clicked 3x3 area safe
    private placeMines(avoidR: number, avoidC: number) {
        let placed = 0;
        let guard = 0;
        while (placed < this.mines && guard < 2000) {
            guard++;
            const r = Math.floor(Math.random() * this.rows);
            const c = Math.floor(Math.random() * this.cols);
            if (this.mineGrid[r][c]) {
                continue;
            }
            if (Math.abs(r - avoidR) <= 1 && Math.abs(c - avoidC) <= 1) {
                continue;
            }
            this.mineGrid[r][c] = true;
            placed++;
        }
    }

    private neighborMines(r: number, c: number): number {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const rr = r + dr;
                const cc = c + dc;
                if (rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols && this.mineGrid[rr][cc]) {
                    n++;
                }
            }
        }
        return n;
    }

    private reveal(r: number, c: number) {
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) {
            return;
        }
        if (this.revealed[r][c] || this.flagged[r][c]) {
            return;
        }
        if (!this.firstReveal) {
            this.firstReveal = true;
            this.startTime = getTime();
            this.placeMines(r, c);
        }
        if (this.mineGrid[r][c]) {
            this.revealed[r][c] = true;
            this.gameOver();
            return;
        }
        this.revealed[r][c] = true;
        if (this.neighborMines(r, c) == 0) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr == 0 && dc == 0) {
                        continue;
                    }
                    this.reveal(r + dr, c + dc);
                }
            }
        }
        this.checkWin();
    }

    private flagCell(r: number, c: number) {
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) {
            return;
        }
        if (this.revealed[r][c]) {
            return;
        }
        if (this.flagged[r][c]) {
            this.flagged[r][c] = false;
            this.flagsPlaced--;
            this.playSfx(600, 10, 0);
        } else {
            this.flagged[r][c] = true;
            this.flagsPlaced++;
            this.playSfx(700, 10, 0);
        }
    }

    private gameOver() {
        this.phase = this.state.gameOver;
        this.playSfx(180, 260, 0);
    }

    private checkWin() {
        let revealedCount = 0;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.revealed[r][c]) {
                    revealedCount++;
                }
            }
        }
        if (revealedCount >= this.rows * this.cols - this.mines) {
            this.phase = this.state.win;
            this.elapsed = getTime() - this.startTime;
            if (this.best[this.difficulty] < 0 || this.elapsed < this.best[this.difficulty]) {
                this.best[this.difficulty] = this.elapsed;
            }
            this.playSfx(980, 200, 0);
        }
    }

    private moveCursor(dx: number, dy: number) {
        const c = this.cursor % this.cols;
        const r = Math.floor(this.cursor / this.cols);
        const nc = (c + dx + this.cols) % this.cols;
        const nr = (r + dy + this.rows) % this.rows;
        this.cursor = nr * this.cols + nc;
        this.playSfx(700, 6, 0);
    }

    private isTouchEvent(event: number): boolean {
        return (
            event == EVT_TOUCH_FIRST ||
            event == EVT_TOUCH_SLIDE ||
            event == EVT_TOUCH_TAP ||
            event == EVT_TOUCH_BREAK
        );
    }

    private readTouchPosition(touchState: any): { x: number; y: number } | null {
        if (touchState != null) {
            const tx = touchState.x;
            const ty = touchState.y;
            if (type(tx) == 'number' && type(ty) == 'number') {
                return { x: tx as number, y: ty as number };
            }
        }

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

    private gridHit(x: number, y: number): { r: number; c: number } | null {
        const gx = Math.floor((x - this.ox) / this.cell);
        const gy = Math.floor((y - this.oy) / this.cell);
        if (gx < 0 || gx >= this.cols || gy < 0 || gy >= this.rows) {
            return null;
        }
        return { r: gy, c: gx };
    }

    private buttonHit(x: number, y: number): string | null {
        const nx = this.w - this.btnW * 2 - 4;
        const fx = this.w - this.btnW - 2;
        if (y >= 1 && y <= this.btnH + 1) {
            if (x >= nx && x <= nx + this.btnW) {
                return 'new';
            }
            if (x >= fx && x <= fx + this.btnW) {
                return 'flag';
            }
        }
        return null;
    }

    private applyTouchControl(event: number, touchState: any): boolean {
        if (!this.isTouchEvent(event)) {
            return false;
        }

        const pos = this.readTouchPosition(touchState);
        if (pos == null) {
            return false;
        }

        if (this.phase == this.state.initial || this.phase == this.state.win || this.phase == this.state.gameOver) {
            if (event == EVT_TOUCH_TAP || event == EVT_TOUCH_FIRST) {
                if (this.buttonHit(pos.x, pos.y) == 'flag') {
                    this.flagMode = !this.flagMode;
                    this.playSfx(700, 10, 0);
                    return true;
                }
                this.newGame();
                this.pressed = true;
            }
            return true;
        }

        if (event == EVT_TOUCH_BREAK) {
            this.pressed = false;
            return true;
        }

        if (event != EVT_TOUCH_TAP && event != EVT_TOUCH_FIRST) {
            return true;
        }

        const btn = this.buttonHit(pos.x, pos.y);
        if (btn == 'new') {
            this.newGame();
            this.pressed = true;
            return true;
        }
        if (btn == 'flag') {
            this.flagMode = !this.flagMode;
            this.playSfx(700, 10, 0);
            this.pressed = true;
            return true;
        }

        const cell = this.gridHit(pos.x, pos.y);
        if (cell != null) {
            this.cursor = cell.r * this.cols + cell.c;
            if (this.flagMode) {
                this.flagCell(cell.r, cell.c);
            } else {
                this.reveal(cell.r, cell.c);
            }
        }
        this.pressed = true;
        return true;
    }

    private onEvent(event: number, touchState: any) {
        if (this.applyTouchControl(event, touchState)) {
            return;
        }

        if (event == EVT_SYS_BREAK) {
            this.newGame();
            return;
        }

        if (this.phase == this.state.initial) {
            if (event == EVT_PLUS_FIRST || event == EVT_VIRTUAL_INC) {
                this.difficulty = (this.difficulty + 1) % 3;
                this.playSfx(700, 20, 0);
            } else if (event == EVT_MINUS_FIRST || event == EVT_VIRTUAL_DEC) {
                this.difficulty = (this.difficulty + 2) % 3;
                this.playSfx(700, 20, 0);
            } else if (event == EVT_ENTER_BREAK || event == EVT_VIRTUAL_ENTER) {
                this.newGame();
            }
            return;
        }

        if (this.phase == this.state.win || this.phase == this.state.gameOver) {
            if (event == EVT_ENTER_BREAK || event == EVT_VIRTUAL_ENTER) {
                this.newGame();
            }
            return;
        }

        // playing
        if (event == EVT_VIRTUAL_PREV) {
            this.moveCursor(-1, 0);
        } else if (event == EVT_VIRTUAL_NEXT) {
            this.moveCursor(1, 0);
        } else if (event == EVT_TELEM_FIRST) {
            this.moveCursor(0, -1);
        } else if (event == EVT_VIRTUAL_NEXT_PAGE || event == EVT_VIRTUAL_PREV_PAGE) {
            this.moveCursor(0, 1);
        } else if (event == EVT_ENTER_BREAK || event == EVT_VIRTUAL_ENTER) {
            const r = Math.floor(this.cursor / this.cols);
            const c = this.cursor % this.cols;
            if (this.flagMode) {
                this.flagCell(r, c);
            } else {
                this.reveal(r, c);
            }
        } else if (event == EVT_EXIT_BREAK || event == EVT_VIRTUAL_EXIT) {
            const r = Math.floor(this.cursor / this.cols);
            const c = this.cursor % this.cols;
            this.flagCell(r, c);
        } else if (event == EVT_PLUS_FIRST || event == EVT_MODEL_FIRST) {
            this.flagMode = !this.flagMode;
            this.playSfx(700, 10, 0);
        }
    }

    private drawFlag(cx: number, cy: number) {
        const tri = lcd.drawFilledTriangle as unknown as (
            x1: number,
            y1: number,
            x2: number,
            y2: number,
            x3: number,
            y3: number,
            flags?: number
        ) => void;
        const s = Math.max(4, Math.floor(this.cell * 0.28));
        lcd.drawFilledRectangle(cx - Math.floor(s / 2), cy - s, 2, s * 2, COLOR_THEME_PRIMARY1);
        tri(cx - Math.floor(s / 2) + 2, cy - s, cx + s, cy - Math.floor(s / 2), cx - Math.floor(s / 2) + 2, cy, COLOR_THEME_WARNING);
    }

    private drawMine(cx: number, cy: number) {
        const r = Math.max(3, Math.floor(this.cell * 0.3));
        (lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void)(cx, cy, r, BLACK);
        (lcd.drawCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void)(cx, cy, r, COLOR_THEME_PRIMARY2);
    }

    private drawCell(r: number, c: number) {
        const px = this.ox + c * this.cell;
        const py = this.oy + r * this.cell;
        const cx = px + this.cell / 2;
        const cy = py + this.cell / 2;
        const idx = r * this.cols + c;

        const showMine = this.phase == this.state.gameOver && this.mineGrid[r][c];
        const rev = this.revealed[r][c] || showMine;

        if (rev) {
            lcd.drawFilledRectangle(px + 1, py + 1, this.cell - 2, this.cell - 2, COLOR_THEME_SECONDARY1);
            if (this.mineGrid[r][c]) {
                this.drawMine(cx, cy);
            } else {
                const n = this.neighborMines(r, c);
                if (n > 0) {
                    lcd.drawText(cx, cy, `${n}`, this.numSize() | CENTER | VCENTER | this.numColors[n]);
                }
            }
        } else {
            lcd.drawFilledRectangle(px + 1, py + 1, this.cell - 2, this.cell - 2, COLOR_THEME_SECONDARY3);
            if (this.flagged[r][c]) {
                this.drawFlag(cx, cy);
            }
        }

        lcd.drawRectangle(px, py, this.cell, this.cell, COLOR_THEME_SECONDARY2);
        if (idx == this.cursor && this.phase == this.state.playing) {
            lcd.drawRectangle(px, py, this.cell, this.cell, COLOR_THEME_PRIMARY1, 2);
        }
    }

    private drawButton(x: number, y: number, w: number, h: number, label: string, active: boolean) {
        lcd.drawFilledRectangle(x, y, w, h, active ? COLOR_THEME_WARNING : COLOR_THEME_SECONDARY3);
        lcd.drawRectangle(x, y, w, h, COLOR_THEME_PRIMARY1);
        lcd.drawText(x + w / 2, y + h / 2, label, SMLSIZE | CENTER | VCENTER | COLOR_THEME_PRIMARY1);
    }

    private drawHud() {
        // thin strip overlaid on the full-screen board so the status stays readable
        lcd.drawFilledRectangle(1, 1, this.w - 2, this.btnH + 1, COLOR_THEME_SECONDARY1);
        lcd.drawText(4, 3, `M: ${this.mines - this.flagsPlaced}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w * 0.32, 3, `T: ${Math.floor(this.elapsed)}`, SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        const b = this.best[this.difficulty] < 0 ? '-' : `${Math.floor(this.best[this.difficulty])}`;
        lcd.drawText(this.w * 0.62, 3, `Best: ${b}`, SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);

        const nx = this.w - this.btnW * 2 - 4;
        const fx = this.w - this.btnW - 2;
        this.drawButton(nx, 1, this.btnW, this.btnH, 'N', false);
        this.drawButton(fx, 1, this.btnW, this.btnH, 'F', this.flagMode);
    }

    private drawOverlay(text: string) {
        lcd.drawFilledRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_SECONDARY1, 1);
        lcd.drawRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_PRIMARY1, 2);
        lcd.drawText(this.w / 2, this.h / 2, text, COLOR_THEME_PRIMARY1 | CENTER | VCENTER | DBLSIZE);
    }

    private draw() {
        lcd.clear(COLOR_THEME_PRIMARY2);
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                this.drawCell(r, c);
            }
        }
        // overlay status + buttons on top of the full-screen board
        this.drawHud();

        if (this.phase == this.state.initial) {
            this.drawOverlay(`MINESWEEPER\nDifficulty: ${this.diffNames[this.difficulty]}\n+/- change  SYS start`);
        } else if (this.phase == this.state.win) {
            this.drawOverlay(`CLEARED! ${Math.floor(this.elapsed)}s\nTap or SYS`);
        } else if (this.phase == this.state.gameOver) {
            this.drawOverlay('BOOM!\nTap or SYS');
        }
    }

    public run(event: number, touchState: any): number {
        if (event != null) {
            this.onEvent(event, touchState);
        }
        if (this.phase == this.state.playing && this.firstReveal) {
            this.elapsed = getTime() - this.startTime;
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
