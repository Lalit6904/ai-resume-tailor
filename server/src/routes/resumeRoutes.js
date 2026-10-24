import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { uploadResume as uploadMiddleware } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import {
  deleteResume,
  getResume,
  listResumes,
  uploadResume,
} from '../controllers/resumeController.js';
import {
  getAnalysis,
  getSession,
  listSessions,
  retrySession,
  startAnalysis,
} from '../controllers/analysisController.js';
import {
  bulkReviewEdits,
  listEdits,
  patchEdit,
} from '../controllers/editController.js';
import {
  createExport,
  downloadExport,
  exportStatus,
  preview,
  previewPdf,
} from '../controllers/exportController.js';
import {
  analyzeSchema,
  bulkReviewSchema,
  exportQuerySchema,
  exportRequestSchema,
  listQuerySchema,
  previewQuerySchema,
  updateEditSchema,
} from '../validators/schemas.js';

export const apiRouter = Router();

apiRouter.use(requireAuth);

apiRouter.post('/resumes', uploadMiddleware, uploadResume);
apiRouter.get('/resumes', listResumes);
apiRouter.get('/resumes/:id', getResume);
apiRouter.delete('/resumes/:id', deleteResume);

apiRouter.post('/resumes/:id/analyze', validate(analyzeSchema), startAnalysis);
apiRouter.get('/resumes/:id/analysis', getAnalysis);
apiRouter.get('/resumes/:id/sessions', listSessions);

apiRouter.get('/resumes/:id/edits', validate(listQuerySchema, 'query'), listEdits);
apiRouter.patch(
  '/resumes/:id/edits/:editId',
  validate(updateEditSchema),
  patchEdit,
);
apiRouter.post(
  '/resumes/:id/edits/bulk-review',
  validate(bulkReviewSchema),
  bulkReviewEdits,
);

apiRouter.post('/resumes/:id/export', validate(exportRequestSchema), createExport);
apiRouter.get(
  '/resumes/:id/export-status',
  validate(exportQuerySchema, 'query'),
  exportStatus,
);
apiRouter.get(
  '/resumes/:id/download',
  validate(exportQuerySchema, 'query'),
  downloadExport,
);
apiRouter.get(
  '/resumes/:id/preview',
  validate(previewQuerySchema, 'query'),
  preview,
);
apiRouter.get(
  '/resumes/:id/preview/pdf',
  validate(previewQuerySchema, 'query'),
  previewPdf,
);

apiRouter.get('/sessions/:sessionId', getSession);
apiRouter.post('/sessions/:sessionId/retry', retrySession);
