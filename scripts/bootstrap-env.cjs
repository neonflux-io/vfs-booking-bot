/**
 * Ensures root .env exists and has valid dev secrets so Docker backend can start.
 * Run: node scripts/bootstrap-env.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');
const debugLogPath = path.join(root, 'debug-98adce.log');

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

if (!fs.existsSync(examplePath)) {
  console.error('Missing .env.example');
  process.exit(1);
}

if (!fs.existsSync(envPath)) {
  fs.copyFileSync(examplePath, envPath);
  console.log('[bootstrap-env] Created .env from .env.example');
}

let text = fs.readFileSync(envPath, 'utf8');
const lines = text.split(/\r?\n/);
const out = [];
let changed = false;

for (const line of lines) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (!m) {
    out.push(line);
    continue;
  }
  const key = m[1];
  let val = m[2] ?? '';
  const trimmed = val.trim();
  const isEmpty = trimmed === '' || trimmed === '""' || trimmed === "''";

  if (key === 'JWT_ACCESS_SECRET' && isEmpty) {
    val = randomHex(32);
    changed = true;
  } else if (key === 'JWT_REFRESH_SECRET' && isEmpty) {
    val = randomHex(32);
    changed = true;
  } else if (key === 'PROFILE_ENCRYPTION_KEY' && isEmpty) {
    val = randomHex(32);
    changed = true;
  } else if (key === 'PROFILE_ENCRYPTION_KEY' && trimmed.length !== 64) {
    val = randomHex(32);
    changed = true;
  } else if (key === 'JWT_ACCESS_SECRET' && trimmed.length < 32) {
    val = randomHex(32);
    changed = true;
  } else if (key === 'JWT_REFRESH_SECRET' && trimmed.length < 32) {
    val = randomHex(32);
    changed = true;
  } else if (key === 'CAPTCHA_SOLVER' && trimmed === 'twocaptcha') {
    const hasKey = lines.some((l) => {
      const x = l.match(/^TWOCAPTCHA_API_KEY=(.*)$/);
      return x && x[1].trim().length > 0;
    });
    if (!hasKey) {
      val = 'manual';
      changed = true;
    }
  }
  out.push(`${key}=${val}`);
}

if (changed) {
  fs.writeFileSync(envPath, out.join('\n'), 'utf8');
  console.log('[bootstrap-env] Filled JWT + PROFILE_ENCRYPTION_KEY (and captcha mode if needed).');
} else {
  console.log('[bootstrap-env] .env already has secrets.');
}

if (!fs.existsSync(debugLogPath)) {
  fs.writeFileSync(debugLogPath, '', 'utf8');
  console.log('[bootstrap-env] Created empty debug-98adce.log for Docker bind-mount.');
}

console.log('[bootstrap-env] Add TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in .env for Telegram.');
console.log('[bootstrap-env] Add proxy credentials for VFS if you get 403.');
