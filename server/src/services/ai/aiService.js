import { config } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { callAiJson } from './llmClient.js';
import {
  analyzeJobDescriptionHeuristic,
  generateHeuristicSuggestions,
} from './heuristicProvider.js';
import { buildJobAnalysisPrompt, buildRepairPrompt, buildSuggestionPrompt } from './prompts.js';
import {
  buildRequirements,
  matchRequirements,
  summarizeMatching,
} from './requirements.js';
import {
  heuristicJobAnalysisSchema,
  jobAnalysisSchema,
  normalizeJobAnalysis,
  suggestionResponseSchema,
} from './schemas.js';
import { validateSuggestions } from './suggestionValidator.js';
import { toAiParagraphs } from '../documents/docxParser.js';

function providerIdentity() {
  if (config.ai.provider === 'heuristic') {
    return { provider: 'heuristic', model: 'local-deterministic-v1' };
  }
  return { provider: config.ai.provider, model: config.ai.model };
}

async function getJobAnalysis(jobDescription) {
  if (config.ai.provider === 'heuristic') {
    const raw = analyzeJobDescriptionHeuristic(jobDescription);
    return normalizeJobAnalysis(heuristicJobAnalysisSchema.parse(raw));
  }
  const { system, user } = buildJobAnalysisPrompt(jobDescription);
  const response = await callAiJson({ system, user, purpose: 'job-analysis', temperature: 0.1 });
  const parsed = jobAnalysisSchema.safeParse(response);
  if (!parsed.success) {
    logger.warn('AI job analysis failed schema validation', {
      issues: parsed.error.issues.slice(0, 5).map((issue) => issue.path.join('.')),
    });
    throw new AppError({
      status: 502,
      code: 'AI_INVALID_OUTPUT',
      message: 'The AI returned an invalid job analysis. Please retry.',
    });
  }
  return normalizeJobAnalysis(parsed.data);
}

async function getSuggestions({ jobDescription, jobAnalysis, requirements, parsed }) {
  const identity = providerIdentity();
  if (config.ai.provider === 'heuristic') {
    const rawSuggestions = generateHeuristicSuggestions({ parsed, requirements });
    return {
      rawSuggestions,
      notes: [
        'Local heuristic mode: suggestions are limited to safe reordering and equivalent verb changes. Configure an AI provider for deeper tailoring.',
      ],
      identity,
    };
  }

  const truncatedJd =
    jobDescription.length > config.ai.maxJdChars
      ? jobDescription.slice(0, config.ai.maxJdChars)
      : jobDescription;
  const resumeParagraphs = toAiParagraphs(parsed, {
    maxCharacters: config.ai.maxResumeChars,
  });
  const { system, user } = buildSuggestionPrompt({
    jobDescription: truncatedJd,
    jobAnalysis,
    requirements,
    resumeParagraphs,
  });
  let response = await callAiJson({
    system,
    user,
    purpose: 'suggestions',
    temperature: 0.2,
  });
  let validated = suggestionResponseSchema.safeParse(response);

  if (!validated.success) {
    logger.warn('AI suggestion output failed schema validation; attempting one repair', {
      issues: validated.error.issues.slice(0, 5).map((issue) => issue.path.join('.')),
    });
    const repair = buildRepairPrompt({
      invalidOutput: JSON.stringify(response),
      validationMessage: JSON.stringify(
        validated.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      ),
    });
    response = await callAiJson({
      system: repair.system,
      user: repair.user,
      purpose: 'suggestions-repair',
      temperature: 0,
    });
    validated = suggestionResponseSchema.safeParse(response);
  }

  if (!validated.success) {
    throw new AppError({
      status: 502,
      code: 'AI_INVALID_OUTPUT',
      message: 'The AI returned suggestions in an invalid format. Please retry.',
    });
  }

  return {
    rawSuggestions: validated.data.suggestions,
    notes: validated.data.notes,
    identity,
    resumeCharactersSent: resumeParagraphs.reduce((sum, p) => sum + p.text.length, 0),
  };
}

/**
 * Run the full tailoring pipeline for a parsed resume. Never persists data;
 * the caller stores the returned analysis, requirements, and suggestions.
 */
export async function runTailoringAnalysis({ parsed, jobDescription, onStage = () => {} }) {
  const warnings = [];
  if (jobDescription.length > config.ai.maxJdChars) {
    warnings.push(
      `The job description was truncated to ${config.ai.maxJdChars.toLocaleString()} characters for analysis. The full text remains stored with this session.`,
    );
  }
  onStage('analyzing_job', 20);
  const jobAnalysis = await getJobAnalysis(jobDescription.slice(0, config.ai.maxJdChars));
  const requirements = matchRequirements(buildRequirements(jobAnalysis), parsed);
  const matchingSummary = summarizeMatching(requirements);
  const identity = providerIdentity();

  onStage('analyzing_resume', 50);
  const suggestionResult = await getSuggestions({
    jobDescription,
    jobAnalysis,
    requirements,
    parsed,
  });

  onStage('generating_suggestions', 70);
  const { accepted, discarded } = validateSuggestions({
    rawSuggestions: suggestionResult.rawSuggestions,
    parsed,
    requirements,
    provider: suggestionResult.identity.provider,
    model: suggestionResult.identity.model,
  });

  if (suggestionResult.notes?.length) {
    warnings.push(...suggestionResult.notes.slice(0, 8));
  }
  if (config.ai.provider === 'heuristic') {
    warnings.push(
      'AI_PROVIDER=heuristic is active. No external AI service was called. The local analyzer only reorders verified skills and replaces weak opening verbs.',
    );
  }
  if (discarded.length > 0) {
    warnings.push(
      `${discarded.length} generated suggestion${discarded.length === 1 ? '' : 's'} failed evidence or safety validation and ${discarded.length === 1 ? 'was' : 'were'} discarded.`,
    );
  }

  logger.info('Tailoring analysis completed', {
    provider: identity.provider,
    model: identity.model,
    requirements: requirements.length,
    suggestions: accepted.length,
    discarded: discarded.length,
    demonstrated: matchingSummary.demonstrated,
    partial: matchingSummary.partiallyDemonstrated,
  });

  return {
    jobAnalysis,
    requirements,
    matchingSummary,
    suggestions: accepted,
    discarded,
    ai: {
      ...identity,
      warnings,
    },
  };
}
