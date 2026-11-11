import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { errorHandler } from '../src/middlewares/error.middleware';
import { createRateLimiter, emailKey } from '../src/middlewares/rate-limit.middleware';

describe('rate limiter', () => {
  test('blocks after the limit with a 429 RATE_LIMITED envelope', async () => {
    const app = express();
    app.get('/x', createRateLimiter({ windowMs: 60_000, limit: 2 }), (_req, res) => {
      res.json({ success: true });
    });
    app.use(errorHandler);

    expect((await request(app).get('/x')).status).toBe(200);
    expect((await request(app).get('/x')).status).toBe(200);
    const blocked = await request(app).get('/x');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
  });
});

describe('per-account limiter (campus networks share one IP)', () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.post('/login', createRateLimiter({ windowMs: 60_000, limit: 2, keyGenerator: emailKey }), (_req, res) => {
      res.json({ success: true });
    });
    app.use(errorHandler);
    return app;
  };

  test('blocks one account after the limit but not other accounts from the same IP', async () => {
    const app = buildApp();
    const login = (email: string) => request(app).post('/login').send({ email });

    expect((await login('ada@example.com')).status).toBe(200);
    expect((await login('ada@example.com')).status).toBe(200);
    expect((await login('ada@example.com')).status).toBe(429); // Ada is limited...
    expect((await login('grace@example.com')).status).toBe(200); // ...Grace, on the same IP, is not
    expect((await login('linus@example.com')).status).toBe(200);
  });

  test('the key ignores letter case and spaces, so changing them does not reset the count', async () => {
    const app = buildApp();
    const login = (email: string) => request(app).post('/login').send({ email });
    await login('ada@example.com');
    await login('  ADA@Example.com ');
    expect((await login('Ada@example.com')).status).toBe(429);
  });

  test('a request without an email still gets a key (no crash)', async () => {
    const app = buildApp();
    expect((await request(app).post('/login').send({})).status).toBe(200);
    expect((await request(app).post('/login')).status).toBe(200);
  });
});
