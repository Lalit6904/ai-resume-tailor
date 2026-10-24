import { createApp } from './app.js';
import { config, envWarnings } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { getStorage } from './services/storage/storageService.js';
import { detectRenderer } from './services/documents/renderer.js';
import { recoverInterruptedJobs } from './services/resume/sessionService.js';
import { cleanupExpiredData, startRetentionJob } from './services/resume/retentionService.js';
import { logger } from './utils/logger.js';

async function start() {
  for (const warning of envWarnings) logger.warn(warning);

  await connectDatabase();
  await getStorage();
  detectRenderer();
  await recoverInterruptedJobs();
  await cleanupExpiredData().catch((error) =>
    logger.warn('Initial retention cleanup failed', { error: error.message }),
  );
  startRetentionJob();

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info('AI Resume Tailor server started', {
      port: config.PORT,
      environment: config.NODE_ENV,
      aiProvider: config.ai.provider,
      storage: config.STORAGE_DRIVER,
    });
  });

  const shutdown = async (signal) => {
    logger.info('Shutting down', { signal });
    server.close(async () => {
      await disconnectDatabase().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
  });
});

start().catch((error) => {
  logger.error('Server failed to start', { error: error.message });
  process.exit(1);
});
