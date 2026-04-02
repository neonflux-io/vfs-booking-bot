/**
 * Stress test — 50 booking jobs at concurrency=3
 *
 * Pass criteria:
 * - All 50 jobs complete in < 60 seconds
 * - Zero queue errors
 * - DB has 50 QUEUED records (we test enqueueing; worker execution is mocked)
 */
import path from 'path';
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

import { enqueueBooking } from '@modules/booking/booking.service';
import { testPrisma, cleanDb, disconnectDb } from '../helpers/db';

// Mock the engine so jobs don't attempt real Playwright
jest.mock('@modules/engine/engine.service', () => ({
  runBooking: jest.fn().mockResolvedValue({ confirmationNo: 'STRESS-OK' }),
}));

const JOB_COUNT = 50;

describe('Booking queue stress — 50 simultaneous enqueues', () => {
  jest.setTimeout(90_000);

  let testProfileId: string;

  beforeAll(async () => {
    await cleanDb();

    // Create one real profile to enqueue against
    testProfileId = (
      await testPrisma.profile.create({
        data: {
          fullName: 'Stress Test User',
          passportNumberEnc: 'enc_test',
          dobEnc: 'enc_dob',
          passportExpiry: new Date('2030-01-01'),
          nationality: 'Angola',
          email: 'stress@example.com',
          phone: '+244900000000',
          gender: 'MALE',
          priority: 'NORMAL',
          isActive: true,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanDb();
    await disconnectDb();
  });

  it('enqueues 50 jobs simultaneously without throwing', async () => {
    const bookingPayload = {
      profileId: testProfileId,
      sourceCountry: 'gbr',
      destination: 'prt',
      centre: 'lisbon',
      visaType: 'STANDARD_VISITOR',
      slot: { date: '2026-08-01', time: '10:00', destination: 'prt', visaType: 'STANDARD_VISITOR' },
    };

    const start = Date.now();

    // Fire all 50 enqueues concurrently
    const results = await Promise.allSettled(
      Array.from({ length: JOB_COUNT }, () => enqueueBooking(bookingPayload))
    );

    const elapsed = Date.now() - start;
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    // All 50 should succeed (enqueue, not execute)
    expect(succeeded).toBe(JOB_COUNT);
    expect(failed).toBe(0);

    // Must complete in under 60s
    expect(elapsed).toBeLessThan(60_000);
  });

  it('DB has 50 QUEUED booking records', async () => {
    const count = await testPrisma.booking.count({
      where: { profileId: testProfileId, status: 'QUEUED' },
    });

    expect(count).toBe(JOB_COUNT);
  });
});
