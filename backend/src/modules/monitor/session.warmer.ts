import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logEvent } from '@modules/logs/logger';
import { EventType } from '@prisma/client';
import { env } from '@config/env';
import { 
  secChUaPlatformFromUserAgent, 
  secChUaArchFromUserAgent, 
  secChUaFullVersionList 
} from '@utils/clientHints';
import { playwrightProxyServer } from '@utils/proxyUrl';
import { agentDebug } from '@utils/agentDebug';

// Initialize stealth plugin
chromium.use(StealthPlugin());

/** Helper for random human-like delays */
const delay = (ms?: number) => new Promise(res => setTimeout(res, ms || Math.floor(Math.random() * 2000) + 1000));

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

const HUMAN_DELAY = (ms?: number) => new Promise(res => setTimeout(res, ms || Math.floor(Math.random() * 2000) + 1000));

const USER_AGENTS = [
  // 🏁 CAMO-CHROME: Force Native Linux UA to match Docker environment
  { 
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36', 
    ch: '"Google Chrome";v="134", "Chromium";v="134", "Not:A-Brand";v="24"',
    version: '134.0.0.0'
  },
  { 
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36', 
    ch: '"Google Chrome";v="132", "Chromium";v="132", "Not:A-Brand";v="24"',
    version: '132.0.0.0'
  }
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 }
];

function generateFingerprint() {
  const uaInfo = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const viewport = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
  return { 
    ...uaInfo, 
    viewport, 
    deviceScaleFactor: Math.random() > 0.5 ? 1 : 2,
    hasTouch: Math.random() > 0.8
  };
}

/** Launch a stealth Chromium with optional proxy. */
async function launchBrowser(proxy?: { host: string; port: number; auth?: { username: string; password?: string } }) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    proxy: proxy
      ? {
          server: playwrightProxyServer(proxy),
          username: proxy.auth?.username,
          password: proxy.auth?.password,
        }
      : undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-notifications',
      '--disable-blink-features=AutomationControlled',
      '--hide-scrollbars'
    ],
  });

  return browser;
}

/** Bezier-like mouse move to simulate human velocity */
async function moveMouseHuman(page: any, x: number, y: number) {
  const steps = 10 + Math.floor(Math.random() * 10);
  await page.mouse.move(x, y, { steps });
}

/** Helper for human-like typing */
async function typeSlowly(page: any, selector: string, text: string) {
  const element = page.locator(selector).first();
  await element.click();
  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.random() * 120 + 40 });
  }
}

/**
 * Log in to VFS using Angular Material selectors, then navigate to the
 * schedule-appointment page so Angular fully bootstraps and sets XSRF-TOKEN.
 */
async function loginAndNavigate(
  browser: any,
  sourceCode: string,
  destinationCode: string,
  credentials: VfsCredentials,
  proxyForLog?: { host: string; port: number },
): Promise<void> {
  const loginUrl = `https://visa.vfsglobal.com/${sourceCode}/${destinationCode}/en/login`;
  const scheduleUrl = `https://visa.vfsglobal.com/${sourceCode}/${destinationCode}/en/schedule-appointment`;

  const fingerprint = generateFingerprint();
  const context = await browser.newContext({
    userAgent: fingerprint.ua,
    viewport: fingerprint.viewport,
    deviceScaleFactor: fingerprint.deviceScaleFactor,
    hasTouch: fingerprint.hasTouch,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    extraHTTPHeaders: {
      'sec-ch-ua': fingerprint.ch,
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': secChUaPlatformFromUserAgent(fingerprint.ua),
      'sec-ch-ua-arch': secChUaArchFromUserAgent(fingerprint.ua),
      'sec-ch-ua-full-version-list': secChUaFullVersionList(fingerprint.version),
    },
  });

  const page = await context.newPage();

  // 🧪 EXPERT BYPASS: Add human-like jitter before first navigation
  await HUMAN_DELAY(Math.floor(Math.random() * 3000) + 1500);

  // 🧪 EXPERT DIAGNOSTIC: Dual-Path IP Audit (Proxy vs Direct)
  const ipCheck = async (useProxy = true) => {
    try {
      const res = await page.evaluate(async () => {
        const r = await fetch('https://api64.ipify.org?format=json', { cache: 'no-store' });
        return (await r.json()).ip;
      });
      return res;
    } catch (e: any) {
      return `FAILED (${e.message})`;
    }
  };

  const proxyIp = await ipCheck(true);
  
  logEvent('info', EventType.MONITOR_STARTED,
    `[Warmer] Outgoing IP (Proxy Path): <b>${proxyIp}</b>`);

  if (proxyIp.includes('FAILED')) {
    const ep = proxyForLog ? `${proxyForLog.host}:${proxyForLog.port}` : 'n/a';
    logEvent('warn', EventType.MONITOR_STARTED, `[Warmer] Proxy IP Check failed. Endpoint: ${ep}. Investigating direct path...`);
  }

  let response = await page.goto(loginUrl, { waitUntil: 'commit', timeout: 45000 });

  // 🧪 EXPERT DIAGNOSTIC: Capture Firewall Headers
  const status = response?.status() || 'unknown';
  const cfRay  = await response?.headerValue('cf-ray') || 'none';
  const server = await response?.headerValue('server') || 'unknown';

  // Log what page we actually landed on before waiting for Angular
  let landedUrl   = page.url();
  let landedTitle = await page.title().catch(() => '');
  
    // 🏁 ZERO-FRUSTRATION WHISPERER: 45s wait with "Shaky Reading" simulation
    if (landedTitle === '' || landedUrl.includes('about:blank')) {
      logEvent('warn', EventType.MONITOR_STARTED, `[Warmer] Detected blank page for ${destinationCode}. Simulating "Human Shaky Reading" for 45s...`);
      
      // Shaky Reading: Z-pattern mouse movements + random tremors + subtle scrolls
      for (let i = 0; i < 9; i++) {
        const startX = 100 + Math.random() * 50;
        const startY = 100 + (i * 80);
        
        // Tremor: random mouse jitter to simulate a real human hand
        for (let j = 0; j < 3; j++) {
           await page.mouse.move(startX + (Math.random() * 10 - 5), startY + (Math.random() * 10 - 5));
           await page.waitForTimeout(150 + Math.random() * 100);
        }

        // Z-pattern move: (Left to Right) then (Right to Left + Down)
        await moveMouseHuman(page, 800 - Math.random() * 100, startY + (Math.random() * 20 - 10));
        
        if (i % 2 === 0) {
           await page.mouse.wheel(0, 30 + Math.random() * 20); // Natural scroll
        }
        
        // Human Gaze: Stop and "read" middle of screen
        if (i === 4) {
          await page.mouse.move(400 + Math.random() * 100, 300 + Math.random() * 100, { steps: 20 });
          await HUMAN_DELAY(4000 + Math.random() * 3000);
        } else {
          await HUMAN_DELAY(3000 + Math.random() * 2000);
        }
        
        // Early exit if the title appears (challenge solved!)
        landedTitle = await page.title().catch(() => '');
        if (landedTitle !== '' && !landedTitle.toLowerCase().includes('just a moment')) {
           logEvent('info', EventType.MONITOR_STARTED, `[Warmer] Challenge solved for ${destinationCode}! Page Title: "${landedTitle}"`);
           break;
        }
      }

    landedUrl   = page.url();
    landedTitle = await page.title().catch(() => '');
  }

  logEvent('info', EventType.MONITOR_STARTED,
    `[Warmer] Landed on: ${landedUrl} | "${landedTitle}" (Fingerprint: ${fingerprint.viewport.width}x${fingerprint.viewport.height})`);

  // 🧪 EARLY ERROR DETECTION: Catch blankets/500s/Blocks before Angular hangs
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 1000).toLowerCase()).catch(() => '');
  const isCloudflare = landedTitle.toLowerCase().includes('just a moment') || bodyText.includes('checking your browser');
  const isBlocked    = landedTitle.toLowerCase().includes('access denied') || bodyText.includes('403 forbidden');

  if (bodyText.includes('unexpected error') || bodyText.includes('500') || bodyText.includes('unable to progress') || landedTitle === '' || isCloudflare || isBlocked) {
    logEvent('error', EventType.MONITOR_STARTED, 
      `[Warmer] VFS blocked/failed. Status=${status} | RayID=${cfRay} | Server=${server} | Title="${landedTitle}" (CH=${isCloudflare}, BL=${isBlocked})`);
    
    // #region agent log
    agentDebug({
      hypothesisId: 'VFS-E',
      location: 'session.warmer.ts:loginAndNavigate',
      message: 'vfs_challenge_or_blank',
      data: {
        httpStatus: status,
        raySuffix: String(cfRay).slice(-8),
        server,
        emptyTitle: landedTitle === '',
        isCloudflare,
        isBlocked,
        dest: destinationCode,
      },
    });
    // #endregion
    await context.close();
    throw new Error(`VFS_SERVER_ERROR: VFS returned a broken/blocked page (Status: ${status}, Title: "${landedTitle}")`);
  }

  // Wait for Angular to bootstrap then for the router to finish loading login module
  await page.waitForSelector('[ng-version]', { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);

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
    const loc = page.locator(sel).first();
    const isVisible = await loc.isVisible().catch(() => false);
    if (!isVisible) continue;

    // Small random move before click
    await page.mouse.move(Math.random() * 400, Math.random() * 300);
    
    const clicked = await loc.click({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (clicked) {
      logEvent('info', EventType.MONITOR_STARTED, `[Warmer] Dismissed OneTrust via: ${sel}`);
      await delay(2000); // Wait for animation
      break;
    }
  }

  // Log current URL/title after OneTrust to detect redirects
  const postConsentUrl   = page.url();
  const postConsentTitle = await page.title().catch(() => '');
  logEvent('info', EventType.MONITOR_STARTED,
    `[Warmer] After OneTrust: URL=${postConsentUrl} | Title=${postConsentTitle}`);

  // 🧪 NEW: Detect if we landed on an error page instead of the login form
  const postConsentBody = await page.evaluate(() => document.body?.innerText?.slice(0, 1000).toLowerCase()).catch(() => '');
  if (postConsentBody.includes('unexpected error') || postConsentBody.includes('500') || postConsentBody.includes('unable to progress')) {
    logEvent('error', EventType.MONITOR_STARTED, `[Warmer] VFS served an error page (500/Unexpected). Body: ${postConsentBody.slice(0, 200)}...`);
    throw new Error('VFS_SERVER_ERROR: VFS returned a 500 or Unexpected Error page');
  }

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
    const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 800)).catch(() => '');
    if (pageText.toLowerCase().includes('unable to progress') || pageText.toLowerCase().includes('one hour')) {
       throw new Error('VFS_BLOCKED_IP: VFS detected bot activity and requested 1 hour wait');
    }
    
    const allInputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(i => ({
        id: (i as HTMLElement).id, type: (i as HTMLInputElement).type,
        fc: i.getAttribute('formcontrolname'), visible: (i as HTMLElement).offsetParent !== null,
      }))
    ).catch(() => []);
    
    logEvent('warn', EventType.MONITOR_STARTED,
      `[Warmer] Email input not found. Inputs: ${JSON.stringify(allInputs)} | Body: ${pageText.slice(0, 100)}...`);
    throw new Error('Login form not found after OneTrust dismiss attempt');
  }

  // Humanized interaction: Move mouse and type slowly
  await page.mouse.move(100 + Math.random() * 200, 200 + Math.random() * 150);
  await delay(800);
  await typeSlowly(page, emailSelector, credentials.email);
  await delay(500);
  await typeSlowly(page, pwdSelector, credentials.password);
  await delay(1000);

  // Submit and wait for navigation away from login page
  const navigationSuccess = await Promise.race([
    page.waitForURL((url: string) => !url.includes('/login'), { timeout: 30000 }).then(() => true),
    page.click('button[type="submit"]').then(() => false),
  ]).catch(() => false);

  if (!navigationSuccess) {
    // If stuck on login page, check for "Invalid email or password"
    const loginError = await page.evaluate(() => 
      document.body?.innerText?.toLowerCase().includes('invalid email or password') ||
      document.body?.innerText?.toLowerCase().includes('login failed')
    ).catch(() => false);

    if (loginError) {
      logEvent('error', EventType.BOOKING_FAILED, `[Warmer] VFS rejected login: Invalid email or password. Please check your credentials.`);
      throw new Error('VFS_INVALID_CREDENTIALS: VFS rejected your email/password');
    }

    // Try clicking confirm/OK just in case it popped up
    await page.locator('button:has-text("Confirm"), button:has-text("OK")').first().click({ timeout: 3000 }).catch(() => null);
  }

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

    const fingerprint = generateFingerprint();
    const context = await browser.newContext({
      userAgent: fingerprint.ua,
      viewport: fingerprint.viewport,
      deviceScaleFactor: fingerprint.deviceScaleFactor,
      hasTouch: fingerprint.hasTouch,
      locale: 'en-GB',
      timezoneId: 'Europe/London',
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'sec-ch-ua': fingerprint.ch,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': secChUaPlatformFromUserAgent(fingerprint.ua),
        'sec-ch-ua-arch': secChUaArchFromUserAgent(fingerprint.ua),
        'sec-ch-ua-full-version-list': secChUaFullVersionList(fingerprint.version),
      },
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

    // Stealth: hide webdriver flag and jitter WebGL
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      
      // WebGL Masking
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
        // UNMASKED_RENDERER_WEBGL
        if (parameter === 37446) return 'Graphics Adapter (NVIDIA Direct3D11 vs_5_0 ps_5_0)';
        // UNMASKED_VENDOR_WEBGL
        if (parameter === 37445) return 'Google Inc. (NVIDIA)';
        return getParameter.apply(this, [parameter]);
      };
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
      await loginAndNavigate(browser, sourceCode, destinationCode, credentials, proxy);
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
        return { cookies: cookieStrings, userAgent: fingerprint.ua, secChUa: fingerprint.ch, slotData: passiveSlotsData };
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
          return { cookies: cookieStrings, userAgent: fingerprint.ua, secChUa: fingerprint.ch, slotData };
        } catch (fetchErr: any) {
          logEvent('warn', EventType.BOOKING_FAILED,
            `[Warmer] In-session slot fetch failed: ${fetchErr.message}`);
        }
      } else {
        logEvent('warn', EventType.BOOKING_FAILED,
          `[Warmer] XSRF-TOKEN not in cookies — Angular may not have fully initialized.`);
      }

      return { cookies: cookieStrings, userAgent: fingerprint.ua, secChUa: fingerprint.ch };
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

    const fingerprint = generateFingerprint();
    const context = await browser.newContext({
      userAgent: fingerprint.ua,
      viewport: fingerprint.viewport,
      deviceScaleFactor: fingerprint.deviceScaleFactor,
      hasTouch: fingerprint.hasTouch,
      locale: 'en-GB',
      timezoneId: 'Europe/London',
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'sec-ch-ua': fingerprint.ch,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': secChUaPlatformFromUserAgent(fingerprint.ua),
        'sec-ch-ua-arch': secChUaArchFromUserAgent(fingerprint.ua),
        'sec-ch-ua-full-version-list': secChUaFullVersionList(fingerprint.version),
      },
    });

    const page = await context.newPage();

    await page.route('**/*', (route: any) => {
      const url = route.request().url().toLowerCase();
      // 🎨 STEALTH: Allow CSS — Cloudflare often uses layout-based checks that fail if CSS is blocked
      if (url.match(/\.(png|jpg|jpeg|gif|svg|woff|woff2|mp4)$/) ||
          BLOCK_LIST.some((s: string) => url.includes(s))) {
        return route.abort();
      }
      return route.continue();
    });

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
        if (parameter === 37446) return 'Graphics Adapter (NVIDIA Direct3D11 vs_5_0 ps_5_0)';
        if (parameter === 37445) return 'Google Inc. (NVIDIA)';
        return getParameter.apply(this, [parameter]);
      };
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
      await loginAndNavigate(browser, sourceCode, destCode, credentials, proxy);
    } else {
      await page.goto(scheduleUrl, { waitUntil: 'commit', timeout: 45000 });
      
      // 🧪 STEALTH: Human-like pause after load
      await page.waitForTimeout(Math.random() * 3000 + 2000);
      
      // 🧪 STEALTH: Minimal mouse jitter to trigger "active" flags
      await page.mouse.move(100 + Math.random() * 50, 100 + Math.random() * 50);
      
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
