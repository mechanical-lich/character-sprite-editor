import { h } from 'https://esm.sh/preact@10.19.3';
import htm from 'https://esm.sh/htm@3.1.1';

import { LAYER_ORDER, LAYER_LABELS } from './constants.js';

const html = htm.bind(h);

export function LayerPanel({ layers, activeLayer, setActiveLayer, toggleVisibility, clearLayer }) {
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
