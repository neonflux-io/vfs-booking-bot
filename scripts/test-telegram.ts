import axios from 'axios';
import 'dotenv/config';
import { HttpsProxyAgent } from 'https-proxy-agent';

async function testTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const proxyUrl = `http://${process.env.PROXY_USERNAME}:${process.env.PROXY_PASSWORD}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
  
  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN not found in .env');
    return;
  }

  console.log(`🔍 Testing Telegram API connection WITH PROXY...`);
  console.log(`📡 URL: https://api.telegram.org/bot${token.split(':')[0]}:[REDACTED]/getMe`);
  console.log(`🌐 Proxy: ${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`);

  try {
    const agent = new HttpsProxyAgent(proxyUrl);
    const res = await axios.get(`https://api.telegram.org/bot${token}/getMe`, { 
      httpsAgent: agent,
      proxy: false, 
      timeout: 15000 
    });
    console.log('✅ Success! Bot Data:', res.data);
  } catch (err: any) {
    console.error('❌ Proxy Connection Failed:');
    if (err.response) {
      console.error(`   Status: ${err.response.status}`);
      console.error(`   Data: ${JSON.stringify(err.response.data)}`);
    } else {
      console.error(`   Error: ${err.message}`);
      if (err.code) console.error(`   Code: ${err.code}`);
    }
  }
}

testTelegram();
