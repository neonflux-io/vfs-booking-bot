/**
 * Stress test runner — entry point for `npm run test:stress`
 *
 * Runs the HTTP load stress tests against a live backend.
 * The Jest-based stress tests (monitor, booking, websocket, proxy, cache)
 * are run via `npm run test:integration` with the *.stress.ts pattern.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register tests/stress/run.ts
 *   BACKEND_URL=http://localhost:4000 AUTH_TOKEN=<jwt> npm run test:stress
 */

import { runHttpLoadTests } from './http-load.stress';

const BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? '';

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  VFS Bot — HTTP Load Stress Tests');
  console.log(`  Target: ${BASE_URL}`);
  console.log('═══════════════════════════════════════════════════\n');

  if (!AUTH_TOKEN) {
    console.warn(
      '⚠  AUTH_TOKEN not set — authenticated endpoints will return 401.\n' +
      '   Export AUTH_TOKEN=<valid-jwt> before running for accurate results.\n'
    );
  }

  const results = await runHttpLoadTests(BASE_URL, AUTH_TOKEN);

  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    const status = r.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`${icon}  [${status}]  ${r.name}`);
    console.log(`     requests=${r.requests}  p99=${r.p99}ms  errors=${r.errors}`);
    console.log(`     ${r.message}\n`);
    if (!r.passed) allPassed = false;
  }

  console.log('═══════════════════════════════════════════════════');
  if (allPassed) {
    console.log('  \x1b[32mAll stress tests PASSED\x1b[0m');
  } else {
    console.log('  \x1b[31mSome stress tests FAILED — see output above\x1b[0m');
  }
  console.log('═══════════════════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Stress runner crashed:', err);
  process.exit(1);
});
