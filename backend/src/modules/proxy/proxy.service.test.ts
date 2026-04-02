process.env.PROFILE_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32ch';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32ch';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

jest.mock('@config/database', () => ({
  prisma: {
    proxy: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('@utils/crypto', () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace(/^enc:/, '')),
  randomInt: jest.fn((min: number) => min),
}));

import { getProxy, reportBlock, addProxy, listProxies, resetProxy, deleteProxy } from './proxy.service';
import { prisma } from '@config/database';

const mockProxyDb = prisma.proxy as jest.Mocked<typeof prisma.proxy>;

const makeProxy = (overrides = {}) => ({
  id: 'proxy-1',
  host: '1.2.3.4',
  port: 8080,
  username: 'user',
  passwordEnc: 'enc:pass',
  provider: 'brightdata',
  country: 'AO',
  status: 'ACTIVE',
  blockCount: 0,
  lastUsedAt: null,
  lastBlockedAt: null,
  createdAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  // Reset round-robin by re-importing (use module reset pattern)
  jest.resetModules();
});

describe('proxy.service', () => {
  describe('getProxy()', () => {
    it('returns null when no ACTIVE proxies exist', async () => {
      (mockProxyDb.findMany as jest.Mock).mockResolvedValue([]);
      const result = await getProxy();
      expect(result).toBeNull();
    });

    it('returns a proxy config with decrypted password', async () => {
      (mockProxyDb.findMany as jest.Mock).mockResolvedValue([makeProxy()]);
      (mockProxyDb.update as jest.Mock).mockResolvedValue(makeProxy());

      const result = await getProxy();

      expect(result).not.toBeNull();
      expect(result?.password).toBe('pass');
    });

    it('formats server as "host:port"', async () => {
      (mockProxyDb.findMany as jest.Mock).mockResolvedValue([makeProxy()]);
      (mockProxyDb.update as jest.Mock).mockResolvedValue(makeProxy());

      const result = await getProxy();

      expect(result?.server).toBe('1.2.3.4:8080');
    });

    it('updates lastUsedAt for the selected proxy', async () => {
      (mockProxyDb.findMany as jest.Mock).mockResolvedValue([makeProxy()]);
      (mockProxyDb.update as jest.Mock).mockResolvedValue(makeProxy());

      await getProxy();

      expect(mockProxyDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
        })
      );
    });

    it('queries only ACTIVE status proxies', async () => {
      (mockProxyDb.findMany as jest.Mock).mockResolvedValue([]);

      await getProxy();

      expect(mockProxyDb.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
        })
      );
    });
  });

  describe('reportBlock()', () => {
    it('increments blockCount by 1', async () => {
      const proxy = makeProxy({ blockCount: 0 });
      (mockProxyDb.findUnique as jest.Mock).mockResolvedValue(proxy);
      (mockProxyDb.update as jest.Mock).mockResolvedValue(proxy);

      await reportBlock('proxy-1');

      const updateCall = (mockProxyDb.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.blockCount).toBe(1);
    });

    it('sets status to BLOCKED when blockCount reaches 3', async () => {
      const proxy = makeProxy({ blockCount: 2 });
      (mockProxyDb.findUnique as jest.Mock).mockResolvedValue(proxy);
      (mockProxyDb.update as jest.Mock).mockResolvedValue(proxy);

      await reportBlock('proxy-1');

      const updateCall = (mockProxyDb.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.status).toBe('BLOCKED');
    });

    it('does not change status to BLOCKED at count 1', async () => {
      const proxy = makeProxy({ blockCount: 0, status: 'ACTIVE' });
      (mockProxyDb.findUnique as jest.Mock).mockResolvedValue(proxy);
      (mockProxyDb.update as jest.Mock).mockResolvedValue(proxy);

      await reportBlock('proxy-1');

      const updateCall = (mockProxyDb.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.status).toBe('ACTIVE');
    });

    it('does not change status to BLOCKED at count 2', async () => {
      const proxy = makeProxy({ blockCount: 1, status: 'ACTIVE' });
      (mockProxyDb.findUnique as jest.Mock).mockResolvedValue(proxy);
      (mockProxyDb.update as jest.Mock).mockResolvedValue(proxy);

      await reportBlock('proxy-1');

      const updateCall = (mockProxyDb.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.status).toBe('ACTIVE');
    });

    it('sets lastBlockedAt timestamp', async () => {
      const proxy = makeProxy({ blockCount: 0 });
      (mockProxyDb.findUnique as jest.Mock).mockResolvedValue(proxy);
      (mockProxyDb.update as jest.Mock).mockResolvedValue(proxy);

      await reportBlock('proxy-1');

      const updateCall = (mockProxyDb.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.lastBlockedAt).toBeInstanceOf(Date);
    });

    it('does nothing when proxyId not found', async () => {
      (mockProxyDb.findUnique as jest.Mock).mockResolvedValue(null);

      await reportBlock('unknown-proxy');

      expect(mockProxyDb.update).not.toHaveBeenCalled();
    });
  });

  describe('addProxy()', () => {
    it('stores encrypted password', async () => {
      (mockProxyDb.create as jest.Mock).mockResolvedValue(makeProxy());

      await addProxy({ host: '1.2.3.4', port: 8080, username: 'user', password: 'secret', provider: 'brightdata' });

      const createCall = (mockProxyDb.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.passwordEnc).toBe('enc:secret');
      expect(createCall.data.password).toBeUndefined();
    });

    it('defaults country to AO when not provided', async () => {
      (mockProxyDb.create as jest.Mock).mockResolvedValue(makeProxy());

      await addProxy({ host: '1.2.3.4', port: 8080, username: 'user', password: 'secret', provider: 'brightdata' });

      const createCall = (mockProxyDb.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.country).toBe('AO');
    });

    it('does not return passwordEnc in response', async () => {
      const selectResponse = { id: 'p1', host: '1.2.3.4', port: 8080, provider: 'brightdata', status: 'ACTIVE', country: 'AO' };
      (mockProxyDb.create as jest.Mock).mockResolvedValue(selectResponse);

      const result = await addProxy({ host: '1.2.3.4', port: 8080, username: 'user', password: 'secret', provider: 'brightdata' });

      expect(result).not.toHaveProperty('passwordEnc');
    });
  });

  describe('listProxies()', () => {
    it('masks host replacing last two octets', async () => {
      (mockProxyDb.findMany as jest.Mock).mockResolvedValue([makeProxy({ host: '192.168.1.100' })]);

      const result = await listProxies();

      expect(result[0].hostMasked).toBe('192.168.*.*');
    });

    it('returns all proxies ordered by createdAt desc', async () => {
      (mockProxyDb.findMany as jest.Mock).mockResolvedValue([makeProxy()]);

      await listProxies();

      expect(mockProxyDb.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } })
      );
    });
  });

  describe('resetProxy()', () => {
    it('clears blockCount and sets status to ACTIVE', async () => {
      const blockedProxy = makeProxy({ status: 'BLOCKED', blockCount: 5 });
      (mockProxyDb.findUnique as jest.Mock).mockResolvedValue(blockedProxy);
      (mockProxyDb.update as jest.Mock).mockResolvedValue(blockedProxy);

      await resetProxy('proxy-1');

      const updateCall = (mockProxyDb.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.status).toBe('ACTIVE');
      expect(updateCall.data.blockCount).toBe(0);
      expect(updateCall.data.lastBlockedAt).toBeNull();
    });

    it('throws AppError(404, NOT_FOUND) when proxy does not exist', async () => {
      (mockProxyDb.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(resetProxy('nonexistent')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  describe('deleteProxy()', () => {
    it('calls prisma.proxy.delete with correct id', async () => {
      (mockProxyDb.delete as jest.Mock).mockResolvedValue(makeProxy());

      await deleteProxy('proxy-1');

      expect(mockProxyDb.delete).toHaveBeenCalledWith({ where: { id: 'proxy-1' } });
    });
  });
});
