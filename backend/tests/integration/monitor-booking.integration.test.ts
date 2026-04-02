/**
 * Monitor → Booking integration test.
 *
 * Tests that:
 * 1. startMonitor() returns a UUID and registers the monitor state
 * 2. getMonitorStatus() reflects the running monitor
 * 3. stopMonitor() halts the monitor and marks it stopped
 * 4. enqueueBooking() creates a DB Booking record (QUEUED status)
 *
 * Note: Full slot-detection → auto-booking flow requires live VFS API access and is
 * tested via E2E tests. This integration test validates the observable state transitions
 * against a real DB + Redis.
 */
import request from 'supertest';
import { createApp } from '@modules/../app';
import {
  testPrisma,
  seedAdminUser,
  cleanDb,
  disconnectDb,
} from '../helpers/db';
import { startMonitor, stopMonitor, getMonitorStatus } from '@modules/monitor/monitor.service';
import { enqueueBooking } from '@modules/booking/booking.service';

const app = createApp();

let adminToken: string;
let profileId: string;

beforeAll(async () => {
  await cleanDb();
  await seedAdminUser();

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@test.com', password: 'AdminPass123!' });
  adminToken = loginRes.body.accessToken;

  // Create a real profile for booking tests
  const profileRes = await request(app)
    .post('/api/profiles')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      fullName: 'Monitor Booking Tester',
      passportNumber: 'MB999001',
      dob: '1988-07-10',
      passportExpiry: '2030-07-10',
      nationality: 'Angola',
      email: 'monitor.booking@example.com',
      phone: '+244923888001',
      gender: 'MALE',
      priority: 'HIGH',
    });
  profileId = profileRes.body.id;
});

afterAll(async () => {
  await cleanDb();
  await disconnectDb();
});

describe('Monitor state machine', () => {
  let monitorId: string;

  it('startMonitor() returns a UUID', () => {
    monitorId = startMonitor({
      sourceCountry: 'gbr',
      destination: 'prt',
      centre: '',
      visaType: 'STANDARD_VISITOR',
      intervalMs: 60_000,
      profileIds: [profileId],
      mode: 'manual',
    });

    expect(typeof monitorId).toBe('string');
    expect(monitorId.length).toBeGreaterThan(0);
  });

  it('getMonitorStatus() reflects the running monitor', async () => {
    const statuses = await getMonitorStatus();
    const found = statuses.find((s) => s.id === monitorId);

    expect(found).toBeDefined();
    expect(found!.isRunning).toBe(true);
    // getMonitorStatus() returns destination directly (not nested under config)
    expect(found!.destination ?? found!.config?.destination).toBe('prt');
  });

  it('stopMonitor() marks the monitor as stopped', async () => {
    stopMonitor(monitorId);

    const statuses = await getMonitorStatus();
    const found = statuses.find((s) => s.id === monitorId);

    if (found) {
      expect(found.isRunning).toBe(false);
    }
    // It's also valid for stopped monitors to be removed from the list
  });

  it('stopMonitor() with unknown id throws AppError 404', () => {
    const { AppError } = require('@middleware/errorHandler');
    expect(() => stopMonitor('nonexistent-monitor-id')).toThrow(AppError);
  });
});

describe('Booking enqueue creates DB record', () => {
  it('enqueueBooking() inserts a QUEUED Booking row in the DB', async () => {
    const beforeCount = await testPrisma.booking.count();

    const jobId = await enqueueBooking({
      profileId,
      sourceCountry: 'gbr',
      destination: 'prt',
      centre: 'lisbon',
      visaType: 'STANDARD_VISITOR',
      slot: { date: '2026-08-01', time: '10:00', destination: 'prt', visaType: 'STANDARD_VISITOR' },
    });

    expect(typeof jobId).toBe('string');
    expect(jobId.length).toBeGreaterThan(0);

    const afterCount = await testPrisma.booking.count();
    expect(afterCount).toBe(beforeCount + 1);

    const booking = await testPrisma.booking.findFirst({
      where: { jobId },
    });
    expect(booking).not.toBeNull();
    expect(booking!.status).toBe('QUEUED');
    expect(booking!.destination).toBe('prt');
  });
});
