import type { Request, Response } from 'express';
import { getHealthStatus } from '../services/health.service';

export const getHealth = (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: getHealthStatus() });
};
