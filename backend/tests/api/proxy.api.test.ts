import request from 'supertest';
import { createApp } from '@modules/../app';
import {
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

const validProxy = {
  host: 'proxy.test.example.com',
  port: 8080,
  username: 'proxyuser',
  password: 'proxypass',
  protocol: 'http',
  provider: 'brightdata',
  country: 'AO',
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

describe('POST /api/proxy', () => {
  it('returns 201 when admin adds a proxy', async () => {
    const res = await request(app)
      .post('/api/proxy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validProxy);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.host).toBe(validProxy.host);
    expect(res.body.password).toBeUndefined(); // raw password not returned
  });

  it('returns 403 when operator tries to add a proxy', async () => {
    const res = await request(app)
      .post('/api/proxy')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(validProxy);

    expect(res.status).toBe(403);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/proxy').send(validProxy);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/proxy', () => {
  it('returns 200 with proxy list for admin', async () => {
    const res = await request(app)
      .get('/api/proxy')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 403 for operator', async () => {
    const res = await request(app)
      .get('/api/proxy')
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/proxy');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/proxy/:id/reset', () => {
  let proxyId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/proxy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validProxy, host: 'reset.test.example.com' });
    proxyId = res.body.id;
  });

  it('returns 200 on reset for valid proxy id', async () => {
    const res = await request(app)
      .post(`/api/proxy/${proxyId}/reset`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
  });

  it('returns 404 for unknown proxy id', async () => {
    const res = await request(app)
      .post('/api/proxy/clxxxxxxxxxxxxxxxxxxxxxxxxx/reset')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/proxy/:id', () => {
  let proxyId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/proxy')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validProxy, host: 'delete.test.example.com' });
    proxyId = res.body.id;
  });

  it('returns 204 on successful delete', async () => {
    const res = await request(app)
      .delete(`/api/proxy/${proxyId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it('returns 404 for unknown proxy id', async () => {
    const res = await request(app)
      .delete('/api/proxy/clxxxxxxxxxxxxxxxxxxxxxxxxx')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});
