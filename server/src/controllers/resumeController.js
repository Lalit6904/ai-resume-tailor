import { createResumeFromUpload, deleteResumeAndArtifacts, getResumeForUser, listResumesForUser } from '../services/resume/resumeService.js';
import { getLatestSessionForResume } from '../services/resume/sessionService.js';
import { getLatestExport } from '../services/review/exportService.js';
import { asyncHandler, badRequest } from '../utils/errors.js';

export const uploadResume = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw badRequest('Choose a .docx resume to upload.', 'FILE_REQUIRED');
  }
  const resume = await createResumeFromUpload({ userId: req.user._id, file: req.file });
  res.status(201).json({
    success: true,
    data: { resume: resume.toDetailJSON() },
  });
});

export const listResumes = asyncHandler(async (req, res) => {
  const resumes = await listResumesForUser(req.user._id);
  res.json({ success: true, data: { resumes } });
});

export const getResume = asyncHandler(async (req, res) => {
  const resume = await getResumeForUser(req.user._id, req.params.id);
  const [session, latestExport] = await Promise.all([
    getLatestSessionForResume(req.user._id, resume._id),
    getLatestExport(req.user._id, resume._id),
  ]);
  res.json({
    success: true,
    data: {
      resume: resume.toDetailJSON(),
      latestSession: session
        ? {
            id: session._id.toString(),
            jobTitle: session.jobAnalysis?.jobTitle || null,
            status: session.status,
            stage: session.stage,
            progress: session.progress,
            suggestionCount: session.suggestionCount,
            editVersion: session.editVersion,
            error: session.error?.code ? session.error : null,
            createdAt: session.createdAt,
          }
        : null,
      latestExport: latestExport ? latestExport.toJSON() : null,
    },
  });
});

export const deleteResume = asyncHandler(async (req, res) => {
  await deleteResumeAndArtifacts(req.user._id, req.params.id);
  res.json({ success: true, data: { deleted: true } });
});
