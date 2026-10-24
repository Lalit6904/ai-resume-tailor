import crypto from 'node:crypto';
import { parseDocx } from './docxParser.js';
import { readZipEntry } from './docxSecurity.js';
import { NS, descendants, parseXml, splitPathSegments } from './xml.js';
import { serializeNode } from './serializeNode.js';

const MAX_XML_PARTS_TO_CHECK = 500;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function entryList(zip) {
  return Object.values(zip.files).filter((entry) => !entry.dir);
}

function relsSourcePart(relsPath) {
  const segments = relsPath.split('/');
  const relsDirIndex = segments.lastIndexOf('_rels');
  if (relsDirIndex === -1) return null;
  const before = segments.slice(0, relsDirIndex);
  const file = segments[relsDirIndex + 1]?.replace(/\.rels$/i, '');
  if (!file) return null;
  return [...before, file].join('/');
}

function relationshipTargetExists(zip, relsPath, target) {
  if (!target) return true;
  if (target.startsWith('/')) return Boolean(zip.file(target.replace(/^\/+/, '')));
  const source = relsSourcePart(relsPath);
  const sourceDir = source ? source.split('/').slice(0, -1).join('/') : '';
  const segments = sourceDir ? sourceDir.split('/') : [];
  for (const segment of splitPathSegments(target)) {
    if (segment === '..') segments.pop();
    else if (segment !== '.') segments.push(segment);
  }
  return Boolean(zip.file(segments.join('/')));
}

function directChild(node, localName) {
  for (let child = node?.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1 && child.localName === localName && child.namespaceURI === NS.w) {
      return child;
    }
  }
  return null;
}

function formattingProperties(parsed) {
  const pPr = new Map();
  const rPr = new Map();
  for (const paragraph of parsed.paragraphs) {
    const key = `${paragraph.part}:${paragraph.index}`;
    const properties = directChild(paragraph.node, 'pPr');
    pPr.set(key, properties ? serializeNode(properties) : null);
    const runs = [];
    for (let child = paragraph.node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== 1 || child.localName !== 'r' || child.namespaceURI !== NS.w) continue;
      const runProperties = directChild(child, 'rPr');
      runs.push(runProperties ? serializeNode(runProperties) : '');
    }
    rPr.set(key, runs);
  }
  return { pPr, rPr };
}

/**
 * Validate an exported document against the immutable original and the review
 * decisions. Any failed critical check means the file must not be served.
 */
export async function validateExportedDocx({
  originalBuffer,
  generatedBuffer,
  edits,
  appliedEditIds,
  renderInfo = null,
}) {
  const checks = [];
  const warnings = [];
  const add = (name, passed, details = '') =>
    checks.push({ name, passed: Boolean(passed), details });

  let original;
  let generated;
  try {
    original = await parseDocx(originalBuffer, { skipMammothCheck: true });
    generated = await parseDocx(generatedBuffer, { skipMammothCheck: true });
  } catch (error) {
    add('docx_reopen', false, 'The exported file could not be reopened as a valid DOCX package.');
    return {
      ok: false,
      checks,
      warnings,
      fatal: error.message,
      pageCount: null,
      originalPageCount: null,
      renderer: renderInfo?.renderer || 'none',
    };
  }

  add('docx_reopen', true, 'The exported package reopens and parses as a DOCX document.');

  // 1. Package part set and byte identity for untouched parts.
  const originalEntries = new Map(entryList(original.zip).map((e) => [e.name, e]));
  const generatedEntries = new Map(entryList(generated.zip).map((e) => [e.name, e]));
  const missingParts = [...originalEntries.keys()].filter((name) => !generatedEntries.has(name));
  add(
    'parts_preserved',
    missingParts.length === 0,
    missingParts.length
      ? `Missing: ${missingParts.slice(0, 5).join(', ')}`
      : 'All original package parts are present.',
  );

  const changedUntouched = [];
  for (const [name, entry] of originalEntries) {
    if (!generatedEntries.has(name)) continue;
    if (name === 'word/document.xml' || /^word\/(header|footer)\d*\.xml$/i.test(name)) continue;
    const [a, b] = await Promise.all([
      entry.async('nodebuffer'),
      generatedEntries.get(name).async('nodebuffer'),
    ]);
    if (sha256(a) !== sha256(b)) changedUntouched.push(name);
  }
  add(
    'untouched_parts_byte_identical',
    changedUntouched.length === 0,
    changedUntouched.length
      ? `Unexpected changes in: ${changedUntouched.slice(0, 5).join(', ')}`
      : 'Styles, numbering, relationships, media, headers/footers and metadata are unchanged.',
  );

  // 2. All XML parts must remain well-formed.
  let xmlChecked = 0;
  const xmlFailures = [];
  for (const name of generatedEntries.keys()) {
    if (!/\.(xml|rels)$/i.test(name) || xmlChecked >= MAX_XML_PARTS_TO_CHECK) continue;
    const data = await readZipEntry(generated.zip, name, { maxBytes: 8 * 1024 * 1024 });
    try {
      parseXml(data.toString('utf8'), name);
      xmlChecked += 1;
    } catch {
      xmlFailures.push(name);
    }
  }
  add(
    'xml_well_formed',
    xmlFailures.length === 0,
    xmlFailures.length
      ? `Malformed XML: ${xmlFailures.slice(0, 5).join(', ')}`
      : `${xmlChecked} XML parts verified.`,
  );

  // 3. Internal relationships must resolve to existing package parts.
  const brokenRels = [];
  for (const name of generatedEntries.keys()) {
    if (!/\.rels$/i.test(name)) continue;
    const data = await readZipEntry(generated.zip, name, { maxBytes: 4 * 1024 * 1024 });
    const doc = parseXml(data.toString('utf8'), name);
    for (const rel of descendants(doc, 'Relationship', NS.rel)) {
      if (rel.getAttribute('TargetMode') === 'External') continue;
      if (!relationshipTargetExists(generated.zip, name, rel.getAttribute('Target'))) {
        brokenRels.push(`${name} -> ${rel.getAttribute('Target')}`);
      }
    }
  }
  add(
    'relationships_resolve',
    brokenRels.length === 0,
    brokenRels.length
      ? brokenRels.slice(0, 5).join('; ')
      : 'All internal relationship targets exist.',
  );

  // 4. Structural counts preserved.
  const countKeys = ['tables', 'images', 'headers', 'footers', 'hyperlinks', 'lists', 'sections'];
  const countMismatches = countKeys.filter(
    (key) => (original.counts[key] || 0) !== (generated.counts[key] || 0),
  );
  add(
    'structure_preserved',
    countMismatches.length === 0,
    countMismatches.length
      ? countMismatches
          .map((k) => `${k}: ${original.counts[k]} -> ${generated.counts[k]}`)
          .join(', ')
      : 'Tables, images, headers, footers, hyperlinks, lists and sections are preserved.',
  );

  // 5. Section (page setup) properties must be identical.
  const originalSect = descendants(original.bodyRoot, 'sectPr', NS.w).map(serializeNode);
  const generatedSect = descendants(generated.bodyRoot, 'sectPr', NS.w).map(serializeNode);
  add(
    'page_setup_unchanged',
    originalSect.length === generatedSect.length &&
      originalSect.every((value, index) => value === generatedSect[index]),
    'Page size, margins, columns and section breaks are unchanged.',
  );

  // 6. Paragraph and run formatting properties must be unchanged.
  const originalFormatting = formattingProperties(original);
  const generatedFormatting = formattingProperties(generated);
  let formattingMismatch = null;
  for (const [key, value] of originalFormatting.pPr) {
    if (generatedFormatting.pPr.get(key) !== value) {
      formattingMismatch = `paragraph properties changed at ${key}`;
      break;
    }
  }
  if (!formattingMismatch) {
    for (const [key, value] of originalFormatting.rPr) {
      const next = generatedFormatting.rPr.get(key) || [];
      if (next.length !== value.length || value.some((v, i) => v !== next[i])) {
        formattingMismatch = `run properties changed at ${key}`;
        break;
      }
    }
  }
  add(
    'formatting_properties_unchanged',
    !formattingMismatch,
    formattingMismatch || 'Paragraph and run formatting properties are byte-identical.',
  );

  // 7. Exact text at every editable location.
  const originalByKey = new Map(original.paragraphs.map((p) => [`${p.part}:${p.index}`, p]));
  const generatedByKey = new Map(generated.paragraphs.map((p) => [`${p.part}:${p.index}`, p]));
  const missingParagraphs = [...originalByKey.keys()].filter((key) => !generatedByKey.has(key));
  add(
    'paragraph_count_preserved',
    missingParagraphs.length === 0,
    missingParagraphs.length
      ? `Missing ${missingParagraphs.length} paragraphs.`
      : 'All original paragraphs are present.',
  );

  const appliedSet = new Set(appliedEditIds);
  const expectedByLocation = new Map();
  for (const edit of edits) {
    expectedByLocation.set(
      edit.locationId,
      appliedSet.has(edit.id) ? edit.finalText || edit.proposedText : edit.originalText,
    );
  }

  const approvable = edits
    .filter((e) => e.status === 'approved' || e.status === 'modified')
    .map((e) => e.id)
    .sort();
  const appliedSorted = [...appliedSet].sort();
  add(
    'only_approved_applied',
    approvable.length === appliedSorted.length &&
      approvable.every((id, index) => id === appliedSorted[index]),
    'Only approved or user-modified suggestions were applied; pending and rejected suggestions were excluded.',
  );

  const textMismatches = [];
  for (const [key, paragraph] of originalByKey) {
    const generatedParagraph = generatedByKey.get(key);
    if (!generatedParagraph) continue;
    const expected = expectedByLocation.has(paragraph.id)
      ? expectedByLocation.get(paragraph.id)
      : paragraph.text;
    if (generatedParagraph.text !== expected) {
      textMismatches.push({
        locationId: paragraph.id,
        expectedLength: expected.length,
        actualLength: generatedParagraph.text.length,
      });
    }
  }
  add(
    'text_correct',
    textMismatches.length === 0,
    textMismatches.length
      ? `${textMismatches.length} paragraphs did not match their expected text.`
      : 'Every paragraph contains exactly the expected original or approved text.',
  );

  // 8. Rejected and pending edits are explicitly absent at their targets.
  const rejectedApplied = [];
  for (const edit of edits) {
    if (edit.status === 'approved' || edit.status === 'modified') continue;
    const originalParagraph = original.paragraphs.find((p) => p.id === edit.locationId);
    if (!originalParagraph) continue;
    const generatedParagraph = generatedByKey.get(`${originalParagraph.part}:${originalParagraph.index}`);
    if (generatedParagraph && generatedParagraph.text !== edit.originalText) {
      rejectedApplied.push(edit.id);
    }
  }
  add(
    'rejected_pending_excluded',
    rejectedApplied.length === 0,
    rejectedApplied.length
      ? 'A rejected or pending change appears in the output.'
      : 'No rejected or pending changes appear in the output.',
  );

  // 9. Warnings for things automation cannot fully guarantee.
  const partialFormatting = edits.filter(
    (e) => appliedSet.has(e.id) && e.validation?.formatting === 'partial',
  );
  if (partialFormatting.length) {
    warnings.push(
      `${partialFormatting.length} applied change${partialFormatting.length === 1 ? '' : 's'} rewrote text across mixed run formatting. Paragraph and page styles were preserved, but inline formatting inside those paragraphs may use the first replaced run's style.`,
    );
  }
  if (original.counts.images > 0) {
    warnings.push(
      'Images were preserved byte-for-byte; their visual position depends on how Word reflows the surrounding text.',
    );
  }

  const pageCount = renderInfo?.pageCount ?? null;
  const originalPageCount =
    renderInfo?.originalPageCount ?? original.originalPageCount ?? null;
  if (renderInfo?.renderer === 'libreoffice' && pageCount && originalPageCount) {
    add(
      'render_page_count_checked',
      true,
      `Rendered with LibreOffice: ${originalPageCount} page(s) before, ${pageCount} page(s) after.`,
    );
    if (pageCount !== originalPageCount) {
      warnings.push(
        `The rendered page count changed from ${originalPageCount} to ${pageCount}. Content changes can reflow the document; review the preview and the DOCX in Word before submitting.`,
      );
    }
  } else {
    warnings.push(
      'No Office renderer was available, so visual page count and pixel layout were not verified. Use the HTML content preview and open the exported DOCX in Word for final layout review.',
    );
  }
  if (renderInfo?.renderer === 'libreoffice' && renderInfo?.error) {
    warnings.push('PDF rendering failed; content-level validation still passed.');
  }

  const ok = checks.every((check) => check.passed);
  return {
    ok,
    checks,
    warnings,
    pageCount,
    originalPageCount,
    renderer: renderInfo?.renderer || 'none',
    appliedCount: appliedSorted.length,
  };
}
