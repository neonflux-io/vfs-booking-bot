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

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

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
      timeout: 15_000,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': `https://visa.vfsglobal.com/ago/${config.destination}/en/schedule-appointment`,
        'User-Agent': getRandomUA(),
        'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
      params: {
        visaCategory: config.visaType,
        country: 'AGO',
      },
    });

    const data = response.data;
    
    // Update monitor state with success status
    const currentMonitor = getMonitor(config.id);
    if (currentMonitor) {
      setMonitor(config.id, { ...currentMonitor, lastHttpStatus: 200 });
    }

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
  } catch (err: any) {
    const status = err.response?.status;
    const currentMonitor = getMonitor(config.id);
    if (currentMonitor) {
      setMonitor(config.id, { ...currentMonitor, lastHttpStatus: status || 500 });
    }

    logEvent('warn', EventType.BOOKING_FAILED,
      `Monitor fetch error for ${config.destination}: ${err.message}${status ? ` (Status: ${status})` : ''}`,
      { destination: config.destination },
    );
    return [];
  }
}

function diffSlots(prev: Set<string>, current: SlotInfo[]): SlotInfo[] {
  return current.filter((slot) => !prev.has(slotKey(slot)));
}

// ── Adaptive interval logic ────────────────────────────────────────────────────
//
// VFS typically releases appointment slots in short bursts during business hours.
// We reduce the poll interval when activity is high and relax it during quiet periods
// to avoid unnecessary requests and reduce IP block risk.
//
// Rules (applied in priority order):
//  1. If slots were just detected → drop to HIGH_DEMAND_MS for the next N polls
//  2. If current time is within a known high-activity window → use ACTIVE_MS
//  3. Otherwise → use the user-configured base interval (at least QUIET_MIN_MS)

const HIGH_DEMAND_MS  = 3_000;   // burst mode: slots are appearing right now
const ACTIVE_MS       = 5_000;   // active window: likely release time
const QUIET_MIN_MS    = 10_000;  // floor for quiet periods

// High-activity windows in local server time (hour ranges, 24h).
// VFS Angola appointments typically open around 09:00 and 14:00 WAT.
const ACTIVE_WINDOWS: Array<{ startHour: number; endHour: number }> = [
  { startHour: 8,  endHour: 10 },
  { startHour: 13, endHour: 15 },
];

function isInActiveWindow(): boolean {
  const hour = new Date().getHours();
  return ACTIVE_WINDOWS.some((w) => hour >= w.startHour && hour < w.endHour);
}

function adaptiveInterval(baseMs: number, consecutiveEmptyPolls: number, justDetected: boolean): number {
  let delay = baseMs;

  if (justDetected) {
    delay = HIGH_DEMAND_MS;
  } else if (isInActiveWindow()) {
    delay = Math.min(baseMs, ACTIVE_MS);
  } else {
    // Outside active windows: relax polling but never below QUIET_MIN_MS
    // Back off slightly when nothing has been seen for a long time
    const relaxed = consecutiveEmptyPolls > 60 ? baseMs * 2 : baseMs;
    delay = Math.max(relaxed, QUIET_MIN_MS);
  }

  // Add 10-20% jitter to avoid perfectly periodic requests
  const jitter = delay * (0.1 + Math.random() * 0.1);
  return Math.floor(delay + jitter);
}

// ── startMonitor ───────────────────────────────────────────────────────────────

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
  setMonitor(id, state);

  logEvent('info', EventType.MONITOR_STARTED, `Monitor started for ${config.destination}`, {
    destination: config.destination,
  });
  emitToAll('MONITOR_STATUS', { monitorId: id, status: 'started', destination: config.destination });

  // Use recursive setTimeout instead of setInterval so the adaptive delay
  // is recalculated after every poll (not locked in at creation time).
  let consecutiveEmptyPolls = 0;

  async function poll() {
    const current = getMonitor(id);
    if (!current?.isRunning) return;

    let justDetected = false;

    try {
      const slots = await fetchAvailableSlots(fullConfig);
      const newSlots = diffSlots(current.lastKnownSlots, slots);

      setMonitor(id, {
        ...current,
        lastKnownSlots: new Set(slots.map(slotKey)),
        lastCheckedAt: new Date(),
        slotDetectedCount: current.slotDetectedCount + newSlots.length,
      });

      if (newSlots.length > 0) {
        justDetected = true;
        consecutiveEmptyPolls = 0;

        logEvent('info', EventType.SLOT_DETECTED, `${newSlots.length} new slot(s) detected for ${config.destination}`, {
          destination: config.destination,
        });

        emitToAll('SLOT_DETECTED', {
          monitorId: id,
          destination: config.destination,
          slots: newSlots,
          detectedAt: new Date().toISOString(),
        });

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
      } else {
        consecutiveEmptyPolls++;
      }
    } catch (err) {
      consecutiveEmptyPolls++;
      logEvent('error', EventType.BOOKING_FAILED, `Monitor poll error: ${(err as Error).message}`, {
        destination: config.destination,
      });
    }

    // Schedule next poll with adaptive delay
    let nextDelay = adaptiveInterval(fullConfig.intervalMs, consecutiveEmptyPolls, justDetected);

    // Exponential backoff for 403 Forbidden errors to cool down the IP
    if (current?.lastHttpStatus === 403) {
      nextDelay = Math.max(nextDelay * 3, 60_000); // Wait at least 1 minute if blocked
      logEvent('info', EventType.MONITOR_STARTED, `403 detected for ${config.destination}. Cooling down for ${Math.floor(nextDelay / 1000)}s`, {
        destination: config.destination,
      });
    }

    const timeoutId = setTimeout(poll, nextDelay);

    // Store the timeout ID so stopMonitor can cancel it
    const latest = getMonitor(id);
    if (latest) setMonitor(id, { ...latest, intervalId: timeoutId as unknown as NodeJS.Timeout });
  }

  // Kick off first poll immediately
  const timeoutId = setTimeout(poll, 0);
  state.intervalId = timeoutId as unknown as NodeJS.Timeout;
  setMonitor(id, state);

  return id;
}

export function stopMonitor(id: string): void {
  const state = getMonitor(id);
  if (!state) throw new AppError(404, 'Monitor not found', 'NOT_FOUND');

  if (state.intervalId) clearTimeout(state.intervalId);
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
    lastHttpStatus: m.lastHttpStatus,
  }));
}

