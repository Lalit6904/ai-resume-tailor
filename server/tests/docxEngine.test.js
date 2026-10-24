import { describe, expect, it } from 'vitest';
import { buildDocxFixture, fixtureSummary } from './helpers/docxFixture.js';
import { parseDocx } from '../src/services/documents/docxParser.js';
import { applyEditsToDocx } from '../src/services/documents/docxEditor.js';
import { validateExportedDocx } from '../src/services/documents/docxValidator.js';

async function fixtureParsed() {
  const buffer = await buildDocxFixture();
  const parsed = await parseDocx(buffer);
  return { buffer, parsed };
}

describe('DOCX parse, edit and validation engine', () => {
  it('parses stable structural counts, editable paragraphs and mixed runs', async () => {
    const { parsed } = await fixtureParsed();
    const summary = parsed.paragraphs.find((paragraph) => paragraph.text === fixtureSummary);

    expect(parsed.paragraphs.length).toBeGreaterThanOrEqual(14);
    expect(parsed.counts.tables).toBe(1);
    expect(parsed.counts.images).toBe(1);
    expect(parsed.counts.headers).toBe(1);
    expect(parsed.counts.footers).toBe(1);
    expect(parsed.counts.hyperlinks).toBe(1);
    expect(parsed.counts.sections).toBe(1);
    expect(parsed.sections.map((section) => section.name)).toContain('EXPERIENCE');
    expect(summary).toBeTruthy();
    expect(summary.editable).toBe(true);
    expect(summary.mixedFormatting).toBe(true);
    expect(summary.id).toMatch(/^body:p\d+$/);

    const heading = parsed.paragraphs.find((paragraph) => paragraph.isHeading);
    expect(heading.editable).toBe(false);
    expect(heading.reasons.length).toBeGreaterThan(0);

    const header = parsed.paragraphs.find((paragraph) => paragraph.kind === 'header');
    expect(header).toBeTruthy();
    expect(header.editable).toBe(false);
  });

  it('applies an edit, preserves untouched package parts, and passes every validator check', async () => {
    const { buffer, parsed } = await fixtureParsed();
    const target = parsed.paragraphs.find((paragraph) => paragraph.text === fixtureSummary);
    const proposedText = fixtureSummary.replace(
      'Product-minded engineer',
      'Product-focused engineer',
    );
    const edit = {
      id: 'edit-summary',
      locationId: target.id,
      originalText: target.text,
      proposedText,
      status: 'approved',
      validation: { formatting: target.mixedFormatting ? 'partial' : 'full' },
    };

    const result = await applyEditsToDocx(buffer, [edit]);
    expect(result.appliedCount).toBe(1);
    expect(result.modifiedParts).toContain('word/document.xml');
    expect(result.buffer.length).toBeGreaterThan(1000);
    expect(buffer).not.toBe(result.buffer);

    const reparsed = await parseDocx(result.buffer, { skipMammothCheck: true });
    const updated = reparsed.paragraphs.find((paragraph) => paragraph.id === target.id);
    expect(updated.text).toBe(proposedText);
    expect(reparsed.counts.tables).toBe(parsed.counts.tables);
    expect(reparsed.counts.images).toBe(parsed.counts.images);
    expect(reparsed.counts.headers).toBe(parsed.counts.headers);
    expect(reparsed.counts.footers).toBe(parsed.counts.footers);
    expect(reparsed.counts.hyperlinks).toBe(parsed.counts.hyperlinks);
    expect(reparsed.counts.lists).toBe(parsed.counts.lists);

    const validation = await validateExportedDocx({
      originalBuffer: buffer,
      generatedBuffer: result.buffer,
      edits: [edit],
      appliedEditIds: [edit.id],
      renderInfo: { renderer: 'none', pageCount: null, originalPageCount: null },
    });

    expect(validation.ok).toBe(true);
    expect(validation.checks.every((check) => check.passed)).toBe(true);
    expect(validation.checks.find((check) => check.name === 'parts_preserved').passed).toBe(true);
    expect(validation.checks.find((check) => check.name === 'structure_preserved').passed).toBe(
      true,
    );
    expect(
      validation.checks.find((check) => check.name === 'formatting_properties_unchanged').passed,
    ).toBe(true);
    expect(validation.checks.find((check) => check.name === 'text_correct').passed).toBe(true);
    expect(validation.checks.find((check) => check.name === 'only_approved_applied').passed).toBe(
      true,
    );
    expect(validation.warnings.join(' ')).toMatch(/No Office renderer/i);
  });

  it('rejects a stale original text with a conflict instead of overwriting', async () => {
    const { buffer, parsed } = await fixtureParsed();
    const target = parsed.paragraphs.find((paragraph) => paragraph.text === fixtureSummary);

    await expect(
      applyEditsToDocx(buffer, [
        {
          id: 'stale',
          locationId: target.id,
          originalText: 'Text that is no longer in the document.',
          proposedText: 'Replacement.',
          status: 'approved',
        },
      ]),
    ).rejects.toMatchObject({ code: 'STALE_ORIGINAL_TEXT', status: 409 });
  });

  it('refuses to edit protected targets and unknown locations', async () => {
    const { buffer, parsed } = await fixtureParsed();
    const heading = parsed.paragraphs.find((paragraph) => paragraph.isHeading);

    await expect(
      applyEditsToDocx(buffer, [
        {
          id: 'readonly',
          locationId: heading.id,
          originalText: heading.text,
          proposedText: 'REWRITTEN HEADING',
          status: 'approved',
        },
      ]),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_TARGET', status: 422 });

    await expect(
      applyEditsToDocx(buffer, [
        {
          id: 'missing',
          locationId: 'body:p999',
          originalText: 'Does not exist',
          proposedText: 'Replacement',
          status: 'approved',
        },
      ]),
    ).rejects.toMatchObject({ code: 'STALE_TARGET' });
  });

  it('round-trips XML-sensitive characters exactly', async () => {
    const { buffer, parsed } = await fixtureParsed();
    const target = parsed.paragraphs.find(
      (paragraph) => paragraph.text === 'Built APIs & dashboards for 3 teams.',
    );
    expect(target).toBeTruthy();

    const proposedText = 'Built R&D APIs & dashboards for 3 teams.';
    const edit = {
      id: 'escape-edit',
      locationId: target.id,
      originalText: target.text,
      proposedText,
      status: 'approved',
      validation: { formatting: 'full' },
    };
    const result = await applyEditsToDocx(buffer, [edit]);
    const reparsed = await parseDocx(result.buffer, { skipMammothCheck: true });
    expect(reparsed.paragraphs.find((paragraph) => paragraph.id === target.id).text).toBe(
      proposedText,
    );

    const validation = await validateExportedDocx({
      originalBuffer: buffer,
      generatedBuffer: result.buffer,
      edits: [edit],
      appliedEditIds: [edit.id],
      renderInfo: { renderer: 'none' },
    });
    expect(validation.ok).toBe(true);
  });

  it('rejects line breaks and control characters in replacement text', async () => {
    const { buffer, parsed } = await fixtureParsed();
    const target = parsed.paragraphs.find((paragraph) => paragraph.text === fixtureSummary);

    await expect(
      applyEditsToDocx(buffer, [
        {
          id: 'newline',
          locationId: target.id,
          originalText: target.text,
          proposedText: 'Line one\nLine two',
          status: 'approved',
        },
      ]),
    ).rejects.toMatchObject({ code: 'INVALID_REPLACEMENT' });

    await expect(
      applyEditsToDocx(buffer, [
        {
          id: 'control',
          locationId: target.id,
          originalText: target.text,
          proposedText: 'Bad \u0007 character',
          status: 'approved',
        },
      ]),
    ).rejects.toMatchObject({ code: 'INVALID_REPLACEMENT' });
  });
});
