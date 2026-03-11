import axios from 'axios';
import { env } from '@config/env';

export async function sendTelegram(message: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;

  await axios.post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'Markdown',
  });
}
