import { validateReplacementText } from '../documents/docxEditor.js';
import { normalizeText, significantTokens } from './requirements.js';
import { rawSuggestionSchema } from './schemas.js';

const DEGREE_OR_CERT_RE =
  /\b(ph\.?\s?d|doctorate|master'?s?|bachelor'?s?|mba|b\.?\s?tech|m\.?\s?tech|b\.?\s?sc|m\.?\s?sc|certified|certification|pmp|scrum master|aws certified|azure certified)\b/i;
const GUARANTEE_RE = /\b(guaranteed|guarantee|100\s?%|ats[- ]proof|beat the ats|ats[- ]optimized)\b/i;
const CONTACT_RE = /(@|\bhttps?:\/\/|\bwww\.|linkedin\.com|\+?\d[\d\s().-]{8,}\d)/i;
const MAX_ACCEPTED = 20;

function canonicalWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function numbersIn(value) {
  return new Set(String(value).match(/\d+(?:[.,]\d+)?/g) || []);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(text, term) {
  const normalizedText = ` ${normalizeText(text)} `;
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (normalizedText.includes(` ${normalizedTerm} `)) return true;
  const escaped = escapeRegExp(term.trim());
  if (!escaped) return false;
  const needsStart = /^[\p{L}\p{N}]/u.test(term.trim());
  const needsEnd = /[\p{L}\p{N}]$/u.test(term.trim());
  const regex = new RegExp(
    `${needsStart ? '(?<![\\p{L}\\p{N}])' : ''}${escaped}${needsEnd ? '(?![\\p{L}\\p{N}])' : ''}`,
    'iu',
  );
  return regex.test(text);
}

function evidenceSupported(evidence, corpusTokens) {
  const tokens = significantTokens(evidence).slice(0, 30);
  if (tokens.length === 0) return false;
  const present = tokens.filter((token) => corpusTokens.has(token)).length;
  return present / tokens.length >= 0.5;
}

/**
 * Validate AI suggestions against the actual document before they are shown.
 * Anything that cannot be verified is discarded rather than displayed.
 */
export function validateSuggestions({
  rawSuggestions,
  parsed,
  requirements,
  provider,
  model,
}) {
  const paragraphs = new Map(parsed.paragraphs.map((p) => [p.id, p]));
  const accepted = [];
  const discarded = [];
  const seenLocations = new Set();
  const corpusTokens = new Set(significantTokens(parsed.allText));
  const requirementById = new Map(requirements.map((r) => [r.id, r]));
  const requirementTerms = requirements
    .filter((r) => r.category === 'skill' || r.category === 'tool')
    .map((r) => ({ ...r, normalized: normalizeText(r.text) }))
    .filter((r) => r.normalized.length > 0);

  const discard = (locationId, code, reason) => {
    discarded.push({ locationId: String(locationId || '').slice(0, 120), code, reason });
  };

  for (const raw of rawSuggestions) {
    const parsedSuggestion = rawSuggestionSchema.safeParse(raw);
    if (!parsedSuggestion.success) {
      discard(raw?.locationId, 'invalid_shape', 'Suggestion did not match the required structure.');
      continue;
    }
    const suggestion = parsedSuggestion.data;
    if (accepted.length >= MAX_ACCEPTED) {
      discard(suggestion.locationId, 'limit_reached', 'Additional suggestions were omitted to keep review manageable.');
      continue;
    }
    if (seenLocations.has(suggestion.locationId)) {
      discard(suggestion.locationId, 'duplicate_location', 'Only one change per paragraph is allowed to prevent conflicts.');
      continue;
    }

    const paragraph = paragraphs.get(suggestion.locationId);
    if (!paragraph) {
      discard(suggestion.locationId, 'unknown_target', 'Suggestion targeted a paragraph that is not in the document.');
      continue;
    }
    if (!paragraph.editable) {
      discard(
        suggestion.locationId,
        'read_only_target',
        'Suggestion targeted a paragraph that must remain unchanged for formatting or link safety.',
      );
      continue;
    }
    if (canonicalWhitespace(paragraph.text) !== canonicalWhitespace(suggestion.originalText)) {
      discard(
        suggestion.locationId,
        'original_text_mismatch',
        'Suggestion did not quote the current paragraph text exactly and was discarded.',
      );
      continue;
    }

    // Reject structural characters (line breaks, tabs, control chars) before
    // collapsing whitespace, otherwise an invalid proposal would silently pass.
    const rawReplacementError = validateReplacementText(suggestion.proposedText);
    if (rawReplacementError) {
      discard(suggestion.locationId, 'invalid_replacement', rawReplacementError);
      continue;
    }
    const proposed = suggestion.proposedText.replace(/[^\S\r\n]+/g, ' ').trim();
    const replacementError = validateReplacementText(proposed);
    if (replacementError) {
      discard(suggestion.locationId, 'invalid_replacement', replacementError);
      continue;
    }
    if (proposed === paragraph.text) {
      discard(suggestion.locationId, 'no_change', 'Suggestion did not change the paragraph.');
      continue;
    }

    const originalNumbers = numbersIn(paragraph.text);
    const newNumbers = [...numbersIn(proposed)].filter((number) => !originalNumbers.has(number));
    if (newNumbers.length > 0) {
      discard(
        suggestion.locationId,
        'fabricated_number',
        'Suggestion introduced a number or date that was not in the original paragraph.',
      );
      continue;
    }

    const addedTerms = requirementTerms.filter(
      (requirement) =>
        containsTerm(proposed, requirement.text) &&
        !containsTerm(paragraph.text, requirement.text),
    );
    if (addedTerms.length > 0) {
      discard(
        suggestion.locationId,
        'unsupported_requirement_added',
        `Suggestion added a job requirement not already evidenced in this paragraph (${addedTerms
          .slice(0, 3)
          .map((r) => r.text)
          .join(', ')}).`,
      );
      continue;
    }

    if (DEGREE_OR_CERT_RE.test(proposed) && !DEGREE_OR_CERT_RE.test(paragraph.text)) {
      discard(
        suggestion.locationId,
        'unsupported_credential',
        'Suggestion introduced a degree or certification claim that was not in the original paragraph.',
      );
      continue;
    }
    if (GUARANTEE_RE.test(proposed) && !GUARANTEE_RE.test(paragraph.text)) {
      discard(
        suggestion.locationId,
        'unsupported_claim',
        'Suggestion contained a guarantee or ATS claim, which this product does not make.',
      );
      continue;
    }
    if (CONTACT_RE.test(proposed) && !CONTACT_RE.test(paragraph.text)) {
      discard(
        suggestion.locationId,
        'new_contact_information',
        'Suggestion introduced new contact information.',
      );
      continue;
    }
    if (proposed.length > Math.max(400, paragraph.text.length * 3)) {
      discard(
        suggestion.locationId,
        'excessive_expansion',
        'Suggestion expanded the paragraph far beyond its original length.',
      );
      continue;
    }

    const evidence = suggestion.evidence.trim();
    if (!evidence) {
      discard(
        suggestion.locationId,
        'missing_evidence',
        'Suggestion did not cite resume evidence and was discarded.',
      );
      continue;
    }
    if (!evidenceSupported(evidence, corpusTokens)) {
      discard(
        suggestion.locationId,
        'weak_evidence',
        'Suggestion evidence could not be verified against the resume text.',
      );
      continue;
    }

    const knownRequirementIds = suggestion.requirementIds.filter((id) =>
      requirementById.has(id),
    );
    const unknownRequirementCount =
      suggestion.requirementIds.length - knownRequirementIds.length;
    const warnings = [];
    if (unknownRequirementCount > 0) {
      warnings.push(`${unknownRequirementCount} referenced job requirement(s) were not recognised and were removed.`);
    }
    const formatting = paragraph.mixedFormatting ? 'partial' : 'full';
    if (formatting === 'partial') {
      warnings.push(
        'This paragraph contains mixed inline formatting. The paragraph style is preserved, but the new text uses the first replaced run’s inline style.',
      );
    }
    let risk = suggestion.risk;
    if (formatting === 'partial' && risk === 'low') risk = 'medium';

    // Evidence must relate to the paragraph or a nearby section, not a random
    // unrelated part of the resume, when the proposal changes content.
    const paragraphTokens = new Set(significantTokens(paragraph.text));
    const evidenceTokens = significantTokens(evidence);
    const evidenceOverlapWithParagraph =
      evidenceTokens.length === 0
        ? 0
        : evidenceTokens.filter((token) => paragraphTokens.has(token)).length /
          evidenceTokens.length;
    if (evidenceOverlapWithParagraph < 0.2) {
      discard(
        suggestion.locationId,
        'unrelated_evidence',
        'Suggestion evidence did not relate to the target paragraph.',
      );
      continue;
    }

    seenLocations.add(suggestion.locationId);
    accepted.push({
      locationId: paragraph.id,
      part: paragraph.part,
      sectionName: paragraph.section || 'General',
      originalText: paragraph.text,
      proposedText: proposed,
      reason: suggestion.reason,
      requirementIds: knownRequirementIds,
      evidence,
      risk,
      validation: {
        status: warnings.length ? 'warning' : 'valid',
        warnings,
        formatting,
      },
      order: paragraph.order,
      ai: { provider, model },
    });
  }

  accepted.sort((a, b) => a.order - b.order);
  return {
    accepted: accepted.map((edit, index) => ({ ...edit, order: index })),
    discarded,
  };
}
