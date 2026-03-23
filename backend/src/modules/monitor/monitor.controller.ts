import { Request, Response, NextFunction } from 'express';
import { startMonitor, stopMonitor, getMonitorStatus } from './monitor.service';

export function startMonitorHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      sourceCountry, destination, visaType, intervalMs, profileIds, mode, proxy,
      proxyForWarmOnly, activeHoursUtc, maintenanceWindowUtc, offHoursIntervalMs,
    } = req.body;
    const id = startMonitor({
      sourceCountry: sourceCountry || 'angola',
      destination,
      visaType,
      intervalMs: intervalMs ?? 10000,
      profileIds: profileIds ?? [],
      mode: mode ?? 'auto',
      proxy: proxy ?? undefined,
      proxyForWarmOnly: proxyForWarmOnly ?? true, // Opt 1: default on — proxy warm only
      activeHoursUtc: activeHoursUtc ?? { startHour: 7, endHour: 16 },       // 07–16 UTC
      maintenanceWindowUtc: maintenanceWindowUtc ?? { startHour: 0, endHour: 6 }, // 00–06 UTC
      offHoursIntervalMs: offHoursIntervalMs ?? 300_000, // 5 min outside active hours
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
