process.env.PROFILE_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32ch';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32ch';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

jest.mock('@config/database', () => ({
  prisma: {
    profile: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('./telegram.bot', () => ({
  sendTelegram: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./webPush', () => ({
  sendPushToAll: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@modules/settings/settings.service', () => ({
  getSetting: jest.fn(),
}));

import { dispatchNotification } from './notification.service';
import { sendTelegram } from './telegram.bot';
import { sendEmail } from './email';
import { sendPushToAll } from './webPush';
import { getSetting } from '@modules/settings/settings.service';
import { prisma } from '@config/database';

const mockSendTelegram = sendTelegram as jest.Mock;
const mockSendEmail = sendEmail as jest.Mock;
const mockSendPushToAll = sendPushToAll as jest.Mock;
const mockGetSetting = getSetting as jest.Mock;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const slotPayload = {
  event: 'SLOT_DETECTED' as const,
  sourceCountry: 'angola',
  destination: 'portugal',
  visaType: 'SCH',
  slotDate: '2026-06-01',
};

const successPayload = {
  event: 'BOOKING_SUCCESS' as const,
  profileId: 'profile-1',
  sourceCountry: 'angola',
  destination: 'portugal',
  visaType: 'SCH',
  confirmationNo: 'CONF-123456',
};

const failedPayload = {
  event: 'BOOKING_FAILED' as const,
  profileId: 'profile-1',
  sourceCountry: 'angola',
  destination: 'portugal',
  errorMessage: 'Session expired',
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: all channels disabled
  mockGetSetting.mockResolvedValue(false);
  (mockPrisma.profile.findUnique as jest.Mock).mockResolvedValue(null);
});

describe('notification.service - dispatchNotification()', () => {
  it('does not call sendTelegram when telegram disabled', async () => {
    mockGetSetting.mockResolvedValue(false);

    await dispatchNotification(slotPayload);

    expect(mockSendTelegram).not.toHaveBeenCalled();
  });

  it('calls sendTelegram when telegram enabled', async () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'notifications.telegram.enabled') return Promise.resolve(true);
      return Promise.resolve(false);
    });

    await dispatchNotification(slotPayload);

    expect(mockSendTelegram).toHaveBeenCalledTimes(1);
    expect(mockSendTelegram).toHaveBeenCalledWith(expect.stringContaining('SLOT DETECTED'));
  });

  it('calls sendEmail when email enabled and recipient set', async () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'notifications.email.enabled') return Promise.resolve(true);
      if (key === 'notifications.email.recipient') return Promise.resolve('admin@example.com');
      return Promise.resolve(false);
    });

    await dispatchNotification(slotPayload);

    expect(mockSendEmail).toHaveBeenCalledWith(
      'admin@example.com',
      expect.any(String),
      expect.any(String),
    );
  });

  it('does not call sendEmail when recipient not set', async () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'notifications.email.enabled') return Promise.resolve(true);
      if (key === 'notifications.email.recipient') return Promise.resolve(null);
      return Promise.resolve(false);
    });

    await dispatchNotification(slotPayload);

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('calls sendPushToAll when push enabled', async () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'notifications.push.enabled') return Promise.resolve(true);
      return Promise.resolve(false);
    });

    await dispatchNotification(slotPayload);

    expect(mockSendPushToAll).toHaveBeenCalledTimes(1);
  });

  it('does not throw when telegram fails (Promise.allSettled)', async () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'notifications.telegram.enabled') return Promise.resolve(true);
      if (key === 'notifications.email.enabled') return Promise.resolve(true);
      if (key === 'notifications.email.recipient') return Promise.resolve('a@b.com');
      return Promise.resolve(false);
    });
    mockSendTelegram.mockRejectedValue(new Error('Telegram API down'));

    // Should not throw
    await expect(dispatchNotification(slotPayload)).resolves.not.toThrow();
    // Email should still be called despite Telegram failure
    expect(mockSendEmail).toHaveBeenCalled();
  });

  it('BOOKING_SUCCESS message includes confirmationNo', async () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'notifications.telegram.enabled') return Promise.resolve(true);
      return Promise.resolve(false);
    });
    (mockPrisma.profile.findUnique as jest.Mock).mockResolvedValue({ fullName: 'John Doe', email: 'j@d.com' });

    await dispatchNotification(successPayload);

    expect(mockSendTelegram).toHaveBeenCalledWith(
      expect.stringContaining('CONF-123456'),
    );
  });

  it('BOOKING_FAILED message includes error message', async () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'notifications.telegram.enabled') return Promise.resolve(true);
      return Promise.resolve(false);
    });
    (mockPrisma.profile.findUnique as jest.Mock).mockResolvedValue({ fullName: 'Jane Doe', email: 'j@d.com' });

    await dispatchNotification(failedPayload);

    expect(mockSendTelegram).toHaveBeenCalledWith(
      expect.stringContaining('Session expired'),
    );
  });

  it('fetches profile name for BOOKING_SUCCESS when profileId provided', async () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'notifications.telegram.enabled') return Promise.resolve(true);
      return Promise.resolve(false);
    });
    (mockPrisma.profile.findUnique as jest.Mock).mockResolvedValue({ fullName: 'Alice Smith', email: 'a@s.com' });

    await dispatchNotification(successPayload);

    expect(mockPrisma.profile.findUnique).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      select: { fullName: true, email: true },
    });
    expect(mockSendTelegram).toHaveBeenCalledWith(
      expect.stringContaining('Alice Smith'),
    );
  });

  it('does not fetch profile when no profileId', async () => {
    await dispatchNotification(slotPayload);

    expect(mockPrisma.profile.findUnique).not.toHaveBeenCalled();
  });

  it('SLOT_DETECTED telegram message includes route label', async () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'notifications.telegram.enabled') return Promise.resolve(true);
      return Promise.resolve(false);
    });

    await dispatchNotification(slotPayload);

    const msg = mockSendTelegram.mock.calls[0][0] as string;
    expect(msg).toContain('ANGOLA');
    expect(msg).toContain('PORTUGAL');
  });

  it('BOOKING_SUCCESS email subject contains confirmationNo', async () => {
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'notifications.email.enabled') return Promise.resolve(true);
      if (key === 'notifications.email.recipient') return Promise.resolve('ops@vfs.com');
      return Promise.resolve(false);
    });
    (mockPrisma.profile.findUnique as jest.Mock).mockResolvedValue({ fullName: 'Bob', email: 'b@b.com' });

    await dispatchNotification(successPayload);

    expect(mockSendEmail).toHaveBeenCalledWith(
      'ops@vfs.com',
      expect.stringContaining('CONF-123456'),
      expect.any(String),
    );
  });
});
