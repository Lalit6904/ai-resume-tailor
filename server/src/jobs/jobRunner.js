import { logger } from '../utils/logger.js';

const activeJobs = new Set();

/**
 * Run a background task in-process. Job state is persisted in MongoDB before
 * scheduling so clients can poll and recover from failures. We deliberately do
 * not fake progress; each stage is written when the work actually starts.
 */
export function scheduleJob(label, task) {
  setImmediate(async () => {
    if (activeJobs.has(label)) {
      logger.warn('Duplicate background job skipped', { label });
      return;
    }
    activeJobs.add(label);
    try {
      await task();
    } catch (error) {
      logger.error('Background job crashed', { label, error: error.message });
    } finally {
      activeJobs.delete(label);
    }
  });
}

export function activeJobCount() {
  return activeJobs.size;
}

export function scheduleAnalysisJob(sessionId, runner) {
  scheduleJob(`analysis:${sessionId}`, () => runner(sessionId));
}

export function scheduleExportJob(exportId, runner) {
  scheduleJob(`export:${exportId}`, () => runner(exportId));
}
