/**
 * Stress test — Proxy round-robin distribution
 *
 * Seeds 5 proxies, calls getProxy() 200 times, verifies uniform distribution.
 *
 * Pass criteria:
 * - Each of the 5 proxies is returned ~40 times (±10 to account for skipped BLOCKED)
 * - No proxy is returned fewer than 30 or more than 50 times
 */
import path from 'path';
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

import { getProxy, addProxy } from '@modules/proxy/proxy.service';
import { testPrisma, cleanDb, disconnectDb } from '../helpers/db';

const PROXY_COUNT = 5;
const CALL_COUNT = 200;
const EXPECTED_PER_PROXY = CALL_COUNT / PROXY_COUNT; // 40
const TOLERANCE = 10; // ±10

describe('Proxy round-robin stress — 200 calls across 5 proxies', () => {
  jest.setTimeout(60_000);

  const proxyHosts: string[] = [];

  beforeAll(async () => {
    await cleanDb();

    for (let i = 0; i < PROXY_COUNT; i++) {
      const host = `stress-proxy-${i + 1}.example.com`;
      proxyHosts.push(host);
      await addProxy({
        host,
        port: 8080 + i,
        protocol: 'http',
        username: `user${i}`,
        password: `pass${i}`,
        provider: 'brightdata',
        country: 'AO',
      });
    }
  });

  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  it('distributes 200 calls uniformly across 5 proxies (±10)', async () => {
    const tally: Record<string, number> = {};

    for (let call = 0; call < CALL_COUNT; call++) {
      const proxy = await getProxy();
      if (proxy) {
        // proxy.server = "host:port" — extract host
        const host = proxy.server.split(':')[0];
        tally[host] = (tally[host] ?? 0) + 1;
      }
    }

    // All 5 proxies should appear in the tally
    expect(Object.keys(tally).length).toBe(PROXY_COUNT);

    for (const host of proxyHosts) {
      const count = tally[host] ?? 0;
      expect(count).toBeGreaterThanOrEqual(EXPECTED_PER_PROXY - TOLERANCE);
      expect(count).toBeLessThanOrEqual(EXPECTED_PER_PROXY + TOLERANCE);
    }
  });
});
