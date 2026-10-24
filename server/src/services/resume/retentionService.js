import { config } from '../../config/env.js';
import { Resume } from '../../models/Resume.js';
import { ResumeExport } from '../../models/ResumeExport.js';
import { TailoringSession } from '../../models/TailoringSession.js';
import { ResumeEdit } from '../../models/ResumeEdit.js';
import { deleteResumeAndArtifacts } from './resumeService.js';
import { getStorage } from '../storage/storageService.js';
import { logger } from '../../utils/logger.js';

export async function cleanupExpiredData() {
  const now = new Date();
  const storage = await getStorage();
  let deletedResumes = 0;
  let expiredExports = 0;

  const expiredResumes = await Resume.find({ expiresAt: { $lte: now } })
    .select('_id userId')
    .limit(50)
    .lean();
  for (const resume of expiredResumes) {
    try {
      await deleteResumeAndArtifacts(resume.userId, resume._id);
      deletedResumes += 1;
    } catch (error) {
      logger.warn('Expired resume cleanup failed', {
        resumeId: resume._id.toString(),
        error: error.message,
      });
    }
  }

  const expired = await ResumeExport.find({
    expiresAt: { $lte: now },
    status: { $ne: 'expired' },
  })
    .select('_id storageKey previewStorageKey')
    .limit(100)
    .lean();
  for (const record of expired) {
    for (const key of [record.storageKey, record.previewStorageKey].filter(Boolean)) {
      await storage.delete(key).catch(() => {});
    }
    await ResumeExport.updateOne(
      { _id: record._id },
      {
        $set: {
          status: 'expired',
          storageKey: null,
          previewStorageKey: null,
          error: { code: 'EXPORT_EXPIRED', message: 'This export expired and its file was deleted.' },
        },
      },
    );
    expiredExports += 1;
  }

  const staleThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await ResumeExport.updateMany(
    { status: 'processing', createdAt: { $lte: staleThreshold } },
    {
      $set: {
        status: 'failed',
        error: {
          code: 'EXPORT_INTERRUPTED',
          message: 'Export was interrupted. Request a new export; the original resume is unchanged.',
        },
      },
    },
  );

  // Sessions whose parent resume was removed independently.
  const orphanSessions = await TailoringSession.find({ expiresAt: { $lte: now }, resumeId: { $exists: true } })
    .select('_id resumeId')
    .limit(50)
    .lean();
  for (const session of orphanSessions) {
    const resumeExists = await Resume.exists({ _id: session.resumeId });
    if (!resumeExists) {
      await Promise.all([
        ResumeEdit.deleteMany({ sessionId: session._id }),
        TailoringSession.deleteOne({ _id: session._id }),
      ]);
    }
  }

  if (deletedResumes || expiredExports) {
    logger.info('Retention cleanup completed', { deletedResumes, expiredExports });
  }
  return { deletedResumes, expiredExports };
}

export function startRetentionJob() {
  if (config.cleanupIntervalMinutes <= 0) return null;
  const timer = setInterval(
    () => cleanupExpiredData().catch((error) => logger.error('Retention job failed', { error: error.message })),
    config.cleanupIntervalMinutes * 60 * 1000,
  );
  timer.unref?.();
  return timer;
}
