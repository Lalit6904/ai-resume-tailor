import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { ResumeExport } from '../src/models/ResumeExport.js';
import { TailoringSession } from '../src/models/TailoringSession.js';
import { recoverInterruptedJobs } from '../src/services/resume/sessionService.js';

describe('startup recovery for in-process jobs', () => {
  it('marks interrupted analyses and exports as failed instead of leaving them processing', async () => {
    const userId = new mongoose.Types.ObjectId();
    const resumeId = new mongoose.Types.ObjectId();

    const analyzing = await TailoringSession.create({
      userId,
      resumeId,
      label: 'Interrupted role',
      jobDescription: 'A job description that was being analyzed when the process stopped.',
      jobDescriptionHash: 'a'.repeat(64),
      status: 'analyzing',
      stage: 'analyzing_resume',
      progress: 40,
    });
    const queued = await TailoringSession.create({
      userId,
      resumeId,
      label: 'Queued role',
      jobDescription: 'A job description that was queued when the process stopped.',
      jobDescriptionHash: 'b'.repeat(64),
      status: 'queued',
      stage: 'queued',
      progress: 0,
    });
    const exportRecord = await ResumeExport.create({
      sessionId: analyzing._id,
      resumeId,
      userId,
      filename: 'interrupted-tailored.docx',
      sourceEditVersion: 1,
      status: 'processing',
    });

    await recoverInterruptedJobs();

    const recoveredAnalyzing = await TailoringSession.findById(analyzing._id);
    expect(recoveredAnalyzing.status).toBe('failed');
    expect(recoveredAnalyzing.stage).toBe('failed');
    expect(recoveredAnalyzing.error).toMatchObject({
      code: 'INTERRUPTED',
      recoverable: true,
      retryable: true,
    });

    const recoveredQueued = await TailoringSession.findById(queued._id);
    expect(recoveredQueued.status).toBe('failed');
    expect(recoveredQueued.error.code).toBe('INTERRUPTED');

    const recoveredExport = await ResumeExport.findById(exportRecord._id);
    expect(recoveredExport.status).toBe('failed');
    expect(recoveredExport.error.code).toBe('EXPORT_INTERRUPTED');
    expect(recoveredExport.error.message).toMatch(/original resume is unchanged/i);
  });
});
