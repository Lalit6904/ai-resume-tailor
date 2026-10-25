import crypto from 'node:crypto';
import { ZodError } from 'zod';
import multer from 'multer';
import { AppError } from '../utils/errors.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Request IDs come from untrusted clients. Accept a conservative format and
// generate a fresh UUID for anything else, so logs cannot be forged or
// injected with control characters.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function requestContext(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();
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

function isBodyParserSyntaxError(error) {
  return (
    error?.type === 'entity.parse.failed' ||
    (error instanceof SyntaxError && error?.status === 400 && 'body' in error)
  );
}

function normalizeError(error) {
  if (error instanceof ZodError) {
    return new AppError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Some submitted fields are invalid.',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      })),
    });
  }

  if (error instanceof multer.MulterError) {
    return new AppError({
      status: error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
      code: error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR',
      message:
        error.code === 'LIMIT_FILE_SIZE'
          ? `The uploaded file exceeds the ${config.MAX_UPLOAD_MB} MB limit.`
          : 'The file upload could not be processed.',
    });
  }

  if (isBodyParserSyntaxError(error)) {
    return new AppError({
      status: 400,
      code: 'INVALID_JSON',
      message: 'The request body is not valid JSON.',
    });
  }

  if (error?.type === 'entity.too.large') {
    return new AppError({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'The request body is too large.',
    });
  }

  if (error?.name === 'CastError') {
    return new AppError({
      status: 400,
      code: 'INVALID_IDENTIFIER',
      message: 'The requested identifier is invalid.',
    });
  }

  if (error?.name === 'ValidationError' && error?.errors) {
    return new AppError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Some submitted fields are invalid.',
    });
  }

  if (error?.code === 11000) {
    return new AppError({
      status: 409,
      code: 'DUPLICATE_RESOURCE',
      message: 'That record already exists.',
    });
  }

  // Do not expose driver details, collection names, or connection strings.
  if (
    error?.name === 'MongooseError' ||
    error?.name === 'MongoServerError' ||
    error?.name === 'MongoNetworkError' ||
    error?.name === 'MongoTimeoutError'
  ) {
    return new AppError({
      status: 500,
      code: 'DATABASE_ERROR',
      message: 'An unexpected server error occurred. Please try again.',
      cause: error,
    });
  }

  return error;
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  // If a response already started, let Express close the connection instead of
  // trying to write a JSON body into a partially sent stream.
  if (res.headersSent) return next(error);

  const normalized = normalizeError(error);
  const isAppError = normalized instanceof AppError;
  const status = isAppError ? normalized.status : 500;
  const code = isAppError ? normalized.code : 'INTERNAL_ERROR';

  // 5xx details are never exposed, even when a controller constructed the
  // AppError. Only 4xx client errors may carry a safe message and details.
  const exposed = isAppError && normalized.expose !== false && status < 500;
  const message = exposed
    ? normalized.message
    : 'An unexpected server error occurred. Please try again.';
  const details = exposed && normalized.details ? normalized.details : undefined;

  const logMeta = {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl?.split('?')[0],
    status,
    code,
  };
  if (status >= 500) {
    // Always keep the stack server-side, including production. The response
    // below contains only a generic message and the request ID.
    logger.error('Request failed', {
      ...logMeta,
      error: normalized?.message,
      stack: normalized?.stack,
    });
  } else {
    logger.warn('Request rejected', logMeta);
  }

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      requestId: req.id,
    },
  });
}
