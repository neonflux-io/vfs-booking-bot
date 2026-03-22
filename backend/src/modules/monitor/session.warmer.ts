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
): Promise<{ cookies: string[]; userAgent: string; secChUa: string } | undefined> {
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

    // Navigate and wait for some key indication that the page loaded (and cookies set)
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Optional: wait a bit more for background JS (Cloudflare challenges)
    await page.waitForTimeout(5000);

    const cookies = await context.cookies();
    const cookieStrings = cookies.map(c => `${c.name}=${c.value}`);

    if (cookieStrings.length > 0) {
      logEvent('info', EventType.MONITOR_STARTED, `Successfully acquired warmed cookies for ${destinationCode}.`);
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
  cookies?: string[]
): Promise<any> {
  const baseUrl = `https://visa.vfsglobal.com/${sourceCode}/${destCode}/en/schedule-appointment`;
  const slotsApiUrl = `https://visa.vfsglobal.com/${sourceCode}/${destCode}/en/schedule-appointment/get-slots`;
  
  logEvent('info', EventType.MONITOR_STARTED, `Executing Phase 14 Passive Interception for ${destCode}...`);

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

    // Inject warmed cookies
    if (cookies && cookies.length > 0) {
      const playwrightCookies = cookies.map((c: string) => {
        const equalsIdx = c.indexOf('=');
        const name = c.substring(0, equalsIdx).trim();
        const value = c.substring(equalsIdx + 1).split(';')[0].trim();
        return { name, value, domain: 'visa.vfsglobal.com', path: '/' };
      });
      await context.addCookies(playwrightCookies);
    }

    const page = await context.newPage();

    // RESOURCE OPTIMIZATION
    await page.route('**/*', (route: any) => {
      const reqUrl = route.request().url().toLowerCase();
      const isMedia = reqUrl.match(/\.(png|jpg|jpeg|gif|svg|woff|woff2)$/);
      const isAd = BLOCK_LIST.some((ad: string) => reqUrl.includes(ad));
      if (isMedia || isAd) return route.abort();
      return route.continue();
    });

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // STRATEGY A: Set up passive listener BEFORE navigation to catch any natural get-slots call
    let passiveSlotsData: any = null;
    page.on('response', async (response: any) => {
      if (response.url().includes('get-slots') && response.status() === 200) {
        try {
          passiveSlotsData = await response.json();
          logEvent('info', EventType.MONITOR_STARTED, `Passively captured get-slots for ${destCode}!`);
        } catch {}
      }
    });

    // Navigate and give Angular time to boot
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(8000); // Wait for Angular + auto API calls

    if (passiveSlotsData) {
      return passiveSlotsData;
    }

    // STRATEGY B: Direct browser-context fetch with extracted XSRF token
    logEvent('info', EventType.MONITOR_STARTED, `No passive capture. Trying direct in-browser fetch for ${destCode}...`);
    
    const result = await page.evaluate(async ({ slotsUrl, vCategory }: { slotsUrl: string, vCategory: string }) => {
      // Get XSRF token from cookies
      const xsrf = document.cookie.split(';')
        .map(c => c.trim())
        .find(c => c.startsWith('XSRF-TOKEN='))
        ?.split('=').slice(1).join('=') || '';

      const res = await fetch(slotsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'X-XSRF-TOKEN': decodeURIComponent(xsrf),
          'Referer': window.location.href,
          'Origin': 'https://visa.vfsglobal.com',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          visaCategoryCode: vCategory,
          countryCode: window.location.pathname.split('/')[1]?.toUpperCase() || '',
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return res.json();
    }, { slotsUrl: slotsApiUrl, vCategory: visaCategory });

    return result;

  } catch (err: any) {
    logEvent('error', EventType.BOOKING_FAILED, `Phase 14 bypass failed: ${err.message}`);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}
