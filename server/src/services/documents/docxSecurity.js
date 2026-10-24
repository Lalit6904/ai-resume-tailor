import JSZip from 'jszip';
import { AppError } from '../../utils/errors.js';

const MAX_ENTRIES = 4000;
const MAX_TOTAL_UNCOMPRESSED = 200 * 1024 * 1024; // 200 MiB
const MAX_SINGLE_ENTRY = 60 * 1024 * 1024; // 60 MiB
const MAX_COMPRESSION_RATIO = 250;

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Validate a DOCX/ZIP package before any XML is parsed.
 * Protects against zip bombs, path traversal, encrypted packages and macros.
 */
export async function loadSafeDocx(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    throw new AppError({
      status: 400,
      code: 'INVALID_DOCX',
      message: 'The uploaded file is empty or is not a valid DOCX document.',
    });
  }
  if (!buffer.subarray(0, 4).equals(ZIP_MAGIC)) {
    throw new AppError({
      status: 400,
      code: 'INVALID_DOCX',
      message: 'The uploaded file is not a DOCX package. Only .docx files are supported.',
    });
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(buffer, {
      checkCRC32: false,
      createFolders: false,
    });
  } catch (error) {
    throw new AppError({
      status: 400,
      code: 'CORRUPT_DOCX',
      message: 'The DOCX package is corrupted or password protected and could not be opened.',
      cause: error,
    });
  }

  const entries = Object.values(zip.files);
  if (entries.length === 0) {
    throw new AppError({ status: 400, code: 'INVALID_DOCX', message: 'The DOCX package is empty.' });
  }
  if (entries.length > MAX_ENTRIES) {
    throw new AppError({
      status: 400,
      code: 'DOCX_TOO_COMPLEX',
      message: 'This DOCX contains too many internal parts to process safely.',
    });
  }

  let totalUncompressed = 0;
  for (const entry of entries) {
    const name = entry.name;
    if (
      name.startsWith('/') ||
      name.startsWith('\\') ||
      name.includes('\0') ||
      name.split('/').some((segment) => segment === '..' || segment === '.')
    ) {
      throw new AppError({
        status: 400,
        code: 'UNSAFE_DOCX_PATH',
        message: 'The DOCX package contains an unsafe file path and was rejected.',
      });
    }
    if (entry.dir) continue;

    // JSZip exposes uncompressed size through _data; fall back to async decompression.
    let uncompressed = entry?._data?.uncompressedSize;
    let compressed = entry?._data?.compressedSize;
    if (typeof uncompressed !== 'number') {
      const data = await entry.async('nodebuffer');
      uncompressed = data.length;
      compressed = entry?._data?.compressedSize ?? data.length;
    }
    if (uncompressed > MAX_SINGLE_ENTRY) {
      throw new AppError({
        status: 400,
        code: 'DOCX_TOO_LARGE',
        message: 'A component inside this DOCX is too large to process safely.',
      });
    }
    totalUncompressed += uncompressed;
    if (compressed > 0 && uncompressed / compressed > MAX_COMPRESSION_RATIO) {
      throw new AppError({
        status: 400,
        code: 'DOCX_COMPRESSION_ANOMALY',
        message: 'The DOCX failed a compression safety check and was rejected.',
      });
    }
  }
  if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) {
    throw new AppError({
      status: 400,
      code: 'DOCX_TOO_LARGE',
      message: 'The uncompressed DOCX is too large to process safely.',
    });
  }

  const required = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'];
  for (const part of required) {
    if (!zip.file(part)) {
      throw new AppError({
        status: 400,
        code: 'INVALID_DOCX',
        message: `The file is missing the required DOCX part "${part}".`,
      });
    }
  }

  if (zip.file('word/vbaProject.bin')) {
    throw new AppError({
      status: 400,
      code: 'MACRO_DOCX_UNSUPPORTED',
      message: 'Macro-enabled Word documents are not accepted. Save and upload a .docx file without macros.',
    });
  }

  const contentTypes = await zip.file('[Content_Types].xml').async('string');
  if (/macroEnabled/i.test(contentTypes)) {
    throw new AppError({
      status: 400,
      code: 'MACRO_DOCX_UNSUPPORTED',
      message: 'Macro-enabled Word documents are not accepted. Save and upload a .docx file without macros.',
    });
  }
  if (!/wordprocessingml\.document\.main\+xml/i.test(contentTypes)) {
    throw new AppError({
      status: 400,
      code: 'INVALID_DOCX',
      message: 'The uploaded package is not a Word document (.docx).',
    });
  }

  return zip;
}

export async function readZipEntry(zip, path, { maxBytes = 20 * 1024 * 1024 } = {}) {
  const entry = zip.file(path);
  if (!entry) return null;
  const data = await entry.async('nodebuffer');
  if (data.length > maxBytes) {
    throw new AppError({
      status: 400,
      code: 'DOCX_PART_TOO_LARGE',
      message: `The DOCX part "${path}" is too large to process safely.`,
    });
  }
  return data;
}
