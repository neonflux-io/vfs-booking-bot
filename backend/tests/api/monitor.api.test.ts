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

async function login(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return res.body.accessToken;
}

const validMonitorPayload = {
  destination: 'prt',
  visaType: 'STANDARD_VISITOR',
  intervalMs: 10000,
};

beforeAll(async () => {
  await cleanDb();
  await seedAdminUser();
  await seedOperatorUser();
  adminToken = await login('admin@test.com', 'AdminPass123!');
});

afterAll(async () => {
  await cleanDb();
  await disconnectDb();
});

describe('POST /api/monitor/start', () => {
  it('returns 200 with monitorId', async () => {
    const res = await request(app)
      .post('/api/monitor/start')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validMonitorPayload);

    expect(res.status).toBe(200);
    expect(res.body.monitorId).toBeDefined();
    expect(typeof res.body.monitorId).toBe('string');
  });

  it('creates distinct monitors for same route on duplicate start', async () => {
    const r1 = await request(app)
      .post('/api/monitor/start')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validMonitorPayload);

    const r2 = await request(app)
      .post('/api/monitor/start')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validMonitorPayload);

    expect(r1.body.monitorId).not.toBe(r2.body.monitorId);

    // Clean up — stop both
    await request(app)
      .post(`/api/monitor/stop/${r1.body.monitorId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    await request(app)
      .post(`/api/monitor/stop/${r2.body.monitorId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/monitor/start')
      .send(validMonitorPayload);

    expect(res.status).toBe(401);
  });
});

describe('POST /api/monitor/stop/:id', () => {
  let monitorId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/monitor/start')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validMonitorPayload, destination: 'bra' });
    monitorId = res.body.monitorId;
  });

  it('returns 200 on valid monitor id', async () => {
    const res = await request(app)
      .post(`/api/monitor/stop/${monitorId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
  });

  it('returns 404 on unknown monitor id', async () => {
    const res = await request(app)
      .post('/api/monitor/stop/nonexistent-id-xyz')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/monitor/status', () => {
  it('returns 200 with an array', async () => {
    const res = await request(app)
      .get('/api/monitor/status')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/monitor/status');
    expect(res.status).toBe(401);
  });

  it('reflects a started monitor in the status list', async () => {
    const startRes = await request(app)
      .post('/api/monitor/start')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validMonitorPayload, destination: 'usa' });
    const newId = startRes.body.monitorId;

    const statusRes = await request(app)
      .get('/api/monitor/status')
      .set('Authorization', `Bearer ${adminToken}`);

    const found = statusRes.body.find((m: any) => m.id === newId);
    expect(found).toBeDefined();
    expect(found.isRunning).toBe(true);

    // Cleanup
    await request(app)
      .post(`/api/monitor/stop/${newId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  });
});
