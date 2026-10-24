import {
  getExportById,
  getFinalPreview,
  getLatestExport,
  readExportFile,
  readPreviewPdf,
  requestExport,
} from '../services/review/exportService.js';
import { TailoringSession } from '../models/TailoringSession.js';
import { asyncHandler } from '../utils/errors.js';

export const createExport = asyncHandler(async (req, res) => {
  const record = await requestExport({
    userId: req.user._id,
    resumeId: req.params.id,
    sessionId: req.body.sessionId,
  });
  res.status(202).json({ success: true, data: { export: record.toJSON() } });
});

export const exportStatus = asyncHandler(async (req, res) => {
  const record = req.query.exportId
    ? await getExportById(req.user._id, req.params.id, req.query.exportId)
    : await getLatestExport(req.user._id, req.params.id);
  if (!record) {
    return res.json({ success: true, data: { export: null, stale: false } });
  }
  const session = await TailoringSession.findById(record.sessionId).select('editVersion');
  res.json({
    success: true,
    data: {
      export: record.toJSON(),
      stale: Boolean(session && session.editVersion !== record.sourceEditVersion),
      currentEditVersion: session?.editVersion ?? null,
    },
  });
});

export const downloadExport = asyncHandler(async (req, res) => {
  const { record, buffer } = await readExportFile(
    req.user._id,
    req.params.id,
    req.query.exportId,
  );
  const ascii = record.filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(record.filename)}`,
  );
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buffer);
});

export const preview = asyncHandler(async (req, res) => {
  const data = await getFinalPreview(req.user._id, req.params.id, req.query.exportId);
  res.json({ success: true, data });
});

export const previewPdf = asyncHandler(async (req, res) => {
  const { buffer } = await readPreviewPdf(
    req.user._id,
    req.params.id,
    req.query.exportId,
  );
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="resume-preview.pdf"');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buffer);
});
