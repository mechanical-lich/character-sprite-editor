import { h } from 'https://esm.sh/preact@10.19.3';
import htm from 'https://esm.sh/htm@3.1.1';

const html = htm.bind(h);

export function ColorPalette({ color, setColor, palette }) {
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
