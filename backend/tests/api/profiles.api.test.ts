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

const validProfile = {
  fullName: 'John Doe',
  passportNumber: 'AB123456',
  dob: '1990-01-15',
  passportExpiry: '2030-01-15',
  nationality: 'Angola',
  email: 'john.doe@example.com',
  phone: '+244923000000',
  gender: 'MALE',
  priority: 'NORMAL',
};

beforeAll(async () => {
  await cleanDb();
  await seedAdminUser();
  await seedOperatorUser();
  adminToken = await login('admin@test.com', 'AdminPass123!');
  operatorToken = await login('operator@test.com', 'OperatorPass123!');
});

afterAll(async () => {
  await cleanDb();
  await disconnectDb();
});

describe('POST /api/profiles', () => {
  it('creates a profile and returns 201', async () => {
    const res = await request(app)
      .post('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validProfile);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.fullName).toBe('John Doe');
    expect(res.body.passportNumber).toBeUndefined(); // raw not returned
  });

  it('returns 400 on missing required fields', async () => {
    const res = await request(app)
      .post('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fullName: 'Only Name' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/profiles')
      .send(validProfile);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/profiles', () => {
  it('returns 200 with profiles array', async () => {
    const res = await request(app)
      .get('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items ?? res.body)).toBe(true);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/profiles');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/profiles/:id', () => {
  let profileId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validProfile, email: 'get.test@example.com' });
    profileId = res.body.id;
  });

  it('returns 200 with profile for valid id', async () => {
    const res = await request(app)
      .get(`/api/profiles/${profileId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(profileId);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .get('/api/profiles/clxxxxxxxxxxxxxxxxxxxxxxxxx')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/profiles/:id', () => {
  let profileId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validProfile, email: 'update.test@example.com' });
    profileId = res.body.id;
  });

  it('returns 200 and updates the profile', async () => {
    const res = await request(app)
      .put(`/api/profiles/${profileId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fullName: 'John Updated' });

    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe('John Updated');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .put('/api/profiles/clxxxxxxxxxxxxxxxxxxxxxxxxx')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fullName: 'Ghost' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/profiles/:id', () => {
  let adminProfileId: string;
  let operatorProfileId: string;

  beforeAll(async () => {
    const r1 = await request(app)
      .post('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validProfile, email: 'delete.admin@example.com' });
    adminProfileId = r1.body.id;

    const r2 = await request(app)
      .post('/api/profiles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validProfile, email: 'delete.operator@example.com' });
    operatorProfileId = r2.body.id;
  });

  it('returns 403 when operator tries to delete', async () => {
    const res = await request(app)
      .delete(`/api/profiles/${operatorProfileId}`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 204 when admin deletes a profile', async () => {
    const res = await request(app)
      .delete(`/api/profiles/${adminProfileId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .delete('/api/profiles/clxxxxxxxxxxxxxxxxxxxxxxxxx')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/profiles/bulk-upload', () => {
  it('returns 200 with succeeded count for valid CSV', async () => {
    // Headers must match the bulkImport.ts EXPECTED_COLUMNS mapping exactly
    const csv = `Full Name,Passport Number,Date of Birth,Passport Expiry,Nationality,Email,Phone,Priority
Bulk User One,BK100001,1985-05-10,2029-05-10,Angola,bulk1@example.com,+244911000001,NORMAL
Bulk User Two,BK100002,1990-07-20,2028-07-20,Angola,bulk2@example.com,+244911000002,HIGH`;

    const res = await request(app)
      .post('/api/profiles/bulk-upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from(csv), { filename: 'profiles.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.succeeded).toBeGreaterThanOrEqual(1);
  });

  it('returns 400 when no file is attached', async () => {
    const res = await request(app)
      .post('/api/profiles/bulk-upload')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});
