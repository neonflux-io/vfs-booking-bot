process.env.PROFILE_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32ch';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32ch';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

import { detectBlockFromResponse, detectBlockFromPage } from './blockDetector';

function mockResponse(status: number, url: string) {
  return {
    status: () => status,
    url: () => url,
  } as never;
}

function mockPage(url: string, bodyText: string, throwOnEvaluate = false) {
  return {
    url: () => url,
    evaluate: throwOnEvaluate
      ? jest.fn().mockRejectedValue(new Error('page navigated'))
      : jest.fn().mockResolvedValue(bodyText),
  } as never;
}

describe('blockDetector', () => {
  describe('detectBlockFromResponse()', () => {
    it('returns { type: ip_block } for status 403', () => {
      const result = detectBlockFromResponse(mockResponse(403, 'https://example.com/page'));
      expect(result).toEqual({ type: 'ip_block' });
    });

    it('returns { type: rate_limit } for status 429', () => {
      const result = detectBlockFromResponse(mockResponse(429, 'https://example.com/page'));
      expect(result).toEqual({ type: 'rate_limit' });
    });

    it('returns { type: ip_block } for status 503', () => {
      const result = detectBlockFromResponse(mockResponse(503, 'https://example.com/page'));
      expect(result).toEqual({ type: 'ip_block' });
    });

    it('returns null for status 200', () => {
      const result = detectBlockFromResponse(mockResponse(200, 'https://example.com/page'));
      expect(result).toBeNull();
    });

    it('returns { type: ip_block } when URL contains /blocked', () => {
      const result = detectBlockFromResponse(mockResponse(200, 'https://example.com/blocked'));
      expect(result).toEqual({ type: 'ip_block' });
    });

    it('returns { type: ip_block } when URL contains /captcha', () => {
      const result = detectBlockFromResponse(mockResponse(200, 'https://example.com/captcha?id=1'));
      expect(result).toEqual({ type: 'ip_block' });
    });

    it('returns { type: ip_block } when URL contains /access-denied', () => {
      const result = detectBlockFromResponse(mockResponse(200, 'https://example.com/access-denied'));
      expect(result).toEqual({ type: 'ip_block' });
    });

    it('returns { type: ip_block } when URL contains /rate-limit', () => {
      const result = detectBlockFromResponse(mockResponse(200, 'https://example.com/rate-limit'));
      expect(result).toEqual({ type: 'ip_block' });
    });

    it('returns null for normal URL with 200 status', () => {
      const result = detectBlockFromResponse(mockResponse(200, 'https://visa.vfsglobal.com/agb/prt/en/entry'));
      expect(result).toBeNull();
    });
  });

  describe('detectBlockFromPage()', () => {
    it('returns { type: session_expired } when URL contains /login', async () => {
      const result = await detectBlockFromPage(mockPage('https://example.com/login', 'Login page'));
      expect(result).toEqual({ type: 'session_expired' });
    });

    it('returns { type: session_expired } when URL contains /signin', async () => {
      const result = await detectBlockFromPage(mockPage('https://example.com/signin', 'Sign in'));
      expect(result).toEqual({ type: 'session_expired' });
    });

    it('is case-insensitive for login URL check', async () => {
      const result = await detectBlockFromPage(mockPage('https://example.com/Login', 'Login'));
      expect(result).toEqual({ type: 'session_expired' });
    });

    it('returns { type: ip_block } when body text contains "access denied"', async () => {
      const result = await detectBlockFromPage(mockPage('https://normal.com', 'Your access denied by firewall.'));
      expect(result).toEqual({ type: 'ip_block' });
    });

    it('returns { type: ip_block } when body text contains "your ip"', async () => {
      const result = await detectBlockFromPage(mockPage('https://normal.com', 'Your IP has been blocked.'));
      expect(result).toEqual({ type: 'ip_block' });
    });

    it('returns { type: rate_limit } when body text contains "too many requests"', async () => {
      const result = await detectBlockFromPage(mockPage('https://normal.com', 'Too many requests. Please wait.'));
      expect(result).toEqual({ type: 'rate_limit' });
    });

    it('returns { type: rate_limit } when body text contains "rate limit"', async () => {
      const result = await detectBlockFromPage(mockPage('https://normal.com', 'Rate limit exceeded'));
      expect(result).toEqual({ type: 'rate_limit' });
    });

    it('returns null when page is normal', async () => {
      const result = await detectBlockFromPage(mockPage('https://normal.com', 'Welcome to our booking system'));
      expect(result).toBeNull();
    });

    it('returns null when page.evaluate throws (handles gracefully)', async () => {
      const result = await detectBlockFromPage(mockPage('https://normal.com', '', true));
      expect(result).toBeNull();
    });
  });
});
