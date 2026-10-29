import type { NextFunction, Request, Response } from 'express';
import { listActiveDepartments } from '../services/department.service';

export const getDepartments = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const departments = await listActiveDepartments();
    res.status(200).json({ success: true, data: departments });
  } catch (error) {
    next(error);
  }
};
