import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { afterAll, beforeAll } from 'vitest';
import mongoose from 'mongoose';

const TEST_MONGO_URI =
  process.env.TEST_MONGODB_URI ||
  'mongodb://127.0.0.1:27017/ai_resume_tailor_test';
const TEST_STORAGE_DIR = path.join(os.tmpdir(), 'ai-resume-tailor-test-storage');

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = TEST_MONGO_URI;
process.env.JWT_SECRET = 'test-only-secret-that-is-long-enough-32';
process.env.COOKIE_SECURE = 'false';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.AI_PROVIDER = 'heuristic';
process.env.AI_API_KEY = '';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_DIR = TEST_STORAGE_DIR;
process.env.RETENTION_DAYS = '30';
process.env.CLEANUP_INTERVAL_MINUTES = '0';
process.env.RATE_LIMIT_MAX = '100000';
process.env.LOG_LEVEL = 'silent';
process.env.LIBREOFFICE_PATH = '';

function assertIsolatedDatabase(uri) {
  const name = uri.split('/').pop()?.split('?')[0] || '';
  if (!/test/i.test(name)) {
    throw new Error(
      `Refusing to run destructive tests against a database whose name does not contain "test": ${name}`,
    );
  }
}

assertIsolatedDatabase(TEST_MONGO_URI);

beforeAll(async () => {
  await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
  await fs.mkdir(TEST_STORAGE_DIR, { recursive: true });
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }
  await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
});
