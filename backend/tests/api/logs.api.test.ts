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

let adminToken: string;
let operatorToken: string;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return res.body.accessToken;
}

async function seedLogs(count = 5) {
  const entries = Array.from({ length: count }, (_, i) => ({
    level: i % 2 === 0 ? ('INFO' as const) : ('ERROR' as const),
    eventType: i % 3 === 0 ? ('SLOT_DETECTED' as const) : ('BOOKING_FAILED' as const),
    message: `Test log entry ${i}`,
    destination: 'prt',
    timestamp: new Date(),
  }));
  await testPrisma.log.createMany({ data: entries });
}

beforeAll(async () => {
  await cleanDb();
  await seedAdminUser();
  await seedOperatorUser();
  adminToken = await login('admin@test.com', 'AdminPass123!');
  operatorToken = await login('operator@test.com', 'OperatorPass123!');
  await seedLogs(10);
});

afterAll(async () => {
  await cleanDb();
  await disconnectDb();
});

describe('GET /api/logs', () => {
  it('returns 200 with log items', async () => {
    const res = await request(app)
      .get('/api/logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const items = res.body.logs ?? res.body.items ?? res.body;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  it('filters by level=ERROR', async () => {
    const res = await request(app)
      .get('/api/logs?level=ERROR')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const items = res.body.logs ?? res.body.items ?? res.body;
    for (const item of items) {
      expect(item.level).toBe('ERROR');
    }
  });

  it('filters by eventType=SLOT_DETECTED', async () => {
    const res = await request(app)
      .get('/api/logs?eventType=SLOT_DETECTED')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const items = res.body.logs ?? res.body.items ?? res.body;
    for (const item of items) {
      expect(item.eventType).toBe('SLOT_DETECTED');
    }
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/logs');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/logs', () => {
  it('returns 200 and clears logs when called by admin', async () => {
    await seedLogs(3); // ensure there are logs to clear

    const res = await request(app)
      .delete('/api/logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();

    // Verify logs are gone
    const count = await testPrisma.log.count();
    expect(count).toBe(0);
  });

  it('returns 403 when operator tries to clear logs', async () => {
    const res = await request(app)
      .delete('/api/logs')
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).delete('/api/logs');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/logs/export', () => {
  beforeAll(async () => {
    await seedLogs(5); // ensure there is data to export
  });

  it('returns 200 with Content-Type text/csv', async () => {
    const res = await request(app)
      .get('/api/logs/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('returns CSV with a header row', async () => {
    const res = await request(app)
      .get('/api/logs/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.text).toContain('timestamp');
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/logs/export');
    expect(res.status).toBe(401);
  });
});
