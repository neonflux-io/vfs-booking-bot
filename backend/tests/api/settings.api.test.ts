import request from 'supertest';
import { createApp } from '@modules/../app';
import {
  seedAdminUser,
  seedOperatorUser,
  cleanDb,
  disconnectDb,
} from '../helpers/db';

const app = createApp();

let adminToken: string;
let operatorToken: string;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return res.body.accessToken;
}

beforeAll(async () => {
  await cleanDb();
  await seedAdminUser();
  await seedOperatorUser();
  adminToken = await login('admin@test.com', 'AdminPass123!');
  operatorToken = await login('operator@test.com', 'OperatorPass123!');
});

afterAll(async () => {
  await cleanDb();
  await disconnectDb();
});

describe('GET /api/settings', () => {
  it('returns 200 with settings object', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('is accessible to operator role (read-only)', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(200);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/settings/global', () => {
  it('returns 200 when admin updates global settings', async () => {
    const res = await request(app)
      .post('/api/settings/global')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bookingConcurrency: 3,
        retryCount: 3,
        manualOverrideSeconds: 5,
        refreshIntervalMs: 10000,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 when operator tries to update global settings', async () => {
    const res = await request(app)
      .post('/api/settings/global')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ bookingConcurrency: 5 });

    expect(res.status).toBe(403);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/settings/global')
      .send({ bookingConcurrency: 5 });

    expect(res.status).toBe(401);
  });
});
