import { Request, Response, NextFunction } from 'express';
import { startMonitor, stopMonitor, getMonitorStatus } from './monitor.service';

export function startMonitorHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { sourceCountry, destination, visaType, intervalMs, profileIds, mode } = req.body;
    const id = startMonitor({ 
      sourceCountry: sourceCountry || 'uk', 
      destination, 
      visaType, 
      intervalMs: intervalMs ?? 10000, 
      profileIds: profileIds ?? [], 
      mode: mode ?? 'auto' 
    });
    res.json({ monitorId: id, message: 'Monitor started' });
  } catch (err) { next(err); }
}

export function stopMonitorHandler(req: Request, res: Response, next: NextFunction) {
  try {
    stopMonitor(req.params.id);
    res.json({ message: 'Monitor stopped' });
  } catch (err) { next(err); }
}

export function statusHandler(_req: Request, res: Response) {
  res.json(getMonitorStatus());
}
