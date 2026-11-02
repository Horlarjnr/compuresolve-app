import type { NextFunction, Request, Response } from 'express';
import { listDepartmentStaff, reactivateMembership, suspendMembership } from '../services/membership.service';

export const listMembersHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = res.locals.query as { page: number; limit: number };
    const { items, meta } = await listDepartmentStaff(req.user!, req.params.departmentId as string, page, limit);
    res.status(200).json({ success: true, data: items, meta });
  } catch (error) {
    next(error);
  }
};

export const suspendMembershipHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { departmentId, membershipId } = req.params as { departmentId: string; membershipId: string };
    const membership = await suspendMembership(req.user!, departmentId, membershipId);
    res.status(200).json({ success: true, message: 'Membership suspended', data: membership });
  } catch (error) {
    next(error);
  }
};

export const reactivateMembershipHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { departmentId, membershipId } = req.params as { departmentId: string; membershipId: string };
    const membership = await reactivateMembership(req.user!, departmentId, membershipId);
    res.status(200).json({ success: true, message: 'Membership reactivated', data: membership });
  } catch (error) {
    next(error);
  }
};
