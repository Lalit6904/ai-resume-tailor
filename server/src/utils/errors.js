export class AppError extends Error {
  constructor({ status = 500, code = 'INTERNAL_ERROR', message = 'Something went wrong.', details, cause, expose = true }) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = expose;
    if (cause) this.cause = cause;
  }
}

export const badRequest = (message, code = 'BAD_REQUEST', details) =>
  new AppError({ status: 400, code, message, details });
export const unauthorized = (message = 'Authentication required.', code = 'UNAUTHORIZED') =>
  new AppError({ status: 401, code, message });
export const forbidden = (message = 'You do not have access to this resource.', code = 'FORBIDDEN') =>
  new AppError({ status: 403, code, message });
export const notFound = (message = 'Resource not found.', code = 'NOT_FOUND') =>
  new AppError({ status: 404, code, message });
export const conflict = (message, code = 'CONFLICT', details) =>
  new AppError({ status: 409, code, message, details });
export const tooLarge = (message, code = 'PAYLOAD_TOO_LARGE') =>
  new AppError({ status: 413, code, message });
export const unprocessable = (message, code = 'UNPROCESSABLE', details) =>
  new AppError({ status: 422, code, message, details });
export const serviceUnavailable = (message, code = 'SERVICE_UNAVAILABLE') =>
  new AppError({ status: 503, code, message });

export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
