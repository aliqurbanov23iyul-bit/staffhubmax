import { Router } from 'express';
import { store } from '../database/store';
import { extractTokenFromRequest, resolveSessionFromToken, requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { realtime } from '../services/realtime';
import { adminAndSettingsRouter } from './adminAndSettingsRoutes';
import { authRouter } from './authRoutes';
import { breaksAndFtdRouter } from './breaksAndFtdRoutes';
import { chatRouter } from './chatRoutes';
import { crmRouter } from './crmRoutes';
import { operationsRouter } from './operationsRoutes';

export const apiRouter = Router();

apiRouter.get('/health', (req, res) => {
  const authenticated = Boolean(resolveSessionFromToken(extractTokenFromRequest(req)));
  res.json({
    status: 'ok',
    authenticated,
    mode: store.mode,
    databaseConnected: store.databaseConnected,
  });
});

apiRouter.use('/auth', authRouter);
apiRouter.get('/sync', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ revision: store.revision, onlineUserIds: realtime.getOnlineUserIds(), notifications: store.notifications.filter((item) => item.userId === req.authUser!.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,100) });
});
apiRouter.use(crmRouter);
apiRouter.use(operationsRouter);
apiRouter.use(chatRouter);
apiRouter.use(breaksAndFtdRouter);
apiRouter.use(adminAndSettingsRouter);
