/**
 * Proxy integration test — 3-strike blocking and round-robin cycling.
 */
import request from 'supertest';
import { createApp } from '@modules/../app';
import {
  testPrisma,
  seedAdminUser,
  cleanDb,
  disconnectDb,
} from '../helpers/db';
import * as proxyService from '@modules/proxy/proxy.service';

const app = createApp();

let adminToken: string;
const proxies: string[] = [];

beforeAll(async () => {
  await cleanDb();
  await seedAdminUser();

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@test.com', password: 'AdminPass123!' });
  adminToken = res.body.accessToken;

  // Seed 3 proxies via the API
  for (let i = 1; i <= 3; i++) {
    const r = await request(app)
      .post('/api/proxy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        host: `proxy${i}.test.example.com`,
        port: 8080 + i,
        username: `user${i}`,
        password: `pass${i}`,
        protocol: 'http',
        provider: 'brightdata',
        country: 'AO',
      });
    proxies.push(r.body.id);
  }
});

afterAll(async () => {
  await cleanDb();
  await disconnectDb();
});

describe('Proxy round-robin cycling', () => {
  it('getProxy() cycles through all three proxies', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const p = await proxyService.getProxy();
      if (p) seen.add(p.server);
    }
    // All 3 proxies should have been used
    expect(seen.size).toBe(3);
  });
});

describe('Proxy 3-strike blocking', () => {
  let targetProxyId: string;

  beforeAll(async () => {
    targetProxyId = proxies[0];
  });

  it('proxy status is ACTIVE before any blocks', async () => {
    const p = await testPrisma.proxy.findUnique({ where: { id: targetProxyId } });
    expect(p?.status).toBe('ACTIVE');
    expect(p?.blockCount).toBe(0);
  });

  it('after 1 block, status remains ACTIVE', async () => {
    await proxyService.reportBlock(targetProxyId);
    const p = await testPrisma.proxy.findUnique({ where: { id: targetProxyId } });
    expect(p?.status).toBe('ACTIVE');
    expect(p?.blockCount).toBe(1);
  });

  it('after 2 blocks, status remains ACTIVE', async () => {
    await proxyService.reportBlock(targetProxyId);
    const p = await testPrisma.proxy.findUnique({ where: { id: targetProxyId } });
    expect(p?.status).toBe('ACTIVE');
    expect(p?.blockCount).toBe(2);
  });

  it('after 3rd block, status becomes BLOCKED', async () => {
    await proxyService.reportBlock(targetProxyId);
    const p = await testPrisma.proxy.findUnique({ where: { id: targetProxyId } });
    expect(p?.status).toBe('BLOCKED');
    expect(p?.blockCount).toBe(3);
  });

  it('getProxy() skips the BLOCKED proxy', async () => {
    // Call getProxy() many times — should never return the blocked one
    const usedServers = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const p = await proxyService.getProxy();
      if (p) usedServers.add(p.server);
    }
    const blocked = await testPrisma.proxy.findUnique({ where: { id: targetProxyId } });
    const blockedServer = `${blocked!.host}:${blocked!.port}`;
    expect(usedServers.has(blockedServer)).toBe(false);
  });

  it('reset proxy — status returns to ACTIVE, blockCount reset to 0', async () => {
    await proxyService.resetProxy(targetProxyId);
    const p = await testPrisma.proxy.findUnique({ where: { id: targetProxyId } });
    expect(p?.status).toBe('ACTIVE');
    expect(p?.blockCount).toBe(0);
  });

  it('getProxy() includes the reset proxy again', async () => {
    const usedServers = new Set<string>();
    for (let i = 0; i < 9; i++) {
      const p = await proxyService.getProxy();
      if (p) usedServers.add(p.server);
    }
    const reset = await testPrisma.proxy.findUnique({ where: { id: targetProxyId } });
    const resetServer = `${reset!.host}:${reset!.port}`;
    expect(usedServers.has(resetServer)).toBe(true);
  });
});
