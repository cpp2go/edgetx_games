declare function getLastPos(): LuaMultiReturn<[unknown, unknown]>;

class Game {
    private cols = 9;
    private rows = 9;
    private cell = 30;

    private board: number[][] = [];
    private solution: number[][] = [];
    private fixed: boolean[][] = [];

    private diffNames = ['EASY', 'MEDIUM', 'HARD'];
    private givensTarget = [40, 32, 26];
    private difficulty = 1;

    private mistakes = 0;
    private best = -1;
    private selected = -1;
    private cursor = 0;
    private pressed = false;
    private soundEnabled = true;

    private state = { initial: 0, playing: 1, win: 2 };
    private phase = this.state.initial;

    private hudTop = 22;
    private ox = 8;
    private oy = 24;

    private padX = 286;
    private padY = 24;
    private padW = 186;
    private padH = 270;
    private padCols = 3;
    private padRows = 4;

    constructor(private w: number, private h: number) {
        this.layout();
        this.makePuzzle();
        this.phase = this.state.initial;
    }

    // size the grid + number pad so they always fit the screen
    private layout() {
        const availH = this.h - this.hudTop - 2;
        const cellByH = Math.floor(availH / 9);
        const cellByW = Math.floor((this.w - 12 - 150) / 9);
        this.cell = Math.max(14, Math.min(cellByH, cellByW, 34));
        const grid = this.cell * 9;
        this.ox = 6;
        this.oy = this.hudTop + Math.max(0, Math.floor((availH - grid) / 2));
        this.padX = this.ox + grid + 6;
        this.padW = this.w - this.padX - 6;
        this.padY = this.oy;
        this.padH = grid;
    }

    private playSfx(freq: number, duration: number, pause: number = 0) {
        if (!this.soundEnabled) {
            return;
        }
        (playTone as unknown as (f: number, d: number, p: number) => void)(freq, duration, pause);
    }

    private emptyBoard(): number[][] {
        const b: number[][] = [];
        for (let r = 0; r < 9; r++) {
            const row: number[] = [];
            for (let c = 0; c < 9; c++) {
                row.push(0);
            }
            b.push(row);
        }
        return b;
    }

    private copyBoard(src: number[][]): number[][] {
        const b: number[][] = [];
        for (let r = 0; r < 9; r++) {
            const row: number[] = [];
            for (let c = 0; c < 9; c++) {
                row.push(src[r][c]);
            }
            b.push(row);
        }
        return b;
    }

    private candidates(board: number[][], r: number, c: number): boolean[] {
        const used: boolean[] = [];
        for (let i = 0; i < 10; i++) {
            used.push(false);
        }
        for (let k = 0; k < 9; k++) {
            used[board[r][k]] = true;
            used[board[k][c]] = true;
        }
        const br = Math.floor(r / 3) * 3;
        const bc = Math.floor(c / 3) * 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                used[board[br + i][bc + j]] = true;
            }
        }
        const res: boolean[] = [];
        for (let n = 1; n <= 9; n++) {
            res.push(!used[n]);
        }
        return res;
    }

    // pick the empty cell with fewest candidates (MRV) for fast solving
    private findEmpty(board: number[][]): { r: number; c: number } | null {
        let br = -1;
        let bc = -1;
        let bestCount = 10;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (board[r][c] != 0) {
                    continue;
                }
                const cand = this.candidates(board, r, c);
                let cnt = 0;
                for (let i = 0; i < 9; i++) {
                    if (cand[i]) {
                        cnt++;
                    }
                }
                if (cnt < bestCount) {
                    bestCount = cnt;
                    br = r;
                    bc = c;
                    if (cnt <= 1) {
                        return { r: br, c: bc };
                    }
                }
            }
        }
        if (br < 0) {
            return null;
        }
        return { r: br, c: bc };
    }

    // count solutions up to `limit` (mutates board, caller passes a copy)
    private countSolutions(board: number[][], limit: number): number {
        const pos = this.findEmpty(board);
        if (pos == null) {
            return 1;
        }
        const cand = this.candidates(board, pos.r, pos.c);
        let total = 0;
        for (let n = 1; n <= 9; n++) {
            if (!cand[n - 1]) {
                continue;
            }
            board[pos.r][pos.c] = n;
            total += this.countSolutions(board, limit);
            board[pos.r][pos.c] = 0;
            if (total >= limit) {
                break;
            }
        }
        return total;
    }

    private fillRandom(board: number[][]): boolean {
        const pos = this.findEmpty(board);
        if (pos == null) {
            return true;
        }
        const cand: number[] = [];
        const c = this.candidates(board, pos.r, pos.c);
        for (let n = 1; n <= 9; n++) {
            if (c[n - 1]) {
                cand.push(n);
            }
        }
        for (let i = cand.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = cand[i];
            cand[i] = cand[j];
            cand[j] = t;
        }
        for (let i = 0; i < cand.length; i++) {
            board[pos.r][pos.c] = cand[i];
            if (this.fillRandom(board)) {
                return true;
            }
            board[pos.r][pos.c] = 0;
        }
        return false;
    }

    private makePuzzle() {
        // generate a full solved board
        this.solution = this.emptyBoard();
        this.fillRandom(this.solution);
        this.board = this.copyBoard(this.solution);

        this.fixed = [];
        for (let r = 0; r < 9; r++) {
            const fr: boolean[] = [];
            for (let c = 0; c < 9; c++) {
                fr.push(true);
            }
            this.fixed.push(fr);
        }

        const target = this.givensTarget[this.difficulty];
        const cells: number[] = [];
        for (let i = 0; i < 81; i++) {
            cells.push(i);
        }
        for (let i = cells.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = cells[i];
            cells[i] = cells[j];
            cells[j] = t;
        }

        // remove cells while the puzzle keeps a unique solution
        let givens = 81;
        for (let k = 0; k < cells.length && givens > target; k++) {
            const idx = cells[k];
            const r = Math.floor(idx / 9);
            const c = idx % 9;
            const save = this.board[r][c];
            this.board[r][c] = 0;
            const probe = this.copyBoard(this.board);
            if (this.countSolutions(probe, 2) == 1) {
                this.fixed[r][c] = false;
                givens--;
            } else {
                this.board[r][c] = save;
            }
        }

        this.mistakes = 0;
        this.selected = -1;
        this.cursor = 0;
        this.pressed = false;
        this.phase = this.state.playing;
        this.playSfx(880, 80, 0);
    }

    private isConflict(r: number, c: number, n: number): boolean {
        for (let k = 0; k < 9; k++) {
            if (k != c && this.board[r][k] == n) {
                return true;
            }
            if (k != r && this.board[k][c] == n) {
                return true;
            }
        }
        const br = Math.floor(r / 3) * 3;
        const bc = Math.floor(c / 3) * 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                const rr = br + i;
                const cc = bc + j;
                if ((rr != r || cc != c) && this.board[rr][cc] == n) {
                    return true;
                }
            }
        }
        return false;
    }

    private isSolved(): boolean {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (this.board[r][c] == 0) {
                    return false;
                }
            }
        }
        return true;
    }

    private finishWin() {
        this.phase = this.state.win;
        if (this.best < 0 || this.mistakes < this.best) {
            this.best = this.mistakes;
        }
        this.playSfx(980, 200, 0);
    }

    private tryPlace(idx: number, n: number) {
        if (idx < 0 || n < 1 || n > 9) {
            return;
        }
        const r = Math.floor(idx / 9);
        const c = idx % 9;
        if (this.fixed[r][c]) {
            this.playSfx(220, 40, 0);
            return;
        }
        if (this.isConflict(r, c, n)) {
            this.mistakes++;
            this.playSfx(180, 60, 0);
            return;
        }
        this.board[r][c] = n;
        this.playSfx(760, 20, 0);
        if (this.isSolved()) {
            this.finishWin();
        }
    }

    private clearCell(idx: number) {
        if (idx < 0) {
            return;
        }
        const r = Math.floor(idx / 9);
        const c = idx % 9;
        if (this.fixed[r][c]) {
            this.playSfx(220, 40, 0);
            return;
        }
        if (this.board[r][c] != 0) {
            this.board[r][c] = 0;
            this.playSfx(520, 16, 0);
        }
    }

    private giveHint() {
        const empty: number[] = [];
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (!this.fixed[r][c] && this.board[r][c] == 0) {
                    empty.push(r * 9 + c);
                }
            }
        }
        if (empty.length == 0) {
            this.playSfx(220, 40, 0);
            return;
        }
        const idx = empty[Math.floor(Math.random() * empty.length)];
        const r = Math.floor(idx / 9);
        const c = idx % 9;
        this.board[r][c] = this.solution[r][c];
        this.playSfx(820, 30, 0);
        if (this.isSolved()) {
            this.finishWin();
        }
    }

    private moveCursor(dx: number, dy: number) {
        const c = this.cursor % 9;
        const r = Math.floor(this.cursor / 9);
        const nc = (c + dx + 9) % 9;
        const nr = (r + dy + 9) % 9;
        this.cursor = nr * 9 + nc;
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

    private gridHit(x: number, y: number): number {
        const gx = Math.floor((x - this.ox) / this.cell);
        const gy = Math.floor((y - this.oy) / this.cell);
        if (gx < 0 || gx >= 9 || gy < 0 || gy >= 9) {
            return -1;
        }
        return gy * 9 + gx;
    }

    private padHit(x: number, y: number): { kind: string; value: number } | null {
        if (x < this.padX || x >= this.padX + this.padW || y < this.padY || y >= this.padY + this.padH) {
            return null;
        }
        const pw = this.padW / this.padCols;
        const ph = this.padH / this.padRows;
        const c = Math.floor((x - this.padX) / pw);
        const r = Math.floor((y - this.padY) / ph);
        if (c < 0 || c >= this.padCols || r < 0 || r >= this.padRows) {
            return null;
        }
        if (r < 3) {
            return { kind: 'num', value: r * 3 + c + 1 };
        }
        const cmds = ['clear', 'hint', 'new'];
        return { kind: cmds[c], value: 0 };
    }

    private applyTouchControl(event: number, touchState: any): boolean {
        if (!this.isTouchEvent(event)) {
            return false;
        }

        const pos = this.readTouchPosition(touchState);
        if (pos == null) {
            return false;
        }

        if (this.phase == this.state.initial || this.phase == this.state.win) {
            if (event == EVT_TOUCH_TAP || event == EVT_TOUCH_FIRST) {
                this.makePuzzle();
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

        const pad = this.padHit(pos.x, pos.y);
        if (pad != null) {
            if (pad.kind == 'num') {
                if (this.selected >= 0) {
                    this.tryPlace(this.selected, pad.value);
                } else {
                    this.playSfx(220, 30, 0);
                }
            } else if (pad.kind == 'clear') {
                if (this.selected >= 0) {
                    this.clearCell(this.selected);
                }
            } else if (pad.kind == 'hint') {
                this.giveHint();
            } else if (pad.kind == 'new') {
                this.makePuzzle();
            }
            this.pressed = true;
            return true;
        }

        const idx = this.gridHit(pos.x, pos.y);
        if (idx >= 0) {
            this.selected = idx;
            this.cursor = idx;
            this.playSfx(700, 10, 0);
        }
        this.pressed = true;
        return true;
    }

    private onEvent(event: number, touchState: any) {
        if (this.applyTouchControl(event, touchState)) {
            return;
        }

        if (event == EVT_SYS_BREAK) {
            this.makePuzzle();
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
                this.makePuzzle();
            }
            return;
        }

        if (this.phase == this.state.win) {
            if (event == EVT_ENTER_BREAK || event == EVT_VIRTUAL_ENTER) {
                this.makePuzzle();
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
            const r = Math.floor(this.cursor / 9);
            const c = this.cursor % 9;
            if (this.fixed[r][c]) {
                this.playSfx(220, 30, 0);
            } else if (this.selected == this.cursor) {
                this.selected = -1;
            } else {
                this.selected = this.cursor;
                this.playSfx(700, 10, 0);
            }
        } else if (event == EVT_EXIT_BREAK || event == EVT_VIRTUAL_EXIT) {
            this.clearCell(this.cursor);
        } else if (event == EVT_PLUS_FIRST || event == EVT_VIRTUAL_INC) {
            if (this.selected >= 0) {
                const cur = this.board[Math.floor(this.selected / 9)][this.selected % 9];
                this.tryPlace(this.selected, cur == 9 ? 1 : cur + 1);
            }
        } else if (event == EVT_MINUS_FIRST || event == EVT_VIRTUAL_DEC) {
            if (this.selected >= 0) {
                const cur = this.board[Math.floor(this.selected / 9)][this.selected % 9];
                this.tryPlace(this.selected, cur <= 1 ? 9 : cur - 1);
            }
        }
    }

    private numSize(): number {
        if (this.cell >= 26) {
            return DBLSIZE;
        }
        if (this.cell >= 20) {
            return MIDSIZE;
        }
        return SMLSIZE;
    }

    private drawHud() {
        lcd.drawText(4, 3, `SUDOKU ${this.diffNames[this.difficulty]}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w / 2, 3, `Errors: ${this.mistakes}`, SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        const best = this.best < 0 ? '-' : `${this.best}`;
        lcd.drawText(this.w - 4, 3, `Best: ${best}`, SMLSIZE | RIGHT | COLOR_THEME_PRIMARY1);
    }

    private drawCell(r: number, c: number) {
        const px = this.ox + c * this.cell;
        const py = this.oy + r * this.cell;
        const v = this.board[r][c];
        const idx = r * 9 + c;

        if (this.fixed[r][c]) {
            lcd.drawFilledRectangle(px + 1, py + 1, this.cell - 2, this.cell - 2, COLOR_THEME_SECONDARY1);
        } else {
            lcd.drawFilledRectangle(px + 1, py + 1, this.cell - 2, this.cell - 2, COLOR_THEME_SECONDARY3);
        }

        if (v != 0) {
            const col = this.fixed[r][c] ? COLOR_THEME_PRIMARY1 : COLOR_THEME_ACTIVE;
            lcd.drawText(px + this.cell / 2, py + this.cell / 2, `${v}`, this.numSize() | CENTER | VCENTER | col);
        }

        if (idx == this.selected) {
            lcd.drawRectangle(px - 1, py - 1, this.cell + 2, this.cell + 2, COLOR_THEME_WARNING, 2);
        } else if (idx == this.cursor && this.phase == this.state.playing) {
            lcd.drawRectangle(px - 1, py - 1, this.cell + 2, this.cell + 2, COLOR_THEME_PRIMARY1);
        }
    }

    private drawGrid() {
        const line = lcd.drawLine as unknown as (
            x1: number,
            y1: number,
            x2: number,
            y2: number,
            pattern: number,
            flags?: number
        ) => void;
        const gx = this.ox;
        const gy = this.oy;
        const size = this.cell * 9;
        for (let i = 1; i < 9; i++) {
            if (i % 3 == 0) {
                continue;
            }
            const x = gx + i * this.cell;
            const y = gy + i * this.cell;
            line(x, gy, x, gy + size, SOLID, COLOR_THEME_PRIMARY3);
            line(gx, y, gx + size, y, SOLID, COLOR_THEME_PRIMARY3);
        }
        // 3x3 box borders (2px)
        for (let i = 0; i <= 3; i++) {
            const x = gx + i * this.cell * 3;
            const y = gy + i * this.cell * 3;
            lcd.drawFilledRectangle(x, gy, 2, size, COLOR_THEME_PRIMARY1);
            lcd.drawFilledRectangle(gx, y, size, 2, COLOR_THEME_PRIMARY1);
        }
    }

    private drawPadButton(x: number, y: number, w: number, h: number, label: string, color: number, size: number) {
        lcd.drawFilledRectangle(x, y, w, h, COLOR_THEME_SECONDARY3);
        lcd.drawRectangle(x, y, w, h, COLOR_THEME_SECONDARY1);
        lcd.drawText(x + w / 2, y + h / 2, label, size | CENTER | VCENTER | color);
    }

    private drawPad() {
        const pw = this.padW / this.padCols;
        const ph = this.padH / this.padRows;
        for (let r = 0; r < this.padRows; r++) {
            for (let c = 0; c < this.padCols; c++) {
                const x = this.padX + c * pw;
                const y = this.padY + r * ph;
                const w = pw - 3;
                const h = ph - 3;
                if (r < 3) {
                    const n = r * 3 + c + 1;
                    this.drawPadButton(x, y, w, h, `${n}`, COLOR_THEME_PRIMARY1, this.numSize());
                } else {
                    const cmds = ['C', 'H', 'N'];
                    const colors = [COLOR_THEME_WARNING, COLOR_THEME_ACTIVE, COLOR_THEME_PRIMARY1];
                    const cmdSize = this.cell >= 26 ? MIDSIZE : SMLSIZE;
                    this.drawPadButton(x, y, w, h, cmds[c], colors[c], cmdSize);
                }
            }
        }
    }

    private drawOverlay(text: string) {
        lcd.drawFilledRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_SECONDARY1, 1);
        lcd.drawRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_PRIMARY1, 2);
        lcd.drawText(this.w / 2, this.h / 2, text, COLOR_THEME_PRIMARY1 | CENTER | VCENTER | DBLSIZE);
    }

    private draw() {
        lcd.clear(COLOR_THEME_PRIMARY2);
        this.drawHud();
        this.drawGrid();
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                this.drawCell(r, c);
            }
        }
        this.drawPad();

        if (this.phase == this.state.initial) {
            this.drawOverlay(`SUDOKU\nDifficulty: ${this.diffNames[this.difficulty]}\n+/- change  SYS start`);
        } else if (this.phase == this.state.win) {
            this.drawOverlay(`SOLVED! Errors: ${this.mistakes}\nTap or SYS`);
        }
    }

    public run(event: number, touchState: any): number {
        if (event != null) {
            this.onEvent(event, touchState);
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
