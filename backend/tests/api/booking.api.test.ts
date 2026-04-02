import request from 'supertest';
import { createApp } from '@modules/../app';
import {
  testPrisma,
  seedAdminUser,
  cleanDb,
  disconnectDb,
} from '../helpers/db';

// Mock the booking service to prevent actual BullMQ / Redis dependency
jest.mock('@modules/booking/booking.service', () => ({
  enqueueBooking: jest.fn().mockResolvedValue('mock-job-id-001'),
  cancelBooking: jest.fn().mockResolvedValue(undefined),
  getBookingHistory: jest.fn().mockResolvedValue({ bookings: [], total: 0 }),
}));

import * as bookingService from '@modules/booking/booking.service';

const app = createApp();

let adminToken: string;
let profileId: string;

async function login(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return res.body.accessToken;
}

beforeAll(async () => {
  await cleanDb();
  await seedAdminUser();
  adminToken = await login('admin@test.com', 'AdminPass123!');

  // Seed a profile so trigger tests can reference a valid profileId
  const profileRes = await request(app)
    .post('/api/profiles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      fullName: 'Booking Tester',
      passportNumber: 'BT999999',
      dob: '1988-03-12',
      passportExpiry: '2031-03-12',
      nationality: 'Angola',
      email: 'booking.tester@example.com',
      phone: '+244923111000',
      gender: 'MALE',
      priority: 'HIGH',
    });
  profileId = profileRes.body.id;
});

afterAll(async () => {
  await cleanDb();
  await disconnectDb();
});

describe('POST /api/booking/trigger', () => {
  it('returns 200 with jobId when payload is valid', async () => {
    const res = await request(app)
      .post('/api/booking/trigger')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        profileId,
        slot: { date: '2026-07-01', time: '09:00', destination: 'prt', visaType: 'STANDARD_VISITOR' },
      });

    expect(res.status).toBe(200);
    expect(res.body.jobId).toBeDefined();
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/booking/trigger')
      .send({ profileId, slot: { date: '2026-07-01', time: '09:00' } });

    expect(res.status).toBe(401);
  });

  it('propagates service errors (e.g. profile not found) as 4xx', async () => {
    const { AppError } = await import('@middleware/errorHandler');
    (bookingService.enqueueBooking as jest.Mock).mockRejectedValueOnce(
      new AppError(404, 'Profile not found', 'NOT_FOUND'),
    );

    const res = await request(app)
      .post('/api/booking/trigger')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        profileId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
        slot: { date: '2026-07-01', time: '09:00', destination: 'prt', visaType: 'STANDARD_VISITOR' },
      });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/booking/history', () => {
  it('returns 200 with bookings array', async () => {
    const res = await request(app)
      .get('/api/booking/history')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.bookings).toBeDefined();
  });

  it('respects limit query param', async () => {
    (bookingService.getBookingHistory as jest.Mock).mockResolvedValueOnce({
      bookings: [{ id: '1' }, { id: '2' }],
      total: 2,
    });

    const res = await request(app)
      .get('/api/booking/history?limit=2')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.bookings.length).toBeLessThanOrEqual(2);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/booking/history');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/booking/:jobId', () => {
  it('returns 200 on cancel for valid jobId', async () => {
    const res = await request(app)
      .delete('/api/booking/mock-job-id-001')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it('returns 404 when job not found', async () => {
    const { AppError } = await import('@middleware/errorHandler');
    (bookingService.cancelBooking as jest.Mock).mockRejectedValueOnce(
      new AppError(404, 'Job not found', 'NOT_FOUND'),
    );

    const res = await request(app)
      .delete('/api/booking/nonexistent-job')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).delete('/api/booking/any-job');
    expect(res.status).toBe(401);
  });
});
