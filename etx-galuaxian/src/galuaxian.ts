declare function getLastPos(): LuaMultiReturn<[unknown, unknown]>;

// Settings
let settings = {
    lowFps: false,
    targetSideMotion: true,
    fancyProjectile: true,
    easyMode: false,
    lowQuality: false,
    sound: true,
};
let targetSideMotionAmplitude = 2; // better not make it bigger, otherwise targets start to teleport side to side

// Program
let shipPosition = { x: 0, y: 0 };
let SCALE = 1;
let actionAreaWidthStart = 0;
let actionAreaHeightStart = LCD_H * 0.25;
let backgroundSpeed = 2;
let projectileCount = 3;
let targetCount = 4;
let targetWidth = 16;
let targetHeight = 10;
let projectileLength = 8;
let gameOver = true;
let targets: any[] = [];
let projectiles: any[] = [];
let backgrounds: any[] = [];
let lowBackgrounds: any[] = [];
let backgroundCount = 20;
let bestResultPath = '/galuaxian-results.txt';
let debug = false; // true -> draw borders around objects
let shipCollisionMargin = 0;
let fpsCounter = 0;
let menuPage = false;
let menuItemsCount = 5;
let menuPosition = 0;
let menuPadding = 2;
let menuOpened = false;
let nextShotSoundAt = 0;
let lastFlightSoundAt = 0;
let touchActive = false;
let touchLast = { x: LCD_W / 2, y: LCD_H / 2 };

let ship: Bitmap | null = null;
let background: Bitmap | null = null;
let target: Bitmap | null = null;
let bestResult: number | null = null;
let hits = 0;
let gameStarted = false;
let currentTime = 0;
let timerValue = 0;
let initTime = 0;

let shipWidth = 10;
let shipHeight = 7;
let shipHalfWidth = 5;
let projectileWidth = 2;
let actionAreaWidthEnd = 0;
let actionAreaHeightEnd = 0;
let targetHalfWidth = 8;
let targetHalfHeight = 5;

function playSfx(freq: number, duration: number, pause: number = 0) {
    if (settings.sound) {
        (playTone as unknown as (f: number, d: number, p: number) => void)(freq, duration, pause);
    }
}

// play a WAV from the SOUNDS folder; fall back to a tone if not found
function playSfxFile(file: string, freq: number, duration: number) {
    if (!settings.sound) {
        return;
    }
    const tries = [
        `./SOUNDS/galuaxian/${file}`,
        `/SOUNDS/galuaxian/${file}`,
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

// Returns color flag
function getActiveColor(accent?: string): number {
    if (SCALE <= 1 || settings.lowQuality) {
        return 0;
    }
    if (accent == 'RED') {
        return RED;
    }
    if (accent == 'YELLOW') {
        return RED;
    }
    return WHITE;
}

const ioOpen = io.open as unknown as (path: string, mode?: string) => any;
const ioRead = io.read as unknown as (file: any, format?: any) => any;
const ioWrite = io.write as unknown as (file: any, ...values: any[]) => any;
const ioClose = io.close as unknown as (file: any) => any;

function loadBestResult(): number | null {
    const f = ioOpen(bestResultPath, 'r');
    if (f == null) {
        return null;
    }
    const r = ioRead(f, 3);
    if (r == null) {
        return null;
    }
    const res = tonumber(r as string);
    return res == null ? null : res;
}

function saveBestResult(result: number) {
    const f = ioOpen(bestResultPath, 'w');
    if (f != null) {
        ioWrite(f, string.format('%3d', result));
        ioClose(f);
    }
}

function randInt(min: number, max: number): number {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function initWithScale(scale: number) {
    shipWidth = 10 * scale;
    shipHeight = 7 * scale;
    projectileLength = scale * 4;
    projectileWidth = scale * 2;
    targetSideMotionAmplitude = scale * 0.5;
    targetWidth = 4 * scale;
    targetHeight = 4 * scale;

    if (SCALE > 1) {
        menuItemsCount = menuItemsCount + 1;
    }

    if (ship != null && !settings.lowQuality) {
        shipWidth = 30 * scale;
        shipHeight = 20 * scale;
        targetWidth = 16 * scale;
        targetHeight = 10 * scale;
        shipCollisionMargin = 4 * scale;
    }

    shipHalfWidth = shipWidth / 2;
    targetHalfWidth = targetWidth / 2;
    targetHalfHeight = targetHeight / 2;

    actionAreaWidthEnd = LCD_W - shipWidth;
    actionAreaHeightEnd = LCD_H - shipHeight;
}

function initBitmaps() {
    ship = Bitmap.open('./IMAGES/ship.png');
    background = Bitmap.open('./IMAGES/back.png');
    target = Bitmap.open('./IMAGES/target.png');
}

function init(w?: number, h?: number): void {
    initBitmaps();

    bestResult = loadBestResult();
    hits = 0;
    gameStarted = false;

    if (LCD_W >= 480) {
        SCALE = 2;
    }
    initWithScale(SCALE);

    if (SCALE == 1) {
        for (let i = 0; i <= projectileCount; i++) {
            projectiles[i] = { x: LCD_W / 2, y: -LCD_H, velocity: -4, travelDistance: 1000, delay: i * -4 };
        }
    } else {
        for (let i = 0; i <= projectileCount; i++) {
            projectiles[i] = { x: LCD_W / 2, y: -LCD_H, velocity: SCALE * -10, travelDistance: 1000, delay: i * -4 };
        }
    }

    for (let i = 0; i <= targetCount; i++) {
        targets[i] = {
            x: randInt(0, LCD_W - targetWidth),
            y: randInt(0, LCD_H),
            sideVelocity: SCALE * 1,
            velocity: SCALE * 4,
            travelDistance: 1000,
            delay: i * -4,
            dead: true,
        };
    }

    for (let i = 0; i <= 20; i++) {
        lowBackgrounds[i] = { x: randInt(0, LCD_W), y: randInt(0, LCD_H) };
    }
    backgrounds[0] = { y: -LCD_H };
    backgrounds[1] = { y: 0 };

    initTime = getTime();
}

function drawProjectile(projectile: any, x: number, y: number) {
    if (projectile.delay <= 0) {
        projectile.delay = projectile.delay + 1;
        return;
    }

    if (projectile.travelDistance >= LCD_H) {
        projectile.y = y;
        projectile.x = x;
        projectile.travelDistance = 0;
        if (currentTime >= nextShotSoundAt) {
            playSfxFile('shoot.wav', 700, 10);
            nextShotSoundAt = currentTime + 4;
        }
    } else {
        projectile.y = projectile.y + projectile.velocity;
        projectile.travelDistance = projectile.travelDistance + projectile.velocity * -1;
    }

    if (settings.fancyProjectile) {
        lcd.drawLine(projectile.x, projectile.y, projectile.x + projectileWidth / 2, projectile.y + projectileLength, SOLID, getActiveColor());
        lcd.drawLine(projectile.x + projectileWidth / 2, projectile.y + projectileLength, projectile.x - projectileWidth / 2, projectile.y + projectileLength, SOLID, getActiveColor('YELLOW'));
        lcd.drawLine(projectile.x - projectileWidth / 2, projectile.y + projectileLength, projectile.x, projectile.y, SOLID, getActiveColor());
        lcd.drawLine(projectile.x, projectile.y, projectile.x, projectile.y + projectileLength, SOLID, getActiveColor('RED'));
        return;
    }

    lcd.drawRectangle(projectile.x - projectileWidth / 2, projectile.y, projectileWidth, projectileLength, getActiveColor());
}

function drawShip(x: number, y: number) {
    if (debug) {
        lcd.drawRectangle(x, y, shipWidth, shipHeight);
    }
    if (ship != null && !settings.lowQuality) {
        lcd.drawBitmap(ship, x, y, SCALE * 100);
        return;
    }

    // graphic fallback, primitive ship render
    lcd.drawLine(x + shipHalfWidth, y, x + shipWidth, y + shipHeight, SOLID, FORCE);
    lcd.drawLine(x + shipWidth, y + shipHeight, x + shipHalfWidth, y + (shipHeight * 3) / 4, SOLID, FORCE);
    lcd.drawLine(x + shipHalfWidth, y + (shipHeight * 3) / 4, x, y + shipHeight, SOLID, FORCE);
    lcd.drawLine(x, y + shipHeight, x + shipHalfWidth, y, SOLID, FORCE);
}

function drawTargetAt(x: number, y: number) {
    if (debug) {
        lcd.drawRectangle(x, y, targetWidth, targetHeight);
    }
    if (target != null && !settings.lowQuality) {
        lcd.drawBitmap(target, x, y, SCALE * 100);
        return;
    }
    // graphic fallback, primitive target render
    lcd.drawLine(x, y, x + targetHalfWidth, y + targetHalfWidth, SOLID, FORCE);
    lcd.drawLine(x + targetHalfWidth, y + targetHalfWidth, x + targetWidth, y, SOLID, FORCE);
    lcd.drawLine(x + targetWidth, y, x + targetHalfWidth, y + targetHeight, SOLID, FORCE);
    lcd.drawLine(x + targetHalfWidth, y + targetHeight, x, y, SOLID, FORCE);
}

function drawBackground() {
    if (background == null || settings.lowQuality) {
        // fallback to pixel stars
        for (let i = 0; i <= backgroundCount; i++) {
            lowBackgrounds[i].y = lowBackgrounds[i].y + backgroundSpeed;
            if (lowBackgrounds[i].y == LCD_H) {
                lowBackgrounds[i].y = 0;
            }
            lcd.drawPoint(lowBackgrounds[i].x, lowBackgrounds[i].y);
        }
        return;
    }

    for (let i = 0; i <= 1; i++) {
        backgrounds[i].y = backgrounds[i].y + backgroundSpeed;
        if (backgrounds[i].y == LCD_H) {
            backgrounds[i].y = -LCD_H;
        }
        lcd.drawBitmap(background, 0, backgrounds[i].y);
    }
}

function detectOverlap(xl1: number, yl1: number, xl2: number, yl2: number, xr1: number, yr1: number, xr2: number, yr2: number): boolean {
    // If one rectangle is on left side of other
    if (xl1 > xr2 || xl2 > xr1) {
        return false;
    }
    // If one rectangle is above other
    if (yr1 > yl2 || yr2 > yl1) {
        return false;
    }
    return true;
}

function drawTargets() {
    let aliveCount = 0;
    for (let i = 0; i <= targetCount; i++) {
        targets[i].y = targets[i].y + targets[i].velocity;

        if (settings.targetSideMotion) {
            targets[i].x = targets[i].x + targets[i].sideVelocity + randInt(targetSideMotionAmplitude * -1, targetSideMotionAmplitude);

            if (targets[i].x <= shipHalfWidth || targets[i].x + targetWidth > LCD_W - shipHalfWidth) {
                targets[i].sideVelocity = targets[i].sideVelocity * -1;
            }
        }

        for (let j = 0; j <= projectileCount; j++) {
            // projectile/target collision detection, forgiving hitboxes
            if (
                !targets[i].dead &&
                projectiles[j].x >= targets[i].x - 10 &&
                projectiles[j].x + projectileWidth <= targets[i].x + targetWidth + 10 &&
                projectiles[j].y >= targets[i].y - (projectileLength + projectiles[j].velocity * -1) &&
                projectiles[j].y <= targets[i].y + targetHeight + projectiles[j].velocity * -1
            ) {
                targets[i].dead = true;
                targets[i].sideVelocity = targets[i].sideVelocity * -1;
                playSfxFile('hit.wav', 450, 50);
                hits = hits + 1;
            }
        }

        if (
            !targets[i].dead &&
            detectOverlap(
                targets[i].x + shipCollisionMargin,
                targets[i].y,
                shipPosition.x,
                shipPosition.y + shipCollisionMargin,
                targets[i].x + targetWidth - shipCollisionMargin,
                targets[i].y - targetHeight,
                shipPosition.x + shipWidth - shipCollisionMargin,
                shipPosition.y + shipCollisionMargin - shipHeight
            )
        ) {
            gameOver = true;
            playSfxFile('boom.wav', 200, 220);
            (playHaptic as unknown as (a: number, b: number, c: number) => void)(50, 0, PLAY_NOW);
        }

        if (targets[i].y >= LCD_H) {
            const offset = shipHalfWidth;
            targets[i].y = -targetHeight;
            targets[i].x = randInt(offset, LCD_W - targetWidth - offset);
            if (!targets[i].dead) {
                hits = hits - 1;
                playSfxFile('escape.wav', 150, 50);
            }
            targets[i].dead = false;
        }

        if (!targets[i].dead) {
            aliveCount = aliveCount + 1;
            drawTargetAt(targets[i].x, targets[i].y);
        }
    }

    // soft flight hum while targets are on screen (throttled)
    if (aliveCount > 0 && currentTime >= lastFlightSoundAt) {
        lastFlightSoundAt = currentTime + 60;
        playSfxFile('flight.wav', 300, 20);
    }
}

function mapInputToActionAreaPosition(value: number, newRangeStart: number, newRangeEnd: number): number {
    return newRangeStart + (newRangeEnd - newRangeStart) * ((value + 1024) / 2048); // 2048 - stick input range
}

function clamp(value: number, minValue: number, maxValue: number): number {
    if (value < minValue) {
        return minValue;
    }
    if (value > maxValue) {
        return maxValue;
    }
    return value;
}

function isTouchEvent(event: number): boolean {
    return event == EVT_TOUCH_FIRST || event == EVT_TOUCH_SLIDE || event == EVT_TOUCH_TAP || event == EVT_TOUCH_BREAK;
}

function readTouchPosition(touchState: any): { x: number; y: number } | null {
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

function applyTouchControl(event: number, touchState: any): boolean {
    if (isTouchEvent(event)) {
        if (event == EVT_TOUCH_BREAK) {
            touchActive = false;
        } else {
            const pos = readTouchPosition(touchState);
            if (pos != null) {
                touchLast.x = clamp(pos.x, 0, LCD_W);
                touchLast.y = clamp(pos.y, 0, LCD_H);
                touchActive = true;
            }
        }
    }

    if (touchActive) {
        // stick input reclaims control
        if (Math.abs(getValue('ail')) > 300 || Math.abs(getValue('ele')) > 300) {
            touchActive = false;
        } else {
            shipPosition.x = clamp(touchLast.x - shipHalfWidth, actionAreaWidthStart, actionAreaWidthEnd);
            shipPosition.y = clamp(touchLast.y - shipHeight / 2, actionAreaHeightStart, actionAreaHeightEnd);
            return true;
        }
    }
    return false;
}

function renderHome(event: number) {
    if (SCALE == 1) {
        if (gameStarted) {
            lcd.drawText(LCD_W / 2 - 40, LCD_H / 4, 'Game Over', BOLD + MIDSIZE);
            lcd.drawText(LCD_W / 2 - 40, (LCD_H * 2) / 4, `Points: ${hits}`, BOLD);

            if (bestResult == null || hits > bestResult) {
                saveBestResult(hits);
            }
        } else {
            (lcd as any).drawScreenTitle('[GaLuaxian]', 0, 0);
            lcd.drawText(LCD_W / 2 - 40, LCD_H / 4, "SHOOT 'EM UP!");
            if (bestResult != null) {
                lcd.drawText(LCD_W / 2 - 40, LCD_H / 4 + 12, `Best result: ${bestResult}`);
            }
        }

        lcd.drawText(4, LCD_H - 20, 'Press [Enter] to start', BOLD + BLINK);
        lcd.drawText(10, LCD_H - 10, '(Hold for settings)', BOLD);
        return 0;
    } else {
        if (gameStarted) {
            lcd.drawText(LCD_W / 2 - 80, LCD_H / 2 - 40, 'Game Over', BOLD + MIDSIZE + getActiveColor('RED'));
            lcd.drawText(LCD_W / 2 - 80, (LCD_H * 2) / 3 - 40, `Points: ${hits}`, BOLD + SMLSIZE + getActiveColor());

            if (bestResult == null || hits > bestResult) {
                saveBestResult(hits);
            }
        } else {
            lcd.drawRectangle(LCD_W / 2 - 90, LCD_H / 2 - 48, 170, 60, SOLID + getActiveColor());
            lcd.drawRectangle(LCD_W / 2 - 88, LCD_H / 2 - 46, 170, 60, SOLID + getActiveColor('YELLOW'));

            lcd.drawText(LCD_W / 2 - 75, LCD_H / 2 - 40, 'Galuaxian', BOLD + MIDSIZE + getActiveColor());
            lcd.drawText(LCD_W / 2 - 75, LCD_H / 2 - 10, "SHOOT 'EM UP!", SMLSIZE + getActiveColor());
            if (bestResult != null) {
                lcd.drawText(LCD_W / 2 - 60, LCD_H / 2 + 60, `Best result: ${bestResult}`, SMLSIZE + getActiveColor());
            }
        }

        lcd.drawText(LCD_W / 3 + 4, LCD_H - 53, 'Press [Enter] to start', BOLD + BLINK + getActiveColor());
        lcd.drawText(LCD_W / 3, LCD_H - 30, 'Hold [Enter] for settings', BOLD + getActiveColor());
        return 0;
    }
}

function drawTick(x: number, y: number) {
    lcd.drawLine(x + menuPadding + 3, y + menuPadding + 5, x + 9, y + 13, SOLID, getActiveColor());
    lcd.drawLine(x + 9, y + 13, x + 17, y + menuPadding + 3, SOLID, getActiveColor());
    lcd.drawLine(x + menuPadding + 3, y + menuPadding + 6, x + 9, y + 14, SOLID, getActiveColor());
    lcd.drawLine(x + 9, y + 14, x + 17, y + menuPadding + 4, SOLID, getActiveColor());
}

function drawBooleanField(x: number, y: number, text: string, value: boolean) {
    lcd.drawText(x + menuPadding, y + menuPadding, text, getActiveColor());
    lcd.drawRectangle(LCD_W - menuPadding - 19, y + menuPadding, 19, 19, getActiveColor());
    lcd.drawRectangle(LCD_W - menuPadding - 18, y + menuPadding + 1, 17, 17, getActiveColor());

    if (value) {
        drawTick(LCD_W - 23, y + menuPadding);
    }
}

function drawLowScaleTick(x: number, y: number) {
    lcd.drawLine(x - 1, y + 2, x + 3, y + 5, SOLID, FORCE);
    lcd.drawLine(x + 3, y + 5, x + 8, y - 1, SOLID, FORCE);
}

function drawLowScaleBooleanField(x: number, y: number, text: string, value: boolean) {
    lcd.drawText(x + menuPadding, y + menuPadding, text);
    lcd.drawRectangle(LCD_W - menuPadding - 8, y + menuPadding, 8, 8);

    if (value) {
        drawLowScaleTick(LCD_W - 10, y + menuPadding);
    }
}

function renderMenu(event: number) {
    if (event == EVT_ROT_LEFT || event == EVT_MINUS_FIRST) {
        menuPosition = menuPosition - 1;
        if (menuPosition < 0) {
            menuPosition = menuItemsCount - 1;
        }
    }
    if (event == EVT_ROT_RIGHT || event == EVT_PLUS_FIRST) {
        menuPosition = menuPosition + 1;
        if (menuPosition > menuItemsCount - 1) {
            menuPosition = 0;
        }
    }
    if (event == EVT_ENTER_BREAK && menuPage) {
        if (menuPosition == 0 && menuOpened) {
            settings.lowFps = !settings.lowFps;
        }
        if (menuPosition == 1 && menuOpened) {
            settings.targetSideMotion = !settings.targetSideMotion;
        }
        if (menuPosition == 2 && menuOpened) {
            settings.fancyProjectile = !settings.fancyProjectile;
        }
        if (menuPosition == 3 && menuOpened) {
            settings.easyMode = !settings.easyMode;
        }
        if (menuPosition == 4 && menuOpened) {
            settings.sound = !settings.sound;
        }
        if (menuPosition == 5 && menuOpened) {
            settings.lowQuality = !settings.lowQuality;
        }
        menuOpened = true;
    }
    if (event == EVT_EXIT_BREAK) {
        menuPage = false;
        menuOpened = false;
    }

    if (SCALE > 1) {
        lcd.drawFilledRectangle(0, 0, LCD_W, 40, getActiveColor());
        lcd.drawText(0, 0, 'Settings', BOLD + MIDSIZE + INVERS + getActiveColor());
        drawBooleanField(2, 47, 'Low FPS: ', settings.lowFps);
        drawBooleanField(2, 76, 'Target side motion: ', settings.targetSideMotion);
        drawBooleanField(2, 105, 'Fancy projectile: ', settings.fancyProjectile);
        drawBooleanField(2, 134, 'Easy mode: ', settings.easyMode);
        drawBooleanField(2, 163, 'Sound: ', settings.sound);
        drawBooleanField(2, 192, 'Low Quality: ', settings.lowQuality);
        lcd.drawRectangle(1, 46 + 29 * menuPosition, LCD_W - 1, 25, SOLID + getActiveColor());
        return 0;
    }

    (lcd as any).drawScreenTitle('Settings', 0, 0);
    drawLowScaleBooleanField(2, 11, 'Low FPS: ', settings.lowFps);
    drawLowScaleBooleanField(2, 22, 'Target side motion: ', settings.targetSideMotion);
    drawLowScaleBooleanField(2, 33, 'Fancy projectile: ', settings.fancyProjectile);
    drawLowScaleBooleanField(2, 44, 'Easy mode: ', settings.easyMode);
    drawLowScaleBooleanField(2, 55, 'Sound: ', settings.sound);
    lcd.drawRectangle(0, 11 + 11 * menuPosition, LCD_W, 12, SOLID);
    return 0;
}

function run(event: number, touchState: any): number {
    currentTime = getTime();
    timerValue = (currentTime - initTime) / 100 + 1;

    if (!applyTouchControl(event, touchState)) {
        shipPosition.x = mapInputToActionAreaPosition(getValue('ail'), actionAreaWidthStart, actionAreaWidthEnd);
        shipPosition.y = mapInputToActionAreaPosition(getValue('ele') * -1, actionAreaHeightStart, actionAreaHeightEnd);
    }

    if (gameOver == true) {
        lcd.clear();
        drawBackground();

        if (!menuPage) {
            renderHome(event);
        } else {
            renderMenu(event);
        }

        if ((event == EVT_ENTER_BREAK || event == EVT_TOUCH_TAP) && !menuPage) {
            gameOver = false;
            gameStarted = true;
            hits = 0;
            nextShotSoundAt = 0;
            playSfxFile('start.wav', 850, 90);
            for (let i = 0; i <= targetCount; i++) {
                targets[i].dead = true;
            }
        }
        if (event == EVT_ENTER_LONG) {
            menuPage = true;
        }
        return 0;
    }

    if (settings.easyMode && targetCount != 2) {
        for (let i = 0; i <= targetCount; i++) {
            targets[i].velocity = SCALE * 1;
        }
        targetCount = 2;
    }

    if (!settings.easyMode && targetCount != 4) {
        targetCount = 4;
        for (let i = 0; i <= targetCount; i++) {
            targets[i].velocity = SCALE * 4;
        }
    }

    if (event == EVT_EXIT_BREAK) {
        gameOver = true;
        playSfxFile('exit.wav', 220, 120);
    }

    if (settings.lowFps) {
        fpsCounter = fpsCounter + 1;
        if (fpsCounter == 2) {
            fpsCounter = 0;
            return 0; // skip every other frame
        }
    }

    lcd.clear();
    drawBackground();

    lcd.drawText(1, 1, `TOTAL HITS:  ${hits}`, INVERS);
    drawShip(shipPosition.x, shipPosition.y);

    for (let i = 0; i <= projectileCount; i++) {
        drawProjectile(projectiles[i], shipPosition.x + shipHalfWidth, shipPosition.y);
    }

    drawTargets();
    return 0;
}

export { init, run };
