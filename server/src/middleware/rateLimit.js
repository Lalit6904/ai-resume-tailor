import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

const WINDOW_MS = 15 * 60 * 1000;

/**
 * Build a limiter with a consistent JSON error body.
 *
 * The default store is in-memory: it is correct for a single process. If the
 * app is ever scaled to multiple replicas, replace `store` with a shared
 * Redis/Upstash store so limits are enforced across instances.
 */
export function createRateLimiter({
  limit,
  code,
  message,
  windowMs = WINDOW_MS,
  skip,
} = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS' || (typeof skip === 'function' && skip(req)),
    handler: (req, res) => {
      const resetTime = req.rateLimit?.resetTime;
      if (resetTime instanceof Date) {
        const seconds = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
        res.setHeader('Retry-After', String(seconds));
      }
      res.status(429).json({
        success: false,
        error: {
          code,
          message,
          requestId: req.id,
        },
      });
    },
  });
}

// Broad protection for every API route.
export const globalApiLimiter = createRateLimiter({
  limit: config.RATE_LIMIT_MAX,
  code: 'RATE_LIMITED',
  message: 'Too many requests. Please wait a few minutes and try again.',
  skip: (req) => req.path === '/health',
});

// Credential endpoints: brute-force and credential-stuffing protection.
export const authLimiter = createRateLimiter({
  limit: config.AUTH_RATE_LIMIT_MAX,
  code: 'AUTH_RATE_LIMITED',
  message: 'Too many authentication attempts. Please wait a few minutes and try again.',
});

// Expensive operations: AI analysis, LibreOffice rendering, exports, bulk edits.
export const heavyLimiter = createRateLimiter({
  limit: config.HEAVY_RATE_LIMIT_MAX,
  code: 'HEAVY_OPERATION_RATE_LIMITED',
  message: 'Too many expensive requests. Please wait a few minutes and try again.',
});

// File uploads (parsing + storage writes).
export const uploadLimiter = createRateLimiter({
  limit: config.UPLOAD_RATE_LIMIT_MAX,
  code: 'UPLOAD_RATE_LIMITED',
  message: 'Too many uploads. Please wait a few minutes and try again.',
});
