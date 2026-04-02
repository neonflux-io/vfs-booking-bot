process.env.PROFILE_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32ch';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32ch';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

jest.mock('@modules/proxy/proxy.service', () => ({
  getProxy: jest.fn().mockResolvedValue({ id: 'proxy-1', server: '1.2.3.4:8080', username: 'u', password: 'p' }),
  reportBlock: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@modules/profiles/profiles.service', () => ({
  getProfileForBooking: jest.fn().mockResolvedValue({
    id: 'profile-1',
    fullName: 'Test Applicant',
    passportNumber: 'AB123456',
    dob: '1990-01-15',
    passportExpiry: new Date('2030-12-31'),
    nationality: 'AGO',
    email: 'test@example.com',
    phone: '+244912345678',
    vfsPassword: 'VfsPass123!',
  }),
}));

jest.mock('@modules/settings/settings.service', () => ({
  getSetting: jest.fn().mockResolvedValue(null),
}));

jest.mock('./sessionStore', () => ({
  loadSession: jest.fn().mockResolvedValue(null),
  saveSession: jest.fn().mockResolvedValue(undefined),
  clearSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./browser.factory', () => ({
  createBrowserContext: jest.fn().mockResolvedValue({
    close: jest.fn().mockResolvedValue(undefined),
    cookies: jest.fn().mockResolvedValue([]),
  }),
}));

jest.mock('./vfs/vfs.navigator', () => ({
  runBookingFlow: jest.fn().mockResolvedValue('CONF-123456'),
}));

jest.mock('./vfs/vfs.selectors', () => ({
  applyOverrides: jest.fn(),
}));

jest.mock('@modules/logs/logger', () => ({
  logEvent: jest.fn(),
}));

jest.mock('@utils/retry', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
  withRetry: jest.fn(async (fn: () => Promise<unknown>, opts: { maxAttempts: number; onRetry: (n: number, e: Error) => void }) => {
    let lastErr: Error | undefined;
    for (let i = 1; i <= opts.maxAttempts; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e as Error;
        if (i < opts.maxAttempts) opts.onRetry?.(i, lastErr);
      }
    }
    throw lastErr;
  }),
}));

import { runBooking } from './engine.service';
import { runBookingFlow } from './vfs/vfs.navigator';
import { getProxy, reportBlock } from '@modules/proxy/proxy.service';
import { saveSession, clearSession } from './sessionStore';
import { getSetting } from '@modules/settings/settings.service';

const mockRunBookingFlow = runBookingFlow as jest.Mock;
const mockGetProxy = getProxy as jest.Mock;
const mockReportBlock = reportBlock as jest.Mock;
const mockSaveSession = saveSession as jest.Mock;
const mockClearSession = clearSession as jest.Mock;
const mockGetSetting = getSetting as jest.Mock;

const testJob = {
  profileId: 'profile-1',
  destination: 'portugal',
  visaType: 'SCH',
  slot: { date: '2026-06-01', time: '09:00', destination: 'portugal', visaType: 'SCH' },
  attempt: 3,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRunBookingFlow.mockResolvedValue('CONF-123456');
  mockGetSetting.mockResolvedValue(null); // default: 2 parallel tabs, no selector overrides
});

describe('engine.service - runBooking()', () => {
  it('returns success with confirmationNo on first tab success', async () => {
    const result = await runBooking(testJob as never);

    expect(result.success).toBe(true);
    expect(result.confirmationNo).toBe('CONF-123456');
  });

  it('saves session after successful booking', async () => {
    await runBooking(testJob as never);

    expect(mockSaveSession).toHaveBeenCalled();
  });

  it('loads selector overrides from settings when available', async () => {
    const { applyOverrides } = require('./vfs/vfs.selectors');
    const overrides = { loginEmail: 'input#custom-email' };
    mockGetSetting.mockResolvedValueOnce(overrides); // first call: vfs.selectors

    await runBooking(testJob as never);

    expect(applyOverrides).toHaveBeenCalledWith(overrides);
  });

  it('does not call applyOverrides when no selector overrides in settings', async () => {
    const { applyOverrides } = require('./vfs/vfs.selectors');
    mockGetSetting.mockResolvedValue(null);

    await runBooking(testJob as never);

    expect(applyOverrides).not.toHaveBeenCalled();
  });

  it('returns success=false and error message on all tabs fail', async () => {
    mockRunBookingFlow.mockRejectedValue(new Error('navigation failed'));

    const result = await runBooking(testJob as never);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('reports proxy block when IP_BLOCKED error occurs', async () => {
    const { AppError } = require('@middleware/errorHandler');
    mockRunBookingFlow.mockRejectedValue(
      new AppError(403, 'IP blocked', 'IP_BLOCKED')
    );

    await runBooking(testJob as never);

    expect(mockReportBlock).toHaveBeenCalled();
  });

  it('clears session when session/login error occurs', async () => {
    mockRunBookingFlow.mockRejectedValue(new Error('session expired'));

    await runBooking(testJob as never);

    expect(mockClearSession).toHaveBeenCalled();
  });

  it('retries on failure and returns success if later attempt succeeds', async () => {
    mockRunBookingFlow
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail again'))
      .mockResolvedValue('CONF-789');

    const result = await runBooking({ ...testJob, attempt: 3 } as never);

    expect(result.success).toBe(true);
    expect(result.confirmationNo).toBe('CONF-789');
  });

  it('uses parallelTabs=1 when setting returns 1', async () => {
    mockGetSetting
      .mockResolvedValueOnce(null)  // vfs.selectors
      .mockResolvedValueOnce(1);    // booking.parallelTabs

    await runBooking(testJob as never);

    // With 1 tab, getProxy called exactly once
    expect(mockGetProxy).toHaveBeenCalledTimes(1);
  });
});
