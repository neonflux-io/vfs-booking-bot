import { Telegraf, Context } from 'telegraf';
import { env } from '@config/env';
import { getMonitorStatus, stopMonitor } from '@modules/monitor/monitor.service';
import { getProfiles } from '@modules/profiles/profiles.service';
import { logEvent } from '@modules/logs/logger';
import { EventType } from '@prisma/client';

let bot: Telegraf | null = null;

export function initTelegramBot(): Telegraf | null {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not set — bot interface disabled');
    return null;
  }

  bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  // ── Authentication Middleware ──────────────────────────────────────────────
  bot.use(async (ctx: Context, next: () => Promise<void>) => {
    const chatId = ctx.chat?.id.toString();
    if (chatId !== env.TELEGRAM_CHAT_ID) {
      console.warn(`🚨 Unauthorized bot access attempt from chat ID: ${chatId}`);
      await ctx.reply('⛔ Unauthorized. This bot is private.');
      return;
    }
    return next();
  });

  // ── Commands ───────────────────────────────────────────────────────────────

  bot.start((ctx: Context) => {
    ctx.reply(
      '🤖 *VFS Booking Bot Online*\n\n' +
      'Commands:\n' +
      '/status - Check active monitors\n' +
      '/profiles - List applicant profiles\n' +
      '/stop_all - Stop all active monitors\n' +
      '/help - Show this message',
      { parse_mode: 'Markdown' }
    );
  });

  bot.help((ctx: Context) => {
    ctx.reply(
      '📖 *Help & Commands*\n\n' +
      '/status - Show real-time monitoring status\n' +
      '/profiles - List all active applicant profiles\n' +
      '/stop_all - Emergency stop for all monitors\n',
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('status', async (ctx: Context) => {
    const statuses = getMonitorStatus();
    if (statuses.length === 0) {
      return ctx.reply('📭 No active monitors.');
    }

    const message = statuses
      .map((s) => 
        `📍 *${s.destination.toUpperCase()}* (${s.visaType})\n` +
        `   Status: ${s.isRunning ? '🟢 Running' : '🔴 Stopped'}\n` +
        `   Mode: ${s.mode}\n` +
        `   Slots Found: ${s.slotDetectedCount}\n` +
        `   Last Sync: ${s.lastCheckedAt ? new Date(s.lastCheckedAt).toLocaleTimeString() : 'Never'}`
      )
      .join('\n\n');

    ctx.reply(`📊 *Current Status*\n\n${message}`, { parse_mode: 'Markdown' });
  });

  bot.command('profiles', async (ctx: Context) => {
    try {
      const { items } = await getProfiles({ limit: 10 });
      if (items.length === 0) {
        return ctx.reply('👤 No profiles found.');
      }

      const message = items
        .map((p: any) => 
          `👤 *${p.fullName}*\n` +
          `   Passport: \`${p.passportNumberMasked}\`\n` +
          `   Priority: ${p.priority}`
        )
        .join('\n\n');
      ctx.reply(`📋 *Applicant Profiles*\n\n${message}`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply('❌ Error fetching profiles.');
    }
  });

  bot.command('stop_all', async (ctx: Context) => {
    const statuses = getMonitorStatus();
    if (statuses.length === 0) return ctx.reply('No monitors to stop.');

    for (const monitor of statuses) {
      try {
        stopMonitor(monitor.id);
      } catch (e) { /* ignore */ }
    }

    ctx.reply('🔒 *All monitors stopped.*');
    logEvent('warn', EventType.MONITOR_STOPPED, 'All monitors stopped via Telegram command');
  });

  // ── Launch ─────────────────────────────────────────────────────────────────

  bot.launch()
    .then(() => console.info('✅ Telegram bot interface started'))
    .catch((err: Error) => console.error('❌ Failed to start Telegram bot:', err));

  // Enable graceful stop
  process.once('SIGINT', () => bot?.stop('SIGINT'));
  process.once('SIGTERM', () => bot?.stop('SIGTERM'));

  return bot;
}

export function getBotInstance(): Telegraf | null {
  return bot;
}

/** Legacy notification wrapper — keeps existing sendTelegram compatible */
export async function sendTelegram(message: string): Promise<void> {
  if (!bot || !env.TELEGRAM_CHAT_ID) return;
  try {
    await bot.telegram.sendMessage(env.TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
  } catch (err: unknown) {
    console.error('Failed to send Telegram notification:', err);
  }
}
