import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { errorHandler } from '../src/middlewares/error.middleware';
import { createRateLimiter } from '../src/middlewares/rate-limit.middleware';

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
