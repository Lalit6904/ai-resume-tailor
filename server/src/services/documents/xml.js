import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { AppError } from '../../utils/errors.js';

export const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
};

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

export function parseXml(xml, partName = 'XML part') {
  const errors = [];
  const parser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (msg) => errors.push(String(msg)),
      fatalError: (msg) => errors.push(String(msg)),
    },
  });
  let doc;
  try {
    doc = parser.parseFromString(xml, 'application/xml');
  } catch (error) {
    throw new AppError({
      status: 400,
      code: 'INVALID_DOCX_XML',
      message: `The DOCX contains unreadable XML in ${partName}.`,
      cause: error,
    });
  }
  if (!doc || !doc.documentElement || errors.length > 0) {
    throw new AppError({
      status: 400,
      code: 'INVALID_DOCX_XML',
      message: `The DOCX contains malformed XML in ${partName}.`,
      details: errors.slice(0, 3),
    });
  }
  return doc;
}

export function serializeXml(doc) {
  const xml = new XMLSerializer().serializeToString(doc);
  if (xml.startsWith('<?xml')) return xml;
  return XML_DECLARATION + xml;
}

export function isW(node, localName) {
  return Boolean(node && node.nodeType === 1 && node.namespaceURI === NS.w && node.localName === localName);
}

export function wChildren(node, localName) {
  const result = [];
  if (!node) return result;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (isW(child, localName)) result.push(child);
  }
  return result;
}

export function wChild(node, localName) {
  if (!node) return null;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (isW(child, localName)) return child;
  }
  return null;
}

export function descendants(node, localName, namespace = NS.w, limit = 100000) {
  const result = [];
  if (!node) return result;
  const walker = function walk(current) {
    if (result.length >= limit) return;
    for (let child = current.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== 1) continue;
      if (child.localName === localName && child.namespaceURI === namespace) result.push(child);
      walk(child);
    }
  };
  walker(node);
  return result;
}

export function hasDescendant(node, localName, namespace = NS.w) {
  if (!node) return false;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== 1) continue;
    if (child.localName === localName && child.namespaceURI === namespace) return true;
    if (hasDescendant(child, localName, namespace)) return true;
  }
  return false;
}

export function getWAttr(node, name) {
  if (!node || node.nodeType !== 1) return null;
  return node.getAttributeNS(NS.w, name) ?? node.getAttribute(`w:${name}`);
}

export function getRAttr(node, name) {
  if (!node || node.nodeType !== 1) return null;
  return node.getAttributeNS(NS.r, name) ?? node.getAttribute(`r:${name}`);
}

export function textOf(node) {
  let text = '';
  if (!node) return text;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3 || child.nodeType === 4) text += child.data;
    else if (child.nodeType === 1) text += textOf(child);
  }
  return text;
}

export function nearestAncestor(node, localName, namespace = NS.w, stopAt = null) {
  let current = node?.parentNode;
  while (current) {
    if (current === stopAt) return null;
    if (current.nodeType === 1 && current.localName === localName && current.namespaceURI === namespace) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

export function splitPathSegments(target) {
  return target.replace(/\\/g, '/').split('/').filter(Boolean);
}

/** Resolve an OPC relationship target relative to the part that owns the .rels file. */
export function resolveRelationshipTarget(sourcePart, target) {
  if (!target) return null;
  if (target.startsWith('/')) return target.replace(/^\/+/, '');
  const segments = sourcePart.split('/').filter(Boolean);
  segments.pop(); // remove the source part's file name
  for (const segment of splitPathSegments(target)) {
    if (segment === '..') segments.pop();
    else if (segment !== '.') segments.push(segment);
  }
  return segments.join('/');
}

export function relsPathForPart(partPath) {
  const segments = partPath.split('/');
  const file = segments.pop();
  return `${segments.join('/')}/_rels/${file}.rels`;
}

export function safeChars(text) {
  // XML 1.0 valid characters only. Word cannot store most control characters.
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(text);
}
