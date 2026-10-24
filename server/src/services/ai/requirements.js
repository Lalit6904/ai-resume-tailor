const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'for', 'from',
  'has', 'have', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'our', 'that', 'the',
  'their', 'to', 'was', 'were', 'will', 'with', 'work', 'working', 'experience', 'skills',
  'ability', 'including', 'using', 'use', 'you', 'your', 'we', 'this', 'these', 'those',
  'strong', 'good', 'knowledge', 'understanding', 'plus', 'etc', 'role', 'team', 'teams',
  'years', 'year', 'must', 'should', 'would', 'preferred', 'required', 'requirements',
]);

export function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function significantTokens(value = '') {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function termRegex(term) {
  const escaped = escapeRegExp(term.trim());
  if (!escaped) return null;
  const needsStartBoundary = /^[\p{L}\p{N}]/u.test(term);
  const needsEndBoundary = /[\p{L}\p{N}]$/u.test(term);
  return new RegExp(
    `${needsStartBoundary ? '(?<![\\p{L}\\p{N}])' : ''}${escaped}${needsEndBoundary ? '(?![\\p{L}\\p{N}])' : ''}`,
    'iu',
  );
}

function truncate(value, max = 240) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function overlapRatio(tokens, corpusTokenSet) {
  if (tokens.length === 0) return 0;
  const present = tokens.filter((token) => corpusTokenSet.has(token));
  return present.length / tokens.length;
}

/**
 * Deterministically classify JD requirements against the actual resume text.
 * This never infers a skill from the job description; absence of resume
 * evidence always results in "not_evidenced".
 */
export function matchRequirements(requirements, parsed) {
  const paragraphs = parsed.paragraphs.filter(
    (p) => (p.kind === 'body' || p.kind === 'table') && p.text.trim(),
  );
  const normalizedParagraphs = paragraphs.map((p) => ({
    paragraph: p,
    raw: p.text.toLowerCase(),
    normalized: ` ${normalizeText(p.text)} `,
    tokens: new Set(significantTokens(p.text)),
  }));
  const corpusTokens = new Set();
  for (const entry of normalizedParagraphs) {
    for (const token of entry.tokens) corpusTokens.add(token);
  }

  return requirements.map((requirement) => {
    const term = requirement.text;
    const isLongRequirement =
      requirement.category === 'responsibility' || requirement.category === 'qualification';
    const rawTerm = term.toLowerCase().trim();
    const normalizedTerm = normalizeText(term);
    const tokens = significantTokens(term).slice(0, isLongRequirement ? 14 : 8);

    let matching = [];
    if (!isLongRequirement && rawTerm) {
      const regex = termRegex(term);
      if (regex) {
        for (const entry of normalizedParagraphs) {
          if (regex.test(entry.paragraph.text)) matching.push(entry);
        }
      }
      if (matching.length === 0 && normalizedTerm.length > 2) {
        for (const entry of normalizedParagraphs) {
          if (entry.normalized.includes(` ${normalizedTerm} `)) matching.push(entry);
        }
      }
    }

    let status;
    let confidence;
    if (matching.length > 0) {
      status = 'demonstrated';
      confidence = 'high';
    } else {
      const coverage = overlapRatio(tokens, corpusTokens);
      if (coverage >= (isLongRequirement ? 0.7 : 0.85)) {
        status = isLongRequirement ? 'partially_demonstrated' : 'partially_demonstrated';
        confidence = 'medium';
      } else if (coverage >= (isLongRequirement ? 0.35 : 0.5)) {
        status = 'partially_demonstrated';
        confidence = 'low';
      } else {
        status = 'not_evidenced';
        confidence = 'none';
      }
      // Collect best-effort supporting snippets for partial matches.
      if (status !== 'not_evidenced') {
        matching = normalizedParagraphs
          .map((entry) => ({
            entry,
            score: overlapRatio(tokens, entry.tokens),
          }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 2)
          .map((item) => item.entry);
      }
    }

    return {
      ...requirement,
      status,
      confidence,
      evidence: matching.slice(0, 2).map((entry) => truncate(entry.paragraph.text)),
    };
  });
}

export function buildRequirements(jobAnalysis) {
  const requirements = [];
  const seen = new Set();

  const add = (text, type, category, importance) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    const key = normalizeText(trimmed);
    if (!key || seen.has(key)) return;
    seen.add(key);
    requirements.push({
      id: `REQ-${requirements.length + 1}`,
      text: trimmed,
      type,
      category,
      importance,
      status: 'not_evidenced',
      confidence: 'none',
      evidence: [],
    });
  };

  for (const skill of jobAnalysis.requiredSkills) add(skill, 'required', 'skill', 'high');
  for (const skill of jobAnalysis.preferredSkills) add(skill, 'preferred', 'skill', 'medium');
  for (const tool of jobAnalysis.tools) add(tool, 'tool', 'tool', 'medium');
  for (const qualification of jobAnalysis.qualifications) {
    add(qualification, 'qualification', 'qualification', 'high');
  }
  for (const responsibility of jobAnalysis.responsibilities) {
    add(responsibility, 'responsibility', 'responsibility', 'medium');
  }

  return requirements.slice(0, 60);
}

export function summarizeMatching(requirements) {
  const summary = {
    total: requirements.length,
    demonstrated: 0,
    partiallyDemonstrated: 0,
    notEvidenced: 0,
  };
  for (const requirement of requirements) {
    if (requirement.status === 'demonstrated') summary.demonstrated += 1;
    else if (requirement.status === 'partially_demonstrated') summary.partiallyDemonstrated += 1;
    else summary.notEvidenced += 1;
  }
  return summary;
}

export function keywordCoverage(requirements) {
  const total = requirements.length;
  if (total === 0) return null;
  const weight = (status) =>
    status === 'demonstrated' ? 1 : status === 'partially_demonstrated' ? 0.5 : 0;
  const score = requirements.reduce((sum, req) => sum + weight(req.status), 0) / total;
  return {
    percent: Math.round(score * 1000) / 10,
    formula:
      '(demonstrated requirements × 1 + partially demonstrated × 0.5) ÷ total requirements × 100. Internal estimate only; not an ATS score.',
  };
}
