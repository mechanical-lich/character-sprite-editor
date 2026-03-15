export function createLayerData(w, h) {
    return new Uint8ClampedArray(w * h * 4);
}

export function hexToRgba(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b, 255];
}

export function rgbaToHex(r, g, b) {
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

export function getPixel(data, x, y, w) {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

export function setPixel(data, x, y, w, rgba) {
    const i = (y * w + x) * 4;
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
}

export function pixelsMatch(a, b) {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

export function floodFill(data, x, y, w, h, fillColor) {
    const target = getPixel(data, x, y, w);
    if (pixelsMatch(target, fillColor)) return;
    const stack = [[x, y]];
    while (stack.length) {
        const [cx, cy] = stack.pop();
        if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
        const current = getPixel(data, cx, cy, w);
        if (!pixelsMatch(current, target)) continue;
        setPixel(data, cx, cy, w, fillColor);
        stack.push([cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]);
    }
}

// ─── Shape rasterization ─────────────────────────────────────────────

export function rasterizeLine(x0, y0, x1, y1) {
    const points = [];
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0, cy = y0;
    while (true) {
        points.push([cx, cy]);
        if (cx === x1 && cy === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; cx += sx; }
        if (e2 < dx) { err += dx; cy += sy; }
    }
    return points;
}

export function rasterizeRect(x0, y0, x1, y1) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const points = [];
    for (let x = minX; x <= maxX; x++) {
        points.push([x, minY], [x, maxY]);
    }
    for (let y = minY + 1; y < maxY; y++) {
        points.push([minX, y], [maxX, y]);
    }
    return points;
}

export function rasterizeCircle(x0, y0, x1, y1) {
    const cx = Math.round((x0 + x1) / 2);
    const cy = Math.round((y0 + y1) / 2);
    const rx = Math.abs(x1 - x0) / 2;
    const ry = Math.abs(y1 - y0) / 2;
    if (rx < 0.5 && ry < 0.5) return [[cx, cy]];
    const points = [];
    const seen = new Set();
    const add = (px, py) => {
        const key = `${px},${py}`;
        if (!seen.has(key)) { seen.add(key); points.push([px, py]); }
    };
    // Midpoint ellipse algorithm
    let x = 0, y = Math.round(ry);
    let rx2 = rx * rx, ry2 = ry * ry;
    let px = 0, py = 2 * rx2 * y;
    // Region 1
    let p = ry2 - rx2 * Math.round(ry) + 0.25 * rx2;
    while (px < py) {
        add(cx + x, cy + y); add(cx - x, cy + y);
        add(cx + x, cy - y); add(cx - x, cy - y);
        x++;
        px += 2 * ry2;
        if (p < 0) {
            p += ry2 + px;
        } else {
            y--;
            py -= 2 * rx2;
            p += ry2 + px - py;
        }
    }
    // Region 2
    p = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;
    while (y >= 0) {
        add(cx + x, cy + y); add(cx - x, cy + y);
        add(cx + x, cy - y); add(cx - x, cy - y);
        y--;
        py -= 2 * rx2;
        if (p > 0) {
            p += rx2 - py;
        } else {
            x++;
            px += 2 * ry2;
            p += rx2 - py + px;
        }
    }
    return points;
}

export function loadSpriteSheet(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve({ img, canvas: c, ctx, width: img.width, height: img.height });
        };
        img.onerror = reject;
        img.src = src;
    });
}

export function extractSprites(sheetCtx, sheetW, sheetH, spriteSize) {
    const cols = Math.floor(sheetW / spriteSize);
    const rows = Math.floor(sheetH / spriteSize);
    const sprites = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const imgData = sheetCtx.getImageData(col * spriteSize, row * spriteSize, spriteSize, spriteSize);
            let hasContent = false;
            for (let i = 3; i < imgData.data.length; i += 4) {
                if (imgData.data[i] > 0) { hasContent = true; break; }
            }
            if (hasContent) {
                sprites.push(new Uint8ClampedArray(imgData.data));
            }
        }
    }
    return sprites;
}
