process.env.PROFILE_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32ch';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32ch';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';
process.env.TWOCAPTCHA_API_KEY = 'test-api-key';

jest.mock('axios');
jest.mock('@utils/retry', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
  withRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

import axios from 'axios';
import { solveTwoCaptcha } from './twoCaptcha';
import { sleep } from '@utils/retry';

const mockAxios = axios as jest.Mocked<typeof axios>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('twoCaptcha', () => {
  describe('solveTwoCaptcha()', () => {
    it('throws when TWOCAPTCHA_API_KEY is not set', async () => {
      const originalKey = process.env.TWOCAPTCHA_API_KEY;
      delete process.env.TWOCAPTCHA_API_KEY;
      // Need to re-require since env is parsed at module load
      jest.resetModules();
      const { solveTwoCaptcha: fresh } = require('./twoCaptcha');
      await expect(fresh('site-key', 'https://page.com')).rejects.toThrow(
        'TWOCAPTCHA_API_KEY is not configured'
      );
      process.env.TWOCAPTCHA_API_KEY = originalKey;
    });

    it('submits task to /in.php with correct params', async () => {
      (mockAxios.post as jest.Mock).mockResolvedValue({
        data: { status: 1, request: 'task-123' },
      });
      (mockAxios.get as jest.Mock).mockResolvedValue({
        data: { status: 1, request: 'solved-token' },
      });

      await solveTwoCaptcha('site-key-abc', 'https://page.com');

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/in.php'),
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            key: 'test-api-key',
            method: 'userrecaptcha',
            googlekey: 'site-key-abc',
            pageurl: 'https://page.com',
          }),
        })
      );
    });

    it('throws when submit response status !== 1', async () => {
      (mockAxios.post as jest.Mock).mockResolvedValue({
        data: { status: 0, request: 'ERROR_KEY_DOES_NOT_EXIST' },
      });

      await expect(solveTwoCaptcha('site-key', 'https://page.com')).rejects.toThrow(
        '2Captcha submit failed'
      );
    });

    it('returns token string when poll succeeds immediately', async () => {
      (mockAxios.post as jest.Mock).mockResolvedValue({
        data: { status: 1, request: 'task-123' },
      });
      (mockAxios.get as jest.Mock).mockResolvedValue({
        data: { status: 1, request: 'the-solved-token' },
      });

      const result = await solveTwoCaptcha('site-key', 'https://page.com');

      expect(result).toBe('the-solved-token');
    });

    it('continues polling when response is CAPCHA_NOT_READY then succeeds', async () => {
      (mockAxios.post as jest.Mock).mockResolvedValue({
        data: { status: 1, request: 'task-123' },
      });
      (mockAxios.get as jest.Mock)
        .mockResolvedValueOnce({ data: { status: 0, request: 'CAPCHA_NOT_READY' } })
        .mockResolvedValueOnce({ data: { status: 0, request: 'CAPCHA_NOT_READY' } })
        .mockResolvedValueOnce({ data: { status: 1, request: 'final-token' } });

      const result = await solveTwoCaptcha('site-key', 'https://page.com');

      expect(result).toBe('final-token');
      expect(mockAxios.get).toHaveBeenCalledTimes(3);
    });

    it('throws on non-CAPCHA_NOT_READY poll error', async () => {
      (mockAxios.post as jest.Mock).mockResolvedValue({
        data: { status: 1, request: 'task-123' },
      });
      (mockAxios.get as jest.Mock).mockResolvedValue({
        data: { status: 0, request: 'ERROR_CAPTCHA_UNSOLVABLE' },
      });

      await expect(solveTwoCaptcha('site-key', 'https://page.com')).rejects.toThrow(
        '2Captcha poll error'
      );
    });

    it('calls sleep between polls', async () => {
      (mockAxios.post as jest.Mock).mockResolvedValue({
        data: { status: 1, request: 'task-123' },
      });
      (mockAxios.get as jest.Mock)
        .mockResolvedValueOnce({ data: { status: 0, request: 'CAPCHA_NOT_READY' } })
        .mockResolvedValueOnce({ data: { status: 1, request: 'token' } });

      await solveTwoCaptcha('site-key', 'https://page.com');

      expect(sleep).toHaveBeenCalled();
    });
  });
});
