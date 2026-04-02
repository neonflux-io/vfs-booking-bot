process.env.PROFILE_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32ch';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32ch';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SESSION_DIR = '/tmp/vfs-test-sessions';
process.env.NODE_ENV = 'test';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  unlink: jest.fn(),
}));

import fs from 'fs/promises';
import { loadSession, saveSession, clearSession, isSessionExpired } from './sessionStore';

const mockFs = fs as jest.Mocked<typeof fs>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('sessionStore', () => {
  describe('loadSession()', () => {
    it('returns cookie JSON string when file exists', async () => {
      const cookieData = JSON.stringify([{ name: 'session', value: 'abc' }]);
      (mockFs.readFile as jest.Mock).mockResolvedValue(cookieData);

      const result = await loadSession('profile-123');

      expect(result).toBe(cookieData);
    });

    it('returns null when file does not exist', async () => {
      (mockFs.readFile as jest.Mock).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );

      const result = await loadSession('profile-123');

      expect(result).toBeNull();
    });
  });

  describe('saveSession()', () => {
    it('calls fs.mkdir to ensure SESSION_DIR exists', async () => {
      (mockFs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (mockFs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const mockContext = {
        cookies: jest.fn().mockResolvedValue([{ name: 'JSESSIONID', value: 'xyz' }]),
      } as never;

      await saveSession('profile-123', mockContext);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        '/tmp/vfs-test-sessions',
        { recursive: true }
      );
    });

    it('writes JSON-stringified cookies to profileId.json path', async () => {
      (mockFs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (mockFs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const cookies = [{ name: 'JSESSIONID', value: 'xyz' }];
      const mockContext = {
        cookies: jest.fn().mockResolvedValue(cookies),
      } as never;

      await saveSession('profile-123', mockContext);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('profile-123.json'),
        JSON.stringify(cookies),
        'utf-8'
      );
    });

    it('does not throw when fs.writeFile fails (non-fatal)', async () => {
      (mockFs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (mockFs.writeFile as jest.Mock).mockRejectedValue(new Error('disk full'));

      const mockContext = {
        cookies: jest.fn().mockResolvedValue([]),
      } as never;

      await expect(saveSession('profile-123', mockContext)).resolves.not.toThrow();
    });
  });

  describe('clearSession()', () => {
    it('calls fs.unlink on the session file', async () => {
      (mockFs.unlink as jest.Mock).mockResolvedValue(undefined);

      await clearSession('profile-123');

      expect(mockFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('profile-123.json')
      );
    });

    it('does not throw when file does not exist', async () => {
      (mockFs.unlink as jest.Mock).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );

      await expect(clearSession('profile-123')).resolves.not.toThrow();
    });
  });

  describe('isSessionExpired()', () => {
    it('returns true for URL containing /login', () => {
      expect(isSessionExpired('https://vfsglobal.com/login')).toBe(true);
    });

    it('returns true for URL containing /signin', () => {
      expect(isSessionExpired('https://vfsglobal.com/signin')).toBe(true);
    });

    it('returns true for URL containing session-expired', () => {
      expect(isSessionExpired('https://vfsglobal.com/session-expired?ref=1')).toBe(true);
    });

    it('is case-insensitive (/Login)', () => {
      expect(isSessionExpired('https://vfsglobal.com/Login')).toBe(true);
    });

    it('is case-insensitive (/SIGNIN)', () => {
      expect(isSessionExpired('https://vfsglobal.com/SIGNIN')).toBe(true);
    });

    it('returns false for normal authenticated URL', () => {
      expect(isSessionExpired('https://vfsglobal.com/ago/prt/en/dashboard')).toBe(false);
    });

    it('returns false for appointment URL', () => {
      expect(isSessionExpired('https://vfsglobal.com/ago/prt/en/schedule-appointment')).toBe(false);
    });
  });
});
