/**
 * PNG-to-SVG conversion — calls the server-side potrace endpoint.
 */
import { state, setStatus } from './state.js';
import { renderSVG, showLoading, hideLoading } from './canvas.js';
import { log } from './logger.js';

export function initConversion(): void {
  const modeSelect = document.getElementById('convert-mode') as HTMLSelectElement;
  const colorsSlider = document.getElementById('convert-colors') as HTMLInputElement;
  const turdSlider = document.getElementById('convert-turd') as HTMLInputElement;
  const thresholdSlider = document.getElementById('convert-threshold') as HTMLInputElement;
  const reconvertBtn = document.getElementById('btn-reconvert') as HTMLButtonElement;

  const colorsVal = document.getElementById('color-count-val')!;
  const turdVal = document.getElementById('turd-val')!;
  const thresholdVal = document.getElementById('threshold-val')!;
  const colorCountControl = document.getElementById('color-count-control')!;

  modeSelect.addEventListener('change', () => {
    colorCountControl.style.display = modeSelect.value === 'color' ? 'block' : 'none';
  });

  colorsSlider.addEventListener('input', () => { colorsVal.textContent = colorsSlider.value; });
  turdSlider.addEventListener('input', () => { turdVal.textContent = turdSlider.value; });
  thresholdSlider.addEventListener('input', () => { thresholdVal.textContent = thresholdSlider.value; });

  reconvertBtn.addEventListener('click', () => {
    if (state.pngFile) convertPngFile(state.pngFile);
  });
}

export async function convertPngFile(file: File): Promise<void> {
  state.pngFile = file;
  state.originalFilename = file.name.replace(/\.[^.]+$/, '');

  const modeSelect = document.getElementById('convert-mode') as HTMLSelectElement;
  const colorsSlider = document.getElementById('convert-colors') as HTMLInputElement;
  const turdSlider = document.getElementById('convert-turd') as HTMLInputElement;
  const thresholdSlider = document.getElementById('convert-threshold') as HTMLInputElement;
  const reconvertBtn = document.getElementById('btn-reconvert') as HTMLButtonElement;

  const formData = new FormData();
  formData.append('image', file);
  formData.append('mode', modeSelect.value);
  formData.append('nColors', colorsSlider.value);
  formData.append('turdSize', turdSlider.value);
  formData.append('threshold', thresholdSlider.value);

  showLoading();
  setStatus('Converting PNG to SVG...');

  try {
    const resp = await fetch('/api/png-to-svg', { method: 'POST', body: formData });
    const data = await resp.json();

    if (data.error) {
      setStatus(`Error: ${data.error}`);
      return;
    }

    log.info(`Conversion complete: ${data.width}×${data.height}, SVG size: ${data.svg.length} bytes`);
    renderSVG(data.svg);
    reconvertBtn.style.display = 'block';
    setStatus(`Converted! ${data.width}×${data.height}`);
  } catch (err: any) {
    setStatus(`Conversion failed: ${err.message}`);
  } finally {
    hideLoading();
  }
}
