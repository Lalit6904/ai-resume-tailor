import { normalizeText } from './requirements.js';

const SKILLS = [
  'JavaScript', 'TypeScript', 'React', 'Next.js', 'Vue', 'Angular', 'Node.js', 'Express',
  'Python', 'Django', 'Flask', 'FastAPI', 'Java', 'Spring Boot', 'C#', '.NET', 'Go', 'Rust',
  'PHP', 'Laravel', 'Ruby', 'Rails', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis',
  'GraphQL', 'REST', 'REST APIs', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes',
  'Terraform', 'Jenkins', 'CI/CD', 'Git', 'Linux', 'HTML', 'CSS', 'Tailwind CSS', 'Sass',
  'Figma', 'Jest', 'Vitest', 'Cypress', 'Playwright', 'Selenium', 'Machine Learning',
  'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Data Analysis', 'Tableau', 'Power BI',
  'Excel', 'Agile', 'Scrum', 'Jira', 'Product Management', 'Project Management',
  'Communication', 'Leadership', 'Stakeholder Management', 'Microservices', 'Kafka',
  'RabbitMQ', 'Elasticsearch', 'Firebase', 'Supabase', 'Serverless', 'OAuth', 'JWT',
  'WebSockets', 'Redux', 'Zustand', 'React Native', 'Flutter', 'Swift', 'Kotlin',
  'Android', 'iOS', 'Accessibility', 'Responsive Design', 'Unit Testing', 'System Design',
  'Data Structures', 'Algorithms', 'Analytics', 'SEO', 'Content Marketing', 'Salesforce',
];

const TOOLS = new Set([
  'React', 'Next.js', 'Vue', 'Angular', 'Node.js', 'Express', 'Django', 'Flask', 'FastAPI',
  'Spring Boot', '.NET', 'Laravel', 'Rails', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis',
  'GraphQL', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Jenkins', 'Git',
  'Linux', 'Figma', 'Jest', 'Vitest', 'Cypress', 'Playwright', 'Selenium', 'TensorFlow',
  'PyTorch', 'Pandas', 'NumPy', 'Tableau', 'Power BI', 'Excel', 'Jira', 'Kafka',
  'RabbitMQ', 'Elasticsearch', 'Firebase', 'Supabase', 'Redux', 'Zustand', 'React Native',
  'Flutter', 'Swift', 'Kotlin', 'Salesforce',
]);

const SKILL_PATTERNS = SKILLS.map((skill) => ({
  skill,
  regex: new RegExp(
    `${/^[\p{L}\p{N}]/u.test(skill) ? '(?<![\\p{L}\\p{N}])' : ''}${skill.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )}${/[\p{L}\p{N}]$/u.test(skill) ? '(?![\\p{L}\\p{N}])' : ''}`,
    'iu',
  ),
}));

function lines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•●◦▪\-*]+/, '').trim())
    .filter(Boolean);
}

function sentenceSplit(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

function extractJobTitle(jd) {
  const explicit = jd.match(/(?:job title|position|role)\s*[:\-]\s*([^\n]{2,120})/i);
  if (explicit) return explicit[1].trim().replace(/[.;]$/, '');
  const firstLine = lines(jd)[0];
  if (
    firstLine &&
    firstLine.length <= 110 &&
    !/[.!?]$/.test(firstLine) &&
    !/^(about|we are|we're|our |company|job description|overview|description|responsibilities)/i.test(
      firstLine,
    )
  ) {
    return firstLine.replace(/[;:]$/, '');
  }
  return null;
}

function extractSectionItems(jd, sectionPattern) {
  const allLines = lines(jd);
  const items = [];
  let active = false;
  for (const line of allLines) {
    if (/^(responsibilities|what you.?ll do|the role|requirements|qualifications|must have|preferred|nice to have|about (the|you)|benefits)/i.test(line)) {
      active = sectionPattern.test(line);
      continue;
    }
    if (active) {
      if (line.length < 10) continue;
      items.push(line.replace(/^[•●◦▪*-]\s*/, '').slice(0, 400));
    }
  }
  return [...new Set(items)];
}

/**
 * Deterministic local analysis used when no external AI provider is configured.
 * It is intentionally conservative and is labeled as heuristic in the UI.
 */
export function analyzeJobDescriptionHeuristic(jobDescription) {
  const text = jobDescription.replace(/\r/g, '');
  const sentences = sentenceSplit(text);
  const matched = [];
  for (const { skill, regex } of SKILL_PATTERNS) {
    if (regex.test(text)) matched.push(skill);
  }
  const requiredSkills = [];
  const preferredSkills = [];
  for (const skill of matched) {
    const relevant = sentences.filter((sentence) =>
      new RegExp(skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(sentence),
    );
    const preferred = relevant.some((sentence) =>
      /\b(preferred|nice to have|bonus|plus|desirable)\b/i.test(sentence),
    );
    if (preferred) preferredSkills.push(skill);
    else requiredSkills.push(skill);
  }

  const responsibilities = extractSectionItems(
    text,
    /^(responsibilities|what you.?ll do|the role)/i,
  ).slice(0, 8);
  const qualifications = extractSectionItems(
    text,
    /^(requirements|qualifications|must have|preferred|nice to have)/i,
  ).slice(0, 8);

  const experience = text.match(/(\d+\+?\s*(?:-|–)?\s*\d*\s*years?[^.\n]{0,80})/i);
  const seniority = text.match(/\b(intern|junior|mid[- ]level|senior|staff|principal|lead|manager|director)\b/i);

  const frequency = new Map();
  for (const token of normalizeText(text).split(' ')) {
    if (token.length < 4) continue;
    if (/^(with|that|this|from|have|will|your|their|they|about|team|work|role|experience|skills|requirements|responsibilities|preferred|including|using)$/.test(token)) {
      continue;
    }
    frequency.set(token, (frequency.get(token) || 0) + 1);
  }
  const terminology = [...frequency.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([token]) => token);

  return {
    jobTitle: extractJobTitle(text),
    seniority: seniority ? seniority[1] : null,
    requiredSkills: [...new Set(requiredSkills)],
    preferredSkills: [...new Set(preferredSkills)],
    responsibilities:
      responsibilities.length > 0
        ? responsibilities
        : sentences.filter((s) => /\b(build|develop|design|manage|lead|create|maintain|collaborate)\b/i.test(s)).slice(0, 6),
    qualifications:
      qualifications.length > 0
        ? qualifications
        : sentences.filter((s) => /\b(degree|years?|proficien|experience with|knowledge of)\b/i.test(s)).slice(0, 6),
    tools: matched.filter((skill) => TOOLS.has(skill)),
    terminology,
    experienceRequirements: experience ? experience[1].trim() : null,
  };
}

function requirementMatchesParagraph(requirement, paragraphText) {
  const normalized = ` ${normalizeText(paragraphText)} `;
  const term = normalizeText(requirement.text);
  if (term && normalized.includes(` ${term} `)) return true;
  const tokens = term.split(' ').filter((token) => token.length > 1);
  if (tokens.length === 0) return false;
  const present = tokens.filter((token) => normalized.includes(` ${token} `)).length;
  return present / tokens.length >= 0.8;
}

function splitSkills(text) {
  if (text.includes('•')) return { tokens: text.split('•').map((t) => t.trim()), delimiter: ' • ' };
  if (text.includes('|')) return { tokens: text.split('|').map((t) => t.trim()), delimiter: ' | ' };
  if (text.includes(',')) return { tokens: text.split(',').map((t) => t.trim()), delimiter: ', ' };
  if (text.includes(';')) return { tokens: text.split(';').map((t) => t.trim()), delimiter: '; ' };
  return null;
}

export function generateHeuristicSuggestions({ parsed, requirements }) {
  const suggestions = [];
  const skillsSections = /skill|technolog|competenc|tools/i;
  const experienceSections = /experience|employment|work|project|professional/i;

  // 1. Reorder existing skills so verified job-relevant skills come first.
  for (const paragraph of parsed.paragraphs) {
    if (suggestions.length >= 4) break;
    if (!paragraph.editable || paragraph.isHeading) continue;
    if (!skillsSections.test(paragraph.section)) continue;
    if (paragraph.text.length > 500) continue;
    const split = splitSkills(paragraph.text);
    if (!split || split.tokens.length < 3) continue;
    const scored = split.tokens.map((token, index) => {
      const matchedRequirement = requirements.find((requirement) =>
        requirementMatchesParagraph(requirement, token),
      );
      return { token, index, score: matchedRequirement ? 2 : 0, requirement: matchedRequirement };
    });
    const reordered = [...scored].sort((a, b) => b.score - a.score || a.index - b.index);
    if (reordered.every((item, index) => item.token === split.tokens[index])) continue;
    const proposed = reordered
      .map((item) => item.token)
      .join(split.delimiter)
      .replace(/\s+$/, '');
    if (!proposed || proposed === paragraph.text) continue;
    const requirementIds = [
      ...new Set(scored.filter((item) => item.requirement).map((item) => item.requirement.id)),
    ];
    suggestions.push({
      locationId: paragraph.id,
      originalText: paragraph.text,
      proposedText: proposed,
      reason:
        'Moves skills already listed in this section so the ones named in the job description appear first. No skill is added or removed.',
      requirementIds,
      evidence: paragraph.text,
      risk: 'low',
    });
  }

  // 2. Replace weak opening verbs with neutral, equivalent active phrasing.
  const verbRules = [
    { regex: /^Worked on\s+(.+)$/i, replacement: 'Contributed to $1' },
    { regex: /^Helped (?:with|to)\s+(.+)$/i, replacement: 'Supported $1' },
    { regex: /^Assisted (?:with|in)\s+(.+)$/i, replacement: 'Supported $1' },
    { regex: /^Participated in\s+(.+)$/i, replacement: 'Contributed to $1' },
  ];
  for (const paragraph of parsed.paragraphs) {
    if (suggestions.length >= 6) break;
    if (!paragraph.editable || paragraph.isHeading) continue;
    if (!experienceSections.test(paragraph.section)) continue;
    if (paragraph.text.length < 25 || paragraph.text.length > 450) continue;
    if (suggestions.some((s) => s.locationId === paragraph.id)) continue;
    for (const rule of verbRules) {
      const match = paragraph.text.match(rule.regex);
      if (!match) continue;
      const proposed = paragraph.text.replace(rule.regex, rule.replacement);
      if (proposed === paragraph.text) continue;
      const requirementIds = requirements
        .filter((requirement) => requirementMatchesParagraph(requirement, paragraph.text))
        .map((requirement) => requirement.id)
        .slice(0, 6);
      suggestions.push({
        locationId: paragraph.id,
        originalText: paragraph.text,
        proposedText: proposed,
        reason:
          'Replaces a passive opening with a clearer, neutral verb. The underlying claim, scope, tools, and metrics are unchanged.',
        requirementIds,
        evidence: paragraph.text,
        risk: 'low',
      });
      break;
    }
  }

  return suggestions;
}
