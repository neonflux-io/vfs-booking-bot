import { Request, Response, NextFunction } from 'express';
import * as settingsService from './settings.service';

export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await settingsService.getAllSettings();
    const global = await settingsService.getGlobalSettings();
    res.json({ ...settings, global });
  } catch (err) { next(err); }
}

export async function updateGlobal(req: Request, res: Response, next: NextFunction) {
  try {
    await settingsService.updateGlobalSettings(req.body);
    res.json({ success: true });
  } catch (err) { next(err); }
}
