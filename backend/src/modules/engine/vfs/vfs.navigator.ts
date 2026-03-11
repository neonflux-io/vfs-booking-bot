import { Page, BrowserContext } from 'playwright';
import { getSelectors } from './vfs.selectors';
import { fillApplicantForm } from './vfs.formFiller';
import { solveCaptcha } from '@modules/captcha/captcha.service';
import { detectBlockFromPage } from '@modules/proxy/blockDetector';
import { clickWithHover, humanDelay, randomScroll } from '../humanBehavior';
import { isSessionExpired } from '../sessionStore';
import { AppError } from '@middleware/errorHandler';
import { SlotInfo } from '@t/index';

const VFS_BASE = 'https://visa.vfsglobal.com';
const ANGOLA_ORIGIN = 'AGO';

interface BookingProfile {
  fullName: string;
  passportNumber: string;
  dob: string;
  passportExpiry: string | Date;
  nationality: string;
  email: string;
  phone: string;
  vfsEmail: string;
  vfsPassword: string;
}

interface NavigatorOptions {
  sessionId: string;
  destination: string;  // "brazil" | "portugal"
  visaType: string;
  slot: SlotInfo;
  profile: BookingProfile;
  manualOverrideWindowMs?: number;
}

type NavState =
  | 'START'
  | 'LOGIN'
  | 'SELECT_PARAMS'
  | 'SELECT_SLOT'
  | 'FILL_FORM'
  | 'REVIEW'
  | 'SUBMIT'
  | 'DONE';

export async function runBookingFlow(
  context: BrowserContext,
  opts: NavigatorOptions
): Promise<string> {
  const page = await context.newPage();
  const sel = getSelectors();
  let state: NavState = 'START';

  try {
    // ── Navigate to VFS ──────────────────────────────────────────────────────
    state = 'START';
    await page.goto(`${VFS_BASE}/ago/${opts.destination.toLowerCase()}/en/entry`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    await humanDelay(1000, 2000);
    await checkForBlock(page, opts.sessionId);

    // ── Login (skip if session already active) ───────────────────────────────
    state = 'LOGIN';
    if (isSessionExpired(page.url())) {
      await performLogin(page, opts.profile.vfsEmail, opts.profile.vfsPassword, opts.sessionId);
    }

    await humanDelay(500, 1500);
    await randomScroll(page);

    // ── Navigate to appointment booking ──────────────────────────────────────
    state = 'SELECT_PARAMS';
    await clickWithHover(page, sel.bookAppointmentLink);
    await page.waitForLoadState('domcontentloaded');
    await humanDelay(800, 1500);

    // Select origin country (Angola)
    if (await page.$(sel.countryOfResidenceDropdown)) {
      await page.selectOption(sel.countryOfResidenceDropdown, ANGOLA_ORIGIN);
      await humanDelay(300, 700);
    }

    // Select destination
    const destCode = opts.destination.toUpperCase() === 'BRAZIL' ? 'BRA' : 'PRT';
    if (await page.$(sel.destinationCountryDropdown)) {
      await page.selectOption(sel.destinationCountryDropdown, destCode);
      await humanDelay(300, 700);
    }

    // Select visa type
    if (await page.$(sel.visaCategoryDropdown)) {
      await page.selectOption(sel.visaCategoryDropdown, opts.visaType);
      await humanDelay(300, 700);
    }

    await clickWithHover(page, sel.continueButton);
    await page.waitForLoadState('domcontentloaded');
    await humanDelay(500, 1000);

    // ── Select the target slot ────────────────────────────────────────────────
    state = 'SELECT_SLOT';
    await selectSlot(page, opts.slot);
    await humanDelay(500, 1000);

    // ── Fill applicant form ──────────────────────────────────────────────────
    state = 'FILL_FORM';
    await fillApplicantForm(page, {
      ...opts.profile,
      passportExpiry: opts.profile.passportExpiry.toString(),
    });

    // ── Manual override window ────────────────────────────────────────────────
    state = 'REVIEW';
    if (opts.manualOverrideWindowMs && opts.manualOverrideWindowMs > 0) {
      await humanDelay(opts.manualOverrideWindowMs, opts.manualOverrideWindowMs);
    }

    // ── Submit ────────────────────────────────────────────────────────────────
    state = 'SUBMIT';
    await checkForBlock(page, opts.sessionId);
    await solveCaptcha(page, opts.sessionId);

    await clickWithHover(page, sel.submitButton);
    await page.waitForLoadState('domcontentloaded');
    await humanDelay(500, 1000);

    // Confirm if a confirm button appears
    if (await page.$(sel.confirmButton)) {
      await clickWithHover(page, sel.confirmButton);
      await page.waitForLoadState('domcontentloaded');
      await humanDelay(500, 1000);
    }

    // ── Extract confirmation ──────────────────────────────────────────────────
    state = 'DONE';
    const confirmationNo = await extractConfirmationNumber(page);
    return confirmationNo;
  } catch (err) {
    throw new AppError(500, `Booking failed at state [${state}]: ${(err as Error).message}`, 'BOOKING_FAILED');
  } finally {
    await page.close();
  }
}

async function performLogin(page: Page, email: string, password: string, sessionId: string) {
  const sel = getSelectors();
  await page.waitForSelector(sel.loginEmail, { timeout: 15_000 });

  await clickWithHover(page, sel.loginEmail);
  await humanDelay(200, 500);

  const { typeText } = await import('../humanBehavior');
  await typeText(page, sel.loginEmail, email);
  await typeText(page, sel.loginPassword, password);

  await solveCaptcha(page, sessionId);
  await humanDelay(300, 700);

  await clickWithHover(page, sel.loginSubmit);
  await page.waitForLoadState('domcontentloaded');
  await humanDelay(1000, 2000);
}

async function selectSlot(page: Page, slot: SlotInfo) {
  const sel = getSelectors();

  // Click the correct date on the calendar
  const dateCell = await page.$(`td[data-date="${slot.date}"], ${sel.slotDateCell}`);
  if (dateCell) {
    await dateCell.click();
    await humanDelay(400, 800);
  }

  // Click the time slot
  const timeButtons = await page.$$(sel.slotTimeButton);
  for (const btn of timeButtons) {
    const text = await btn.textContent();
    if (text?.includes(slot.time)) {
      await btn.click();
      await humanDelay(300, 700);
      return;
    }
  }

  // If specific time not found, click first available
  if (timeButtons.length > 0) {
    await timeButtons[0].click();
    await humanDelay(300, 700);
  }
}

async function extractConfirmationNumber(page: Page): Promise<string> {
  const sel = getSelectors();
  try {
    const el = await page.waitForSelector(sel.confirmationNumber, { timeout: 10_000 });
    const text = await el.textContent();
    return text?.trim() ?? 'UNKNOWN';
  } catch {
    // Try to extract from page text
    const body = await page.evaluate(() => document.body.innerText);
    const match = body.match(/(?:reference|confirmation|booking)[^\w]*([A-Z0-9]{8,20})/i);
    return match?.[1] ?? 'UNKNOWN';
  }
}

async function checkForBlock(page: Page, _sessionId: string) {
  const signal = await detectBlockFromPage(page);
  if (signal) {
    throw new AppError(503, `Blocked: ${signal.type}`, 'IP_BLOCKED');
  }
}
