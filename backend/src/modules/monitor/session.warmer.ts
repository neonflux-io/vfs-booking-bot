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

export async function warmSessionWithBrowser(
  id: string,
  sourceCode: string,
  destinationCode: string,
  proxy?: { host: string; port: number; auth?: { username: string; password?: string } }
): Promise<{ cookies: string[]; userAgent: string; secChUa: string; slotData?: any } | undefined> {
  const url = `https://visa.vfsglobal.com/${sourceCode}/${destinationCode}/en/schedule-appointment`;
  
  logEvent('info', EventType.MONITOR_STARTED, `Launching ultra-stealth browser to bypass 403 on ${destinationCode}...`);

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
  const secChUa = '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="24"';

  let browser;
  try {
    browser = await chromium.launch({
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

    const context = await browser.newContext({
      userAgent,
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      extraHTTPHeaders: {
        'sec-ch-ua': secChUa,
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

    // RESOURCE OPTIMIZATION: Block heavyweight media and analytics
    await page.route('**/*', route => {
      const url = route.request().url().toLowerCase();
      const isMedia = url.match(/\.(png|jpg|jpeg|gif|svg|woff|woff2|mp4|webm)$/);
      const isAd = BLOCK_LIST.some(ad => url.includes(ad));
      
      if (isMedia || isAd) {
        return route.abort();
      }
      return route.continue();
    });
    
    // Stealth script
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Navigate and wait for cookies to be set
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    
    // Passive listener — catch any natural get-slots call on page load
    let passiveSlotsData: any = null;
    page.on('response', async (response: any) => {
      if (response.url().includes('get-slots') && response.status() === 200) {
        try {
          passiveSlotsData = await response.json();
          logEvent('info', EventType.MONITOR_STARTED, `[Warming] Passively captured get-slots for ${destinationCode}!`);
        } catch {}
      }
    });

    // Wait for Angular + auto API calls
    await page.waitForTimeout(8000);

    const cookies = await context.cookies();
    const cookieStrings = cookies.map(c => `${c.name}=${c.value}`);

    if (cookieStrings.length > 0) {
      logEvent('info', EventType.MONITOR_STARTED, `Successfully acquired warmed cookies for ${destinationCode}.`);

      // If we passively captured slots already, return them
      if (passiveSlotsData) {
        return { cookies: cookieStrings, userAgent, secChUa, slotData: passiveSlotsData };
      }

      // Try to fetch slots using the LIVE XSRF-TOKEN from this same session
      const xsrfCookie = cookies.find(c => c.name === 'XSRF-TOKEN');
      if (xsrfCookie) {
        const xsrfToken = decodeURIComponent(xsrfCookie.value);
        const slotsUrl = `https://visa.vfsglobal.com/${sourceCode}/${destinationCode}/en/schedule-appointment/get-slots`;
        logEvent('info', EventType.MONITOR_STARTED, `[Warming] XSRF-TOKEN found. Attempting in-session slot fetch for ${destinationCode}...`);
        try {
          const slotData = await page.evaluate(
            async ({ url, token, src, vCategory }: { url: string; token: string; src: string; vCategory: string }) => {
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
                body: JSON.stringify({ visaCategory: vCategory, country: src.toUpperCase() }),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
              return res.json();
            },
            { url: slotsUrl, token: xsrfToken, src: sourceCode, vCategory: destinationCode }
          );
          return { cookies: cookieStrings, userAgent, secChUa, slotData };
        } catch (fetchErr: any) {
          logEvent('warn', EventType.BOOKING_FAILED, `[Warming] In-session slot fetch failed: ${fetchErr.message}`);
        }
      }

      return { cookies: cookieStrings, userAgent, secChUa };
    }
  } catch (err: any) {
    logEvent('error', EventType.BOOKING_FAILED, `Browser session warming failed: ${err.message}`);
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
  _cookies?: string[] // retained for API compatibility, not used in Phase 15
): Promise<any> {
  const baseUrl = `https://visa.vfsglobal.com/${sourceCode}/${destCode}/en/schedule-appointment`;
  const slotsApiUrl = `https://visa.vfsglobal.com/${sourceCode}/${destCode}/en/schedule-appointment/get-slots`;
  
  logEvent('info', EventType.MONITOR_STARTED, `Phase 15: Single-Session fetch for ${destCode}...`);

  let browser;
  try {
    browser = await chromium.launch({
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

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      extraHTTPHeaders: {
        'accept-language': 'en-GB,en;q=0.9',
        'sec-ch-ua': '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="24"',
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

    // RESOURCE OPTIMIZATION
    await page.route('**/*', (route: any) => {
      const reqUrl = route.request().url().toLowerCase();
      const isMedia = reqUrl.match(/\.(png|jpg|jpeg|gif|svg|woff|woff2|mp4)$/);
      const isAd = BLOCK_LIST.some((ad: string) => reqUrl.includes(ad));
      if (isMedia || isAd) return route.abort();
      return route.continue();
    });

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // STRATEGY A — Passive listener: catch natural get-slots from Angular
    let passiveSlotsData: any = null;
    page.on('response', async (response: any) => {
      if (response.url().includes('get-slots') && response.status() === 200) {
        try {
          passiveSlotsData = await response.json();
          logEvent('info', EventType.MONITOR_STARTED, `[Phase 15] Passively captured get-slots for ${destCode}!`);
        } catch {}
      }
    });

    // Navigate — domcontentloaded is faster and enough for Angular to start
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(8000); // Let Angular boot and fire API calls

    if (passiveSlotsData) return passiveSlotsData;

    // STRATEGY B — Read XSRF token from LIVE context (not document.cookie, bypasses HttpOnly)
    logEvent('info', EventType.MONITOR_STARTED, `[Phase 15] No passive capture. Extracting live XSRF-TOKEN...`);

    const liveCookies = await context.cookies();
    const xsrfCookie = liveCookies.find(c => c.name === 'XSRF-TOKEN');
    const xsrfToken = xsrfCookie ? decodeURIComponent(xsrfCookie.value) : '';

    if (!xsrfToken) {
      throw new Error('XSRF-TOKEN not found in live browser session. Page may not have loaded Angular properly.');
    }

    logEvent('info', EventType.MONITOR_STARTED, `[Phase 15] XSRF-TOKEN acquired. Making direct page fetch for ${destCode}...`);

    const result = await page.evaluate(
      async ({ url, token, src, vCategory }: { url: string; token: string; src: string; vCategory: string }) => {
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
          body: JSON.stringify({
            visaCategory: vCategory,
            country: src.toUpperCase(),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        return res.json();
      },
      { url: slotsApiUrl, token: xsrfToken, src: sourceCode, vCategory: visaCategory }
    );

    return result;

  } catch (err: any) {
    logEvent('error', EventType.BOOKING_FAILED, `Phase 15 bypass failed: ${err.message}`);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}
