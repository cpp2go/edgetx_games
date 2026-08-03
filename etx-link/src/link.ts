interface Tile {
    id: number;
    removed: boolean;
}

declare function getLastPos(): LuaMultiReturn<[unknown, unknown]>;

class Game {
    private cols = 12;
    private rows = 8;
    private pairCount = (this.cols * this.rows) / 2;

    private board: Tile[] = [];
    private cursor = 0;
    private selected = -1;
    private mismatchA = -1;
    private mismatchB = -1;
    private mismatchHideAt = 0;

    private matchedPairs = 0;
    private state = { initial: 0, playing: 1, win: 2 };
    private phase = this.state.initial;

    private cellW = 20;
    private cellH = 20;
    private ox = 0;
    private oy = 0;
    private lastTouchIdx = -1;

    private soundEnabled = true;
    private dirs = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
    ];

    constructor(private w: number, private h: number) {
        this.layout();
    }

    private playSfx(freq: number, duration: number, pause: number = 0) {
        if (!this.soundEnabled) {
            return;
        }
        (playTone as unknown as (f: number, d: number, p: number) => void)(freq, duration, pause);
    }

    private layout() {
        this.cellW = Math.max(14, Math.floor(this.w / this.cols));
        this.cellH = Math.max(14, Math.floor(this.h / this.rows));
        const bw = this.cellW * this.cols;
        const bh = this.cellH * this.rows;
        this.ox = Math.floor((this.w - bw) / 2);
        this.oy = Math.floor((this.h - bh) / 2);
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

    private touchToIndex(x: number, y: number): number {
        const gx = Math.floor((x - this.ox) / this.cellW);
        const gy = Math.floor((y - this.oy) / this.cellH);
        if (gx < 0 || gx >= this.cols || gy < 0 || gy >= this.rows) {
            return -1;
        }
        return gy * this.cols + gx;
    }

    private applyTouchControl(event: number): boolean {
        if (!this.isTouchEvent(event)) {
            return false;
        }

        const pos = this.readTouchPosition();
        const idx = pos ? this.touchToIndex(pos.x, pos.y) : -1;

        if (event == EVT_TOUCH_BREAK) {
            this.lastTouchIdx = -1;
            return false;
        }

        if (this.phase == this.state.initial) {
            if (event == EVT_TOUCH_TAP || event == EVT_TOUCH_FIRST) {
                this.setupBoard();
                this.playSfx(860, 25, 0);
                return true;
            }
            return false;
        }

        if (idx >= 0) {
            this.cursor = idx;
        }

        if (this.phase != this.state.playing || idx < 0) {
            return false;
        }

        if (event == EVT_TOUCH_TAP || (event == EVT_TOUCH_FIRST && idx != this.lastTouchIdx)) {
            this.trySelect();
            this.lastTouchIdx = idx;
            return true;
        }

        if (event == EVT_TOUCH_SLIDE) {
            this.lastTouchIdx = idx;
            return true;
        }

        return false;
    }

    private shuffle(values: number[]): number[] {
        for (let i = values.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = values[i];
            values[i] = values[j];
            values[j] = t;
        }
        return values;
    }

    private labelFor(id: number): string {
        return `${id}`;
    }

    private setupBoard() {
        const values: number[] = [];
        for (let i = 0; i < this.pairCount; i++) {
            values.push(i + 1);
            values.push(i + 1);
        }
        this.shuffle(values);

        this.board = [];
        for (let i = 0; i < values.length; i++) {
            this.board.push({ id: values[i], removed: false });
        }
        this.cursor = 0;
        this.selected = -1;
        this.mismatchA = -1;
        this.mismatchB = -1;
        this.mismatchHideAt = 0;
        this.matchedPairs = 0;
        this.phase = this.state.playing;
        this.playSfx(880, 80, 0);
    }

    private moveCursor(dx: number, dy: number) {
        const x = this.cursor % this.cols;
        const y = Math.floor(this.cursor / this.cols);
        const nx = (x + dx + this.cols) % this.cols;
        const ny = (y + dy + this.rows) % this.rows;
        this.cursor = ny * this.cols + nx;
        this.playSfx(700, 8, 0);
    }

    private processMismatchTimeout(now: number) {
        if (this.mismatchHideAt == 0 || now < this.mismatchHideAt) {
            return;
        }
        this.mismatchA = -1;
        this.mismatchB = -1;
        this.mismatchHideAt = 0;
    }

    private idxToCoord(idx: number): { x: number; y: number } {
        return { x: idx % this.cols, y: Math.floor(idx / this.cols) };
    }

    private canConnect(idxA: number, idxB: number): boolean {
        const a = this.idxToCoord(idxA);
        const b = this.idxToCoord(idxB);

        const w = this.cols + 2;
        const h = this.rows + 2;

        const blocked: boolean[][] = [];
        for (let x = 0; x < w; x++) {
            const row: boolean[] = [];
            for (let y = 0; y < h; y++) {
                row.push(false);
            }
            blocked.push(row);
        }

        for (let i = 0; i < this.board.length; i++) {
            const t = this.board[i];
            if (t.removed) {
                continue;
            }
            if (i == idxA || i == idxB) {
                continue;
            }
            const c = this.idxToCoord(i);
            blocked[c.x + 1][c.y + 1] = true;
        }

        const sx = a.x + 1;
        const sy = a.y + 1;
        const ex = b.x + 1;
        const ey = b.y + 1;

        type State = { x: number; y: number; dir: number; turns: number };
        const queue: State[] = [];
        let head = 0;

        const INF = 99;
        const visited: number[][][] = [];
        for (let x = 0; x < w; x++) {
            const vx: number[][] = [];
            for (let y = 0; y < h; y++) {
                vx.push([INF, INF, INF, INF]);
            }
            visited.push(vx);
        }

        for (let d = 0; d < this.dirs.length; d++) {
            visited[sx][sy][d] = 0;
            queue.push({ x: sx, y: sy, dir: d, turns: 0 });
        }

        while (head < queue.length) {
            const cur = queue[head];
            head++;

            for (let nd = 0; nd < this.dirs.length; nd++) {
                const nt = cur.turns + (nd == cur.dir ? 0 : 1);
                if (nt > 2) {
                    continue;
                }

                const nx = cur.x + this.dirs[nd].x;
                const ny = cur.y + this.dirs[nd].y;
                if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
                    continue;
                }

                if (blocked[nx][ny]) {
                    continue;
                }

                if (visited[nx][ny][nd] <= nt) {
                    continue;
                }

                if (nx == ex && ny == ey) {
                    return true;
                }

                visited[nx][ny][nd] = nt;
                queue.push({ x: nx, y: ny, dir: nd, turns: nt });
            }
        }

        return false;
    }

    private trySelect() {
        if (this.phase != this.state.playing || this.mismatchHideAt != 0) {
            return;
        }
        const t = this.board[this.cursor];
        if (t.removed) {
            return;
        }

        if (this.selected < 0) {
            this.selected = this.cursor;
            this.playSfx(760, 18, 0);
            return;
        }

        if (this.selected == this.cursor) {
            return;
        }

        const a = this.board[this.selected];
        const b = t;
        if (a.id == b.id && this.canConnect(this.selected, this.cursor)) {
            a.removed = true;
            b.removed = true;
            this.selected = -1;
            this.matchedPairs += 1;
            this.playSfx(500, 60, 0);
            if (this.matchedPairs >= this.pairCount) {
                this.phase = this.state.win;
                this.playSfx(980, 120, 0);
            }
        } else {
            this.mismatchA = this.selected;
            this.mismatchB = this.cursor;
            this.selected = this.cursor;
            this.mismatchHideAt = getTime() + 12;
            this.playSfx(220, 60, 0);
        }
    }

    private onEvent(event: number) {
        if (this.applyTouchControl(event)) {
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
            this.trySelect();
        }
    }

    private drawTile(i: number) {
        const x = i % this.cols;
        const y = Math.floor(i / this.cols);
        const px = this.ox + x * this.cellW;
        const py = this.oy + y * this.cellH;
        const t = this.board[i];

        if (t.removed) {
            lcd.drawFilledRectangle(px + 1, py + 1, this.cellW - 2, this.cellH - 2, COLOR_THEME_SECONDARY3);
            return;
        }

        let fill = COLOR_THEME_SECONDARY1;
        if (i == this.selected) {
            fill = COLOR_THEME_WARNING;
        } else if (i == this.mismatchA || i == this.mismatchB) {
            fill = COLOR_THEME_PRIMARY3;
        }
        lcd.drawFilledRectangle(px + 1, py + 1, this.cellW - 2, this.cellH - 2, fill);
        lcd.drawText(px + this.cellW / 2, py + this.cellH / 2, this.labelFor(t.id), CENTER | VCENTER | SMLSIZE | COLOR_THEME_PRIMARY1);

        lcd.drawRectangle(px, py, this.cellW, this.cellH, COLOR_THEME_PRIMARY1);

        if (i == this.cursor) {
            lcd.drawRectangle(px - 1, py - 1, this.cellW + 2, this.cellH + 2, COLOR_THEME_WARNING);
        }
    }

    private drawOverlay(text: string) {
        lcd.drawFilledRectangle(18, 18, this.w - 36, this.h - 36, COLOR_THEME_SECONDARY1, 1);
        lcd.drawRectangle(18, 18, this.w - 36, this.h - 36, COLOR_THEME_PRIMARY1, 2);
        lcd.drawText(this.w / 2, this.h / 2, text, COLOR_THEME_PRIMARY1 | CENTER | VCENTER | DBLSIZE);
    }

    private draw() {
        lcd.clear(COLOR_THEME_PRIMARY2);

        lcd.drawText(4, 3, `Pairs: ${this.matchedPairs}/${this.pairCount}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w - 4, 3, 'Tap 2 same + path<=2 turns', SMLSIZE | COLOR_THEME_PRIMARY1 | RIGHT);

        for (let i = 0; i < this.board.length; i++) {
            this.drawTile(i);
        }

        if (this.phase == this.state.initial) {
            this.drawOverlay("LINK\nPress SYS");
        } else if (this.phase == this.state.win) {
            this.drawOverlay("YOU WIN\nPress SYS");
        }
    }

    public run(event: number, touchState: any): number {
        if (event != null) {
            this.onEvent(event);
        }

        this.processMismatchTimeout(getTime());
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
