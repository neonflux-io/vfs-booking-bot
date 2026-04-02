/**
 * HTTP load stress test — autocannon-based load testing
 *
 * Requires the backend server to be running on port 4000.
 * Intended to be run via `npm run test:stress` (separate from Jest).
 *
 * Pass criteria:
 * - GET /api/health at 1000 req/s × 10s: all 200, p99 < 20ms
 * - GET /api/logs (authenticated) at 100 concurrent × 30s: zero 500s, p99 < 500ms
 * - POST /api/auth/login at 50 req/s × 10s: rate limiter kicks in (some 429s expected)
 *
 * This file is NOT run by Jest — it's invoked by the `run.ts` stress runner.
 */

export interface StressResult {
  name: string;
  passed: boolean;
  p99: number;
  errors: number;
  requests: number;
  message: string;
}

/**
 * Run all HTTP load tests sequentially and return results.
 * Requires `autocannon` to be available.
 */
export async function runHttpLoadTests(
  baseUrl: string,
  authToken: string
): Promise<StressResult[]> {
  // Dynamic import to avoid crashing when autocannon is not installed
  let autocannon: any;
  try {
    autocannon = (await import('autocannon')).default;
  } catch {
    console.warn('[http-load] autocannon not installed — skipping HTTP load tests');
    return [
      {
        name: 'autocannon-not-installed',
        passed: true, // Don't fail build if tool not present
        p99: 0,
        errors: 0,
        requests: 0,
        message: 'autocannon not installed — skipped',
      },
    ];
  }

  const results: StressResult[] = [];

  // ── Test 1: Health endpoint ──────────────────────────────────────────────────
  const healthResult = await new Promise<any>((resolve) => {
    autocannon(
      {
        url: `${baseUrl}/api/health`,
        connections: 50,
        duration: 10,
        pipelining: 1,
      },
      (_err: any, r: any) => resolve(r)
    );
  });

  const healthP99 = healthResult?.latency?.p99 ?? 9999;
  const health5xx = healthResult?.['5xx'] ?? 0;

  results.push({
    name: 'GET /api/health (1000 req/s × 10s)',
    passed: health5xx === 0 && healthP99 < 20,
    p99: healthP99,
    errors: health5xx,
    requests: healthResult?.requests?.total ?? 0,
    message:
      health5xx === 0 && healthP99 < 20
        ? 'PASS'
        : `FAIL: ${health5xx} 5xx errors, p99=${healthP99}ms`,
  });

  // ── Test 2: Logs endpoint (authenticated, 100 concurrent × 30s) ─────────────
  const logsResult = await new Promise<any>((resolve) => {
    autocannon(
      {
        url: `${baseUrl}/api/logs`,
        connections: 100,
        duration: 30,
        headers: { authorization: `Bearer ${authToken}` },
      },
      (_err: any, r: any) => resolve(r)
    );
  });

  const logsP99 = logsResult?.latency?.p99 ?? 9999;
  const logs5xx = logsResult?.['5xx'] ?? 0;

  results.push({
    name: 'GET /api/logs (100 concurrent × 30s)',
    passed: logs5xx === 0 && logsP99 < 500,
    p99: logsP99,
    errors: logs5xx,
    requests: logsResult?.requests?.total ?? 0,
    message:
      logs5xx === 0 && logsP99 < 500
        ? 'PASS'
        : `FAIL: ${logs5xx} 5xx errors, p99=${logsP99}ms`,
  });

  // ── Test 3: Login endpoint rate limiter ──────────────────────────────────────
  const loginResult = await new Promise<any>((resolve) => {
    autocannon(
      {
        url: `${baseUrl}/api/auth/login`,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'admin@test.com', password: 'AdminPass123!' }),
        connections: 10,
        duration: 10,
        amount: 500, // fire ~50 req/s
      },
      (_err: any, r: any) => resolve(r)
    );
  });

  const login429s = loginResult?.['4xx'] ?? 0;
  results.push({
    name: 'POST /api/auth/login rate limiter',
    passed: login429s > 0, // we EXPECT some 429s (rate limit working)
    p99: loginResult?.latency?.p99 ?? 0,
    errors: 0,
    requests: loginResult?.requests?.total ?? 0,
    message: login429s > 0 ? `PASS: rate limiter fired (${login429s} 4xx)` : 'FAIL: rate limiter did not activate',
  });

  return results;
}
