process.env.PROFILE_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32ch';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32ch';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

import { getCachedSlots, setCachedSlots } from './slot.cache';
import { SlotInfo } from '@t/index';

const TEST_KEY = 'gbr:prt:SCH';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  // Clear any cached entries by advancing past TTL
  jest.advanceTimersByTime(10_000);
});

describe('slot.cache', () => {
  it('returns undefined when cache is empty', () => {
    const result = getCachedSlots('non-existent-key');
    expect(result).toBeUndefined();
  });

  it('stores a promise and getCachedSlots returns same promise', () => {
    const slots: SlotInfo[] = [{ date: '2026-01-01', time: '09:00', destination: 'portugal', visaType: 'SCH' }];
    const promise = Promise.resolve(slots);

    setCachedSlots(TEST_KEY, promise);
    const retrieved = getCachedSlots(TEST_KEY);

    expect(retrieved).toBe(promise);
  });

  it('returns the same promise object on second call within TTL', () => {
    const promise = Promise.resolve([]);
    setCachedSlots(TEST_KEY, promise);

    const first = getCachedSlots(TEST_KEY);
    const second = getCachedSlots(TEST_KEY);

    expect(first).toBe(second);
    expect(first).toBe(promise);
  });

  it('returns undefined after COALESCE_TTL_MS (8s) expires', () => {
    const promise = Promise.resolve([]);
    setCachedSlots(TEST_KEY, promise);

    jest.advanceTimersByTime(8001);

    const result = getCachedSlots(TEST_KEY);
    expect(result).toBeUndefined();
  });

  it('returns valid entry just before TTL expires', () => {
    const promise = Promise.resolve([]);
    setCachedSlots(TEST_KEY, promise);

    jest.advanceTimersByTime(7999);

    const result = getCachedSlots(TEST_KEY);
    expect(result).toBe(promise);
  });

  it('expired entries are deleted from cache on access', () => {
    const promise = Promise.resolve([]);
    setCachedSlots(TEST_KEY, promise);

    jest.advanceTimersByTime(8001);
    getCachedSlots(TEST_KEY); // triggers deletion

    // Subsequent call should also be undefined
    const result = getCachedSlots(TEST_KEY);
    expect(result).toBeUndefined();
  });

  it('different keys are cached independently', () => {
    const p1 = Promise.resolve([]);
    const p2 = Promise.resolve([{ date: 'x', time: 'y', destination: 'prt', visaType: 'SCH' }]);

    setCachedSlots('key-1', p1);
    setCachedSlots('key-2', p2);

    expect(getCachedSlots('key-1')).toBe(p1);
    expect(getCachedSlots('key-2')).toBe(p2);
  });
});
