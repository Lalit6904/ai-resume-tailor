import { describe, expect, it } from 'vitest';
import { buildDocxFixture } from './helpers/docxFixture.js';
import { parseDocx } from '../src/services/documents/docxParser.js';
import {
  JOB_DESCRIPTION,
  pollExport,
  pollSession,
  registerUser,
  startAnalysis,
  uploadResume,
} from './helpers/api.js';

function binaryParser(response, callback) {
  response.setEncoding('binary');
  let data = '';
  response.on('data', (chunk) => {
    data += chunk;
  });
  response.on('end', () => callback(null, Buffer.from(data, 'binary')));
}

async function reviewState(agent, resumeId, sessionId) {
  const response = await agent
    .get(`/api/resumes/${resumeId}/edits`)
    .query({ sessionId })
    .expect(200);
  return response.body.data;
}

async function downloadDocx(agent, resumeId, exportId) {
  const response = await agent
    .get(`/api/resumes/${resumeId}/download`)
    .query({ exportId })
    .buffer(true)
    .parse(binaryParser)
    .expect(200);
  return response.body;
}

describe('analysis, review workflow and approved-only DOCX export', () => {
  it('runs the full workflow end to end', async () => {
    const { agent } = await registerUser('workflow');
    const buffer = await buildDocxFixture();
    const resume = await uploadResume(agent, buffer, 'workflow-resume.docx');

    const started = await startAnalysis(agent, resume.id, JOB_DESCRIPTION);
    expect(started.status).toBe('queued');

    const completed = await pollSession(agent, started.id);
    expect(completed.status).toBe('completed');
    expect(completed.progress).toBe(100);
    expect(completed.requirements.length).toBeGreaterThan(0);
    expect(completed.matchingSummary.total).toBe(completed.requirements.length);
    expect(completed.ai.provider).toBe('heuristic');
    expect(completed.coverage.percent).toBeGreaterThan(0);

    const initial = await reviewState(agent, resume.id, started.id);
    expect(initial.edits).toHaveLength(2);
    expect(initial.summary).toMatchObject({
      total: 2,
      pending: 2,
      approved: 0,
      rejected: 0,
      modified: 0,
    });
    expect(initial.session.id).toBe(started.id);

    const [first, second] = initial.edits;
    expect(first.proposedText).not.toBe(first.originalText);
    expect(second.proposedText).not.toBe(second.originalText);

    const noApproved = await agent
      .post(`/api/resumes/${resume.id}/export`)
      .send({ sessionId: started.id })
      .expect(422);
    expect(noApproved.body.error.code).toBe('NO_APPROVED_EDITS');

    const accepted = await agent
      .patch(`/api/resumes/${resume.id}/edits/${first.id}`)
      .send({ action: 'accept', version: first.version })
      .expect(200);
    expect(accepted.body.data.edit.status).toBe('approved');
    expect(accepted.body.data.edit.version).toBe(first.version + 1);
    expect(accepted.body.data.editVersion).toBe(2);

    const stale = await agent
      .patch(`/api/resumes/${resume.id}/edits/${first.id}`)
      .send({ action: 'reject', version: first.version })
      .expect(409);
    expect(stale.body.error.code).toBe('STALE_REVIEW_VERSION');

    const rejected = await agent
      .patch(`/api/resumes/${resume.id}/edits/${second.id}`)
      .send({ action: 'reject', version: second.version })
      .expect(200);
    expect(rejected.body.data.edit.status).toBe('rejected');
    expect(rejected.body.data.editVersion).toBe(3);

    const decided = await reviewState(agent, resume.id, started.id);
    expect(decided.summary).toMatchObject({ pending: 0, approved: 1, rejected: 1 });

    const requested = await agent
      .post(`/api/resumes/${resume.id}/export`)
      .send({ sessionId: started.id })
      .expect(202);
    const firstExportId = requested.body.data.export.id;
    expect(requested.body.data.export.status).toBe('processing');

    const { record: firstExport, stale: firstStale } = await pollExport(
      agent,
      resume.id,
      firstExportId,
    );
    expect(firstStale).toBe(false);
    expect(firstExport.status).toBe('ready');
    expect(firstExport.validation.status).toBe('passed');
    expect(firstExport.validation.checks.every((check) => check.passed)).toBe(true);
    expect(firstExport.appliedEditIds).toEqual([first.id]);
    expect(firstExport.excluded).toEqual({ pending: 0, rejected: 1 });
    expect(firstExport.sizeBytes).toBeGreaterThan(1000);
    expect(firstExport.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(firstExport.filename).toMatch(/^workflow-resume-tailored-\d{4}-\d{2}-\d{2}\.docx$/);

    const downloaded = await downloadDocx(agent, resume.id, firstExport.id);
    const exportedDoc = await parseDocx(downloaded, { skipMammothCheck: true });
    const firstTarget = exportedDoc.paragraphs.find(
      (paragraph) => paragraph.id === first.locationId,
    );
    const secondTarget = exportedDoc.paragraphs.find(
      (paragraph) => paragraph.id === second.locationId,
    );
    expect(firstTarget.text).toBe(first.proposedText);
    expect(secondTarget.text).toBe(second.originalText);
    expect(secondTarget.text).not.toBe(second.proposedText);

    const preview = await agent
      .get(`/api/resumes/${resume.id}/preview`)
      .query({ exportId: firstExport.id })
      .expect(200);
    expect(['html', 'pdf']).toContain(preview.body.data.mode);
    expect(preview.body.data.stale).toBe(false);
    if (preview.body.data.mode === 'html') {
      expect(preview.body.data.html).toContain(first.proposedText);
      expect(preview.body.data.html).not.toContain(second.proposedText);
      expect(preview.body.data.note).toMatch(/HTML content preview/i);
    }

    const acceptedSecond = await agent
      .patch(`/api/resumes/${resume.id}/edits/${second.id}`)
      .send({ action: 'accept', version: rejected.body.data.edit.version })
      .expect(200);
    expect(acceptedSecond.body.data.edit.status).toBe('approved');
    expect(acceptedSecond.body.data.editVersion).toBe(4);

    const staleStatus = await agent
      .get(`/api/resumes/${resume.id}/export-status`)
      .expect(200);
    expect(staleStatus.body.data.export.id).toBe(firstExport.id);
    expect(staleStatus.body.data.stale).toBe(true);
    expect(staleStatus.body.data.currentEditVersion).toBe(4);

    const secondRequest = await agent
      .post(`/api/resumes/${resume.id}/export`)
      .send({ sessionId: started.id })
      .expect(202);
    const { record: secondExport, stale: secondStale } = await pollExport(
      agent,
      resume.id,
      secondRequest.body.data.export.id,
    );
    expect(secondStale).toBe(false);
    expect(secondExport.status).toBe('ready');
    expect(secondExport.sourceEditVersion).toBe(4);
    expect(secondExport.appliedEditIds.sort()).toEqual([first.id, second.id].sort());
    expect(secondExport.excluded).toEqual({ pending: 0, rejected: 0 });

    const secondDownload = await downloadDocx(agent, resume.id, secondExport.id);
    const secondDoc = await parseDocx(secondDownload, { skipMammothCheck: true });
    expect(
      secondDoc.paragraphs.find((paragraph) => paragraph.id === first.locationId).text,
    ).toBe(first.proposedText);
    expect(
      secondDoc.paragraphs.find((paragraph) => paragraph.id === second.locationId).text,
    ).toBe(second.proposedText);

    const reset = await agent
      .post(`/api/resumes/${resume.id}/edits/bulk-review`)
      .send({ action: 'reset_all', sessionId: started.id })
      .expect(200);
    expect(reset.body.data.modifiedCount).toBe(2);
    expect(reset.body.data.summary.pending).toBe(2);
    expect(reset.body.data.editVersion).toBe(5);

    const acceptAll = await agent
      .post(`/api/resumes/${resume.id}/edits/bulk-review`)
      .send({ action: 'accept_all', sessionId: started.id })
      .expect(200);
    expect(acceptAll.body.data.modifiedCount).toBe(2);
    expect(acceptAll.body.data.summary.approved).toBe(2);
    expect(acceptAll.body.data.editVersion).toBe(6);

    const currentFirst = acceptAll.body.data.edits.find((edit) => edit.id === first.id);
    const modified = await agent
      .patch(`/api/resumes/${resume.id}/edits/${first.id}`)
      .send({
        action: 'modify',
        text: 'Delivered React and Node.js internal APIs for operations teams.',
        version: currentFirst.version,
      })
      .expect(200);
    expect(modified.body.data.edit.status).toBe('modified');
    expect(modified.body.data.edit.finalText).toBe(
      'Delivered React and Node.js internal APIs for operations teams.',
    );
    expect(modified.body.data.edit.effectiveText).toBe(
      'Delivered React and Node.js internal APIs for operations teams.',
    );
    expect(modified.body.data.editVersion).toBe(7);

    const afterModify = await reviewState(agent, resume.id, started.id);
    expect(afterModify.summary).toMatchObject({ approved: 1, modified: 1, pending: 0 });

    const other = await registerUser('other-user');
    const foreignSession = await other.agent
      .get(`/api/sessions/${started.id}`)
      .expect(404);
    expect(foreignSession.body.error.code).toBe('SESSION_NOT_FOUND');
    await other.agent.get(`/api/resumes/${resume.id}/export-status`).expect(404);
  });

  it('rejects review modifications with empty or unsafe text', async () => {
    const { agent } = await registerUser('edit-validation');
    const resume = await uploadResume(
      agent,
      await buildDocxFixture(),
      'edit-validation.docx',
    );
    const started = await startAnalysis(agent, resume.id);
    await pollSession(agent, started.id);
    const state = await reviewState(agent, resume.id, started.id);
    const edit = state.edits[0];

    const empty = await agent
      .patch(`/api/resumes/${resume.id}/edits/${edit.id}`)
      .send({ action: 'modify', text: '   ', version: edit.version })
      .expect(400);
    expect(empty.body.error.code).toBe('INVALID_EDIT_TEXT');

    const multiline = await agent
      .patch(`/api/resumes/${resume.id}/edits/${edit.id}`)
      .send({ action: 'modify', text: 'Line one\nLine two', version: edit.version })
      .expect(400);
    expect(multiline.body.error.code).toBe('INVALID_EDIT_TEXT');
  });
});
