import { ResumeEdit } from '../../models/ResumeEdit.js';
import { TailoringSession } from '../../models/TailoringSession.js';
import { getResumeForUser } from '../resume/resumeService.js';
import { validateReplacementText } from '../documents/docxEditor.js';
import { AppError, badRequest, conflict, notFound } from '../../utils/errors.js';

const EDIT_STATUSES = ['pending', 'approved', 'rejected', 'modified'];

export async function getEditsForSession(userId, resumeId, sessionId) {
  await getResumeForUser(userId, resumeId);
  const session = await TailoringSession.findOne({ _id: sessionId, userId, resumeId });
  if (!session) throw notFound('Tailoring session not found.', 'SESSION_NOT_FOUND');
  const edits = await ResumeEdit.find({ sessionId: session._id, userId }).sort({ order: 1 });
  return { session, edits };
}

export function reviewSummary(edits) {
  const summary = {
    total: edits.length,
    pending: 0,
    approved: 0,
    rejected: 0,
    modified: 0,
    highRisk: 0,
  };
  for (const edit of edits) {
    if (EDIT_STATUSES.includes(edit.status)) summary[edit.status] += 1;
    if (edit.risk === 'high') summary.highRisk += 1;
  }
  return summary;
}

export async function updateEditDecision({
  userId,
  resumeId,
  editId,
  action,
  text,
  expectedVersion,
}) {
  await getResumeForUser(userId, resumeId);
  const edit = await ResumeEdit.findOne({ _id: editId, userId, resumeId });
  if (!edit) throw notFound('Suggestion not found.', 'EDIT_NOT_FOUND');
  const session = await TailoringSession.findOne({
    _id: edit.sessionId,
    userId,
    resumeId,
  });
  if (!session) throw notFound('Tailoring session not found.', 'SESSION_NOT_FOUND');
  if (session.status !== 'completed') {
    throw conflict('Suggestions are not available until analysis completes.', 'SESSION_NOT_COMPLETED');
  }
  if (expectedVersion !== undefined && Number(expectedVersion) !== edit.version) {
    throw conflict(
      'This suggestion was changed in another action. Refresh the review list and try again.',
      'STALE_REVIEW_VERSION',
      { currentVersion: edit.version },
    );
  }

  const now = new Date();
  const update = { $inc: { version: 1 }, $set: { reviewedAt: now } };
  switch (action) {
    case 'accept':
      update.$set.status = 'approved';
      update.$set.finalText = null;
      update.$set.decidedAt = now;
      break;
    case 'reject':
      update.$set.status = 'rejected';
      update.$set.decidedAt = now;
      break;
    case 'modify': {
      // Validate the text as submitted first: line breaks and tabs cannot be
      // represented in a single editable paragraph and must not be silently
      // collapsed into spaces. Only ordinary repeated whitespace is normalised.
      const submitted = typeof text === 'string' ? text : '';
      const submittedError = validateReplacementText(submitted);
      if (submittedError) {
        throw badRequest(
          !submitted.trim() ? 'Enter replacement text before saving your edit.' : submittedError,
          'INVALID_EDIT_TEXT',
        );
      }
      const replacement = submitted.replace(/[^\S\r\n]+/g, ' ').trim();
      const error = validateReplacementText(replacement);
      if (error) throw badRequest(error, 'INVALID_EDIT_TEXT');
      update.$set.status = 'modified';
      update.$set.finalText = replacement;
      update.$set.decidedAt = now;
      break;
    }
    case 'reset':
      update.$set.status = 'pending';
      update.$set.finalText = null;
      update.$set.decidedAt = null;
      break;
    default:
      throw badRequest('Unknown review action.', 'INVALID_REVIEW_ACTION');
  }

  const updated = await ResumeEdit.findOneAndUpdate(
    { _id: edit._id, userId, version: edit.version },
    update,
    { new: true },
  );
  if (!updated) {
    throw conflict(
      'This suggestion was changed in another action. Refresh the review list and try again.',
      'STALE_REVIEW_VERSION',
    );
  }

  const updatedSession = await TailoringSession.findOneAndUpdate(
    { _id: session._id, userId },
    { $inc: { editVersion: 1 } },
    { new: true },
  );

  return {
    edit: updated,
    editVersion: updatedSession?.editVersion ?? session.editVersion,
  };
}

export async function bulkReview({
  userId,
  resumeId,
  sessionId,
  action,
  filters = {},
}) {
  await getResumeForUser(userId, resumeId);
  const session = await TailoringSession.findOne({ _id: sessionId, userId, resumeId });
  if (!session) throw notFound('Tailoring session not found.', 'SESSION_NOT_FOUND');
  if (session.status !== 'completed') {
    throw conflict('Suggestions are not available until analysis completes.', 'SESSION_NOT_COMPLETED');
  }

  const query = { sessionId: session._id, userId };
  if (filters.section) query.sectionName = filters.section;
  if (filters.risk) query.risk = filters.risk;

  const now = new Date();
  let update;
  if (action === 'accept_all') {
    query.status = 'pending';
    update = {
      $set: { status: 'approved', finalText: null, decidedAt: now, reviewedAt: now },
      $inc: { version: 1 },
    };
  } else if (action === 'reject_all') {
    query.status = 'pending';
    update = {
      $set: { status: 'rejected', decidedAt: now, reviewedAt: now },
      $inc: { version: 1 },
    };
  } else if (action === 'reset_all') {
    update = {
      $set: { status: 'pending', finalText: null, decidedAt: null, reviewedAt: now },
      $inc: { version: 1 },
    };
  } else {
    throw badRequest('Unknown bulk review action.', 'INVALID_BULK_ACTION');
  }

  const result = await ResumeEdit.updateMany(query, update);
  if (result.modifiedCount > 0) {
    await TailoringSession.updateOne(
      { _id: session._id, userId },
      { $inc: { editVersion: 1 } },
    );
  }

  const edits = await ResumeEdit.find({ sessionId: session._id, userId }).sort({ order: 1 });
  const latestSession = await TailoringSession.findById(session._id);
  return {
    modifiedCount: result.modifiedCount,
    edits,
    summary: reviewSummary(edits),
    editVersion: latestSession?.editVersion ?? session.editVersion,
  };
}

export async function getApprovedEdits(sessionId) {
  return ResumeEdit.find({
    sessionId,
    status: { $in: ['approved', 'modified'] },
  }).sort({ order: 1 });
}

export function assertEditableVersion(edit, expected) {
  if (Number(expected) !== edit.version) {
    throw new AppError({
      status: 409,
      code: 'STALE_REVIEW_VERSION',
      message: 'Review decisions changed while preparing the export. Refresh and try again.',
    });
  }
}
