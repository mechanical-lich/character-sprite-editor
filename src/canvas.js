import { h } from 'https://esm.sh/preact@10.19.3';
import { useRef, useEffect, useCallback } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';

import { LAYER_ORDER, TOOLS } from './constants.js';
import { getPixel, rgbaToHex } from './utils.js';

const html = htm.bind(h);

export function EditorCanvas({ layers, activeLayer, spriteW, spriteH, scale, tool, color, setColor, onDraw, showGrid }) {
    const containerRef = useRef(null);
    const canvasRefs = useRef({});
    const gridRef = useRef(null);
    const isDrawing = useRef(false);
    const lastPos = useRef(null);

    const width = spriteW * scale;
    const height = spriteH * scale;

    // Render all layers
    useEffect(() => {
        for (const id of LAYER_ORDER) {
            const canvas = canvasRefs.current[id];
            if (!canvas) continue;
            const layer = layers[id];
            canvas.width = width;
            canvas.height = height;
            canvas.style.display = layer.visible ? 'block' : 'none';
            canvas.style.opacity = id === activeLayer ? '1' : '0.85';
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, width, height);
            ctx.imageSmoothingEnabled = false;
            const imgData = new ImageData(new Uint8ClampedArray(layer.data), spriteW, spriteH);
            const tmp = document.createElement('canvas');
            tmp.width = spriteW;
            tmp.height = spriteH;
            tmp.getContext('2d').putImageData(imgData, 0, 0);
            ctx.drawImage(tmp, 0, 0, width, height);
        }
    }, [layers, activeLayer, width, height, spriteW, spriteH]);

    // Draw grid overlay
    useEffect(() => {
        if (!gridRef.current) return;
        const c = gridRef.current;
        c.width = width;
        c.height = height;
        c.style.display = showGrid ? 'block' : 'none';
        if (!showGrid) return;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= spriteW; x++) {
            ctx.beginPath();
            ctx.moveTo(x * scale, 0);
            ctx.lineTo(x * scale, height);
            ctx.stroke();
        }
        for (let y = 0; y <= spriteH; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * scale);
            ctx.lineTo(width, y * scale);
            ctx.stroke();
        }
    }, [showGrid, width, height, spriteW, spriteH, scale]);

    const getPixelPos = useCallback((e) => {
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / scale);
        const y = Math.floor((e.clientY - rect.top) / scale);
        return [Math.max(0, Math.min(x, spriteW - 1)), Math.max(0, Math.min(y, spriteH - 1))];
    }, [scale, spriteW, spriteH]);

    const applyTool = useCallback((x, y) => {
        onDraw(x, y, tool, color);
    }, [tool, color, onDraw]);

    const handlePointerDown = useCallback((e) => {
        e.preventDefault();
        isDrawing.current = true;
        const [x, y] = getPixelPos(e);
        lastPos.current = [x, y];

        if (tool === TOOLS.EYEDROPPER) {
            const layer = layers[activeLayer];
            const px = getPixel(layer.data, x, y, spriteW);
            if (px[3] > 0) setColor(rgbaToHex(px[0], px[1], px[2]));
            return;
        }

        applyTool(x, y);
        containerRef.current.setPointerCapture(e.pointerId);
    }, [getPixelPos, applyTool, tool, layers, activeLayer, spriteW, setColor]);

    const handlePointerMove = useCallback((e) => {
        if (!isDrawing.current) return;
        if (tool === TOOLS.EYEDROPPER || tool === TOOLS.FILL) return;
        const [x, y] = getPixelPos(e);
        if (lastPos.current && lastPos.current[0] === x && lastPos.current[1] === y) return;

        // Bresenham line from last to current for smooth drawing
        if (lastPos.current) {
            const [x0, y0] = lastPos.current;
            const dx = Math.abs(x - x0), dy = Math.abs(y - y0);
            const sx = x0 < x ? 1 : -1, sy = y0 < y ? 1 : -1;
            let err = dx - dy;
            let cx = x0, cy = y0;
            while (true) {
                applyTool(cx, cy);
                if (cx === x && cy === y) break;
                const e2 = 2 * err;
                if (e2 > -dy) { err -= dy; cx += sx; }
                if (e2 < dx) { err += dx; cy += sy; }
            }
        }
        lastPos.current = [x, y];
    }, [getPixelPos, applyTool, tool]);

    const handlePointerUp = useCallback(() => {
        if (isDrawing.current) {
            isDrawing.current = false;
            lastPos.current = null;
            onDraw(null, null, null, null, true); // signal stroke end
        }
    }, [onDraw]);

    return html`
        <div class="canvas-container" ref=${containerRef}
             style="width:${width}px;height:${height}px"
             onPointerDown=${handlePointerDown}
             onPointerMove=${handlePointerMove}
             onPointerUp=${handlePointerUp}
             onPointerLeave=${handlePointerUp}>
            <div class="canvas-stack" style="width:${width}px;height:${height}px">
                ${LAYER_ORDER.map(id => html`
                    <canvas key=${id} ref=${el => { if (el) canvasRefs.current[id] = el; }}
                            style="pointer-events:none" />
                `)}
                <canvas ref=${gridRef} class="grid-overlay"
                        style="pointer-events:none;display:${showGrid ? 'block' : 'none'}" />
            </div>
        </div>
    `;
}

export function PreviewCanvas({ layers, spriteW, spriteH }) {
    const ref1x = useRef(null);
    const ref4x = useRef(null);

    useEffect(() => {
        for (const [ref, s] of [[ref1x, 1], [ref4x, 4]]) {
            if (!ref.current) continue;
            const c = ref.current;
            c.width = spriteW * s;
            c.height = spriteH * s;
            const ctx = c.getContext('2d');
            ctx.clearRect(0, 0, c.width, c.height);
            ctx.imageSmoothingEnabled = false;

            for (const id of LAYER_ORDER) {
                const layer = layers[id];
                if (!layer.visible) continue;
                const imgData = new ImageData(new Uint8ClampedArray(layer.data), spriteW, spriteH);
                const tmp = document.createElement('canvas');
                tmp.width = spriteW;
                tmp.height = spriteH;
                tmp.getContext('2d').putImageData(imgData, 0, 0);
                ctx.drawImage(tmp, 0, 0, c.width, c.height);
            }
        }
    }, [layers, spriteW, spriteH]);

    return html`
        <div class="preview-section">
            <div>
                <div style="font-size:10px;color:#666;text-align:center;margin-bottom:2px">1x</div>
                <canvas ref=${ref1x} class="preview-canvas" style="width:${spriteW}px;height:${spriteH}px" />
            </div>
            <div>
                <div style="font-size:10px;color:#666;text-align:center;margin-bottom:2px">4x</div>
                <canvas ref=${ref4x} class="preview-canvas" style="width:${spriteW*4}px;height:${spriteH*4}px" />
            </div>
        </div>
    `;
}
