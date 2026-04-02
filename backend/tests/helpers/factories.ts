/** Typed factory functions for test data */

export function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    email: `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'TestPass123!',
    role: 'OPERATOR',
    ...overrides,
  };
}

export function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    fullName: 'Test Applicant',
    passportNumber: 'AB123456',
    dob: '1990-01-15',
    passportExpiry: '2030-12-31',
    nationality: 'AGO',
    email: 'applicant@example.com',
    phone: '+244912345678',
    gender: 'MALE',
    priority: 'NORMAL',
    vfsPassword: 'VfsPass123!',
    ...overrides,
  };
}

export function makeProxy(overrides: Record<string, unknown> = {}) {
  return {
    host: '192.168.1.1',
    port: 8080,
    username: 'proxyuser',
    password: 'proxypass',
    provider: 'brightdata',
    country: 'AO',
    ...overrides,
  };
}

export function makeSlot(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-06-01',
    time: '09:00',
    destination: 'portugal',
    visaType: 'SCH',
    ...overrides,
  };
}

export function makeBookingPayload(profileId: string, overrides: Record<string, unknown> = {}) {
  return {
    profileId,
    destination: 'portugal',
    visaType: 'SCH',
    slot: makeSlot(),
    attempt: 3,
    ...overrides,
  };
}

export function makeLogEntry(overrides: Record<string, unknown> = {}) {
  return {
    level: 'INFO',
    eventType: 'MONITOR_STARTED',
    message: 'Test log entry',
    destination: 'portugal',
    ...overrides,
  };
}
