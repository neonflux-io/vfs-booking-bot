/**
 * Input security tests — SQL injection, XSS, oversized payloads, invalid JSON.
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
});

afterAll(async () => {
  await cleanDb();
  await disconnectDb();
});

describe('SQL injection via profile fields', () => {
  it('SQL injection in fullName is stored as literal string (Prisma parameterizes)', async () => {
    const malicious = "Robert'); DROP TABLE profiles; --";

    const res = await request(app)
      .post('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: malicious,
        passportNumber: 'SQL00001',
        dob: '1990-01-01',
        passportExpiry: '2030-01-01',
        nationality: 'Angola',
        email: 'sqli.test@example.com',
        phone: '+244900000010',
        gender: 'MALE',
        priority: 'NORMAL',
      });

    // Must not crash; server stays alive
    expect([201, 400]).toContain(res.status);

    if (res.status === 201) {
      const profile = await testPrisma.profile.findUnique({ where: { id: res.body.id } });
      // Literal string stored, table not dropped
      expect(profile?.fullName).toBe(malicious);
    }
  });

  it('SQL injection in search query param — no crash', async () => {
    const res = await request(app)
      .get("/api/profiles?search=' OR '1'='1")
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });
});

describe('XSS via profile fields', () => {
  it('XSS payload in fullName stored as literal, not executed', async () => {
    const xss = '<script>alert("xss")</script>';

    const res = await request(app)
      .post('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: xss,
        passportNumber: 'XSS00001',
        dob: '1990-02-01',
        passportExpiry: '2030-02-01',
        nationality: 'Angola',
        email: 'xss.test@example.com',
        phone: '+244900000020',
        gender: 'MALE',
        priority: 'NORMAL',
      });

    expect([201, 400]).toContain(res.status);

    if (res.status === 201) {
      const profile = await testPrisma.profile.findUnique({ where: { id: res.body.id } });
      // Stored as-is (not sanitized but not executed either — rendering is frontend's job)
      expect(profile?.fullName).toBe(xss);
    }
  });
});

describe('Oversized payloads', () => {
  it('1MB+ JSON body returns 413 or 400', async () => {
    const oversized = { fullName: 'A'.repeat(1_100_000) };

    const res = await request(app)
      .post('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(oversized));

    // Express body-parser limit (10mb in app.ts) — 1MB passes through but schema rejects;
    // if limit were lower it would be 413. Either 400 (validation) or 413 is acceptable.
    expect([400, 413]).toContain(res.status);
  });
});

describe('Invalid JSON body', () => {
  it('malformed JSON returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ "email": "admin@test.com", "password": }'); // invalid JSON

    expect(res.status).toBe(400);
  });

  it('empty body on login returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('');

    expect(res.status).toBe(400);
  });
});
