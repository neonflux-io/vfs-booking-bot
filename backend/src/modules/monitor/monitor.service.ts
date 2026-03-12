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

// Maps UI destination keys → VFS 3-letter country codes used in the URL
const DESTINATION_CODES: Record<string, string> = {
  // Europe
  portugal:       'prt',
  france:         'fra',
  germany:        'deu',
  spain:          'esp',
  italy:          'ita',
  netherlands:    'nld',
  belgium:        'bel',
  switzerland:    'che',
  sweden:         'swe',
  norway:         'nor',
  denmark:        'dnk',
  finland:        'fin',
  austria:        'aut',
  czechrepublic:  'cze',
  poland:         'pol',
  // Americas
  brazil:         'bra',
  usa:            'usa',
  canada:         'can',
  // Asia-Pacific
  australia:      'aus',
  china:          'chn',
  japan:          'jpn',
  india:          'ind',
  // Africa
  southafrica:    'zaf',
};

function buildAvailabilityUrl(destination: string): string {
  const code = DESTINATION_CODES[destination.toLowerCase().replace(/\s+/g, '')];
  if (!code) throw new Error(`Unsupported destination: ${destination}`);
  return VFS_AVAILABILITY_URL.replace('{destination}', code);
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

    const data = response.data;

    // VFS can return various shapes — try all known structures
    let raw: Array<{ date?: string; slotDate?: string; time?: string; slotTime?: string }> = [];

    if (Array.isArray(data)) {
      raw = data;
    } else if (Array.isArray(data?.slots)) {
      raw = data.slots;
    } else if (Array.isArray(data?.data?.slots)) {
      raw = data.data.slots;
    } else if (Array.isArray(data?.data)) {
      raw = data.data;
    } else if (Array.isArray(data?.availableSlots)) {
      raw = data.availableSlots;
    } else {
      // Unknown structure — log keys so we can adapt selectors in Settings
      logEvent('warn', EventType.SLOT_DETECTED,
        `Unknown VFS response for ${config.destination}. Keys: ${Object.keys(data ?? {}).join(', ')}`,
        { destination: config.destination },
      );
      return [];
    }

    return raw
      .map((s) => ({
        date: s.date ?? s.slotDate ?? '',
        time: s.time ?? s.slotTime ?? '',
        destination: config.destination,
        visaType: config.visaType,
      }))
      .filter((s) => s.date && s.time);
  } catch (err) {
    logEvent('warn', EventType.BOOKING_FAILED,
      `Monitor fetch error for ${config.destination}: ${(err as Error).message}`,
      { destination: config.destination },
    );
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

      // Update state atomically — avoid mutating the shared reference directly
      setMonitor(id, {
        ...current,
        lastKnownSlots: new Set(slots.map(slotKey)),
        lastCheckedAt: new Date(),
        slotDetectedCount: current.slotDetectedCount + (newSlots.length > 0 ? newSlots.length : 0),
      });

      if (newSlots.length > 0) {
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
