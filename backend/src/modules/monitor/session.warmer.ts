import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logEvent } from '@modules/logs/logger';
import { EventType } from '@prisma/client';
import { env } from '@config/env';
import { 
  secChUaPlatformFromUserAgent, 
} from '@utils/clientHints';
import { playwrightProxyServer } from '@utils/proxyUrl';
import { getCountryISO2 } from '@config/vfs-countries';

// Initialize stealth plugin
chromium.use(StealthPlugin());

/** Helper for random human-like delays */
const delay = (ms?: number) => new Promise(res => setTimeout(res, ms || Math.floor(Math.random() * 2000) + 1000));

export interface VfsCredentials {
  email: string;
  password: string;
}

const HUMAN_DELAY = (ms?: number) => new Promise(res => setTimeout(res, ms || Math.floor(Math.random() * 2000) + 1000));

const USER_AGENTS = [
  { 
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36', 
    ch: '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="24"',
    platform: 'Windows',
    version: '134.0.0.0'
  },
  { 
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36', 
    ch: '"Google Chrome";v="135", "Chromium";v="135", "Not:A-Brand";v="24"',
    platform: 'Windows',
    version: '135.0.0.0'
  },
  { 
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36', 
    ch: '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="24"',
    platform: 'macOS',
    version: '134.0.0.0'
  }
];

const HARDWARE_PROFILES = [
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU (0x000028A1) Direct3D11 vs_5_0 ps_5_0, D3D11)', memory: 8, cores: 8 },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)', memory: 12, cores: 4 },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)', memory: 16, cores: 12 }
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 }
];

function generateFingerprint() {
  const uaInfo = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const hwInfo = HARDWARE_PROFILES[Math.floor(Math.random() * HARDWARE_PROFILES.length)];
  const viewport = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
  
  return { 
    ...uaInfo, 
    ...hwInfo,
    viewport, 
    deviceScaleFactor: 1,
    hasTouch: false
  };
}

/** Launch a stealth Chromium with optional proxy and geo-targeting. */
async function launchBrowser(
  proxy?: { host: string; port: number; auth?: { username: string; password?: string } },
  countryISO2?: string | null
) {
  let finalUsername = proxy?.auth?.username;
  if (finalUsername && proxy?.host.includes('proxyrack') && countryISO2) {
    if (!finalUsername.includes('-country-')) {
      finalUsername = `${finalUsername}-country-${countryISO2.toUpperCase()}`;
    }
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    proxy: proxy
      ? {
          server: playwrightProxyServer(proxy),
          username: finalUsername,
          password: proxy.auth?.password,
        }
      : undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-notifications',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--hide-scrollbars'
    ],
  });

  return browser;
}

/** Verify that the outgoing IP matches the expected country (BH, PK, etc.) using redundant sources. */
/** Helper to block heavy resources (images, fonts, media) to save data/bandwidth */
async function optimizeDataUsage(page: any) {
  await page.route('**/*', (route: any) => {
    const type = route.request().resourceType();
    if (['image', 'media', 'font'].includes(type)) {
      return route.abort();
    }
    return route.continue();
  });
}

async function checkProxyIntegrity(page: any, expectedISO2: string | null): Promise<boolean> {
  if (!expectedISO2) return false;

  const SOURCES = [
    { url: 'https://ifconfig.co/json', key: 'country_iso' },
    { url: 'https://ip-api.com/json', key: 'countryCode' },
  ];

  for (const src of SOURCES) {
    try {
      const response = await page.goto(src.url, { timeout: 12000, waitUntil: 'domcontentloaded' });
      if (!response || response.status() !== 200) continue;

      const data = await response.json();
      const actualISO2 = (data[src.key] || '').toUpperCase();

      if (actualISO2 && actualISO2 !== expectedISO2.toUpperCase()) {
        throw new Error(`PROXY_LOCATION_MISMATCH: Detected ${actualISO2}, expected ${expectedISO2.toUpperCase()}.`);
      }

      if (actualISO2 === expectedISO2.toUpperCase()) {
        logEvent('info', EventType.MONITOR_STARTED, `[Warmer] Proxy Verified: ${actualISO2} (via ${new URL(src.url).hostname})`);
        return true;
      }
    } catch (err: any) {
      if (err.message.includes('PROXY_LOCATION_MISMATCH')) throw err;
      logEvent('warn', EventType.MONITOR_STARTED, `[Warmer] Proxy check via ${src.url} failed: ${err.message}`);
    }
  }

  logEvent('warn', EventType.MONITOR_STARTED, `[Warmer] Verification sites slow/blocked. Proceeding with monitor for ${expectedISO2.toUpperCase()} (Bypassing hard-fail).`);
  return true;
}

/** Helper for human-like typing */
async function typeSlowly(page: any, selector: string, text: string) {
  const element = page.locator(selector).first();
  await element.click();
  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.random() * 120 + 40 });
  }
}

/** Helper to map ISO2 to IANA Timezones */
function getTimezoneForISO2(iso2: string | null): string {
  const mapping: Record<string, string> = {
    'GB': 'Europe/London',
    'PK': 'Asia/Karachi',
    'GR': 'Europe/Athens',
    'CY': 'Asia/Nicosia',
    'PT': 'Europe/Lisbon',
    'DE': 'Europe/Berlin',
    'FR': 'Europe/Paris',
    'AE': 'Asia/Dubai',
    'CH': 'Europe/Zurich',
    'NO': 'Europe/Oslo',
    'JP': 'Asia/Tokyo',
    'BG': 'Europe/Sofia',
    'AT': 'Europe/Vienna',
    'ES': 'Europe/Madrid',
    'PE': 'America/Lima',
    'IN': 'Asia/Kolkata',
    'MA': 'Africa/Casablanca',
    'TR': 'Europe/Istanbul',
    'LB': 'Asia/Beirut'
  };
  return iso2 && mapping[iso2.toUpperCase()] ? mapping[iso2.toUpperCase()] : 'UTC';
}

/** Unified Stealth Injection for all browser entry points */
async function injectStealth(page: any, fingerprint: any, iso2: string | null = 'GB') {
  const timezone = getTimezoneForISO2(iso2);
  
  await page.addInitScript((profile: any) => {
    // 🎭 Mask WebGL Renderer
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
      if (parameter === 37446) return profile.renderer;
      if (parameter === 37445) return profile.vendor;
      return getParameter.apply(this, [parameter]);
    };

    // 🎭 Mask Hardware Concurrency & Memory
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => profile.cores });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => profile.memory });
    
    // 🛡 Deep Webdriver Hiding
    try {
      const newProto = Object.getPrototypeOf(navigator);
      delete (newProto as any).webdriver;
      Object.setPrototypeOf(navigator, newProto);
    } catch {}
    
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
    Object.defineProperty(navigator, 'pdfViewerEnabled', { get: () => true });
    
    const mockPlugins = [
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    ];
    Object.defineProperty(navigator, 'plugins', { get: () => mockPlugins });

    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function() {
      return originalToDataURL.apply(this, arguments as any);
    };

    Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'en-US', 'en'] });

    const { width, height } = profile.viewport;
    Object.defineProperty(window.screen, 'width', { get: () => width });
    Object.defineProperty(window.screen, 'height', { get: () => height });
    Object.defineProperty(window.screen, 'availWidth', { get: () => width });
    Object.defineProperty(window.screen, 'availHeight', { get: () => height });

    Object.defineProperty(Intl.DateTimeFormat.prototype, 'resolvedOptions', {
      value: function() {
        return { ...Intl.DateTimeFormat().resolvedOptions(), timeZone: profile.timezone };
      }
    });
  }, { ...fingerprint, timezone });
}

async function loginAndNavigate(
  browser: any,
  sourceCode: string,
  destinationCode: string,
  credentials: VfsCredentials,
): Promise<void> {
  const loginUrl = `https://visa.vfsglobal.com/${sourceCode}/${destinationCode}/en/login`;
  const scheduleUrl = `https://visa.vfsglobal.com/${sourceCode}/${destinationCode}/en/schedule-appointment`;

  const fingerprint = generateFingerprint();
  const context = await browser.newContext({
    userAgent: fingerprint.ua,
    viewport: fingerprint.viewport,
    extraHTTPHeaders: {
      'sec-ch-ua': fingerprint.ch,
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': secChUaPlatformFromUserAgent(fingerprint.ua),
    },
  });

  const page = await context.newPage();
  await optimizeDataUsage(page);
  const iso2 = getCountryISO2(sourceCode);
  await injectStealth(page, fingerprint, iso2);

  // 🌍 NATURAL ENTRY
  const landingUrl = `https://visa.vfsglobal.com/${sourceCode}/${destinationCode}/en/`;
  logEvent('info', EventType.MONITOR_STARTED, `[Warmer] Establishing natural entry via landing page...`);
  await page.goto(landingUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => null);
  
  const acceptBtn = '#onetrust-accept-btn-handler';
  if (await page.isVisible(acceptBtn).catch(() => false)) {
    await page.click(acceptBtn).catch(() => null);
    await delay(1500);
  }

  await page.mouse.move(100 + Math.random() * 200, 100 + Math.random() * 200);
  await page.mouse.wheel(0, 200 + Math.random() * 300); 
  await HUMAN_DELAY(5000 + Math.random() * 3000);

  let response = await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const landedTitle = await page.title().catch(() => '');

  if (landedTitle === '' || landedTitle.toLowerCase().includes('just a moment')) {
    logEvent('warn', EventType.MONITOR_STARTED, `[Warmer] Detected blank page for ${destinationCode}. Rotating context...`);
    await context.close();
    throw new Error('PROXY_REPUTATION_LOW: Persistent blank page');
  }

  await page.waitForSelector('[ng-version]', { timeout: 30000 }).catch(() => null);

  const emailSelector = 'input[type="email"], input[formcontrolname="email"]';
  const pwdSelector   = 'input[type="password"], input[formcontrolname="password"]';
  
  if (await page.waitForSelector(emailSelector, { timeout: 15000 }).catch(() => false)) {
    await typeSlowly(page, emailSelector, credentials.email);
    await typeSlowly(page, pwdSelector, credentials.password);
    await delay(1000);
    await page.click('button[type="submit"]');
    await page.waitForURL((url: string) => !url.includes('/login'), { timeout: 20000 }).catch(() => null);
  }

  await page.goto(scheduleUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await context.close();
}

export async function warmSessionWithBrowser(
  id: string,
  sourceCode: string,
  destinationCode: string,
  visaCategory: string,
  proxy?: { host: string; port: number; auth?: { username: string; password?: string } },
  credentials?: VfsCredentials,
): Promise<{ cookies: string[]; userAgent: string; secChUa: string; slotData?: any } | undefined> {
  const countryISO2 = getCountryISO2(sourceCode);
  const browser = await launchBrowser(proxy, countryISO2);
  const fingerprint = generateFingerprint();
  
  try {
    if (credentials) {
      await loginAndNavigate(browser, sourceCode, destinationCode, credentials);
    } 

    const context = await browser.newContext({
        userAgent: fingerprint.ua,
        viewport: fingerprint.viewport
    });
    const page = await context.newPage();
    await optimizeDataUsage(page);
    const cookies = await context.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`);
    
    await browser.close();
    return {
      cookies: cookieHeader,
      userAgent: fingerprint.ua,
      secChUa: fingerprint.ch,
      slotData: undefined,
    };
  } catch (err: any) {
    await browser.close();
    throw err;
  }
}

export async function fetchSlotsWithBrowser(
  sourceCode: string,
  destinationCode: string,
  visaCategory: string,
  proxy: { host: string; port: number; auth?: { username: string; password?: string } },
  cookies: string[],
  isVerified: boolean,
  credentials?: VfsCredentials,
): Promise<any> {
    const countryISO2 = getCountryISO2(sourceCode);
    const browser = await launchBrowser(proxy, countryISO2);
    try {
        const fingerprint = generateFingerprint();
        const context = await browser.newContext({
            userAgent: fingerprint.ua,
            viewport: fingerprint.viewport,
        });

        const page = await context.newPage();
        await optimizeDataUsage(page);
        const iso2 = getCountryISO2(sourceCode);
        await injectStealth(page, fingerprint, iso2);

        const scheduleUrl = `https://visa.vfsglobal.com/${sourceCode}/${destinationCode}/en/schedule-appointment`;
        await page.goto(scheduleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const title = await page.title().catch(() => '');
        if (title === '' || title.toLowerCase().includes('just a moment')) {
            throw new Error('PROXY_REPUTATION_LOW: Blank page during slot fetch');
        }

        await browser.close();
        return []; 
    } catch (err: any) {
        await browser.close();
        throw err;
    }
}
