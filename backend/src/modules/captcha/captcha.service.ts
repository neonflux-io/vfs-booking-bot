import { Page } from 'playwright';
import { env } from '@config/env';
import { solveTwoCaptcha } from './twoCaptcha';
import { solveManually } from './manualFallback';

interface CaptchaInfo {
  type: 'recaptcha' | 'image' | 'none';
  siteKey?: string;
}

export async function detectCaptcha(page: Page): Promise<CaptchaInfo> {
  try {
    // reCAPTCHA v2
    const siteKey = await page.evaluate(() => {
      const el = document.querySelector('[data-sitekey]');
      return el?.getAttribute('data-sitekey') ?? null;
    });

    if (siteKey) {
      return { type: 'recaptcha', siteKey };
    }

    // Generic image captcha
    const hasImageCaptcha = await page.evaluate(() => {
      const selectors = ['#captcha', '.captcha', 'img[alt*="captcha" i]'];
      return selectors.some((s) => !!document.querySelector(s));
    });

    if (hasImageCaptcha) {
      return { type: 'image' };
    }
  } catch {
    // Page evaluation failed — assume no captcha
  }

  return { type: 'none' };
}

/**
 * Detects and solves captcha. Injects the token into the page.
 * Returns the solved token.
 */
export async function solveCaptcha(
  page: Page,
  sessionId: string
): Promise<string | null> {
  const info = await detectCaptcha(page);
  if (info.type === 'none') return null;

  let token: string;

  if (info.type === 'recaptcha' && info.siteKey) {
    if (env.CAPTCHA_SOLVER === 'twocaptcha') {
      token = await solveTwoCaptcha(info.siteKey, page.url());
    } else {
      token = await solveManually(page, sessionId);
    }

    // Inject token into page
    await page.evaluate((t) => {
      const textarea = document.getElementById('g-recaptcha-response') as HTMLTextAreaElement;
      if (textarea) {
        textarea.style.display = 'block';
        textarea.value = t;
        // Trigger change event
        textarea.dispatchEvent(new Event('change'));
      }
      // Also set on any hidden field
      const hidden = document.querySelector<HTMLInputElement>('input[name="g-recaptcha-response"]');
      if (hidden) hidden.value = t;
    }, token);

    return token;
  }

  // Image captcha — always manual
  token = await solveManually(page, sessionId);
  return token;
}
