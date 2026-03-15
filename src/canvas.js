import { h } from 'https://esm.sh/preact@10.19.3';
import { useRef, useEffect, useCallback } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';

import { LAYER_ORDER, TOOLS, SHAPE_TOOLS } from './constants.js';
import { getPixel, rgbaToHex, hexToRgba, rasterizeLine, rasterizeRect, rasterizeCircle } from './utils.js';

const html = htm.bind(h);

function getShapePoints(tool, x0, y0, x1, y1) {
    if (tool === TOOLS.LINE) return rasterizeLine(x0, y0, x1, y1);
    if (tool === TOOLS.RECT) return rasterizeRect(x0, y0, x1, y1);
    if (tool === TOOLS.CIRCLE) return rasterizeCircle(x0, y0, x1, y1);
    return [];
}

export function EditorCanvas({ layers, activeLayer, spriteW, spriteH, scale, tool, color, setColor, onDraw, onDrawShape, showGrid }) {
    const containerRef = useRef(null);
    const canvasRefs = useRef({});
    const gridRef = useRef(null);
    const previewRef = useRef(null);
    const isDrawing = useRef(false);
    const lastPos = useRef(null);
    const shapeStart = useRef(null);
    const isShape = SHAPE_TOOLS.has(tool);

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

    // Clear shape preview when tool changes away from shape
    useEffect(() => {
        if (!isShape && previewRef.current) {
            const ctx = previewRef.current.getContext('2d');
            ctx.clearRect(0, 0, width, height);
        }
    }, [isShape, width, height]);

    const getPixelPos = useCallback((e) => {
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / scale);
        const y = Math.floor((e.clientY - rect.top) / scale);
        return [Math.max(0, Math.min(x, spriteW - 1)), Math.max(0, Math.min(y, spriteH - 1))];
    }, [scale, spriteW, spriteH]);

    const applyTool = useCallback((x, y) => {
        onDraw(x, y, tool, color);
    }, [tool, color, onDraw]);

    const drawShapePreview = useCallback((x0, y0, x1, y1) => {
        if (!previewRef.current) return;
        const c = previewRef.current;
        c.width = width;
        c.height = height;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = false;
        const rgba = hexToRgba(color);
        const points = getShapePoints(tool, x0, y0, x1, y1);
        for (const [px, py] of points) {
            if (px >= 0 && px < spriteW && py >= 0 && py < spriteH) {
                ctx.fillStyle = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},0.7)`;
                ctx.fillRect(px * scale, py * scale, scale, scale);
            }
        }
    }, [color, tool, scale, spriteW, spriteH, width, height]);

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

        if (isShape) {
            shapeStart.current = [x, y];
            drawShapePreview(x, y, x, y);
        } else {
            applyTool(x, y);
        }
        containerRef.current.setPointerCapture(e.pointerId);
    }, [getPixelPos, applyTool, drawShapePreview, tool, isShape, layers, activeLayer, spriteW, setColor]);

    const handlePointerMove = useCallback((e) => {
        if (!isDrawing.current) return;
        const [x, y] = getPixelPos(e);

        if (isShape) {
            if (shapeStart.current) {
                drawShapePreview(shapeStart.current[0], shapeStart.current[1], x, y);
            }
            return;
        }

        if (tool === TOOLS.EYEDROPPER || tool === TOOLS.FILL) return;
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
    }, [getPixelPos, applyTool, drawShapePreview, tool, isShape]);

    const handlePointerUp = useCallback((e) => {
        if (!isDrawing.current) return;
        isDrawing.current = false;

        if (isShape && shapeStart.current) {
            const [x, y] = getPixelPos(e);
            const points = getShapePoints(tool, shapeStart.current[0], shapeStart.current[1], x, y);
            // Clear preview
            if (previewRef.current) {
                previewRef.current.getContext('2d').clearRect(0, 0, width, height);
            }
            onDrawShape(points, color);
            shapeStart.current = null;
        } else {
            lastPos.current = null;
            onDraw(null, null, null, null, true); // signal stroke end
        }
    }, [onDraw, onDrawShape, getPixelPos, tool, isShape, color, width, height]);

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
                <canvas ref=${previewRef} class="shape-preview-overlay"
                        style="pointer-events:none;position:absolute;top:0;left:0;z-index:5" />
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
