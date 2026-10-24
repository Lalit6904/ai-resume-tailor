import { z } from 'zod';

const shortString = z.string().trim().max(300);
const listOf = (max, item = z.string().trim().min(1).max(300)) =>
  z.array(item).max(max).default([]);

export const jobAnalysisSchema = z.object({
  jobTitle: z.string().trim().max(160).nullable().optional(),
  seniority: z.string().trim().max(80).nullable().optional(),
  requiredSkills: listOf(30),
  preferredSkills: listOf(30),
  responsibilities: listOf(20, z.string().trim().min(1).max(500)),
  qualifications: listOf(20, z.string().trim().min(1).max(500)),
  tools: listOf(30),
  terminology: listOf(30),
  experienceRequirements: z.string().trim().max(500).nullable().optional(),
});

export const rawSuggestionSchema = z.object({
  locationId: z.string().trim().min(1).max(120),
  originalText: z.string().min(1).max(4000),
  proposedText: z.string().min(1).max(4000),
  reason: z.string().trim().min(1).max(600),
  requirementIds: z.array(z.string().trim().max(40)).max(12).default([]),
  evidence: z.string().trim().max(800).default(''),
  risk: z.enum(['low', 'medium', 'high']).default('medium'),
});

export const suggestionResponseSchema = z.object({
  suggestions: z.array(rawSuggestionSchema).max(30).default([]),
  notes: z.array(shortString).max(10).default([]),
});

export const heuristicJobAnalysisSchema = jobAnalysisSchema;

export function normalizeJobAnalysis(value) {
  return {
    jobTitle: value.jobTitle?.trim() || null,
    seniority: value.seniority?.trim() || null,
    requiredSkills: dedupeStrings(value.requiredSkills),
    preferredSkills: dedupeStrings(value.preferredSkills),
    responsibilities: dedupeStrings(value.responsibilities),
    qualifications: dedupeStrings(value.qualifications),
    tools: dedupeStrings(value.tools),
    terminology: dedupeStrings(value.terminology),
    experienceRequirements: value.experienceRequirements?.trim() || null,
  };
}

function dedupeStrings(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const trimmed = String(value).trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
