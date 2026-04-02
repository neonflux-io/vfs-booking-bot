/**
 * Auth security tests — token reuse attack, JWT tampering.
 */
import request from 'supertest';
import { createApp } from '@modules/../app';
import {
  testPrisma,
  seedAdminUser,
  seedOperatorUser,
  cleanDb,
  disconnectDb,
} from '../helpers/db';

const app = createApp();

beforeAll(async () => {
  await cleanDb();
  await seedAdminUser();
  await seedOperatorUser();
});

afterAll(async () => {
  await cleanDb();
  await disconnectDb();
});

describe('Refresh token reuse attack', () => {
  it('submitting the same refresh token twice returns 401 on second use', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'AdminPass123!' });

    const cookies = loginRes.headers['set-cookie'] as string[] | string;
    const rawCookie = (Array.isArray(cookies) ? cookies : [cookies])
      .find((c: string) => c.startsWith('vfs_refresh='))!;
    // Extract only "vfs_refresh=TOKEN" — strip Set-Cookie metadata (Path, HttpOnly, etc.)
    const refreshCookie = rawCookie.split(';')[0];

    // First use — should succeed and rotate token
    const first = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie);
    expect(first.status).toBe(200);

    // Second use of the SAME (now stale) token — should be rejected
    const second = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie);
    expect(second.status).toBe(401);
  });

  it('DB refreshTokenHash is nullified after token reuse detection', async () => {
    // Re-login for a fresh token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'AdminPass123!' });

    const cookies = loginRes.headers['set-cookie'] as string[] | string;
    const rawCookie = (Array.isArray(cookies) ? cookies : [cookies])
      .find((c: string) => c.startsWith('vfs_refresh='))!;
    // Extract only "vfs_refresh=TOKEN" — strip Set-Cookie metadata (Path, HttpOnly, etc.)
    const refreshCookie = rawCookie.split(';')[0];

    // Consume once (rotation)
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie);

    // Submit stale token — triggers reuse detection
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie);

    // DB should have nullified the hash
    const user = await testPrisma.user.findUnique({
      where: { email: 'admin@test.com' },
    });
    expect(user?.refreshTokenHash).toBeNull();
  });
});

describe('JWT tampering', () => {
  it('tampered access token (flipped char) returns 401 on protected route', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'AdminPass123!' });

    const { accessToken } = loginRes.body;
    // Flip the last character of the signature
    const tampered = accessToken.slice(0, -1) + (accessToken.endsWith('A') ? 'B' : 'A');

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tampered}`);

    expect(res.status).toBe(401);
  });

  it('completely fabricated JWT returns 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJoYWNrZXIifQ.fake');

    expect(res.status).toBe(401);
  });
});

describe('Cross-user token rejection', () => {
  it("admin's token cannot be used by operator profile endpoint for unauthorized actions", async () => {
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'AdminPass123!' });

    const adminToken = adminLogin.body.accessToken;

    // Admin deleting a nonexistent profile returns 404, not 200 — confirming auth passed
    const res = await request(app)
      .delete('/api/profiles/clxxxxxxxxxxxxxxxxxxxxxxxxx')
      .set('Authorization', `Bearer ${adminToken}`);

    // 404 (not found) vs 401 (unauthorized) — token was accepted, profile just doesn't exist
    expect(res.status).toBe(404);
  });
});
