import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildDocxFixture } from './helpers/docxFixture.js';
import {
  app,
  registerUser,
  uploadResume,
} from './helpers/api.js';

describe('resume upload, parsing and ownership', () => {
  it('uploads a DOCX, returns parsed metadata, and keeps internal XML out of the API', async () => {
    const { agent } = await registerUser('upload');
    const buffer = await buildDocxFixture();
    const resume = await uploadResume(agent, buffer, 'Jordan Lee Resume.docx');

    expect(resume.originalFilename).toBe('Jordan Lee Resume.docx');
    expect(resume.parseStatus).toBe('ready');
    expect(resume.document.paragraphCount).toBeGreaterThan(10);
    expect(resume.document.editableCount).toBeGreaterThan(0);
    expect(resume.document.counts.tables).toBe(1);
    expect(resume.document.counts.images).toBe(1);
    expect(resume.document.counts.headers).toBe(1);
    expect(resume.document.counts.footers).toBe(1);
    expect(resume.document.counts.hyperlinks).toBe(1);
    expect(resume.document.counts.lists).toBeGreaterThan(0);
    expect(resume.paragraphs.some((paragraph) => paragraph.kind === 'header')).toBe(true);
    expect(JSON.stringify(resume)).not.toContain('w:document');
    expect(JSON.stringify(resume)).not.toContain('textRuns');

    const detail = await agent.get(`/api/resumes/${resume.id}`).expect(200);
    expect(detail.body.data.resume.originalFilename).toBe('Jordan Lee Resume.docx');
    expect(detail.body.data.latestSession).toBeNull();

    const list = await agent.get('/api/resumes').expect(200);
    expect(list.body.data.resumes).toHaveLength(1);
    expect(list.body.data.resumes[0].id).toBe(resume.id);
  });

  it('rejects unsupported file types and corrupt DOCX packages', async () => {
    const { agent } = await registerUser('bad-upload');

    const pdf = await agent
      .post('/api/resumes')
      .attach('resume', Buffer.from('%PDF-1.7 fake'), {
        filename: 'resume.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    expect(pdf.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(pdf.body.error.message).toMatch(/Only \.docx/i);

    const legacy = await agent
      .post('/api/resumes')
      .attach('resume', Buffer.from('legacy word file'), {
        filename: 'resume.doc',
        contentType: 'application/msword',
      })
      .expect(400);
    expect(legacy.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');

    const corrupt = await agent
      .post('/api/resumes')
      .attach('resume', Buffer.from('this is not a zip package'), {
        filename: 'resume.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      .expect(400);
    expect(corrupt.body.error.code).toBe('INVALID_DOCX');
  });

  it('requires a file', async () => {
    const { agent } = await registerUser('missing-file');
    const response = await agent.post('/api/resumes').expect(400);
    expect(response.body.error.code).toBe('FILE_REQUIRED');
  });

  it('enforces ownership on reads, edits and deletes', async () => {
    const owner = await registerUser('owner');
    const attacker = await registerUser('attacker');
    const buffer = await buildDocxFixture();
    const resume = await uploadResume(owner.agent, buffer, 'private.docx');

    const read = await attacker.agent.get(`/api/resumes/${resume.id}`).expect(404);
    expect(read.body.error.code).toBe('RESUME_NOT_FOUND');

    const edits = await attacker.agent.get(`/api/resumes/${resume.id}/edits`).expect(404);
    expect(edits.body.error.code).toBe('RESUME_NOT_FOUND');

    const download = await attacker.agent
      .get(`/api/resumes/${resume.id}/download`)
      .expect(404);
    expect(download.body.error.code).toBe('RESUME_NOT_FOUND');

    await attacker.agent.delete(`/api/resumes/${resume.id}`).expect(404);
    await owner.agent.get(`/api/resumes/${resume.id}`).expect(200);

    const attackerList = await attacker.agent.get('/api/resumes').expect(200);
    expect(attackerList.body.data.resumes).toHaveLength(0);
  });

  it('deletes the resume and its stored artifacts', async () => {
    const { agent } = await registerUser('delete');
    const buffer = await buildDocxFixture();
    const resume = await uploadResume(agent, buffer, 'delete-me.docx');

    await agent.delete(`/api/resumes/${resume.id}`).expect(200);
    const gone = await agent.get(`/api/resumes/${resume.id}`).expect(404);
    expect(gone.body.error.code).toBe('RESUME_NOT_FOUND');

    const missing = await agent
      .get(`/api/resumes/${resume.id}/preview`)
      .expect(404);
    expect(missing.body.error.code).toBe('RESUME_NOT_FOUND');
  });

  it('returns a clear validation error for short job descriptions', async () => {
    const { agent } = await registerUser('short-jd');
    const buffer = await buildDocxFixture();
    const resume = await uploadResume(agent, buffer, 'short-jd.docx');
    const response = await agent
      .post(`/api/resumes/${resume.id}/analyze`)
      .send({ jobDescription: 'too short' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details[0].field).toBe('jobDescription');
  });
});
