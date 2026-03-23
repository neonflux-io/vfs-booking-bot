import { Telegraf, Context } from 'telegraf';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { env } from '@config/env';
import { getMonitorStatus, stopMonitor } from '@modules/monitor/monitor.service';
import { getProfiles } from '@modules/profiles/profiles.service';
import { logEvent } from '@modules/logs/logger';
import { EventType } from '@prisma/client';

const escapeHTML = (str: string) => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

let bot: Telegraf | null = null;

export function initTelegramBot(): Telegraf | null {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not set — bot interface disabled');
    return null;
  }

  const agent = env.TELEGRAM_PROXY ? new HttpsProxyAgent(env.TELEGRAM_PROXY) : undefined;
  bot = new Telegraf(env.TELEGRAM_BOT_TOKEN, {
    telegram: { agent }
  });

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
      '🤖 <b>VFS Booking Bot Online</b>\n\n' +
      'Commands:\n' +
      '/status - Check active monitors\n' +
      '/profiles - List applicant profiles\n' +
      '/stop_all - Stop all active monitors\n' +
      '/help - Show this message',
      { parse_mode: 'HTML' }
    );
  });

  bot.help((ctx: Context) => {
    ctx.reply(
      '📖 <b>Help & Commands</b>\n\n' +
      '/status - Show real-time monitoring status\n' +
      '/profiles - List all active applicant profiles\n' +
      '/stop_all - Emergency stop for all monitors\n',
      { parse_mode: 'HTML' }
    );
  });

  bot.command('status', async (ctx: Context) => {
    const statuses = getMonitorStatus();
    if (statuses.length === 0) {
      return ctx.reply('📭 No active monitors.');
    }

    const message = statuses
      .map((s: any) => 
        `📍 <b>[${escapeHTML(s.sourceCountry?.toUpperCase()) || '??'} → ${escapeHTML(s.destination?.toUpperCase())}]</b>\n` +
        `   Visa: <code>${escapeHTML(s.visaType)}</code>\n` +
        `   Status: ${s.isRunning ? '🟢 Running' : '🔴 Stopped'}\n` +
        `   Mode: ${escapeHTML(s.mode)}\n` +
        `   Slots Found: ${s.slotDetectedCount}\n` +
        `   Last Sync: ${s.lastCheckedAt ? new Date(s.lastCheckedAt).toLocaleTimeString() : 'Never'}`
      )
      .join('\n\n');

    ctx.reply(`📊 <b>Current Status</b>\n\n${message}`, { parse_mode: 'HTML' });
  });

  bot.command('profiles', async (ctx: Context) => {
    try {
      const { items } = await getProfiles({ limit: 10 });
      if (items.length === 0) {
        return ctx.reply('👤 No profiles found.');
      }

      const message = items
        .map((p: any) => 
          `👤 <b>${escapeHTML(p.fullName)}</b>\n` +
          `   Passport: <code>${escapeHTML(p.passportNumberMasked)}</code>\n` +
          `   Priority: ${escapeHTML(p.priority)}`
        )
        .join('\n\n');
      ctx.reply(`📋 <b>Applicant Profiles</b>\n\n${message}`, { parse_mode: 'HTML' });
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

    ctx.reply('🔒 <b>All monitors stopped.</b>', { parse_mode: 'HTML' });
    logEvent('warn', EventType.MONITOR_STOPPED, 'All monitors stopped via Telegram command');
  });

  // ── Launch ─────────────────────────────────────────────────────────────────

  const launchWithRetry = async (attempts = 0) => {
    try {
      await bot?.launch();
      console.info('✅ Telegram bot interface started');
    } catch (err: any) {
      const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Exponential backoff
      console.error(`❌ Failed to launch Telegram bot: ${err.message}. Retrying in ${delay/1000}s...`);
      setTimeout(() => launchWithRetry(attempts + 1), delay);
    }
  };

  launchWithRetry();

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
    await bot.telegram.sendMessage(env.TELEGRAM_CHAT_ID, message, { parse_mode: 'HTML' });
  } catch (err: unknown) {
    console.error('Failed to send Telegram notification:', err);
  }
}
