import request from 'supertest';
import { describe, expect, test } from 'vitest';
import app from '../src/app';

// Origins allowed in the test setup: only http://localhost:3000
const EVIL = 'https://evil.example';
const GOOD = 'http://localhost:3000';

const login = (headers: Record<string, string> = {}) => {
  const r = request(app).post('/api/v1/auth/login');
  for (const [k, v] of Object.entries(headers)) r.set(k, v);
  return r.send({}); // an empty body is rejected by validation (400): so reaching 400 means the CSRF check let it through
};

describe('CSRF origin check', () => {
  test('a state-changing request from another site is refused', async () => {
    const res = await login({ Origin: EVIL });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_ORIGIN');
  });

  test('the frontend origin, and requests with no Origin at all, get through to validation', async () => {
    expect((await login({ Origin: GOOD })).status).toBe(400);
    expect((await login()).status).toBe(400);
  });

  test('the null origin (sandboxed pages) is refused', async () => {
    expect((await login({ Origin: 'null' })).status).toBe(403);
  });

  test('with no Origin, the Referer decides', async () => {
    expect((await login({ Referer: `${EVIL}/login` })).status).toBe(403);
    expect((await login({ Referer: `${GOOD}/login` })).status).toBe(400);
    expect((await login({ Referer: 'not a url' })).status).toBe(403);
  });

  test('every state-changing method is covered', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await request(app).delete(`/api/v1/complaints/${id}/assignments/current`).set('Origin', EVIL)).status).toBe(403);
    expect((await request(app).patch(`/api/v1/notifications/${id}/read`).set('Origin', EVIL)).status).toBe(403);
    expect((await request(app).post(`/api/v1/complaints/${id}/messages`).set('Origin', EVIL).send({ body: 'x' })).status).toBe(403);
  });

  test('reading is not blocked by the check (the browser\'s CORS rules protect reads)', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', EVIL);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined(); // the other site cannot read the answer
  });
});

describe('response headers', () => {
  test('API responses are never cacheable, and the standard security headers are present', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeTruthy();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('error responses are not cacheable either', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
