import { AppError } from '../../utils/errors.js';
import { parseDocx } from './docxParser.js';
import { safeChars, serializeXml } from './xml.js';

const MAX_REPLACEMENT_LENGTH = 3000;
const XML_SPACE_NS = 'http://www.w3.org/XML/1998/namespace';

export function validateReplacementText(text) {
  if (typeof text !== 'string') {
    return 'Replacement text must be a string.';
  }
  if (!text.trim()) return 'Replacement text cannot be empty.';
  if (text.length > MAX_REPLACEMENT_LENGTH) {
    return `Replacement text exceeds the ${MAX_REPLACEMENT_LENGTH}-character limit.`;
  }
  if (/[\r\n]/.test(text)) return 'Replacement text cannot contain line breaks.';
  if (/\t/.test(text)) return 'Replacement text cannot contain tab characters.';
  if (safeChars(text)) return 'Replacement text contains characters that Word documents cannot store.';
  return null;
}

function setTextNodeData(node, text) {
  while (node.firstChild) node.removeChild(node.firstChild);
  if (text) node.appendChild(node.ownerDocument.createTextNode(text));
  if (/^\s|\s$/.test(text)) {
    node.setAttributeNS(XML_SPACE_NS, 'xml:space', 'preserve');
  } else {
    node.removeAttributeNS(XML_SPACE_NS, 'space');
  }
}

function setRunText(run, text) {
  if (!run.textNodes.length) {
    throw new AppError({
      status: 422,
      code: 'UNSUPPORTED_RUN',
      message: 'A target paragraph contains a run without a writable text node.',
    });
  }
  setTextNodeData(run.textNodes[0], text);
  for (let i = 1; i < run.textNodes.length; i += 1) {
    setTextNodeData(run.textNodes[i], '');
  }
}

function clearRunText(run) {
  for (const node of run.textNodes) setTextNodeData(node, '');
}

function commonPrefixLength(a, b) {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i += 1;
  return i;
}

function commonSuffixLength(a, b, limit) {
  let i = 0;
  const max = Math.min(a.length, b.length, limit);
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1;
  return i;
}

/**
 * Replace paragraph text while preserving:
 *  - the paragraph node, paragraph style, numbering and section properties,
 *  - run formatting for unchanged prefix and suffix runs,
 *  - the formatting of the first replaced run for the new middle text.
 *
 * It never moves, deletes or recreates paragraphs, tables or package parts.
 */
function replaceParagraphText(paragraph, proposedText) {
  const original = paragraph.text;
  if (original === proposedText) {
    return { changed: false, formatting: paragraph.mixedFormatting ? 'partial' : 'full' };
  }
  const runs = paragraph.textRuns.filter((run) => run.text.length > 0);
  if (runs.length === 0) {
    throw new AppError({
      status: 422,
      code: 'UNSUPPORTED_PARAGRAPH',
      message: 'This paragraph has no writable text runs.',
      details: { locationId: paragraph.id },
    });
  }

  const prefixLength = commonPrefixLength(original, proposedText);
  const suffixLength = commonSuffixLength(
    original.slice(prefixLength),
    proposedText.slice(prefixLength),
    original.length - prefixLength,
  );

  // Keep complete prefix runs untouched.
  let prefixKept = 0;
  let firstMiddle = 0;
  while (
    firstMiddle < runs.length &&
    prefixKept + runs[firstMiddle].text.length <= prefixLength
  ) {
    prefixKept += runs[firstMiddle].text.length;
    firstMiddle += 1;
  }

  // Keep complete suffix runs untouched.
  let suffixKept = 0;
  let lastMiddle = runs.length - 1;
  while (
    lastMiddle >= firstMiddle &&
    suffixKept + runs[lastMiddle].text.length <= suffixLength
  ) {
    suffixKept += runs[lastMiddle].text.length;
    lastMiddle -= 1;
  }

  // The new text that belongs to the middle runs. Any suffix characters that
  // fall inside a partially affected run are intentionally included here.
  const middleText = proposedText.slice(prefixKept, proposedText.length - suffixKept);

  if (firstMiddle <= lastMiddle) {
    setRunText(runs[firstMiddle], middleText);
    for (let i = firstMiddle + 1; i <= lastMiddle; i += 1) clearRunText(runs[i]);
  } else if (middleText) {
    // Pure insertion at a run boundary.
    if (firstMiddle < runs.length) {
      setRunText(runs[firstMiddle], middleText + runs[firstMiddle].text);
    } else {
      setRunText(runs[runs.length - 1], runs[runs.length - 1].text + middleText);
    }
  }

  // Verify the write against the actual XML before proceeding.
  const resultingText = runs
    .map((run) => run.textNodes.map((n) => n.textContent || '').join(''))
    .join('');
  if (resultingText !== proposedText) {
    throw new AppError({
      status: 422,
      code: 'EDIT_APPLICATION_MISMATCH',
      message: 'The replacement could not be applied exactly; this paragraph was left unchanged.',
      details: { locationId: paragraph.id },
    });
  }

  const affectedSignatures = new Set();
  for (let i = firstMiddle; i <= Math.max(firstMiddle, lastMiddle); i += 1) {
    if (runs[i]) affectedSignatures.add(runs[i].signature);
  }
  const formatting =
    paragraph.mixedFormatting || affectedSignatures.size > 1 ? 'partial' : 'full';
  return { changed: true, formatting };
}

/**
 * Apply edits to a copy of the original DOCX. The source buffer is never mutated.
 * Every edit is verified against the parsed document before any XML is serialized.
 */
export async function applyEditsToDocx(originalBuffer, edits, options = {}) {
  const parsed = await parseDocx(originalBuffer, { skipMammothCheck: true });
  if (options.expectedDocumentHash && options.expectedDocumentHash !== parsed.documentHash) {
    throw new AppError({
      status: 409,
      code: 'DOCUMENT_CHANGED',
      message: 'The source document no longer matches this review session.',
    });
  }

  const paragraphById = new Map(parsed.paragraphs.map((p) => [p.id, p]));
  const seen = new Set();
  const prepared = [];

  for (const edit of edits) {
    const locationId = edit.locationId;
    if (seen.has(locationId)) {
      throw new AppError({
        status: 409,
        code: 'CONFLICTING_EDITS',
        message: 'Two changes target the same document location. Resolve the conflict before exporting.',
        details: { locationId },
      });
    }
    seen.add(locationId);

    const paragraph = paragraphById.get(locationId);
    if (!paragraph) {
      throw new AppError({
        status: 409,
        code: 'STALE_TARGET',
        message: 'A proposed change targets a paragraph that no longer exists in the document.',
        details: { locationId },
      });
    }
    if (!paragraph.editable) {
      throw new AppError({
        status: 422,
        code: 'UNSUPPORTED_TARGET',
        message: 'A proposed change targets a paragraph that is read-only for safety reasons.',
        details: { locationId, reasons: paragraph.reasons },
      });
    }
    if (paragraph.text !== edit.originalText) {
      throw new AppError({
        status: 409,
        code: 'STALE_ORIGINAL_TEXT',
        message: 'The paragraph text has changed since this suggestion was generated. Regenerate suggestions for this section.',
        details: { locationId },
      });
    }
    const replacementError = validateReplacementText(edit.proposedText);
    if (replacementError) {
      throw new AppError({
        status: 422,
        code: 'INVALID_REPLACEMENT',
        message: replacementError,
        details: { locationId },
      });
    }
    prepared.push({ edit, paragraph });
  }

  const modifiedParts = new Set();
  const results = [];
  for (const { edit, paragraph } of prepared) {
    const outcome = replaceParagraphText(paragraph, edit.proposedText);
    modifiedParts.add(paragraph.partPath);
    results.push({
      locationId: paragraph.id,
      changed: outcome.changed,
      formatting: outcome.formatting,
      part: paragraph.partPath,
      finalText: edit.proposedText,
    });
  }

  // Serialize only parts whose text actually changed. All other package parts
  // remain byte-for-byte identical in content.
  for (const partPath of modifiedParts) {
    const partKey = parsed.paragraphs.find((p) => p.partPath === partPath)?.part;
    const part = partKey ? parsed.parts.get(partKey) : null;
    if (!part) {
      throw new AppError({
        status: 500,
        code: 'PART_LOOKUP_FAILED',
        message: 'Internal document part could not be located during export.',
      });
    }
    const xml = serializeXml(part.dom);
    parsed.zip.file(partPath, xml);
  }

  const output = await parsed.zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return {
    buffer: output,
    results,
    modifiedParts: [...modifiedParts],
    appliedCount: results.filter((r) => r.changed).length,
    parsed,
  };
}
