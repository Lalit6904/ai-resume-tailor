import multer from 'multer';
import path from 'node:path';
import { config } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  if (extension !== '.docx') {
    const error = new AppError({
      status: 400,
      code: 'UNSUPPORTED_FILE_TYPE',
      message:
        extension === '.doc'
          ? 'Legacy .doc files are not supported. Open the file in Word and save it as .docx, then upload again.'
          : 'Only .docx resume files are supported. PDF, .doc, and image files are not accepted.',
    });
    error.expose = true;
    return cb(error);
  }
  return cb(null, true);
}

export const uploadResume = multer({
  storage,
  limits: {
    fileSize: config.uploadLimitBytes,
    files: 1,
    fields: 5,
    parts: 6,
  },
  fileFilter,
}).single('resume');
