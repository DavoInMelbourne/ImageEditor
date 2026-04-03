/**
 * App entry point — wires all modules together.
 */
import { undo, redo } from './state.js';
import { renderSVG, initZoom } from './canvas.js';
import { initConversion } from './conversion.js';
import { initSmoothing } from './smoothing.js';
import { initComponents } from './components.js';
import { initPalette } from './palette.js';
import { initTextReplace } from './text.js';
import { initIO } from './io.js';
import { initExportPresets } from './export-presets.js';
import { log } from './logger.js';

function init(): void {
  initZoom();
  initConversion();
  initSmoothing();
  initComponents();
  initPalette();
  initTextReplace();
  initExportPresets();
  initIO();
  log.info('SVG Image Editor initialized');

  // Undo/Redo
  document.getElementById('btn-undo')!.addEventListener('click', () => {
    const svg = undo();
    if (svg) renderSVG(svg, false);
  });
  document.getElementById('btn-redo')!.addEventListener('click', () => {
    const svg = redo();
    if (svg) renderSVG(svg, false);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        const svg = redo();
        if (svg) renderSVG(svg, false);
      } else {
        const svg = undo();
        if (svg) renderSVG(svg, false);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
