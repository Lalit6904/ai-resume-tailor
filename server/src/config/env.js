import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { ROOT_DIR } from './paths.js';

// Load the repository-level .env first, then allow a local override without
// overwriting values that are already present (useful for tests and Docker).
// Test runs must not inherit a developer's local database, storage, or AI keys;
// the Vitest setup file supplies an isolated configuration instead.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: path.resolve(ROOT_DIR, '.env') });
  dotenv.config({ path: path.resolve(ROOT_DIR, '.env.local'), override: true });
}

// Render exposes the public URL of the running service. When CLIENT_ORIGIN is
// not configured explicitly, use it so a fresh deployment works without a
// manual copy/paste step. An explicit CLIENT_ORIGIN (for example a custom
// domain) always takes precedence.
if (!process.env.CLIENT_ORIGIN && process.env.RENDER_EXTERNAL_URL) {
  process.env.CLIENT_ORIGIN = process.env.RENDER_EXTERNAL_URL.trim().replace(/\/+$/, '');
}

const boolish = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => ['true', '1', 'yes'].includes(v));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173,http://localhost:4000'),
  JWT_SECRET: z.string().min(16).default('development-only-change-me-please-32'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECURE: boolish.default('false'),
  TRUST_PROXY: boolish.default('false'),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/ai_resume_tailor'),

  AI_PROVIDER: z.enum(['heuristic', 'openai', 'anthropic']).default('heuristic'),
  AI_API_KEY: z.string().optional().default(''),
  AI_MODEL: z.string().default('gpt-4.1-mini'),
  AI_BASE_URL: z.string().optional().default(''),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(180000).default(60000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(500).max(16000).default(4000),
  AI_MAX_RESUME_CHARS: z.coerce.number().int().min(2000).max(60000).default(14000),
  AI_MAX_JD_CHARS: z.coerce.number().int().min(1000).max(60000).default(14000),

  MAX_UPLOAD_MB: z.coerce.number().positive().max(50).default(10),
  STORAGE_DIR: z.string().default('./storage'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: z.string().optional().default(''),
  S3_REGION: z.string().optional().default(''),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  LIBREOFFICE_PATH: z.string().optional().default(''),

  RETENTION_DAYS: z.coerce.number().int().min(0).max(3650).default(30),
  CLEANUP_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(1440).default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(100000).default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(5).max(10000).default(20),
  HEAVY_RATE_LIMIT_MAX: z.coerce.number().int().min(5).max(10000).default(30),
  UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().min(5).max(10000).default(20),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  LOG_AI_METADATA: boolish.default('false'),
});

let parsed;
try {
  parsed = envSchema.parse(process.env);
} catch (error) {
  const issues = error?.issues
    ?.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(
    `Invalid environment configuration. Copy .env.example to .env and fix:\n${issues || error.message}`,
  );
}

const warnings = [];

// Reject obvious placeholders, low-entropy values, and short secrets. This is
// deliberately stricter than a length check because .env.example ships with a
// long-but-public placeholder that must never be accepted in production.
const PLACEHOLDER_SECRET_PATTERN =
  /(change[-_ ]?me|development[-_ ]?only|your[-_ ]?secret|placeholder|example|replace[-_ ]?me|test[-_ ]?only|secret[-_ ]?key|password)/i;

function isWeakSecret(secret) {
  return (
    secret.length < 32 ||
    PLACEHOLDER_SECRET_PATTERN.test(secret) ||
    new Set(secret).size < 12
  );
}

if (parsed.NODE_ENV === 'production') {
  if (isWeakSecret(parsed.JWT_SECRET)) {
    throw new Error(
      'JWT_SECRET must be a unique random string of at least 32 characters in production (placeholders and low-entropy values are rejected).',
    );
  }
  if (parsed.CLIENT_ORIGIN === '*') {
    throw new Error('CLIENT_ORIGIN must be an explicit origin in production (wildcards are unsafe with cookies).');
  }
  if (!parsed.COOKIE_SECURE) {
    warnings.push(
      'COOKIE_SECURE=false in production: session cookies will be sent over plain HTTP. Set COOKIE_SECURE=true behind HTTPS.',
    );
  }
  if (/^mongodb:\/\/(localhost|127\.0\.0\.1)/i.test(parsed.MONGODB_URI)) {
    warnings.push(
      'MONGODB_URI points at localhost in production. Use a managed database (for example MongoDB Atlas) with backups enabled.',
    );
  }
}
if (parsed.AI_PROVIDER !== 'heuristic' && !parsed.AI_API_KEY) {
  throw new Error(
    `AI_PROVIDER=${parsed.AI_PROVIDER} requires AI_API_KEY. Set it in .env or use AI_PROVIDER=heuristic.`,
  );
}
if (parsed.STORAGE_DRIVER === 's3') {
  const missing = ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter(
    (key) => !parsed[key],
  );
  if (missing.length) {
    throw new Error(`STORAGE_DRIVER=s3 is missing: ${missing.join(', ')}`);
  }
}
if (parsed.AI_PROVIDER === 'heuristic') {
  warnings.push(
    'AI_PROVIDER=heuristic: suggestions come from a deterministic local analyzer, not an LLM. Set AI_PROVIDER and AI_API_KEY for AI-powered tailoring.',
  );
}
if (parsed.NODE_ENV === 'production' && parsed.STORAGE_DRIVER === 'local') {
  warnings.push(
    'Local storage is active in production. Use durable private object storage (STORAGE_DRIVER=s3) and a persistent volume.',
  );
}

const clientOrigins = parsed.CLIENT_ORIGIN.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const config = {
  ...parsed,
  isProduction: parsed.NODE_ENV === 'production',
  isTest: parsed.NODE_ENV === 'test',
  clientOrigins,
  jwtSecret: parsed.JWT_SECRET,
  jwtExpiresIn: parsed.JWT_EXPIRES_IN,
  cookieSecure: parsed.COOKIE_SECURE,
  uploadLimitBytes: Math.floor(parsed.MAX_UPLOAD_MB * 1024 * 1024),
  storageDir: path.isAbsolute(parsed.STORAGE_DIR)
    ? parsed.STORAGE_DIR
    : path.resolve(ROOT_DIR, parsed.STORAGE_DIR),
  ai: {
    provider: parsed.AI_PROVIDER,
    apiKey: parsed.AI_API_KEY,
    model: parsed.AI_MODEL,
    baseUrl: parsed.AI_BASE_URL,
    timeoutMs: parsed.AI_TIMEOUT_MS,
    maxRetries: parsed.AI_MAX_RETRIES,
    maxOutputTokens: parsed.AI_MAX_OUTPUT_TOKENS,
    maxResumeChars: parsed.AI_MAX_RESUME_CHARS,
    maxJdChars: parsed.AI_MAX_JD_CHARS,
    logMetadata: parsed.LOG_AI_METADATA,
  },
  retentionDays: parsed.RETENTION_DAYS,
  cleanupIntervalMinutes: parsed.CLEANUP_INTERVAL_MINUTES,
  warnings,
};

export const envWarnings = warnings;
