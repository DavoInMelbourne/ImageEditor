/**
 * Export presets for social media platforms + custom dimensions.
 */
import { setStatus } from './state.js';
import { getCurrentSVG, getTightBounds, TightBounds, showLoading, hideLoading } from './canvas.js';
import { state } from './state.js';
import { log } from './logger.js';

interface ExportPreset {
  name: string;
  platform: string;
  width: number;
  height: number;
  category: string;
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

interface ExportPreset {
  name: string;
  platform: string;
  width: number;
  height: number;
  category: string;
}

const PRESETS: ExportPreset[] = [
  // YouTube
  { name: 'Channel Banner',   platform: 'YouTube',   width: 2560, height: 1440, category: 'Banner' },
  { name: 'Thumbnail',        platform: 'YouTube',   width: 1280, height: 720,  category: 'Thumbnail' },

  // Instagram
  { name: 'Post (Square)',    platform: 'Instagram',  width: 1080, height: 1080, category: 'Post' },
  { name: 'Story / Reel',    platform: 'Instagram',  width: 1080, height: 1920, category: 'Story' },
  { name: 'Landscape Post',  platform: 'Instagram',  width: 1080, height: 566,  category: 'Post' },

  // Facebook / Meta
  { name: 'Cover Photo',     platform: 'Facebook',   width: 820,  height: 360,  category: 'Banner' },
  { name: 'Post',            platform: 'Facebook',   width: 1200, height: 630,  category: 'Post' },
  { name: 'Profile Photo',   platform: 'Facebook',   width: 170,  height: 170,  category: 'Profile' },

  // X / Twitter
  { name: 'Header',          platform: 'X / Twitter', width: 1500, height: 500,  category: 'Banner' },
  { name: 'Post Image',      platform: 'X / Twitter', width: 1200, height: 675,  category: 'Post' },

  // Bluesky
  { name: 'Banner',          platform: 'Bluesky',    width: 1500, height: 500,  category: 'Banner' },
  { name: 'Post Image',      platform: 'Bluesky',    width: 1200, height: 675,  category: 'Post' },

  // Ko-fi
  { name: 'Shop Banner',     platform: 'Ko-fi',      width: 1200, height: 400,  category: 'Banner' },
  { name: 'Post Image',      platform: 'Ko-fi',      width: 1200, height: 600,  category: 'Post' },

  // Flickr
  { name: 'Cover Photo',     platform: 'Flickr',     width: 2048, height: 492,  category: 'Banner' },

  // LinkedIn
  { name: 'Banner',          platform: 'LinkedIn',   width: 1584, height: 396,  category: 'Banner' },
  { name: 'Post',            platform: 'LinkedIn',   width: 1200, height: 627,  category: 'Post' },

  // Discord
  { name: 'Server Banner',   platform: 'Discord',    width: 960,  height: 540,  category: 'Banner' },

  // Twitch
  { name: 'Offline Banner',  platform: 'Twitch',     width: 1920, height: 1080, category: 'Banner' },
  { name: 'Panel',           platform: 'Twitch',     width: 320,  height: 160,  category: 'Panel' },
];

export function initExportPresets(): void {
  const section = document.getElementById('section-export-presets');
  if (!section) return;

  const platformSelect = document.getElementById('export-platform') as HTMLSelectElement;
  const presetList = document.getElementById('preset-list')!;
  const customW = document.getElementById('custom-width') as HTMLInputElement;
  const customH = document.getElementById('custom-height') as HTMLInputElement;
  const customBtn = document.getElementById('btn-export-custom') as HTMLButtonElement;
  const outputDirInput = document.getElementById('output-dir') as HTMLInputElement;
  const changeDirBtn = document.getElementById('btn-change-dir') as HTMLButtonElement;
  const autoCropCheckbox = document.getElementById('auto-crop') as HTMLInputElement;

  if (autoCropCheckbox) {
    autoCropCheckbox.checked = true;
  }

  // Load current output directory from server
  fetch('/api/output-dir')
    .then(r => r.json())
    .then(data => {
      outputDirInput.value = data.outputDir;
      log.info('Output directory:', data.outputDir);
    })
    .catch(() => { outputDirInput.value = '~/Downloads'; });

  changeDirBtn.addEventListener('click', () => {
    const newDir = prompt('Enter output directory path:', outputDirInput.value);
    if (newDir) {
      fetch('/api/output-dir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: newDir }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.error) {
            setStatus(`Error: ${data.error}`);
            log.error('Failed to set output dir:', data.error);
          } else {
            outputDirInput.value = data.outputDir;
            setStatus(`Output directory: ${data.outputDir}`);
            log.info('Output directory changed to:', data.outputDir);
          }
        });
    }
  });

  // Populate platforms
  const platforms = [...new Set(PRESETS.map(p => p.platform))];
  platformSelect.innerHTML = '<option value="all">All Platforms</option>';
  platforms.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    platformSelect.appendChild(opt);
  });

  function renderPresets(): void {
    const filter = platformSelect.value;
    const filtered = filter === 'all' ? PRESETS : PRESETS.filter(p => p.platform === filter);

    presetList.innerHTML = '';
    filtered.forEach(preset => {
      const btn = document.createElement('button');
      btn.className = 'preset-export-btn';
      btn.innerHTML = `
        <span class="preset-name">${preset.platform} — ${preset.name}</span>
        <span class="preset-dims">${preset.width}×${preset.height}</span>
      `;
      btn.addEventListener('click', () => {
        const format = (document.getElementById('export-format') as HTMLSelectElement).value as 'png' | 'svg';
        exportAtSize(preset.width, preset.height, `${preset.platform}_${preset.name}`, format);
      });
      presetList.appendChild(btn);
    });
  }

  platformSelect.addEventListener('change', renderPresets);
  renderPresets();

  customBtn.addEventListener('click', () => {
    const w = parseInt(customW.value);
    const h = parseInt(customH.value);
    if (w > 0 && h > 0) {
      const format = (document.getElementById('export-format') as HTMLSelectElement).value as 'png' | 'svg';
      exportAtSize(w, h, `custom_${w}x${h}`, format);
    } else {
      setStatus('Enter valid width and height');
    }
  });
}

async function exportAtSize(targetWidth: number, targetHeight: number, name: string, format: 'png' | 'svg' = 'png'): Promise<void> {
  const svg = getCurrentSVG();
  if (!svg) { setStatus('No image to export'); return; }

  const autoCrop = (document.getElementById('auto-crop') as HTMLInputElement)?.checked ?? true;
  const bounds = autoCrop ? getTightBounds() : null;

  let exportSvg = svg;
  let exportWidth = targetWidth;
  let exportHeight = targetHeight;

  if (bounds) {
    exportSvg = applyBoundsToSVG(svg, bounds);
    exportWidth = bounds.width;
    exportHeight = bounds.height;
  } else if (format === 'svg') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (svgEl) {
      if (!svgEl.getAttribute('viewBox')) {
        const origW = svgEl.getAttribute('width') || String(targetWidth);
        const origH = svgEl.getAttribute('height') || String(targetHeight);
        svgEl.setAttribute('viewBox', `0 0 ${origW} ${origH}`);
      }
      svgEl.setAttribute('width', String(targetWidth));
      svgEl.setAttribute('height', String(targetHeight));
      exportSvg = new XMLSerializer().serializeToString(svgEl);
    }
  }

  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${state.originalFilename || 'image'}_${safeName}_${exportWidth}x${exportHeight}`;

  log.info(`Exporting ${format.toUpperCase()} at ${exportWidth}×${exportHeight} for ${name}`);

  showLoading();
  setStatus(`Saving ${format.toUpperCase()} ${exportWidth}×${exportHeight}...`);

  if (format === 'png') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = exportWidth;
      canvas.height = exportHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      const img = new Image();
      const svgBlob = new Blob([exportSvg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0, exportWidth, exportHeight);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to load SVG'));
        };
        img.src = url;
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setStatus('PNG export failed');
          hideLoading();
          return;
        }
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        
        const resp = await fetch('/api/save-base64-png', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            pngData: base64, 
            filename: filename + '.png',
            format: 'png',
            width: exportWidth,
            height: exportHeight 
          }),
        });
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        log.info(`Saved: ${data.path}`);
        setStatus(`Saved to ${data.path}`);
        hideLoading();
      }, 'image/png');
    } catch (err: any) {
      log.error('Save failed:', err.message);
      setStatus(`Save failed: ${err.message}`);
      hideLoading();
    }
    return;
  }

  try {
    const resp = await fetch('/api/save-to-dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ svg: exportSvg, filename, format, width: exportWidth, height: exportHeight }),
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    log.info(`Saved: ${data.path}`);
    setStatus(`Saved to ${data.path}`);
  } catch (err: any) {
    log.error('Save failed:', err.message);
    setStatus(`Save failed: ${err.message}`);
  } finally {
    hideLoading();
  }
}
