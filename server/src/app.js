import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config/env.js';
import { CLIENT_DIST } from './config/paths.js';
import { authRouter } from './routes/authRoutes.js';
import { apiRouter } from './routes/resumeRoutes.js';
import { healthRouter } from './routes/healthRoutes.js';
import {
  errorHandler,
  notFoundHandler,
  originCheck,
  requestContext,
} from './middleware/errorHandler.js';
import { globalApiLimiter } from './middleware/rateLimit.js';
import { sanitizeRequest } from './middleware/sanitize.js';
import { AppError } from './utils/errors.js';

const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'blob:'],
  fontSrc: ["'self'", 'data:'],
  connectSrc: ["'self'"],
  frameSrc: ["'self'", 'blob:'],
  objectSrc: ["'none'"],
  frameAncestors: ["'self'"],
  // Only force HTTPS upgrades in production; local HTTP development would
  // otherwise rewrite same-origin asset URLs to https://localhost.
  ...(config.isProduction ? {} : { upgradeInsecureRequests: null }),
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(requestContext);
  app.use(
    helmet({
      contentSecurityPolicy: { directives: CSP_DIRECTIVES },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.clientOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(
          new AppError({
            status: 403,
            code: 'ORIGIN_NOT_ALLOWED',
            message: 'This request origin is not allowed.',
          }),
        );
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
      maxAge: 600,
    }),
  );

  // Rate-limit before parsing bodies so a flood cannot force large allocations.
  app.use('/api', globalApiLimiter);

  app.use(cookieParser());
  app.use(express.json({ limit: '128kb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  // Strip NoSQL operators, dotted paths, and prototype keys before validation.
  app.use(sanitizeRequest);
  app.use(originCheck);

  app.use('/api/auth', authRouter);
  app.use('/api', healthRouter);
  app.use('/api', apiRouter);

  if (fs.existsSync(CLIENT_DIST)) {
    app.use(
      express.static(CLIENT_DIST, {
        index: false,
        maxAge: config.isProduction ? '1h' : 0,
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    app.get(/^\/(?!api(?:\/|$)).*/, (req, res, next) => {
      res.sendFile(path.join(CLIENT_DIST, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }

  app.use('/api', notFoundHandler);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
