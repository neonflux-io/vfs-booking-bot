import { execSync } from 'child_process';
import path from 'path';

export default async function globalSetup() {
  // Load test env
  const envFile = path.resolve(__dirname, '../../.env.test');
  require('dotenv').config({ path: envFile });

  // Start test containers (idempotent if already running)
  const composeFile = path.resolve(__dirname, '../../../docker-compose.test.yml');
  try {
    execSync(`docker compose -f "${composeFile}" up -d --wait`, {
      stdio: 'inherit',
      timeout: 60_000,
    });
  } catch {
    // Container may already be running
  }

  // Wait a moment for DB to be truly ready
  await new Promise((r) => setTimeout(r, 2000));

  // Run migrations against test DB
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL,
    },
  });
}
