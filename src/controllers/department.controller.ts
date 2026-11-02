import type { NextFunction, Request, Response } from 'express';
import {
  createDepartment,
  listActiveDepartments,
  listAllDepartments,
  setDepartmentActive,
} from '../services/department.service';

export const getDepartments = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const departments = await listActiveDepartments();
    res.status(200).json({ success: true, data: departments });
  } catch (error) {
    next(error);
  }
};

export const getAllDepartments = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const departments = await listAllDepartments();
    res.status(200).json({ success: true, data: departments });
  } catch (error) {
    next(error);
  }
};

export const createDepartmentHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const department = await createDepartment(req.user!, req.body);
    res.status(201).json({ success: true, message: 'Department created', data: department });
  } catch (error) {
    next(error);
  }
};

export const deactivateDepartmentHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const department = await setDepartmentActive(req.user!, req.params.departmentId as string, false);
    res.status(200).json({ success: true, message: 'Department deactivated', data: department });
  } catch (error) {
    next(error);
  }
};

export const reactivateDepartmentHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const department = await setDepartmentActive(req.user!, req.params.departmentId as string, true);
    res.status(200).json({ success: true, message: 'Department reactivated', data: department });
  } catch (error) {
    next(error);
  }
};
