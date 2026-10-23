// Errors we throw on purpose. Their message is safe to show to the client.
export type AppError = Error & {
  status: number;
  code: string;
  details?: unknown;
  isAppError: true;
};

const defaultCodes: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
};

export const createError = (status: number, message: string, code?: string, details?: unknown): AppError => {
  const error = new Error(message) as AppError;
  error.status = status;
  error.code = code ?? defaultCodes[status] ?? 'ERROR';
  error.details = details;
  error.isAppError = true;
  return error;
};
