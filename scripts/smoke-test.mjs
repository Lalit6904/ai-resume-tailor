#!/usr/bin/env node
/**
 * Live smoke test against a running AI Resume Tailor server.
 *
 * It exercises the real HTTP surface: registration, DOCX upload and parsing,
 * job queue polling, suggestion review, approved-only export, DOCX download,
 * preview fallback, and SPA static serving. It creates a temporary user and
 * deletes the resume at the end.
 *
 * Usage:
 *   npm start                 # in one terminal (server on :4000)
 *   node scripts/smoke-test.mjs
 *
 * Optional environment:
 *   SMOKE_BASE_URL=http://localhost:4000
 */
import assert from 'node:assert/strict';
import { buildDocxFixture } from '../server/tests/helpers/docxFixture.js';
import { parseDocx } from '../server/src/services/documents/docxParser.js';

const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
const JOB_DESCRIPTION = `Senior Full Stack Engineer

We are looking for a product-minded engineer with 4+ years of experience building web applications.

Responsibilities:
- Build and maintain React and Node.js applications
- Work with MongoDB and Docker
- Collaborate with cross-functional teams
- Improve deployment automation

Required skills: React, Node.js, MongoDB, Docker, Communication
Preferred: TypeScript, AWS
`;

let cookie = '';
const checks = [];

function check(name, condition, detail = '') {
  if (!condition) throw new Error(`FAILED: ${name}${detail ? ` (${detail})` : ''}`);
  checks.push(name);
  console.log(`  ok  ${name}`);
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  // Simulate a browser so the CORS/origin allow-list is exercised.
  headers.set('Origin', ORIGIN);
  if (cookie) headers.set('Cookie', cookie);
  const response = await fetch(`${BASE}${path}`, { ...options, headers, redirect: 'manual' });
  const setCookie = response.headers.getSetCookie?.() || [];
  const sessionCookie = setCookie.find((value) => value.startsWith('art_session='));
  if (sessionCookie) cookie = sessionCookie.split(';')[0];
  return response;
}

async function json(response) {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status} ${body?.error?.code}: ${body?.error?.message}`);
  }
  return body;
}

async function poll(path, payloadKey, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const body = await json(await request(path));
    const value = payloadKey(body);
    if (value?.status === 'completed' || value?.status === 'ready') return value;
    if (value?.status === 'failed') throw new Error(`Job failed: ${JSON.stringify(value.error)}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out polling ${path}`);
}

const email = `smoke-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@test.example`;

try {
  console.log(`Live smoke test against ${BASE}`);

  const health = await json(await request('/api/health'));
  check('health endpoint responds', health.data.database === 'connected');
  check(
    'preview mode is reported honestly',
    ['html', 'pdf'].includes(health.data.renderer?.previewMode),
    health.data.renderer?.previewMode,
  );

  const register = await json(
    await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Smoke Test', email, password: 'Password123' }),
    }),
  );
  check('registers a user and sets a session cookie', Boolean(cookie));
  check('returns the authenticated user', register.data.user.email === email);

  const fixture = await buildDocxFixture();
  const form = new FormData();
  form.append(
    'resume',
    new Blob([fixture], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
    'smoke-resume.docx',
  );
  const uploaded = await json(await request('/api/resumes', { method: 'POST', body: form }));
  const resume = uploaded.data.resume;
  check('uploads and parses the DOCX', resume.parseStatus === 'ready');
  check('preserves package structure metadata', resume.document.counts.tables === 1);
  check('reports images and headers without exposing XML', resume.document.counts.images === 1);
  check(
    'keeps internal run data out of the API',
    !JSON.stringify(resume).includes('textRuns'),
  );

  const started = await json(
    await request(`/api/resumes/${resume.id}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobDescription: JOB_DESCRIPTION }),
    }),
  );
  check('queues an analysis job', started.data.session.status === 'queued');

  const session = await poll(
    `/api/sessions/${started.data.session.id}`,
    (body) => body.data.session,
  );
  check('analysis completes with honest progress', session.progress === 100);
  check('extracts job requirements', session.requirements.length > 0);
  check('labels the local heuristic provider', session.ai.provider === 'heuristic');

  const state = await json(
    await request(`/api/resumes/${resume.id}/edits?sessionId=${session.id}`),
  );
  const edits = state.data.edits;
  check('returns reviewable suggestions', edits.length > 0);

  const target = edits[0];
  const approved = await json(
    await request(`/api/resumes/${resume.id}/edits/${target.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept', version: target.version }),
    }),
  );
  check('accepts a suggestion with optimistic concurrency', approved.data.edit.status === 'approved');

  const exportRequested = await json(
    await request(`/api/resumes/${resume.id}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id }),
    }),
  );
  const exportId = exportRequested.data.export.id;
  const exportRecord = await poll(
    `/api/resumes/${resume.id}/export-status?exportId=${exportId}`,
    (body) => body.data.export,
  );
  check('export completes and passes validation', exportRecord.validation.status === 'passed');
  check('applies only the approved edit', exportRecord.appliedEditIds.length === 1);

  const download = await request(`/api/resumes/${resume.id}/download?exportId=${exportId}`);
  check('downloads the exported DOCX', download.ok);
  const downloadedBuffer = Buffer.from(await download.arrayBuffer());
  check(
    'download is a valid DOCX package',
    downloadedBuffer.subarray(0, 2).toString() === 'PK',
  );
  const exported = await parseDocx(downloadedBuffer, { skipMammothCheck: true });
  const updated = exported.paragraphs.find((p) => p.id === target.locationId);
  check('approved text is present at the original location', updated?.text === target.proposedText);
  check(
    'rejected paragraphs remain unchanged in the export',
    exported.paragraphs.find((p) => p.id === edits[1].locationId)?.text === edits[1].originalText,
  );

  const preview = await json(
    await request(`/api/resumes/${resume.id}/preview?exportId=${exportId}`),
  );
  check('returns a preview with an honest mode', ['html', 'pdf'].includes(preview.data.mode));
  if (preview.data.mode === 'html') {
    check('HTML preview reflects approved text', preview.data.html.includes(target.proposedText));
    check('HTML preview explains it is not a page render', /HTML content preview/i.test(preview.data.note));
  }

  const spa = await request('/');
  const spaHtml = await spa.text();
  check('serves the built SPA shell', spa.ok && spaHtml.includes('<div id="root">'));
  const deepLink = await request('/dashboard');
  check('serves SPA routes via history fallback', deepLink.ok);

  await request(`/api/resumes/${resume.id}`, { method: 'DELETE' });
  const gone = await request(`/api/resumes/${resume.id}`);
  check('deletes resume artifacts and enforces ownership', gone.status === 404);

  console.log(`\nPASS: ${checks.length} live checks succeeded.`);
} catch (error) {
  console.error(`\nFAIL: ${error.message}`);
  process.exitCode = 1;
}
