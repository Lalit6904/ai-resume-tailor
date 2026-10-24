import crypto from 'node:crypto';
import mammoth from 'mammoth';
import { loadSafeDocx, readZipEntry } from './docxSecurity.js';
import {
  NS,
  descendants,
  getWAttr,
  hasDescendant,
  isW,
  nearestAncestor,
  parseXml,
  resolveRelationshipTarget,
  wChild,
  wChildren,
} from './xml.js';
import { serializeNode } from './serializeNode.js';

const KNOWN_SECTIONS = [
  'professional summary',
  'summary',
  'profile',
  'about',
  'objective',
  'work experience',
  'experience',
  'professional experience',
  'employment history',
  'employment',
  'projects',
  'personal projects',
  'technical projects',
  'education',
  'skills',
  'technical skills',
  'core skills',
  'core competencies',
  'certifications',
  'certificates',
  'awards',
  'honors',
  'achievements',
  'publications',
  'volunteer experience',
  'volunteering',
  'languages',
  'interests',
  'activities',
  'leadership',
  'training',
  'coursework',
  'references',
];

const KNOWN_SECTION_RE = new RegExp(
  `^(${KNOWN_SECTIONS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:?$`,
  'i',
);

function isBoldParagraph(node) {
  const runs = descendants(node, 'r', NS.w, 50);
  for (const run of runs) {
    const rPr = wChild(run, 'rPr');
    const b = wChild(rPr, 'b');
    if (b) {
      const val = getWAttr(b, 'val');
      if (val !== '0' && val !== 'false' && val !== 'off') return true;
    }
  }
  return false;
}

function readBooleanProp(rPr, name) {
  const el = wChild(rPr, name);
  if (!el) return false;
  const val = getWAttr(el, 'val');
  return !['0', 'false', 'off', 'none'].includes(val || '');
}

function runFormatting(run) {
  const rPr = wChild(run, 'rPr');
  const colorEl = wChild(rPr, 'color');
  const sizeEl = wChild(rPr, 'sz');
  return {
    bold: readBooleanProp(rPr, 'b'),
    italic: readBooleanProp(rPr, 'i'),
    underline: Boolean(wChild(rPr, 'u')) && getWAttr(wChild(rPr, 'u'), 'val') !== 'none',
    strike: readBooleanProp(rPr, 'strike'),
    smallCaps: readBooleanProp(rPr, 'smallCaps'),
    color: colorEl ? getWAttr(colorEl, 'val') : null,
    fontSize: sizeEl ? Number(getWAttr(sizeEl, 'val')) || null : null,
  };
}

function styleSignature(rPr) {
  if (!rPr) return '';
  return serializeNode(rPr);
}

function loadStyles(xml) {
  const map = new Map();
  if (!xml) return map;
  const doc = parseXml(xml, 'styles.xml');
  const styles = descendants(doc, 'style', NS.w);
  for (const style of styles) {
    const styleId = getWAttr(style, 'styleId');
    if (!styleId) continue;
    const nameEl = wChild(style, 'name');
    const basedOnEl = wChild(style, 'basedOn');
    const pPr = wChild(style, 'pPr');
    const outlineEl = pPr ? wChild(pPr, 'outlineLvl') : null;
    const qFormat = style.getAttribute('w:qFormat') !== null;
    map.set(styleId, {
      styleId,
      name: nameEl ? getWAttr(nameEl, 'val') || styleId : styleId,
      basedOn: basedOnEl ? getWAttr(basedOnEl, 'val') : null,
      outlineLevel: outlineEl ? Number(getWAttr(outlineEl, 'val')) : null,
      qFormat,
    });
  }
  return map;
}

function resolveStyle(styleMap, styleId, depth = 0) {
  if (!styleId || depth > 5) return null;
  const style = styleMap.get(styleId);
  if (!style) return null;
  if (style.basedOn) {
    const parent = resolveStyle(styleMap, style.basedOn, depth + 1);
    if (parent) {
      return {
        ...style,
        name: style.name,
        outlineLevel: style.outlineLevel ?? parent.outlineLevel,
        headingLevel: style.headingLevel ?? parent.headingLevel,
      };
    }
  }
  return style;
}

function detectHeading(paragraphNode, style, text) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 90) return { isHeading: false, level: null };
  if (style) {
    const name = `${style.name} ${style.styleId}`.toLowerCase();
    if (/^title\b/.test(style.name.toLowerCase())) {
      return { isHeading: true, level: 0 };
    }
    const headingMatch = name.match(/heading\s*([1-6])/);
    if (headingMatch) return { isHeading: true, level: Number(headingMatch[1]) };
    if (typeof style.outlineLevel === 'number' && style.outlineLevel >= 0 && style.outlineLevel < 6) {
      return { isHeading: true, level: style.outlineLevel + 1 };
    }
  }
  if (KNOWN_SECTION_RE.test(trimmed) && trimmed.length <= 45) {
    return { isHeading: true, level: 1 };
  }
  if (
    trimmed.length <= 45 &&
    /^[A-Z][A-Z\s&/,-]+$/.test(trimmed) &&
    isBoldParagraph(paragraphNode)
  ) {
    return { isHeading: true, level: 1 };
  }
  return { isHeading: false, level: null };
}

function paragraphAlignment(node) {
  const pPr = wChild(node, 'pPr');
  if (!pPr) return null;
  const jc = wChild(pPr, 'jc');
  return jc ? getWAttr(jc, 'val') : null;
}

function paragraphNumbering(node) {
  const pPr = wChild(node, 'pPr');
  if (!pPr) return false;
  return Boolean(wChild(pPr, 'numPr'));
}

/**
 * Collect text runs and unsupported-structure reasons for a paragraph.
 * Runs inside nested paragraphs (e.g. text boxes) are deliberately ignored.
 */
function analyzeParagraphNode(node) {
  const runs = [];
  const reasons = new Set();
  const flags = {
    hasHyperlink: false,
    hasField: false,
    hasDrawing: false,
    hasAnnotation: false,
    hasTabOrBreak: false,
    hasTrackedChange: false,
    hasSdt: false,
    hasSymbol: false,
    hasSpecialText: false,
    nestedRun: false,
  };

  function processRun(run) {
    const rPr = wChild(run, 'rPr');
    const parent = run.parentNode;
    const hyperlink = nearestAncestor(run, 'hyperlink', NS.w, node);
    if (hyperlink) flags.hasHyperlink = true;
    const direct = parent === node;
    if (!direct) flags.nestedRun = true;
    if (hasDescendant(run, 'fldChar') || hasDescendant(run, 'instrText')) flags.hasField = true;
    if (hasDescendant(run, 'drawing') || hasDescendant(run, 'pict') || hasDescendant(run, 'object')) {
      flags.hasDrawing = true;
    }
    if (
      hasDescendant(run, 'footnoteReference') ||
      hasDescendant(run, 'endnoteReference') ||
      hasDescendant(run, 'commentReference')
    ) {
      flags.hasAnnotation = true;
    }
    if (hasDescendant(run, 'sdt')) flags.hasSdt = true;
    if (hasDescendant(run, 'sym')) flags.hasSymbol = true;

    let text = '';
    const textNodes = [];
    for (let child = run.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== 1) continue;
      if (isW(child, 't')) {
        text += child.textContent || '';
        textNodes.push(child);
      } else if (isW(child, 'tab')) {
        text += '\t';
        flags.hasTabOrBreak = true;
      } else if (isW(child, 'br') || isW(child, 'cr')) {
        text += '\n';
        flags.hasTabOrBreak = true;
      } else if (isW(child, 'noBreakHyphen')) {
        text += '\u2011';
        flags.hasSpecialText = true;
      } else if (isW(child, 'softHyphen')) {
        // invisible
        flags.hasSpecialText = true;
      } else if (isW(child, 'delText')) {
        text += child.textContent || '';
        flags.hasTrackedChange = true;
      } else if (isW(child, 'fldChar') || isW(child, 'instrText')) {
        flags.hasField = true;
      } else if (isW(child, 'drawing') || isW(child, 'pict') || isW(child, 'object')) {
        flags.hasDrawing = true;
      }
    }
    if (text.length > 0 || textNodes.length > 0) {
      runs.push({
        node: run,
        textNodes,
        text,
        signature: styleSignature(rPr),
        direct,
        hyperlink: Boolean(hyperlink),
        formatting: runFormatting(run),
      });
    }
  }

  function walk(current) {
    for (let child = current.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== 1) continue;
      if (isW(child, 'p')) continue; // nested paragraph (text box)
      if (isW(child, 'r')) {
        processRun(child);
        continue;
      }
      if (isW(child, 'hyperlink')) flags.hasHyperlink = true;
      if (isW(child, 'fldSimple')) flags.hasField = true;
      if (isW(child, 'ins') || isW(child, 'del') || isW(child, 'moveFrom') || isW(child, 'moveTo')) {
        flags.hasTrackedChange = true;
      }
      if (isW(child, 'sdt')) flags.hasSdt = true;
      if (isW(child, 'txbxContent')) flags.hasDrawing = true;
      walk(child);
    }
  }
  walk(node);

  if (flags.hasHyperlink) reasons.add('hyperlink');
  if (flags.hasField) reasons.add('field');
  if (flags.hasDrawing) reasons.add('drawing');
  if (flags.hasAnnotation) reasons.add('annotation');
  if (flags.hasTabOrBreak) reasons.add('tab_or_break');
  if (flags.hasTrackedChange) reasons.add('tracked_change');
  if (flags.hasSdt) reasons.add('structured_document_tag');
  if (flags.hasSymbol) reasons.add('symbol');
  if (flags.hasSpecialText) reasons.add('special_text');
  if (flags.nestedRun) reasons.add('nested_content');

  const text = runs.map((r) => r.text).join('');
  const nonEmptyRuns = runs.filter((r) => r.text.length > 0);
  const signatures = new Set(nonEmptyRuns.map((r) => r.signature));
  return {
    text,
    runs,
    reasons: [...reasons],
    mixedFormatting: signatures.size > 1,
    alignment: paragraphAlignment(node),
    isList: paragraphNumbering(node),
  };
}

function parseRelationships(xml, sourcePart) {
  const map = new Map();
  if (!xml || !xml.trim()) return map;
  const doc = parseXml(xml, `${sourcePart}.rels`);
  const rels = descendants(doc, 'Relationship', NS.rel);
  for (const rel of rels) {
    const id = rel.getAttribute('Id');
    const type = rel.getAttribute('Type') || '';
    const target = rel.getAttribute('Target') || '';
    const targetMode = rel.getAttribute('TargetMode') || 'Internal';
    map.set(id, {
      id,
      type,
      target,
      targetMode,
      resolvedPath:
        targetMode === 'External' ? null : resolveRelationshipTarget(sourcePart, target),
    });
  }
  return map;
}

function partKeyFromPath(path, fallbackPrefix) {
  const file = path.split('/').pop() || `${fallbackPrefix}.xml`;
  const base = file.replace(/\.xml$/i, '').replace(/[^a-zA-Z0-9_-]/g, '');
  return base || fallbackPrefix;
}

function collectParagraphs({
  root,
  partKey,
  partPath,
  kind,
  state,
  counters,
  tableContext = null,
  inSdt = false,
}) {
  let index = 0;
  const localParagraphs = [];

  function walkBlocks(parent, context) {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== 1) continue;
      if (isW(child, 'p')) {
        const analysis = analyzeParagraphNode(child);
        const styleId = getWAttr(wChild(child, 'pPr') ? wChild(wChild(child, 'pPr'), 'pStyle') : null, 'val');
        const style = resolveStyle(state.styleMap, styleId);
        const styleName = style?.name || null;
        const heading = detectHeading(child, style, analysis.text);
        const text = analysis.text;
        const reasons = [...analysis.reasons];
        if (context.inSdt) reasons.push('structured_document_tag');
        if (kind === 'header' || kind === 'footer') reasons.push('header_footer');
        if (heading.isHeading) reasons.push('heading');
        if (!text.trim()) reasons.push('empty');
        if (text.length > 4000) reasons.push('too_long');

        // Track a stable per-part index, including read-only paragraphs.
        index += 1;
        const editable = reasons.length === 0;
        // Structural location IDs stay stable when only paragraph text changes,
        // so exports can be verified against the same location after re-parsing.
        const paragraph = {
          id: `${partKey}:p${index - 1}`,
          part: partKey,
          partPath,
          kind: context.table ? kindInTable(kind) : kind,
          index: index - 1,
          order: counters.order++,
          node: child,
          text,
          section: kind === 'header'
            ? 'Header'
            : kind === 'footer'
              ? 'Footer'
              : heading.isHeading
                ? text.trim()
                : state.currentSection,
          styleId: styleId || null,
          styleName,
          isHeading: heading.isHeading,
          headingLevel: heading.level,
          editable,
          reasons: reasons.filter((r, i) => reasons.indexOf(r) === i),
          runCount: analysis.runs.length,
          mixedFormatting: analysis.mixedFormatting,
          isList: analysis.isList,
          alignment: analysis.alignment,
          textRuns: analysis.runs,
          tableContext: context.table || null,
        };
        localParagraphs.push(paragraph);
        state.paragraphs.push(paragraph);
        state.nodeMap.set(child, paragraph);

        if (heading.isHeading) {
          const headingText = text.trim().replace(/\s+/g, ' ');
          state.currentSection = headingText || styleName || 'General';
        }
      } else if (isW(child, 'tbl')) {
        counters.tables += 1;
        const tableIndex = counters.tables - 1;
        let rowIndex = 0;
        for (const row of wChildren(child, 'tr')) {
          let cellIndex = 0;
          for (const cell of wChildren(row, 'tc')) {
            walkBlocks(cell, {
              table: { tableIndex, rowIndex, cellIndex },
              inSdt: context.inSdt,
            });
            cellIndex += 1;
          }
          rowIndex += 1;
        }
      } else if (isW(child, 'sdt')) {
        const content = wChild(child, 'sdtContent');
        if (content) walkBlocks(content, { ...context, inSdt: true });
        else state.unsupported.add('content_control');
      } else if (isW(child, 'sectPr')) {
        counters.sections += 1;
      } else if (isW(child, 'altChunk') || isW(child, 'subDoc')) {
        state.unsupported.add('embedded_document');
      } else if (isW(child, 'bookmarkStart') || isW(child, 'bookmarkEnd')) {
        // structural only
      } else if (isW(child, 'customXml') || isW(child, 'ins') || isW(child, 'del')) {
        walkBlocks(child, context);
        if (isW(child, 'ins') || isW(child, 'del')) state.unsupported.add('tracked_change');
      } else if (isW(child, 'commentRangeStart') || isW(child, 'commentRangeEnd')) {
        state.unsupported.add('comments');
      }
    }
  }

  walkBlocks(root, {
    table: tableContext,
    inSdt,
  });
  return localParagraphs;
}

function kindInTable(kind) {
  return kind === 'body' ? 'table' : kind;
}

async function mammothCrossCheck(buffer, ourText) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const tokens = (value) =>
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2);
    const mammothTokens = tokens(result.value || '');
    if (mammothTokens.length < 20) return null;
    const ourTokens = new Set(tokens(ourText));
    const missing = mammothTokens.filter((token) => !ourTokens.has(token));
    const coverage = 1 - missing.length / mammothTokens.length;
    if (coverage < 0.75) {
      return {
        coverage,
        warning:
          'Some text detected by the general DOCX reader could not be mapped to editable paragraphs. Complex content (text boxes, embedded objects, or tracked changes) may be present.',
      };
    }
    return { coverage, warning: null };
  } catch {
    return null;
  }
}

/**
 * Parse a DOCX buffer into a structured, editable representation.
 * The returned nodes belong to in-memory XML DOMs; callers must not persist them.
 */
export async function parseDocx(buffer, { skipMammothCheck = false } = {}) {
  const zip = await loadSafeDocx(buffer);
  const documentHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const documentXmlBuffer = await readZipEntry(zip, 'word/document.xml');
  const documentXml = documentXmlBuffer.toString('utf8');
  const documentDom = parseXml(documentXml, 'document.xml');
  const root = documentDom.documentElement;
  const bodyRoot = wChild(root, 'body') || root;

  const stylesXmlBuffer = await readZipEntry(zip, 'word/styles.xml');
  const styleMap = loadStyles(stylesXmlBuffer?.toString('utf8'));

  const documentRelsBuffer = await readZipEntry(zip, 'word/_rels/document.xml.rels');
  const documentRels = parseRelationships(
    documentRelsBuffer?.toString('utf8') || '',
    'word/document.xml',
  );

  const state = {
    documentHash,
    styleMap,
    paragraphs: [],
    nodeMap: new WeakMap(),
    currentSection: 'General',
    unsupported: new Set(),
  };
  const counters = { order: 0, tables: 0, sections: 0, hyperlinks: 0, drawings: 0 };

  // Body paragraphs (document order, tables inline).
  collectParagraphs({
    root: bodyRoot,
    partKey: 'body',
    partPath: 'word/document.xml',
    kind: 'body',
    state,
    counters,
  });
  const wordSectionCount = descendants(bodyRoot, 'sectPr', NS.w).length;

  const parts = new Map([
    ['body', { partKey: 'body', path: 'word/document.xml', kind: 'body', dom: documentDom, root: bodyRoot }],
  ]);

  const headerFooterRels = [...documentRels.values()].filter((rel) =>
    /\/(header|footer)$/.test(rel.type),
  );
  for (const rel of headerFooterRels) {
    if (rel.targetMode === 'External' || !rel.resolvedPath) continue;
    const path = rel.resolvedPath;
    if (!/^word\/[A-Za-z0-9._-]+\.xml$/.test(path)) {
      state.unsupported.add('external_header_footer');
      continue;
    }
    const xmlBuffer = await readZipEntry(zip, path);
    if (!xmlBuffer) {
      state.unsupported.add('missing_header_footer_part');
      continue;
    }
    const kind = rel.type.endsWith('/header') ? 'header' : 'footer';
    let partKey = partKeyFromPath(path, kind);
    let suffix = 1;
    while (parts.has(partKey)) {
      suffix += 1;
      partKey = `${partKeyFromPath(path, kind)}${suffix}`;
    }
    const dom = parseXml(xmlBuffer.toString('utf8'), path);
    parts.set(partKey, { partKey, path, kind, dom, root: dom.documentElement });
    state.currentSection = 'General';
    collectParagraphs({
      root: dom.documentElement,
      partKey,
      partPath: path,
      kind,
      state,
      counters,
    });
  }

  // Headings inside headers must not leak into body section tracking.
  const bodyParagraphs = state.paragraphs.filter((p) => p.part === 'body');
  const textToken = (p) => p.text;
  const bodyText = bodyParagraphs.map(textToken).join('\n');
  const allText = state.paragraphs.map(textToken).join('\n');
  const wordCount = allText
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean).length;

  const hyperlinks = state.paragraphs.filter((p) => p.reasons.includes('hyperlink')).length;
  counters.hyperlinks = hyperlinks;
  const mediaEntries = Object.keys(zip.files).filter(
    (name) => name.startsWith('word/media/') && !zip.files[name].dir,
  );
  const headerParts = [...parts.values()].filter((p) => p.kind === 'header').length;
  const footerParts = [...parts.values()].filter((p) => p.kind === 'footer').length;

  const warnings = new Set();
  if (state.unsupported.has('content_control')) {
    warnings.add('Content controls were found and are read-only.');
  }
  if (state.unsupported.has('tracked_change')) {
    warnings.add('Tracked changes were found. Accept or reject them in Word before uploading for best results.');
  }
  if (state.unsupported.has('comments')) {
    warnings.add('Document comments are preserved but were not analyzed.');
  }
  if (state.unsupported.has('embedded_document')) {
    warnings.add('Embedded external documents are not supported and were left untouched.');
  }
  if (state.unsupported.has('external_header_footer')) {
    warnings.add('An externally linked header or footer was left untouched.');
  }
  const nonEditableCount = state.paragraphs.filter((p) => !p.editable && p.text.trim()).length;
  if (nonEditableCount > 0) {
    const reasons = new Set(
      state.paragraphs.filter((p) => !p.editable && p.text.trim()).flatMap((p) => p.reasons),
    );
    if (reasons.has('header_footer')) {
      warnings.add('Headers and footers are preserved but remain read-only.');
    }
    if (reasons.has('hyperlink')) {
      warnings.add('Paragraphs containing hyperlinks are read-only to keep their links intact.');
    }
    if (reasons.has('field') || reasons.has('drawing')) {
      warnings.add(
        'Paragraphs containing fields, images, or text boxes are read-only. Their content is preserved untouched.',
      );
    }
    if (reasons.has('tab_or_break')) {
      warnings.add('Paragraphs containing tabs or manual line breaks are read-only.');
    }
  }

  if (!skipMammothCheck) {
    const crossCheck = await mammothCrossCheck(buffer, bodyText);
    if (crossCheck?.warning) warnings.add(crossCheck.warning);
  }

  const pageCount = await readPageCount(zip);

  const sections = [];
  const sectionCounts = new Map();
  for (const paragraph of state.paragraphs) {
    if (paragraph.kind !== 'body' && paragraph.kind !== 'table') continue;
    const name = paragraph.section || 'General';
    if (!sectionCounts.has(name)) {
      sectionCounts.set(name, {
        name,
        headingLevel: paragraph.isHeading ? paragraph.headingLevel : null,
        paragraphCount: 0,
      });
    }
    if (!paragraph.isHeading) sectionCounts.get(name).paragraphCount += 1;
  }
  sections.push(...sectionCounts.values());

  const paragraphs = state.paragraphs;
  const nodeMap = state.nodeMap;

  return {
    buffer,
    zip,
    documentHash,
    documentDom,
    bodyRoot: root,
    parts,
    paragraphs,
    nodeMap,
    sections,
    bodyText,
    allText,
    wordCount,
    counts: {
      tables: counters.tables,
      images: mediaEntries.length,
      headers: headerParts,
      footers: footerParts,
      hyperlinks: counters.hyperlinks,
      lists: paragraphs.filter((p) => p.isList).length,
      sections: wordSectionCount,
      resumeSections: sections.length,
    },
    warnings: [...warnings],
    unsupported: [...state.unsupported],
    originalPageCount: pageCount,
    documentXml,
  };
}

async function readPageCount(zip) {
  try {
    const buffer = await readZipEntry(zip, 'docProps/app.xml', { maxBytes: 1024 * 1024 });
    if (!buffer) return null;
    const match = buffer.toString('utf8').match(/<Pages>(\d+)<\/Pages>/i);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export function toAiParagraphs(parsed, { maxCharacters }) {
  // Send only content needed for tailoring. Contact details and headers/footers
  // are excluded or redacted to limit personal data sent to external providers.
  const emailRe = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  const phoneRe = /(?:\+?\d[\d\s().-]{7,}\d)/g;
  const urlRe = /(?:https?:\/\/|www\.)\S+/gi;
  const linkedinRe = /(?:linkedin\.com\/\S+|linkedin:\s*\S+)/gi;
  const redact = (value) =>
    value
      .replace(emailRe, '[email redacted]')
      .replace(linkedinRe, '[profile redacted]')
      .replace(urlRe, '[link redacted]')
      .replace(phoneRe, '[phone redacted]');

  const eligible = parsed.paragraphs.filter(
    (p) =>
      p.text.trim() &&
      !['header', 'footer'].includes(p.kind) &&
      !p.reasons.includes('hyperlink'),
  );

  const selected = [];
  let used = 0;
  for (const p of eligible) {
    const text = redact(p.text.trim());
    if (!text) continue;
    const candidate = {
      locationId: p.id,
      section: p.section,
      style: p.styleName || (p.isHeading ? 'Heading' : 'Body'),
      text,
      editable: p.editable,
    };
    const cost = text.length + 120;
    if (used + cost > maxCharacters) break;
    used += cost;
    selected.push(candidate);
  }
  return selected;
}
