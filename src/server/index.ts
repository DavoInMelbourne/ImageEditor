import express from 'express';
import path from 'path';
import fs from 'fs';
import { apiRouter } from './routes.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// __dirname = dist/ when bundled by esbuild
const ROOT = path.join(__dirname, '..');
const uploadsDir = path.join(ROOT, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.static(path.join(ROOT, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(uploadsDir));

app.use('/api', apiRouter(uploadsDir));

app.listen(PORT, () => {
  console.log(`\n  🎨 Image Editor running at http://localhost:${PORT}\n`);
});
