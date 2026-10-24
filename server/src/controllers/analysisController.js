import {
  analysisPayload,
  createTailoringSession,
  getLatestSessionForResume,
  getSessionForUser,
  listSessionsForResume,
  retryAnalysisSession,
} from '../services/resume/sessionService.js';
import { getResumeForUser } from '../services/resume/resumeService.js';
import { asyncHandler, notFound } from '../utils/errors.js';

export const startAnalysis = asyncHandler(async (req, res) => {
  const { jobDescription } = req.body;
  await getResumeForUser(req.user._id, req.params.id);
  const session = await createTailoringSession({
    userId: req.user._id,
    resumeId: req.params.id,
    jobDescription,
  });
  res.status(202).json({
    success: true,
    data: { session: analysisPayload(session) },
  });
});

export const getAnalysis = asyncHandler(async (req, res) => {
  await getResumeForUser(req.user._id, req.params.id);
  const session = await getLatestSessionForResume(req.user._id, req.params.id);
  if (!session) {
    throw notFound('No analysis has been started for this resume.', 'NO_SESSION');
  }
  res.json({ success: true, data: { session: analysisPayload(session) } });
});

export const getSession = asyncHandler(async (req, res) => {
  const session = await getSessionForUser(req.user._id, req.params.sessionId);
  res.json({
    success: true,
    data: {
      session: analysisPayload(session),
      resumeId: session.resumeId.toString(),
    },
  });
});

export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await listSessionsForResume(req.user._id, req.params.id);
  res.json({ success: true, data: { sessions } });
});

export const retrySession = asyncHandler(async (req, res) => {
  const session = await retryAnalysisSession(req.user._id, req.params.sessionId);
  res.status(202).json({
    success: true,
    data: { session: analysisPayload(session) },
  });
});
