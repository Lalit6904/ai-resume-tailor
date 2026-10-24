import crypto from 'node:crypto';
import { config } from '../../config/env.js';
import { TailoringSession } from '../../models/TailoringSession.js';
import { ResumeEdit } from '../../models/ResumeEdit.js';
import { ResumeExport } from '../../models/ResumeExport.js';
import { Resume } from '../../models/Resume.js';
import { getResumeForUser, readResumeBuffer } from '../resume/resumeService.js';
import { applyEditsToDocx } from '../documents/docxEditor.js';
import { validateExportedDocx } from '../documents/docxValidator.js';
import { buildPreview, detectRenderer, renderToPdf } from '../documents/renderer.js';
import { getStorage } from '../storage/storageService.js';
import { getLatestSessionForResume } from '../resume/sessionService.js';
import { unprocessable, conflict, notFound, AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { scheduleExportJob } from '../../jobs/jobRunner.js';

function exportFilename(originalFilename) {
  const base = originalFilename.replace(/\.docx$/i, '').replace(/[^\w\-. ]+/g, '').trim() || 'resume';
  const date = new Date().toISOString().slice(0, 10);
  return `${base.slice(0, 120)}-tailored-${date}.docx`;
}

function exportExpiry(resume) {
  if (resume.expiresAt) return resume.expiresAt;
  return config.retentionDays > 0
    ? new Date(Date.now() + config.retentionDays * 24 * 60 * 60 * 1000)
    : null;
}

export async function requestExport({ userId, resumeId, sessionId }) {
  const resume = await getResumeForUser(userId, resumeId);
  const session = sessionId
    ? await TailoringSession.findOne({ _id: sessionId, userId, resumeId })
    : await getLatestSessionForResume(userId, resumeId);
  if (!session) throw notFound('Tailoring session not found.', 'SESSION_NOT_FOUND');
  if (session.status !== 'completed') {
    throw conflict('The analysis must complete before exporting.', 'SESSION_NOT_COMPLETED');
  }

  const approvedCount = await ResumeEdit.countDocuments({
    sessionId: session._id,
    userId,
    status: { $in: ['approved', 'modified'] },
  });
  if (approvedCount === 0) {
    throw unprocessable(
      'There are no approved changes to export. Accept or modify at least one suggestion first.',
      'NO_APPROVED_EDITS',
    );
  }

  const record = await ResumeExport.create({
    sessionId: session._id,
    resumeId: resume._id,
    userId,
    filename: exportFilename(resume.originalFilename),
    sourceEditVersion: session.editVersion,
    status: 'processing',
    expiresAt: exportExpiry(resume),
    validation: { status: 'pending', checks: [], warnings: [] },
  });
  scheduleExportJob(record._id.toString(), runExportJob);
  logger.info('Export queued', {
    exportId: record._id.toString(),
    sessionId: session._id.toString(),
    sourceEditVersion: session.editVersion,
    approvedCount,
  });
  return record;
}

async function failExport(exportId, { code, message, validation, details }) {
  await ResumeExport.updateOne(
    { _id: exportId },
    {
      $set: {
        status: 'failed',
        storageKey: null,
        previewStorageKey: null,
        error: { code, message },
        ...(validation ? { validation } : {}),
      },
    },
  ).catch(() => {});
  logger.error('Export failed', {
    exportId: exportId.toString(),
    code,
    details,
  });
}

export async function runExportJob(exportId) {
  const record = await ResumeExport.findOne({ _id: exportId, status: 'processing' });
  if (!record) {
    logger.warn('Export job skipped because its record is not processing', { exportId });
    return;
  }

  let savedDocKey = null;
  let savedPreviewKey = null;
  const storage = await getStorage();

  try {
    const [session, resume] = await Promise.all([
      TailoringSession.findOne({ _id: record.sessionId, userId: record.userId }),
      Resume.findOne({ _id: record.resumeId, userId: record.userId }),
    ]);
    if (!session || !resume) {
      throw new AppError({
        status: 404,
        code: 'EXPORT_SOURCE_MISSING',
        message: 'The resume or review session no longer exists.',
      });
    }
    if (session.status !== 'completed') {
      throw new AppError({
        status: 409,
        code: 'SESSION_NOT_COMPLETED',
        message: 'The review session is not complete.',
      });
    }
    if (session.editVersion !== record.sourceEditVersion) {
      throw new AppError({
        status: 409,
        code: 'REVIEW_CHANGED_DURING_EXPORT',
        message:
          'Review decisions changed after this export was requested. Request a fresh export so only your latest approved changes are included.',
      });
    }

    const edits = await ResumeEdit.find({ sessionId: session._id, userId: record.userId }).sort({
      order: 1,
    });
    const approved = edits.filter((e) => e.status === 'approved' || e.status === 'modified');
    if (approved.length === 0) {
      throw new AppError({
        status: 422,
        code: 'NO_APPROVED_EDITS',
        message: 'There are no approved changes to export.',
      });
    }

    const originalBuffer = await readResumeBuffer(resume);
    const exportInputs = approved.map((edit) => ({
      id: edit._id.toString(),
      locationId: edit.locationId,
      originalText: edit.originalText,
      proposedText: edit.status === 'modified' && edit.finalText ? edit.finalText : edit.proposedText,
      status: edit.status,
      validation: edit.validation?.toObject?.() || edit.validation || {},
    }));

    const applied = await applyEditsToDocx(originalBuffer, exportInputs, {
      expectedDocumentHash: resume.document?.documentHash,
    });

    let renderInfo = { renderer: 'none', pageCount: null, originalPageCount: null };
    let pdfBuffer = null;
    if (detectRenderer()) {
      renderInfo.renderer = 'libreoffice';
      const originalRender = await renderToPdf(originalBuffer);
      const generatedRender = await renderToPdf(applied.buffer);
      renderInfo.originalPageCount = originalRender?.pageCount ?? null;
      renderInfo.pageCount = generatedRender?.pageCount ?? null;
      pdfBuffer = generatedRender?.pdfBuffer || null;
      if (originalRender?.error || generatedRender?.error) {
        renderInfo.error = originalRender?.error || generatedRender?.error;
      }
    }

    const editSnapshots = edits.map((edit) => ({
      ...edit.toJSON(),
    }));
    const validation = await validateExportedDocx({
      originalBuffer,
      generatedBuffer: applied.buffer,
      edits: editSnapshots,
      appliedEditIds: exportInputs.map((e) => e.id),
      renderInfo,
    });

    if (!validation.ok) {
      await failExport(exportId, {
        code: 'EXPORT_VALIDATION_FAILED',
        message:
          'The generated document failed integrity checks and was not made available. Your original resume is unchanged.',
        validation: {
          status: 'failed',
          checks: validation.checks,
          warnings: validation.warnings,
          pageCount: validation.pageCount,
          originalPageCount: validation.originalPageCount,
          renderer: validation.renderer,
        },
      });
      return;
    }

    const storedDoc = await storage.save(applied.buffer, {
      category: 'exports',
      extension: 'docx',
    });
    savedDocKey = storedDoc.key;
    if (pdfBuffer) {
      const storedPreview = await storage.save(pdfBuffer, {
        category: 'previews',
        extension: 'pdf',
      });
      savedPreviewKey = storedPreview.key;
    }

    const rejectedCount = edits.filter((e) => e.status === 'rejected').length;
    const pendingCount = edits.filter((e) => e.status === 'pending').length;

    await ResumeExport.updateOne(
      { _id: record._id },
      {
        $set: {
          status: 'ready',
          storageKey: storedDoc.key,
          previewStorageKey: savedPreviewKey,
          sizeBytes: applied.buffer.length,
          sha256: crypto.createHash('sha256').update(applied.buffer).digest('hex'),
          appliedEditIds: exportInputs.map((e) => e.id),
          excluded: { pending: pendingCount, rejected: rejectedCount },
          validation: {
            status: 'passed',
            checks: validation.checks,
            warnings: validation.warnings,
            pageCount: validation.pageCount,
            originalPageCount: validation.originalPageCount,
            renderer: validation.renderer,
          },
          error: null,
        },
      },
    );
    await Resume.updateOne({ _id: resume._id }, { $inc: { exportCount: 1 } });

    logger.info('Export completed', {
      exportId: exportId.toString(),
      appliedEdits: exportInputs.length,
      warnings: validation.warnings.length,
      renderer: validation.renderer,
    });
  } catch (error) {
    if (savedDocKey) await storage.delete(savedDocKey).catch(() => {});
    if (savedPreviewKey) await storage.delete(savedPreviewKey).catch(() => {});
    const code = error instanceof AppError ? error.code : 'EXPORT_FAILED';
    const message =
      error instanceof AppError && error.expose
        ? error.message
        : 'The export could not be completed. Your original resume is unchanged; please try again.';
    await failExport(exportId, { code, message, details: error.message });
  }
}

export async function getLatestExport(userId, resumeId, { readyOnly = false } = {}) {
  await getResumeForUser(userId, resumeId);
  const query = { userId, resumeId };
  if (readyOnly) query.status = 'ready';
  return ResumeExport.findOne(query).sort({ createdAt: -1 });
}

export async function getExportById(userId, resumeId, exportId) {
  await getResumeForUser(userId, resumeId);
  const record = await ResumeExport.findOne({ _id: exportId, userId, resumeId });
  if (!record) throw notFound('Export not found.', 'EXPORT_NOT_FOUND');
  return record;
}

export async function readExportFile(userId, resumeId, exportId) {
  const record = exportId
    ? await getExportById(userId, resumeId, exportId)
    : await getLatestExport(userId, resumeId, { readyOnly: true });
  if (!record) throw notFound('No exported resume is available.', 'EXPORT_NOT_FOUND');
  if (record.status !== 'ready' || !record.storageKey) {
    throw conflict('This export is not ready yet.', 'EXPORT_NOT_READY');
  }
  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
    throw new AppError({
      status: 410,
      code: 'EXPORT_EXPIRED',
      message: 'This export has expired. Generate a new download.',
    });
  }
  const buffer = await (await getStorage()).read(record.storageKey);
  return { record, buffer };
}

export async function getFinalPreview(userId, resumeId, exportId) {
  const record = exportId
    ? await getExportById(userId, resumeId, exportId)
    : await getLatestExport(userId, resumeId, { readyOnly: true });
  if (!record) throw notFound('No validated export is available for preview.', 'EXPORT_NOT_FOUND');
  if (record.status !== 'ready') {
    throw conflict('The preview becomes available after validation completes.', 'EXPORT_NOT_READY');
  }
  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
    throw new AppError({
      status: 410,
      code: 'EXPORT_EXPIRED',
      message: 'This preview has expired.',
    });
  }
  const session = await TailoringSession.findById(record.sessionId);
  const stale = Boolean(session && session.editVersion !== record.sourceEditVersion);
  if (record.previewStorageKey) {
    return {
      mode: 'pdf',
      export: record.toJSON(),
      stale,
      validation: record.validation,
      note:
        'Rendered from the validated exported DOCX with LibreOffice. Use the download button to keep the original DOCX layout.',
      pdfUrl: `/api/resumes/${resumeId}/preview/pdf?exportId=${record._id.toString()}`,
    };
  }
  const docx = await (await getStorage()).read(record.storageKey);
  const preview = await buildPreview(docx);
  return {
    mode: 'html',
    export: record.toJSON(),
    stale,
    validation: record.validation,
    ...preview,
  };
}

export async function readPreviewPdf(userId, resumeId, exportId) {
  const record = exportId
    ? await getExportById(userId, resumeId, exportId)
    : await getLatestExport(userId, resumeId, { readyOnly: true });
  if (!record?.previewStorageKey) {
    throw notFound('No rendered PDF preview is available.', 'PREVIEW_NOT_AVAILABLE');
  }
  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
    throw new AppError({ status: 410, code: 'EXPORT_EXPIRED', message: 'This preview has expired.' });
  }
  return {
    record,
    buffer: await (await getStorage()).read(record.previewStorageKey),
  };
}
