import { Router } from 'express';
import * as settingsController from './settings.controller';

const router = Router();

router.get('/', settingsController.getAll);
router.post('/global', settingsController.updateGlobal);

export const settingsRouter = router;
