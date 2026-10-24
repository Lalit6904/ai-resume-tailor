import {
  bulkReview,
  getEditsForSession,
  reviewSummary,
  updateEditDecision,
} from '../services/review/reviewService.js';
import { getResumeForUser } from '../services/resume/resumeService.js';
import { getLatestSessionForResume, getSessionForUser } from '../services/resume/sessionService.js';
import { asyncHandler, notFound } from '../utils/errors.js';

async function resolveSession(userId, resumeId, sessionId) {
  // Verify ownership of the resume before looking up sessions so an
  // unauthorised caller gets a consistent 404 rather than session state hints.
  await getResumeForUser(userId, resumeId);
  if (sessionId) return getSessionForUser(userId, sessionId);
  const latest = await getLatestSessionForResume(userId, resumeId);
  if (!latest) throw notFound('No tailoring session exists for this resume.', 'NO_SESSION');
  return latest;
}

export const listEdits = asyncHandler(async (req, res) => {
  const session = await resolveSession(req.user._id, req.params.id, req.query.sessionId);
  if (session.resumeId.toString() !== req.params.id) {
    throw notFound('Tailoring session not found.', 'SESSION_NOT_FOUND');
  }
  const { edits } = await getEditsForSession(req.user._id, req.params.id, session._id);
  res.json({
    success: true,
    data: {
      session: session.toJSON(),
      edits,
      summary: reviewSummary(edits),
    },
  });
});

export const patchEdit = asyncHandler(async (req, res) => {
  const result = await updateEditDecision({
    userId: req.user._id,
    resumeId: req.params.id,
    editId: req.params.editId,
    action: req.body.action,
    text: req.body.text,
    expectedVersion: req.body.version,
  });
  res.json({
    success: true,
    data: {
      edit: result.edit,
      editVersion: result.editVersion,
    },
  });
});

export const bulkReviewEdits = asyncHandler(async (req, res) => {
  const session = await resolveSession(
    req.user._id,
    req.params.id,
    req.body.sessionId,
  );
  if (session.resumeId.toString() !== req.params.id) {
    throw notFound('Tailoring session not found.', 'SESSION_NOT_FOUND');
  }
  const result = await bulkReview({
    userId: req.user._id,
    resumeId: req.params.id,
    sessionId: session._id,
    action: req.body.action,
    filters: req.body.filters || {},
  });
  res.json({
    success: true,
    data: {
      modifiedCount: result.modifiedCount,
      edits: result.edits,
      summary: result.summary,
      editVersion: result.editVersion,
    },
  });
});
