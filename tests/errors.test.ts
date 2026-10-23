import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import app from '../src/app';
import { createError } from '../src/common/errors/app-error';
import { errorHandler, notFound } from '../src/middlewares/error.middleware';
import { validate } from '../src/middlewares/validate.middleware';

describe('error handling (real app)', () => {
  test('unknown route -> 404 envelope', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Route not found', code: 'NOT_FOUND' });
  });

  test('malformed JSON -> 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"bad":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_JSON');
  });

  test('oversized body -> 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ x: 'a'.repeat(200 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('error handler (test app)', () => {
  const t = express();
  t.use(express.json());
  t.get('/boom', () => {
    throw new Error('db password is hunter2');
  });
  t.get('/forbidden', () => {
    throw createError(403, 'Insufficient permissions');
  });
  t.post('/items', validate(z.object({ title: z.string().min(1) }).strict()), (req, res) => {
    res.json({ success: true, data: req.body });
  });
  t.use(notFound);
  t.use(errorHandler);

  test('unexpected error -> generic 500, no stack or message leak', async () => {
    const res = await request(t).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('stack');
    expect(text).not.toMatch(/\bat \w/);
  });

  test('createError -> its own status, message and code', async () => {
    const res = await request(t).get('/forbidden');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, message: 'Insufficient permissions', code: 'FORBIDDEN' });
  });

  test('validate rejects bad input and unknown fields', async () => {
    const bad = await request(t).post('/items').send({ title: '' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
    expect(bad.body.details[0].field).toBe('title');

    const extra = await request(t).post('/items').send({ title: 'ok', role: 'HOD' });
    expect(extra.status).toBe(400);
  });

  test('validate passes good input through', async () => {
    const ok = await request(t).post('/items').send({ title: 'ok' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({ title: 'ok' });
  });
});
