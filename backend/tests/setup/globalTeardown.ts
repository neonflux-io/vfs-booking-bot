export default async function globalTeardown() {
  // Optionally stop test containers — commented out to allow re-use across runs
  // import { execSync } from 'child_process';
  // execSync('docker compose -f docker-compose.test.yml down', { stdio: 'inherit' });
}
