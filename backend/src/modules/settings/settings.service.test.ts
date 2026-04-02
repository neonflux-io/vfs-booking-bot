process.env.PROFILE_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32ch';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32ch';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

jest.mock('@config/database', () => ({
  prisma: {
    settings: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    globalSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

import { getSetting, setSetting, getAllSettings, invalidateCache, getGlobalSettings, updateGlobalSettings } from './settings.service';
import { prisma } from '@config/database';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  jest.clearAllMocks();
  // Clear in-memory cache between tests by invalidating all keys
  invalidateCache();
});

describe('settings.service', () => {
  describe('getSetting()', () => {
    it('returns null when setting does not exist', async () => {
      (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getSetting('nonexistent.key');

      expect(result).toBeNull();
    });

    it('returns setting value when found', async () => {
      (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue({
        key: 'notifications.telegram.enabled',
        value: true,
      });

      const result = await getSetting<boolean>('notifications.telegram.enabled');

      expect(result).toBe(true);
    });

    it('returns string value correctly', async () => {
      (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue({
        key: 'notifications.email.recipient',
        value: 'admin@example.com',
      });

      const result = await getSetting<string>('notifications.email.recipient');

      expect(result).toBe('admin@example.com');
    });

    it('caches result so DB is only queried once', async () => {
      (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue({
        key: 'test.key',
        value: 42,
      });

      await getSetting('test.key');
      await getSetting('test.key');

      expect(mockPrisma.settings.findUnique).toHaveBeenCalledTimes(1);
    });

    it('returns cached value on second call', async () => {
      (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue({
        key: 'test.key',
        value: 'cached-value',
      });

      const first = await getSetting<string>('test.key');
      // Change mock to return something different
      (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue({
        key: 'test.key',
        value: 'new-value',
      });
      const second = await getSetting<string>('test.key');

      expect(first).toBe('cached-value');
      expect(second).toBe('cached-value'); // still cached
    });

    it('re-queries DB after cache is invalidated', async () => {
      (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue({
        key: 'test.key',
        value: 'old-value',
      });
      await getSetting('test.key');

      invalidateCache('test.key');

      (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue({
        key: 'test.key',
        value: 'fresh-value',
      });
      const result = await getSetting<string>('test.key');

      expect(result).toBe('fresh-value');
      expect(mockPrisma.settings.findUnique).toHaveBeenCalledTimes(2);
    });

    it('re-queries DB after full cache clear', async () => {
      (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue({
        key: 'test.key',
        value: 'original',
      });
      await getSetting('test.key');

      invalidateCache(); // clear all

      (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue({
        key: 'test.key',
        value: 'refreshed',
      });
      const result = await getSetting<string>('test.key');

      expect(result).toBe('refreshed');
    });
  });

  describe('setSetting()', () => {
    it('calls prisma.settings.upsert with correct args', async () => {
      (mockPrisma.settings.upsert as jest.Mock).mockResolvedValue(undefined);

      await setSetting('notifications.telegram.enabled', true);

      expect(mockPrisma.settings.upsert).toHaveBeenCalledWith({
        where: { key: 'notifications.telegram.enabled' },
        update: { value: true },
        create: { key: 'notifications.telegram.enabled', value: true },
      });
    });

    it('updates cache so next getSetting returns new value without DB hit', async () => {
      (mockPrisma.settings.upsert as jest.Mock).mockResolvedValue(undefined);
      (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue(null);

      await setSetting('my.setting', 'new-value');
      const result = await getSetting<string>('my.setting');

      // findUnique should NOT be called (setSetting updated cache)
      expect(mockPrisma.settings.findUnique).not.toHaveBeenCalled();
      expect(result).toBe('new-value');
    });

    it('stores object values', async () => {
      (mockPrisma.settings.upsert as jest.Mock).mockResolvedValue(undefined);

      const obj = { loginEmail: 'input#email', loginPassword: 'input#pwd' };
      await setSetting('vfs.selectors', obj);

      expect(mockPrisma.settings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ value: obj }) }),
      );
    });
  });

  describe('getAllSettings()', () => {
    it('returns empty object when no settings exist', async () => {
      (mockPrisma.settings.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getAllSettings();

      expect(result).toEqual({});
    });

    it('returns key-value map of all settings', async () => {
      (mockPrisma.settings.findMany as jest.Mock).mockResolvedValue([
        { key: 'notifications.telegram.enabled', value: true },
        { key: 'notifications.email.recipient', value: 'ops@example.com' },
      ]);

      const result = await getAllSettings();

      expect(result).toEqual({
        'notifications.telegram.enabled': true,
        'notifications.email.recipient': 'ops@example.com',
      });
    });
  });

  describe('getGlobalSettings()', () => {
    it('returns settings row when singleton exists', async () => {
      const row = { id: 'singleton', proxyHost: 'proxy.example.com', proxyPort: 8080, proxyUsername: 'user', proxyPassword: 'pass' };
      (mockPrisma.globalSettings.findUnique as jest.Mock).mockResolvedValue(row);

      const result = await getGlobalSettings();

      expect(result.proxyHost).toBe('proxy.example.com');
    });

    it('returns defaults when singleton does not exist', async () => {
      (mockPrisma.globalSettings.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getGlobalSettings();

      expect(result).toEqual({
        proxyHost: '',
        proxyPort: 8080,
        proxyUsername: '',
        proxyPassword: '',
      });
    });
  });

  describe('updateGlobalSettings()', () => {
    it('calls prisma.globalSettings.upsert with provided data', async () => {
      (mockPrisma.globalSettings.upsert as jest.Mock).mockResolvedValue({});

      await updateGlobalSettings({ proxyHost: 'new-proxy.com', proxyPort: 9090 });

      expect(mockPrisma.globalSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'singleton' },
          update: expect.objectContaining({ proxyHost: 'new-proxy.com' }),
        }),
      );
    });
  });

  describe('invalidateCache()', () => {
    it('can invalidate a specific key without affecting others', async () => {
      (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue({ key: 'k', value: 'v' });

      await getSetting('key-a');
      await getSetting('key-b');

      jest.clearAllMocks(); // reset call counts

      invalidateCache('key-a');

      // key-b is still cached — no DB hit
      await getSetting('key-b');
      expect(mockPrisma.settings.findUnique).not.toHaveBeenCalled();

      // key-a was invalidated — DB hit expected
      (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue({ key: 'key-a', value: 'fresh' });
      await getSetting('key-a');
      expect(mockPrisma.settings.findUnique).toHaveBeenCalledTimes(1);
    });
  });
});
