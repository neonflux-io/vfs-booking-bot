import axios from 'axios';
import https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { MonitorConfig, MonitorState, setMonitor, getMonitor, deleteMonitor, getAllMonitors } from './monitor.state';
import { enqueueBooking } from '@modules/booking/booking.service';
import { emitToAll } from '@modules/websocket/ws.server';
import { logEvent } from '@modules/logs/logger';
import { EventType } from '@prisma/client';
import { dispatchNotification } from '@modules/notifications/notification.service';
import { solveTwoCaptcha } from '@modules/captcha/twoCaptcha';
import { env } from '@config/env';
import { SlotInfo } from '@t/index';
import { AppError } from '@middleware/errorHandler';
import { prisma } from '@config/database';
import { warmSessionWithBrowser, fetchSlotsWithBrowser, VfsCredentials } from './session.warmer';
import { decrypt } from '@utils/crypto';
import { getCachedSlots, setCachedSlots } from './slot.cache';

// VFS Global availability endpoint (discovered via DevTools network capture)
// NOTE: This URL/params may change — update via vfs.selectors Settings if needed
// VFS Global availability endpoint (dynamic source/destination)
const VFS_AVAILABILITY_URL = 'https://visa.vfsglobal.com/{source}/{destination}/en/schedule-appointment/get-slots';

const USER_AGENTS = [
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    ch: '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="24"'
  },
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    ch: '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="24"'
  },
  {
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    ch: '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="24"'
  }
];

function getRandomAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Maps UI source keys -> VFS 3-letter source country codes
const SOURCE_CODES: Record<string, string> = {
  uk:     'gbr',
  usa:    'usa',
  angola: 'ago',
};

// Maps UI destination keys -> VFS 3-letter destination country codes
const DESTINATION_CODES: Record<string, string> = {
  portugal: 'prt',
  brazil:   'bra',
};

function getSourceCode(source: string): string {
  const code = SOURCE_CODES[source.toLowerCase()];
  if (!code) throw new Error(`Unsupported source: ${source}`);
  return code;
}

function getDestinationCode(destination: string): string {
  const code = DESTINATION_CODES[destination.toLowerCase()];
  if (!code) throw new Error(`Unsupported destination: ${destination}`);
  return code;
}

function buildAvailabilityUrl(sourceCode: string, destinationCode: string): string {
  return VFS_AVAILABILITY_URL
    .replace('{source}', sourceCode)
    .replace('{destination}', destinationCode);
}

function slotKey(slot: SlotInfo): string {
  return `${slot.date}:${slot.time}`;
}

// Returns proxy config for browser warm sessions (always uses residential proxy)
async function getProxyConfig(id: string) {
  const current = getMonitor(id);
  const monitorProxy = current?.config?.proxy;

  if (monitorProxy?.host) {
    return {
      host: monitorProxy.host,
      port: monitorProxy.port,
      auth: monitorProxy.username ? {
        username: monitorProxy.username,
        password: monitorProxy.password || '',
      } : undefined,
    };
  }

  // Fallback to Global Proxy from DB
  const global = await prisma.globalSettings.findUnique({ where: { id: 'singleton' } });
  if (global?.proxyHost) {
    return {
      host: global.proxyHost,
      port: global.proxyPort || 8080,
      auth: global.proxyUsername ? {
        username: global.proxyUsername,
        password: global.proxyPassword || '',
      } : undefined,
    };
  }

  // Final fallback: use .env proxy credentials (Bright Data residential proxy)
  if (env.PROXY_HOST && env.PROXY_PORT) {
    return {
      host: env.PROXY_HOST,
      port: env.PROXY_PORT,
      auth: env.PROXY_USERNAME ? {
        username: env.PROXY_USERNAME,
        password: env.PROXY_PASSWORD || '',
      } : undefined,
    };
  }

  return false;
}

// Opt 1: Returns proxy config for regular HTTP GET/POST calls.
// When proxyForWarmOnly=true, returns undefined so axios goes direct (no proxy cost).
async function getHttpProxyConfig(id: string) {
  const current = getMonitor(id);
  if (current?.config?.proxyForWarmOnly) return undefined;
  return getProxyConfig(id);
}

async function rotateProxy(id: string) {
  const current = getMonitor(id);
  if (!current) return;

  // Track the failure of the current proxy in DB
  if (current.config.proxy?.host) {
    await prisma.proxy.updateMany({
      where: { host: current.config.proxy.host },
      data: { 
        blockCount: { increment: 1 },
        lastBlockedAt: new Date(),
      }
    });

    const p = await prisma.proxy.findFirst({ where: { host: current.config.proxy.host } });
    if (p && p.blockCount >= 5) {
      await prisma.proxy.update({ where: { id: p.id }, data: { status: 'BLOCKED' } });
      logEvent('error', EventType.IP_BLOCKED, `Proxy ${p.host} has been permanently blacklisted.`, { destination: current.config.destination });
    }
  }

  const proxies = await prisma.proxy.findMany({
    where: { 
      status: 'ACTIVE',
      host: { not: current.config.proxy?.host || '' }
    },
    take: 10
  });

  if (proxies.length > 0) {
    const next = proxies[Math.floor(Math.random() * proxies.length)];
    const latest = getMonitor(id);
    if (latest) {
      setMonitor(id, {
        ...latest,
        config: {
          ...latest.config,
          proxy: {
            host: next.host,
            port: next.port,
            username: next.username,
            password: next.passwordEnc ? decrypt(next.passwordEnc) : '',
          }
        }
      });
      logEvent('info', EventType.MONITOR_STARTED, `Rotated to new proxy: ${next.host}`, { destination: latest.config.destination });
    }
  }
}


// Opt 2: Cookies are reused until VFS rejects them (lazy expiry).
// Hard 4-hour ceiling prevents silently stale tokens.
const MAX_COOKIE_AGE_MS = 4 * 60 * 60 * 1000;

async function warmSession(id: string, sourceCode: string, destinationCode: string, visaType: string, credentials?: VfsCredentials): Promise<string[] | undefined> {
  const current = getMonitor(id);
  if (current?.cookies?.length) {
    const age = current.cookiesSetAt ? Date.now() - current.cookiesSetAt.getTime() : 0;
    if (current.cookiesValid !== false && age < MAX_COOKIE_AGE_MS) {
      return current.cookies; // still valid — skip re-warm
    }
    logEvent('info', EventType.MONITOR_STARTED,
      `Cookies invalidated for monitor ${id.slice(0, 4)}… — re-warming session.`);
  }

  try {
    const url = `https://visa.vfsglobal.com/${sourceCode}/${destinationCode}/en/schedule-appointment`;
    const httpProxy = await getProxyConfig(id); // warm GET always uses proxy (datacenter IPs are blocked for page loads)
    const agent = getRandomAgent();
    const response = await axios.get(url, {
      timeout: 15_000,
      headers: {
        'User-Agent': agent.ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Referer': 'https://visa.vfsglobal.com/',
        'sec-ch-ua': agent.ch,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
      proxy: httpProxy || undefined,
      ...(httpProxy && { httpsAgent: new https.Agent({ rejectUnauthorized: false }) }),
    });

    const cookies = response.headers['set-cookie'];
    if (cookies) {
      const latest = getMonitor(id);
      setMonitor(id, {
        ...latest!,
        cookies,
        cookiesSetAt: new Date(),
        cookiesValid: true, // Opt 2: mark fresh
        userAgent: agent.ua,
        secChUa: agent.ch,
        lastHttpStatus: 200
      });
      logEvent('info', EventType.MONITOR_STARTED, `Acquired session cookies for ${id.slice(0, 4)}...`, { destination: destinationCode });
      return cookies;
    }
  } catch (err: any) {
    const status = err.response?.status;
    const latest = getMonitor(id);
    if (latest) setMonitor(id, { ...latest, lastHttpStatus: status || 500 });
    
    logEvent('warn', EventType.BOOKING_FAILED, `Failed to warm session for ${destinationCode}: ${(err as Error).message}${status ? ` (Status: ${status})` : ''}`);
    
    if (status === 403) {
      // Phase 16: Try browser-based warming + in-session slot fetch
      const proxyConfig = await getProxyConfig(id);
      const browserResult = await warmSessionWithBrowser(id, sourceCode, destinationCode, visaType, proxyConfig as any, credentials);
      if (browserResult) {
        setMonitor(id, {
          ...latest!,
          cookies: browserResult.cookies,
          cookiesSetAt: new Date(),
          cookiesValid: true, // Opt 2: browser warm produced fresh cookies
          userAgent: browserResult.userAgent,
          secChUa: browserResult.secChUa,
          lastHttpStatus: 200,
          earlySlotData: browserResult.slotData ?? null,
        });
        return browserResult.cookies;
      }
      throw err; // Bubble up if browser warming also fails
    }
  }
  return undefined;
}

/**
 * Parses an array of Set-Cookie header strings and returns only the
 * "name=value" portion of each cookie, suitable for use in a Cookie request header.
 */
function parseSetCookieToCookieHeader(setCookieHeaders: string[]): string {
  return setCookieHeaders
    .map((h) => h.split(';')[0].trim())
    .join('; ');
}

async function getVfsCredentials(profileIds: string[]): Promise<VfsCredentials | undefined> {
  const profileId = profileIds[0];
  if (!profileId) return undefined;
  try {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { email: true, vfsPasswordEnc: true },
    });
    if (profile?.email && profile?.vfsPasswordEnc) {
      return { email: profile.email, password: decrypt(profile.vfsPasswordEnc) };
    }
  } catch {}
  return undefined;
}

async function fetchAvailableSlots(config: MonitorConfig): Promise<SlotInfo[]> {
  const sourceCode = getSourceCode(config.sourceCountry);
  const destCode = getDestinationCode(config.destination);
  const url = buildAvailabilityUrl(sourceCode, destCode);

  // Fetch VFS login credentials from the first associated profile (if available)
  const vfsCreds = await getVfsCredentials(config.profileIds);

  try {
    const cookies = await warmSession(config.id, sourceCode, destCode, config.visaType, vfsCreds);
    
    const monitorState = getMonitor(config.id); 
    if (!monitorState) throw new Error(`Monitor ${config.id} not found during slot fetch.`);

    // Phase 16: If the warming browser already fetched slots in-session, use that data directly
    if (monitorState.earlySlotData) {
      logEvent('info', EventType.MONITOR_STARTED, `Using in-session slot data for ${destCode} (Phase 16 fast-path).`);
      const earlyData = monitorState.earlySlotData;
      setMonitor(config.id, { ...monitorState, earlySlotData: undefined });

      // Parse VFS response using same multi-shape logic as main fetch
      let earlyRaw: Array<{ date?: string; slotDate?: string; time?: string; slotTime?: string }> = [];
      if (Array.isArray(earlyData)) earlyRaw = earlyData;
      else if (Array.isArray(earlyData?.slots)) earlyRaw = earlyData.slots;
      else if (Array.isArray(earlyData?.data?.slots)) earlyRaw = earlyData.data.slots;
      else if (Array.isArray(earlyData?.data)) earlyRaw = earlyData.data;
      else if (Array.isArray(earlyData?.availableSlots)) earlyRaw = earlyData.availableSlots;

      return earlyRaw
        .map((s) => ({ date: s.date ?? s.slotDate ?? '', time: s.time ?? s.slotTime ?? '', destination: config.destination, visaType: config.visaType }))
        .filter((s) => s.date && s.time);
    }

    const payload = {
      visaCategory: config.visaType,
      country: sourceCode.toUpperCase(),
    };

    const proxyConfig = await getHttpProxyConfig(config.id); // Opt 1: direct if proxyForWarmOnly
    const agent = monitorState.userAgent && monitorState.secChUa
      ? { ua: monitorState.userAgent, ch: monitorState.secChUa }
      : getRandomAgent();

    // Extract XSRF-TOKEN from stored cookies for Angular CSRF protection.
    // Browser-warmed cookies are stored as "name=value"; HTTP-warmed ones may include
    // semicolons (full Set-Cookie format) — the split handles both.
    const xsrfEntry = (monitorState.cookies ?? []).find(c => c.startsWith('XSRF-TOKEN='));
    const xsrfRaw = xsrfEntry ? xsrfEntry.split('=').slice(1).join('=') : undefined;
    const xsrfToken = xsrfRaw ? decodeURIComponent(xsrfRaw) : undefined;

    let data: any;
    try {
      const response = await axios.post(url, payload, {
        timeout: 15_000,
        headers: {
          'User-Agent': agent.ua,
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          'Origin': 'https://visa.vfsglobal.com',
          'Referer': `https://visa.vfsglobal.com/${sourceCode}/${destCode}/en/schedule-appointment`,
          'Cookie': parseSetCookieToCookieHeader(monitorState.cookies ?? []),
          ...(xsrfToken && { 'X-XSRF-TOKEN': xsrfToken }),
          'sec-ch-ua': agent.ch,
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
        },
        proxy: proxyConfig || undefined,
        ...(proxyConfig && { httpsAgent: new https.Agent({ rejectUnauthorized: false }) }),
      });
      data = response.data;
    } catch (err: any) {
      const status = err.response?.status;
      const latest = getMonitor(config.id);

      // Opt 2: invalidate cookies on auth failure so warmSession re-warms next poll
      if ((status === 401 || status === 403) && latest) {
        setMonitor(config.id, { ...latest, lastHttpStatus: status, cookiesValid: false });
      } else if (latest) {
        setMonitor(config.id, { ...latest, lastHttpStatus: status || 500 });
      }

      if (status === 403) {
        logEvent('warn', EventType.BOOKING_FAILED, `Fetch slots blocked (403). Switching to Ultimate Bypass (Browser Fetch)...`);
        const proxyConfig = await getProxyConfig(config.id);
        return await fetchSlotsWithBrowser(
          sourceCode,
          destCode,
          config.visaType,
          proxyConfig as any,
          monitorState.cookies,
          false,
          vfsCreds,
        );
      }
      throw err;
    }
    
    // Update monitor state with success status
    const latest = getMonitor(config.id);
    if (latest) {
      setMonitor(config.id, { ...latest, lastHttpStatus: 200 });
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
    const latest = getMonitor(config.id);
    if (latest) {
      setMonitor(config.id, { ...latest, lastHttpStatus: status || 500 });
    }

    logEvent('warn', EventType.BOOKING_FAILED,
      `Monitor fetch error for ${config.destination}: ${err.message}${status ? ` (Status: ${status})` : ''}`,
      { destination: config.destination },
    );

    // Pro-Level: Rotate proxy on 403 and retry once
    if (status === 403) {
      const data = err.response?.data;
      const isCaptcha = data?.sitekey || data?.googlekey || (typeof data === 'string' && data.includes('g-recaptcha'));

      if (isCaptcha && env.CAPTCHA_SOLVER === 'twocaptcha' && env.TWOCAPTCHA_API_KEY) {
        logEvent('info', EventType.CAPTCHA_REQUIRED, `Captcha challenge detected at ${config.destination}. Solving via 2Captcha...`);
        try {
          const siteKey = data?.sitekey || data?.googlekey || '6LfbTS4UAAAAAA_p0X4Z-K_2_O_...'; // Fallback to common VFS key
          await solveTwoCaptcha(siteKey, url);
          logEvent('success' as any, EventType.CAPTCHA_SOLVED, `Captcha bypassed successfully.`);
        } catch (cErr: any) {
          logEvent('error', EventType.CAPTCHA_REQUIRED, `Automatic captcha bypass failed: ${cErr.message}`);
        }
      }

      logEvent('warn', EventType.IP_BLOCKED, `403 Forbidden. Rotating proxy for ${config.destination}...`);
      await rotateProxy(config.id);
    }

    throw err; 
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

function adaptiveInterval(
  baseMs: number,
  consecutiveEmptyPolls: number,
  justDetected: boolean,
  opts?: {
    activeHoursUtc?: { startHour: number; endHour: number };
    maintenanceWindowUtc?: { startHour: number; endHour: number };
    offHoursIntervalMs?: number;
  },
): number {
  let delay = baseMs;

  // Opt 3: time-gating — always let slot detections burst through regardless of hour
  if (!justDetected && opts) {
    const utcHour = new Date().getUTCHours();

    // Maintenance window: VFS is down — poll every 10 min to wake up when it's back
    if (opts.maintenanceWindowUtc) {
      const { startHour, endHour } = opts.maintenanceWindowUtc;
      if (utcHour >= startHour && utcHour < endHour) {
        return 10 * 60_000; // 10 minutes
      }
    }

    // Outside active hours: slow to off-hours interval
    if (opts.activeHoursUtc) {
      const { startHour, endHour } = opts.activeHoursUtc;
      if (!(utcHour >= startHour && utcHour < endHour)) {
        return opts.offHoursIntervalMs ?? 300_000; // default 5 minutes
      }
    }
  }

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

  logEvent('info', EventType.MONITOR_STARTED, `Monitor started for ${config.sourceCountry.toUpperCase()} -> ${config.destination.toUpperCase()}`, {
    destination: config.destination,
  });
  emitToAll('MONITOR_STATUS', { 
    monitorId: id, 
    status: 'started', 
    sourceCountry: config.sourceCountry,
    destination: config.destination 
  });

  // Use recursive setTimeout instead of setInterval so the adaptive delay
  // is recalculated after every poll (not locked in at creation time).
  let consecutiveEmptyPolls = 0;

  async function poll() {
    const current = getMonitor(id);
    if (!current?.isRunning) return;

    let justDetected = false;

    try {
      // Opt 4: coalesce — share one fetch across monitors on the same route
      const coalesceKey = `${getSourceCode(fullConfig.sourceCountry)}:${getDestinationCode(fullConfig.destination)}:${fullConfig.visaType}`;
      const cachedPromise = getCachedSlots(coalesceKey);
      const slotsPromise = cachedPromise ?? fetchAvailableSlots(fullConfig);
      if (!cachedPromise) setCachedSlots(coalesceKey, slotsPromise);
      const slots = await slotsPromise;
      
      // Fetch LATEST state again to avoid overwriting changes made during fetch
      const latest = getMonitor(id);
      if (!latest?.isRunning) return;

      const newSlots = diffSlots(latest.lastKnownSlots, slots);

      setMonitor(id, {
        ...latest,
        lastKnownSlots: new Set(slots.map(slotKey)),
        lastCheckedAt: new Date(),
        slotDetectedCount: latest.slotDetectedCount + newSlots.length,
      });

      if (newSlots.length > 0) {
        justDetected = true;
        consecutiveEmptyPolls = 0;

        logEvent('info', EventType.SLOT_DETECTED, `${newSlots.length} new slot(s) detected for ${config.sourceCountry.toUpperCase()} -> ${config.destination.toUpperCase()}`, {
          destination: config.destination,
        });

        // Trigger Global Notifications (Telegram, Email, Push)
        await dispatchNotification({
          event: 'SLOT_DETECTED',
          sourceCountry: config.sourceCountry,
          destination: config.destination,
          visaType: config.visaType,
          slotDate: newSlots[0].date // Notify about the first/earliest slot
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
    let nextDelay = adaptiveInterval(fullConfig.intervalMs, consecutiveEmptyPolls, justDetected, {
      activeHoursUtc: fullConfig.activeHoursUtc,
      maintenanceWindowUtc: fullConfig.maintenanceWindowUtc,
      offHoursIntervalMs: fullConfig.offHoursIntervalMs,
    });

    // Re-fetch latest monitor state to avoid race conditions with 403 status
    const latestState = getMonitor(id);

    // Exponential backoff for 403 Forbidden errors to cool down the IP
    if (latestState?.lastHttpStatus === 403) {
      nextDelay = Math.max(nextDelay * 5, 120_000); // Wait at least 2 minutes if blocked
      logEvent('info', EventType.MONITOR_STARTED, `403 detected for ${config.destination}. Strictly cooling down for ${Math.floor(nextDelay / 1000)}s`, {
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
    sourceCountry: m.config.sourceCountry,
    lastHttpStatus: m.lastHttpStatus,
    interval: m.config.intervalMs,
  }));
}

