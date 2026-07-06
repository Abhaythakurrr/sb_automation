/**
 * Schedule AI Assistant Routes
 * 
 * ML-powered schedule parsing and recommendations
 */

import { Router, Request, Response, NextFunction } from 'express';
import getScheduleRecommendation, { analyzeSchedulePatterns } from '../utils/scheduleMLParser';

const router = Router();

// ── Get schedule recommendation from natural language ─────────────────────────
router.post('/recommend', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { input } = req.body;
    
    if (!input || typeof input !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Input text is required',
      });
      return;
    }

    const recommendation = getScheduleRecommendation(input);

    if (!recommendation) {
      res.json({
        success: false,
        message: 'Could not understand schedule pattern',
        suggestion: 'Try using formats like: "every 30 minutes", "daily at 08:00", "weekdays"',
      });
      return;
    }

    res.json({
      success: true,
      data: recommendation,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

// ── Analyze multiple schedule patterns ────────────────────────────────────────
router.post('/analyze', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { schedules } = req.body;

    if (!Array.isArray(schedules)) {
      res.status(400).json({
        success: false,
        error: 'schedules array is required',
      });
      return;
    }

    const analysis = analyzeSchedulePatterns(schedules);

    res.json({
      success: true,
      data: analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

// ── Batch recommendation ───────────────────────────────────────────────────────
router.post('/recommend-batch', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { inputs } = req.body;

    if (!Array.isArray(inputs)) {
      res.status(400).json({
        success: false,
        error: 'inputs array is required',
      });
      return;
    }

    const results = inputs.map((input, index) => {
      const recommendation = getScheduleRecommendation(input);
      return {
        index,
        input,
        recommendation,
        success: !!recommendation,
      };
    });

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: inputs.length,
          successful: successCount,
          failed: inputs.length - successCount,
          successRate: (successCount / inputs.length * 100).toFixed(1) + '%',
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

// ── Health check ───────────────────────────────────────────────────────────────
router.get('/health', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    service: 'Schedule AI Assistant',
    status: 'operational',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

export { router as scheduleAIRouter };
