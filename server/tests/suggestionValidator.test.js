import { describe, expect, it } from 'vitest';
import { buildDocxFixture, fixtureSummary } from './helpers/docxFixture.js';
import { parseDocx } from '../src/services/documents/docxParser.js';
import { validateSuggestions } from '../src/services/ai/suggestionValidator.js';

async function setup() {
  const parsed = await parseDocx(await buildDocxFixture());
  const target = parsed.paragraphs.find(
    (paragraph) =>
      paragraph.text ===
      'Worked on React and Node.js to build internal APIs used by operations teams.',
  );
  const summary = parsed.paragraphs.find((paragraph) => paragraph.text === fixtureSummary);
  const heading = parsed.paragraphs.find((paragraph) => paragraph.isHeading);
  return { parsed, target, summary, heading };
}

function suggestion(target, overrides = {}) {
  return {
    locationId: target.id,
    originalText: target.text,
    proposedText:
      'Contributed to React and Node.js to build internal APIs used by operations teams.',
    reason: 'Uses a clearer opening verb without changing the underlying claim.',
    requirementIds: [],
    evidence: target.text,
    risk: 'low',
    ...overrides,
  };
}

function validate(parsed, rawSuggestions, requirements = []) {
  return validateSuggestions({
    rawSuggestions,
    parsed,
    requirements,
    provider: 'test',
    model: 'test-model',
  });
}

describe('AI suggestion safety validation', () => {
  it('accepts a supported, formatting-safe rewrite with quoted evidence', async () => {
    const { parsed, target } = await setup();
    const { accepted, discarded } = validate(parsed, [suggestion(target)]);

    expect(discarded).toHaveLength(0);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].locationId).toBe(target.id);
    expect(accepted[0].evidence).toBe(target.text);
    expect(accepted[0].validation.status).toBe('valid');
    expect(accepted[0].ai).toEqual({ provider: 'test', model: 'test-model' });
  });

  it('drops invented numbers and dates', async () => {
    const { parsed, target } = await setup();
    const { accepted, discarded } = validate(parsed, [
      suggestion(target, {
        proposedText:
          'Worked on React and Node.js to build internal APIs used by 5 operations teams since 2021.',
      }),
    ]);
    expect(accepted).toHaveLength(0);
    expect(discarded[0].code).toBe('fabricated_number');
  });

  it('drops a job requirement that is not evidenced in the target paragraph', async () => {
    const { parsed, target } = await setup();
    const requirements = [
      {
        id: 'REQ-1',
        text: 'Kubernetes',
        type: 'required',
        category: 'skill',
        importance: 'high',
        status: 'not_evidenced',
      },
    ];
    const { accepted, discarded } = validate(
      parsed,
      [
        suggestion(target, {
          proposedText:
            'Worked on React, Node.js, and Kubernetes to build internal APIs used by operations teams.',
          requirementIds: ['REQ-1'],
        }),
      ],
      requirements,
    );
    expect(accepted).toHaveLength(0);
    expect(discarded[0].code).toBe('unsupported_requirement_added');
  });

  it('drops new credentials and guarantees', async () => {
    const { parsed, target } = await setup();
    const credential = validate(parsed, [
      suggestion(target, {
        proposedText:
          'Certified React and Node.js engineer building internal APIs used by operations teams.',
      }),
    ]);
    expect(credential.accepted).toHaveLength(0);
    expect(credential.discarded[0].code).toBe('unsupported_credential');

    const guarantee = validate(parsed, [
      suggestion(target, {
        proposedText:
          'Guaranteed to build React and Node.js internal APIs used by operations teams.',
      }),
    ]);
    expect(guarantee.accepted).toHaveLength(0);
    expect(guarantee.discarded[0].code).toBe('unsupported_claim');
  });

  it('drops new contact information', async () => {
    const { parsed, target } = await setup();
    const { accepted, discarded } = validate(parsed, [
      suggestion(target, {
        proposedText:
          'Worked on React and Node.js to build internal APIs used by operations teams. Contact jordan@example.com.',
      }),
    ]);
    expect(accepted).toHaveLength(0);
    expect(discarded[0].code).toBe('new_contact_information');
  });

  it('drops missing, weak, and unrelated evidence', async () => {
    const { parsed, target } = await setup();

    const missing = validate(parsed, [suggestion(target, { evidence: '' })]);
    expect(missing.discarded[0].code).toBe('missing_evidence');

    const weak = validate(parsed, [
      suggestion(target, { evidence: 'Quantum blockchain synergy operating model' }),
    ]);
    expect(weak.discarded[0].code).toBe('weak_evidence');

    const unrelated = validate(parsed, [
      suggestion(target, { evidence: 'References available on request' }),
    ]);
    expect(unrelated.discarded[0].code).toBe('unrelated_evidence');
  });

  it('rejects read-only targets, unknown targets and mismatched originals', async () => {
    const { parsed, target, heading } = await setup();

    const readOnly = validate(parsed, [
      suggestion(heading, { proposedText: 'EXPERIENCE AND IMPACT' }),
    ]);
    expect(readOnly.discarded[0].code).toBe('read_only_target');

    const unknown = validate(parsed, [
      suggestion(target, { locationId: 'body:p999' }),
    ]);
    expect(unknown.discarded[0].code).toBe('unknown_target');

    const mismatch = validate(parsed, [
      suggestion(target, { originalText: 'A paragraph that is not in the document.' }),
    ]);
    expect(mismatch.discarded[0].code).toBe('original_text_mismatch');

    const noChange = validate(parsed, [
      suggestion(target, { proposedText: target.text }),
    ]);
    expect(noChange.discarded[0].code).toBe('no_change');
  });

  it('rejects duplicate locations and invalid replacement text', async () => {
    const { parsed, target } = await setup();

    const duplicate = validate(parsed, [
      suggestion(target),
      suggestion(target, {
        proposedText:
          'Delivered React and Node.js internal APIs used by operations teams.',
      }),
    ]);
    expect(duplicate.accepted).toHaveLength(1);
    expect(duplicate.discarded[0].code).toBe('duplicate_location');

    const invalid = validate(parsed, [
      suggestion(target, { proposedText: 'Line one\nLine two' }),
    ]);
    expect(invalid.discarded[0].code).toBe('invalid_replacement');
  });

  it('drops excessive expansion and caps formatting warnings honestly', async () => {
    const { parsed, target, summary } = await setup();
    const expansion = validate(parsed, [
      suggestion(target, {
        proposedText: `Worked on React and Node.js. ${'Build internal APIs used by operations teams. '.repeat(12)}`,
      }),
    ]);
    expect(expansion.accepted).toHaveLength(0);
    expect(expansion.discarded[0].code).toBe('excessive_expansion');

    const mixed = validate(parsed, [
      suggestion(summary, {
        proposedText: fixtureSummary.replace('Product-minded', 'Product-focused'),
        evidence: fixtureSummary,
      }),
    ]);
    expect(mixed.accepted).toHaveLength(1);
    expect(mixed.accepted[0].validation.formatting).toBe('partial');
    expect(mixed.accepted[0].risk).toBe('medium');
    expect(mixed.accepted[0].validation.warnings.join(' ')).toMatch(/mixed inline formatting/i);
  });
});
