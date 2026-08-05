declare function getLastPos(): LuaMultiReturn<[unknown, unknown]>;

class Game {
    private cols = 12;
    private rows = 8;
    private board: number[][] = [];
    private special: number[][] = [];

    private colors = [
        COLOR_THEME_WARNING,
        COLOR_THEME_ACTIVE,
        COLOR_THEME_SECONDARY1,
        COLOR_THEME_SECONDARY2,
        COLOR_THEME_PRIMARY3,
    ];
    private numColors = 5;

    private score = 0;
    private moves = 0;
    private maxMoves = 15;
    private targetScore = 400;

    private state = { initial: 0, playing: 1, win: 2, gameOver: 3 };
    private phase = this.state.initial;

    private cellW = 40;
    private cellH = 37;
    private ox = 0;
    private oy = 0;
    private hudTop = 20;

    private selected = -1;
    private cursor = 0;
    private resolving = false;
    private settling = false;
    private pressed = false;

    private soundEnabled = true;

    constructor(private w: number, private h: number) {
        this.layout();
        for (let r = 0; r < this.rows; r++) {
            const row: number[] = [];
            const sp: number[] = [];
            for (let c = 0; c < this.cols; c++) {
                row.push(0);
                sp.push(0);
            }
            this.board.push(row);
            this.special.push(sp);
        }
    }

    private layout() {
        this.ox = 0;
        this.oy = this.hudTop;
        this.cellW = Math.floor(this.w / this.cols);
        this.cellH = Math.floor((this.h - this.hudTop) / this.rows);
    }

    private playSfx(freq: number, duration: number, pause: number = 0) {
        if (!this.soundEnabled) {
            return;
        }
        (playTone as unknown as (f: number, d: number, p: number) => void)(freq, duration, pause);
    }

    private randColor(): number {
        return Math.floor(Math.random() * this.numColors);
    }

    private setupBoard() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                let color = this.randColor();
                while (this.makesMatch(r, c, color)) {
                    color = this.randColor();
                }
                this.board[r][c] = color;
                this.special[r][c] = 0;
            }
        }
        this.score = 0;
        this.moves = 0;
        this.selected = -1;
        this.cursor = 0;
        this.resolving = false;
        this.settling = false;
        this.phase = this.state.playing;
        this.playSfx(880, 80, 0);
    }

    // would placing `color` at (r,c) form a 3-run with the left/up neighbours
    private makesMatch(r: number, c: number, color: number): boolean {
        let h = 1;
        for (let cc = c - 1; cc >= 0 && this.board[r][cc] == color; cc--) {
            h++;
        }
        if (h >= 3) {
            return true;
        }
        let v = 1;
        for (let rr = r - 1; rr >= 0 && this.board[rr][c] == color; rr--) {
            v++;
        }
        return v >= 3;
    }

    private findMatches(): boolean {
        for (let r = 0; r < this.rows; r++) {
            let c = 0;
            while (c < this.cols) {
                const color = this.board[r][c];
                if (color < 0) {
                    c++;
                    continue;
                }
                let len = 1;
                while (c + len < this.cols && this.board[r][c + len] == color) {
                    len++;
                }
                if (len >= 3) {
                    return true;
                }
                c += len;
            }
        }
        for (let c = 0; c < this.cols; c++) {
            let r = 0;
            while (r < this.rows) {
                const color = this.board[r][c];
                if (color < 0) {
                    r++;
                    continue;
                }
                let len = 1;
                while (r + len < this.rows && this.board[r + len][c] == color) {
                    len++;
                }
                if (len >= 3) {
                    return true;
                }
                r += len;
            }
        }
        return false;
    }

    // clear one wave of matches (+ special effects), return tiles cleared
    private clearMatches(): number {
        const matched: boolean[][] = [];
        for (let r = 0; r < this.rows; r++) {
            const row: boolean[] = [];
            for (let c = 0; c < this.cols; c++) {
                row.push(false);
            }
            matched.push(row);
        }
        let spawnR = -1;
        let spawnC = -1;
        let spawnType = 0;

        for (let r = 0; r < this.rows; r++) {
            let c = 0;
            while (c < this.cols) {
                const color = this.board[r][c];
                if (color < 0) {
                    c++;
                    continue;
                }
                let len = 1;
                while (c + len < this.cols && this.board[r][c + len] == color) {
                    len++;
                }
                if (len >= 3) {
                    for (let k = 0; k < len; k++) {
                        matched[r][c + k] = true;
                    }
                    if (len >= 4 && spawnR < 0) {
                        spawnR = r;
                        spawnC = c;
                        spawnType = len >= 5 ? 2 : 1;
                    }
                }
                c += len;
            }
        }
        for (let c = 0; c < this.cols; c++) {
            let r = 0;
            while (r < this.rows) {
                const color = this.board[r][c];
                if (color < 0) {
                    r++;
                    continue;
                }
                let len = 1;
                while (r + len < this.rows && this.board[r + len][c] == color) {
                    len++;
                }
                if (len >= 3) {
                    for (let k = 0; k < len; k++) {
                        matched[r + k][c] = true;
                    }
                    if (len >= 4 && spawnR < 0) {
                        spawnR = r;
                        spawnC = c;
                        spawnType = len >= 5 ? 2 : 1;
                    }
                }
                r += len;
            }
        }

        // expand matches through special tiles
        let changed = true;
        while (changed) {
            changed = false;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (!matched[r][c]) {
                        continue;
                    }
                    const sp = this.special[r][c];
                    if (sp == 1) {
                        // bomb: clears a 3x3 area
                        for (let dr = -1; dr <= 1; dr++) {
                            for (let dc = -1; dc <= 1; dc++) {
                                const rr = r + dr;
                                const cc = c + dc;
                                if (rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols && !matched[rr][cc]) {
                                    matched[rr][cc] = true;
                                    changed = true;
                                }
                            }
                        }
                    } else if (sp == 2) {
                        // color bomb: clears every tile of its color
                        const target = this.board[r][c];
                        for (let rr = 0; rr < this.rows; rr++) {
                            for (let cc = 0; cc < this.cols; cc++) {
                                if (this.board[rr][cc] == target && !matched[rr][cc]) {
                                    matched[rr][cc] = true;
                                    changed = true;
                                }
                            }
                        }
                    }
                }
            }
        }

        let count = 0;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (matched[r][c] && this.board[r][c] >= 0) {
                    this.board[r][c] = -1;
                    this.special[r][c] = 0;
                    count++;
                }
            }
        }

        // a 4+ run creates a special tile where the run started
        if (spawnR >= 0) {
            this.board[spawnR][spawnC] = this.randColor();
            this.special[spawnR][spawnC] = spawnType;
        }

        return count;
    }

    // move every tile down one row when the cell below is empty (gravity anim)
    private gravityStep(): boolean {
        let moved = false;
        for (let c = 0; c < this.cols; c++) {
            for (let r = this.rows - 2; r >= 0; r--) {
                if (this.board[r][c] >= 0 && this.board[r + 1][c] < 0) {
                    this.board[r + 1][c] = this.board[r][c];
                    this.special[r + 1][c] = this.special[r][c];
                    this.board[r][c] = -1;
                    this.special[r][c] = 0;
                    moved = true;
                }
            }
        }
        return moved;
    }

    private refill() {
        for (let c = 0; c < this.cols; c++) {
            for (let r = 0; r < this.rows; r++) {
                if (this.board[r][c] < 0) {
                    this.board[r][c] = this.randColor();
                    this.special[r][c] = 0;
                }
            }
        }
    }

    private swapCells(a: number, b: number) {
        const ar = Math.floor(a / this.cols);
        const ac = a % this.cols;
        const br = Math.floor(b / this.cols);
        const bc = b % this.cols;
        const t = this.board[ar][ac];
        this.board[ar][ac] = this.board[br][bc];
        this.board[br][bc] = t;
        const s = this.special[ar][ac];
        this.special[ar][ac] = this.special[br][bc];
        this.special[br][bc] = s;
    }

    private trySwap(a: number, b: number) {
        this.swapCells(a, b);
        if (this.findMatches()) {
            this.moves++;
            this.cursor = b;
            this.resolving = true;
            this.playSfx(880, 40, 0);
        } else {
            this.swapCells(b, a);
            this.playSfx(220, 40, 0);
        }
    }

    private handleCellTap(idx: number) {
        if (this.phase != this.state.playing || this.resolving) {
            return;
        }
        if (this.selected < 0) {
            this.selected = idx;
            this.cursor = idx;
            this.playSfx(700, 12, 0);
            return;
        }
        if (idx == this.selected) {
            this.selected = -1;
            return;
        }
        const a = this.selected;
        const ar = Math.floor(a / this.cols);
        const ac = a % this.cols;
        const br = Math.floor(idx / this.cols);
        const bc = idx % this.cols;
        if (Math.abs(ar - br) + Math.abs(ac - bc) != 1) {
            this.selected = idx;
            this.cursor = idx;
            this.playSfx(700, 12, 0);
            return;
        }
        this.selected = -1;
        this.trySwap(a, idx);
    }

    private checkGoal() {
        if (this.score >= this.targetScore) {
            this.phase = this.state.win;
            this.playSfx(980, 150, 0);
        } else if (this.moves >= this.maxMoves) {
            this.phase = this.state.gameOver;
            this.playSfx(180, 200, 0);
        }
    }

    private moveCursor(dx: number, dy: number) {
        const x = this.cursor % this.cols;
        const y = Math.floor(this.cursor / this.cols);
        const nx = (x + dx + this.cols) % this.cols;
        const ny = (y + dy + this.rows) % this.rows;
        this.cursor = ny * this.cols + nx;
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
        // standalone scripts expose touch coords via touchState.x/.y
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

    private touchToIndex(x: number, y: number): number {
        const gx = Math.floor((x - this.ox) / this.cellW);
        const gy = Math.floor((y - this.oy) / this.cellH);
        if (gx < 0 || gx >= this.cols || gy < 0 || gy >= this.rows) {
            return -1;
        }
        return gy * this.cols + gx;
    }

    private applyTouchControl(event: number, touchState: any): boolean {
        if (!this.isTouchEvent(event)) {
            return false;
        }

        const pos = this.readTouchPosition(touchState);
        const idx = pos ? this.touchToIndex(pos.x, pos.y) : -1;

        if (this.phase == this.state.initial || this.phase == this.state.win || this.phase == this.state.gameOver) {
            if (event == EVT_TOUCH_TAP || event == EVT_TOUCH_FIRST) {
                this.setupBoard();
                this.pressed = true;
                return true;
            }
            return false;
        }

        if (event == EVT_TOUCH_BREAK) {
            this.pressed = false;
            return true;
        }

        if (idx >= 0) {
            this.cursor = idx;
            if (!this.pressed) {
                this.pressed = true;
                this.handleCellTap(idx);
            }
        }
        return true;
    }

    private onEvent(event: number, touchState: any) {
        if (this.applyTouchControl(event, touchState)) {
            return;
        }
        if (event == EVT_SYS_BREAK) {
            this.setupBoard();
            return;
        }
        if (this.phase == this.state.initial) {
            return;
        }
        if (event == EVT_VIRTUAL_PREV) {
            this.moveCursor(-1, 0);
        } else if (event == EVT_VIRTUAL_NEXT) {
            this.moveCursor(1, 0);
        } else if (event == EVT_TELEM_FIRST) {
            this.moveCursor(0, -1);
        } else if (event == EVT_VIRTUAL_NEXT_PAGE || event == EVT_VIRTUAL_PREV_PAGE) {
            this.moveCursor(0, 1);
        } else if (event == EVT_ENTER_BREAK || event == EVT_VIRTUAL_ENTER) {
            this.handleCellTap(this.cursor);
        }
    }

    private drawShape(cx: number, cy: number, sr: number, shape: number, color: number) {
        if (shape == 0) {
            lcd.drawFilledRectangle(cx - sr, cy - sr, sr * 2, sr * 2, color);
        } else if (shape == 1) {
            lcd.drawRectangle(cx - sr, cy - sr, sr * 2, sr * 2, color);
        } else if (shape == 2) {
            (lcd.drawFilledCircle as unknown as (x: number, y: number, r: number, flags?: number) => void)(cx, cy, sr, color);
        } else if (shape == 3) {
            (lcd.drawCircle as unknown as (x: number, y: number, r: number, flags?: number) => void)(cx, cy, sr, color);
        } else {
            (lcd.drawFilledTriangle as unknown as (
                x1: number,
                y1: number,
                x2: number,
                y2: number,
                x3: number,
                y3: number,
                flags?: number
            ) => void)(cx, cy - sr, cx + sr * 0.866, cy + sr * 0.5, cx - sr * 0.866, cy + sr * 0.5, color);
        }
    }

    private drawCell(r: number, c: number) {
        const px = this.ox + c * this.cellW;
        const py = this.oy + r * this.cellH;
        const color = this.board[r][c];
        const idx = r * this.cols + c;

        if (color < 0) {
            lcd.drawFilledRectangle(px + 1, py + 1, this.cellW - 2, this.cellH - 2, COLOR_THEME_SECONDARY3);
            return;
        }

        lcd.drawFilledRectangle(px + 1, py + 1, this.cellW - 2, this.cellH - 2, COLOR_THEME_SECONDARY3);
        const cx = px + this.cellW / 2;
        const cy = py + this.cellH / 2;
        const sr = Math.max(3, Math.floor(Math.min(this.cellW, this.cellH) * 0.3));
        this.drawShape(cx, cy, sr, color, this.colors[color]);

        const sp = this.special[r][c];
        if (sp == 1) {
            (lcd.drawCircle as unknown as (x: number, y: number, r: number, flags?: number) => void)(
                cx,
                cy,
                Math.max(4, Math.floor(sr * 1.1)),
                COLOR_THEME_PRIMARY1
            );
        } else if (sp == 2) {
            (lcd.drawFilledCircle as unknown as (x: number, y: number, r: number, flags?: number) => void)(
                cx,
                cy,
                Math.max(3, Math.floor(sr * 0.8)),
                COLOR_THEME_PRIMARY1
            );
        }

        if (idx == this.selected) {
            lcd.drawRectangle(px - 1, py - 1, this.cellW + 2, this.cellH + 2, COLOR_THEME_WARNING, 2);
        } else if (idx == this.cursor && !this.resolving) {
            lcd.drawRectangle(px - 1, py - 1, this.cellW + 2, this.cellH + 2, COLOR_THEME_PRIMARY1);
        }
    }

    private drawOverlay(text: string) {
        lcd.drawFilledRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_SECONDARY1, 1);
        lcd.drawRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_PRIMARY1, 2);
        lcd.drawText(this.w / 2, this.h / 2, text, COLOR_THEME_PRIMARY1 | CENTER | VCENTER | DBLSIZE);
    }

    private draw() {
        lcd.clear(COLOR_THEME_PRIMARY2);

        lcd.drawText(4, 3, `Score: ${this.score}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w / 2, 3, `Moves: ${this.maxMoves - this.moves}`, SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w - 4, 3, `Goal: ${this.targetScore}`, SMLSIZE | RIGHT | COLOR_THEME_PRIMARY1);

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                this.drawCell(r, c);
            }
        }

        if (this.phase == this.state.initial) {
            this.drawOverlay('MATCH3\nTap or SYS');
        } else if (this.phase == this.state.win) {
            this.drawOverlay(`YOU WIN! ${this.score}\nTap or SYS`);
        } else if (this.phase == this.state.gameOver) {
            this.drawOverlay(`MOVES OUT ${this.score}\nTap or SYS`);
        }
    }

    public run(event: number, touchState: any): number {
        if (event != null) {
            this.onEvent(event, touchState);
        }

        if (this.phase == this.state.playing) {
            if (this.settling) {
                if (!this.gravityStep()) {
                    this.refill();
                    this.settling = false;
                }
            } else if (this.resolving) {
                const count = this.clearMatches();
                if (count == 0) {
                    this.resolving = false;
                    this.checkGoal();
                } else {
                    this.score += count * 10;
                    this.playSfx(500 + Math.min(count, 8) * 30, 20, 0);
                    this.settling = true;
                }
            }
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
