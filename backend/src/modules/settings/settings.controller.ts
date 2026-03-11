import { Request, Response, NextFunction } from 'express';
import { getAllSettings, setSetting } from './settings.service';

export async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await getAllSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const updates = req.body as Record<string, unknown>;
    await Promise.all(
      Object.entries(updates).map(([key, value]) => setSetting(key, value))
    );
    res.json({ message: 'Settings updated' });
  } catch (err) {
    next(err);
  }
}
