import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import app, { initialize } from './server/app';

async function bootstrap() {
  await initialize();
  const distDir = path.join(process.cwd(), 'dist');
  const publicDir = path.join(process.cwd(), 'public');
  const staticRoot = process.env.NODE_ENV === 'production' && fs.existsSync(distDir) ? distDir : publicDir;
  app.use(express.static(staticRoot));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) { res.status(404).json({ error: 'API adresi bulunamadı.' }); return; }
    res.sendFile(path.join(staticRoot, 'index.html'));
  });
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => console.log(`[MAXBAHIS STAFF HUB] http://localhost:${port} (PostgreSQL)`));
}
bootstrap().catch((error) => { console.error('[Başlatma]', error instanceof Error ? error.message : 'Sunucu başlatılamadı'); process.exit(1); });