import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

// Gives every request an id (also sent back as X-Request-Id) and logs one line when it finishes.
// Logs the path only: never the query string, body, headers, or cookies.
export const requestId = (req: Request, res: Response, next: NextFunction) => {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    logger.info(`${req.id} ${req.method} ${req.path} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
};
