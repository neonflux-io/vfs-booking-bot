import { Router } from 'express';
import { requireAuth } from '@middleware/auth.middleware';
import { requireRole } from '@middleware/rbac.middleware';
import { Role } from '@prisma/client';
import { getSettings, updateSettings } from './settings.controller';

export const settingsRouter = Router();

settingsRouter.use(requireAuth);
settingsRouter.get('/', getSettings);
settingsRouter.put('/', requireRole(Role.ADMIN), updateSettings);
