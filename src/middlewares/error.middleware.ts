import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

// What is safe to write to a log: never a database error's message (it can quote data), never an untrimmed message.
const safeLogMessage = (err: any) => {
  if (typeof err?.name === 'string' && err.name.startsWith('PrismaClient')) {
    return `${err.name}${err.code ? ` ${err.code}` : ''}`;
  }
  return String(err?.message ?? '').slice(0, 300);
};

// Stack frames only (the first stack line repeats the message, so it is left out).
const stackFrames = (err: any) =>
  String(err?.stack ?? '')
    .split('\n')
    .filter((line) => line.trim().startsWith('at '))
    .slice(0, 6)
    .join('\n');

export const notFound = (_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' });
};

// Every error leaves through here as: { success:false, message, code, details?, requestId }
// Unexpected errors always become a generic 500: no stack, no internal message.
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details: unknown;

  if (err?.isAppError === true) {
    // thrown on purpose with createError(...)
    status = err.status;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body is not valid JSON';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  } else if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 && !/^P\d{4}$/.test(String(err?.code))) {
    // other 4xx raised by Express/body-parser (e.g. unsupported charset): keep status, hide details
    status = err.status;
    code = 'BAD_REQUEST';
    message = 'Bad request';
  } else if (typeof err?.code === 'string' && /^P\d{4}$/.test(err.code)) {
    // Prisma errors (used from Phase 2) -> friendly responses
    if (err.code === 'P2002') {
      status = 409;
      code = 'CONFLICT';
      message = 'A record with this value already exists';
    } else if (err.code === 'P2003') {
      status = 400;
      code = 'BAD_REQUEST';
      message = 'Related record not found';
    } else if (err.code === 'P2025') {
      status = 404;
      code = 'NOT_FOUND';
      message = 'Record not found';
    }
  }

  // Detail goes to the server logs only, and only the safe parts of it.
  logger.error(
    `${req.id} ${req.method} ${req.path} -> ${status}: ${safeLogMessage(err)}` + (status >= 500 ? `\n${stackFrames(err)}` : ''),
  );

  if (res.headersSent) return next(err);

  res.status(status).json({
    success: false,
    message,
    code,
    ...(details !== undefined && { details }),
    requestId: req.id,
  });
}
