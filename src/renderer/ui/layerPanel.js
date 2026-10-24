/**
 * Layer Management Panel
 * Renders CAD layers with visibility toggles and active layer selection.
 */
import { state } from '../state.js';
import { getColor, render } from '../viewport.js';

export function renderLayers(updateUIFn) {
  const layerContainer = document.getElementById('layers-container');
  if (!layerContainer) return;
  layerContainer.innerHTML = '';

  state.layers.forEach(l => {
    const div = document.createElement('div');
    div.className = `layer-item ${l.name === state.curLayer ? 'active' : ''}`;
    div.innerHTML = `
      <input type="checkbox" ${l.visible ? 'checked' : ''} title="Visibility">
      <span class="color-swatch" style="background: ${getColor(l.aci)}"></span>
      <span style="flex:1;">${l.name}</span>
    `;
    div.querySelector('input').onclick = e => {
      e.stopPropagation();
      l.visible = e.target.checked;
      render();
    };
    div.onclick = () => {
      state.curLayer = l.name;
      if (updateUIFn) updateUIFn();
    };
    layerContainer.appendChild(div);
  });
}

export function initLayerUI(updateUIFn) {
  const btnAdd = document.getElementById('btn-add-layer');
  if (btnAdd) {
    btnAdd.onclick = () => {
      const name = prompt('New layer name:');
      if (name && !state.layers.some(l => l.name === name)) {
        state.layers.push({ name, aci: Math.floor(Math.random() * 8) + 1, visible: true });
        state.curLayer = name;
        if (updateUIFn) updateUIFn();
        render();
      }
    };
  }
}
