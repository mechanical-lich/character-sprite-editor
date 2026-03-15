import { h, render } from 'https://esm.sh/preact@10.19.3';
import { useState, useRef, useEffect, useCallback } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';

import { LAYER_ORDER, TOOLS, DEFAULT_PALETTE } from './constants.js';
import { createLayerData, getPixel, setPixel, hexToRgba, floodFill } from './utils.js';
import { addToCustomLibrary } from './storage.js';
import { ColorPalette } from './palette.js';
import { LayerPanel } from './layers.js';
import { EditorCanvas, PreviewCanvas } from './canvas.js';
import { LibraryPanel } from './library.js';

const html = htm.bind(h);

// ─── ToolBar ─────────────────────────────────────────────────────────
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

// ─── Main App ────────────────────────────────────────────────────────
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
    const strokeBuffer = useRef(null);

    const pushUndo = useCallback(() => {
        undoStack.current.push(JSON.parse(JSON.stringify(layers)));
        if (undoStack.current.length > 50) undoStack.current.shift();
        redoStack.current = [];
    }, [layers]);

    const undo = useCallback(() => {
        if (undoStack.current.length === 0) return;
        redoStack.current.push(JSON.parse(JSON.stringify(layers)));
        const prev = undoStack.current.pop();
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

    const loadSprite = useCallback((spriteData, targetLayer) => {
        const layerId = targetLayer || activeLayer;
        pushUndo();
        setLayers(prev => ({
            ...prev,
            [layerId]: { ...prev[layerId], data: new Uint8ClampedArray(spriteData) },
        }));
    }, [activeLayer, pushUndo]);

    const saveToLibrary = useCallback((category, name, onDone) => {
        const layer = layers[activeLayer];
        const newLib = addToCustomLibrary(category, name, layer.data, spriteW, spriteH);
        if (onDone) onDone({...newLib});
    }, [layers, activeLayer, spriteW, spriteH]);

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

// ─── Mount ───────────────────────────────────────────────────────────
render(html`<${App} />`, document.getElementById('app'));
