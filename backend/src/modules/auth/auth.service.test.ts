// Set env vars BEFORE any imports that trigger env.ts parsing
process.env.PROFILE_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32ch';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32ch';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

import crypto from 'crypto';

// Mock database before importing service
jest.mock('@config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('@utils/jwt', () => ({
  signAccessToken: jest.fn().mockReturnValue('mock-access-token'),
  signRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
  verifyRefreshToken: jest.fn(),
}));

import { login, refresh, logout } from './auth.service';
import { prisma } from '@config/database';
import bcrypt from 'bcryptjs';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '@utils/jwt';
import { AppError } from '@middleware/errorHandler';

const mockPrismaUser = prisma.user as jest.Mocked<typeof prisma.user>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockJwt = { signAccessToken, signRefreshToken, verifyRefreshToken } as jest.Mocked<{
  signAccessToken: typeof signAccessToken;
  signRefreshToken: typeof signRefreshToken;
  verifyRefreshToken: typeof verifyRefreshToken;
}>;

function sha256(str: string) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

const fakeUser = {
  id: 'user-1',
  email: 'test@example.com',
  passwordHash: '$2a$10$hashedpassword',
  role: 'ADMIN' as const,
  refreshTokenHash: null as string | null,
  pushSubscriptions: [],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('auth.service', () => {
  describe('login()', () => {
    it('returns accessToken, refreshToken, and user on valid credentials', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(fakeUser as never);
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
      (mockPrismaUser.update as jest.Mock).mockResolvedValue(fakeUser);

      const result = await login('test@example.com', 'correctpassword');

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.user.id).toBe('user-1');
      expect(result.user.email).toBe('test@example.com');
    });

    it('throws AppError(401, INVALID_CREDENTIALS) when user not found', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);

      await expect(login('notfound@example.com', 'any')).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });
    });

    it('throws AppError(401, INVALID_CREDENTIALS) when password does not match', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(fakeUser as never);
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(login('test@example.com', 'wrongpassword')).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });
    });

    it('stores SHA-256 hash of refreshToken in DB (not the raw token)', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(fakeUser as never);
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
      (mockPrismaUser.update as jest.Mock).mockResolvedValue(fakeUser);

      await login('test@example.com', 'correctpassword');

      const updateCall = (mockPrismaUser.update as jest.Mock).mock.calls[0][0];
      const storedHash = updateCall.data.refreshTokenHash;
      const expectedHash = sha256('mock-refresh-token');

      expect(storedHash).toBe(expectedHash);
      expect(storedHash).not.toBe('mock-refresh-token');
    });

    it('stored token hash differs from raw token', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(fakeUser as never);
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
      (mockPrismaUser.update as jest.Mock).mockResolvedValue(fakeUser);

      await login('test@example.com', 'correctpassword');

      const updateCall = (mockPrismaUser.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.refreshTokenHash).not.toBe('mock-refresh-token');
    });
  });

  describe('refresh()', () => {
    it('returns new accessToken and refreshToken on valid token', async () => {
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'ADMIN', type: 'refresh' };
      (mockJwt.verifyRefreshToken as jest.Mock).mockReturnValue(payload);

      const userWithHash = { ...fakeUser, refreshTokenHash: sha256('valid-refresh-token') };
      mockPrismaUser.findUnique.mockResolvedValue(userWithHash as never);
      (mockPrismaUser.update as jest.Mock).mockResolvedValue(userWithHash);

      // Need signRefreshToken to return new token
      (signRefreshToken as jest.Mock).mockReturnValueOnce('new-refresh-token');

      const result = await refresh('valid-refresh-token');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('throws AppError(401, TOKEN_INVALID) when JWT verification fails', async () => {
      (mockJwt.verifyRefreshToken as jest.Mock).mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(refresh('expired-token')).rejects.toMatchObject({
        statusCode: 401,
        code: 'TOKEN_INVALID',
      });
    });

    it('throws AppError(401, SESSION_EXPIRED) when user has no refreshTokenHash', async () => {
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'ADMIN', type: 'refresh' };
      (mockJwt.verifyRefreshToken as jest.Mock).mockReturnValue(payload);

      const userNoHash = { ...fakeUser, refreshTokenHash: null };
      mockPrismaUser.findUnique.mockResolvedValue(userNoHash as never);

      await expect(refresh('some-token')).rejects.toMatchObject({
        statusCode: 401,
        code: 'SESSION_EXPIRED',
      });
    });

    it('throws AppError(401, TOKEN_REUSE) on hash mismatch', async () => {
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'ADMIN', type: 'refresh' };
      (mockJwt.verifyRefreshToken as jest.Mock).mockReturnValue(payload);

      const userWithDifferentHash = { ...fakeUser, refreshTokenHash: sha256('different-token') };
      mockPrismaUser.findUnique.mockResolvedValue(userWithDifferentHash as never);
      (mockPrismaUser.update as jest.Mock).mockResolvedValue(userWithDifferentHash);

      await expect(refresh('submitted-token')).rejects.toMatchObject({
        statusCode: 401,
        code: 'TOKEN_REUSE',
      });
    });

    it('nullifies refreshTokenHash in DB on TOKEN_REUSE detection', async () => {
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'ADMIN', type: 'refresh' };
      (mockJwt.verifyRefreshToken as jest.Mock).mockReturnValue(payload);

      const userWithDifferentHash = { ...fakeUser, refreshTokenHash: sha256('different-token') };
      mockPrismaUser.findUnique.mockResolvedValue(userWithDifferentHash as never);
      (mockPrismaUser.update as jest.Mock).mockResolvedValue(userWithDifferentHash);

      await expect(refresh('submitted-token')).rejects.toThrow();

      const updateCall = (mockPrismaUser.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.refreshTokenHash).toBeNull();
    });

    it('new refreshToken differs from the one submitted', async () => {
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'ADMIN', type: 'refresh' };
      (mockJwt.verifyRefreshToken as jest.Mock).mockReturnValue(payload);

      const rawToken = 'original-refresh-token';
      const userWithHash = { ...fakeUser, refreshTokenHash: sha256(rawToken) };
      mockPrismaUser.findUnique.mockResolvedValue(userWithHash as never);

      (signRefreshToken as jest.Mock).mockReturnValueOnce('brand-new-refresh-token');
      (mockPrismaUser.update as jest.Mock).mockResolvedValue(userWithHash);

      const result = await refresh(rawToken);

      expect(result.refreshToken).toBe('brand-new-refresh-token');
      expect(result.refreshToken).not.toBe(rawToken);
    });

    it('stores new refreshToken hash after successful refresh', async () => {
      const payload = { sub: 'user-1', email: 'test@example.com', role: 'ADMIN', type: 'refresh' };
      (mockJwt.verifyRefreshToken as jest.Mock).mockReturnValue(payload);

      const rawToken = 'original-refresh-token';
      const userWithHash = { ...fakeUser, refreshTokenHash: sha256(rawToken) };
      mockPrismaUser.findUnique.mockResolvedValue(userWithHash as never);

      (signRefreshToken as jest.Mock).mockReturnValueOnce('new-refresh-token');
      (mockPrismaUser.update as jest.Mock).mockResolvedValue(userWithHash);

      await refresh(rawToken);

      const updateCall = (mockPrismaUser.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.refreshTokenHash).toBe(sha256('new-refresh-token'));
    });
  });

  describe('logout()', () => {
    it('sets refreshTokenHash to null in DB', async () => {
      (mockPrismaUser.update as jest.Mock).mockResolvedValue(fakeUser);

      await logout('user-1');

      expect(mockPrismaUser.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshTokenHash: null },
      });
    });

    it('does not throw when called with valid userId', async () => {
      (mockPrismaUser.update as jest.Mock).mockResolvedValue(fakeUser);
      await expect(logout('user-1')).resolves.not.toThrow();
    });
  });
});
