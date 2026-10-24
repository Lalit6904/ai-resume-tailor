import { ZodError } from 'zod';
import multer from 'multer';
import { AppError } from '../utils/errors.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function requestContext(req, res, next) {
  req.id = req.get('x-request-id') || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const started = Date.now();
  res.on('finish', () => {
    logger.info('HTTP request', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl?.split('?')[0],
      status: res.statusCode,
      durationMs: Date.now() - started,
      userId: req.user?._id?.toString(),
    });
  });
  next();
}

export function originCheck(req, res, next) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next(); // same-origin, curl, or mobile client without Origin
  if (config.clientOrigins.includes(origin)) return next();
  return next(
    new AppError({
      status: 403,
      code: 'ORIGIN_NOT_ALLOWED',
      message: 'This request origin is not allowed.',
    }),
  );
}

export function notFoundHandler(req, res, next) {
  next(new AppError({ status: 404, code: 'ROUTE_NOT_FOUND', message: 'API route not found.' }));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  let normalized = error;

  if (error instanceof ZodError) {
    normalized = new AppError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Some submitted fields are invalid.',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      })),
    });
  } else if (error instanceof multer.MulterError) {
    normalized = new AppError({
      status: error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
      code: error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR',
      message:
        error.code === 'LIMIT_FILE_SIZE'
          ? `The uploaded file exceeds the ${config.MAX_UPLOAD_MB} MB limit.`
          : 'The file upload could not be processed.',
    });
  } else if (error?.name === 'CastError') {
    normalized = new AppError({
      status: 400,
      code: 'INVALID_IDENTIFIER',
      message: 'The requested identifier is invalid.',
    });
  } else if (error?.code === 11000) {
    normalized = new AppError({
      status: 409,
      code: 'DUPLICATE_RESOURCE',
      message: 'That record already exists.',
    });
  } else if (error?.type === 'entity.too.large') {
    normalized = new AppError({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'The request body is too large.',
    });
  }

  const status = normalized instanceof AppError ? normalized.status : 500;
  const code = normalized instanceof AppError ? normalized.code : 'INTERNAL_ERROR';
  const message =
    normalized instanceof AppError && normalized.expose
      ? normalized.message
      : 'An unexpected server error occurred. Please try again.';

  const logMeta = {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl?.split('?')[0],
    status,
    code,
  };
  if (status >= 500) {
    logger.error('Request failed', {
      ...logMeta,
      error: normalized?.message,
      stack: config.NODE_ENV === 'development' ? normalized?.stack : undefined,
    });
  } else {
    logger.warn('Request rejected', logMeta);
  }

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(normalized instanceof AppError && normalized.details
        ? { details: normalized.details }
        : {}),
      requestId: req.id,
    },
  });
}
