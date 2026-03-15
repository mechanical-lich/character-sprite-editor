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
