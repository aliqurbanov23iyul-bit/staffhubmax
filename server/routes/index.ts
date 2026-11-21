import { Router } from 'express';
import { store } from '../database/store';
import { extractTokenFromRequest, resolveSessionFromToken } from '../middleware/auth';
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
apiRouter.use(crmRouter);
apiRouter.use(operationsRouter);
apiRouter.use(chatRouter);
apiRouter.use(breaksAndFtdRouter);
apiRouter.use(adminAndSettingsRouter);
