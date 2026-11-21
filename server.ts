import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { store } from './server/database/store';
import { apiRouter } from './server/routes/index';
import { realtime } from './server/services/realtime';

async function bootstrap() {
  await store.init();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

  // Mount API routes
  app.use('/api', apiRouter);

  // Serve static frontend files (Vanilla HTML5 + CSS3 + ES6+ JS)
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.join(process.cwd(), 'dist');
  const publicDir = path.join(process.cwd(), 'public');
  const staticRoot = isProd && fs.existsSync(distDir) ? distDir : publicDir;

  app.use(express.static(staticRoot));

  // SPA fallback for client routes (excluding /api and /ws)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      next();
      return;
    }
    res.sendFile(path.join(staticRoot, 'index.html'));
  });

  // Central error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error('[Server Error]', err);
      res.status(500).json({ error: 'Beklenmeyen bir sunucu hatası oluştu.' });
    },
  );

  const server = http.createServer(app);
  realtime.init(server);

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(
      `[MAXBAHIS STAFF HUB] Sunucu http://0.0.0.0:${port} adresinde çalışıyor (PostgreSQL)`,
    );
  });
}

bootstrap().catch((err) => {
  console.error('[MAXBAHIS STAFF HUB] Başlatma hatası:', err);
  process.exit(1);
});
