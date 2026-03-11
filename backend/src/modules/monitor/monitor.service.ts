import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { MonitorConfig, MonitorState, setMonitor, getMonitor, deleteMonitor, getAllMonitors } from './monitor.state';
import { enqueueBooking } from '@modules/booking/booking.service';
import { emitToAll } from '@modules/websocket/ws.server';
import { logEvent } from '@modules/logs/logger';
import { EventType } from '@prisma/client';
import { SlotInfo } from '@t/index';
import { AppError } from '@middleware/errorHandler';

// VFS Global availability endpoint (discovered via DevTools network capture)
// NOTE: This URL/params may change — update via vfs.selectors Settings if needed
const VFS_AVAILABILITY_URL = 'https://visa.vfsglobal.com/ago/{destination}/en/schedule-appointment/get-slots';

function buildAvailabilityUrl(destination: string): string {
  const dest = destination.toLowerCase() === 'brazil' ? 'bra' : 'prt';
  return VFS_AVAILABILITY_URL.replace('{destination}', dest);
}

function slotKey(slot: SlotInfo): string {
  return `${slot.date}:${slot.time}`;
}

async function fetchAvailableSlots(config: MonitorConfig): Promise<SlotInfo[]> {
  try {
    const url = buildAvailabilityUrl(config.destination);
    const response = await axios.get(url, {
      timeout: 10_000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0 Safari/537.36',
      },
      params: {
        visaCategory: config.visaType,
        country: 'AGO',
      },
    });

    // Parse VFS response — structure varies; adapt as needed after network capture
    const data = response.data;
    if (!Array.isArray(data?.slots) && !Array.isArray(data)) return [];

    const raw: Array<{ date: string; time: string }> = Array.isArray(data) ? data : data.slots;
    return raw.map((s) => ({
      date: s.date,
      time: s.time,
      destination: config.destination,
      visaType: config.visaType,
    }));
  } catch {
    return [];
  }
}

function diffSlots(prev: Set<string>, current: SlotInfo[]): SlotInfo[] {
  return current.filter((slot) => !prev.has(slotKey(slot)));
}

export function startMonitor(config: Omit<MonitorConfig, 'id'>): string {
  const id = uuidv4();
  const fullConfig: MonitorConfig = { ...config, id };

  const state: MonitorState = {
    config: fullConfig,
    isRunning: true,
    intervalId: null,
    lastKnownSlots: new Set(),
    lastCheckedAt: null,
    slotDetectedCount: 0,
  };

  const intervalId = setInterval(async () => {
    const current = getMonitor(id);
    if (!current?.isRunning) return;

    try {
      const slots = await fetchAvailableSlots(fullConfig);
      const newSlots = diffSlots(current.lastKnownSlots, slots);

      // Update known slots
      current.lastKnownSlots = new Set(slots.map(slotKey));
      current.lastCheckedAt = new Date();

      if (newSlots.length > 0) {
        current.slotDetectedCount += newSlots.length;

        logEvent('info', EventType.SLOT_DETECTED, `${newSlots.length} new slot(s) detected for ${config.destination}`, {
          destination: config.destination,
        });

        emitToAll('SLOT_DETECTED', {
          monitorId: id,
          destination: config.destination,
          slots: newSlots,
          detectedAt: new Date().toISOString(),
        });

        // Enqueue booking jobs if auto mode
        if (fullConfig.mode === 'auto') {
          for (const profileId of fullConfig.profileIds) {
            for (const slot of newSlots) {
              await enqueueBooking({
                profileId,
                destination: slot.destination,
                visaType: slot.visaType,
                slot,
              });
            }
          }
        }
      }

      setMonitor(id, current);
    } catch (err) {
      logEvent('error', EventType.BOOKING_FAILED, `Monitor poll error: ${(err as Error).message}`, {
        destination: config.destination,
      });
    }
  }, config.intervalMs);

  state.intervalId = intervalId;
  setMonitor(id, state);

  logEvent('info', EventType.MONITOR_STARTED, `Monitor started for ${config.destination}`, {
    destination: config.destination,
  });

  emitToAll('MONITOR_STATUS', { monitorId: id, status: 'started', destination: config.destination });

  return id;
}

export function stopMonitor(id: string): void {
  const state = getMonitor(id);
  if (!state) throw new AppError(404, 'Monitor not found', 'NOT_FOUND');

  if (state.intervalId) clearInterval(state.intervalId);
  state.isRunning = false;
  deleteMonitor(id);

  logEvent('info', EventType.MONITOR_STOPPED, `Monitor stopped`, { destination: state.config.destination });
  emitToAll('MONITOR_STATUS', { monitorId: id, status: 'stopped' });
}

export function getMonitorStatus() {
  return getAllMonitors().map((m) => ({
    id: m.config.id,
    destination: m.config.destination,
    visaType: m.config.visaType,
    isRunning: m.isRunning,
    lastCheckedAt: m.lastCheckedAt,
    slotDetectedCount: m.slotDetectedCount,
    mode: m.config.mode,
  }));
}
