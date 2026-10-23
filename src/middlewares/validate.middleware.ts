import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { createError } from '../common/errors/app-error';

type Source = 'body' | 'params' | 'query';

// Validates input with a zod schema before the controller runs.
// Use .strict() on body schemas so extra fields like role / status / departmentId are rejected.
// Valid body/params replace req.body/req.params; valid query is placed in res.locals.query.
export const validate =
  (schema: ZodTypeAny, source: Source = 'body') =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(source === 'body' ? (req.body ?? {}) : req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(createError(400, 'Validation failed', 'VALIDATION_ERROR', details));
    }
    if (source === 'body') req.body = result.data;
    else if (source === 'params') req.params = result.data as Request['params'];
    else res.locals.query = result.data;
    next();
  };
