import type { NextFunction, Request, Response } from 'express';
import { getDashboardSummary } from '../services/dashboard.service';

export const getDashboardSummaryHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await getDashboardSummary(req.user!);
    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};
