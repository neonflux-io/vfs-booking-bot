import { getSetting } from '@modules/settings/settings.service';
import { prisma } from '@config/database';
import { sendTelegram } from './telegram';
import { sendEmail } from './email';
import { sendPushToAll } from './webPush';

interface NotificationPayload {
  event: 'SLOT_DETECTED' | 'BOOKING_SUCCESS' | 'BOOKING_FAILED';
  profileId?: string;
  destination?: string;
  confirmationNo?: string;
  slotDate?: string;
  errorMessage?: string;
}

function formatTelegramMessage(p: NotificationPayload & { profileName?: string }): string {
  const ts = new Date().toISOString();
  switch (p.event) {
    case 'SLOT_DETECTED':
      return `🟡 *Slot Detected*\nDestination: ${p.destination}\nDate: ${p.slotDate ?? 'N/A'}\n_${ts}_`;
    case 'BOOKING_SUCCESS':
      return `✅ *Booking Confirmed*\nApplicant: ${p.profileName ?? 'Unknown'}\nDestination: ${p.destination}\nRef: \`${p.confirmationNo}\`\n_${ts}_`;
    case 'BOOKING_FAILED':
      return `❌ *Booking Failed*\nApplicant: ${p.profileName ?? 'Unknown'}\nDestination: ${p.destination}\nError: ${p.errorMessage}\n_${ts}_`;
  }
}

function formatEmailHtml(p: NotificationPayload & { profileName?: string }): { subject: string; html: string } {
  switch (p.event) {
    case 'SLOT_DETECTED':
      return {
        subject: `VFS Slot Available — ${p.destination}`,
        html: `<h2>Appointment Slot Detected</h2><p>Destination: ${p.destination}<br>Date: ${p.slotDate ?? 'N/A'}</p>`,
      };
    case 'BOOKING_SUCCESS':
      return {
        subject: `Booking Confirmed — ${p.confirmationNo}`,
        html: `<h2>Appointment Booked Successfully</h2><p>Applicant: ${p.profileName}<br>Destination: ${p.destination}<br>Confirmation: <strong>${p.confirmationNo}</strong></p>`,
      };
    case 'BOOKING_FAILED':
      return {
        subject: `Booking Failed — ${p.destination}`,
        html: `<h2>Booking Failed</h2><p>Applicant: ${p.profileName}<br>Destination: ${p.destination}<br>Error: ${p.errorMessage}</p>`,
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
