declare function getLastPos(): LuaMultiReturn<[unknown, unknown]>;
declare const current_path: string;

interface Bomb {
    r: number;
    c: number;
    timer: number;
    power: number;
}

interface Flame {
    r: number;
    c: number;
    timer: number;
}

interface Powerup {
    r: number;
    c: number;
    type: number;
}

interface Enemy {
    r: number;
    c: number;
    fr: number;
    fc: number;
    tr: number;
    tc: number;
    prog: number;
    moving: boolean;
    dir: number;
    dead: boolean;
}

interface Player {
    r: number;
    c: number;
    fr: number;
    fc: number;
    tr: number;
    tc: number;
    prog: number;
    moving: boolean;
}

class Game {
    private cols = 13;
    private rows = 9;
    private cell = 32;

    // 0 open, 1 wall, 2 brick
    private grid: number[][] = [];
    private bombs: Bomb[] = [];
    private flames: Flame[] = [];
    private powerups: Powerup[] = [];
    private enemies: Enemy[] = [];
    private player: Player = { r: 1, c: 1, fr: 1, fc: 1, tr: 1, tc: 1, prog: 0, moving: false };

    private dirs = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
    ];

    private diffNames = ['EASY', 'MEDIUM', 'HARD'];
    private diffEnemies = [3, 4, 5];
    private difficulty = 1;

    private bombCount = 1;
    private bombPower = 1;
    private speedBoost = 1;
    private moveSpeed = 0.045;
    private enemySpeed = 0.02;
    private bombFuse = 200;
    private flameTime = 40;

    private hudTop = 22;
    private ox = 0;
    private oy = 0;

    private tickCs = 1;
    private lastTick = 0;
    private pressed = false;
    private soundEnabled = true;

    private enemyImg: Bitmap | null = null;
    private bombImg: Bitmap | null = null;
    private playerImg: Bitmap | null = null;

    private state = { initial: 0, playing: 1, win: 2, gameOver: 3 };
    private phase = this.state.initial;

    constructor(private w: number, private h: number) {
        this.enemyImg = this.loadImage('enemy.png');
        this.bombImg = this.loadImage('bomb.png');
        this.playerImg = this.loadImage('player.png');
        this.newGame();
        this.phase = this.state.initial;
        this.lastTick = getTime();
    }

    private playSfx(freq: number, duration: number, pause: number = 0) {
        if (!this.soundEnabled) {
            return;
        }
        (playTone as unknown as (f: number, d: number, p: number) => void)(freq, duration, pause);
    }

    // play a WAV from the SOUNDS folder; fall back to a tone if not found
    private playSfxFile(file: string, freq: number, duration: number) {
        if (!this.soundEnabled) {
            return;
        }
        const tries = [
            `./SOUNDS/bomber/${file}`,
            `/SOUNDS/bomber/${file}`,
            `./SOUNDS/en/${file}`,
            `./SOUNDS/${file}`,
            `/SOUNDS/en/${file}`,
            `/SOUNDS/${file}`,
        ];
        for (let i = 0; i < tries.length; i++) {
            const ok = (playFile as unknown as (p: string) => boolean)(tries[i]);
            if (ok) {
                return;
            }
        }
        (playTone as unknown as (f: number, d: number, p: number) => void)(freq, duration, 0);
    }

    private loadImage(name: string): Bitmap | null {
        const tries = [
            `./IMAGES/${name}`,
            `/SCRIPTS/IMAGES/${name}`,
            `/IMAGES/${name}`,
        ];
        for (let i = 0; i < tries.length; i++) {
            const b = Bitmap.open(tries[i]);
            if (b != null) {
                return b;
            }
        }
        return null;
    }

    private drawCenteredBitmap(bmp: Bitmap, cx: number, cy: number) {
        const [iw, ih] = Bitmap.getSize(bmp);
        const s = Math.max(20, Math.floor((this.cell * 100) / Math.max(1, iw)));
        lcd.drawBitmap(bmp, Math.floor(cx - (iw * s) / 200), Math.floor(cy - (ih * s) / 200), s);
    }

    private layout() {
        const availH = this.h - this.hudTop - 4;
        const cw = Math.floor((this.w - 8) / this.cols);
        const ch = Math.floor(availH / this.rows);
        this.cell = Math.max(12, Math.min(cw, ch, 40));
        this.ox = Math.floor((this.w - this.cell * this.cols) / 2);
        this.oy = this.hudTop + Math.floor((availH - this.cell * this.rows) / 2);
    }

    private newGame() {
        this.layout();
        const enemyCount = this.diffEnemies[this.difficulty];

        // build grid
        this.grid = [];
        for (let r = 0; r < this.rows; r++) {
            const row: number[] = [];
            for (let c = 0; c < this.cols; c++) {
                row.push(0);
            }
            this.grid.push(row);
        }

        // outer walls
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (r == 0 || r == this.rows - 1 || c == 0 || c == this.cols - 1) {
                    this.grid[r][c] = 1;
                }
            }
        }
        // checkerboard solid blocks
        for (let r = 2; r < this.rows - 1; r += 2) {
            for (let c = 2; c < this.cols - 1; c += 2) {
                this.grid[r][c] = 1;
            }
        }

        // keep spawn areas open
        const spawns = [
            [1, 1],
            [this.rows - 2, this.cols - 2],
            [1, this.cols - 2],
            [this.rows - 2, 1],
        ];
        for (let k = 0; k < spawns.length; k++) {
            const sr = spawns[k][0];
            const sc = spawns[k][1];
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const rr = sr + dr;
                    const cc = sc + dc;
                    if (rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols && this.grid[rr][cc] != 1) {
                        this.grid[rr][cc] = 0;
                    }
                }
            }
        }

        // bricks
        const brickChance = 0.45 + this.difficulty * 0.05;
        for (let r = 1; r < this.rows - 1; r++) {
            for (let c = 1; c < this.cols - 1; c++) {
                if (this.grid[r][c] != 0) {
                    continue;
                }
                if (Math.random() < brickChance) {
                    this.grid[r][c] = 2;
                }
            }
        }

        // player
        this.player = { r: 1, c: 1, fr: 1, fc: 1, tr: 1, tc: 1, prog: 0, moving: false };

        // enemies
        this.enemies = [];
        for (let k = 0; k < enemyCount; k++) {
            let sr = -1;
            let sc = -1;
            if (k < spawns.length - 1) {
                sr = spawns[k + 1][0];
                sc = spawns[k + 1][1];
            } else {
                for (let g = 0; g < 200; g++) {
                    const rr = 1 + Math.floor(Math.random() * (this.rows - 2));
                    const cc = 1 + Math.floor(Math.random() * (this.cols - 2));
                    if (this.grid[rr][cc] == 0 && !(Math.abs(rr - 1) <= 1 && Math.abs(cc - 1) <= 1)) {
                        sr = rr;
                        sc = cc;
                        break;
                    }
                }
            }
            if (sr < 0) {
                continue;
            }
            this.enemies.push({
                r: sr,
                c: sc,
                fr: sr,
                fc: sc,
                tr: sr,
                tc: sc,
                prog: 0,
                moving: false,
                dir: Math.floor(Math.random() * 4),
                dead: false,
            });
        }

        this.bombs = [];
        this.flames = [];
        this.powerups = [];
        this.bombCount = 1;
        this.bombPower = 1;
        this.speedBoost = 1;
        this.enemySpeed = 0.02 + this.difficulty * 0.005;
        this.pressed = false;
        this.phase = this.state.playing;
        this.playSfxFile('start.wav', 880, 80);
    }

    private bombAt(r: number, c: number): boolean {
        for (let i = 0; i < this.bombs.length; i++) {
            if (this.bombs[i].r == r && this.bombs[i].c == c) {
                return true;
            }
        }
        return false;
    }

    private canWalk(r: number, c: number): boolean {
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) {
            return false;
        }
        if (this.grid[r][c] != 0) {
            return false;
        }
        if (this.bombAt(r, c)) {
            return false;
        }
        return true;
    }

    private cellHasFlame(r: number, c: number): boolean {
        for (let i = 0; i < this.flames.length; i++) {
            if (this.flames[i].r == r && this.flames[i].c == c) {
                return true;
            }
        }
        return false;
    }

    private attemptMove(dr: number, dc: number) {
        if (this.phase != this.state.playing) {
            return;
        }
        if (this.player.moving) {
            return;
        }
        const nr = this.player.r + dr;
        const nc = this.player.c + dc;
        if (dr == 0 && dc == 0) {
            return;
        }
        if (!this.canWalk(nr, nc)) {
            return;
        }
        this.player.fr = this.player.r;
        this.player.fc = this.player.c;
        this.player.tr = nr;
        this.player.tc = nc;
        this.player.r = nr;
        this.player.c = nc;
        this.player.prog = 0;
        this.player.moving = true;
    }

    private placeBomb() {
        if (this.phase != this.state.playing) {
            return;
        }
        if (this.bombs.length >= this.bombCount) {
            this.playSfx(220, 30, 0);
            return;
        }
        if (this.bombAt(this.player.r, this.player.c)) {
            return;
        }
        this.bombs.push({ r: this.player.r, c: this.player.c, timer: this.bombFuse, power: this.bombPower });
        this.playSfxFile('place.wav', 700, 30);
    }

    private maybeSpawnPowerup(r: number, c: number) {
        if (Math.random() < 0.35) {
            this.powerups.push({ r: r, c: c, type: Math.floor(Math.random() * 3) });
        }
    }

    private explode(r: number, c: number, power: number) {
        this.flames.push({ r: r, c: c, timer: this.flameTime });
        this.playSfxFile('boom.wav', 400, 60);

        // chain at the centre cell
        for (let i = this.bombs.length - 1; i >= 0; i--) {
            if (this.bombs[i].r == r && this.bombs[i].c == c) {
                const b = this.bombs.splice(i, 1)[0];
                this.explode(r, c, b.power);
                return;
            }
        }

        for (let d = 0; d < 4; d++) {
            const dr = this.dirs[d][0];
            const dc = this.dirs[d][1];
            for (let step = 1; step <= power; step++) {
                const rr = r + dr * step;
                const cc = c + dc * step;
                if (rr < 0 || rr >= this.rows || cc < 0 || cc >= this.cols) {
                    break;
                }
                const t = this.grid[rr][cc];
                if (t == 1) {
                    break;
                }
                this.flames.push({ r: rr, c: cc, timer: this.flameTime });
                // chain through other bombs
                for (let i = this.bombs.length - 1; i >= 0; i--) {
                    if (this.bombs[i].r == rr && this.bombs[i].c == cc) {
                        const b = this.bombs.splice(i, 1)[0];
                        this.explode(rr, cc, b.power);
                    }
                }
                if (t == 2) {
                    this.grid[rr][cc] = 0;
                    this.maybeSpawnPowerup(rr, cc);
                    break;
                }
            }
        }
    }

    private updateBombs() {
        for (let i = 0; i < this.bombs.length; i++) {
            this.bombs[i].timer--;
        }
        for (let i = this.bombs.length - 1; i >= 0; i--) {
            if (this.bombs[i].timer <= 0) {
                const b = this.bombs.splice(i, 1)[0];
                this.explode(b.r, b.c, b.power);
            }
        }
    }

    private updateFlames() {
        for (let i = this.flames.length - 1; i >= 0; i--) {
            this.flames[i].timer--;
            if (this.flames[i].timer <= 0) {
                this.flames.splice(i, 1);
            }
        }
    }

    private randomWalkableDir(e: Enemy, fallback: number): number {
        const opts: number[] = [];
        for (let i = 0; i < 4; i++) {
            if (this.canWalk(e.r + this.dirs[i][0], e.c + this.dirs[i][1])) {
                opts.push(i);
            }
        }
        if (opts.length == 0) {
            return fallback;
        }
        return opts[Math.floor(Math.random() * opts.length)];
    }

    // opposite of a direction index (dirs = up, down, left, right)
    private oppositeDir(d: number): number {
        if (d == 0) {
            return 1;
        }
        if (d == 1) {
            return 0;
        }
        if (d == 2) {
            return 3;
        }
        return 2;
    }

    // patrol with corner/intersection turning: walk straight, turn at corners,
    // and reverse only at true dead ends
    private pickEnemyDir(e: Enemy): number {
        const fwd = e.dir;
        const dr = this.dirs[fwd][0];
        const dc = this.dirs[fwd][1];
        const fwdOk = this.canWalk(e.r + dr, e.c + dc);
        const back = this.oppositeDir(fwd);

        // open side (left/right) directions
        const sides: number[] = [];
        for (let d = 0; d < 4; d++) {
            if (d == fwd || d == back) {
                continue;
            }
            if (this.canWalk(e.r + this.dirs[d][0], e.c + this.dirs[d][1])) {
                sides.push(d);
            }
        }

        if (fwdOk) {
            // intersection: sometimes take a side turn to explore the maze
            if (sides.length > 0 && Math.random() < 0.35) {
                return sides[Math.floor(Math.random() * sides.length)];
            }
            return fwd;
        }

        // forward blocked: turn into a side (corner / T junction)
        if (sides.length > 0) {
            return sides[Math.floor(Math.random() * sides.length)];
        }

        // true dead end: turn around and walk back
        if (this.canWalk(e.r + this.dirs[back][0], e.c + this.dirs[back][1])) {
            return back;
        }
        return this.randomWalkableDir(e, e.dir);
    }

    private updateEnemies() {
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (e.dead) {
                continue;
            }
            if (!e.moving) {
                const dir = this.pickEnemyDir(e);
                const dr = this.dirs[dir][0];
                const dc = this.dirs[dir][1];
                e.dir = dir;
                if (this.canWalk(e.r + dr, e.c + dc)) {
                    e.fr = e.r;
                    e.fc = e.c;
                    e.tr = e.r + dr;
                    e.tc = e.c + dc;
                    e.r = e.tr;
                    e.c = e.tc;
                    e.prog = 0;
                    e.moving = true;
                }
            } else {
                e.prog += this.enemySpeed;
                if (e.prog >= 1) {
                    e.fr = e.tr;
                    e.fc = e.tc;
                    e.prog = 0;
                    e.moving = false;
                }
            }
            // flame kills enemy
            if (this.cellHasFlame(e.r, e.c)) {
                e.dead = true;
                this.playSfxFile('kill.wav', 300, 40);
                continue;
            }
            // enemy touches player
            if (e.r == this.player.r && e.c == this.player.c) {
                this.phase = this.state.gameOver;
                this.playSfxFile('lose.wav', 180, 260);
                return;
            }
        }
    }

    private applyPowerup(type: number) {
        if (type == 0) {
            this.speedBoost = 1.6;
        } else if (type == 1) {
            this.bombCount++;
        } else {
            this.bombPower = Math.min(6, this.bombPower + 1);
        }
        this.playSfxFile('power.wav', 850, 30);
    }

    private checkPowerups() {
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            if (this.powerups[i].r == this.player.r && this.powerups[i].c == this.player.c) {
                this.applyPowerup(this.powerups[i].type);
                this.powerups.splice(i, 1);
            }
        }
    }

    private checkPlayerDeath() {
        if (this.phase != this.state.playing) {
            return;
        }
        if (this.cellHasFlame(this.player.r, this.player.c)) {
            this.phase = this.state.gameOver;
            this.playSfxFile('lose.wav', 180, 260);
        }
    }

    private checkWin() {
        if (this.phase != this.state.playing) {
            return;
        }
        let alive = 0;
        for (let i = 0; i < this.enemies.length; i++) {
            if (!this.enemies[i].dead) {
                alive++;
            }
        }
        if (alive == 0) {
            this.phase = this.state.win;
            this.playSfxFile('win.wav', 980, 200);
        }
    }

    private updatePlayerAnim() {
        if (this.player.moving) {
            this.player.prog += this.moveSpeed * this.speedBoost;
            if (this.player.prog >= 1) {
                this.player.fr = this.player.tr;
                this.player.fc = this.player.tc;
                this.player.prog = 0;
                this.player.moving = false;
            }
        }
    }

    private updatePlayerInput() {
        const sx = getValue('ail') / 1024;
        const sy = -getValue('ele') / 1024;
        let dr = 0;
        let dc = 0;
        if (Math.abs(sx) > 0.2 || Math.abs(sy) > 0.2) {
            if (Math.abs(sx) > Math.abs(sy)) {
                dc = sx > 0 ? 1 : -1;
            } else {
                dr = sy > 0 ? 1 : -1;
            }
        }
        if (dr != 0 || dc != 0) {
            this.attemptMove(dr, dc);
        }
    }

    private update() {
        this.updatePlayerInput();
        this.updatePlayerAnim();
        this.updateEnemies();
        this.updateBombs();
        this.updateFlames();
        this.checkPlayerDeath();
        this.checkPowerups();
        this.checkWin();
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

        const cell = this.gridHit(pos.x, pos.y);
        if (cell != null) {
            if (cell.r == this.player.r && cell.c == this.player.c) {
                this.placeBomb();
            } else if (Math.abs(cell.r - this.player.r) + Math.abs(cell.c - this.player.c) == 1) {
                this.attemptMove(cell.r - this.player.r, cell.c - this.player.c);
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
        if (event == EVT_VIRTUAL_PREV || event == EVT_VIRTUAL_PREV_REPT) {
            this.attemptMove(0, -1);
        } else if (event == EVT_VIRTUAL_NEXT || event == EVT_VIRTUAL_NEXT_REPT) {
            this.attemptMove(0, 1);
        } else if (event == EVT_TELEM_FIRST) {
            this.attemptMove(-1, 0);
        } else if (event == EVT_VIRTUAL_NEXT_PAGE || event == EVT_VIRTUAL_PREV_PAGE) {
            this.attemptMove(1, 0);
        } else if (event == EVT_ENTER_BREAK || event == EVT_VIRTUAL_ENTER || event == EVT_MODEL_FIRST) {
            this.placeBomb();
        }
    }

    private drawFloorCell(r: number, c: number, color: number) {
        const px = this.ox + c * this.cell;
        const py = this.oy + r * this.cell;
        lcd.drawFilledRectangle(px + 1, py + 1, this.cell - 2, this.cell - 2, color);
    }

    private draw() {
        lcd.clear(COLOR_THEME_PRIMARY2);

        // HUD
        lcd.drawText(4, 3, `Bomb:${this.bombCount} Pow:${this.bombPower}`, SMLSIZE | COLOR_THEME_PRIMARY1);
        let alive = 0;
        for (let i = 0; i < this.enemies.length; i++) {
            if (!this.enemies[i].dead) {
                alive++;
            }
        }
        lcd.drawText(this.w / 2, 3, `Enemy:${alive}`, SMLSIZE | CENTER | COLOR_THEME_PRIMARY1);
        lcd.drawText(this.w - 4, 3, this.diffNames[this.difficulty], SMLSIZE | RIGHT | COLOR_THEME_PRIMARY1);

        // floor / walls / bricks
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const t = this.grid[r][c];
                if (t == 1) {
                    this.drawFloorCell(r, c, COLOR_THEME_SECONDARY1);
                } else if (t == 2) {
                    this.drawFloorCell(r, c, COLOR_THEME_SECONDARY2);
                    const px = this.ox + c * this.cell;
                    const py = this.oy + r * this.cell;
                    const line = lcd.drawLine as unknown as (
                        x1: number,
                        y1: number,
                        x2: number,
                        y2: number,
                        pattern: number,
                        flags?: number
                    ) => void;
                    line(px + 3, py + this.cell - 3, px + this.cell - 3, py + 3, SOLID, COLOR_THEME_PRIMARY3);
                } else {
                    this.drawFloorCell(r, c, COLOR_THEME_SECONDARY3);
                }
            }
        }

        // power-ups
        for (let i = 0; i < this.powerups.length; i++) {
            const p = this.powerups[i];
            const px = this.ox + p.c * this.cell;
            const py = this.oy + p.r * this.cell;
            const cx = px + this.cell / 2;
            const cy = py + this.cell / 2;
            const col = p.type == 0 ? YELLOW : p.type == 1 ? ORANGE : BRIGHTGREEN;
            const label = p.type == 0 ? 'S' : p.type == 1 ? 'B' : 'P';
            (lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void)(
                cx,
                cy,
                Math.max(3, Math.floor(this.cell * 0.32)),
                col
            );
            lcd.drawText(cx, cy, label, SMLSIZE | CENTER | VCENTER | COLOR_THEME_PRIMARY2);
        }

        // flames
        for (let i = 0; i < this.flames.length; i++) {
            const f = this.flames[i];
            const px = this.ox + f.c * this.cell;
            const py = this.oy + f.r * this.cell;
            lcd.drawFilledRectangle(px + 2, py + 2, this.cell - 4, this.cell - 4, COLOR_THEME_WARNING);
            lcd.drawFilledRectangle(px + this.cell / 2 - 4, py + this.cell / 2 - 4, 8, 8, COLOR_THEME_ACTIVE);
        }

        // bombs
        for (let i = 0; i < this.bombs.length; i++) {
            const b = this.bombs[i];
            const px = this.ox + b.c * this.cell;
            const py = this.oy + b.r * this.cell;
            const cx = px + this.cell / 2;
            const cy = py + this.cell / 2;
            if (this.bombImg != null) {
                this.drawCenteredBitmap(this.bombImg, cx, cy);
            } else {
                (lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void)(
                    cx,
                    cy,
                    Math.max(3, Math.floor(this.cell * 0.32)),
                    BLACK
                );
                (lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void)(
                    cx,
                    cy,
                    2,
                    WHITE
                );
            }
        }

        // enemies
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (e.dead) {
                continue;
            }
            const cx = this.ox + (e.fc + (e.tc - e.fc) * e.prog) * this.cell + this.cell / 2;
            const cy = this.oy + (e.fr + (e.tr - e.fr) * e.prog) * this.cell + this.cell / 2;
            if (this.enemyImg != null) {
                this.drawCenteredBitmap(this.enemyImg, cx, cy);
            } else {
                (lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void)(
                    cx,
                    cy,
                    Math.max(3, Math.floor(this.cell * 0.3)),
                    RED
                );
            }
        }

        // player
        const pcx = this.ox + (this.player.fc + (this.player.tc - this.player.fc) * this.player.prog) * this.cell + this.cell / 2;
        const pcy = this.oy + (this.player.fr + (this.player.tr - this.player.fr) * this.player.prog) * this.cell + this.cell / 2;
        if (this.playerImg != null) {
            this.drawCenteredBitmap(this.playerImg, pcx, pcy);
        } else {
            (lcd.drawFilledCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void)(
                pcx,
                pcy,
                Math.max(3, Math.floor(this.cell * 0.34)),
                GREEN
            );
            (lcd.drawCircle as unknown as (x: number, y: number, rr: number, flags?: number) => void)(
                pcx,
                pcy,
                Math.max(3, Math.floor(this.cell * 0.34)),
                COLOR_THEME_PRIMARY2
            );
        }

        if (this.phase == this.state.initial) {
            this.drawOverlay(`BOMBERMAN\nDifficulty: ${this.diffNames[this.difficulty]}\n+/- change  SYS start`);
        } else if (this.phase == this.state.win) {
            this.drawOverlay('CLEARED!\nTap or SYS');
        } else if (this.phase == this.state.gameOver) {
            this.drawOverlay('BOOM! YOU DIED\nTap or SYS');
        }
    }

    private drawOverlay(text: string) {
        lcd.drawFilledRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_SECONDARY1, 1);
        lcd.drawRectangle(20, 20, this.w - 40, this.h - 40, COLOR_THEME_PRIMARY1, 2);
        lcd.drawText(this.w / 2, this.h / 2, text, COLOR_THEME_PRIMARY1 | CENTER | VCENTER | DBLSIZE);
    }

    public run(event: number, touchState: any): number {
        if (event != null) {
            this.onEvent(event, touchState);
        }

        const now = getTime();
        if (this.phase == this.state.playing && now - this.lastTick >= this.tickCs) {
            this.update();
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
