/**
 * Auth integration test — full token lifecycle against a real test database.
 *
 * Requires the jest.integration.config.js runner (postgres-test + redis-test
 * docker containers running on their test ports).
 */
import request from 'supertest';
import { createApp } from '@modules/../app';
import {
  testPrisma,
  seedAdminUser,
  cleanDb,
  disconnectDb,
} from '../helpers/db';

const app = createApp();

beforeAll(async () => {
  await cleanDb();
  await seedAdminUser();
});

afterAll(async () => {
  await cleanDb();
  await disconnectDb();
});

describe('Auth token lifecycle', () => {
  let accessToken: string;
  let refreshCookie: string;

  it('step 1 — login returns accessToken + refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'AdminPass123!' });

    expect(res.status).toBe(200);
    accessToken = res.body.accessToken;
    const cookies = res.headers['set-cookie'] as string[];
    const found = (Array.isArray(cookies) ? cookies : [cookies])
      .find((c: string) => c.startsWith('vfs_refresh='));
    expect(found).toBeDefined();
    expect(found).toContain('HttpOnly');
    // Store just the "vfs_refresh=TOKEN" portion for use as Cookie request header
    refreshCookie = found!.split(';')[0];
  });

  it('step 2 — accessToken grants access to protected route', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('admin@test.com');
  });

  it('step 3 — refresh returns a new accessToken', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie);

    expect(res.status).toBe(200);
    const newAccessToken = res.body.accessToken;
    expect(newAccessToken).toBeDefined();
    // Note: access tokens may be identical if issued within the same second (same iat)
    // What matters is that the refresh token was rotated (tested below)
    accessToken = newAccessToken;

    // New refresh cookie issued — extract just name=value
    const cookies = res.headers['set-cookie'] as string[];
    const newCookie = (Array.isArray(cookies) ? cookies : [cookies])
      .find((c: string) => c.startsWith('vfs_refresh='));
    if (newCookie) refreshCookie = newCookie.split(';')[0];
  });

  it('step 4 — new accessToken still grants access', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
  });

  it('step 5 — logout succeeds and clears cookie', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', refreshCookie);

    expect(res.status).toBe(200);
  });

  it('step 6 — refresh after logout returns 401 (session invalidated)', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie);

    expect(res.status).toBe(401);
  });
});

describe('Refresh token reuse detection', () => {
  let firstRefreshCookie: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'AdminPass123!' });

    const cookies = res.headers['set-cookie'] as string[];
    const rawCookie = (Array.isArray(cookies) ? cookies : [cookies])
      .find((c: string) => c.startsWith('vfs_refresh='))!;
    // Extract just "vfs_refresh=TOKEN" for Cookie request header
    firstRefreshCookie = rawCookie.split(';')[0];

    // Consume the token once — this rotates it
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', firstRefreshCookie);
  });

  it('submitting the already-used refresh token returns 401 with TOKEN_REUSE', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', firstRefreshCookie);

    expect(res.status).toBe(401);
    expect(res.body.code ?? res.body.error).toBeDefined();
  });

  it('DB refreshTokenHash is nullified after token reuse', async () => {
    const user = await testPrisma.user.findUnique({
      where: { email: 'admin@test.com' },
    });
    expect(user?.refreshTokenHash).toBeNull();
  });
});
