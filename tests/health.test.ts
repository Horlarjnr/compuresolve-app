import request from 'supertest';
import { describe, expect, test } from 'vitest';
import app from '../src/app';

describe('GET /api/v1/health', () => {
  test('returns a safe success envelope', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(Object.keys(res.body.data).sort()).toEqual(['status', 'timestamp']);
  });

  test('sets security headers, request id, and hides x-powered-by', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});

describe('CORS', () => {
  test('allows the configured origin with credentials', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('answers preflight for the configured origin', async () => {
    const res = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  test('gives no CORS headers to other origins', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
