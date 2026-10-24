import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../../config/env.js';
import { Resume } from '../../models/Resume.js';
import { TailoringSession } from '../../models/TailoringSession.js';
import { ResumeEdit } from '../../models/ResumeEdit.js';
import { ResumeExport } from '../../models/ResumeExport.js';
import { parseDocx } from '../documents/docxParser.js';
import { getStorage } from '../storage/storageService.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

function decodeFilename(name) {
  const raw = String(name || 'resume.docx');
  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    if (decoded.includes('\uFFFD')) return raw;
    return decoded;
  } catch {
    return raw;
  }
}

export function sanitizeFilename(name, fallback = 'resume.docx') {
  const decoded = decodeFilename(name);
  const base = path.basename(decoded).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_').trim();
  const limited = base.slice(0, 180);
  return limited.toLowerCase().endsWith('.docx') ? limited : fallback;
}

function expiryDate() {
  return config.retentionDays > 0
    ? new Date(Date.now() + config.retentionDays * 24 * 60 * 60 * 1000)
    : null;
}

function storedMetadata(parsed) {
  return {
    documentHash: parsed.documentHash,
    paragraphCount: parsed.paragraphs.length,
    editableCount: parsed.paragraphs.filter((p) => p.editable).length,
    wordCount: parsed.wordCount,
    sections: parsed.sections,
    counts: parsed.counts,
    warnings: parsed.warnings,
    unsupported: parsed.unsupported,
    paragraphs: parsed.paragraphs.map((p) => ({
      id: p.id,
      part: p.part,
      kind: p.kind,
      index: p.index,
      text: p.text,
      section: p.section,
      styleId: p.styleId,
      styleName: p.styleName,
      isHeading: p.isHeading,
      headingLevel: p.headingLevel,
      editable: p.editable,
      reasons: p.reasons,
      runCount: p.runCount,
      mixedFormatting: p.mixedFormatting,
      tableContext: p.tableContext,
      order: p.order,
    })),
  };
}

export async function createResumeFromUpload({ userId, file }) {
  if (!file?.buffer) {
    throw badRequest('No resume file was uploaded.', 'FILE_REQUIRED');
  }
  const originalFilename = sanitizeFilename(file.originalname);
  const parsed = await parseDocx(file.buffer);
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const storage = await getStorage();
  const stored = await storage.save(file.buffer, { category: 'originals', extension: 'docx' });

  try {
    const resume = await Resume.create({
      userId,
      originalFilename,
      storageKey: stored.key,
      sizeBytes: file.buffer.length,
      sha256,
      parseStatus: 'ready',
      document: storedMetadata(parsed),
      expiresAt: expiryDate(),
    });
    logger.info('Resume uploaded and parsed', {
      userId: userId.toString(),
      resumeId: resume._id.toString(),
      sizeBytes: file.buffer.length,
      paragraphs: parsed.paragraphs.length,
      editableParagraphs: parsed.paragraphs.filter((p) => p.editable).length,
    });
    return resume;
  } catch (error) {
    await storage.delete(stored.key).catch(() => {});
    throw error;
  }
}

export async function getResumeForUser(userId, resumeId) {
  const resume = await Resume.findOne({ _id: resumeId, userId });
  if (!resume) {
    throw notFound('Resume not found.', 'RESUME_NOT_FOUND');
  }
  return resume;
}

export async function listResumesForUser(userId) {
  const resumes = await Resume.find({ userId }).sort({ createdAt: -1 }).limit(100);
  const items = await Promise.all(
    resumes.map(async (resume) => {
      const [session, latestExport, sessionCount] = await Promise.all([
        TailoringSession.findOne({ resumeId: resume._id, userId })
          .sort({ createdAt: -1 })
          .select('jobAnalysis.jobTitle status stage progress suggestionCount editVersion error createdAt updatedAt')
          .lean(),
        ResumeExport.findOne({ resumeId: resume._id, userId, status: 'ready' })
          .sort({ createdAt: -1 })
          .select('id filename validation.status sourceEditVersion createdAt expiresAt')
          .lean(),
        TailoringSession.countDocuments({ resumeId: resume._id, userId }),
      ]);
      return {
        ...resume.toSummaryJSON(),
        latestSession: session
          ? {
              id: session._id.toString(),
              jobTitle: session.jobAnalysis?.jobTitle || null,
              status: session.status,
              stage: session.stage,
              progress: session.progress,
              suggestionCount: session.suggestionCount || 0,
              editVersion: session.editVersion,
              error: session.error?.code ? session.error : null,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
            }
          : null,
        latestExport: latestExport
          ? {
              id: latestExport._id.toString(),
              filename: latestExport.filename,
              validationStatus: latestExport.validation?.status || null,
              sourceEditVersion: latestExport.sourceEditVersion,
              createdAt: latestExport.createdAt,
              expiresAt: latestExport.expiresAt,
            }
          : null,
        sessionCount,
      };
    }),
  );
  return items;
}

export async function readResumeBuffer(resume) {
  const storage = await getStorage();
  const buffer = await storage.read(resume.storageKey);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  if (hash !== resume.sha256) {
    throw new Error('Stored resume failed its integrity check.');
  }
  return buffer;
}

export async function deleteResumeAndArtifacts(userId, resumeId) {
  const resume = await getResumeForUser(userId, resumeId);
  const [sessions, exports] = await Promise.all([
    TailoringSession.find({ resumeId: resume._id, userId }).select('_id').lean(),
    ResumeExport.find({ resumeId: resume._id, userId }).select('storageKey previewStorageKey').lean(),
  ]);
  const storage = await getStorage();

  const keys = [
    resume.storageKey,
    ...exports.flatMap((item) => [item.storageKey, item.previewStorageKey]),
  ].filter(Boolean);

  for (const key of keys) {
    try {
      await storage.delete(key);
    } catch (error) {
      logger.warn('Failed to delete a stored file during resume deletion', {
        resumeId: resume._id.toString(),
        error: error.message,
      });
    }
  }

  await Promise.all([
    ResumeEdit.deleteMany({ resumeId: resume._id, userId }),
    ResumeExport.deleteMany({ resumeId: resume._id, userId }),
    TailoringSession.deleteMany({ resumeId: resume._id, userId }),
    Resume.deleteOne({ _id: resume._id, userId }),
  ]);

  logger.info('Resume and associated data deleted', {
    userId: userId.toString(),
    resumeId: resumeId.toString(),
    sessions: sessions.length,
  });
}
