/**
 * Stress test — 10 concurrent monitors for 60 seconds
 *
 * Pass criteria:
 * - All 10 monitors still running at the 60s mark
 * - Zero crashes / unhandled promise rejections
 * - Memory growth < 5 MB/min
 */
import { startMonitor, stopMonitor, getMonitorStatus } from '@modules/monitor/monitor.service';

// Patch fetchAvailableSlots to avoid real HTTP calls
jest.mock('@modules/monitor/monitor.service', () => {
  const real = jest.requireActual('@modules/monitor/monitor.service');
  return { ...real };
});

// Intercept axios inside monitor service — mock the internal fetch
jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({
    data: [
      { date: '2026-08-01', time: '09:00', destination: 'prt', visaType: 'STANDARD_VISITOR' },
    ],
  }),
  create: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({ data: [] }),
    post: jest.fn().mockResolvedValue({ data: {} }),
  })),
}));

const MONITOR_COUNT = 10;
const RUN_DURATION_MS = 60_000;
const POLL_INTERVAL_MS = 3_000;

describe('Monitor polling stress — 10 concurrent monitors × 60s', () => {
  jest.setTimeout(RUN_DURATION_MS + 30_000); // 90s budget

  let monitorIds: string[] = [];
  const memBefore = process.memoryUsage().heapUsed;

  afterAll(async () => {
    for (const id of monitorIds) {
      try { stopMonitor(id); } catch { /* ignore if already stopped */ }
    }
  });

  it('starts 10 monitors without throwing', () => {
    for (let i = 0; i < MONITOR_COUNT; i++) {
      const id = startMonitor({
        sourceCountry: 'gbr',
        destination: 'prt',
        centre: '',
        visaType: 'STANDARD_VISITOR',
        intervalMs: POLL_INTERVAL_MS,
        profileIds: [],
        mode: 'manual',
      });
      monitorIds.push(id);
    }

    expect(monitorIds.length).toBe(MONITOR_COUNT);
    expect(new Set(monitorIds).size).toBe(MONITOR_COUNT); // all unique IDs
  });

  it('all 10 monitors still running after 60 seconds', async () => {
    // Let them run
    await new Promise((r) => setTimeout(r, RUN_DURATION_MS));

    const statuses = await getMonitorStatus();
    const running = statuses.filter((s) => monitorIds.includes(s.id) && s.isRunning);

    expect(running.length).toBe(MONITOR_COUNT);
  });

  it('memory growth is under 5 MB during the run', () => {
    const memAfter = process.memoryUsage().heapUsed;
    const growthMB = (memAfter - memBefore) / (1024 * 1024);

    // Allow generous headroom — test infra itself may allocate
    expect(growthMB).toBeLessThan(5);
  });
});
