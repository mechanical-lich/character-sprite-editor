import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useRef, useEffect, useMemo } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';

import { LAYER_ORDER, LAYER_LABELS } from './constants.js';
import { loadSpriteSheet, extractSprites } from './utils.js';
import { loadCustomLibrary, saveCustomLibrary, removeFromCustomLibrary } from './storage.js';

const html = htm.bind(h);

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

export function LibraryPanel({ spriteW, spriteH, activeLayer, setActiveLayer, onLoadSprite, onSaveSprite }) {
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

    const allSprites = useMemo(() => {
        const builtins = builtinSprites[activeTab] || [];
        const customs = (customLib[activeTab] || []).map((s, i) => ({...s, customIndex: i}));
        return [...builtins, ...customs];
    }, [activeTab, builtinSprites, customLib]);

    const handleExportLibrary = () => {
        if (allSprites.length === 0) {
            alert('No sprites to export in this category.');
            return;
        }
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
