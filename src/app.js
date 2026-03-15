import { h, render } from 'https://esm.sh/preact@10.19.3';
import { useState, useRef, useEffect, useCallback, useMemo } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';

const html = htm.bind(h);

// ─── Constants ──────────────────────────────────────────────────────
const LAYER_ORDER = ['body', 'bottoms', 'tops', 'footwear', 'hands', 'face', 'head'];
const LAYER_LABELS = {
    body: 'Body',
    bottoms: 'Bottoms',
    tops: 'Tops',
    face: 'Face',
    footwear: 'Footwear',
    hands: 'Hands',
    head: 'Head',
};

const DEFAULT_PALETTE = [
    '#000000', '#1a1a2e', '#16213e', '#0f3460',
    '#ffffff', '#e0e0e0', '#b0b0b0', '#808080',
    '#e94560', '#ff6b6b', '#ee5a24', '#f39c12',
    '#f8c291', '#e6b07e', '#c68642', '#8d5524',
    '#2ecc71', '#27ae60', '#1abc9c', '#16a085',
    '#3498db', '#2980b9', '#8e44ad', '#6c3483',
    '#ecf0f1', '#bdc3c7', '#95a5a6', '#7f8c8d',
    '#ffeaa7', '#fdcb6e', '#fab1a0', '#ff7675',
    '#74b9ff', '#a29bfe', '#fd79a8', '#636e72',
    '#dfe6e9', '#b2bec3', '#2d3436', '#0984e3',
];

const TOOLS = { PENCIL: 'pencil', ERASER: 'eraser', FILL: 'fill', EYEDROPPER: 'eyedropper' };

// ─── Utility ────────────────────────────────────────────────────────
function createLayerData(w, h) {
    return new Uint8ClampedArray(w * h * 4);
}

function hexToRgba(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b, 255];
}

function rgbaToHex(r, g, b) {
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function getPixel(data, x, y, w) {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

function setPixel(data, x, y, w, rgba) {
    const i = (y * w + x) * 4;
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
}

function pixelsMatch(a, b) {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

function floodFill(data, x, y, w, h, fillColor) {
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

function loadSpriteSheet(src) {
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

function extractSprites(sheetCtx, sheetW, sheetH, spriteSize) {
    const cols = Math.floor(sheetW / spriteSize);
    const rows = Math.floor(sheetH / spriteSize);
    const sprites = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const imgData = sheetCtx.getImageData(col * spriteSize, row * spriteSize, spriteSize, spriteSize);
            // Skip fully transparent sprites
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

// ─── LocalStorage library ───────────────────────────────────────────
const STORAGE_KEY = 'sprite_editor_custom_library';

function loadCustomLibrary() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function saveCustomLibrary(lib) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
}

function addToCustomLibrary(category, name, data, w, h) {
    const lib = loadCustomLibrary();
    if (!lib[category]) lib[category] = [];
    lib[category].push({ name, data: Array.from(data), w, h });
    saveCustomLibrary(lib);
    return lib;
}

function removeFromCustomLibrary(category, index) {
    const lib = loadCustomLibrary();
    if (lib[category]) {
        lib[category].splice(index, 1);
        if (lib[category].length === 0) delete lib[category];
    }
    saveCustomLibrary(lib);
    return lib;
}

// ─── Components ─────────────────────────────────────────────────────

function ToolBar({ tool, setTool, onUndo, onRedo, canUndo, canRedo }) {
    return html`
        <div class="tools-bar">
            <button class="tool-btn ${tool === TOOLS.PENCIL ? 'active' : ''}"
                    onClick=${() => setTool(TOOLS.PENCIL)} title="Pencil (B)">Pencil</button>
            <button class="tool-btn ${tool === TOOLS.ERASER ? 'active' : ''}"
                    onClick=${() => setTool(TOOLS.ERASER)} title="Eraser (E)">Eraser</button>
            <button class="tool-btn ${tool === TOOLS.FILL ? 'active' : ''}"
                    onClick=${() => setTool(TOOLS.FILL)} title="Fill (G)">Fill</button>
            <button class="tool-btn ${tool === TOOLS.EYEDROPPER ? 'active' : ''}"
                    onClick=${() => setTool(TOOLS.EYEDROPPER)} title="Eyedropper (I)">Pick</button>
            <span style="width:1px;height:20px;background:#0f3460;margin:0 4px"></span>
            <button class="tool-btn" onClick=${onUndo} disabled=${!canUndo} title="Undo (Ctrl+Z)">Undo</button>
            <button class="tool-btn" onClick=${onRedo} disabled=${!canRedo} title="Redo (Ctrl+Y)">Redo</button>
        </div>
    `;
}

function ColorPalette({ color, setColor, palette }) {
    return html`
        <div class="palette-section">
            <div class="palette-header">Color</div>
            <div class="current-color">
                <div class="swatch" style="background:${color}"></div>
                <input type="color" value=${color} onInput=${e => setColor(e.target.value)} />
                <span style="font-size:11px;color:#aaa">${color}</span>
            </div>
            <div class="palette-grid">
                ${palette.map(c => html`
                    <div class="palette-color ${c === color ? 'active' : ''}"
                         style="background:${c}"
                         onClick=${() => setColor(c)}
                         title=${c} />
                `)}
            </div>
        </div>
    `;
}

function LayerPanel({ layers, activeLayer, setActiveLayer, toggleVisibility, clearLayer }) {
    return html`
        <div class="panel">
            <div class="panel-header">Layers</div>
            <div class="panel-body">
                ${[...LAYER_ORDER].reverse().map(id => html`
                    <div class="layer-item ${activeLayer === id ? 'active' : ''}"
                         onClick=${() => setActiveLayer(id)}>
                        <button class="visibility-btn"
                                onClick=${e => { e.stopPropagation(); toggleVisibility(id); }}
                                title=${layers[id].visible ? 'Hide' : 'Show'}>
                            ${layers[id].visible ? '\u{1F441}' : '\u25CB'}
                        </button>
                        <span class="layer-name">${LAYER_LABELS[id]}</span>
                        <button class="layer-clear-btn" onClick=${e => { e.stopPropagation(); clearLayer(id); }}
                                title="Clear layer">x</button>
                    </div>
                `)}
            </div>
        </div>
    `;
}

function LibraryPanel({ spriteW, spriteH, activeLayer, setActiveLayer, onLoadSprite, onSaveSprite }) {
    const activeTab = activeLayer;
    const [builtinSprites, setBuiltinSprites] = useState({});
    const [customLib, setCustomLib] = useState(loadCustomLibrary());
    const [loading, setLoading] = useState(false);

    // Load built-in sprites from manifest
    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const resp = await fetch('library/manifest.json');
                const manifest = await resp.json();
                const allSprites = {};
                for (const [cat, info] of Object.entries(manifest.categories)) {
                    allSprites[cat] = [];
                    for (const file of info.files) {
                        try {
                            const sheet = await loadSpriteSheet('library/' + file.path);
                            const sprites = extractSprites(sheet.ctx, sheet.width, sheet.height, spriteW);
                            allSprites[cat].push(...sprites.map((data, i) => ({
                                name: `${file.name} ${i + 1}`,
                                data,
                                w: spriteW,
                                h: spriteH,
                                builtin: true,
                            })));
                        } catch (e) {
                            console.warn('Failed to load', file.path, e);
                        }
                    }
                }
                setBuiltinSprites(allSprites);
            } catch (e) {
                console.warn('No manifest found, skipping built-in library', e);
            }
            setLoading(false);
        })();
    }, [spriteW, spriteH]);

    const handleSave = () => {
        const name = prompt('Name for this sprite part:');
        if (!name) return;
        onSaveSprite(activeLayer, name, (newLib) => setCustomLib(newLib));
    };

    const handleDelete = (cat, idx) => {
        if (confirm('Delete this custom sprite?')) {
            const newLib = removeFromCustomLibrary(cat, idx);
            setCustomLib({...newLib});
        }
    };

    const handleImportFile = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            try {
                const sheet = await loadSpriteSheet(url);
                const sprites = extractSprites(sheet.ctx, sheet.width, sheet.height, spriteW);
                if (sprites.length > 0) {
                    onLoadSprite(sprites[0], activeLayer);
                }
            } finally {
                URL.revokeObjectURL(url);
            }
        };
        input.click();
    };

    const handleExportLibrary = () => {
        if (allSprites.length === 0) {
            alert('No sprites to export in this category.');
            return;
        }
        // Pack all sprites in the current tab into a single sprite sheet
        const count = allSprites.length;
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        const c = document.createElement('canvas');
        c.width = cols * spriteW;
        c.height = rows * spriteH;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, c.width, c.height);
        allSprites.forEach((sprite, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const imgData = new ImageData(new Uint8ClampedArray(sprite.data), spriteW, spriteH);
            const tmp = document.createElement('canvas');
            tmp.width = spriteW;
            tmp.height = spriteH;
            tmp.getContext('2d').putImageData(imgData, 0, 0);
            ctx.drawImage(tmp, col * spriteW, row * spriteH);
        });
        const link = document.createElement('a');
        link.download = `${activeTab}_spritesheet.png`;
        link.href = c.toDataURL('image/png');
        link.click();
    };

    const handleImportLibrary = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const imported = JSON.parse(text);
                const existing = loadCustomLibrary();
                // Merge imported into existing
                for (const [cat, sprites] of Object.entries(imported)) {
                    if (!existing[cat]) existing[cat] = [];
                    existing[cat].push(...sprites);
                }
                saveCustomLibrary(existing);
                setCustomLib({...existing});
            } catch (err) {
                alert('Failed to import library: ' + err.message);
            }
        };
        input.click();
    };

    const allSprites = useMemo(() => {
        const builtins = builtinSprites[activeTab] || [];
        const customs = (customLib[activeTab] || []).map((s, i) => ({...s, customIndex: i}));
        return [...builtins, ...customs];
    }, [activeTab, builtinSprites, customLib]);

    return html`
        <div class="panel panel-right">
            <div class="panel-header">Library</div>
            <div class="library-tabs">
                ${LAYER_ORDER.map(id => html`
                    <button class="library-tab ${activeTab === id ? 'active' : ''}"
                            onClick=${() => setActiveLayer(id)}>${LAYER_LABELS[id]}</button>
                `)}
            </div>
            <div class="panel-body">
                ${loading ? html`<div style="padding:12px;text-align:center;color:#666">Loading...</div>` : ''}
                <div class="library-grid">
                    ${allSprites.map((sprite, i) => html`
                        <${SpriteThumb}
                            key=${`${activeTab}-${i}`}
                            sprite=${sprite}
                            spriteW=${spriteW}
                            spriteH=${spriteH}
                            onClick=${() => onLoadSprite(sprite.data, activeLayer)}
                            onDelete=${sprite.customIndex !== undefined ? () => handleDelete(activeTab, sprite.customIndex) : null}
                        />
                    `)}
                    ${!loading && allSprites.length === 0 ? html`
                        <div style="padding:12px;color:#666;font-size:11px;">No sprites yet</div>
                    ` : ''}
                </div>
            </div>
            <div class="library-actions">
                <button class="btn" onClick=${handleSave} title="Save current layer to library">Save to Library</button>
                <button class="btn" onClick=${handleImportFile} title="Import PNG file">Import PNG</button>
                <button class="btn" onClick=${handleExportLibrary} title="Export custom library as JSON">Export Library</button>
                <button class="btn" onClick=${handleImportLibrary} title="Import a previously exported library">Import Library</button>
            </div>
        </div>
    `;
}

function SpriteThumb({ sprite, spriteW, spriteH, onClick, onDelete }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current || !sprite.data) return;
        const c = canvasRef.current;
        c.width = spriteW;
        c.height = spriteH;
        const ctx = c.getContext('2d');
        const imgData = new ImageData(new Uint8ClampedArray(sprite.data), spriteW, spriteH);
        ctx.putImageData(imgData, 0, 0);
    }, [sprite.data, spriteW, spriteH]);

    return html`
        <div class="library-item" onClick=${onClick} title=${sprite.name || 'Sprite'}
             style="position:relative">
            <canvas ref=${canvasRef} />
            ${onDelete ? html`
                <button class="layer-clear-btn" style="position:absolute;top:0;right:0"
                        onClick=${e => { e.stopPropagation(); onDelete(); }}>x</button>
            ` : ''}
        </div>
    `;
}

function EditorCanvas({ layers, activeLayer, spriteW, spriteH, scale, tool, color, setColor, onDraw, showGrid }) {
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

function PreviewCanvas({ layers, spriteW, spriteH }) {
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

// ─── Main App ───────────────────────────────────────────────────────
function App() {
    const [spriteW, setSpriteW] = useState(16);
    const [spriteH, setSpriteH] = useState(16);
    const [scale, setScale] = useState(24);
    const [showGrid, setShowGrid] = useState(true);
    const [tool, setTool] = useState(TOOLS.PENCIL);
    const [color, setColor] = useState('#e94560');
    const [activeLayer, setActiveLayer] = useState('body');

    const [layers, setLayers] = useState(() => {
        const l = {};
        for (const id of LAYER_ORDER) {
            l[id] = { data: createLayerData(16, 16), visible: true };
        }
        return l;
    });

    // Undo/Redo
    const undoStack = useRef([]);
    const redoStack = useRef([]);
    const strokeBuffer = useRef(null); // snapshot before current stroke

    const pushUndo = useCallback(() => {
        undoStack.current.push(JSON.parse(JSON.stringify(layers)));
        if (undoStack.current.length > 50) undoStack.current.shift();
        redoStack.current = [];
    }, [layers]);

    const undo = useCallback(() => {
        if (undoStack.current.length === 0) return;
        redoStack.current.push(JSON.parse(JSON.stringify(layers)));
        const prev = undoStack.current.pop();
        // Restore Uint8ClampedArrays
        for (const id of LAYER_ORDER) {
            prev[id].data = new Uint8ClampedArray(prev[id].data);
        }
        setLayers(prev);
    }, [layers]);

    const redo = useCallback(() => {
        if (redoStack.current.length === 0) return;
        undoStack.current.push(JSON.parse(JSON.stringify(layers)));
        const next = redoStack.current.pop();
        for (const id of LAYER_ORDER) {
            next[id].data = new Uint8ClampedArray(next[id].data);
        }
        setLayers(next);
    }, [layers]);

    // Handle drawing
    const handleDraw = useCallback((x, y, drawTool, drawColor, strokeEnd = false) => {
        if (strokeEnd) {
            strokeBuffer.current = null;
            return;
        }

        setLayers(prev => {
            // Snapshot before first pixel of stroke
            if (!strokeBuffer.current) {
                strokeBuffer.current = true;
                undoStack.current.push(JSON.parse(JSON.stringify(prev)));
                if (undoStack.current.length > 50) undoStack.current.shift();
                redoStack.current = [];
            }

            const layer = prev[activeLayer];
            const newData = new Uint8ClampedArray(layer.data);

            if (drawTool === TOOLS.PENCIL) {
                setPixel(newData, x, y, spriteW, hexToRgba(drawColor));
            } else if (drawTool === TOOLS.ERASER) {
                setPixel(newData, x, y, spriteW, [0, 0, 0, 0]);
            } else if (drawTool === TOOLS.FILL) {
                const fillRgba = hexToRgba(drawColor);
                floodFill(newData, x, y, spriteW, spriteH, fillRgba);
            }

            return {
                ...prev,
                [activeLayer]: { ...layer, data: newData },
            };
        });
    }, [activeLayer, spriteW, spriteH]);

    const toggleVisibility = useCallback((id) => {
        setLayers(prev => ({
            ...prev,
            [id]: { ...prev[id], visible: !prev[id].visible },
        }));
    }, []);

    const clearLayer = useCallback((id) => {
        pushUndo();
        setLayers(prev => ({
            ...prev,
            [id]: { ...prev[id], data: createLayerData(spriteW, spriteH) },
        }));
    }, [spriteW, spriteH, pushUndo]);

    // Load sprite into a layer
    const loadSprite = useCallback((spriteData, targetLayer) => {
        const layerId = targetLayer || activeLayer;
        pushUndo();
        setLayers(prev => ({
            ...prev,
            [layerId]: { ...prev[layerId], data: new Uint8ClampedArray(spriteData) },
        }));
    }, [activeLayer, pushUndo]);

    // Save current layer to custom library
    const saveToLibrary = useCallback((category, name, onDone) => {
        const layer = layers[activeLayer];
        const newLib = addToCustomLibrary(category, name, layer.data, spriteW, spriteH);
        if (onDone) onDone({...newLib});
    }, [layers, activeLayer, spriteW, spriteH]);

    // Resize handler
    const handleResize = useCallback((newW, newH) => {
        pushUndo();
        const newLayers = {};
        for (const id of LAYER_ORDER) {
            const oldData = layers[id].data;
            const newData = createLayerData(newW, newH);
            const minW = Math.min(spriteW, newW);
            const minH = Math.min(spriteH, newH);
            for (let y = 0; y < minH; y++) {
                for (let x = 0; x < minW; x++) {
                    const px = getPixel(oldData, x, y, spriteW);
                    setPixel(newData, x, y, newW, px);
                }
            }
            newLayers[id] = { data: newData, visible: layers[id].visible };
        }
        setSpriteW(newW);
        setSpriteH(newH);
        setLayers(newLayers);
    }, [layers, spriteW, spriteH, pushUndo]);

    // Export composite PNG
    const exportPNG = useCallback(() => {
        const c = document.createElement('canvas');
        c.width = spriteW;
        c.height = spriteH;
        const ctx = c.getContext('2d');
        for (const id of LAYER_ORDER) {
            const layer = layers[id];
            if (!layer.visible) continue;
            const imgData = new ImageData(new Uint8ClampedArray(layer.data), spriteW, spriteH);
            const tmp = document.createElement('canvas');
            tmp.width = spriteW;
            tmp.height = spriteH;
            tmp.getContext('2d').putImageData(imgData, 0, 0);
            ctx.drawImage(tmp, 0, 0);
        }
        const link = document.createElement('a');
        link.download = 'character_sprite.png';
        link.href = c.toDataURL('image/png');
        link.click();
    }, [layers, spriteW, spriteH]);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z') { e.preventDefault(); undo(); }
                if (e.key === 'y') { e.preventDefault(); redo(); }
                if (e.key === 's') { e.preventDefault(); exportPNG(); }
                return;
            }
            if (e.key === 'b') setTool(TOOLS.PENCIL);
            if (e.key === 'e') setTool(TOOLS.ERASER);
            if (e.key === 'g') setTool(TOOLS.FILL);
            if (e.key === 'i') setTool(TOOLS.EYEDROPPER);
            if (e.key === 'h') setShowGrid(g => !g);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [undo, redo, exportPNG]);

    return html`
        <header>
            <h1>Character Sprite Editor</h1>
            <div class="header-controls">
                <label>W:</label>
                <input type="number" value=${spriteW} min="8" max="64" step="1"
                       onChange=${e => { const v = parseInt(e.target.value); if (v >= 8 && v <= 64) handleResize(v, spriteH); }} />
                <label>H:</label>
                <input type="number" value=${spriteH} min="8" max="64" step="1"
                       onChange=${e => { const v = parseInt(e.target.value); if (v >= 8 && v <= 64) handleResize(spriteW, v); }} />
                <label>Zoom:</label>
                <input type="number" value=${scale} min="8" max="48" step="2"
                       onChange=${e => setScale(parseInt(e.target.value) || 24)} />
                <label style="margin-left:4px">
                    <input type="checkbox" checked=${showGrid} onChange=${() => setShowGrid(g => !g)} />
                    ${' '}Grid
                </label>
                <span style="width:1px;height:20px;background:#0f3460;margin:0 4px"></span>
                <button class="btn btn-primary" onClick=${exportPNG}>Export PNG</button>
            </div>
        </header>
        <div class="main-layout">
            <${LayerPanel}
                layers=${layers}
                activeLayer=${activeLayer}
                setActiveLayer=${setActiveLayer}
                toggleVisibility=${toggleVisibility}
                clearLayer=${clearLayer}
            />
            <div class="editor-area">
                <${ToolBar}
                    tool=${tool}
                    setTool=${setTool}
                    onUndo=${undo}
                    onRedo=${redo}
                    canUndo=${undoStack.current.length > 0}
                    canRedo=${redoStack.current.length > 0}
                />
                <${EditorCanvas}
                    layers=${layers}
                    activeLayer=${activeLayer}
                    spriteW=${spriteW}
                    spriteH=${spriteH}
                    scale=${scale}
                    tool=${tool}
                    color=${color}
                    setColor=${setColor}
                    onDraw=${handleDraw}
                    showGrid=${showGrid}
                />
                <${PreviewCanvas}
                    layers=${layers}
                    spriteW=${spriteW}
                    spriteH=${spriteH}
                />
                <${ColorPalette}
                    color=${color}
                    setColor=${setColor}
                    palette=${DEFAULT_PALETTE}
                />
            </div>
            <${LibraryPanel}
                spriteW=${spriteW}
                spriteH=${spriteH}
                activeLayer=${activeLayer}
                setActiveLayer=${setActiveLayer}
                onLoadSprite=${loadSprite}
                onSaveSprite=${saveToLibrary}
            />
        </div>
    `;
}

// ─── Mount ──────────────────────────────────────────────────────────
render(html`<${App} />`, document.getElementById('app'));
