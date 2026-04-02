import { Telegraf, Context } from 'telegraf';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { env } from '@config/env';
import { getProfiles } from '@modules/profiles/profiles.service';
import { logEvent } from '@modules/logs/logger';
import { EventType } from '@prisma/client';
import { agentDebug } from '@utils/agentDebug';

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

function telegramOutboundAgent(proxyUrl: string) {
  const p = proxyUrl.trim();
  if (/^socks[45]:\/\//i.test(p)) {
    return new SocksProxyAgent(p);
  }
  return new HttpsProxyAgent(p);
}

export function initTelegramBot(useProxy = true): Telegraf | null {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not set — bot interface disabled');
    agentDebug({
      hypothesisId: 'TG-A',
      location: 'telegram.bot.ts:init',
      message: 'init_skipped_no_token',
      data: {},
    });
    return null;
  }

  agentDebug({
    hypothesisId: 'TG-A',
    location: 'telegram.bot.ts:init',
    message: 'init_start',
    data: {
      useProxy,
      hasChatId: Boolean(env.TELEGRAM_CHAT_ID),
      hasTelegramProxy: Boolean(env.TELEGRAM_PROXY),
    },
  });

  const agent =
    useProxy && env.TELEGRAM_PROXY ? telegramOutboundAgent(env.TELEGRAM_PROXY) : undefined;
  
  const newBot = new Telegraf(env.TELEGRAM_BOT_TOKEN, {
    telegram: { agent: agent as any }
  });

  // ── Authentication Middleware ──────────────────────────────────────────────
  newBot.use(async (ctx: Context, next: () => Promise<void>) => {
    const chatId = ctx.chat?.id.toString() ?? '';
    const expected = env.TELEGRAM_CHAT_ID ?? '';
    const authorized = Boolean(expected) && chatId === expected;
    
    agentDebug({
      hypothesisId: 'TG-B',
      location: 'telegram.bot.ts:middleware',
      message: 'update_received',
      data: { updateType: ctx.updateType, authorized, chatIdSuffix: chatId.slice(-4) },
    });

    if (!authorized) {
      console.warn(`🚨 Unauthorized bot access attempt from chat ID: ${chatId}`);
      try {
        await ctx.reply('⛔ Unauthorized. This bot is private.');
      } catch {}
      return;
    }
    return next();
  });

  // ── Commands ───────────────────────────────────────────────────────────────
  newBot.start((ctx: Context) => {
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

  newBot.help((ctx: Context) => {
    ctx.reply(
      '📖 <b>Help & Commands</b>\n\n' +
      '/status - Show real-time monitoring status\n' +
      '/profiles - List all active applicant profiles\n' +
      '/stop_all - Emergency stop for all monitors\n',
      { parse_mode: 'HTML' }
    );
  });

  newBot.command('status', async (ctx: Context) => {
    try {
      const { getMonitorStatus } = await import('@modules/monitor/monitor.service');
      const statuses = await getMonitorStatus();
      if (statuses.length === 0) {
        await ctx.reply('📭 No active monitors.');
        return;
      }

      const message = statuses
        .map((s: any) => {
          const statusEmoji = s.isCoolingDown ? '❄️ Cooling Down' : (s.isRunning ? '🟢 Running' : '🔴 Stopped');
          return `📍 <b>[${escapeHTML(s.sourceLabel)} → ${escapeHTML(s.destinationLabel)}]</b>\n` +
                 `   Centre: <code>${escapeHTML(s.centreLabel)}</code>\n` +
                 `   Visa: <code>${escapeHTML(s.visaType)}</code>\n` +
                 `   Applicants: <b>${escapeHTML(s.applicantNames)}</b>\n` +
                 `   Status: ${statusEmoji}\n` +
                 (s.isCoolingDown ? `   Cooldown Ends: <code>${new Date(s.cooldownUntil).toLocaleTimeString()}</code>\n` : '') +
                 `   Slots Found: ${s.slotDetectedCount}\n` +
                 `   Last Sync: ${s.lastCheckedAt ? new Date(s.lastCheckedAt).toLocaleTimeString() : 'Never'}`;
        })
        .join('\n\n');

      await ctx.reply(`📊 <b>Current Status</b>\n\n${message}`, { parse_mode: 'HTML' });
    } catch (err: any) {
      console.error('Status command failed:', err.message);
      try { await ctx.reply('❌ /status failed. Check backend logs.'); } catch {}
    }
  });

  newBot.command('profiles', async (ctx: Context) => {
    try {
      const { items } = await getProfiles({ limit: 10 });
      if (items.length === 0) return ctx.reply('👤 No profiles found.');
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

  newBot.command('stop_all', async (ctx: Context) => {
    try {
      const { getMonitorStatus, stopMonitor } = await import('@modules/monitor/monitor.service');
      const statuses = await getMonitorStatus();
      if (statuses.length === 0) return ctx.reply('No active monitors to stop.');
      for (const monitor of statuses) {
        try { stopMonitor(monitor.id); } catch (e) {}
      }
      ctx.reply('🔒 <b>All monitors stopped.</b>', { parse_mode: 'HTML' });
      logEvent('warn', EventType.MONITOR_STOPPED, 'All monitors stopped via Telegram command');
    } catch (err: any) {
       ctx.reply('❌ Error stopping monitors.');
    }
  });

  bot = newBot;
  return bot;
}

/**
 * Controlled launch loop that handles retries and stays persistent with proxy usage.
 */
export async function startTelegramBot() {
  // 🕒 Delay initial launch to ensure Express and DB are fully ready
  await new Promise(resolve => setTimeout(resolve, 10000));

  try {
    let attempts = 0;
    const HAS_LOCAL_PROXY = Boolean(env.TELEGRAM_PROXY);
    let useProxy = HAS_LOCAL_PROXY;

    agentDebug({
      hypothesisId: 'TG-A',
      location: 'telegram.bot.ts:startTelegramBot',
      message: 'launch_loop_start',
      data: { useProxy, botInitialized: Boolean(bot) },
    });

    while (attempts < 500) { 
      try {
        if (!bot) {
          bot = initTelegramBot(useProxy);
        }
        if (!bot) {
           console.error('❌ Bot initialization failed. Aborting loop.');
           break; 
        }

        // 🔗 Try to getMe() to verify connection before full launch
        await bot.telegram.getMe();
        
        await bot.launch();
        console.info(`✅ Telegram bot interface started (${useProxy ? 'Proxy' : 'Direct'})`);
        
        agentDebug({
          hypothesisId: 'TG-A',
          location: 'telegram.bot.ts:launch',
          message: 'launch_ok',
          data: { attempts, useProxy },
        });
        break; 

      } catch (err: any) {
        const isSocketError = err.message.includes('socket') || err.message.includes('ECONNRESET') || err.message.includes('timeout') || err.message.includes('disconnected');
        
        console.error(`❌ Telegram launch error (${useProxy ? 'Proxy' : 'Direct'}): ${err.message}`);

        // 💉 SMART FALLBACK: If proxy fails 10x, try Direct connection.
        // Some residential proxies block api.telegram.org by mistake.
        if (isSocketError && attempts > 10 && useProxy) {
          console.warn('⚠️ Proxy confirmed to be blocking Telegram. Falling back to Direct Connection...');
          try { await bot?.stop(); } catch {}
          bot = null;
          useProxy = false; 
        } else if (isSocketError && HAS_LOCAL_PROXY && useProxy) {
          console.warn(`🔄 Proxy networking issue. Retrying with Proxy (Attempt ${attempts}/10)...`);
          try { await bot?.stop(); } catch {}
          bot = null; 
        }

        attempts++;
        const delay = Math.max(30000, Math.min(10000 * attempts, 60000)); // 30s -> 60s
        console.info(`⏳ Retrying Telegram in ${Math.round(delay/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } catch (globalErr: any) {
    console.error('💣 Fatal Telegram bot loop crash (Isolated):', globalErr.message);
  }
}

export function getBotInstance(): Telegraf | null {
  return bot;
}

export async function sendTelegram(message: string): Promise<void> {
  if (!bot || !env.TELEGRAM_CHAT_ID) return;
  try {
    await bot.telegram.sendMessage(env.TELEGRAM_CHAT_ID, message, { parse_mode: 'HTML' });
  } catch (err: unknown) {
    console.error('Failed to send Telegram notification:', err);
  }
}

process.once('SIGINT', () => bot?.stop('SIGINT'));
process.once('SIGTERM', () => bot?.stop('SIGTERM'));
