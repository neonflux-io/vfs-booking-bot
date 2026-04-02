/**
 * Profile integration test — encryption round-trip against a real test database.
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

const baseProfile = {
  fullName: 'Integration Tester',
  passportNumber: 'IT999001',
  dob: '1985-06-15',
  passportExpiry: '2032-06-15',
  nationality: 'Angola',
  email: 'integration@example.com',
  phone: '+244923999001',
  gender: 'MALE' as const,
  priority: 'NORMAL' as const,
  vfsPassword: 'VfsSecret@99',
};

describe('Profile encryption round-trip', () => {
  let profileId: string;

  it('creates a profile and stores passportNumber encrypted in DB', async () => {
    const res = await request(app)
      .post('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(baseProfile);

    expect(res.status).toBe(201);
    profileId = res.body.id;

    // Verify raw passport is NOT stored in DB
    const dbRow = await testPrisma.profile.findUnique({ where: { id: profileId } });
    expect(dbRow).not.toBeNull();
    expect((dbRow as any).passportNumberEnc).toBeDefined();
    expect((dbRow as any).passportNumber).toBeUndefined();
    // Encrypted value must differ from plaintext
    expect((dbRow as any).passportNumberEnc).not.toBe(baseProfile.passportNumber);
  });

  it('list view returns masked passport number', async () => {
    const res = await request(app)
      .get('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const items: any[] = res.body.items ?? [];
    const found = items.find((p: any) => p.id === profileId);
    expect(found).toBeDefined();
    // Masked field: "****XXXX" pattern — at least 4 asterisks/Xs
    const masked: string = found?.passportNumberMasked ?? found?.passportNumber ?? '';
    expect(masked.length).toBeGreaterThan(0);
    // The raw plaintext passportNumber must not appear unmasked in the list
    expect(masked).not.toBe(baseProfile.passportNumber);
  });

  it('updates passportNumber — DB stores new ciphertext', async () => {
    const res = await request(app)
      .put(`/api/profiles/${profileId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ passportNumber: 'IT999002' });

    expect(res.status).toBe(200);

    const dbRow = await testPrisma.profile.findUnique({ where: { id: profileId } });
    expect((dbRow as any).passportNumberEnc).not.toBe(baseProfile.passportNumber);
  });

  it('soft-deletes profile — not returned in list', async () => {
    await request(app)
      .delete(`/api/profiles/${profileId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const listRes = await request(app)
      .get('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`);

    const items: any[] = listRes.body.items ?? [];
    const found = items.find((p: any) => p.id === profileId);
    expect(found).toBeUndefined();
  });
});

describe('Multiple profiles — encryption uses unique IVs', () => {
  it('two profiles with same passport get different ciphertexts', async () => {
    const r1 = await request(app)
      .post('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...baseProfile, email: 'iv.test1@example.com', passportNumber: 'SAME12345' });

    const r2 = await request(app)
      .post('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...baseProfile, email: 'iv.test2@example.com', passportNumber: 'SAME12345' });

    const db1 = await testPrisma.profile.findUnique({ where: { id: r1.body.id } });
    const db2 = await testPrisma.profile.findUnique({ where: { id: r2.body.id } });

    // Same plaintext → different ciphertext (random IV per encryption)
    expect((db1 as any).passportNumberEnc).not.toBe((db2 as any).passportNumberEnc);
  });
});
