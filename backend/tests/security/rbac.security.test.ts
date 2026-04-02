/**
 * RBAC security tests — role enforcement across all sensitive endpoints.
 */
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

beforeAll(async () => {
  await cleanDb();
  await seedAdminUser();
  await seedOperatorUser();

  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@test.com', password: 'AdminPass123!' });
  adminToken = adminRes.body.accessToken;

  const opRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'operator@test.com', password: 'OperatorPass123!' });
  operatorToken = opRes.body.accessToken;
});

afterAll(async () => {
  await cleanDb();
  await disconnectDb();
});

describe('OPERATOR role restrictions', () => {
  it('cannot DELETE /api/logs — returns 403', async () => {
    const res = await request(app)
      .delete('/api/logs')
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(403);
  });

  it('cannot POST /api/settings/global — returns 403', async () => {
    const res = await request(app)
      .post('/api/settings/global')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ bookingConcurrency: 5 });

    expect(res.status).toBe(403);
  });

  it('cannot DELETE /api/profiles/:id — returns 403', async () => {
    // Create a profile as admin first
    const createRes = await request(app)
      .post('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'RBAC Test User',
        passportNumber: 'RBAC00001',
        dob: '1990-01-01',
        passportExpiry: '2030-01-01',
        nationality: 'Angola',
        email: 'rbac.test@example.com',
        phone: '+244900000001',
        gender: 'MALE',
        priority: 'NORMAL',
      });

    const profileId = createRes.body.id;

    const res = await request(app)
      .delete(`/api/profiles/${profileId}`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(403);
  });

  it('cannot GET /api/proxy — returns 403', async () => {
    const res = await request(app)
      .get('/api/proxy')
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(403);
  });

  it('cannot POST /api/proxy — returns 403', async () => {
    const res = await request(app)
      .post('/api/proxy')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ host: 'proxy.test.com', port: 8080, protocol: 'http' });

    expect(res.status).toBe(403);
  });

  it('CAN start a monitor — returns 200', async () => {
    const res = await request(app)
      .post('/api/monitor/start')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ destination: 'prt', visaType: 'STANDARD_VISITOR', intervalMs: 10000 });

    expect(res.status).toBe(200);

    // Clean up
    if (res.body.monitorId) {
      await request(app)
        .post(`/api/monitor/stop/${res.body.monitorId}`)
        .set('Authorization', `Bearer ${operatorToken}`);
    }
  });

  it('CAN trigger a booking — returns 200 or 404 (not 401/403)', async () => {
    // We don't mock the service here, so a 404 on unknown profileId is acceptable
    const res = await request(app)
      .post('/api/booking/trigger')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        profileId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
        slot: { date: '2026-07-01', time: '09:00', destination: 'prt', visaType: 'STANDARD_VISITOR' },
      });

    expect([200, 202, 404, 500]).toContain(res.status);
    expect([401, 403]).not.toContain(res.status);
  });
});

describe('No token — all protected routes return 401', () => {
  const protectedRoutes: Array<[string, string]> = [
    ['GET', '/api/auth/me'],
    ['GET', '/api/profiles'],
    ['POST', '/api/profiles'],
    ['GET', '/api/monitor/status'],
    ['POST', '/api/monitor/start'],
    ['GET', '/api/logs'],
    ['DELETE', '/api/logs'],
    ['GET', '/api/logs/export'],
    ['GET', '/api/proxy'],
    ['POST', '/api/proxy'],
    ['GET', '/api/settings'],
    ['POST', '/api/settings/global'],
  ];

  for (const [method, route] of protectedRoutes) {
    it(`${method} ${route} → 401 without token`, async () => {
      const res = await (request(app) as any)[method.toLowerCase()](route);
      expect(res.status).toBe(401);
    });
  }
});
