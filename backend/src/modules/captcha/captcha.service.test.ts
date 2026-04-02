process.env.PROFILE_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32ch';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32ch';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';
process.env.CAPTCHA_SOLVER = 'twocaptcha';
process.env.TWOCAPTCHA_API_KEY = 'test-api-key';

jest.mock('./twoCaptcha', () => ({
  solveTwoCaptcha: jest.fn().mockResolvedValue('solved-recaptcha-token'),
}));

jest.mock('./manualFallback', () => ({
  solveManually: jest.fn().mockResolvedValue('solved-manual-token'),
}));

import { detectCaptcha, solveCaptcha } from './captcha.service';
import { solveTwoCaptcha } from './twoCaptcha';
import { solveManually } from './manualFallback';

function makePage(opts: {
  siteKey?: string | null;
  hasImageCaptcha?: boolean;
  throwOnEval?: boolean;
  url?: string;
}) {
  return {
    url: () => opts.url ?? 'https://vfsglobal.com/page',
    evaluate: opts.throwOnEval
      ? jest.fn().mockRejectedValue(new Error('nav'))
      : jest.fn()
          .mockResolvedValueOnce(opts.siteKey ?? null)       // first evaluate: siteKey check
          .mockResolvedValueOnce(opts.hasImageCaptcha ?? false) // second evaluate: image captcha check
          .mockResolvedValue(undefined),                      // subsequent: token injection
  } as never;
}

function makePageWithEval(responses: (unknown)[]) {
  const mock = jest.fn();
  responses.forEach((r) => {
    if (r instanceof Error) mock.mockRejectedValueOnce(r);
    else mock.mockResolvedValueOnce(r);
  });
  return {
    url: () => 'https://vfsglobal.com/page',
    evaluate: mock,
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('captcha.service', () => {
  describe('detectCaptcha()', () => {
    it('returns { type: recaptcha, siteKey } when [data-sitekey] element found', async () => {
      const page = makePage({ siteKey: 'site-key-123' });
      const result = await detectCaptcha(page);
      expect(result.type).toBe('recaptcha');
      expect(result.siteKey).toBe('site-key-123');
    });

    it('returns { type: image } when hasImageCaptcha=true (no sitekey)', async () => {
      const page = makePage({ siteKey: null, hasImageCaptcha: true });
      const result = await detectCaptcha(page);
      expect(result.type).toBe('image');
    });

    it('returns { type: none } when no captcha elements present', async () => {
      const page = makePage({ siteKey: null, hasImageCaptcha: false });
      const result = await detectCaptcha(page);
      expect(result.type).toBe('none');
    });

    it('returns { type: none } when page.evaluate throws', async () => {
      const page = makePage({ throwOnEval: true });
      const result = await detectCaptcha(page);
      expect(result.type).toBe('none');
    });
  });

  describe('solveCaptcha()', () => {
    it('returns null when detectCaptcha returns type=none', async () => {
      const page = makePage({ siteKey: null, hasImageCaptcha: false });
      const result = await solveCaptcha(page, 'session-1');
      expect(result).toBeNull();
    });

    it('calls solveTwoCaptcha when type=recaptcha and CAPTCHA_SOLVER=twocaptcha', async () => {
      // Simulate: first eval returns siteKey, subsequent evals return undefined (injection)
      const page = makePageWithEval(['site-key-abc', undefined, undefined, undefined]);
      const result = await solveCaptcha(page, 'session-1');
      expect(solveTwoCaptcha).toHaveBeenCalledWith('site-key-abc', expect.any(String));
      expect(result).toBe('solved-recaptcha-token');
    });

    it('calls solveManually for image captcha regardless of CAPTCHA_SOLVER', async () => {
      const page = makePage({ siteKey: null, hasImageCaptcha: true });
      await solveCaptcha(page, 'session-1');
      expect(solveManually).toHaveBeenCalled();
      expect(solveTwoCaptcha).not.toHaveBeenCalled();
    });
  });
});
