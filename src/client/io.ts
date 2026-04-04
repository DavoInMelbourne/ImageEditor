/**
 * File I/O — import PNG/SVG, export SVG/PNG, drag-and-drop.
 */
import { state, setStatus } from './state.js';
import { renderSVG, getCurrentSVG, getTightBounds, getOriginalDimensions, TightBounds, showLoading, hideLoading } from './canvas.js';
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

function applyBoundsToSVG(svg: string, bounds: TightBounds): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) return svg;

  const origWidth = parseInt(svgEl.getAttribute('width') || '0') || 0;
  const origHeight = parseInt(svgEl.getAttribute('height') || '0') || 0;

  svgEl.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  
  if (origWidth > 0 && origHeight > 0) {
    svgEl.setAttribute('width', String(origWidth));
    svgEl.setAttribute('height', String(origHeight));
  } else {
    svgEl.setAttribute('width', String(bounds.width));
    svgEl.setAttribute('height', String(bounds.height));
  }

  return new XMLSerializer().serializeToString(svgEl);
}

function exportSVG(): void {
  const svg = getCurrentSVG();
  if (!svg) { setStatus('No SVG to export'); return; }

  const bounds = getTightBounds();
  const svgWithBounds = bounds ? applyBoundsToSVG(svg, bounds) : svg;

  const blob = new Blob([svgWithBounds], { type: 'image/svg+xml' });
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

  const bounds = getTightBounds();
  const svgWithBounds = bounds ? applyBoundsToSVG(svg, bounds) : svg;

  const svgMatch = svg.match(/width="(\d+)"\s+height="(\d+)"/);
  const origWidth = svgMatch ? parseInt(svgMatch[1]) : 1920;
  const origHeight = svgMatch ? parseInt(svgMatch[2]) : 1080;

  console.log('--- PNG Export Debug ---');
  console.log('Original dimensions:', origWidth, 'x', origHeight);
  console.log('Bounds:', bounds);
  console.log('SVG viewBox:', svgWithBounds.match(/viewBox="([^"]+)"/)?.[1]);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = origWidth;
    canvas.height = origHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    const img = new Image();
    const svgBlob = new Blob([svgWithBounds], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        console.log('Image natural size:', img.naturalWidth, 'x', img.naturalHeight);
        ctx.drawImage(img, 0, 0, origWidth, origHeight);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = (e) => {
        console.error('Image load error:', e);
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG'));
      };
      img.src = url;
    });

    canvas.toBlob((blob) => {
      if (!blob) {
        setStatus('PNG export failed');
        hideLoading();
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.originalFilename || 'edited'}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('PNG exported');
      hideLoading();
    }, 'image/png');
  } catch (err: any) {
    setStatus(`Export failed: ${err.message}`);
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
