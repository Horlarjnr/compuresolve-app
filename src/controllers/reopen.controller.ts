import type { NextFunction, Request, Response } from 'express';
import { decideReopenRequest, listReopenRequests } from '../services/reopen.service';
import type { ListReopenQuery } from '../validators/reopen.validator';

export const listReopenRequestsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, meta } = await listReopenRequests(req.user!, res.locals.query as ListReopenQuery);
    res.status(200).json({ success: true, data: items, meta });
  } catch (error) {
    next(error);
  }
};

export const decideReopenRequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const complaint = await decideReopenRequest(req.user!, req.params.requestId as string, req.body);
    const approved = req.body.decision === 'APPROVE';
    res.status(200).json({
      success: true,
      message: approved ? 'Reopen request approved. The complaint is under review again.' : 'Reopen request rejected',
      data: complaint,
    });
  } catch (error) {
    next(error);
  }
};
