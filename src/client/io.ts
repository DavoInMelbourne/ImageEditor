/**
 * File I/O — import PNG/SVG, export SVG/PNG, drag-and-drop.
 */
import { state, setStatus } from './state.js';
import { renderSVG, getCurrentSVG, showLoading, hideLoading } from './canvas.js';
import { convertPngFile } from './conversion.js';

export function initIO(): void {
  const pngInput = document.getElementById('file-png') as HTMLInputElement;
  const svgInput = document.getElementById('file-svg') as HTMLInputElement;

  document.getElementById('btn-import-png')!.addEventListener('click', () => pngInput.click());
  document.getElementById('btn-import-svg')!.addEventListener('click', () => svgInput.click());
  document.getElementById('btn-export-svg')!.addEventListener('click', exportSVG);
  document.getElementById('btn-export-png')!.addEventListener('click', exportPNG);

  pngInput.addEventListener('change', () => {
    if (pngInput.files?.[0]) {
      convertPngFile(pngInput.files[0]);
      pngInput.value = '';
    }
  });

  svgInput.addEventListener('change', () => {
    if (svgInput.files?.[0]) {
      importSVGFile(svgInput.files[0]);
      svgInput.value = '';
    }
  });

  initDragDrop();
}

function importSVGFile(file: File): void {
  state.originalFilename = file.name.replace(/\.[^.]+$/, '');
  const reader = new FileReader();
  reader.onload = (e) => {
    const svgString = e.target?.result as string;
    renderSVG(svgString);
    setStatus(`Loaded ${file.name}`);
  };
  reader.readAsText(file);
}

function exportSVG(): void {
  const svg = getCurrentSVG();
  if (!svg) { setStatus('No SVG to export'); return; }

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.originalFilename || 'edited'}.svg`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('SVG exported');
}

async function exportPNG(): Promise<void> {
  const svg = getCurrentSVG();
  if (!svg) { setStatus('No SVG to export'); return; }

  showLoading();
  setStatus('Exporting PNG...');

  try {
    const resp = await fetch('/api/export-png', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ svg, width: 1920, height: 1080 }),
    });

    if (!resp.ok) throw new Error('Export failed');

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.originalFilename || 'edited'}.png`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('PNG exported');
  } catch (err: any) {
    setStatus(`Export failed: ${err.message}`);
  } finally {
    hideLoading();
  }
}

function initDragDrop(): void {
  const dropZone = document.getElementById('drop-zone');
  const container = document.getElementById('canvas-container')!;

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  container.addEventListener('dragenter', (e) => {
    handleDrag(e);
    dropZone?.classList.add('dragover');
  });
  container.addEventListener('dragover', handleDrag);
  container.addEventListener('dragleave', (e) => {
    handleDrag(e);
    dropZone?.classList.remove('dragover');
  });

  container.addEventListener('drop', (e) => {
    handleDrag(e);
    dropZone?.classList.remove('dragover');

    const file = e.dataTransfer?.files[0];
    if (!file) return;

    if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
      importSVGFile(file);
    } else if (file.type.startsWith('image/')) {
      convertPngFile(file);
    } else {
      setStatus('Unsupported file type — use PNG or SVG');
    }
  });
}
