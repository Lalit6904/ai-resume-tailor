import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, registerUser, uniqueEmail } from './helpers/api.js';

describe('health and authentication', () => {
  it('reports an honest health payload without authentication', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.database).toBe('connected');
    expect(response.body.data.aiProvider).toBe('heuristic');
    expect(response.body.data.renderer).toHaveProperty('previewMode');
  });

  it('rejects unauthenticated access to resume APIs', async () => {
    const response = await request(app).get('/api/resumes').expect(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('registers a user with a hardened httpOnly cookie and resolves /me', async () => {
    const { agent, email, user, registerResponse } = await registerUser('register');
    expect(user.email).toBe(email);
    expect(user).not.toHaveProperty('passwordHash');

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.data.user.email).toBe(email);

    const cookies = registerResponse.headers['set-cookie'] || [];
    expect(cookies.join(';')).toContain('art_session=');
    expect(cookies.join(';').toLowerCase()).toContain('httponly');
  });

  it('accepts a bearer token as an alternative to the cookie', async () => {
    const { agent, email, registerResponse } = await registerUser('bearer');
    const cookie = (registerResponse.headers['set-cookie'] || []).find((value) =>
      value.startsWith('art_session='),
    );
    const token = decodeURIComponent(cookie.split(';')[0].split('=')[1]);

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.data.user.email).toBe(email);
  });

  it('rejects duplicate registration with a conflict', async () => {
    const email = uniqueEmail('duplicate');
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'First', email, password: 'Password123' })
      .expect(201);

    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Second', email, password: 'Password123' })
      .expect(409);
    expect(response.body.error.code).toBe('EMAIL_IN_USE');
  });

  it('validates weak registration input', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: '', email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });

  it('rejects a wrong password without revealing whether the email exists', async () => {
    const { email } = await registerUser('wrong-password');
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'WrongPassword123' })
      .expect(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');

    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: uniqueEmail('unknown'), password: 'WrongPassword123' })
      .expect(401);
    expect(unknown.body.error.message).toBe(response.body.error.message);
  });

  it('enforces the browser origin allow-list on state-changing requests', async () => {
    const allowed = await request(app)
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:5173')
      .send({ name: 'Allowed Origin', email: uniqueEmail('allowed-origin'), password: 'Password123' })
      .expect(201);
    expect(allowed.body.success).toBe(true);

    const blocked = await request(app)
      .post('/api/auth/register')
      .set('Origin', 'https://evil.example')
      .send({ name: 'Blocked Origin', email: uniqueEmail('blocked-origin'), password: 'Password123' })
      .expect(403);
    expect(blocked.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('logs in and clears the session on logout', async () => {
    const { agent, email } = await registerUser('logout');
    const loginAgent = request.agent(app);
    await loginAgent
      .post('/api/auth/login')
      .send({ email, password: 'Password123' })
      .expect(200);
    await loginAgent.get('/api/auth/me').expect(200);
    await loginAgent.post('/api/auth/logout').expect(200);
    await loginAgent.get('/api/auth/me').expect(401);
  });
});
