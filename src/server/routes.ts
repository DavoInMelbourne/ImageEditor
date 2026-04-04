import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { convertPngToSvg, ConvertOptions } from './conversion.js';
import sharp from 'sharp';

const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), 'Downloads');

export function apiRouter(uploadsDir: string): Router {
  const router = Router();
  const upload = multer({ dest: uploadsDir });
  let outputDir = DEFAULT_OUTPUT_DIR;

  // Get/set output directory
  router.get('/output-dir', (_req: Request, res: Response) => {
    res.json({ outputDir, default: DEFAULT_OUTPUT_DIR });
  });

  router.post('/output-dir', (req: Request, res: Response) => {
    const { dir } = req.body as { dir: string };
    if (!dir) { res.status(400).json({ error: 'No directory specified' }); return; }
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); }
      catch (err: any) { res.status(400).json({ error: `Cannot create directory: ${err.message}` }); return; }
    }
    outputDir = dir;
    res.json({ outputDir });
  });

  // Save file to output directory
  router.post('/save-to-dir', async (req: Request, res: Response) => {
    try {
      const { svg, filename, format, width, height } = req.body as {
        svg: string; filename: string; format: 'png' | 'svg'; width?: number; height?: number;
      };

      const safeName = (filename || 'export').replace(/[^a-zA-Z0-9_.-]/g, '_');

      if (format === 'svg') {
        const outPath = path.join(outputDir, safeName + '.svg');
        fs.writeFileSync(outPath, svg);
        res.json({ path: outPath });
      } else {
        const w = width || 800;
        const h = height || 600;
        const pngBuffer = await sharp(Buffer.from(svg))
          .resize(w, h, { fit: 'inside' })
          .png()
          .toBuffer();
        const outPath = path.join(outputDir, safeName + '.png');
        fs.writeFileSync(outPath, pngBuffer);
        res.json({ path: outPath });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/png-to-svg', upload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const options: ConvertOptions = {
        mode: (req.body.mode as 'color' | 'mono') || 'color',
        threshold: parseInt(req.body.threshold) || 128,
        turdSize: parseInt(req.body.turdSize) || 2,
        nColors: parseInt(req.body.nColors) || 8,
        color: req.body.color || 'auto',
      };

      const result = await convertPngToSvg(req.file.path, options);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/save-svg', (req: Request, res: Response) => {
    try {
      const { svg, filename } = req.body as { svg: string; filename?: string };
      const safeName = (filename || 'output').replace(/[^a-zA-Z0-9_-]/g, '_') + '.svg';
      const outPath = path.join(uploadsDir, safeName);
      fs.writeFileSync(outPath, svg);
      res.json({ path: `/uploads/${safeName}`, filename: safeName });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/export-png', async (req: Request, res: Response) => {
    try {
      const { svg, width, height } = req.body as { svg: string; width?: number; height?: number };
      const w = width || 800;
      const h = height || 600;
      const pngBuffer = await sharp(Buffer.from(svg))
        .resize(w, h, { fit: 'inside' })
        .png()
        .toBuffer();
      res.set('Content-Type', 'image/png');
      res.set('Content-Disposition', 'attachment; filename="export.png"');
      res.send(pngBuffer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/save-base64-png', async (req: Request, res: Response) => {
    try {
      const { pngData, filename, width, height } = req.body as {
        pngData: string; filename: string; width: number; height: number;
      };

      const safeName = (filename || 'export').replace(/[^a-zA-Z0-9_.-]/g, '_');
      const pngBuffer = Buffer.from(pngData, 'base64');
      const outPath = path.join(outputDir, safeName);
      fs.writeFileSync(outPath, pngBuffer);
      res.json({ path: outPath });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
