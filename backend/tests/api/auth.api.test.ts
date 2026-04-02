import request from 'supertest';
import { createApp } from '@modules/../app';
import { testPrisma, seedAdminUser, seedOperatorUser, cleanDb, disconnectDb } from '../helpers/db';
import { signAccessToken } from '@utils/jwt';

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

describe('POST /api/auth/login', () => {
  it('returns 200 with accessToken on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'AdminPass123!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe('admin@test.com');
    expect(res.body.user.role).toBe('ADMIN');
  });

  it('sets httpOnly refresh token cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'AdminPass123!' });

    const cookies = res.headers['set-cookie'] as string[];
    expect(cookies).toBeDefined();
    const refreshCookie = (Array.isArray(cookies) ? cookies : [cookies])
      .find(c => c.startsWith('vfs_refresh='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'WrongPass!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('returns 401 on unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@nowhere.com', password: 'AnyPass123!' });

    expect(res.status).toBe(401);
  });

  it('returns 400 on missing email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'SomePass123!' });

    expect(res.status).toBe(400);
  });

  it('returns 400 on missing password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns 401 when no cookie present', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('returns new accessToken on valid refresh cookie', async () => {
    // Login to get the cookie
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'AdminPass123!' });

    const cookies = loginRes.headers['set-cookie'];

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', Array.isArray(cookies) ? cookies : [cookies]);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();
  });

  it('returns 401 on tampered refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', ['vfs_refresh=tampered.token.value; Path=/api/auth; HttpOnly']);

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('returns 200 and clears cookie', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'AdminPass123!' });

    const { accessToken } = loginRes.body;
    const cookies = loginRes.headers['set-cookie'];

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', Array.isArray(cookies) ? cookies : [cookies]);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out');
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns user info for authenticated request', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'AdminPass123!' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('admin@test.com');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with expired/invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
  });
});
