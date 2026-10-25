import request from 'supertest';
import { createApp } from '../../src/app.js';

export const app = createApp();

export const JOB_DESCRIPTION = `Senior Full Stack Engineer

We are looking for a product-minded engineer with 4+ years of experience building web applications.

Responsibilities:
- Build and maintain React and Node.js applications
- Work with MongoDB and Docker
- Collaborate with cross-functional teams
- Improve deployment automation

Required skills: React, Node.js, MongoDB, Docker, Communication
Preferred: TypeScript, AWS
`;

export function uniqueEmail(label = 'user') {
  return `${label}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@test.example`;
}

export async function registerUser(label = 'user') {
  const agent = request.agent(app);
  const email = uniqueEmail(label);
  const response = await agent
    .post('/api/auth/register')
    .send({ name: 'Test User', email, password: 'Password123' })
    .expect(201);
  return { agent, email, user: response.body.data.user, registerResponse: response };
}

export async function uploadResume(agent, buffer, filename = 'resume.docx') {
  const response = await agent
    .post('/api/resumes')
    .attach('resume', buffer, {
      filename,
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    .expect(201);
  return response.body.data.resume;
}

export async function startAnalysis(agent, resumeId, jobDescription = JOB_DESCRIPTION) {
  const response = await agent
    .post(`/api/resumes/${resumeId}/analyze`)
    .send({ jobDescription })
    .expect(202);
  return response.body.data.session;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pollSession(agent, sessionId, { timeoutMs = 25000 } = {}) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    const response = await agent.get(`/api/sessions/${sessionId}`).expect(200);
    last = response.body.data.session;
    if (last.status === 'completed' || last.status === 'failed') return last;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for session ${sessionId}; last status ${last?.status}`);
}

export async function pollExport(agent, resumeId, exportId, { timeoutMs = 60000 } = {}) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    const response = await agent
      .get(`/api/resumes/${resumeId}/export-status`)
      .query({ exportId })
      .expect(200);
    last = response.body.data.export;
    if (last && (last.status === 'ready' || last.status === 'failed')) {
      return { record: last, stale: response.body.data.stale };
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for export ${exportId}; last status ${last?.status}`);
}
