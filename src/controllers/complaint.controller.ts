import type { NextFunction, Request, Response } from 'express';
import { assignComplaint, transitionComplaint, unassignComplaint } from '../services/complaint-workflow.service';
import { createComplaint, getComplaint, listComplaints } from '../services/complaint.service';
import { createReopenRequest } from '../services/reopen.service';
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

export const assignComplaintHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const complaint = await assignComplaint(req.user!, req.params.complaintId as string, req.body.officerId);
    res.status(200).json({ success: true, message: 'Complaint assigned', data: complaint });
  } catch (error) {
    next(error);
  }
};

export const unassignComplaintHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const complaint = await unassignComplaint(req.user!, req.params.complaintId as string);
    res.status(200).json({ success: true, message: 'Assignment removed', data: complaint });
  } catch (error) {
    next(error);
  }
};

export const transitionComplaintHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const complaint = await transitionComplaint(req.user!, req.params.complaintId as string, req.body);
    res.status(200).json({ success: true, message: 'Status updated', data: complaint });
  } catch (error) {
    next(error);
  }
};

export const createReopenRequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const complaint = await createReopenRequest(req.user!, req.params.complaintId as string, req.body.reason);
    res.status(201).json({
      success: true,
      message: 'Reopen request sent. Staff will review it.',
      data: complaint,
    });
  } catch (error) {
    next(error);
  }
};
