interface Tile {
    id: number;
    revealed: boolean;
    removed: boolean;
}

class Game {
    private cols = 6;
    private rows = 4;
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

    private soundEnabled = true;

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
        this.cellW = Math.max(18, Math.floor((this.w - 30) / this.cols));
        this.cellH = Math.max(18, Math.floor((this.h - 60) / this.rows));
        const bw = this.cellW * this.cols;
        const bh = this.cellH * this.rows;
        this.ox = Math.floor((this.w - bw) / 2);
        this.oy = Math.floor((this.h - bh) / 2) + 10;
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
        if (id < 10) {
            return `${id}`;
        }
        return String.fromCharCode(55 + id);
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
            this.board.push({ id: values[i], revealed: false, removed: false });
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
        if (this.mismatchA >= 0) {
            this.board[this.mismatchA].revealed = false;
        }
        if (this.mismatchB >= 0) {
            this.board[this.mismatchB].revealed = false;
        }
        this.mismatchA = -1;
        this.mismatchB = -1;
        this.mismatchHideAt = 0;
    }

    private trySelect() {
        if (this.phase != this.state.playing || this.mismatchHideAt != 0) {
            return;
        }
        const t = this.board[this.cursor];
        if (t.removed || t.revealed) {
            return;
        }

        t.revealed = true;
        this.playSfx(760, 18, 0);

        if (this.selected < 0) {
            this.selected = this.cursor;
            return;
        }

        const a = this.board[this.selected];
        const b = t;
        if (a.id == b.id) {
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
            this.selected = -1;
            this.mismatchHideAt = getTime() + 20;
            this.playSfx(220, 60, 0);
        }
    }

    private onEvent(event: number) {
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

        if (t.revealed) {
            lcd.drawFilledRectangle(px + 1, py + 1, this.cellW - 2, this.cellH - 2, COLOR_THEME_SECONDARY1);
            lcd.drawText(px + this.cellW / 2, py + this.cellH / 2, this.labelFor(t.id), CENTER | VCENTER | SMLSIZE | COLOR_THEME_PRIMARY1);
        } else {
            lcd.drawFilledRectangle(px + 1, py + 1, this.cellW - 2, this.cellH - 2, COLOR_THEME_PRIMARY1);
            lcd.drawText(px + this.cellW / 2, py + this.cellH / 2, "?", CENTER | VCENTER | SMLSIZE | COLOR_THEME_PRIMARY2);
        }

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

        lcd.drawText(4, 4, `Pairs: ${this.matchedPairs}/${this.pairCount}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w - 4, 4, "SYS: Restart", SMLSIZE | COLOR_THEME_PRIMARY1 | RIGHT);

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
