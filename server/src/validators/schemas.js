import { z } from 'zod';

const objectId = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, 'Invalid identifier');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .max(128, 'Password is too long.')
    .regex(/[A-Za-z]/, 'Include at least one letter.')
    .regex(/[0-9]/, 'Include at least one number.'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
  password: z.string().min(1, 'Enter your password.').max(128),
});

export const analyzeSchema = z.object({
  jobDescription: z
    .string()
    .trim()
    .min(50, 'Paste a complete job description (at least 50 characters).')
    .max(50000, 'The job description is too long. Limit it to 50,000 characters.'),
});

export const updateEditSchema = z.object({
  action: z.enum(['accept', 'reject', 'modify', 'reset']),
  text: z.string().max(3000).optional(),
  version: z.coerce.number().int().min(1).optional(),
});

export const bulkReviewSchema = z.object({
  action: z.enum(['accept_all', 'reject_all', 'reset_all']),
  sessionId: objectId.optional(),
  filters: z
    .object({
      section: z.string().trim().max(120).optional(),
      risk: z.enum(['low', 'medium', 'high']).optional(),
    })
    .optional()
    .default({}),
});

export const exportRequestSchema = z.object({
  sessionId: objectId.optional(),
});

export const exportQuerySchema = z.object({
  exportId: objectId.optional(),
  sessionId: objectId.optional(),
});

export const previewQuerySchema = z.object({
  exportId: objectId.optional(),
});

export const listQuerySchema = z.object({
  sessionId: objectId.optional(),
});
