import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { parseDocx } from './docxParser.js';
import { NS, isW, wChild, wChildren } from './xml.js';

const CANDIDATES = [
  config.LIBREOFFICE_PATH,
  'soffice',
  'libreoffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
];

let cachedRenderer = null;

function isExecutable(candidate) {
  if (!candidate) return false;
  if (candidate.includes(path.sep) || candidate.includes('/')) return existsSync(candidate);
  const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(lookup, [candidate], { encoding: 'utf8', timeout: 5000 });
  return result.status === 0 && Boolean(result.stdout?.trim());
}

export function detectRenderer() {
  if (cachedRenderer !== null) return cachedRenderer;
  for (const candidate of CANDIDATES) {
    if (isExecutable(candidate)) {
      cachedRenderer = candidate;
      logger.info('LibreOffice renderer detected', { executable: path.basename(candidate) });
      return cachedRenderer;
    }
  }
  cachedRenderer = false;
  logger.info('LibreOffice renderer not found; using HTML content preview');
  return false;
}

export function rendererStatus() {
  const executable = detectRenderer();
  return {
    available: Boolean(executable),
    renderer: executable ? 'libreoffice' : 'none',
    previewMode: executable ? 'pdf' : 'html',
  };
}

async function runDocxToPdf(docxBuffer) {
  const executable = detectRenderer();
  if (!executable) throw new Error('LibreOffice is not available.');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'art-render-'));
  const profileDir = path.join(tempDir, 'profile');
  const inputPath = path.join(tempDir, 'input.docx');
  const outputDir = path.join(tempDir, 'out');
  await fs.mkdir(outputDir);
  await fs.mkdir(profileDir);
  await fs.writeFile(inputPath, docxBuffer);

  try {
    await new Promise((resolve, reject) => {
      const args = [
        '--headless',
        '--norestore',
        '--nolockcheck',
        '--nodefault',
        `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
        '--convert-to',
        'pdf',
        '--outdir',
        outputDir,
        inputPath,
      ];
      const child = spawn(executable, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Document rendering timed out.'));
      }, 90000);
      child.stderr.on('data', (chunk) => {
        if (stderr.length < 4000) stderr += chunk.toString();
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`LibreOffice exited with code ${code}. ${stderr.slice(0, 500)}`));
        } else {
          resolve();
        }
      });
    });
    const files = await fs.readdir(outputDir);
    const pdfName = files.find((name) => name.toLowerCase().endsWith('.pdf'));
    if (!pdfName) throw new Error('LibreOffice did not produce a PDF file.');
    const pdfBuffer = await fs.readFile(path.join(outputDir, pdfName));
    const pdf = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true, updateMetadata: false });
    return { pdfBuffer, pageCount: pdf.getPageCount() };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Render DOCX to PDF when LibreOffice is available. Returns null when no
 * renderer exists; callers must fall back to the HTML content preview.
 */
export async function renderToPdf(docxBuffer) {
  if (!detectRenderer()) return null;
  try {
    return await runDocxToPdf(docxBuffer);
  } catch (error) {
    logger.warn('Document rendering failed', { error: error.message });
    return { pdfBuffer: null, pageCount: null, error: error.message };
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeColor(value) {
  return /^[0-9a-fA-F]{6}$/.test(value || '') ? `#${value}` : null;
}

function renderRuns(paragraph) {
  if (!paragraph.textRuns || paragraph.textRuns.length === 0) {
    return escapeHtml(paragraph.text).replace(/\n/g, '<br>').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
  }
  return paragraph.textRuns
    .map((run) => {
      const raw = (run.text || '')
        .replace(/\t/g, '    ')
        .replace(/\n/g, '<br>')
        .split(/(<br>)/)
        .map((part) => (part === '<br>' ? part : escapeHtml(part)))
        .join('');
      if (!raw) return '';
      const styles = [];
      const f = run.formatting || {};
      if (f.bold) styles.push('font-weight:700');
      if (f.italic) styles.push('font-style:italic');
      if (f.underline) styles.push('text-decoration:underline');
      if (f.strike) styles.push('text-decoration:line-through');
      if (f.smallCaps) styles.push('font-variant:small-caps');
      const color = safeColor(f.color);
      if (color) styles.push(`color:${color}`);
      if (f.fontSize) styles.push(`font-size:${Math.max(6, f.fontSize / 2)}pt`);
      const styleAttr = styles.length ? ` style="${styles.join(';')}"` : '';
      if (run.hyperlink) return `<span class="doc-link"${styleAttr}>${raw}</span>`;
      return `<span${styleAttr}>${raw}</span>`;
    })
    .join('');
}

function renderParagraph(node, paragraph, { inTable = false } = {}) {
  const alignment = paragraph?.alignment;
  const alignStyle = alignment ? ` style="text-align:${escapeHtml(alignment)}"` : '';
  const classes = ['doc-p'];
  if (paragraph?.isHeading) classes.push('doc-heading', `doc-heading-${Math.min(3, paragraph.headingLevel || 1)}`);
  if (paragraph?.isList) classes.push('doc-list-item');
  if (!paragraph?.text?.trim()) classes.push('doc-empty');
  if (inTable) classes.push('doc-table-p');
  const content = paragraph ? renderRuns(paragraph) : escapeHtml('');
  const bullet = paragraph?.isList ? '<span class="doc-bullet" aria-hidden="true">•</span>' : '';
  return `<p class="${classes.join(' ')}"${alignStyle}>${bullet}${content || '&nbsp;'}</p>`;
}

function summarizeParagraphs(root, nodeMap, inTable = false) {
  let html = '';
  for (let child = root.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== 1) continue;
    if (isW(child, 'p')) {
      html += renderParagraph(child, nodeMap.get(child), { inTable });
    } else if (isW(child, 'tbl')) {
      html += '<table class="doc-table"><tbody>';
      for (const row of wChildren(child, 'tr')) {
        html += '<tr>';
        for (const cell of wChildren(row, 'tc')) {
          const tcPr = wChild(cell, 'tcPr');
          const gridSpan = tcPr ? wChild(tcPr, 'gridSpan') : null;
          const span = gridSpan ? Number(gridSpan.getAttribute('w:val')) || 1 : 1;
          const spanAttr = span > 1 ? ` colspan="${Math.min(span, 20)}"` : '';
          html += `<td${spanAttr}>${summarizeParagraphs(cell, nodeMap, true)}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
    } else if (isW(child, 'sdt')) {
      const content = wChild(child, 'sdtContent');
      if (content) html += summarizeParagraphs(content, nodeMap, inTable);
    }
  }
  return html;
}

/**
 * Build a readable, sanitized HTML content preview from the actual exported
 * DOCX XML. This is explicitly a content preview, not a pixel-perfect page
 * render; PDF pages are used when LibreOffice is available.
 */
export function renderHtmlPreview(parsed) {
  const bodyRoot = parsed.parts.get('body')?.root;
  const bodyHtml = bodyRoot ? summarizeParagraphs(bodyRoot, parsed.nodeMap) : '';
  const headerParts = [...parsed.parts.values()].filter((p) => p.kind === 'header');
  const footerParts = [...parsed.parts.values()].filter((p) => p.kind === 'footer');
  const extra = [...headerParts, ...footerParts]
    .map((part) => {
      const label = part.kind === 'header' ? 'Header' : 'Footer';
      return `<section class="doc-extra"><div class="doc-extra-label">${label} (preserved)</div>${summarizeParagraphs(part.root, parsed.nodeMap)}</section>`;
    })
    .join('');

  return {
    html: `<div class="doc-preview">${bodyHtml}${extra}</div>`,
    paragraphCount: parsed.paragraphs.length,
    counts: parsed.counts,
    warnings: parsed.warnings,
    note:
      'This is an HTML content preview generated directly from the exported DOCX. Word may paginate and reflow it differently. Open the downloaded DOCX for final layout review.',
  };
}

export async function buildPreview(buffer) {
  const parsed = await parseDocx(buffer, { skipMammothCheck: true });
  return renderHtmlPreview(parsed);
}

export function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
