import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/errors.js';
import { conflict, unauthorized } from '../utils/errors.js';
import { clearAuthCookie, setAuthCookie, signToken } from '../middleware/auth.js';

const BCRYPT_ROUNDS = 12;
// Used to keep login timing similar for unknown emails.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-user-password', BCRYPT_ROUNDS);

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const existing = await User.findOne({ email }).select('_id');
  if (existing) {
    throw conflict('An account with that email already exists.', 'EMAIL_IN_USE');
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({ name, email, passwordHash });
  const token = signToken(user);
  setAuthCookie(res, token);
  res.status(201).json({
    success: true,
    data: { user: user.toSafeJSON() },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  const hash = user?.passwordHash || DUMMY_HASH;
  const valid = await bcrypt.compare(password, hash);
  if (!user || !valid || user.status !== 'active') {
    throw unauthorized('Email or password is incorrect.', 'INVALID_CREDENTIALS');
  }
  user.lastLoginAt = new Date();
  await user.save();
  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ success: true, data: { user: user.toSafeJSON() } });
});

export const logout = asyncHandler(async (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, data: { loggedOut: true } });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user.toSafeJSON() } });
});
