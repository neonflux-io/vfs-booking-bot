import { chromium } from 'playwright';
import { logEvent } from '@modules/logs/logger';
import { EventType } from '@prisma/client';
import { env } from '@config/env';

const BLOCK_LIST = [
  'google-analytics',
  'googletagmanager',
  'hotjar',
  'facebook',
  'doubleclick',
  'google ad',
  'analytics',
  'tracking',
  'sentry',
  'clarity',
];

export interface VfsCredentials {
  email: string;
  password: string;
}

/** Launch a stealth Chromium with optional proxy. */
async function launchBrowser(proxy?: { host: string; port: number; auth?: { username: string; password?: string } }) {
  return chromium.launch({
    headless: true,
    executablePath: env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-notifications',
    ],
  });
}

const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
const CHDR = '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="24"';

/**
 * Log in to VFS using Angular Material selectors, then navigate to the
 * schedule-appointment page so Angular fully bootstraps and sets XSRF-TOKEN.
 */
async function loginAndNavigate(
  page: any,
  sourceCode: string,
  destinationCode: string,
  credentials: VfsCredentials,
): Promise<void> {
  const loginUrl = `https://visa.vfsglobal.com/${sourceCode}/${destinationCode}/en/login`;
  const scheduleUrl = `https://visa.vfsglobal.com/${sourceCode}/${destinationCode}/en/schedule-appointment`;

  logEvent('info', EventType.MONITOR_STARTED,
    `[Warmer] Logging in to VFS (${sourceCode}→${destinationCode}) as ${credentials.email}...`);

  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

  // Wait for Angular to bootstrap then for the router to finish loading login module
  await page.waitForSelector('[ng-version]', { timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null);

  // Debug: log all visible buttons so we can identify what's blocking the login form
  const buttons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map(b => ({
      id: (b as HTMLElement).id,
      text: b.textContent?.trim().slice(0, 60),
      visible: (b as HTMLElement).offsetParent !== null,
    }))
  ).catch(() => []) as any[];
  logEvent('info', EventType.MONITOR_STARTED,
    `[Warmer] Buttons on page: ${JSON.stringify(buttons.filter((b: any) => b.visible).slice(0, 12))}`);

  // Dismiss OneTrust — try every known variant (simple banner + full preference center)
  const oneTrustSelectors = [
    '#onetrust-accept-btn-handler',
    '#accept-recommended-btn-handler',
    'button.save-preference-btn-handler',
    '.onetrust-close-btn-handler',
    'button:has-text("Accept All Cookies")',
    'button:has-text("Accept All")',
    'button:has-text("I Accept")',
    'button:has-text("Confirm My Choices")',
    'button:has-text("Allow All")',
    'button:has-text("Agree")',
  ];
  for (const sel of oneTrustSelectors) {
    const clicked = await page.locator(sel).first()
      .click({ timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (clicked) {
      logEvent('info', EventType.MONITOR_STARTED, `[Warmer] Dismissed OneTrust via: ${sel}`);
      // Give Angular time to remove the overlay and render the login form
      // networkidle fires instantly (no network requests from consent click),
      // so we need an explicit wait for the DOM render cycle
      await page.waitForTimeout(3000);
      break;
    }
  }

  // Log current URL/title after OneTrust to detect redirects
  const postConsentUrl   = page.url();
  const postConsentTitle = await page.title().catch(() => '');
  logEvent('info', EventType.MONITOR_STARTED,
    `[Warmer] After OneTrust: URL=${postConsentUrl} | Title=${postConsentTitle}`);

  // VFS IP-block / rate-limit detection: they redirect to page-not-found with a specific message
  if (postConsentUrl.includes('page-not-found') || postConsentTitle.toLowerCase().includes('unable to progress')) {
    throw new Error('VFS blocked this IP — please try again in 1 hour or configure a residential proxy');
  }

  // Wait for login form — Angular renders it after cookie banner is dismissed
  const emailSelector = 'input[id="mat-input-0"], input[type="email"], input[formcontrolname="email"]';
  const pwdSelector   = 'input[id="mat-input-1"], input[type="password"], input[formcontrolname="password"]';

  // First check if it's attached (exists in DOM) — tells us if it's a render vs visibility issue
  const emailAttached = await page.waitForSelector(emailSelector, { timeout: 20000, state: 'attached' })
    .then(() => true).catch(() => false);
  const emailVisible = emailAttached &&
    await page.waitForSelector(emailSelector, { timeout: 5000, state: 'visible' })
      .then(() => true).catch(() => false);
  if (!emailVisible) {
    const allInputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(i => ({
        id: (i as HTMLElement).id, type: (i as HTMLInputElement).type,
        fc: i.getAttribute('formcontrolname'), visible: (i as HTMLElement).offsetParent !== null,
      }))
    ).catch(() => []);
    const pageText = await page.evaluate(() =>
      document.body?.innerText?.slice(0, 500)
    ).catch(() => '');
    logEvent('warn', EventType.MONITOR_STARTED,
      `[Warmer] Email input not found (attached=${emailAttached}). Inputs: ${JSON.stringify(allInputs)} | Body: ${pageText}`);
    throw new Error('Login form not found after OneTrust dismiss attempt');
  }
  await page.fill(emailSelector, credentials.email);
  await page.fill(pwdSelector, credentials.password);

  // Submit and wait for navigation away from login page
  await Promise.all([
    page.waitForURL((url: string) => !url.includes('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]).catch(async () => {
    // If URL didn't change, click confirm button if it appeared
    await page.locator('button:has-text("Confirm"), button:has-text("OK")').first().click({ timeout: 3000 }).catch(() => null);
  });

  logEvent('info', EventType.MONITOR_STARTED,
    `[Warmer] Login succeeded. Navigating to schedule-appointment...`);

  // Navigate to slot-check page so Angular fires get-slots
  await page.goto(scheduleUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
}

export async function warmSessionWithBrowser(
  id: string,
  sourceCode: string,
  destinationCode: string,
  visaCategory: string,
  proxy?: { host: string; port: number; auth?: { username: string; password?: string } },
  credentials?: VfsCredentials,
): Promise<{ cookies: string[]; userAgent: string; secChUa: string; slotData?: any } | undefined> {
  const scheduleUrl = `https://visa.vfsglobal.com/${sourceCode}/${destinationCode}/en/schedule-appointment`;

  logEvent('info', EventType.MONITOR_STARTED,
    `Launching stealth browser to warm session for ${destinationCode}${credentials ? ' (with login)' : ''}...`);

  let browser;
  try {
    browser = await launchBrowser(proxy);

    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      locale: 'en-GB',
      extraHTTPHeaders: {
        'sec-ch-ua': CHDR,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
      ...(proxy && {
        proxy: {
          server: `http://${proxy.host}:${proxy.port}`,
          username: proxy.auth?.username,
          password: proxy.auth?.password,
        },
      }),
    });

    const page = await context.newPage();

    // Block ads/media to save RAM & bandwidth
    await page.route('**/*', (route: any) => {
      const url = route.request().url().toLowerCase();
      if (url.match(/\.(png|jpg|jpeg|gif|svg|woff|woff2|mp4|webm)$/) ||
          BLOCK_LIST.some(s => url.includes(s))) {
        return route.abort();
      }
      return route.continue();
    });

    // Stealth: hide webdriver flag
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Passive listener — registered before any navigation
    let passiveSlotsData: any = null;
    page.on('response', async (response: any) => {
      if (response.url().includes('get-slots') && response.status() === 200) {
        try {
          passiveSlotsData = await response.json();
          logEvent('info', EventType.MONITOR_STARTED,
            `[Warmer] Passively captured get-slots for ${destinationCode}!`);
        } catch {}
      }
    });

    if (credentials) {
      // Full login flow → Angular sets XSRF-TOKEN after auth
      await loginAndNavigate(page, sourceCode, destinationCode, credentials);
    } else {
      // Anonymous visit — may still work for some VFS offices
      await page.goto(scheduleUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector('[ng-version]', { timeout: 30000 }).catch(() => null);
    }

    // Give Angular time to fire auto-API calls (up to 20s, exits early on capture)
    await Promise.race([
      page.waitForResponse(
        (r: any) => r.url().includes('get-slots') && r.status() === 200,
        { timeout: 20000 }
      ).catch(() => null),
      page.waitForTimeout(20000),
    ]);

    const cookies = await context.cookies();
    const cookieStrings = cookies.map(c => `${c.name}=${c.value}`);
    const cookieNames = cookies.map(c => c.name).join(', ');
    logEvent('info', EventType.MONITOR_STARTED,
      `[Warmer] Cookies for ${destinationCode}: [${cookieNames || 'none'}]`);

    if (cookieStrings.length > 0) {
      if (passiveSlotsData) {
        return { cookies: cookieStrings, userAgent: UA, secChUa: CHDR, slotData: passiveSlotsData };
      }

      // Try in-session fetch using live XSRF-TOKEN
      const xsrfCookie = cookies.find(c => c.name === 'XSRF-TOKEN');
      if (xsrfCookie) {
        const xsrfToken = decodeURIComponent(xsrfCookie.value);
        const slotsUrl = `https://visa.vfsglobal.com/${sourceCode}/${destinationCode}/en/schedule-appointment/get-slots`;
        logEvent('info', EventType.MONITOR_STARTED,
          `[Warmer] XSRF-TOKEN found — in-session slot fetch for ${destinationCode}...`);
        try {
          const slotData = await page.evaluate(
            async ({ url, token, src, vCat }: { url: string; token: string; src: string; vCat: string }) => {
              const res = await fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json, text/plain, */*',
                  'X-XSRF-TOKEN': token,
                  'Referer': window.location.href,
                  'Origin': 'https://visa.vfsglobal.com',
                },
                credentials: 'include',
                body: JSON.stringify({ visaCategory: vCat, country: src.toUpperCase() }),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
              return res.json();
            },
            { url: slotsUrl, token: xsrfToken, src: sourceCode, vCat: visaCategory }
          );
          return { cookies: cookieStrings, userAgent: UA, secChUa: CHDR, slotData };
        } catch (fetchErr: any) {
          logEvent('warn', EventType.BOOKING_FAILED,
            `[Warmer] In-session slot fetch failed: ${fetchErr.message}`);
        }
      } else {
        logEvent('warn', EventType.BOOKING_FAILED,
          `[Warmer] XSRF-TOKEN not in cookies — Angular may not have fully initialized.`);
      }

      return { cookies: cookieStrings, userAgent: UA, secChUa: CHDR };
    }

    logEvent('warn', EventType.BOOKING_FAILED,
      `[Warmer] No cookies received for ${destinationCode}.`);
  } catch (err: any) {
    logEvent('error', EventType.BOOKING_FAILED,
      `Browser session warming failed: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }

  return undefined;
}

export async function fetchSlotsWithBrowser(
  sourceCode: string,
  destCode: string,
  visaCategory: string,
  proxy?: { host: string; port: number; auth?: { username: string; password?: string } },
  _cookies?: string[],
  _retried = false,
  credentials?: VfsCredentials,
): Promise<any> {
  const scheduleUrl = `https://visa.vfsglobal.com/${sourceCode}/${destCode}/en/schedule-appointment`;
  const slotsApiUrl  = `https://visa.vfsglobal.com/${sourceCode}/${destCode}/en/schedule-appointment/get-slots`;

  logEvent('info', EventType.MONITOR_STARTED,
    `[BrowserFetch] Single-session slot fetch for ${destCode}${credentials ? ' (with login)' : ''}...`);

  let browser;
  try {
    browser = await launchBrowser(proxy);

    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 720 },
      locale: 'en-GB',
      extraHTTPHeaders: {
        'accept-language': 'en-GB,en;q=0.9',
        'sec-ch-ua': CHDR,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
      ...(proxy && {
        proxy: {
          server: `http://${proxy.host}:${proxy.port}`,
          username: proxy.auth?.username,
          password: proxy.auth?.password,
        },
      }),
    });

    const page = await context.newPage();

    await page.route('**/*', (route: any) => {
      const url = route.request().url().toLowerCase();
      if (url.match(/\.(png|jpg|jpeg|gif|svg|woff|woff2|mp4)$/) ||
          BLOCK_LIST.some((s: string) => url.includes(s))) {
        return route.abort();
      }
      return route.continue();
    });

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Passive listener
    let passiveSlotsData: any = null;
    page.on('response', async (response: any) => {
      if (response.url().includes('get-slots') && response.status() === 200) {
        try {
          passiveSlotsData = await response.json();
          logEvent('info', EventType.MONITOR_STARTED,
            `[BrowserFetch] Passively captured get-slots for ${destCode}!`);
        } catch {}
      }
    });

    if (credentials) {
      await loginAndNavigate(page, sourceCode, destCode, credentials);
    } else {
      await page.goto(scheduleUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector('[ng-version]', { timeout: 30000 }).catch(() => null);
    }

    // Wait up to 20s for passive capture
    await Promise.race([
      page.waitForResponse(
        (r: any) => r.url().includes('get-slots') && r.status() === 200,
        { timeout: 20000 }
      ).catch(() => null),
      page.waitForTimeout(20000),
    ]);

    if (passiveSlotsData) return passiveSlotsData;

    // Extract XSRF-TOKEN for direct fetch
    logEvent('info', EventType.MONITOR_STARTED,
      `[BrowserFetch] No passive capture — extracting XSRF-TOKEN...`);

    const liveCookies = await context.cookies();
    const xsrfCookie  = liveCookies.find(c => c.name === 'XSRF-TOKEN');

    if (!xsrfCookie) {
      const names = liveCookies.map(c => c.name).join(', ');
      throw new Error(`XSRF-TOKEN not found. Present cookies: [${names || 'none'}]`);
    }

    const xsrfToken = decodeURIComponent(xsrfCookie.value);
    logEvent('info', EventType.MONITOR_STARTED,
      `[BrowserFetch] XSRF-TOKEN acquired — posting to get-slots...`);

    return await page.evaluate(
      async ({ url, token, src, vCat }: { url: string; token: string; src: string; vCat: string }) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'X-XSRF-TOKEN': token,
            'Referer': window.location.href,
            'Origin': 'https://visa.vfsglobal.com',
          },
          credentials: 'include',
          body: JSON.stringify({ visaCategory: vCat, country: src.toUpperCase() }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        return res.json();
      },
      { url: slotsApiUrl, token: xsrfToken, src: sourceCode, vCat: visaCategory }
    );

  } catch (err: any) {
    if (!_retried) {
      logEvent('warn', EventType.BOOKING_FAILED,
        `[BrowserFetch] First attempt failed (${err.message}). Retrying with login...`);
      return fetchSlotsWithBrowser(sourceCode, destCode, visaCategory, proxy, _cookies, true, credentials);
    }
    logEvent('error', EventType.BOOKING_FAILED, `[BrowserFetch] Failed: ${err.message}`);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}
