import { Router } from 'express';
import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { getStorage } from '../services/storage/storageService.js';
import { rendererStatus } from '../services/documents/renderer.js';
import { activeJobCount } from '../jobs/jobRunner.js';

export const healthRouter = Router();

healthRouter.get('/health', async (req, res) => {
  const storage = await getStorage().catch(() => null);
  const dbReady = mongoose.connection.readyState === 1;
  const status = dbReady ? 'ok' : 'degraded';
  res.status(dbReady ? 200 : 503).json({
    success: dbReady,
    data: {
      status,
      uptimeSeconds: Math.round(process.uptime()),
      database: dbReady ? 'connected' : 'unavailable',
      storage: storage?.driver || 'unavailable',
      renderer: rendererStatus(),
      aiProvider: config.ai.provider,
      aiModel: config.ai.provider === 'heuristic' ? 'local-deterministic-v1' : config.ai.model,
      activeJobs: activeJobCount(),
      timestamp: new Date().toISOString(),
    },
  });
});
