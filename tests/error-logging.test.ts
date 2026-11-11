import { afterEach, describe, expect, test, vi } from 'vitest';
import { errorHandler } from '../src/middlewares/error.middleware';
import { logger } from '../src/utils/logger';

const fakeReq = { id: 'req-1', method: 'POST', path: '/api/v1/x' } as never;
const fakeRes = () => {
  const res = { headersSent: false, status: () => res, json: () => res };
  return res as never;
};

afterEach(() => vi.restoreAllMocks());

const logged = (err: unknown) => {
  const spy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
  errorHandler(err, fakeReq, fakeRes(), vi.fn());
  return String(spy.mock.calls[0][0]);
};

describe('what gets written to the logs', () => {
  test('a database error is logged by name and code only, never with its message', () => {
    const err = Object.assign(new Error('Unique constraint failed for ada@example.com / secret-value'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
    });
    const line = logged(err);
    expect(line).toContain('PrismaClientKnownRequestError P2002');
    expect(line).not.toContain('ada@example.com');
    expect(line).not.toContain('secret-value');
  });

  test('other messages are trimmed, and a stack never repeats the message', () => {
    const err = new Error('x'.repeat(1000) + ' end-marker');
    const line = logged(err);
    expect(line.split('\n')[0].length).toBeLessThan(400); // the message part is cut at 300 characters
    expect(line).not.toContain('end-marker');
    expect(line).toContain('-> 500:');
  });

  test('a stack trace repeating a secret in its first line is not logged', () => {
    const err = new Error('the password is hunter2');
    err.stack = 'Error: the password is hunter2\n    at someFunction (file.ts:1:1)\n    at other (file.ts:2:2)';
    const line = logged(err);
    expect(line.match(/hunter2/g)?.length ?? 0).toBe(1); // only the (trimmed) message, never the stack's first line
    expect(line).toContain('at someFunction');
  });

  test('expected client errors are logged briefly', () => {
    const err = Object.assign(new Error('Insufficient permissions'), { isAppError: true, status: 403, code: 'FORBIDDEN' });
    const line = logged(err);
    expect(line).toContain('-> 403: Insufficient permissions');
    expect(line).not.toContain('\n');
  });
});
