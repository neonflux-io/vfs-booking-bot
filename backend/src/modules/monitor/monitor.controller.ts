import { Request, Response, NextFunction } from 'express';
import { createOrStartMonitor, stopMonitor, getMonitorStatus } from './monitor.service';

export async function startMonitorHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      sourceCountry, destination, visaType, intervalMs, profileIds,
    } = req.body;
    
    // We now use createOrStartMonitor so that even after a backend restart,
    // we can re-populate the in-memory Map from the frontend's request.
    const id = await createOrStartMonitor({
      id: req.body.id, // Use existing ID if provided
      sourceCountry: sourceCountry || 'usa',
      destination,
      visaType,
      intervalMs: intervalMs ?? 30000,
      profileIds: profileIds ?? [],
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
