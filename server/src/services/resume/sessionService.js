import crypto from 'node:crypto';
import { config } from '../../config/env.js';
import { Resume } from '../../models/Resume.js';
import { ResumeExport } from '../../models/ResumeExport.js';
import { TailoringSession } from '../../models/TailoringSession.js';
import { ResumeEdit } from '../../models/ResumeEdit.js';
import { runTailoringAnalysis } from '../ai/aiService.js';
import { keywordCoverage } from '../ai/requirements.js';
import { parseDocx } from '../documents/docxParser.js';
import { getResumeForUser, readResumeBuffer } from '../resume/resumeService.js';
import { notFound, conflict, AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { scheduleAnalysisJob } from '../../jobs/jobRunner.js';

function sessionExpiry(resume) {
  if (resume.expiresAt) return resume.expiresAt;
  return config.retentionDays > 0
    ? new Date(Date.now() + config.retentionDays * 24 * 60 * 60 * 1000)
    : null;
}

function labelFromJobDescription(jobDescription) {
  const firstLine = jobDescription
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 120) : 'Tailoring session';
}

export async function createTailoringSession({ userId, resumeId, jobDescription }) {
  const resume = await getResumeForUser(userId, resumeId);
  if (resume.parseStatus !== 'ready') {
    throw conflict('This resume is not ready for analysis.', 'RESUME_NOT_READY');
  }
  const session = await TailoringSession.create({
    userId,
    resumeId: resume._id,
    label: labelFromJobDescription(jobDescription),
    jobDescription,
    jobDescriptionHash: crypto.createHash('sha256').update(jobDescription).digest('hex'),
    status: 'queued',
    stage: 'queued',
    progress: 0,
    expiresAt: sessionExpiry(resume),
  });
  scheduleAnalysisJob(session._id.toString(), runAnalysisJob);
  logger.info('Tailoring session queued', {
    userId: userId.toString(),
    resumeId: resumeId.toString(),
    sessionId: session._id.toString(),
    jobDescriptionChars: jobDescription.length,
  });
  return session;
}

export async function getLatestSessionForResume(userId, resumeId) {
  const session = await TailoringSession.findOne({ userId, resumeId }).sort({ createdAt: -1 });
  return session;
}

export async function getSessionForUser(userId, sessionId) {
  const session = await TailoringSession.findOne({ _id: sessionId, userId });
  if (!session) throw notFound('Tailoring session not found.', 'SESSION_NOT_FOUND');
  return session;
}

export async function listSessionsForResume(userId, resumeId) {
  await getResumeForUser(userId, resumeId);
  return TailoringSession.find({ userId, resumeId })
    .sort({ createdAt: -1 })
    .select('jobAnalysis.jobTitle status stage progress suggestionCount editVersion error createdAt updatedAt completedAt')
    .lean();
}

export function analysisPayload(session) {
  return {
    ...session.toJSON(),
    coverage: session.requirements?.length ? keywordCoverage(session.requirements) : null,
  };
}

async function updateStage(sessionId, stage, progress) {
  await TailoringSession.updateOne(
    { _id: sessionId, status: 'analyzing' },
    { $set: { stage, progress } },
  ).catch(() => {});
}

export async function runAnalysisJob(sessionId) {
  const session = await TailoringSession.findOneAndUpdate(
    { _id: sessionId, status: 'queued' },
    {
      $set: {
        status: 'analyzing',
        stage: 'analyzing_job',
        progress: 10,
        startedAt: new Date(),
        error: null,
      },
    },
    { new: true },
  );
  if (!session) {
    logger.warn('Analysis job skipped because its session is no longer queued', { sessionId });
    return;
  }

  try {
    const resume = await Resume.findOne({ _id: session.resumeId, userId: session.userId });
    if (!resume) {
      throw new AppError({
        status: 404,
        code: 'RESUME_NOT_FOUND',
        message: 'The resume for this session no longer exists.',
      });
    }
    const buffer = await readResumeBuffer(resume);
    const parsed = await parseDocx(buffer, { skipMammothCheck: true });

    const result = await runTailoringAnalysis({
      parsed,
      jobDescription: session.jobDescription,
      onStage: (stage, progress) => updateStage(session._id, stage, progress),
    });

    const latest = await TailoringSession.findOne({ _id: session._id });
    if (!latest) {
      logger.warn('Analysis result discarded because the session was deleted', { sessionId });
      return;
    }

    await ResumeEdit.deleteMany({ sessionId: session._id });
    if (result.suggestions.length > 0) {
      await ResumeEdit.insertMany(
        result.suggestions.map((suggestion) => ({
          sessionId: session._id,
          resumeId: session.resumeId,
          userId: session.userId,
          locationId: suggestion.locationId,
          part: suggestion.part,
          sectionName: suggestion.sectionName,
          originalText: suggestion.originalText,
          proposedText: suggestion.proposedText,
          finalText: null,
          reason: suggestion.reason,
          evidence: suggestion.evidence,
          requirementIds: suggestion.requirementIds,
          risk: suggestion.risk,
          status: 'pending',
          validation: suggestion.validation,
          order: suggestion.order,
          ai: suggestion.ai,
        })),
        { ordered: false },
      );
    }

    await TailoringSession.updateOne(
      { _id: session._id },
      {
        $set: {
          status: 'completed',
          stage: 'completed',
          progress: 100,
          completedAt: new Date(),
          label: result.jobAnalysis.jobTitle || session.label,
          jobAnalysis: result.jobAnalysis,
          requirements: result.requirements,
          matchingSummary: result.matchingSummary,
          ai: result.ai,
          suggestionCount: result.suggestions.length,
          error: null,
          editVersion: 1,
        },
      },
    );

    logger.info('Analysis job completed', {
      sessionId: sessionId.toString(),
      suggestions: result.suggestions.length,
    });
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'ANALYSIS_FAILED';
    const retryable = ['AI_TIMEOUT', 'AI_RATE_LIMITED', 'AI_UNAVAILABLE'].includes(code);
    const message =
      error instanceof AppError && error.expose
        ? error.message
        : 'The analysis could not be completed. The document was not modified.';
    await TailoringSession.updateOne(
      { _id: sessionId },
      {
        $set: {
          status: 'failed',
          stage: 'failed',
          error: {
            code,
            message,
            recoverable: true,
            retryable,
          },
        },
      },
    ).catch(() => {});
    logger.error('Analysis job failed', {
      sessionId: sessionId.toString(),
      code,
      error: error.message,
    });
  }
}

export async function retryAnalysisSession(userId, sessionId) {
  const session = await getSessionForUser(userId, sessionId);
  if (session.status !== 'failed') {
    throw conflict('Only failed analyses can be retried.', 'SESSION_NOT_FAILED');
  }
  const updated = await TailoringSession.findOneAndUpdate(
    { _id: session._id, userId, status: 'failed' },
    {
      $set: {
        status: 'queued',
        stage: 'queued',
        progress: 0,
        error: null,
        startedAt: null,
        completedAt: null,
      },
    },
    { new: true },
  );
  if (!updated) {
    throw conflict('This analysis is already being retried.', 'SESSION_RETRY_CONFLICT');
  }
  await ResumeEdit.deleteMany({ sessionId: updated._id });
  scheduleAnalysisJob(updated._id.toString(), runAnalysisJob);
  return updated;
}

/**
 * Any in-flight jobs are lost when the process exits. Mark them failed on
 * startup so the UI can offer a truthful retry instead of polling forever.
 */
export async function recoverInterruptedJobs() {
  const sessionResult = await TailoringSession.updateMany(
    { status: { $in: ['queued', 'analyzing'] } },
    {
      $set: {
        status: 'failed',
        stage: 'failed',
        error: {
          code: 'INTERRUPTED',
          message: 'Analysis was interrupted by a server restart. Retry to continue.',
          recoverable: true,
          retryable: true,
        },
      },
    },
  );
  if (sessionResult.modifiedCount > 0) {
    logger.warn('Marked interrupted analysis sessions as failed', {
      count: sessionResult.modifiedCount,
    });
  }

  // Export jobs are also in-process. Mark any that were mid-flight when the
  // process stopped so the UI stops polling and offers a fresh export.
  const exportResult = await ResumeExport.updateMany(
    { status: 'processing' },
    {
      $set: {
        status: 'failed',
        error: {
          code: 'EXPORT_INTERRUPTED',
          message:
            'The export was interrupted by a server restart. The original resume is unchanged; request a new export.',
        },
      },
    },
  );
  if (exportResult.modifiedCount > 0) {
    logger.warn('Marked interrupted exports as failed', {
      count: exportResult.modifiedCount,
    });
  }
}
