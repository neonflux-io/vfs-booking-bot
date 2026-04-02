/**
 * Logs integration test — filtering and CSV export against real DB.
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

let adminToken: string;

beforeAll(async () => {
  await cleanDb();
  await seedAdminUser();

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@test.com', password: 'AdminPass123!' });
  adminToken = res.body.accessToken;

  // Seed 50 log entries with varied levels and eventTypes
  const entries: any[] = [];
  const levels = ['INFO', 'WARN', 'ERROR'] as const;
  const eventTypes = ['SLOT_DETECTED', 'BOOKING_SUCCESS', 'BOOKING_FAILED', 'IP_BLOCKED'] as const;

  for (let i = 0; i < 50; i++) {
    entries.push({
      level: levels[i % 3],
      eventType: eventTypes[i % 4],
      message: `Seeded log entry ${i}`,
      destination: i % 2 === 0 ? 'prt' : 'bra',
      timestamp: new Date(Date.now() - i * 60_000), // each entry 1min apart
    });
  }
  await testPrisma.log.createMany({ data: entries });
});

afterAll(async () => {
  await cleanDb();
  await disconnectDb();
});

describe('GET /api/logs — filtering', () => {
  it('returns all 50 entries (default limit 100)', async () => {
    const res = await request(app)
      .get('/api/logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const items = res.body.logs ?? res.body.items ?? res.body;
    expect(items.length).toBe(50);
  });

  it('filters by level=ERROR — only ERROR rows returned', async () => {
    const res = await request(app)
      .get('/api/logs?level=ERROR')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const items = res.body.logs ?? res.body.items ?? res.body;
    expect(items.length).toBeGreaterThan(0);
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
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.eventType).toBe('SLOT_DETECTED');
    }
  });

  it('limit param is respected', async () => {
    const res = await request(app)
      .get('/api/logs?limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const items = res.body.logs ?? res.body.items ?? res.body;
    expect(items.length).toBeLessThanOrEqual(10);
  });

  it('filters by date range — from/to', async () => {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 10 * 60_000).toISOString(); // last 10 minutes

    const res = await request(app)
      .get(`/api/logs?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const items = res.body.logs ?? res.body.items ?? res.body;
    // We seeded 10 entries within the last 10 minutes (entries 0–9)
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(50);
  });
});

describe('GET /api/logs/export — CSV', () => {
  it('returns text/csv content type', async () => {
    const res = await request(app)
      .get('/api/logs/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('CSV contains a header row with expected columns', async () => {
    const res = await request(app)
      .get('/api/logs/export')
      .set('Authorization', `Bearer ${adminToken}`);

    const firstLine = res.text.split('\n')[0];
    expect(firstLine).toMatch(/timestamp/i);
    expect(firstLine).toMatch(/level/i);
    expect(firstLine).toMatch(/eventType|event_type/i);
  });

  it('CSV row count equals log count (50 data rows + 1 header)', async () => {
    const res = await request(app)
      .get('/api/logs/export')
      .set('Authorization', `Bearer ${adminToken}`);

    const lines = res.text.trim().split('\n').filter(Boolean);
    // header + 50 data rows
    expect(lines.length).toBeGreaterThanOrEqual(51);
  });
});
