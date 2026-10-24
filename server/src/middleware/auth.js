import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../models/User.js';
import { unauthorized } from '../utils/errors.js';

export const AUTH_COOKIE = 'art_session';

export function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, issuer: 'ai-resume-tailor' },
  );
}

export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
  });
}

function extractToken(req) {
  if (req.cookies?.[AUTH_COOKIE]) return req.cookies[AUTH_COOKIE];
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

export async function loadUser(req) {
  const token = extractToken(req);
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { issuer: 'ai-resume-tailor' });
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
  }
  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') {
    throw unauthorized('This account is unavailable.', 'ACCOUNT_UNAVAILABLE');
  }
  return user;
}

export async function requireAuth(req, res, next) {
  try {
    req.user = await loadUser(req);
    next();
  } catch (error) {
    next(error);
  }
}

export function optionalAuth(req, res, next) {
  if (!extractToken(req)) return next();
  loadUser(req)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(next);
}
