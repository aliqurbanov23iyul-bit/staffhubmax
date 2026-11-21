import express, { type Request, type Response, type Router } from 'express';
import { store } from './database/store';
import { apiRouter } from './routes';
import { realtime } from './services/realtime';

// Express 4 does not forward rejected async handlers automatically.
function catchAsyncHandlers(router: Router) {
  for (const layer of router.stack) {
    if (layer.route) {
      for (const handler of layer.route.stack) {
        const original = handler.handle;
        handler.handle = (req: Request, res: Response, next: (error?: unknown) => void) => {
          try { Promise.resolve(original(req, res, next)).catch(next); } catch (error) { next(error); }
        };
      }
    } else {
      const nested = layer.handle as typeof layer.handle & Router;
      if (nested.stack) catchAsyncHandlers(nested);
    }
  }
}
catchAsyncHandlers(apiRouter);

let ready: Promise<void> | null = null;
export function initialize() {
  if (!ready) ready = store.init().catch((error) => { ready = null; throw error; });
  return ready;
}

export const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use('/api', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const sendJson = res.json.bind(res);
  const initialCookie = res.getHeader('Set-Cookie');
  try {
    await initialize();
    const reply = await store.transaction(async () => {
      realtime.checkBreaksAndNotify();
      return await new Promise<{ body: unknown; status: number }>((resolve, reject) => {
        res.json = ((body: unknown) => {
          if (res.statusCode >= 400) reject({ apiFailure: true, body, status: res.statusCode });
          else resolve({ body, status: res.statusCode });
          return res;
        }) as typeof res.json;
        apiRouter(req, res, (error?: unknown) => {
          if (error) reject(error);
          else reject({ apiFailure: true, status: 404, body: { error: 'API adresi bulunamadı.' } });
        });
      });
    });
    res.status(reply.status);
    sendJson(reply.body);
  } catch (error) {
    if (initialCookie) res.setHeader('Set-Cookie', initialCookie); else res.removeHeader('Set-Cookie');
    const failure = error as { apiFailure?: boolean; status?: number; body?: unknown };
    if (failure.apiFailure) {
      res.status(failure.status || 500);
      sendJson(failure.body);
    } else {
      console.error('[API]', error instanceof Error ? error.message : 'Database transaction failed');
      res.status(503);
      sendJson({ error: 'Sunucuya şu anda ulaşılamıyor. Lütfen tekrar deneyin.' });
    }
  } finally { res.json = sendJson; }
});

export default app;
