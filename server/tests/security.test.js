import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from './helpers/api.js';
import { errorHandler, requestContext } from '../src/middleware/errorHandler.js';
import { createRateLimiter } from '../src/middleware/rateLimit.js';
import { sanitizeRequest, sanitizeValue } from '../src/middleware/sanitize.js';
import { AppError } from '../src/utils/errors.js';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('security hardening', () => {
  describe('security headers', () => {
    it('sets CSP, nosniff, and frame protections on API responses', async () => {
      const response = await request(app).get('/api/health').expect(200);
      const csp = response.headers['content-security-policy'];

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp).toContain("object-src 'none'");
    });

    it('does not force HTTPS upgrades outside production', async () => {
      const response = await request(app).get('/api/health').expect(200);
      expect(response.headers['content-security-policy']).not.toContain(
        'upgrade-insecure-requests',
      );
    });
  });

  describe('request IDs', () => {
    it('keeps a well-formed client request ID', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('X-Request-Id', 'client-request-1234')
        .expect(200);
      expect(response.headers['x-request-id']).toBe('client-request-1234');
      expect(response.body.error).toBeUndefined();
    });

    it('replaces an invalid client request ID with a UUID', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('X-Request-Id', 'bad id with spaces')
        .expect(200);
      const id = response.headers['x-request-id'];
      expect(id).not.toBe('bad id with spaces');
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('NoSQL / prototype sanitization', () => {
    it('strips operators, dotted keys, and prototype keys recursively', () => {
      const payload = JSON.parse(
        '{"email":{"$ne":null},"profile.role":"admin","__proto__":{"polluted":true},"nested":{"$gt":"","safe":"ok"},"items":[{"$where":"1"},{"ok":true}]}',
      );

      const clean = sanitizeValue(payload);
      expect(clean).toEqual({
        email: {},
        nested: { safe: 'ok' },
        items: [{}, { ok: true }],
      });
      expect(({}).polluted).toBeUndefined();
    });

    it('sanitizes query strings before controllers see them', async () => {
      const mini = express();
      mini.use(sanitizeRequest);
      mini.get('/echo', (req, res) => res.json({ query: req.query }));

      const response = await request(mini)
        .get('/echo?sessionId[$ne]=1&profile.role=admin&safe=ok')
        .expect(200);

      expect(response.body.query).toEqual({ sessionId: {}, safe: 'ok' });
    });

    it('blocks a NoSQL login bypass payload with validation, not authentication', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: { $gt: '' }, password: 'Password123' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body).not.toHaveProperty('data');
    });
  });

  describe('JWT verification', () => {
    it('rejects tokens signed with a different algorithm', async () => {
      const token = jwt.sign(
        { sub: '507f1f77bcf86cd799439011', email: 'x@test.example', name: 'X' },
        process.env.JWT_SECRET,
        { algorithm: 'HS512', issuer: 'ai-resume-tailor', expiresIn: '1h' },
      );

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      expect(response.body.error.code).toBe('SESSION_EXPIRED');
    });
  });

  describe('rate limiting', () => {
    it('returns a clean 429 JSON error with rate-limit headers', async () => {
      const mini = express();
      mini.use(
        createRateLimiter({
          limit: 2,
          windowMs: 60_000,
          code: 'TEST_RATE_LIMITED',
          message: 'Slow down.',
        }),
      );
      mini.get('/ping', (req, res) => res.json({ ok: true }));

      await request(mini).get('/ping').expect(200);
      await request(mini).get('/ping').expect(200);
      const limited = await request(mini).get('/ping').expect(429);

      expect(limited.body.success).toBe(false);
      expect(limited.body.error).toMatchObject({
        code: 'TEST_RATE_LIMITED',
        message: 'Slow down.',
      });
      expect(limited.headers['ratelimit-policy']).toContain('2');
      expect(limited.headers['retry-after']).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('rejects malformed JSON with a 400 and no internals', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email":')
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_JSON');
      expect(response.body.error).not.toHaveProperty('stack');
      expect(response.body.error).not.toHaveProperty('details');
    });

    it('never exposes a 500 message, stack, or details', async () => {
      const mini = express();
      mini.use(requestContext);
      mini.get('/boom', () => {
        throw new Error('mongodb://user:password@cluster.example.net/db');
      });
      mini.get('/app-error', () => {
        throw new AppError({
          status: 500,
          code: 'DATABASE_ERROR',
          message: 'connection string leaked',
          details: { uri: 'mongodb://secret' },
        });
      });
      mini.use(errorHandler);

      for (const route of ['/boom', '/app-error']) {
        const response = await request(mini).get(route).expect(500);
        expect(response.body.error.message).toBe(
          'An unexpected server error occurred. Please try again.',
        );
        expect(JSON.stringify(response.body)).not.toContain('mongodb');
        expect(response.body.error).not.toHaveProperty('stack');
        expect(response.body.error).not.toHaveProperty('details');
        expect(response.body.error.requestId).toBeTruthy();
      }
    });
  });

  describe('production environment validation', () => {
    const baseEnv = {
      NODE_ENV: 'production',
      JWT_SECRET: 'vS8mQ2xR7kL4pN9tB6yH1cF5jW3zD0gA',
      CLIENT_ORIGIN: 'https://app.example.com',
      COOKIE_SECURE: 'true',
      MONGODB_URI: 'mongodb+srv://user:pass@cluster.example.net/ai_resume_tailor',
      AI_PROVIDER: 'heuristic',
      STORAGE_DRIVER: 'local',
      LOG_LEVEL: 'silent',
    };

    function validateProduction(overrides = {}) {
      return spawnSync(
        process.execPath,
        ['--input-type=module', '-e', "import('./src/config/env.js')"],
        {
          cwd: SERVER_ROOT,
          env: { ...process.env, ...baseEnv, ...overrides },
          encoding: 'utf8',
          timeout: 20_000,
        },
      );
    }

    it('rejects the public .env.example placeholder secret', () => {
      const result = validateProduction({
        JWT_SECRET: 'change-me-to-a-long-random-development-secret',
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/JWT_SECRET/);
    });

    it('accepts a high-entropy 32+ character secret', () => {
      const result = validateProduction();
      expect(result.status).toBe(0);
    });
  });
});
