import type { NextFunction, Request, Response } from 'express';
import { createComplaint, getComplaint, listComplaints } from '../services/complaint.service';
import type { ListComplaintsQuery } from '../validators/complaint.validator';

export const createComplaintHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const complaint = await createComplaint(req.user!, req.body);
    res.status(201).json({ success: true, message: 'Complaint submitted', data: complaint });
  } catch (error) {
    next(error);
  }
};

export const listComplaintsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, meta } = await listComplaints(req.user!, res.locals.query as ListComplaintsQuery);
    res.status(200).json({ success: true, data: items, meta });
  } catch (error) {
    next(error);
  }
};

export const getComplaintHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const complaint = await getComplaint(req.user!, req.params.complaintId as string);
    res.status(200).json({ success: true, data: complaint });
  } catch (error) {
    next(error);
  }
};
