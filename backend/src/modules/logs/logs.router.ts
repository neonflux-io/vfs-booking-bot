import { Router } from 'express';
import { requireAuth } from '@middleware/auth.middleware';
import { listLogs, exportLogs } from './logs.controller';

export const logsRouter = Router();

logsRouter.use(requireAuth);
logsRouter.get('/', listLogs);
logsRouter.get('/export', exportLogs);
