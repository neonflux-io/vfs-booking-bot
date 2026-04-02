import request from 'supertest';
import { createApp } from '@modules/../app';

const app = createApp();

describe('GET /api/health', () => {
  it('returns 200 with status ok — no auth required', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});
