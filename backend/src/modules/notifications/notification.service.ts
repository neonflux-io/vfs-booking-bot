import { getSetting } from '@modules/settings/settings.service';
import { prisma } from '@config/database';
import { sendTelegram } from './telegram.bot';
import { sendEmail } from './email';
import { sendPushToAll } from './webPush';
import { getCountryLabel, getCentreLabel } from '@config/vfs-countries';

interface NotificationPayload {
  event: 'SLOT_DETECTED' | 'BOOKING_SUCCESS' | 'BOOKING_FAILED';
  profileId?: string;
  sourceCountry?: string;
  destination?: string;
  centre?: string;
  visaType?: string;
  confirmationNo?: string;
  slotDate?: string;
  errorMessage?: string;
}

function getVisaLabel(code?: string): string {
  if (!code) return 'N/A';
  return code;
}

function getRouteLabel(source?: string, dest?: string): string {
  if (!source || !dest) return dest ? getCountryLabel(dest) : 'VFS';
  return `[${getCountryLabel(source)} → ${getCountryLabel(dest)}]`;
}

function getCentreDisplay(source?: string, centre?: string): string {
  if (!centre) return '';
  if (source) return `\nCentre: ${getCentreLabel(source, centre)}`;
  return `\nCentre: ${centre}`;
}

function formatTelegramMessage(p: NotificationPayload & { profileName?: string }): string {
  const ts = new Date().toISOString();
  const route = getRouteLabel(p.sourceCountry, p.destination);
  const centre = getCentreDisplay(p.sourceCountry, p.centre);
  switch (p.event) {
    case 'SLOT_DETECTED':
      return `🟡 *SLOT DETECTED ${route}*${centre}\nVisa: ${getVisaLabel(p.visaType)}\nDate: ${p.slotDate ?? 'N/A'}\n\n_${ts}_`;
    case 'BOOKING_SUCCESS':
      return `✅ *BOOKING CONFIRMED ${route}*${centre}\nApplicant: ${p.profileName ?? 'Unknown'}\nRef: \`${p.confirmationNo}\`\n\n_${ts}_`;
    case 'BOOKING_FAILED':
      return `❌ *BOOKING FAILED ${route}*${centre}\nApplicant: ${p.profileName ?? 'Unknown'}\nError: ${p.errorMessage}\n\n_${ts}_`;
  }
}

function formatEmailHtml(p: NotificationPayload & { profileName?: string }): { subject: string; html: string } {
  const destLabel = p.destination ? getCountryLabel(p.destination) : p.destination;
  const centreText = p.centre && p.sourceCountry
    ? `<br>Application Centre: ${getCentreLabel(p.sourceCountry, p.centre)}`
    : '';

  switch (p.event) {
    case 'SLOT_DETECTED':
      return {
        subject: `VFS Slot Available — ${destLabel}`,
        html: `<h2>Appointment Slot Detected</h2><p>Destination: ${destLabel}${centreText}<br>Date: ${p.slotDate ?? 'N/A'}</p>`,
      };
    case 'BOOKING_SUCCESS':
      return {
        subject: `Booking Confirmed — ${p.confirmationNo}`,
        html: `<h2>Appointment Booked Successfully</h2><p>Applicant: ${p.profileName}<br>Destination: ${destLabel}${centreText}<br>Confirmation: <strong>${p.confirmationNo}</strong></p>`,
      };
    case 'BOOKING_FAILED':
      return {
        subject: `Booking Failed — ${destLabel}`,
        html: `<h2>Booking Failed</h2><p>Applicant: ${p.profileName}<br>Destination: ${destLabel}${centreText}<br>Error: ${p.errorMessage}</p>`,
      };
  }
}

export async function dispatchNotification(payload: NotificationPayload): Promise<void> {
  let profileName: string | undefined;
  if (payload.profileId) {
    const profile = await prisma.profile.findUnique({
      where: { id: payload.profileId },
      select: { fullName: true, email: true },
    });
    profileName = profile?.fullName;
  }

  const enriched = { ...payload, profileName };

  // Fire all enabled channels in parallel; failure in one does not block others
  await Promise.allSettled([
    (async () => {
      const enabled = await getSetting<boolean>('notifications.telegram.enabled');
      if (enabled) await sendTelegram(formatTelegramMessage(enriched));
    })(),
    (async () => {
      const enabled = await getSetting<boolean>('notifications.email.enabled');
      if (enabled) {
        const { subject, html } = formatEmailHtml(enriched);
        const adminEmail = await getSetting<string>('notifications.email.recipient');
        if (adminEmail) await sendEmail(adminEmail, subject, html);
      }
    })(),
    (async () => {
      const enabled = await getSetting<boolean>('notifications.push.enabled');
      if (enabled) await sendPushToAll(enriched);
    })(),
  ]);
}
